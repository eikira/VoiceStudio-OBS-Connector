# VoiceStudio+SimpleVoice OBS Connector

[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)

A Chrome extension that **reads stream chat commands aloud with your own voices**, through OBS. The speech is made either by **[VoiceStudio](https://voicestudio.sh)** or by **[SimpleVoice OBS](https://github.com/eikira/SimpleVoice-OBS)**: you choose in Settings, and **Detect** can find out which one is running.

> **Version 0.2.0** adds SimpleVoice OBS and the engine choice. Before 0.2.0 the extension was called "VoiceStudio OBS Connector". **Coming from 0.1.1?** See [Moving from 0.1.1](#moving-from-011) (one-time step).

    chat:  !voice hello everyone            ->  the voice linked to !voice says "hello everyone"
    chat:  !voice2 welcome to the stream    ->  a different voice linked to !voice2 says it

Viewers type a command and some text. The extension picks up only messages that start with one of
your commands, sends the text to VoiceStudio or SimpleVoice OBS (which run on your own
computer), and the voice is played in your stream through an OBS Browser Source. Every command can have
its own voice, speed and model. Optionally it can also **read every chat line** (see below); by default everything else in chat is ignored.

Works like the TTS of Social Stream Ninja, but with **any number of VoiceStudio voices, each on its own
command**, and without the rest of SSN.

## What you need

**This extension** (Chrome), and one of these two setups:

**A. With VoiceStudio** (Windows, macOS, Linux)
1. **The relay, version 0.0.7 or newer**: a small background program that carries the speech to OBS.
   **The extension refuses to work without it** (an older or missing relay gives a red notice in the popup and a red "!" on the icon; nothing is spoken).
   **[Download the VoiceStudio OBS Connector Relay](https://github.com/eikira/VoiceStudio-OBS-Connector-Relay/releases/latest)**.
2. **[VoiceStudio](https://voicestudio.sh)** running with its OpenAI-compatible speech API (default `http://127.0.0.1:3900`).

**B. With SimpleVoice OBS** (Windows)
1. **[SimpleVoice OBS](https://github.com/eikira/SimpleVoice-OBS/releases/latest), version 1.0.0 or newer.** It is the relay and the voice engine in one program, so nothing else is needed.
   It runs on the relay address (default `http://127.0.0.1:8787`).

## Requirements

| | |
|---|---|
| **Browser** | Google Chrome (other Chromium browsers such as Edge or Brave should work but are untested) |
| **OBS Studio** | any recent version, with a Browser Source (included in OBS) |
| **VoiceStudio** | running locally or on another computer in your network (setup A) |
| **Relay** | setup A: version **0.0.7 or newer**, [VoiceStudio OBS Connector Relay](https://github.com/eikira/VoiceStudio-OBS-Connector-Relay) on the computer that runs OBS |
| **SimpleVoice OBS** | setup B: version **1.0.0 or newer**, on the computer that runs OBS |
| **Chat** | Twitch, YouTube, Rumble or Kick chat open in your browser (normal page or popout) |

## Install

1. Download **`VoiceStudio-SimpleVoice-OBS-Connector-<version>.zip`** from the [latest release](https://github.com/eikira/VoiceStudio-SimpleVoice-OBS-Connector/releases/latest) and unzip it. You get a folder named `VoiceStudio-SimpleVoice-OBS-Connector` (the same name for every version, so an update keeps your settings). Put it somewhere permanent, for example in Documents: Chrome uses the files in that folder directly, so do not delete or move it.
2. Chrome -> `chrome://extensions` -> turn on **Developer mode** (top right) -> **Load unpacked** ->
   choose the unzipped folder (the one that contains `manifest.json`).
3. Install and start the **[relay](https://github.com/eikira/VoiceStudio-OBS-Connector-Relay/releases/latest)** (setup A) or **[SimpleVoice OBS](https://github.com/eikira/SimpleVoice-OBS/releases/latest)** (setup B).

The extension is not on the Chrome Web Store, so it is installed this way. **Remember the folder you unzipped it to**:
you need it again for updates (Settings can show you where it is).

## Moving from 0.1.1

Version 0.2.0 comes in a folder with a new name (`VoiceStudio-SimpleVoice-OBS-Connector`). Chrome sees a new folder as a **new extension**, so your settings do not come along by themselves. Once:

1. In the old extension (0.1.1): **Settings -> 7. Backup -> Export settings**. Keep the file.
2. Download and unzip the new version (see Install). On `chrome://extensions` remove the old extension and **Load unpacked** the new folder.
3. **Settings -> 7. Backup -> Import settings from a file**. It is saved right away. Your commands become the **VoiceStudio** setup; SimpleVoice OBS starts empty.
4. Click **Load voices** in section 3.

From 0.2.0 on, updates keep the same folder and need none of this (see Updating).

## Updating

The extension tells you when a new version is out ("Update available" in the popup and in Settings), but **nothing is
installed automatically**. You update by hand:

1. Download the new zip from the [latest release](https://github.com/eikira/VoiceStudio-SimpleVoice-OBS-Connector/releases/latest).
2. Open the extension's **Settings** (popup -> Settings), scroll to **6. Updates** and click **Show where this extension is installed**.
   Chrome opens the extension's details page. The folder is listed there as **Source** (the full path, on Windows, macOS and Linux).
   Without the button: type `chrome://extensions` in the address bar, turn on *Developer mode*, click *Details*, look at *Source*.
3. Unzip the new download so that its `VoiceStudio-SimpleVoice-OBS-Connector` folder **replaces the old one**: extract it into the folder that *contains* the old `VoiceStudio-SimpleVoice-OBS-Connector` folder and choose *Replace*. Or copy **everything inside** the new folder into the old one and overwrite the old files. Keep the same folder: a different folder
   counts as a new extension and your settings would not come with it.
4. On `chrome://extensions` click the **reload** icon (circular arrow) of the extension. Your settings are kept.

Your settings are kept as long as you keep the same folder. To be safe, **export them first** (see "Backup and restore" below).

The relay and SimpleVoice OBS are updated separately (see the relay's [README](https://github.com/eikira/VoiceStudio-OBS-Connector-Relay#updating) or the [SimpleVoice OBS README](https://github.com/eikira/SimpleVoice-OBS#readme)).
Settings shows the relay's version and tells you if a newer one exists, and has an **Open relay folder** button.

## Set up

1. Click the extension icon -> **Settings**.
2. **Speech engine:** choose **VoiceStudio** or **SimpleVoice OBS**, or click **Detect** (it selects the one that is running; if both or neither answer, your choice stays).
   - VoiceStudio: **address** default `http://127.0.0.1:3900` (this computer). For VoiceStudio on another
     computer enter its address. VoiceStudio must be running to load models and voices.
     **Default model, format and speed**: "Load" asks VoiceStudio for its models.
   - SimpleVoice OBS: no address, no model, no format (it has one model and answers with WAV). Only the default speed.
     Imported voices cannot go slower than 0.8 (SimpleVoice OBS raises it for you); built-in voices go down to 0.5.
3. **Commands and voices**: "Load voices from ..." (the chosen engine), add a command (up to 8 characters, the `!`
   is added for you), pick the voice by name. Speed (and, for VoiceStudio, model) can be set per voice. **Test** plays a
   sample in OBS. After you change the engine, load the voices again: they come from the other program.
   SimpleVoice OBS lists your own voices while its graphics card engine runs and the built-in voices while its processor engine runs; load again after switching.
4. **Save**.
5. **OBS:** Sources -> + -> **Browser** -> paste the **OBS Browser Source URL** from the settings page.
   Do not tick "Shutdown source when not visible".
6. Open your chat. Chat tabs that are already open are picked up automatically. The popup's **Chat** line shows whether it is listening.
7. Popup -> **Send test**.

Limits: default 190 characters per message; optional cooldown per viewer (after a command is accepted,
more commands from that viewer are ignored for N seconds).

## Read all chat (optional)

Settings -> **4. Read all chat**. When on, every chat line is read aloud, not only commands. Lines that start with `!` stay commands.

- **Voices:** one fixed voice, a **random voice for every message**, or a **random voice per chatter** that each chatter keeps for the session (until you close the browser or press "Reset chatter voices"). You tick which voices the randomizer may use.
- **"Paul says: ..."**: optional. The name is made easier to say (`xX_paul_1234` becomes "xX paul"). You can give "Paul says" its **own voice**; the relay then prepares both parts and plays them one after the other. Optionally the name is skipped when the same chatter writes again right away.
- **Not read:** links, lines of only emotes or emoji, `!` lines that are not your commands (switchable), names on the **ignored names** list (Nightbot, StreamElements and other bots are listed by default), and lines containing a **blocked word**.
- **Protection:** a cooldown per chatter and a limit of waiting lines (the oldest are dropped). Commands are never dropped.

Everything typed in your chat is spoken on your stream: use blocked words and ignored names, and keep your platform's rules in mind.

## Backup and restore your settings

Chrome stores the settings together with the extension. If you delete or move the extension folder, or load it from a new folder, the settings are gone.
So: **Settings -> 7. Backup -> Export settings to a file**. You get one small file with everything: commands, voices, speed and model per command,
addresses, options and the ID of your OBS URL.

To restore (after reinstalling, on a new computer or browser): **Settings -> 7. Backup -> Import settings from a file**, the settings are saved right away; then click **Load voices** in section 3.
Because the OBS ID is in the file, your old OBS Browser Source URL keeps working. Export saves what you last saved. Keep the file private (it contains your addresses and OBS ID).

## Privacy

- Your chat, commands and settings are not sent to any server of mine or anyone else's. The extension talks to your relay and
  your VoiceStudio (or SimpleVoice OBS).
- **One exception, the update check:** when Chrome starts and when you open the popup or Settings (at most once a day) the extension asks
  `api.github.com` which release is the newest. That is a public page; nothing about you is sent. GitHub sees your IP address like any
  website you visit. You can switch it off in Settings -> 6. Updates.
- Only chat messages that start with `!` are looked at further, unless you switch on "Read all chat". Settings are stored in Chrome on your computer.
- It needs access to the supported chat sites (to read chat) and to `127.0.0.1` / `localhost`
  (relay, SimpleVoice OBS and VoiceStudio). Another VoiceStudio address is only contacted after you allow it.

## Troubleshooting

- **Red notice "NOT WORKING" in the popup:** the relay (setup A) or SimpleVoice OBS (setup B) is missing, not running, or too old. Install or update the [relay](https://github.com/eikira/VoiceStudio-OBS-Connector-Relay/releases/latest) (0.0.7+) or [SimpleVoice OBS](https://github.com/eikira/SimpleVoice-OBS/releases/latest) (1.0.0+) and start it; the notice goes away by itself.
- **Voices missing or "voice does not exist" with SimpleVoice OBS:** its voice list depends on the running engine (your own voices: graphics card engine; built-in voices: processor engine). Click Load voices again.
- **Detect says "Both answer":** both programs are running; pick the one you want in the list.
- **Popup says Relay "not reachable":** start the relay. The address in settings must match its port (default 8787).
- **Popup Chat line says "not detected":** open your chat page; if it is already open, refresh it (F5).
- **Silence in OBS:** the Browser Source must show "connected" (popup: OBS page). Keep "Control audio via OBS" in mind for the mixer.
- **"Open relay folder" does nothing:** the relay must be running and be version 0.0.6 or newer.
- **A chat site changed its layout:** open an [issue](https://github.com/eikira/VoiceStudio-SimpleVoice-OBS-Connector/issues) and say which site.

## Develop

Plain JavaScript, no build step, no libraries. Load the `extension/` folder with *Load unpacked*.
Unit tests: `node --test` (Node 18+, no installs).

## Support the project

This project is free and always will be. If it is useful to you and you would like to say thanks, you can:

- Follow the channel and like the videos. It costs nothing and helps a lot.
- Donate via [Ko-fi](https://ko-fi.com/V7V6175QA3), [Streamlabs](https://switzerlandplayit.com/tips) or [PayPal](https://www.paypal.com/donate?business=switzerland.playit@gmail.com&currency_code=USD)
- Send something from the wishlists: [Amazon](https://www.amazon.de/hz/wishlist/ls/3HC3NSU1P8V0Q?ref_=wl_share) or [Steam](https://store.steampowered.com/wishlist/id/eikira/)

Donations are optional and do not unlock anything. Every feature stays free for everybody.

## Free and open source

Free to use, share and modify, under the **GNU General Public License v3.0** (see [LICENSE](LICENSE)).
This software comes with no warranty. Copyright (C) 2026 eikira.

Inspired by [Social Stream Ninja](https://github.com/steveseguin/social_stream) (also GPL-3.0). The chat-page
selectors were worked out by studying how SSN reads chat; no SSN code is included. Not affiliated with or
endorsed by VoiceStudio, OBS Project, Social Stream Ninja, Twitch, YouTube, Rumble or Kick. Those names
belong to their owners.
