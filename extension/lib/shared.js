/*
 * Shared helpers: defaults, command matching and payload building.
 * Loaded by the service worker, the options page and the popup.
 * Also loadable in Node for tests (module.exports at the bottom).
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    enabled: true,
    relayUrl: 'http://127.0.0.1:8787',
    overlayId: '',
    voiceStudioUrl: 'http://127.0.0.1:3900',
    model: 'tts-1-hd',
    format: 'wav',
    speed: 1,
    mappings: [], // [{ command, voice, speed, model }]  speed/model blank = use the defaults above
    removeCommand: true,
    maxChars: 190,
    cooldownSec: 0,
    updateCheck: true // once a day, ask GitHub whether a newer version exists (only tells you, installs nothing)
  };

  var SPEED_MIN = 0.5;
  var SPEED_MAX = 1.5;
  // A command is at most 9 characters including the "!", which the extension adds itself,
  // so the part you type is at most 8.
  var MAX_COMMAND_CHARS = 8;
  var CMD_RE = /^!([A-Za-z0-9_\-À-￿]+)(?:[\s ]+([\s\S]*))?$/;

  function trimUrl(u) {
    return String(u || '').trim().replace(/\/+$/, '');
  }

  function normalizeCommand(c) {
    return String(c || '').trim().replace(/^!+/, '').toLowerCase();
  }

  // Returns a number in 0.1 steps within the allowed range, or null if blank/invalid.
  function parseSpeed(value) {
    if (value === '' || value === null || value === undefined) return null;
    var n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!isFinite(n)) return null;
    return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, n)) * 10) / 10;
  }

  // The values offered in the speed dropdowns: "0.5" ... "1.5".
  function speedChoices() {
    var out = [];
    for (var i = Math.round(SPEED_MIN * 10); i <= Math.round(SPEED_MAX * 10); i++) out.push((i / 10).toFixed(1));
    return out;
  }

  // Returns an explanation if the command cannot be saved, or '' if it is fine.
  // `command` is what the user typed after the "!".
  function commandProblem(command) {
    var c = normalizeCommand(command);
    if (!c) return 'A command is empty.';
    var len = Array.from(c).length;
    if (len > MAX_COMMAND_CHARS) {
      return 'Command "!' + c + '" is too long. Maximum is ' + MAX_COMMAND_CHARS + ' characters.';
    }
    if (!/^[A-Za-z0-9_\-À-￿]+$/.test(c)) return 'Command "!' + c + '" may only contain letters, numbers, - and _.';
    return '';
  }

  function cleanText(text) {
    return String(text || '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  }

  function truncate(text, max) {
    var chars = Array.from(text);
    return chars.length > max ? chars.slice(0, max).join('').trim() : text;
  }

  /*
   * Decide whether a chat message is one of our commands.
   * Returns { match: true, mapping, command, spoken } or { match: false, reason }.
   */
  function parse(text, mappings, opts) {
    opts = opts || {};
    var cleaned = cleanText(text);
    var m = CMD_RE.exec(cleaned);
    if (!m) return { match: false, reason: 'not-a-command' };
    var command = m[1].toLowerCase();
    var mapping = null;
    for (var i = 0; i < (mappings || []).length; i++) {
      if (normalizeCommand(mappings[i].command) === command && mappings[i].voice) {
        mapping = mappings[i];
        break;
      }
    }
    if (!mapping) return { match: false, reason: 'unknown-command' };
    var spoken = opts.removeCommand === false ? cleaned : cleanText(m[2] || '');
    if (!spoken) return { match: false, reason: 'empty' };
    var max = opts.maxChars > 0 ? opts.maxChars : DEFAULTS.maxChars;
    return { match: true, mapping: mapping, command: command, spoken: truncate(spoken, max) };
  }

  function randomId() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var c = root.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null);
    var bytes = new Uint8Array(20);
    c.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function speechEndpoint(cfg) {
    return trimUrl(cfg.voiceStudioUrl) + '/v1/audio/speech';
  }

  // The request body VoiceStudio gets for a mapping (also used for the Test button).
  function speechBody(cfg, mapping, text) {
    var body = {
      model: String(mapping.model || '').trim() || cfg.model || DEFAULTS.model,
      input: text,
      voice: mapping.voice,
      response_format: cfg.format || DEFAULTS.format
    };
    var speed = parseSpeed(mapping.speed);
    if (speed === null) speed = parseSpeed(cfg.speed);
    if (speed !== null) body.speed = speed;
    return body;
  }

  // What the extension sends to the relay.
  function buildPayload(cfg, result, meta) {
    meta = meta || {};
    var body = speechBody(cfg, result.mapping, result.spoken);
    var payload = {
      endpoint: speechEndpoint(cfg),
      model: body.model,
      voice: body.voice,
      format: body.response_format,
      text: body.input,
      user: meta.user || '',
      platform: meta.platform || '',
      command: result.command
    };
    if (typeof body.speed === 'number') payload.speed = body.speed;
    return payload;
  }

  function overlayUrl(cfg) {
    return trimUrl(cfg.relayUrl) + '/overlay.html?id=' + encodeURIComponent(cfg.overlayId);
  }

  var LOCAL_HOSTS = ['localhost', '127.0.0.1'];

  // Chrome host-permission pattern for a URL, or null if it is already covered by the manifest.
  function permissionPattern(url) {
    try {
      var u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (LOCAL_HOSTS.indexOf(u.hostname) !== -1) return null;
      return u.protocol + '//' + u.hostname + '/*';
    } catch (e) {
      return null;
    }
  }

  function isValidHttpUrl(url) {
    try {
      var u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  // ---- update check (GitHub releases) -------------------------------------------------------
  var REPO = 'eikira/VoiceStudio-OBS-Connector';
  var UPDATE_API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  var RELEASES_PAGE = 'https://github.com/' + REPO + '/releases/latest';
  var RELAY_RELEASES_PAGE = 'https://github.com/eikira/VoiceStudio-OBS-Connector-Relay/releases/latest';

  // "v0.0.9" / "0.1" -> [0,0,9]; anything else (for example "1.0-beta") is refused.
  function parseVersion(s) {
    s = String(s || '').trim().replace(/^[vV]/, '');
    if (!s) return null;
    var out = [];
    var parts = s.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d{1,7}$/.test(parts[i])) return null;
      out.push(parseInt(parts[i], 10));
    }
    return out;
  }

  // True if `latest` is a higher version than `current`.
  function newerThan(latest, current) {
    var a = parseVersion(latest);
    var b = parseVersion(current);
    if (!a || !b) return false;
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var x = a[i] || 0;
      var y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  var api = {
    UPDATE_API: UPDATE_API,
    RELEASES_PAGE: RELEASES_PAGE,
    RELAY_RELEASES_PAGE: RELAY_RELEASES_PAGE,
    parseVersion: parseVersion,
    newerThan: newerThan,
    DEFAULTS: DEFAULTS,
    SPEED_MIN: SPEED_MIN,
    SPEED_MAX: SPEED_MAX,
    MAX_COMMAND_CHARS: MAX_COMMAND_CHARS,
    trimUrl: trimUrl,
    normalizeCommand: normalizeCommand,
    parseSpeed: parseSpeed,
    speedChoices: speedChoices,
    commandProblem: commandProblem,
    cleanText: cleanText,
    parse: parse,
    randomId: randomId,
    speechEndpoint: speechEndpoint,
    speechBody: speechBody,
    buildPayload: buildPayload,
    overlayUrl: overlayUrl,
    permissionPattern: permissionPattern,
    isValidHttpUrl: isValidHttpUrl
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VSShared = api;
})(typeof self !== 'undefined' ? self : this);
