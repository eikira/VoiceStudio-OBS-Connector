# AGENTS.md: VoiceStudio+SimpleVoice OBS Connector (Chrome extension)

Notes for AI coding assistants and new contributors. Read this before changing code.
User-facing docs are in README.md. Version history is in CHANGELOG.md.

## What this is

A Chrome (Manifest V3) extension. It watches live chat on Twitch, YouTube, Rumble and Kick
(normal page or popout), picks messages that start with a configured command (`!voice hello`),
maps each command to a voice, and makes the text spoken in OBS.

Speech itself is not made here. Two separate local programs can make it, both with an
OpenAI-compatible API (`POST /v1/audio/speech`): **VoiceStudio** (default `http://127.0.0.1:3900`, used with the standalone
VoiceStudio OBS Connector Relay) and **SimpleVoice OBS** (https://github.com/eikira/SimpleVoice-OBS, default `http://127.0.0.1:8787`;
it is the relay and the voice engine in one program). The user picks the engine in Settings -> 2 (`config.engine`).

## Names (use exactly these)

| Thing | Name |
|---|---|
| This extension (since 0.2.0) | VoiceStudio+SimpleVoice OBS Connector (before: "VoiceStudio OBS Connector") |
| GitHub repository | `eikira/VoiceStudio-SimpleVoice-OBS-Connector` (renamed from `VoiceStudio-OBS-Connector` for 0.2.0; GitHub redirects the old address; the update check reads the new one) |
| Folder inside the release zip | `VoiceStudio-SimpleVoice-OBS-Connector` (since 0.2.0; before: `VoiceStudio-OBS-Connector`). **Never rename it again**: Chrome ties the extension ID, and so the saved settings, to the folder path. The 0.1.1 -> 0.2.0 change cost a one-time Export/Import, described in the README and the release notes. |
| Release zip | `VoiceStudio-SimpleVoice-OBS-Connector-<version>.zip` |
| Standalone relay for VoiceStudio | VoiceStudio OBS Connector Relay (repo `eikira/VoiceStudio-OBS-Connector-Relay`, name kept) |
| SimpleVoice side | SimpleVoice OBS (product), SimpleVoice OBS Relay (its background program) |

## The speech engine choice (0.2.0)

- `config.engine`: `'voicestudio'` (default; also what every older saved config means) or `'simplevoice'`. In `lib/shared.js`: `speechBase(cfg)` (VoiceStudio address, or the relay address for SimpleVoice OBS),
  `speechEndpoint`, `speechBody`. With SimpleVoice OBS the body always has model `omnivoice` and format `wav` (it ignores both; a model saved for VoiceStudio must never be sent to it). Speed is sent as chosen: SimpleVoice OBS raises it to 0.8 itself for imported voices.
- **Voices (VoiceStudio):** `S.realVoices()` drops list entries whose `type` is not `profile` (VoiceStudio adds 13 `openai_alias` entries that are not voices). Entries without a type are kept (SimpleVoice OBS, older servers).
- **Two setups (0.2.0):** sections 2, 3 and 4 (`PROFILE_KEYS` in `lib/shared.js`: model, format, speed, mappings and all `all*`/read-all keys) are kept per program in `config.profiles = {voicestudio, simplevoice}`. The flat config fields always mirror the program in use (`config.engine`), so `background.js` and every helper read the flat fields and need no change. `completeProfiles(cfg)` builds `profiles`: the program in use from the flat fields, the other as stored or empty; a config without `profiles` (0.1.1, betas) becomes the setup of its `engine`. The settings page keeps the other program's setup in memory (`profiles`, `shownEngine`) and swaps it in `applyEngine(true)`. Export format 2 contains both; format 1 files still import. The per-command model column is gone from the rows (a stored `mapping.model` is kept and still sent for VoiceStudio).
- **Detect** (`probeEngines`, `chooseEngine`, button in Settings -> 2): SimpleVoice OBS is recognised by `GET <relay address>/v1/models` answering with a model list (the standalone relay answers 404); VoiceStudio by `GET <VoiceStudio address>/health` (`{"status":"ok","version":...}`; 503 `starting` while it boots). Do NOT probe VoiceStudio with `/v1/models` or `/v1/audio/voices`: they run `list_backends()` (checks every engine, seconds, in a shared worker pool, not cancelled when the client aborts), so repeated probes pile up.
  The choice changes only when exactly one answers. Both or none: unchanged. It runs by itself only on the very first start (no saved settings); an existing setup is never switched silently.
- Settings page: elements with class `vsOnly` are hidden and `svOnly` shown when `body.sv` is set (`applyEngine`). Texts that name the engine use `.engName`. After a change by the user the loaded voice list is cleared (voices belong to the other program).
- The relay gate (`relayReady`) works for both (`GET /info`, protocol >= 2; SimpleVoice OBS 1.0.0 reports protocol 2). The gate stores `engine`, so messages and download links name the right program. SimpleVoice OBS `/info` has no update information (`updateAvailable` false), so no relay update notice appears for it.
- SimpleVoice OBS lists different voices depending on its running engine (own voices on the graphics card engine, built-in voices on the processor engine). The extension does not poll for that; Settings tells the user to click Load voices again.
- Settings backup: the file `app` is now `VoiceStudio+SimpleVoice OBS Connector`; files with the old name `VoiceStudio OBS Connector` still import (`EXPORT_APP_OLD`). `EXPORT_FORMAT` stays 1 (the new key is optional).
- The version in the manifest is numeric (`0.2.0`). A beta may add `version_name` (for example `0.2.0 beta 1`); Settings and the popup show it when present. The released 0.2.0 has none.
- **Untested here (no Chrome with real programs in the sandbox):** the whole thing in real Chrome with real VoiceStudio and SimpleVoice OBS. Unit tests and a jsdom smoke test of the settings page were run.

## How the pieces fit

```
chat page --content script--> background.js (service worker) --POST /send--> Relay --SSE--> OBS Browser Source
                                                                                              |
                                                                       plays audio  <-- VoiceStudio (/v1/audio/speech)
```

- The OBS Browser Source URL is `http://127.0.0.1:<port>/overlay.html?id=<ID>`. The ID is a unique
  secret per user (8-64 chars `[A-Za-z0-9_-]`), generated by the extension.
- The relay is a separate project: https://github.com/eikira/VoiceStudio-OBS-Connector-Relay
  Its overlay page asks VoiceStudio for the audio. VoiceStudio refuses requests that come from web
  pages (it checks the Origin header). When that happens the overlay asks the relay to make the
  request instead (`POST /tts`). That is the reason the relay exists.

## Files

| Path | Role |
|---|---|
| `manifest.json` | MV3 manifest. Permissions are only `storage` and `scripting`. Host permissions: the 4 chat sites, `127.0.0.1`, `localhost`. |
| `background.js` | Service worker. Loads config, applies command to voice mapping, de-duplicates, queues messages in order, sends them to the relay, injects content scripts into already-open tabs on install/update, records chat status, runs the update check (`checkForUpdate`). |
| `content/common.js` | `VSCapture`: shared capture logic (MutationObserver, history grace period, de-duplication, heartbeat). |
| `content/twitch.js` `youtube.js` `rumble.js` `kick.js` | One file per site. Only site-specific selectors and parsing. |
| `lib/shared.js` | Pure functions (command parsing, validation, URL building, version comparison `newerThan`) and the GitHub URLs. Unit tested. |
| `options.html/js`, `popup.html/js`, `ui.css` | Settings page and toolbar popup. |
| `tests/shared.test.js` | Unit tests. Run with `node --test` (Node 18+). Do not pass a directory. |

## Read all chat and the relay gate (0.1.1)

- **Relay gate (hard requirement):** `background.js` `relayReady()` calls the relay's `GET /info` (cached ~15 s when fine, ~3 s when blocked) and accepts only `protocol >= 2` (relay 0.0.7+). Otherwise it drops **everything** (commands, chat lines, the Send test button, and the row Test in settings), sets the red "!" badge and stores `relayGate` in `chrome.storage.session`; popup and settings show a red banner. Do not add a way around it. Raise `RELAY_MIN_VERSION`/`RELAY_MIN_PROTOCOL` in `lib/shared.js` whenever a feature needs a newer relay.
- **Read all:** `content/common.js` forwards non-`!` lines only while `config.readAll` is on (it mirrors the setting through `storage.onChanged`, so nothing wakes the service worker when it is off). `handleChat` first tries the commands, then `allLine()` (filters), `pickAllVoice()`, `needsName()`, `buildChatPayload()`. Pure logic lives in `lib/shared.js` and is unit tested.
- Chat payloads carry `kind:'chat'` and `maxQueue`; with a separate name voice they carry `intro:{text,voice,model,speed}` and the relay/overlay requests both clips, waits for both, plays intro then message. Per-chatter voices live in `chrome.storage.session` (`chatterVoices_voicestudio` / `chatterVoices_simplevoice`, one list per program because voice ids differ; capped at 5000).
- New config keys must be added to `DEFAULTS`, `sanitizeConfig`, `fillForm`/`collect` in `options.js` and the settings backup.

## Backup: export / import of settings

- Settings -> 7. Backup. Pure logic is in `lib/shared.js` (`buildExport`, `parseImport`, `sanitizeConfig`, unit tested); the buttons are in `options.js`.
- The file is JSON: `{ app: "VoiceStudio+SimpleVoice OBS Connector" (older files: "VoiceStudio OBS Connector", still accepted), kind: "settings", format: 2 (1 = before two setups; still accepted), extensionVersion, exportedAt, settings: {...} }`. `settings` is the whole config (including the OBS ID so the OBS URL survives a reinstall).
  Never put stats, chat data, the update cache or anything else in it.
- **Treat the file as untrusted input.** Import goes through `sanitizeConfig`: unknown keys dropped, URLs must be http(s), speeds/limits clamped, commands checked like the Save button does, at most 200 commands, files over 512 KB refused. The values are only ever put into form fields as text.
- Import fills the page and then calls `save()` itself (0.2.0). It must, because the background script and the content scripts only read the saved settings: a page that is only filled in does nothing (Test says "Add a command and voice first", read-all chat stays off). If validation fails, the page keeps the values and says they are not saved. Chrome may ask for permission for non-local addresses at that point.
- When a new setting is added to `DEFAULTS`: add it to `sanitizeConfig`, the export test and `fillForm`/`collect` in `options.js`. Older files without the key must still import (the default is used).
  Raise `EXPORT_FORMAT` only for an incompatible change; newer formats are refused with a message, older ones must keep working.

## Updates (manual on purpose)

- `checkForUpdate()` in `background.js` asks `https://api.github.com/repos/eikira/VoiceStudio-SimpleVoice-OBS-Connector/releases/latest` for the newest tag
  (when Chrome starts, on install, and when the popup or Settings opens; at most once per 24 h, 30 min retry after an error; forced by "Check for updates now").
  The result is stored in `chrome.storage.local` as `update` = `{checkedAt, latest, error}`. The popup and Settings only read it.
- It can be switched off (`config.updateCheck`, default true). A forced check still works when it is off.
- **No new permission:** the request relies on GitHub's API answering with a CORS `*` header. If GitHub ever stops doing that, add
  `https://api.github.com/*` to `host_permissions` (Chrome will then ask users to approve it).
- Never download or install anything from the check. Settings has a written "How to update" guide and the button **Show where this extension is installed**
  (`chrome.tabs.create` to `chrome://extensions/?id=<id>`; Chrome shows the folder as "Source"). An extension cannot read its own folder path, and an updated extension cannot replace its own files.
- Replacing the files in the **same folder** keeps the extension ID and so the user's settings; loading another folder gives a new ID and empty settings. Keep saying this in the docs.
- Settings also reads the relay's `GET /info` (version, newer relay available) and has an **Open relay folder** button that calls the relay's `POST /open-folder`
  with the header `X-Relay-Open: 1`. Extension pages may send that header; ordinary web pages cannot (the relay refuses the preflight). Do not weaken that.

## Design rules (keep these)

- **Small and fast.** Plain JavaScript, no libraries, no build step, no bundler. Do not add dependencies.
- **Needs relay 0.0.7+** (VoiceStudio) or **SimpleVoice OBS 1.0.0+** (see the relay gate above).
- **Minimal permissions.** Do not add permissions or host permissions without a strong reason.
- **No network calls except** the relay and VoiceStudio addresses the user configured, and the once-a-day update check to GitHub (which must stay switchable and documented in the README privacy section).
- **GPL-3.0.** Keep the license, the copyright line (eikira) and the credit to Social Stream Ninja
  (inspiration only; no SSN code is included. The chat selectors were found by studying how chat pages are built).
  Do not copy code from other projects without checking their license.
- Commands are at most 8 characters, the `!` is added automatically. Per-voice speed is 0.5 to 1.5.
- Keep user-facing texts short and plain.

## Capture logic you must not break

These were fixed after real bugs. Test them again after any change in `content/`.

- **History grace:** messages already present when the page loads (first ~3 s) are ignored, so old chat is not read aloud.
- **De-duplication:** by message id, and by `user|text` within 3 s. The background worker also guards against duplicates.
- **Kick reuses chat rows** and changes their content. Each row keeps a signature (`elSig` WeakMap, `watchInside`) so a changed row counts as new, but an unchanged one does not.
- **One capture per page:** a newer injected copy of the script takes over from an older one (`data-vs-capture` token on the document element). This matters because the extension injects itself into open tabs on install/update.
- **Order:** messages are handled one after another (`chatQueue` in `background.js`). Parallel handling reordered them once.
- **YouTube** chat runs only inside the `/live_chat` frame (also in the embedded iframe on the watch page).
- **Status heartbeat:** every 20 s each chat tab reports to `chrome.storage.session.chatTabs`. The popup treats entries younger than 45 s as live.

## Adding a new chat site

1. Add a content script `content/<site>.js` that finds the chat container and message rows and calls `VSCapture.start(...)` from `common.js`. Look at `kick.js` and `twitch.js` for the pattern.
2. Add the site to `manifest.json` (`host_permissions` and `content_scripts`, with `all_frames` if the chat is in an iframe).
3. Nothing to add in `background.js`: `injectIntoOpenTabs()` reads the content scripts from the manifest, so open tabs of the new site are handled automatically.
4. Test with a real live chat in a normal tab and in a popout: a normal message, a command message, a repeated message, reload of the page, and two tabs open at once.
5. Update README.md (supported sites), CHANGELOG.md and the version in `manifest.json`.

## Testing

- Unit tests: `node --test`.
- Real behavior must be checked in Chrome: load the `extension/` folder with *Load unpacked*. Reload the extension after edits.
- Before this project was published, a private end-to-end suite (headless Chrome with fake chat pages and a mock VoiceStudio that refuses web-page requests) checked the capture logic. It is **not** part of this repository. Do not assume it exists.

## Releasing

Version numbers go in steps of ten: 0.0.9, 0.1.0, 0.1.1 ... 0.1.9, 0.2.0 (the update check compares the numbers part by part, so this is fine). Raise the version in `manifest.json` (and use the same number in the zip name), add a short entry to `CHANGELOG.md`, zip the contents of `extension/`
as `VoiceStudio-SimpleVoice-OBS-Connector-<version>.zip`. **Inside the zip the folder is always called `VoiceStudio-SimpleVoice-OBS-Connector` (no version number)**, so an update replaces the old folder and keeps the same path, extension ID and user settings. Attach it to a new GitHub release with a matching tag.
The changelog starts at 0.0.5, the first public version.
