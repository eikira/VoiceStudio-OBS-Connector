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

async function handleChat(msg) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.overlayId) return;
  const result = S.parse(msg.text, cfg.mappings, { removeCommand: cfg.removeCommand, maxChars: cfg.maxChars });
  if (!result.match) return;
  const who = String(msg.platform || '') + ':' + String(msg.user || '').toLowerCase();
  if (!(await cooldownOk(who, cfg.cooldownSec))) return;
  const payload = S.buildPayload(cfg, result, { user: msg.user, platform: msg.platform });
  await postToRelay(cfg, payload);
}

async function handleTest() {
  const cfg = await getConfig();
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
  if (msg.type === 'test') {
    handleTest().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  const cfg = await getConfig();
  if (!cfg.overlayId) {
    cfg.overlayId = S.randomId();
    await chrome.storage.local.set({ config: cfg });
  }
});
