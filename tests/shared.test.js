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
  assert.strictEqual(doc.app, 'VoiceStudio OBS Connector');
  assert.strictEqual(doc.format, 1);
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
