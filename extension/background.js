/* Service worker: matches chat messages against your commands and forwards them to the relay. */
importScripts('lib/shared.js');
const S = self.VSShared;

async function getConfig() {
  const { config } = await chrome.storage.local.get('config');
  return Object.assign({}, S.DEFAULTS, config || {});
}

async function getStats() {
  const { stats } = await chrome.storage.session.get('stats');
  return Object.assign({ sent: 0, failed: 0, lastAt: 0, lastError: '', lastCommand: '', listeners: null }, stats || {});
}

async function saveStats(patch) {
  const stats = Object.assign(await getStats(), patch);
  await chrome.storage.session.set({ stats });
  return stats;
}

// Returns true if this user may speak now (and records the attempt).
async function cooldownOk(key, seconds) {
  if (!(seconds > 0)) return true;
  const now = Date.now();
  const { cooldowns } = await chrome.storage.session.get('cooldowns');
  const map = cooldowns || {};
  Object.keys(map).forEach((k) => { if (now - map[k] > 3600 * 1000) delete map[k]; });
  if (map[key] && now - map[key] < seconds * 1000) return false;
  map[key] = now;
  await chrome.storage.session.set({ cooldowns: map });
  return true;
}

// ---- the relay must be new enough --------------------------------------------------------
// Version 0.1.1 and newer need relay 0.0.7 or newer (two-voice messages, chat lines). If the relay
// is missing or too old the extension refuses to work: nothing is sent, the icon shows a red "!"
// and the popup and the settings say why.
let gate = { ok: null, at: 0, url: '', engine: '' };

async function relayReady(cfg, force) {
  const url = S.trimUrl(cfg.relayUrl);
  const engine = S.isSimpleVoice(cfg) ? 'simplevoice' : 'voicestudio';
  const now = Date.now();
  if (!force && gate.ok !== null && gate.url === url && gate.engine === engine && now - gate.at < (gate.ok ? 15000 : 3000)) return gate.ok;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  let next;
  try {
    const res = await fetch(url + '/info', { cache: 'no-store', signal: ctrl.signal });
    const info = res.ok ? await res.json().catch(() => null) : null;
    next = S.checkRelayInfo(info);
  } catch (e) {
    next = { ok: false, reason: 'down', version: '', error: e.name === 'AbortError' ? 'no answer' : 'connection refused' };
  } finally {
    clearTimeout(timer);
  }
  next.at = Date.now();
  next.url = url;
  next.engine = engine;
  const changed = gate.ok !== next.ok;
  gate = next;
  await chrome.storage.session.set({ relayGate: next });
  if (!next.ok) {
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setTitle({ title: 'VoiceStudio+SimpleVoice OBS Connector: ' + S.relayGateMessage(next) });
  } else if (changed) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'VoiceStudio+SimpleVoice OBS Connector' });
  }
  return next.ok;
}

async function postToRelay(cfg, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(S.trimUrl(cfg.relayUrl) + '/send?id=' + encodeURIComponent(cfg.overlayId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error('Relay answered ' + res.status + (data.error ? ' (' + data.error + ')' : ''));
    const stats = await getStats();
    await saveStats({ sent: stats.sent + 1, lastAt: Date.now(), lastError: '', lastCommand: payload.command, listeners: data.listeners });
    chrome.action.setBadgeText({ text: '' });
    return { ok: true, listeners: data.listeners };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Relay did not answer' : (e.message || String(e));
    const stats = await getStats();
    await saveStats({ failed: stats.failed + 1, lastAt: Date.now(), lastError: 'Cannot reach relay: ' + msg, listeners: null });
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
    chrome.action.setBadgeText({ text: '!' });
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// The same message must not be sent twice (for example while an old and a new copy of the chat
// reader briefly overlap).
const recentChat = new Map();
function isDuplicate(msg) {
  const now = Date.now();
  const key = [msg.platform, msg.user, msg.text].join('|');
  recentChat.forEach((t, k) => { if (now - t > 3000) recentChat.delete(k); });
  if (recentChat.has(key)) return true;
  recentChat.set(key, now);
  return false;
}

async function handleChat(msg) {
  if (isDuplicate(msg)) return;
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.overlayId) return;
  if (S.isIgnoredName(cfg, msg.user)) return; // completely ignored (bots and so on)
  const result = S.parse(msg.text, cfg.mappings, { removeCommand: cfg.removeCommand, maxChars: cfg.maxChars });
  const who = S.chatterKey(msg.platform, msg.user);

  if (result.match) {
    if (!(await relayReady(cfg))) return;
    if (!(await cooldownOk(who, cfg.cooldownSec))) return;
    await postToRelay(cfg, S.buildPayload(cfg, result, { user: msg.user, platform: msg.platform }));
    return;
  }

  // ---- read all chat ----
  if (!cfg.readAll) return;
  const line = S.allLine(cfg, msg.text);
  if (!line.ok) return;
  if (!(await relayReady(cfg))) return;
  if (!(await cooldownOk('all:' + who, cfg.allCooldownSec))) return;
  // Voice ids belong to one program, so each program keeps its own chatter -> voice list.
  const cvKey = 'chatterVoices_' + (S.isSimpleVoice(cfg) ? 'simplevoice' : 'voicestudio');
  const stored = await chrome.storage.session.get([cvKey, 'lastSpeaker']);
  const lastSpeaker = stored.lastSpeaker;
  const assigned = stored[cvKey] || {};
  const pick = S.pickAllVoice(cfg, who, assigned);
  if (!pick.voice) {
    await saveStats({ lastError: 'Read all chat: choose a voice in the settings.' });
    return;
  }
  if (pick.assign) {
    assigned[who] = pick.assign;
    const keys = Object.keys(assigned);
    if (keys.length > 5000) delete assigned[keys[0]];
    await chrome.storage.session.set({ [cvKey]: assigned });
  }
  const now = Date.now();
  const withName = S.needsName(cfg, who, lastSpeaker, now);
  await chrome.storage.session.set({ lastSpeaker: { key: who, at: now } });
  await postToRelay(cfg, S.buildChatPayload(cfg, line.text, pick.voice, { user: msg.user, platform: msg.platform }, withName));
}

async function handleTest() {
  const cfg = await getConfig();
  if (!(await relayReady(cfg, true))) return { ok: false, error: S.relayGateMessage(gate) };
  const mapping = (cfg.mappings || []).find((m) => m.command && m.voice);
  if (!mapping) return { ok: false, error: 'Add a command and voice first.' };
  const result = { mapping, command: S.normalizeCommand(mapping.command), spoken: 'This is a test of the command !' + S.normalizeCommand(mapping.command) + '.' };
  return postToRelay(cfg, S.buildPayload(cfg, result, { user: 'test', platform: 'extension' }));
}

// Which chat tabs are open and being listened to (shown in the popup).
async function recordChatStatus(tabId, msg) {
  const { chatTabs } = await chrome.storage.session.get('chatTabs');
  const map = chatTabs || {};
  const now = Date.now();
  Object.keys(map).forEach((k) => { if (now - map[k].at > 60000) delete map[k]; });
  map[tabId] = {
    platform: String(msg.platform || ''),
    listening: !!msg.listening,
    seen: Number(msg.seen) || 0,
    last: String(msg.last || '').slice(0, 40),
    at: now
  };
  await chrome.storage.session.set({ chatTabs: map });
}

// ---- update check -------------------------------------------------------------------------
// Asks GitHub which release is newest (public, no login, nothing about the user is sent) and stores
// the answer. It only informs: the user installs the new version by hand. At most once a day.
const UPDATE_EVERY = 24 * 3600 * 1000;
let updating = null;

async function checkForUpdate(force) {
  const cfg = await getConfig();
  if (!force && !cfg.updateCheck) return null;
  const { update } = await chrome.storage.local.get('update');
  if (!force && update && Date.now() - update.checkedAt < UPDATE_EVERY) return update;
  if (updating) return updating;
  updating = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(S.UPDATE_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('GitHub answered ' + res.status);
      const tag = String((await res.json()).tag_name || '');
      if (!S.parseVersion(tag)) throw new Error('unexpected version');
      const next = { checkedAt: Date.now(), latest: tag.replace(/^[vV]/, ''), error: '' };
      await chrome.storage.local.set({ update: next });
      return next;
    } catch (e) {
      // keep the last known answer, try again in about 30 minutes
      const next = Object.assign({ latest: '' }, update || {}, { checkedAt: Date.now() - UPDATE_EVERY + 30 * 60 * 1000, error: e.name === 'AbortError' ? 'GitHub did not answer' : String(e.message || e) });
      await chrome.storage.local.set({ update: next });
      return next;
    } finally {
      clearTimeout(timer);
      updating = null;
    }
  })();
  return updating;
}

let chatQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || sender.id !== chrome.runtime.id) return false;
  if (msg.type === 'chatstatus') {
    if (sender.tab) recordChatStatus(sender.tab.id, msg).catch(() => {});
    return false;
  }
  if (msg.type === 'chat') {
    // one at a time, in arrival order, so quick messages are spoken in the order they were written
    chatQueue = chatQueue.then(() => handleChat(msg)).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'updatecheck') {
    checkForUpdate(!!msg.force).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'relaycheck') {
    getConfig().then((cfg) => relayReady(cfg, !!msg.force)).then(() => sendResponse({ ok: true, gate }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'resetvoices') {
    chrome.storage.session.remove(['chatterVoices', 'chatterVoices_voicestudio', 'chatterVoices_simplevoice', 'lastSpeaker']).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'test') {
    handleTest().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

// Chrome only adds content scripts to pages that load after the extension is installed or
// reloaded. So that nobody has to refresh their chat tab, add the chat readers to the tabs that
// are already open.
async function injectIntoOpenTabs() {
  const scripts = chrome.runtime.getManifest().content_scripts || [];
  for (const cs of scripts) {
    const hosts = Array.from(new Set(cs.matches.map((m) => (m.match(/^(https:\/\/[^/]+)\//) || [])[1]).filter(Boolean)));
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: hosts.map((h) => h + '/*') }); } catch (e) { continue; }
    for (const t of tabs) {
      chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: !!cs.all_frames }, files: cs.js }).catch(() => {});
    }
  }
}

chrome.runtime.onStartup.addListener(() => {
  checkForUpdate(false).catch(() => {});
  getConfig().then((cfg) => relayReady(cfg, true)).catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  injectIntoOpenTabs().catch(() => {});
  checkForUpdate(false).catch(() => {});
  const cfg = await getConfig();
  relayReady(cfg, true).catch(() => {});
  if (!cfg.overlayId) {
    cfg.overlayId = S.randomId();
    await chrome.storage.local.set({ config: cfg });
  }
});
