/*
 * Shared helpers: defaults, command matching and payload building.
 * Loaded by the service worker, the options page and the popup.
 * Also loadable in Node for tests (module.exports at the bottom).
 */
(function (root) {
  'use strict';

  var ENGINES = ['voicestudio', 'simplevoice'];
  var ENGINE_NAMES = { voicestudio: 'VoiceStudio', simplevoice: 'SimpleVoice OBS' };
  // SimpleVoice OBS has one model and always answers with WAV; it runs on the relay's own address.
  var SIMPLEVOICE_MODEL = 'omnivoice';
  var SIMPLEVOICE_MIN_CLONE_SPEED = 0.8;

  var DEFAULTS = {
    enabled: true,
    engine: 'voicestudio', // 'voicestudio' | 'simplevoice': which program makes the speech
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
    updateCheck: true, // once a day, ask GitHub whether a newer version exists (only tells you, installs nothing)
    // ---- read all chat (not only commands) ----
    readAll: false,
    allVoiceMode: 'fixed',   // 'fixed' | 'random' (new voice every line) | 'perChatter' (each chatter keeps one voice)
    allVoice: '',
    allVoiceName: '',
    allVoices: [],           // the voices the random modes choose from: [{ id, name }]
    allSayName: false,       // say "Paul says" before the line
    allNameVoice: '',        // voice for the name part; blank = same voice as the line
    allNameVoiceName: '',
    allSkipRepeatName: true, // do not repeat the name when the same chatter writes again right after
    allIgnoreLinks: true,
    allIgnoreBang: true,     // ignore lines that start with "!" (other bots' commands)
    allCooldownSec: 10,      // one line per chatter in this time
    maxQueue: 5,             // how many chat lines may wait in OBS; the oldest waiting one is dropped
    ignoredNames: 'Nightbot\nStreamElements\nStreamlabs\nMoobot\nFossabot\nWizebot',
    blockedWords: ''
  };

  // VoiceStudio's voice list also holds 13 fixed names (alloy, ash, nova ...) that are not voices: each one only
  // points to the active engine's default voice. Only the voices that exist in VoiceStudio (type "profile") are
  // offered. Entries without a type (an older VoiceStudio, SimpleVoice OBS, plain strings) are kept as they are.
  function realVoices(list) {
    return (Array.isArray(list) ? list : []).filter(function (v) {
      return !(v && typeof v === 'object' && typeof v.type === 'string' && v.type !== 'profile');
    });
  }

  // What each program keeps for itself (sections 2, 3 and 4 of the settings): the speech defaults,
  // the commands and the read-all-chat setup. Everything else (addresses, OBS ID, behaviour) is shared.
  var PROFILE_KEYS = ['model', 'format', 'speed', 'mappings',
    'readAll', 'allVoiceMode', 'allVoice', 'allVoiceName', 'allVoices', 'allSayName', 'allNameVoice', 'allNameVoiceName',
    'allSkipRepeatName', 'allIgnoreLinks', 'allIgnoreBang', 'allCooldownSec', 'maxQueue', 'ignoredNames', 'blockedWords'];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // The settings of one program, taken from a flat config (the flat config mirrors the program in use).
  function profileOf(cfg) {
    var p = {};
    PROFILE_KEYS.forEach(function (k) { p[k] = clone(cfg[k] !== undefined ? cfg[k] : DEFAULTS[k]); });
    return p;
  }

  function defaultProfile() { return profileOf(DEFAULTS); }

  // Makes sure cfg.profiles holds both programs. The one in use comes from the flat fields (which is also what the
  // background script reads); the other one is kept as it was, or starts empty. A config saved before this existed
  // (no profiles) becomes the setup of the program that was selected, the other starts empty.
  function completeProfiles(cfg) {
    var out = Object.assign({}, cfg);
    var cur = ENGINES.indexOf(out.engine) !== -1 ? out.engine : DEFAULTS.engine;
    var old = out.profiles && typeof out.profiles === 'object' ? out.profiles : {};
    out.profiles = {};
    ENGINES.forEach(function (e) {
      out.profiles[e] = e === cur ? profileOf(out) : (old[e] && typeof old[e] === 'object' ? Object.assign(defaultProfile(), clone(old[e])) : defaultProfile());
    });
    return out;
  }

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

  function isSimpleVoice(cfg) {
    return !!cfg && cfg.engine === 'simplevoice';
  }

  function engineName(cfg) {
    return ENGINE_NAMES[isSimpleVoice(cfg) ? 'simplevoice' : 'voicestudio'];
  }

  // The address that answers /v1/audio/voices, /v1/models and /v1/audio/speech.
  // SimpleVoice OBS is its own relay, so it is the relay address.
  function speechBase(cfg) {
    return trimUrl(isSimpleVoice(cfg) ? cfg.relayUrl : cfg.voiceStudioUrl);
  }

  function speechEndpoint(cfg) {
    return speechBase(cfg) + '/v1/audio/speech';
  }

  // The request body VoiceStudio gets for a mapping (also used for the Test button).
  function speechBody(cfg, mapping, text) {
    var body = isSimpleVoice(cfg) ? {
      model: SIMPLEVOICE_MODEL, // the one model it has; a model saved for VoiceStudio is ignored
      input: text,
      voice: mapping.voice,
      response_format: 'wav'
    } : {
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
  var REPO = 'eikira/VoiceStudio-SimpleVoice-OBS-Connector';
  var UPDATE_API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  var RELEASES_PAGE = 'https://github.com/' + REPO + '/releases/latest';
  var RELAY_RELEASES_PAGE = 'https://github.com/eikira/VoiceStudio-OBS-Connector-Relay/releases/latest';
  var SIMPLEVOICE_RELEASES_PAGE = 'https://github.com/eikira/SimpleVoice-OBS/releases/latest';

  // Where to get the relay for the chosen engine (SimpleVoice OBS is its own relay).
  function relayPage(engine) {
    return engine === 'simplevoice' ? SIMPLEVOICE_RELEASES_PAGE : RELAY_RELEASES_PAGE;
  }

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

  // ---- settings backup: export / import --------------------------------------------------
  var EXPORT_APP = 'VoiceStudio+SimpleVoice OBS Connector';
  var EXPORT_APP_OLD = 'VoiceStudio OBS Connector'; // files made before 0.2.0 still import
  var EXPORT_FORMAT = 2; // 2: both programs' setups (profiles)
  var MAX_IMPORT_BYTES = 512 * 1024;
  var MAX_MAPPINGS = 200;
  var FORMATS = ['wav', 'mp3', 'flac', 'opus', 'aac'];

  function shortText(v, max) {
    return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : '';
  }

  function clampInt(v, min, max, fallback) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    return isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
  }

  // The part of a config that each program keeps for itself (see PROFILE_KEYS), cleaned.
  function sanitizeProfile(raw, warnings, label) {
    var out = {};
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    out.model = shortText(raw.model, 100) || DEFAULTS.model;
    out.format = FORMATS.indexOf(raw.format) !== -1 ? raw.format : DEFAULTS.format;
    var sp = parseSpeed(raw.speed);
    out.speed = sp === null ? DEFAULTS.speed : sp;
    ['readAll', 'allSayName', 'allSkipRepeatName', 'allIgnoreLinks', 'allIgnoreBang'].forEach(function (k) {
      out[k] = typeof raw[k] === 'boolean' ? raw[k] : DEFAULTS[k];
    });
    out.allVoiceMode = ALL_MODES.indexOf(raw.allVoiceMode) !== -1 ? raw.allVoiceMode : DEFAULTS.allVoiceMode;
    ['allVoice', 'allVoiceName', 'allNameVoice', 'allNameVoiceName'].forEach(function (k) { out[k] = shortText(raw[k], 200); });
    out.allVoices = [];
    (Array.isArray(raw.allVoices) ? raw.allVoices : []).slice(0, 100).forEach(function (v) {
      var id = v && shortText(v.id, 200);
      if (id && !out.allVoices.some(function (x) { return x.id === id; })) out.allVoices.push({ id: id, name: shortText(v.name, 200) });
    });
    out.allCooldownSec = clampInt(raw.allCooldownSec, 0, 3600, DEFAULTS.allCooldownSec);
    out.maxQueue = clampInt(raw.maxQueue, 1, 100, DEFAULTS.maxQueue);
    out.ignoredNames = typeof raw.ignoredNames === 'string' ? raw.ignoredNames.slice(0, 5000) : DEFAULTS.ignoredNames;
    out.blockedWords = typeof raw.blockedWords === 'string' ? raw.blockedWords.slice(0, 5000) : DEFAULTS.blockedWords;

    out.mappings = [];
    var list = Array.isArray(raw.mappings) ? raw.mappings : [];
    if (list.length > MAX_MAPPINGS) warnings.push((label ? label + ': ' : '') + 'Only the first ' + MAX_MAPPINGS + ' commands were taken.');
    var seen = {};
    list.slice(0, MAX_MAPPINGS).forEach(function (m) {
      if (!m || typeof m !== 'object') return;
      var c = normalizeCommand(typeof m.command === 'string' ? m.command : '');
      var problem = commandProblem(c);
      if (problem) { warnings.push((label ? label + ': ' : '') + 'Skipped a command: ' + problem); return; }
      if (seen[c]) { warnings.push((label ? label + ': ' : '') + 'Skipped "!' + c + '": it was listed twice.'); return; }
      var voice = shortText(m.voice, 200);
      if (!voice) { warnings.push((label ? label + ': ' : '') + 'Skipped "!' + c + '": it has no voice.'); return; }
      seen[c] = true;
      var s = parseSpeed(m.speed);
      out.mappings.push({
        command: c,
        voice: voice,
        voiceName: shortText(m.voiceName, 200),
        speed: s === null ? '' : s.toFixed(1),
        model: shortText(m.model, 100)
      });
    });
    return out;
  }

  // Turns anything (an old saved config, or the content of an imported file) into a clean config.
  // Unknown keys are dropped, wrong values fall back to the defaults. `keepId` is used when the
  // input has no valid OBS ID. Returns { config, warnings }.
  function sanitizeConfig(raw, keepId) {
    var warnings = [];
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var out = {};
    out.enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled;
    out.engine = ENGINES.indexOf(raw.engine) !== -1 ? raw.engine : DEFAULTS.engine;
    ['relayUrl', 'voiceStudioUrl'].forEach(function (k) {
      var u = typeof raw[k] === 'string' ? trimUrl(raw[k]) : '';
      if (u && u.length <= 300 && isValidHttpUrl(u)) out[k] = u;
      else {
        out[k] = DEFAULTS[k];
        if (raw[k] !== undefined) warnings.push((k === 'relayUrl' ? 'Relay address' : 'VoiceStudio address') + ' in the file was not valid; the default was used.');
      }
    });
    if (typeof raw.overlayId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(raw.overlayId)) out.overlayId = raw.overlayId;
    else {
      out.overlayId = keepId || '';
      if (raw.overlayId !== undefined) warnings.push('The OBS ID in the file was not valid; the current one was kept.');
    }
    out.removeCommand = typeof raw.removeCommand === 'boolean' ? raw.removeCommand : DEFAULTS.removeCommand;
    out.maxChars = clampInt(raw.maxChars, 10, 2000, DEFAULTS.maxChars);
    out.cooldownSec = clampInt(raw.cooldownSec, 0, 3600, DEFAULTS.cooldownSec);
    out.updateCheck = typeof raw.updateCheck === 'boolean' ? raw.updateCheck : DEFAULTS.updateCheck;
    // The program in use comes from the flat fields (what files and settings made before two setups existed have).
    Object.assign(out, sanitizeProfile(raw, warnings, ''));
    // The other program: its own saved setup, or empty.
    var other = out.engine === 'simplevoice' ? 'voicestudio' : 'simplevoice';
    var rp = raw.profiles && typeof raw.profiles === 'object' ? raw.profiles[other] : null;
    out.profiles = {};
    out.profiles[out.engine] = profileOf(out);
    out.profiles[other] = rp ? sanitizeProfile(rp, warnings, ENGINE_NAMES[other]) : defaultProfile();
    return { config: out, warnings: warnings };
  }

  // The file content for "Export settings".
  function buildExport(cfg, extensionVersion) {
    var clean = sanitizeConfig(cfg, cfg && cfg.overlayId).config;
    return {
      app: EXPORT_APP,
      kind: 'settings',
      format: EXPORT_FORMAT,
      extensionVersion: String(extensionVersion || ''),
      exportedAt: new Date().toISOString(),
      settings: clean
    };
  }

  // Reads the text of a chosen file. Returns { ok:true, config, warnings } or { ok:false, error }.
  function parseImport(text, keepId) {
    if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'The file is too big to be a settings file.' };
    var doc;
    try { doc = JSON.parse(text); } catch (e) { return { ok: false, error: 'This is not a settings file (it could not be read).' }; }
    if (!doc || typeof doc !== 'object' || (doc.app !== EXPORT_APP && doc.app !== EXPORT_APP_OLD) || doc.kind !== 'settings' || !doc.settings || typeof doc.settings !== 'object') {
      return { ok: false, error: 'This file was not made by VoiceStudio+SimpleVoice OBS Connector "Export settings".' };
    }
    if (typeof doc.format !== 'number' || doc.format > EXPORT_FORMAT) {
      return { ok: false, error: 'This file was made by a newer version of the extension. Update the extension first.' };
    }
    var r = sanitizeConfig(doc.settings, keepId);
    return { ok: true, config: r.config, warnings: r.warnings };
  }

  // ---- read all chat ------------------------------------------------------------------------
  var ALL_MODES = ['fixed', 'random', 'perChatter'];
  var RELAY_MIN_VERSION = '0.0.7';
  var RELAY_MIN_PROTOCOL = 2;
  var URL_RE = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|gg|tv|co|me|ly|xyz|de|ch|uk|us|ru|fm|app|dev|gl|link|cc)\b(?:\/\S*)?/i;
  var EMOJI_RE = /[\p{Extended_Pictographic}\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}]/gu;

  // A list typed into a text box: one entry per line (commas and semicolons work too).
  function splitList(text) {
    return String(text || '').split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function isIgnoredName(cfg, user) {
    var u = String(user || '').trim().replace(/^@/, '').toLowerCase();
    if (!u) return false;
    return splitList(cfg.ignoredNames).some(function (n) { return n.replace(/^@/, '').toLowerCase() === u; });
  }

  function hasBlockedWord(cfg, text) {
    var words = splitList(cfg.blockedWords).slice(0, 300);
    for (var i = 0; i < words.length; i++) {
      var esc = words[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(?<![\\p{L}\\p{N}])' + esc + '(?![\\p{L}\\p{N}])', 'iu').test(text)) return true;
    }
    return false;
  }

  // Decides whether a chat line may be read aloud and cleans it. Returns { ok, text } or { ok:false, reason }.
  function allLine(cfg, text) {
    var t = cleanText(text);
    if (!t) return { ok: false, reason: 'empty' };
    if (cfg.allIgnoreBang && t.charAt(0) === '!') return { ok: false, reason: 'bang' };
    if (cfg.allIgnoreLinks && URL_RE.test(t)) return { ok: false, reason: 'link' };
    if (hasBlockedWord(cfg, t)) return { ok: false, reason: 'blocked-word' };
    t = cleanText(t.replace(EMOJI_RE, ' '));
    if (!/[\p{L}\p{N}]/u.test(t)) return { ok: false, reason: 'nothing-to-read' };
    var max = cfg.maxChars > 0 ? cfg.maxChars : DEFAULTS.maxChars;
    return { ok: true, text: truncate(t, max) };
  }

  function chatterKey(platform, user) {
    return String(platform || '') + ':' + String(user || '').toLowerCase();
  }

  function poolIds(cfg) {
    return (cfg.allVoices || []).map(function (v) { return v && v.id; }).filter(Boolean);
  }

  // Which voice reads this line. `assigned` is the map chatter -> voice of this browser session.
  // Returns { voice, assign } where assign is a voice to remember for the chatter (or undefined).
  function pickAllVoice(cfg, key, assigned, rnd) {
    rnd = rnd || Math.random;
    var pool = poolIds(cfg);
    if (cfg.allVoiceMode === 'fixed' || !pool.length) return { voice: cfg.allVoice || '' };
    function randomFrom(list) { return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))]; }
    if (cfg.allVoiceMode === 'random') return { voice: randomFrom(pool) };
    var current = assigned && assigned[key];
    if (current && pool.indexOf(current) !== -1) return { voice: current };
    // new chatter: take one of the voices that are used by the fewest chatters, so chatters sound different
    var counts = {};
    pool.forEach(function (v) { counts[v] = 0; });
    Object.keys(assigned || {}).forEach(function (k) { if (counts[assigned[k]] !== undefined) counts[assigned[k]]++; });
    var least = Math.min.apply(null, pool.map(function (v) { return counts[v]; }));
    var v = randomFrom(pool.filter(function (x) { return counts[x] === least; }));
    return { voice: v, assign: v };
  }

  // "xX_paul_1234" -> "xX paul": easier to pronounce.
  function spokenName(user) {
    var n = String(user || '').trim().replace(/^@/, '');
    var c = n.replace(/[_\-.]+/g, ' ').replace(/\s*\d{3,}\s*$/, '').replace(/\s+/g, ' ').trim();
    return Array.from(c || n).slice(0, 30).join('');
  }

  // Say the name unless the same chatter was also the last one (within two minutes).
  function needsName(cfg, key, last, now) {
    if (!cfg.allSayName) return false;
    if (cfg.allSkipRepeatName && last && last.key === key && now - last.at < 120000) return false;
    return true;
  }

  function buildChatPayload(cfg, spoken, voice, meta, withName) {
    meta = meta || {};
    var body = speechBody(cfg, { voice: voice, model: '', speed: '' }, spoken);
    var payload = {
      endpoint: speechEndpoint(cfg),
      model: body.model,
      voice: body.voice,
      format: body.response_format,
      text: body.input,
      user: meta.user || '',
      platform: meta.platform || '',
      command: '',
      kind: 'chat',
      maxQueue: clampInt(cfg.maxQueue, 1, 100, DEFAULTS.maxQueue)
    };
    if (typeof body.speed === 'number') payload.speed = body.speed;
    if (withName) {
      var introText = spokenName(meta.user) + ' says';
      if (cfg.allNameVoice && cfg.allNameVoice !== voice) {
        var ib = speechBody(cfg, { voice: cfg.allNameVoice, model: '', speed: '' }, introText);
        payload.intro = { text: ib.input, voice: ib.voice, model: ib.model };
        if (typeof ib.speed === 'number') payload.intro.speed = ib.speed;
      } else {
        payload.text = (introText + ': ' + payload.text).slice(0, 2000); // same voice: one clip is enough (the relay accepts 2000 characters)
      }
    }
    return payload;
  }

  // What the relay answered to GET /info (null if it could not be read) -> { ok, reason, version }.
  // reason: 'old' (older than 0.0.7 or no /info at all). 'down' is set by the caller when nothing answered.
  function checkRelayInfo(info) {
    var version = info && typeof info.version === 'string' ? info.version : '';
    if (info && typeof info.protocol === 'number' && info.protocol >= RELAY_MIN_PROTOCOL) return { ok: true, reason: '', version: version };
    return { ok: false, reason: 'old', version: version };
  }

  function relayGateMessage(gate) {
    if (!gate || gate.ok) return '';
    if (gate.engine === 'simplevoice') {
      if (gate.reason === 'old') {
        return 'The program on the relay address is too old or is not SimpleVoice OBS. This extension needs SimpleVoice OBS 1.0.0 or newer and will not speak anything until you update it.';
      }
      return 'SimpleVoice OBS is not running or not reachable (' + (gate.error || 'no answer') + '). Start SimpleVoice OBS; the extension will not speak anything until it is running.';
    }
    if (gate.reason === 'old') {
      return 'Your relay' + (gate.version ? ' (version ' + gate.version + ')' : '') + ' is too old. This extension needs relay ' + RELAY_MIN_VERSION + ' or newer and will not speak anything until you update it.';
    }
    return 'The relay is not running or not reachable (' + (gate.error || 'no answer') + '). This extension needs relay ' + RELAY_MIN_VERSION + ' or newer running and will not speak anything until it is.';
  }

  // ---- finding out which program is running ---------------------------------------------------
  // SimpleVoice OBS answers GET /v1/models on the relay address (the standalone relay does not).
  // VoiceStudio answers it on its own address. `fetchFn` is fetch (or a fake in the tests).
  // Resolves to { ok, why }: why says what happened, so "not found" can be explained.
  var PROBE_TIMEOUT_MS = 20000;

  // SimpleVoice OBS: GET /v1/models on the relay address answers with a model list (quick, the Go relay).
  // VoiceStudio: GET /health on its own address. Not /v1/models: VoiceStudio builds that list by checking
  // every installed engine (seconds, in a shared worker pool, and it keeps working after the browser gives up),
  // so asking for it again and again made it slower and slower. /health answers from the event loop at once.
  var PROBES = {
    simplevoice: { path: '/v1/models', name: 'a model list' },
    voicestudio: { path: '/health', name: 'a VoiceStudio health answer' }
  };

  function probeOk(kind, d) {
    if (kind === 'voicestudio') return !!(d && typeof d === 'object' && d.status === 'ok' && d.version !== undefined);
    return Array.isArray(d) || !!(d && typeof d === 'object' && (Array.isArray(d.data) || Array.isArray(d.models)));
  }

  function probe(fetchFn, url, timeoutMs, kind) {
    kind = kind === 'voicestudio' ? 'voicestudio' : 'simplevoice';
    var ms = timeoutMs || PROBE_TIMEOUT_MS;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    var notIt = 'answered, but not with ' + PROBES[kind].name;
    return Promise.resolve().then(function () {
      return fetchFn(trimUrl(url) + PROBES[kind].path, ctrl ? { signal: ctrl.signal } : {}); // plain request, same as the Load buttons
    }).then(function (r) {
      if (!r || !r.ok) {
        if (kind === 'voicestudio' && r && r.status === 503) return { ok: false, why: 'is running but still starting up (try again in a moment)' };
        return { ok: false, why: 'answered with HTTP ' + (r && r.status ? r.status : 'error') + ' (not this program)' };
      }
      return r.json().then(function (d) {
        return probeOk(kind, d) ? { ok: true, why: 'ok' } : { ok: false, why: notIt };
      }, function () { return { ok: false, why: notIt }; });
    }, function (e) {
      return { ok: false, why: e && e.name === 'AbortError' ? 'no answer within ' + Math.round(ms / 1000) + ' seconds' : 'nothing is listening there (connection refused)' };
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    });
  }

  function probeEngines(fetchFn, cfg, timeoutMs) {
    var sameAddress = trimUrl(cfg.relayUrl) === trimUrl(cfg.voiceStudioUrl);
    return Promise.all([
      probe(fetchFn, cfg.relayUrl, timeoutMs, 'simplevoice'),
      sameAddress ? Promise.resolve({ ok: false, why: 'same address as SimpleVoice OBS' }) : probe(fetchFn, cfg.voiceStudioUrl, timeoutMs, 'voicestudio')
    ]).then(function (r) {
      return { simplevoice: r[0].ok, voicestudio: r[1].ok, why: { simplevoice: r[0].why, voicestudio: r[1].why } };
    });
  }

  // What to do with the result of probeEngines. `current` is the engine chosen now.
  // Never changes a choice when both (or none) answered: the user decides then.
  function chooseEngine(found, current) {
    var cur = ENGINES.indexOf(current) !== -1 ? current : DEFAULTS.engine;
    if (found.simplevoice && found.voicestudio) return { engine: cur, change: false, note: 'both' };
    if (found.simplevoice) return { engine: 'simplevoice', change: cur !== 'simplevoice', note: 'simplevoice' };
    if (found.voicestudio) return { engine: 'voicestudio', change: cur !== 'voicestudio', note: 'voicestudio' };
    return { engine: cur, change: false, note: 'none' };
  }

  var api = {
    realVoices: realVoices,
    PROFILE_KEYS: PROFILE_KEYS,
    profileOf: profileOf,
    defaultProfile: defaultProfile,
    completeProfiles: completeProfiles,
    ENGINES: ENGINES,
    ENGINE_NAMES: ENGINE_NAMES,
    SIMPLEVOICE_MODEL: SIMPLEVOICE_MODEL,
    SIMPLEVOICE_MIN_CLONE_SPEED: SIMPLEVOICE_MIN_CLONE_SPEED,
    isSimpleVoice: isSimpleVoice,
    engineName: engineName,
    speechBase: speechBase,
    relayPage: relayPage,
    probe: probe,
    probeEngines: probeEngines,
    chooseEngine: chooseEngine,
    SIMPLEVOICE_RELEASES_PAGE: SIMPLEVOICE_RELEASES_PAGE,
    RELAY_MIN_VERSION: RELAY_MIN_VERSION,
    RELAY_MIN_PROTOCOL: RELAY_MIN_PROTOCOL,
    splitList: splitList,
    isIgnoredName: isIgnoredName,
    allLine: allLine,
    chatterKey: chatterKey,
    pickAllVoice: pickAllVoice,
    spokenName: spokenName,
    needsName: needsName,
    buildChatPayload: buildChatPayload,
    checkRelayInfo: checkRelayInfo,
    relayGateMessage: relayGateMessage,
    sanitizeConfig: sanitizeConfig,
    buildExport: buildExport,
    parseImport: parseImport,
    MAX_IMPORT_BYTES: MAX_IMPORT_BYTES,
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
