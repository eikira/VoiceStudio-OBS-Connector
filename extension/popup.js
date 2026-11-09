(function () {
  'use strict';
  var S = window.VSShared;
  var $ = function (id) { return document.getElementById(id); };
  var cfg = null;

  function paint(el, text, cls) {
    el.textContent = text;
    el.className = cls || '';
  }

  function refresh() {
    chrome.storage.local.get('config').then(function (res) {
      cfg = Object.assign({}, S.DEFAULTS, res.config || {});
      $('enabled').checked = cfg.enabled;
      var n = (cfg.mappings || []).filter(function (m) { return m.command && m.voice; }).length;
      paint($('cmds'), n ? n + ' set up' : 'none yet', n ? '' : 'bad');
      if (!cfg.overlayId) { paint($('relay'), 'open Settings first', 'bad'); return; }

      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 2000);
      fetch(S.trimUrl(cfg.relayUrl) + '/status?id=' + encodeURIComponent(cfg.overlayId), { signal: ctrl.signal })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          paint($('relay'), 'running', 'good');
          paint($('obs'), d.listeners > 0 ? 'connected' : 'not connected', d.listeners > 0 ? 'good' : 'muted');
        })
        .catch(function () {
          paint($('relay'), 'not reachable', 'bad');
          paint($('obs'), '-', 'muted');
        })
        .then(function () { clearTimeout(timer); });
    });
    chrome.storage.session.get('stats').then(function (res) {
      var st = res.stats || {};
      $('sent').textContent = String(st.sent || 0);
      $('err').textContent = st.lastError || '';
    });
  }

  // Which chat pages the extension is listening to right now.
  function refreshChat() {
    chrome.storage.session.get('chatTabs').then(function (res) {
      var map = res.chatTabs || {};
      var now = Date.now();
      var names = { twitch: 'Twitch', youtube: 'YouTube', rumble: 'Rumble', kick: 'Kick' };
      var tabs = Object.keys(map).map(function (k) { return map[k]; })
        .filter(function (t) { return now - t.at < 45000; });
      if (!tabs.length) {
        paint($('chat'), 'not detected', 'bad');
        $('chatHint').textContent = 'Open your chat page. If it was already open before the extension was installed or reloaded, refresh it (F5).';
        return;
      }
      var allListening = tabs.every(function (t) { return t.listening; });
      paint($('chat'), tabs.map(function (t) {
        return (names[t.platform] || t.platform) + (t.listening ? ' listening' : ' chat list not found') + ' · ' + t.seen + ' seen';
      }).join('; '), allListening ? 'good' : 'bad');
      var last = tabs.map(function (t) { return t.last; }).filter(Boolean).pop();
      $('chatHint').textContent = allListening
        ? (last ? 'Last command seen: ' + last : 'Waiting for a message that starts with a command.')
        : 'The chat page was found, but not its message list.';
    });
  }

  $('enabled').addEventListener('change', function () {
    chrome.storage.local.get('config').then(function (res) {
      var c = Object.assign({}, S.DEFAULTS, res.config || {});
      c.enabled = $('enabled').checked;
      return chrome.storage.local.set({ config: c });
    });
  });
  $('settings').addEventListener('click', function () { chrome.runtime.openOptionsPage(); window.close(); });
  $('copy').addEventListener('click', function () {
    if (!cfg || !cfg.overlayId) { paint($('msg'), 'Open Settings first.', 'status bad'); return; }
    navigator.clipboard.writeText(S.overlayUrl(cfg)).then(function () { paint($('msg'), 'OBS URL copied.', 'status good'); });
  });
  $('test').addEventListener('click', function () {
    paint($('msg'), 'Sending...', 'status muted');
    chrome.runtime.sendMessage({ type: 'test' }, function (res) {
      if (chrome.runtime.lastError || !res) { paint($('msg'), 'Could not reach the extension.', 'status bad'); return; }
      if (!res.ok) { paint($('msg'), res.error || 'Failed', 'status bad'); return; }
      paint($('msg'), res.listeners > 0 ? 'Sent. You should hear it in OBS.' : 'Sent, but no OBS page is connected.', res.listeners > 0 ? 'status good' : 'status bad');
      refresh();
    });
  });

  $('version').textContent = chrome.runtime.getManifest().version;
  refresh();
  refreshChat();
  setInterval(function () { refresh(); refreshChat(); }, 3000);
})();
