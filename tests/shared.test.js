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
