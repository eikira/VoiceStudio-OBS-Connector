'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../extension/lib/shared.js');

const mappings = [
  { command: 'hazed', voice: 'hazed', speed: '1.1' },
  { command: '!Mao', voice: 'mao-voice', speed: '', model: 'tts-1' },
  { command: 'broken', voice: '' }
];
const opts = { removeCommand: true, maxChars: 300 };

test('matches a command and strips it', () => {
  const r = S.parse('!hazed hello there', mappings, opts);
  assert.strictEqual(r.match, true);
  assert.strictEqual(r.spoken, 'hello there');
  assert.strictEqual(r.mapping.voice, 'hazed');
});

test('command matching is case-insensitive and mapping may be stored with "!"', () => {
  const r = S.parse('!MAO Welcome', mappings, opts);
  assert.strictEqual(r.match, true);
  assert.strictEqual(r.mapping.voice, 'mao-voice');
});

test('ignores normal chat, unknown commands, empty text and unmapped voices', () => {
  assert.strictEqual(S.parse('hello !hazed', mappings, opts).match, false);
  assert.strictEqual(S.parse('!nope hi', mappings, opts).reason, 'unknown-command');
  assert.strictEqual(S.parse('!hazed', mappings, opts).reason, 'empty');
  assert.strictEqual(S.parse('!hazed    ', mappings, opts).reason, 'empty');
  assert.strictEqual(S.parse('!broken hi', mappings, opts).reason, 'unknown-command');
  assert.strictEqual(S.parse('', mappings, opts).match, false);
});

test('does not treat a longer word as the command', () => {
  assert.strictEqual(S.parse('!hazedx hi', mappings, opts).match, false);
});

test('keeps the command when removeCommand is off', () => {
  assert.strictEqual(S.parse('!hazed hi', mappings, { removeCommand: false, maxChars: 300 }).spoken, '!hazed hi');
});

test('collapses whitespace, strips zero-width characters, truncates by characters', () => {
  assert.strictEqual(S.parse('!hazed  a ​  b\n c', mappings, opts).spoken, 'a b c');
  const long = S.parse('!hazed ' + 'x'.repeat(500), mappings, { removeCommand: true, maxChars: 20 });
  assert.strictEqual(Array.from(long.spoken).length, 20);
  const emoji = S.parse('!hazed ' + '\u{1F600}'.repeat(50), mappings, { removeCommand: true, maxChars: 10 });
  assert.strictEqual(Array.from(emoji.spoken).length, 10);
});

test('speed is limited to 0.5-1.5 in 0.1 steps', () => {
  assert.strictEqual(S.parseSpeed('1,26'), 1.3);
  assert.strictEqual(S.parseSpeed('9'), 1.5);
  assert.strictEqual(S.parseSpeed('0.01'), 0.5);
  assert.strictEqual(S.parseSpeed(1.1), 1.1);
  assert.strictEqual(S.parseSpeed(''), null);
  assert.strictEqual(S.parseSpeed('fast'), null);
  assert.strictEqual(S.parseSpeed(null), null);
  assert.deepStrictEqual(S.speedChoices(), ['0.5', '0.6', '0.7', '0.8', '0.9', '1.0', '1.1', '1.2', '1.3', '1.4', '1.5']);
});

test('commands: 8 characters after the "!" are fine, 9 are refused with an explanation', () => {
  assert.strictEqual(S.MAX_COMMAND_CHARS, 8);
  assert.strictEqual(S.commandProblem('abcdefgh'), '');
  assert.strictEqual(S.commandProblem('!abcdefgh'), '');            // a typed "!" is ignored, not counted twice
  const msg = S.commandProblem('abcdefghi');
  assert.match(msg, /too long\. Maximum is 8 characters\./);
  assert.strictEqual(S.commandProblem('äöüabcde'), ''); // 8 letters incl. umlauts
  assert.match(S.commandProblem('a b'), /may only contain/);
  assert.match(S.commandProblem(''), /empty/);
});

test('default message limit is 190 characters', () => {
  assert.strictEqual(S.DEFAULTS.maxChars, 190);
  const r = S.parse('!hazed ' + 'x'.repeat(400), mappings, { removeCommand: true });
  assert.strictEqual(Array.from(r.spoken).length, 190);
});

test('payload uses per-voice speed/model, falling back to defaults', () => {
  const cfg = Object.assign({}, S.DEFAULTS, { voiceStudioUrl: 'http://127.0.0.1:3900/', model: 'tts-1-hd', speed: 0.9, format: 'wav' });
  const hazed = S.buildPayload(cfg, S.parse('!hazed hi', mappings, opts), { user: 'Jess', platform: 'twitch' });
  assert.deepStrictEqual(hazed, {
    endpoint: 'http://127.0.0.1:3900/v1/audio/speech', model: 'tts-1-hd', voice: 'hazed', format: 'wav',
    text: 'hi', user: 'Jess', platform: 'twitch', command: 'hazed', speed: 1.1
  });
  const mao = S.buildPayload(cfg, S.parse('!mao hi', mappings, opts), {});
  assert.strictEqual(mao.model, 'tts-1');   // per-voice model override
  assert.strictEqual(mao.speed, 0.9);       // falls back to the default speed
});

test('speechBody matches the request VoiceStudio expects', () => {
  const cfg = Object.assign({}, S.DEFAULTS);
  assert.deepStrictEqual(S.speechBody(cfg, { voice: 'hazed', speed: '1.1' }, 'hi'),
    { model: 'tts-1-hd', input: 'hi', voice: 'hazed', response_format: 'wav', speed: 1.1 });
});

test('overlay URL and permission patterns', () => {
  assert.strictEqual(S.overlayUrl({ relayUrl: 'http://127.0.0.1:8787/', overlayId: 'abc' }), 'http://127.0.0.1:8787/overlay.html?id=abc');
  assert.strictEqual(S.permissionPattern('http://127.0.0.1:3900'), null);
  assert.strictEqual(S.permissionPattern('http://localhost:3900'), null);
  assert.strictEqual(S.permissionPattern('http://192.168.1.20:3900'), 'http://192.168.1.20/*');
  assert.strictEqual(S.permissionPattern('nonsense'), null);
});

test('random ids are long, unique and URL-safe', () => {
  const a = S.randomId();
  const b = S.randomId();
  assert.match(a, /^[A-Za-z0-9]{20}$/);
  assert.notStrictEqual(a, b);
});

test('update check: version comparison', () => {
  const S = require('../extension/lib/shared.js');
  assert.strictEqual(S.newerThan('v0.0.10', '0.0.9'), true);
  assert.strictEqual(S.newerThan('0.1.0', '0.0.9'), true);
  assert.strictEqual(S.newerThan('0.0.9', '0.0.9'), false);
  assert.strictEqual(S.newerThan('0.0.8', '0.0.9'), false);
  assert.strictEqual(S.newerThan('1.0', '1.0.0'), false);
  assert.strictEqual(S.newerThan('1.0-beta', '0.0.9'), false);
  assert.strictEqual(S.newerThan('', '0.0.9'), false);
  assert.strictEqual(S.newerThan('latest', '0.0.9'), false);
  assert.strictEqual(S.DEFAULTS.updateCheck, true);
});

test('settings backup: export then import gives the same settings', () => {
  const cfg = { enabled: true, relayUrl: 'http://127.0.0.1:8787/', overlayId: 'abcdefgh1234', voiceStudioUrl: 'http://192.168.1.20:3900', model: 'omnivoice', format: 'mp3', speed: 1.2,
    mappings: [{ command: '!Hazed', voice: 'hazed', voiceName: 'Hazed', speed: '1.1', model: '' }, { command: 'mao', voice: 'mao-voice', speed: 1.5, model: 'tts-1' }],
    removeCommand: false, maxChars: 250, cooldownSec: 7, updateCheck: false, stats: 'not exported' };
  const doc = S.buildExport(cfg, '0.1.0');
  assert.strictEqual(doc.app, 'VoiceStudio+SimpleVoice OBS Connector');
  assert.strictEqual(doc.format, 2);
  assert.strictEqual(doc.settings.stats, undefined);
  const r = S.parseImport(JSON.stringify(doc), 'zzzzzzzzzz');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.warnings, []);
  assert.strictEqual(r.config.overlayId, 'abcdefgh1234');
  assert.strictEqual(r.config.relayUrl, 'http://127.0.0.1:8787');
  assert.deepStrictEqual(r.config.mappings, [
    { command: 'hazed', voice: 'hazed', voiceName: 'Hazed', speed: '1.1', model: '' },
    { command: 'mao', voice: 'mao-voice', voiceName: '', speed: '1.5', model: 'tts-1' }]);
  assert.strictEqual(r.config.updateCheck, false);
  assert.strictEqual(r.config.removeCommand, false);
  // a second round gives the same thing
  assert.deepStrictEqual(S.parseImport(JSON.stringify(S.buildExport(r.config, '0.1.0')), 'x').config, r.config);
});

test('settings backup: refuses files that are not ours, accepts old files with missing keys', () => {
  assert.strictEqual(S.parseImport('nope').ok, false);
  assert.strictEqual(S.parseImport('{"a":1}').ok, false);
  assert.strictEqual(S.parseImport('[]').ok, false);
  assert.strictEqual(S.parseImport(JSON.stringify({ app: 'VoiceStudio OBS Connector', kind: 'settings', format: 99, settings: {} })).ok, false);
  assert.strictEqual(S.parseImport('x'.repeat(S.MAX_IMPORT_BYTES + 1)).ok, false);
  const r = S.parseImport(JSON.stringify({ app: 'VoiceStudio OBS Connector', kind: 'settings', format: 1, settings: { mappings: [{ command: 'a', voice: 'v' }] } }), 'keepkeepkeep');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.config.overlayId, 'keepkeepkeep');
  assert.strictEqual(r.config.voiceStudioUrl, 'http://127.0.0.1:3900');
  assert.strictEqual(r.config.maxChars, 190);
});

test('settings backup: tampered values are cleaned, not trusted', () => {
  const r = S.sanitizeConfig({ relayUrl: 'javascript:alert(1)', voiceStudioUrl: 'file:///etc/passwd', overlayId: '../x', model: 5, format: 'exe', speed: 99, maxChars: 1e9, cooldownSec: -3,
    mappings: [{ command: 'toolongcmd9', voice: 'v' }, { command: 'ok', voice: 'v', speed: '0.01' }, { command: 'OK', voice: 'w' }, { command: 'x', voice: '' }, 7, null, { command: 'bad cmd!', voice: 'v' }], evil: true }, 'mine12345');
  assert.strictEqual(r.config.relayUrl, 'http://127.0.0.1:8787');
  assert.strictEqual(r.config.voiceStudioUrl, 'http://127.0.0.1:3900');
  assert.strictEqual(r.config.overlayId, 'mine12345');
  assert.strictEqual(r.config.format, 'wav');
  assert.strictEqual(r.config.speed, 1.5);
  assert.strictEqual(r.config.maxChars, 2000);
  assert.strictEqual(r.config.cooldownSec, 0);
  assert.deepStrictEqual(r.config.mappings.map((m) => m.command + ':' + m.speed), ['ok:0.5']);
  assert.strictEqual(r.config.evil, undefined);
  assert.ok(r.warnings.length >= 5);
  const many = S.sanitizeConfig({ mappings: Array.from({ length: 300 }, (_, i) => ({ command: 'c' + i, voice: 'v' })) });
  assert.strictEqual(many.config.mappings.length, 200);
});

// ---- 0.1.1: read all chat ----------------------------------------------------------------
const base = () => Object.assign({}, S.DEFAULTS, { readAll: true, allVoice: 'v1', allVoices: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], maxChars: 100 });

test('allLine: filters', () => {
  const c = base();
  assert.strictEqual(S.allLine(c, 'hello there').text, 'hello there');
  assert.strictEqual(S.allLine(c, '!sr foo').reason, 'bang');
  assert.strictEqual(S.allLine(c, 'look https://x.com/a').reason, 'link');
  assert.strictEqual(S.allLine(c, 'visit example.com now').reason, 'link');
  assert.strictEqual(S.allLine(c, '😂😂').reason, 'nothing-to-read');
  assert.strictEqual(S.allLine(c, 'Kappa 😂 nice').text, 'Kappa nice');
  assert.strictEqual(S.allLine(c, '   ').reason, 'empty');
  c.blockedWords = 'ass';
  assert.strictEqual(S.allLine(c, 'you ass').reason, 'blocked-word');
  assert.strictEqual(S.allLine(c, 'nice bass').ok, true);
  assert.strictEqual(S.allLine(Object.assign(c, { allIgnoreLinks: false }), 'a.com hi').ok, true);
  assert.ok(S.allLine(base(), 'x'.repeat(500)).text.length <= 100);
});

test('ignored names', () => {
  const c = base();
  assert.ok(S.isIgnoredName(c, 'Nightbot'));
  assert.ok(S.isIgnoredName(c, '@streamelements'));
  assert.ok(!S.isIgnoredName(c, 'paul'));
  assert.ok(!S.isIgnoredName(c, ''));
});

test('pickAllVoice: modes', () => {
  const c = base();
  assert.strictEqual(S.pickAllVoice(c, 'k', {}).voice, 'v1');
  c.allVoiceMode = 'random';
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(S.pickAllVoice(c, 'k', {}).voice);
  assert.deepStrictEqual([...seen].sort(), ['a', 'b', 'c']);
  c.allVoiceMode = 'perChatter';
  assert.deepStrictEqual(S.pickAllVoice(c, 'k', { k: 'b' }), { voice: 'b' });
  const as = {};
  ['t:1', 't:2', 't:3'].forEach((k) => { const p = S.pickAllVoice(c, k, as); as[k] = p.assign; });
  assert.deepStrictEqual(Object.values(as).sort(), ['a', 'b', 'c']); // spread over the pool
  assert.ok(S.pickAllVoice(c, 'k', { k: 'gone' }).assign); // voice left the pool: new pick
  c.allVoices = [];
  assert.strictEqual(S.pickAllVoice(c, 'k', {}).voice, 'v1');
});

test('names and payloads', () => {
  const c = base();
  assert.strictEqual(S.spokenName('xX_paul_1234'), 'xX paul');
  assert.strictEqual(S.spokenName('@Anna'), 'Anna');
  c.allSayName = true;
  assert.ok(S.needsName(c, 'k', null, 1000));
  assert.ok(!S.needsName(c, 'k', { key: 'k', at: 900 }, 1000));
  assert.ok(S.needsName(c, 'k', { key: 'z', at: 900 }, 1000));
  assert.ok(S.needsName(c, 'k', { key: 'k', at: 0 }, 200000));
  const plain = S.buildChatPayload(c, 'hi', 'a', { user: 'Paul', platform: 'twitch' }, false);
  assert.strictEqual(plain.kind, 'chat'); assert.strictEqual(plain.text, 'hi'); assert.ok(!plain.intro); assert.strictEqual(plain.maxQueue, 5);
  const same = S.buildChatPayload(c, 'hi', 'a', { user: 'Paul' }, true);
  assert.strictEqual(same.text, 'Paul says: hi'); assert.ok(!same.intro);
  c.allNameVoice = 'narrator';
  const two = S.buildChatPayload(c, 'hi', 'a', { user: 'Paul' }, true);
  assert.strictEqual(two.text, 'hi'); assert.deepStrictEqual([two.intro.text, two.intro.voice], ['Paul says', 'narrator']);
});

test('relay gate', () => {
  assert.strictEqual(S.checkRelayInfo({ version: '0.0.7', protocol: 2 }).ok, true);
  assert.strictEqual(S.checkRelayInfo({ version: '0.0.6' }).ok, false);
  assert.strictEqual(S.checkRelayInfo({ version: '0.0.6' }).reason, 'old');
  assert.strictEqual(S.checkRelayInfo(null).ok, false);
  assert.match(S.relayGateMessage({ ok: false, reason: 'old', version: '0.0.6' }), /too old.*0\.0\.7/);
  assert.match(S.relayGateMessage({ ok: false, reason: 'down', error: 'no answer' }), /not running/);
  assert.strictEqual(S.relayGateMessage({ ok: true }), '');
});

test('sanitizeConfig keeps and bounds the read-all keys', () => {
  const r = S.sanitizeConfig({ readAll: true, allVoiceMode: 'bogus', maxQueue: 9999, allVoices: [{ id: 'a', name: 'A' }, { id: 'a' }, {}] }).config;
  assert.strictEqual(r.readAll, true); assert.strictEqual(r.allVoiceMode, 'fixed');
  assert.ok(r.maxQueue <= 100); assert.strictEqual(r.allVoices.length, 1);
});

test('same-voice name line never exceeds the relay limit of 2000 characters', () => {
  const c = Object.assign(base(), { allSayName: true, maxChars: 2000 });
  const p = S.buildChatPayload(c, 'x'.repeat(2000), 'a', { user: 'Paul' }, true);
  assert.ok(p.text.length <= 2000);
});

// ---- speech engine: VoiceStudio or SimpleVoice OBS (0.2.0) -------------------------------------
const svCfg = { engine: 'simplevoice', relayUrl: 'http://127.0.0.1:8787/', voiceStudioUrl: 'http://127.0.0.1:3900', model: 'tts-1-hd', format: 'mp3', speed: 1 };
const vsCfg = Object.assign({}, svCfg, { engine: 'voicestudio' });

test('engine: default is VoiceStudio, so an old saved setup behaves exactly as before', () => {
  assert.strictEqual(S.DEFAULTS.engine, 'voicestudio');
  assert.strictEqual(S.sanitizeConfig({}).config.engine, 'voicestudio');
  assert.strictEqual(S.sanitizeConfig({ engine: 'simplevoice' }).config.engine, 'simplevoice');
  assert.strictEqual(S.sanitizeConfig({ engine: 'nonsense' }).config.engine, 'voicestudio');
  assert.strictEqual(S.sanitizeConfig({ engine: 5 }).config.engine, 'voicestudio');
  assert.strictEqual(S.engineName(vsCfg), 'VoiceStudio');
  assert.strictEqual(S.engineName(svCfg), 'SimpleVoice OBS');
  assert.strictEqual(S.engineName({}), 'VoiceStudio');
});

test('engine: VoiceStudio requests are unchanged', () => {
  assert.strictEqual(S.speechBase(vsCfg), 'http://127.0.0.1:3900');
  assert.strictEqual(S.speechEndpoint(vsCfg), 'http://127.0.0.1:3900/v1/audio/speech');
  const b = S.speechBody(vsCfg, { voice: 'hazed', model: 'tts-1', speed: '1.2' }, 'hi');
  assert.deepStrictEqual(b, { model: 'tts-1', input: 'hi', voice: 'hazed', response_format: 'mp3', speed: 1.2 });
});

test('engine: SimpleVoice OBS uses the relay address, its one model and WAV, whatever was saved for VoiceStudio', () => {
  assert.strictEqual(S.speechBase(svCfg), 'http://127.0.0.1:8787');
  assert.strictEqual(S.speechEndpoint(svCfg), 'http://127.0.0.1:8787/v1/audio/speech');
  const b = S.speechBody(svCfg, { voice: 'Heart', model: 'tts-1', speed: '0.6' }, 'hi');
  assert.strictEqual(b.model, 'omnivoice');
  assert.strictEqual(b.response_format, 'wav');
  assert.strictEqual(b.voice, 'Heart');
  assert.strictEqual(b.speed, 0.6); // the extension does not clamp: SimpleVoice OBS raises it for imported voices itself
  const p = S.buildPayload(svCfg, { mapping: { voice: 'Heart', speed: '' }, spoken: 'hi', command: 'heart' }, {});
  assert.strictEqual(p.endpoint, 'http://127.0.0.1:8787/v1/audio/speech');
  assert.strictEqual(p.model, 'omnivoice');
  assert.strictEqual(p.format, 'wav');
  // chat lines and the "Paul says" part use the same engine
  const chat = S.buildChatPayload(Object.assign({}, svCfg, { allNameVoice: 'Bella', allSayName: true }), 'hello', 'Heart', { user: 'Paul' }, true);
  assert.strictEqual(chat.endpoint, 'http://127.0.0.1:8787/v1/audio/speech');
  assert.strictEqual(chat.model, 'omnivoice');
  assert.strictEqual(chat.intro.model, 'omnivoice');
});

test('engine: the choice survives export and import; old files without it mean VoiceStudio', () => {
  const doc = S.buildExport(Object.assign({}, S.DEFAULTS, { engine: 'simplevoice', overlayId: 'abcdefgh1234' }), '0.2.0');
  assert.strictEqual(S.parseImport(JSON.stringify(doc), 'x').config.engine, 'simplevoice');
  const old = S.parseImport(JSON.stringify({ app: 'VoiceStudio OBS Connector', kind: 'settings', format: 1, settings: { mappings: [] } }), 'keepkeepkeep');
  assert.strictEqual(old.ok, true);
  assert.strictEqual(old.config.engine, 'voicestudio');
  assert.strictEqual(S.parseImport(JSON.stringify({ app: 'Something else', kind: 'settings', format: 1, settings: {} })).ok, false);
});

test('engine: gate messages name the right program and download page', () => {
  assert.match(S.relayGateMessage({ ok: false, reason: 'down', error: 'connection refused', engine: 'simplevoice' }), /SimpleVoice OBS is not running/);
  assert.match(S.relayGateMessage({ ok: false, reason: 'old', engine: 'simplevoice' }), /1\.0\.0 or newer/);
  assert.match(S.relayGateMessage({ ok: false, reason: 'down', error: 'x' }), /This extension needs relay 0\.0\.7/);
  assert.strictEqual(S.relayPage('simplevoice'), 'https://github.com/eikira/SimpleVoice-OBS/releases/latest');
  assert.strictEqual(S.relayPage('voicestudio'), S.RELAY_RELEASES_PAGE);
  assert.strictEqual(S.relayGateMessage({ ok: true }), '');
});

// A fake fetch: `servers` maps a base address to what answers there.
function fakeFetch(servers) {
  return function (url) {
    const base = Object.keys(servers).find((b) => url.indexOf(b + '/') === 0);
    const s = base && servers[base];
    if (!s) return Promise.reject(new Error('connection refused'));
    const path = base === VSA ? '/health' : '/v1/models'; // VoiceStudio is asked /health, SimpleVoice OBS /v1/models
    if (url !== base + path) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: s.ok !== false, status: s.ok === false ? 404 : 200, json: () => (s.badJson ? Promise.reject(new Error('x')) : Promise.resolve(s.body)) });
  };
}
const flags = (p) => p.then((r) => ({ simplevoice: r.simplevoice, voicestudio: r.voicestudio }));
const SVA = 'http://127.0.0.1:8787', VSA = 'http://127.0.0.1:3900';
const models = { object: 'list', data: [{ id: 'omnivoice' }] };
const health = { status: 'ok', device: 'cuda', engine: 'omnivoice', version: '1.2.3' };

test('detect: finds which program answers', async () => {
  const cfg = { relayUrl: SVA + '/', voiceStudioUrl: VSA };
  assert.deepStrictEqual(await flags(S.probeEngines(fakeFetch({ [SVA]: { body: models } }), cfg, 50)), { simplevoice: true, voicestudio: false });
  assert.deepStrictEqual(await flags(S.probeEngines(fakeFetch({ [VSA]: { body: health } }), cfg, 50)), { simplevoice: false, voicestudio: true });
  assert.deepStrictEqual(await flags(S.probeEngines(fakeFetch({ [SVA]: { body: models }, [VSA]: { body: health } }), cfg, 50)), { simplevoice: true, voicestudio: true });
  assert.deepStrictEqual(await flags(S.probeEngines(fakeFetch({}), cfg, 50)), { simplevoice: false, voicestudio: false });
});

test('detect: the standalone relay (no /v1/models) and broken answers do not count as SimpleVoice OBS', async () => {
  const cfg = { relayUrl: SVA, voiceStudioUrl: VSA };
  assert.deepStrictEqual(await flags(S.probeEngines(fakeFetch({ [SVA]: { ok: false } }), cfg, 50)), { simplevoice: false, voicestudio: false });
  assert.deepStrictEqual(await flags(S.probeEngines(fakeFetch({ [SVA]: { badJson: true } }), cfg, 50)), { simplevoice: false, voicestudio: false });
  assert.deepStrictEqual(await flags(S.probeEngines(fakeFetch({ [SVA]: { body: { error: 'x' } } }), cfg, 50)), { simplevoice: false, voicestudio: false });
  assert.deepStrictEqual(await flags(S.probeEngines(fakeFetch({ [SVA]: { body: 'text' } }), cfg, 50)), { simplevoice: false, voicestudio: false });
});

test('detect: a program that never answers does not hang the check', async () => {
  const hang = () => new Promise(() => {});
  const t = Date.now();
  // AbortController cannot stop a fake that ignores it, so the real fetch is what ends it; here we only check that a refusal is fast
  const r = await flags(S.probeEngines(() => Promise.reject(new Error('refused')), { relayUrl: SVA, voiceStudioUrl: VSA }, 50));
  assert.deepStrictEqual(r, { simplevoice: false, voicestudio: false });
  assert.ok(Date.now() - t < 1000);
  void hang;
});

test('detect: the same address for both is asked once and counts as SimpleVoice OBS only', async () => {
  let calls = 0;
  const f = (u, o) => { calls++; return fakeFetch({ [SVA]: { body: models } })(u, o); };
  const r = await flags(S.probeEngines(f, { relayUrl: SVA, voiceStudioUrl: SVA + '/' }, 50));
  assert.deepStrictEqual(r, { simplevoice: true, voicestudio: false });
  assert.strictEqual(calls, 1);
});

test('detect: the choice only changes when exactly one program answers', () => {
  assert.deepStrictEqual(S.chooseEngine({ simplevoice: true, voicestudio: false }, 'voicestudio'), { engine: 'simplevoice', change: true, note: 'simplevoice' });
  assert.deepStrictEqual(S.chooseEngine({ simplevoice: true, voicestudio: false }, 'simplevoice'), { engine: 'simplevoice', change: false, note: 'simplevoice' });
  assert.deepStrictEqual(S.chooseEngine({ simplevoice: false, voicestudio: true }, 'simplevoice'), { engine: 'voicestudio', change: true, note: 'voicestudio' });
  assert.deepStrictEqual(S.chooseEngine({ simplevoice: true, voicestudio: true }, 'simplevoice'), { engine: 'simplevoice', change: false, note: 'both' });
  assert.deepStrictEqual(S.chooseEngine({ simplevoice: true, voicestudio: true }, 'voicestudio'), { engine: 'voicestudio', change: false, note: 'both' });
  assert.deepStrictEqual(S.chooseEngine({ simplevoice: false, voicestudio: false }, 'simplevoice'), { engine: 'simplevoice', change: false, note: 'none' });
  assert.deepStrictEqual(S.chooseEngine({ simplevoice: false, voicestudio: false }, 'garbage'), { engine: 'voicestudio', change: false, note: 'none' });
});

test('detect: says why nothing was found, and waits long enough for a slow start', async () => {
  const cfg = { relayUrl: SVA, voiceStudioUrl: VSA };
  const refused = await S.probeEngines(() => Promise.reject(new TypeError('Failed to fetch')), cfg, 50);
  assert.match(refused.why.simplevoice, /connection refused/);
  const notList = await S.probeEngines(fakeFetch({ [VSA]: { body: { error: 'x' } }, [SVA]: { ok: false } }), cfg, 50);
  assert.match(notList.why.voicestudio, /not with a VoiceStudio health answer/);
  assert.match(notList.why.simplevoice, /HTTP 404/);
  // a server that never answers, but honours the abort signal like a real fetch
  const hang = (u, o) => new Promise((res, rej) => { o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
  const slow = await S.probeEngines(hang, cfg, 60);
  assert.match(slow.why.voicestudio, /no answer within/);
  // a VoiceStudio that needs 3 seconds is found with the default wait (simulated with a short wait here)
  const late = (u, o) => new Promise((res, rej) => {
    const t = setTimeout(() => res({ ok: true, status: 200, json: () => Promise.resolve(u.endsWith('/health') ? health : { data: [] }) }), 150);
    o.signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  });
  assert.strictEqual((await S.probeEngines(late, cfg, 1000)).voicestudio, true);
  assert.strictEqual((await S.probeEngines(late, cfg, 50)).voicestudio, false);
});

test('detect: the request is as plain as the Load buttons (no extra options besides the abort signal)', async () => {
  const seen = [];
  const f = (u, o) => { seen.push(Object.keys(o).sort().join(',')); return Promise.reject(new Error('x')); };
  await S.probeEngines(f, { relayUrl: SVA, voiceStudioUrl: VSA }, 50);
  assert.deepStrictEqual(seen, ['signal', 'signal']);
});

test('detect: VoiceStudio is asked /health (never the slow /v1/models) and a starting VoiceStudio is explained', async () => {
  const urls = [];
  const f = (u) => { urls.push(u); return u.indexOf(VSA) === 0 ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ status: 'starting' }) }) : Promise.reject(new Error('x')); };
  const r = await S.probeEngines(f, { relayUrl: SVA, voiceStudioUrl: VSA }, 50);
  assert.deepStrictEqual(urls.sort(), [VSA + '/health', SVA + '/v1/models']);
  assert.strictEqual(r.voicestudio, false);
  assert.match(r.why.voicestudio, /still starting/);
  assert.strictEqual((await S.probeEngines(fakeFetch({ [VSA]: { body: { status: 'ok' } } }), { relayUrl: SVA, voiceStudioUrl: VSA }, 50)).voicestudio, false);
});

// ---- each program keeps its own setup (sections 2, 3 and 4) ----
const mk = (c, v) => ({ command: c, voice: v, voiceName: '', speed: '', model: '' });

test('profiles: a config made before two setups existed becomes the setup of the selected program', () => {
  const a = S.completeProfiles({ engine: 'voicestudio', mappings: [mk('a', 'v1')], model: 'tts-1' });
  assert.deepStrictEqual(a.profiles.voicestudio.mappings, [mk('a', 'v1')]);
  assert.strictEqual(a.profiles.voicestudio.model, 'tts-1');
  assert.deepStrictEqual(a.profiles.simplevoice.mappings, []);
  const b = S.completeProfiles({ engine: 'simplevoice', mappings: [mk('b', 'v2')] });
  assert.deepStrictEqual(b.profiles.simplevoice.mappings, [mk('b', 'v2')]);
  assert.deepStrictEqual(b.profiles.voicestudio.mappings, []);
  // no engine at all (0.1.1) = VoiceStudio
  assert.deepStrictEqual(S.completeProfiles({ mappings: [mk('c', 'v3')] }).profiles.voicestudio.mappings, [mk('c', 'v3')]);
});

test('profiles: the program in use always comes from the flat fields, the other one is kept as it was', () => {
  const stored = { engine: 'simplevoice', mappings: [mk('new', 'x')], profiles: { simplevoice: { mappings: [mk('stale', 's')] }, voicestudio: { mappings: [mk('vs', 'y')], readAll: true } } };
  const c = S.completeProfiles(stored);
  assert.deepStrictEqual(c.profiles.simplevoice.mappings, [mk('new', 'x')]);
  assert.deepStrictEqual(c.profiles.voicestudio.mappings, [mk('vs', 'y')]);
  assert.strictEqual(c.profiles.voicestudio.readAll, true);
  assert.strictEqual(c.profiles.voicestudio.maxQueue, S.DEFAULTS.maxQueue); // missing keys get defaults
  // the input is not changed
  assert.deepStrictEqual(stored.profiles.simplevoice.mappings, [mk('stale', 's')]);
});

test('profiles: export and import keep both setups apart', () => {
  const cfg = S.completeProfiles(Object.assign({}, S.DEFAULTS, { engine: 'simplevoice', overlayId: 'abcdefgh1234', mappings: [mk('sv', 'sarge')], allVoice: 'sarge' }));
  cfg.profiles.voicestudio.mappings = [mk('vs', 'alloy')];
  cfg.profiles.voicestudio.model = 'tts-1';
  const r = S.parseImport(JSON.stringify(S.buildExport(cfg, '0.2.0')), 'x');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.config.engine, 'simplevoice');
  assert.deepStrictEqual(r.config.mappings, [mk('sv', 'sarge')]);
  assert.deepStrictEqual(r.config.profiles.simplevoice.mappings, [mk('sv', 'sarge')]);
  assert.deepStrictEqual(r.config.profiles.voicestudio.mappings, [mk('vs', 'alloy')]);
  assert.strictEqual(r.config.profiles.voicestudio.model, 'tts-1');
  assert.strictEqual(r.config.profiles.simplevoice.allVoice, 'sarge');
  assert.strictEqual(r.config.profiles.voicestudio.allVoice, '');
});

test('profiles: an old export file (flat, format 1, old app name) fills the selected program only', () => {
  const doc = { app: 'VoiceStudio OBS Connector', kind: 'settings', format: 1, settings: { mappings: [mk('old', 'v')], model: 'tts-1' } };
  const r = S.parseImport(JSON.stringify(doc), 'abcdefgh1234');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.config.profiles.voicestudio.mappings, [mk('old', 'v')]);
  assert.deepStrictEqual(r.config.profiles.simplevoice.mappings, []);
});

test('profiles: broken data in the other setup is cleaned, not trusted', () => {
  const r = S.sanitizeConfig({ engine: 'voicestudio', profiles: { simplevoice: { mappings: [{ command: 'toolongcommand', voice: 'v' }, mk('ok', 'v')], speed: 99, allVoiceMode: 'x' } } }, 'abcdefgh1234');
  assert.deepStrictEqual(r.config.profiles.simplevoice.mappings, [mk('ok', 'v')]);
  assert.strictEqual(r.config.profiles.simplevoice.speed, 1.5);
  assert.strictEqual(r.config.profiles.simplevoice.allVoiceMode, 'fixed');
  assert.ok(r.warnings.some((w) => /SimpleVoice OBS/.test(w)));
});

test('voices: only voices that exist in VoiceStudio are offered (the 13 fixed names are not voices)', () => {
  const list = [
    { voice_id: 'alloy', id: 'alloy', name: 'Alloy', type: 'openai_alias' },
    { voice_id: 'nova', id: 'nova', name: 'Nova', type: 'openai_alias' },
    { voice_id: 'demo0001', id: 'demo0001', name: 'tits', type: 'profile' },
    { voice_id: 'p2', id: 'p2', name: 'Mao', type: 'profile' }];
  assert.deepStrictEqual(S.realVoices(list).map((v) => v.id), ['demo0001', 'p2']);
  // SimpleVoice OBS (no type), plain strings and an older VoiceStudio without types are kept
  assert.strictEqual(S.realVoices([{ id: 'Heart', name: 'Heart' }, 'x', { id: 'y' }]).length, 3);
  assert.deepStrictEqual(S.realVoices(null), []);
});
