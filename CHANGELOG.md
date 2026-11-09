# Changelog

Short overview of what changed. Versions before 0.0.5 were private test versions.

## 0.0.9
- **Update check:** once a day (and when Chrome starts) the extension asks GitHub which version is the newest and shows
  "Update available" in the popup and in Settings. Nothing is installed automatically; Settings has a step-by-step "How to update".
  The check can be switched off (Settings -> 5. Updates).
- **Settings -> "Show where this extension is installed":** opens Chrome's details page of the extension, where the folder is listed as "Source".
- **Settings -> "Open relay folder"** (needs relay 0.0.6) and the relay's version, with a notice when a newer relay exists.
- Popup: "Copy OBS URL" is now "Copy URL".

## 0.0.8
- Settings and popup link to the relay download.
- (0.0.6 and 0.0.7 are included; they were not released separately.)

## 0.0.7
- Settings: empty command field with a gray hint "command/name"; notes that VoiceStudio must be running to load voices and models; note and link about VoiceStudio models.
- Popup: "Commands/Voices".

## 0.0.6
- Chat tabs that are already open are picked up automatically (no refresh after installing or reloading).
- A message is never sent twice if two copies of the chat reader briefly overlap.

## 0.0.5
- First public release.
- Adds the free and open source notice (GPL-3.0).
- Lighter on the browser (less polling), and quick messages are sent to OBS in the order they were written.

## 0.0.4
- Relay renamed "VoiceStudio OBS Connector Relay" in messages.

## 0.0.3
- New icon. The relay became a separate download.

## 0.0.2
- Test buttons send to OBS. Rumble and Kick chat added. Popup shows what chat it is listening to.

## 0.0.1
- First test version: per-voice speed and model, voices shown by name, commands up to 8 characters with automatic `!`, default 190 characters, optional cooldown.

