# VoiceStudio OBS Connector

[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)

A Chrome extension that **reads stream chat commands aloud with your own VoiceStudio voices**, through OBS.

    chat:  !voice hello everyone            ->  the voice linked to !voice says "hello everyone"
    chat:  !voice2 welcome to the stream    ->  a different voice linked to !voice2 says it

Viewers type a command and some text. The extension picks up only messages that start with one of
your commands, sends the text to [VoiceStudio](https://voicestudio.sh) (which runs on your own
computer), and the voice is played in your stream through an OBS Browser Source. Every command can have
its own voice, speed and model. Everything else in chat is ignored.

Works like the TTS of Social Stream Ninja, but with **any number of VoiceStudio voices, each on its own
command**, and without the rest of SSN.

## You need three things

1. **This extension** (Chrome).
2. **The relay**: a small background program that carries the speech to OBS.
   **[Download the VoiceStudio OBS Connector Relay](https://github.com/eikira/VoiceStudio-OBS-Connector-Relay/releases/latest)** (Windows, macOS, Linux).
3. **[VoiceStudio](https://voicestudio.sh)** running with its OpenAI-compatible speech API
   (default `http://127.0.0.1:3900`).

## Requirements

| | |
|---|---|
| **Browser** | Google Chrome (other Chromium browsers such as Edge or Brave should work but are untested) |
| **OBS Studio** | any recent version, with a Browser Source (included in OBS) |
| **VoiceStudio** | running locally or on another computer in your network |
| **Relay** | [VoiceStudio OBS Connector Relay](https://github.com/eikira/VoiceStudio-OBS-Connector-Relay) on the computer that runs OBS |
| **Chat** | Twitch, YouTube, Rumble or Kick chat open in your browser (normal page or popout) |

## Install

1. Download **`VoiceStudio-OBS-Connector-0.0.8.zip`** from the [latest release](https://github.com/eikira/VoiceStudio-OBS-Connector/releases/latest) and unzip it.
2. Chrome -> `chrome://extensions` -> turn on **Developer mode** (top right) -> **Load unpacked** ->
   choose the unzipped folder (the one that contains `manifest.json`).
3. Install and start the **[relay](https://github.com/eikira/VoiceStudio-OBS-Connector-Relay/releases/latest)**.

The extension is not on the Chrome Web Store, so it is installed this way.

## Set up

1. Click the extension icon -> **Settings**.
2. **VoiceStudio address:** default `http://127.0.0.1:3900` (this computer). For VoiceStudio on another
   computer enter its address. VoiceStudio must be running to load models and voices.
3. **Default model, format and speed**: "Load" asks VoiceStudio for its models.
4. **Commands and voices**: "Load voices from VoiceStudio", add a command (up to 8 characters, the `!`
   is added for you), pick the voice by name. Speed and model can be set per voice. **Test** plays a
   sample in OBS.
5. **Save**.
6. **OBS:** Sources -> + -> **Browser** -> paste the **OBS Browser Source URL** from the settings page.
   Do not tick "Shutdown source when not visible".
7. Open your chat. Chat tabs that are already open are picked up automatically. The popup's **Chat** line shows whether it is listening.
8. Popup -> **Send test**.

Limits: default 190 characters per message; optional cooldown per viewer (after a command is accepted,
more commands from that viewer are ignored for N seconds).

## Privacy

- Nothing is sent to any server of mine or anyone else's. The extension only talks to your relay and your
  VoiceStudio.
- Only chat messages that start with `!` are looked at further. Settings are stored in Chrome on your computer.
- It needs access to the supported chat sites (to read chat) and to `127.0.0.1` / `localhost`
  (relay and VoiceStudio). Another VoiceStudio address is only contacted after you allow it.

## Troubleshooting

- **Popup says Relay "not reachable":** start the relay. The address in settings must match its port (default 8787).
- **Popup Chat line says "not detected":** open your chat page; if it is already open, refresh it (F5).
- **Silence in OBS:** the Browser Source must show "connected" (popup: OBS page). Keep "Control audio via OBS" in mind for the mixer.
- **A chat site changed its layout:** open an [issue](https://github.com/eikira/VoiceStudio-OBS-Connector/issues) and say which site.

## Develop

Plain JavaScript, no build step, no libraries. Load the `extension/` folder with *Load unpacked*.
Unit tests: `node --test` (Node 18+, no installs).

## Free and open source

Free to use, share and modify, under the **GNU General Public License v3.0** (see [LICENSE](LICENSE)).
This software comes with no warranty. Copyright (C) 2026 eikira.

Inspired by [Social Stream Ninja](https://github.com/steveseguin/social_stream) (also GPL-3.0). The chat-page
selectors were worked out by studying how SSN reads chat; no SSN code is included. Not affiliated with or
endorsed by VoiceStudio, OBS Project, Social Stream Ninja, Twitch, YouTube, Rumble or Kick. Those names
belong to their owners.
