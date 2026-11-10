/*
 * Shared chat-capture logic. A platform script calls VSCapture.start(...) with
 * selectors; this file watches the chat list, picks out messages that begin with
 * "!" (or every line, while "Read all chat" is on) and forwards them to the service worker, which
 * decides what to do with them.
 * It also reports a small status (listening or not, messages seen) that the popup shows.
 */
(function () {
  'use strict';
  var GRACE_MS = 3000;      // on first attach, ignore the chat history that loads right after
  var SETTLE_MS = 150;      // let the page finish rendering the message
  var DUPLICATE_MS = 3000;  // some chat add-ons render a message twice
  var HEARTBEAT_MS = 20000; // how often the status is reported (kept rare: each report wakes the extension)
  var POLL_MS = 1000;       // how often we check that we are attached to the live chat list

  window.VSCapture = {
    /*
     * opts: {
     *   platform, containerSelector, messageSelector,
     *   extract(el) -> { id, user, text } | null
     * }
     */
    start: function (opts) {
      var bound = null;
      var observer = null;
      var boundAt = 0;
      var firstBind = true;
      var elSig = new WeakMap();   // last message signature handled per row (rows may be reused by the page)
      var pending = new WeakSet();
      var seenIds = [];
      var recent = {};
      var dead = false;
      // The newest copy of this script on the page owns the chat. Older copies (from before an
      // extension reload, or injected twice) notice the changed marker and stop.
      var token = Math.random().toString(36).slice(2);
      var root = document.documentElement;
      root.setAttribute('data-vs-capture', token);
      var timers = [];

      function stop() {
        dead = true;
        if (observer) observer.disconnect();
        timers.forEach(clearInterval);
      }
      // "Read all chat" switch, mirrored from the settings. When off, only "!" lines leave the page.
      var forwardAll = false;
      try {
        chrome.storage.local.get('config', function (r) {
          var c = r && r.config; forwardAll = !!(c && c.readAll && c.enabled !== false);
        });
        chrome.storage.onChanged.addListener(function (ch, area) {
          if (area === 'local' && ch.config) { var c = ch.config.newValue; forwardAll = !!(c && c.readAll && c.enabled !== false); }
        });
      } catch (e) { /* extension reloaded */ }
      var seenCount = 0;   // live chat messages noticed (any message, not only commands)
      var lastCommand = '';

      function safeSend(msg) {
        if (dead) return;
        try {
          chrome.runtime.sendMessage(msg, function () { void chrome.runtime.lastError; });
        } catch (e) {
          stop(); // extension was reloaded; this old script stops quietly
        }
      }

      function report() {
        safeSend({ type: 'chatstatus', platform: opts.platform, listening: !!(bound && bound.isConnected), seen: seenCount, last: lastCommand });
      }

      function sigOf(info) { return info ? (info.id || '') + '|' + (info.user || '') + '|' + (info.text || '') : ''; }

      function process(el) {
        if (dead || pending.has(el)) return;
        pending.add(el);
        setTimeout(function () {
          pending.delete(el);
          var info;
          try { info = opts.extract(el); } catch (e) { info = null; }
          if (!info || !info.text) return;
          var sig = sigOf(info);
          if (elSig.get(el) === sig) return;
          elSig.set(el, sig);
          seenCount++;
          var text = String(info.text).replace(/[​-‍﻿]/g, '').trim();
          var isBang = text.charAt(0) === '!';
          if (!isBang && !forwardAll) return;
          var firstOfKind = false;
          if (isBang) {
            firstOfKind = lastCommand !== text.slice(0, 40);
            lastCommand = text.slice(0, 40);
          }
          if (info.id) {
            if (seenIds.indexOf(info.id) !== -1) return;
            seenIds.push(info.id);
            if (seenIds.length > 500) seenIds.shift();
          }
          var key = (info.user || '') + '|' + text;
          var now = Date.now();
          if (recent[key] && now - recent[key] < DUPLICATE_MS) return;
          recent[key] = now;
          Object.keys(recent).forEach(function (k) { if (now - recent[k] > 10000) delete recent[k]; });
          info.text = text;
          safeSend({ type: 'chat', platform: opts.platform, user: info.user || '', text: info.text, id: info.id || '' });
          if (firstOfKind) report();
        }, opts.settleMs || SETTLE_MS);
      }

      function markExisting(root) {
        var existing = root.querySelectorAll(opts.messageSelector);
        for (var i = 0; i < existing.length; i++) {
          try { elSig.set(existing[i], sigOf(opts.extract(existing[i]))); } catch (e) { /* ignore */ }
        }
      }

      function onMutations(mutations) {
        if (Date.now() - boundAt < GRACE_MS) return;
        for (var i = 0; i < mutations.length; i++) {
          if (opts.watchInside) {
            // Some chats (Kick) reuse a row for a new message instead of adding a new one.
            var t = mutations[i].target;
            var el = t && (t.nodeType === 1 ? t : t.parentElement);
            var row = el && el.closest ? el.closest(opts.messageSelector) : null;
            if (row) process(row);
          }
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches(opts.messageSelector)) process(node);
            if (node.querySelectorAll) {
              var inner = node.querySelectorAll(opts.messageSelector);
              for (var k = 0; k < inner.length; k++) process(inner[k]);
            }
          }
        }
      }

      function attach(container) {
        if (observer) observer.disconnect();
        observer = null;
        bound = container;
        if (bound) {
          boundAt = Date.now();
          if (!firstBind) {
            // The page replaced its chat list while we were running. What is already in the new
            // list is old; everything that arrives from now on is live, so no waiting period.
            boundAt = 0;
            markExisting(bound);
          }
          firstBind = false;
          observer = new MutationObserver(onMutations);
          observer.observe(bound, { childList: true, subtree: true, characterData: !!opts.watchInside });
        }
        report();
      }

      // Chat pages are single-page apps: keep checking that we are attached to the live list.
      timers.push(setInterval(function () {
        if (dead) return;
        if (root.getAttribute('data-vs-capture') !== token) { stop(); return; }
        if (bound && bound.isConnected) return; // still attached: nothing to look up
        var container = document.querySelector(opts.containerSelector);
        if (container === bound) return;
        attach(container);
      }, POLL_MS));

      timers.push(setInterval(function () { if (!dead) report(); }, HEARTBEAT_MS));
      report();
    }
  };
})();
