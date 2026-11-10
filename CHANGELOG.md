# Changelog

Short overview of what changed. Versions before 0.0.5 were private test versions.

## 0.1.1
- **Read all chat (optional):** Settings -> 5. Read all chat. Every line is read, not only commands. One fixed voice, a random voice per message, or a random voice per chatter kept for the session; you choose which voices the randomizer may use.
- **"Paul says: ..."** option, with an optional separate voice for the "Paul says" part and an option to skip the name when the same chatter writes again.
- Not read: links, emote-only and emoji-only lines, `!` lines that are not commands, ignored names (bots) and blocked words. Cooldown per chatter and a limit for waiting chat lines.
- **Needs relay 0.0.7 or newer.** With a missing or older relay the extension refuses to speak (also the test buttons), shows a red notice in the popup and settings, and a red "!" on the icon.

## 0.1.0
- **Backup:** Settings -> 7. Backup. "Export settings to a file" saves all your settings (commands, voices, speed, models, addresses, options and your OBS URL ID) in one small file; "Import settings from a file" loads it back (check, then Save). Useful when the extension folder was deleted, or on a new computer.
- The zip now unpacks to a folder called `VoiceStudio-OBS-Connector` (no version number), so an update can simply replace the old folder.

## 0.0.9
- **Update check:** once a day (and when Chrome starts) the extension asks GitHub which version is the newest and shows
  "Update available" in the popup and in Settings. Nothing is installed automatically; Settings has a step-by-step "How to update".
  The check can be switched off (Settings -> 6. Updates).
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

