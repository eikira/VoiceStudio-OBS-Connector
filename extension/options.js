(function () {
  'use strict';
  var S = window.VSShared;
  var $ = function (id) { return document.getElementById(id); };
  var overlayId = '';
  var voices = []; // [{ id, name }] loaded from VoiceStudio
  var knownModels = [{ id: 'tts-1-hd', name: 'tts-1-hd' }, { id: 'tts-1', name: 'tts-1' }];
  var pickers = []; // every dropdown, so all of them can be refreshed after loading voices/models
  var CUSTOM = '__custom__';
  var modelPicker = null;

  /*
   * A real dropdown that always lists every entry. (A text box with a type-ahead list only shows
   * entries matching what is already typed, which hides the rest.) "Custom..." lets you type a
   * value that is not listed.
   * opts: { value, fallbackName, placeholder, blankLabel (adds an empty choice), source() -> [{ id, name }] }
   */
  function Picker(opts) {
    var wrap = document.createElement('div');
    wrap.className = 'picker';
    var select = document.createElement('select');
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = opts.placeholder || '';
    var value = opts.value || '';
    var current = []; // the items shown by the last render
    var self = { el: wrap };

    function addOption(val, label, title) {
      var o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      if (title) o.title = title;
      select.appendChild(o);
    }

    function render() {
      var list = opts.source().slice();
      // A saved voice whose name we know but that is not in the loaded list (yet) still shows by name.
      if (value && opts.fallbackName && !list.some(function (it) { return it.id === value; })) {
        list.push({ id: value, name: opts.fallbackName });
      }
      current = list;
      var plain = !list.length && !opts.blankLabel; // nothing to choose from: just a text field
      var nameCount = {};
      list.forEach(function (it) { var n = it.name || it.id; nameCount[n] = (nameCount[n] || 0) + 1; });
      select.textContent = '';
      if (opts.blankLabel) addOption('', opts.blankLabel);
      list.forEach(function (it) {
        var n = it.name || it.id;
        addOption(it.id, nameCount[n] > 1 && n !== it.id ? n + ' (' + it.id + ')' : n, it.id);
      });
      addOption(CUSTOM, 'Custom...');
      var known = list.some(function (it) { return it.id === value; });
      if (value === '' && opts.blankLabel) select.value = '';
      else if (known) select.value = value;
      else select.value = CUSTOM;
      select.style.display = plain ? 'none' : '';
      input.value = select.value === CUSTOM ? value : '';
      input.style.display = plain || select.value === CUSTOM ? '' : 'none';
    }

    self.get = function () {
      if (select.style.display === 'none' || select.value === CUSTOM) return input.value.trim();
      return select.value;
    };
    // The display name of the selected entry ('' when it has none, or is a custom value).
    self.getName = function () {
      var v = self.get();
      for (var i = 0; i < current.length; i++) {
        if (current[i].id === v) return current[i].name && current[i].name !== v ? current[i].name : '';
      }
      return '';
    };
    self.refresh = function () { value = self.get(); render(); };
    select.addEventListener('change', function () {
      if (select.value === CUSTOM) { input.style.display = ''; input.focus(); }
      else input.style.display = 'none';
    });
    wrap.append(select, input);
    render();
    pickers.push(self);
    return self;
  }

  function refreshPickers() {
    pickers = pickers.filter(function (p) { return p.el.isConnected; });
    pickers.forEach(function (p) { p.refresh(); });
  }

  // Speed dropdown: only 0.5 ... 1.5 in steps of 0.1 (plus an optional "default" choice).
  function speedSelect(value, blankLabel) {
    var sel = document.createElement('select');
    sel.className = 'speed';
    function add(v, label) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      sel.appendChild(o);
    }
    if (blankLabel) add('', blankLabel);
    S.speedChoices().forEach(function (v) { add(v, v === '1.0' ? '1.0 (normal)' : v); });
    var n = S.parseSpeed(value);
    sel.value = n === null ? (blankLabel ? '' : '1.0') : n.toFixed(1);
    return sel;
  }

  function setStatus(el, text, cls) {
    el.textContent = text || '';
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  // ---- permissions for hosts other than this PC -------------------------------------------
  // Must be the first async call in a click handler so Chrome treats it as user-initiated.
  function ensurePermissions(urls) {
    var patterns = [];
    urls.forEach(function (u) {
      var p = S.permissionPattern(u);
      if (p && patterns.indexOf(p) === -1) patterns.push(p);
    });
    if (!patterns.length) return Promise.resolve(true);
    return chrome.permissions.request({ origins: patterns });
  }

  // ---- mapping rows -----------------------------------------------------------------------
  function addRow(m) {
    m = m || {};
    var row = document.createElement('div');
    row.className = 'row';

    var st = document.createElement('div');
    st.className = 'rowStatus muted';

    // Command: the "!" is fixed and added automatically; the user types only what follows it.
    var cmdWrap = document.createElement('div');
    cmdWrap.className = 'cmd';
    var bang = document.createElement('span');
    bang.className = 'bang'; bang.textContent = '!';
    var cmd = document.createElement('input');
    cmd.type = 'text'; cmd.className = 'command'; cmd.placeholder = 'command/name';
    cmd.value = m.command ? S.normalizeCommand(m.command) : '';
    cmdWrap.append(bang, cmd);

    function checkLength() {
      var c = S.normalizeCommand(cmd.value);
      var tooLong = Array.from(c).length > S.MAX_COMMAND_CHARS;
      cmd.classList.toggle('over', tooLong);
      if (tooLong) {
        st.className = 'rowStatus bad';
        st.textContent = 'Too long. Maximum is ' + S.MAX_COMMAND_CHARS + ' characters.';
      } else if (st.className.indexOf('bad') !== -1) {
        st.className = 'rowStatus muted'; st.textContent = '';
      }
    }
    cmd.addEventListener('input', checkLength);
    cmd.addEventListener('blur', function () { cmd.value = S.normalizeCommand(cmd.value); checkLength(); });

    var voice = Picker({
      value: m.voice || '', fallbackName: m.voiceName || '', placeholder: 'voice name / profile ID',
      blankLabel: '- choose a voice -', source: function () { return voices; }
    });
    var speed = speedSelect(m.speed, 'default');
    var model = Picker({
      value: m.model || '', placeholder: 'model name', blankLabel: 'default',
      source: function () { return knownModels; }
    });
    row._voice = voice;
    row._model = model;

    var actions = document.createElement('div');
    actions.className = 'actions';
    var test = document.createElement('button');
    test.className = 'small'; test.textContent = 'Test'; test.title = 'Play a test sentence with this voice (through your OBS page)';
    var del = document.createElement('button');
    del.className = 'small'; del.textContent = '×'; del.title = 'Remove';
    actions.append(test, del);

    del.addEventListener('click', function () { row.remove(); });
    test.addEventListener('click', function () { testRow(row, st); });

    row.append(cmdWrap, voice.el, speed, model.el, actions, st);
    $('mappings').appendChild(row);
    checkLength();
    return row;
  }

  function readRow(row) {
    return {
      command: S.normalizeCommand(row.querySelector('.command').value),
      voice: row._voice.get(),
      voiceName: row._voice.getName(),
      speed: row.querySelector('.speed').value.trim(),
      model: row._model.get()
    };
  }

  // ---- read the form ----------------------------------------------------------------------
  function collect() {
    var speed = S.parseSpeed($('speed').value);
    return {
      enabled: $('enabled').checked,
      relayUrl: S.trimUrl($('relayUrl').value) || S.DEFAULTS.relayUrl,
      overlayId: overlayId,
      voiceStudioUrl: S.trimUrl($('vsUrl').value) || S.DEFAULTS.voiceStudioUrl,
      model: modelPicker.get() || S.DEFAULTS.model,
      format: $('format').value,
      speed: speed === null ? 1 : speed,
      mappings: Array.prototype.map.call(document.querySelectorAll('#mappings .row'), readRow)
        .filter(function (m) { return m.command || m.voice; }),
      removeCommand: $('removeCommand').checked,
      maxChars: Math.max(10, Math.min(2000, parseInt($('maxChars').value, 10) || S.DEFAULTS.maxChars)),
      cooldownSec: Math.max(0, Math.min(3600, parseInt($('cooldown').value, 10) || 0)),
      updateCheck: $('updateCheck').checked
    };
  }

  function validate(cfg) {
    if (!S.isValidHttpUrl(cfg.relayUrl)) return 'The relay address must start with http:// or https://';
    if (!S.isValidHttpUrl(cfg.voiceStudioUrl)) return 'The VoiceStudio address must start with http:// or https://';
    var seen = {};
    for (var i = 0; i < cfg.mappings.length; i++) {
      var m = cfg.mappings[i];
      if (!m.command) return 'Row ' + (i + 1) + ' has a voice but no command.';
      var problem = S.commandProblem(m.command);
      if (problem) return problem;
      if (!m.voice) return 'Command !' + m.command + ' has no voice.';
      if (seen[m.command]) return 'Command !' + m.command + ' is listed twice.';
      seen[m.command] = true;
    }
    return '';
  }

  function refreshObsUrl() {
    var cfg = { relayUrl: S.trimUrl($('relayUrl').value) || S.DEFAULTS.relayUrl, overlayId: overlayId };
    $('obsUrl').value = S.overlayUrl(cfg);
  }

  // ---- relay status -----------------------------------------------------------------------
  // Relay 0.0.6 and newer tell their version and whether they know of a newer one. Older ones have no /info.
  function showRelayVersion(relay) {
    return fetch(relay + '/info').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var el = $('relayVersion');
      if (!d || !d.version) {
        setStatus(el, 'This relay is older than 0.0.6. Please update it (download page: github.com/eikira/VoiceStudio-OBS-Connector-Relay/releases/latest).', 'muted');
      } else if (d.updateAvailable) {
        el.className = 'status bad';
        el.textContent = 'Relay ' + d.version + '. A newer relay is available: ' + d.latest + '. ';
        var a = document.createElement('a');
        a.href = S.RELAY_RELEASES_PAGE; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Download';
        el.appendChild(a);
      } else {
        setStatus(el, 'Relay version ' + d.version + '.', 'muted');
      }
    }).catch(function () { setStatus($('relayVersion'), '', 'muted'); });
  }

  function openRelayFolder() {
    var relay = S.trimUrl($('relayUrl').value) || S.DEFAULTS.relayUrl;
    var el = $('relayFolderStatus');
    fetch(relay + '/open-folder', { method: 'POST', headers: { 'X-Relay-Open': '1' } })
      .then(function (r) {
        if (r.status === 404) { setStatus(el, 'Your relay is older than 0.0.6 and cannot do this. Please update it first.', 'bad'); return; }
        return r.json().then(function (d) {
          if (r.ok && d.ok) setStatus(el, 'Opened the relay folder on the computer where the relay runs: ' + d.path, 'good');
          else setStatus(el, 'The relay could not open its folder (' + (d.error || r.status) + ').', 'bad');
        });
      })
      .catch(function () { setStatus(el, 'The relay is not reachable. Start it first, or open the folder you unzipped it to.', 'bad'); });
  }

  function checkRelay() {
    var relay = S.trimUrl($('relayUrl').value) || S.DEFAULTS.relayUrl;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 2000);
    return fetch(relay + '/status?id=' + encodeURIComponent(overlayId), { signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          setStatus($('relayStatus'), d.listeners > 0
            ? 'Relay running. OBS page connected.'
            : 'Relay running. OBS page not connected yet (add the URL above as a Browser Source).', d.listeners > 0 ? 'good' : 'muted');
        } else {
          setStatus($('relayStatus'), 'Relay answered, but not as expected.', 'bad');
        }
      })
      .then(function () { return showRelayVersion(relay); })
      .catch(function () {
        setStatus($('relayVersion'), '', 'muted');
        setStatus($('relayStatus'), 'Relay not reachable. Start the relay (download: github.com/eikira/VoiceStudio-OBS-Connector-Relay), or fix the address.', 'bad');
      })
      .then(function () { clearTimeout(timer); });
  }

  // ---- talking to VoiceStudio -------------------------------------------------------------
  function vsBase() { return S.trimUrl($('vsUrl').value) || S.DEFAULTS.voiceStudioUrl; }

  function listFrom(data, keys) {
    if (Array.isArray(data)) return data;
    for (var i = 0; i < keys.length; i++) if (data && Array.isArray(data[keys[i]])) return data[keys[i]];
    return [];
  }

  function pick(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    return '';
  }

  // Fetch the voice list. Resolves to [{ id, name }]; rejects with an Error.
  function fetchVoices() {
    return fetch(vsBase() + '/v1/audio/voices').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      return listFrom(data, ['voices', 'data', 'profiles']).map(function (v) {
        if (typeof v === 'string') return { id: v, name: v };
        var vid = pick(v, ['id', 'voice_id', 'profile_id', 'slug', 'name']);
        var name = pick(v, ['name', 'display_name', 'voice_name', 'profile_name', 'label', 'title']) || vid;
        return { id: vid, name: name };
      }).filter(function (v) { return v.id; });
    });
  }

  function loadVoices() {
    var p = ensurePermissions([vsBase()]);
    setStatus($('voiceStatus'), 'Loading...', 'muted');
    p.then(function (granted) {
      if (!granted) throw new Error('Permission to contact ' + vsBase() + ' was not granted.');
      return fetchVoices();
    }).then(function (list) {
      voices = list;
      refreshPickers();
      setStatus($('voiceStatus'), voices.length
        ? voices.length + ' voices loaded. Choose one in the Voice dropdown of each row.'
        : 'VoiceStudio answered but no voices were found in the response. Choose "Custom..." in a Voice dropdown to type a name.', voices.length ? 'good' : 'muted');
    }).catch(function (e) {
      setStatus($('voiceStatus'), 'Could not load voices: ' + e.message + '. You can still choose "Custom..." in a Voice dropdown and type a name.', 'bad');
    });
  }

  function loadModels() {
    var p = ensurePermissions([vsBase()]);
    setStatus($('vsStatus'), 'Loading models...', 'muted');
    p.then(function (granted) {
      if (!granted) throw new Error('Permission to contact ' + vsBase() + ' was not granted.');
      return fetch(vsBase() + '/v1/models');
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var arr = listFrom(data, ['data', 'models']);
      var models = arr.map(function (m) {
        var mid = typeof m === 'string' ? m : pick(m, ['id', 'name']);
        return { id: mid, name: mid };
      }).filter(function (m) { return m.id; });
      if (models.length) {
        knownModels = models;
        refreshPickers();
        setStatus($('vsStatus'), models.length + ' models loaded. Choose one in the Default model dropdown.', 'good');
      } else {
        setStatus($('vsStatus'), 'No models listed. Choose "Custom..." to type the model name.', 'muted');
      }
    }).catch(function (e) {
      setStatus($('vsStatus'), 'Could not load models: ' + e.message + '. Choose "Custom..." to type the model name (for example tts-1-hd).', 'bad');
    });
  }

  // A short unique command (max 8 characters) for a voice name.
  function uniqueCommand(name, used) {
    var base = S.normalizeCommand(name).replace(/[^a-z0-9_\-]+/g, '').slice(0, S.MAX_COMMAND_CHARS) || 'voice';
    if (!used[base]) return base;
    for (var n = 2; n < 1000; n++) {
      var suffix = String(n);
      var cand = base.slice(0, S.MAX_COMMAND_CHARS - suffix.length) + suffix;
      if (!used[cand]) return cand;
    }
    return base;
  }

  function addAllVoices() {
    if (!voices.length) {
      setStatus($('voiceStatus'), 'Load the voices first.', 'bad');
      return;
    }
    var used = {};
    var usedVoices = {};
    document.querySelectorAll('#mappings .row').forEach(function (r) {
      var m = readRow(r);
      used[m.command] = true;
      usedVoices[m.voice] = true;
    });
    var added = 0;
    voices.forEach(function (v) {
      if (usedVoices[v.id]) return;
      var cmd = uniqueCommand(v.name, used);
      used[cmd] = true;
      addRow({ command: cmd, voice: v.id, voiceName: v.name });
      added++;
    });
    setStatus($('voiceStatus'), added ? added + ' commands added. Rename any command you like, then Save.' : 'All loaded voices already have a command.', added ? 'good' : 'muted');
  }

  // Test sends a sample to OBS, exactly like a chat message would (nothing plays in this page).
  // It uses the values currently shown in the row, saved or not.
  function testRow(row, st) {
    var cfg = collect();
    var m = readRow(row);
    function say(text, cls) { st.className = 'rowStatus ' + (cls || 'muted'); st.textContent = text; }
    if (!m.voice) return say('Choose a voice first.', 'bad');
    var result = {
      mapping: m,
      command: m.command || 'test',
      spoken: 'This is a test' + (m.command ? ' of the command !' + m.command : '') + '.'
    };
    say('Sending...');
    fetch(S.trimUrl(cfg.relayUrl) + '/send?id=' + encodeURIComponent(cfg.overlayId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(S.buildPayload(cfg, result, { user: 'settings', platform: 'settings' }))
    }).catch(function () {
      throw new Error('The relay is not reachable. Start it first (download: github.com/eikira/VoiceStudio-OBS-Connector-Relay).');
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d.error || 'The relay refused the test (HTTP ' + r.status + ').');
        if (d.listeners > 0) say('Sent to OBS.', 'good');
        else say('Sent, but no OBS page is connected.', 'bad');
      });
    }).catch(function (e) {
      say('Failed: ' + e.message, 'bad');
    });
  }

  // ---- save -------------------------------------------------------------------------------
  function save() {
    var cfg = collect();
    var problem = validate(cfg);
    if (problem) { setStatus($('saveStatus'), problem, 'bad'); return; }
    var patterns = [cfg.voiceStudioUrl, cfg.relayUrl];
    ensurePermissions(patterns).then(function (granted) {
      if (!granted) {
        setStatus($('saveStatus'), 'Saved, but Chrome did not allow access to the non-local address. It will not work until you allow it.', 'bad');
      }
      return chrome.storage.local.set({ config: cfg }).then(function () {
        if (granted) setStatus($('saveStatus'), 'Saved.', 'good');
        return checkRelay();
      });
    }).catch(function (e) {
      setStatus($('saveStatus'), 'Could not save: ' + e.message, 'bad');
    });
  }

  // ---- startup ----------------------------------------------------------------------------
  function load() {
    chrome.storage.local.get('config').then(function (res) {
      var cfg = Object.assign({}, S.DEFAULTS, res.config || {});
      var fresh = !cfg.overlayId;
      if (fresh) cfg.overlayId = S.randomId();
      overlayId = cfg.overlayId;
      $('enabled').checked = cfg.enabled;
      $('relayUrl').value = cfg.relayUrl;
      $('vsUrl').value = cfg.voiceStudioUrl;
      modelPicker = Picker({ value: cfg.model, placeholder: 'model name', source: function () { return knownModels; } });
      $('modelPicker').appendChild(modelPicker.el);
      $('format').value = cfg.format;
      S.speedChoices().forEach(function (v) {
        var o = document.createElement('option');
        o.value = v;
        o.textContent = v === '1.0' ? '1.0 (normal)' : v;
        $('speed').appendChild(o);
      });
      var sp = S.parseSpeed(cfg.speed);
      $('speed').value = (sp === null ? 1 : sp).toFixed(1);
      $('removeCommand').checked = cfg.removeCommand;
      $('maxChars').value = cfg.maxChars;
      $('cooldown').value = cfg.cooldownSec;
      $('updateCheck').checked = cfg.updateCheck !== false;
      (cfg.mappings.length ? cfg.mappings : [{ command: '', voice: '' }]).forEach(addRow);
      refreshObsUrl();
      if (fresh) chrome.storage.local.set({ config: cfg });
      checkRelay();
      // Quietly load the voice names so rows show names right away (needs no click).
      fetchVoices().then(function (list) {
        voices = list;
        refreshPickers();
      }, function () { /* not reachable yet: the Load button explains why */ });
    });
  }

  $('version').textContent = chrome.runtime.getManifest().version;
  $('relayUrl').addEventListener('input', refreshObsUrl);
  $('copyUrl').addEventListener('click', function () {
    navigator.clipboard.writeText($('obsUrl').value).then(function () {
      setStatus($('relayStatus'), 'URL copied.', 'good');
    });
  });
  $('newId').addEventListener('click', function () {
    if (!confirm('Create a new ID? Your OBS Browser Source URL will change and you must paste the new one into OBS.')) return;
    overlayId = S.randomId();
    refreshObsUrl();
    setStatus($('saveStatus'), 'New ID created. Click Save, then update the URL in OBS.', 'muted');
  });
  $('checkRelay').addEventListener('click', checkRelay);
  $('openRelayFolder').addEventListener('click', openRelayFolder);

  // ---- updates (the check itself runs in the background script, at most once a day) --------
  function showUpdateStatus() {
    chrome.storage.local.get('update').then(function (res) {
      var u = res.update;
      var cur = chrome.runtime.getManifest().version;
      var el = $('updateStatus');
      $('updatePage').href = S.RELEASES_PAGE;
      if (!u || !u.latest) {
        setStatus(el, (u && u.error ? 'Could not check: ' + u.error + '. ' : 'Not checked yet. ') + 'You have version ' + cur + '.', u && u.error ? 'bad' : 'muted');
      } else if (S.newerThan(u.latest, cur)) {
        setStatus(el, 'Update available: ' + u.latest + ' (you have ' + cur + '). See "How to update" below.', 'bad');
      } else {
        setStatus(el, 'You have the newest version (' + cur + ').', 'good');
      }
    });
  }
  $('checkUpdate').addEventListener('click', function () {
    setStatus($('updateStatus'), 'Checking...', 'muted');
    chrome.runtime.sendMessage({ type: 'updatecheck', force: true }, function () { void chrome.runtime.lastError; showUpdateStatus(); });
  });
  $('showWhere').addEventListener('click', function () {
    chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }).then(function () {
      setStatus($('whereStatus'), 'Opened. Look for "Source" on that page.', 'good');
    }, function () {
      setStatus($('whereStatus'), 'Chrome did not open it. Type chrome://extensions in the address bar and click Details on this extension.', 'bad');
    });
  });
  $('extId').textContent = chrome.runtime.id;
  chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'local' && ch.update) showUpdateStatus(); });
  chrome.runtime.sendMessage({ type: 'updatecheck' }, function () { void chrome.runtime.lastError; showUpdateStatus(); });
  showUpdateStatus();
  $('addRow').addEventListener('click', function () { addRow(); });
  $('loadVoices').addEventListener('click', loadVoices);
  $('loadModels').addEventListener('click', loadModels);
  $('addAllVoices').addEventListener('click', addAllVoices);
  $('save').addEventListener('click', save);
  setInterval(checkRelay, 8000);
  load();
})();
