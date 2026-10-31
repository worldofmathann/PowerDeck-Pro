<div align="center">

# ⚡ PowerDeck Pro

### 100% Totally Free & Open-Source Studio Desktop Client

> **📢 Notice: PowerDeck Pro is NOT affiliated with Clubhouse. It is an independent, totally free and open-source project.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.0.1-green.svg)](https://github.com/worldofmathann/PowerDeck-Pro/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/worldofmathann/PowerDeck-Pro/releases)
[![Not Affiliated with Clubhouse](https://img.shields.io/badge/Clubhouse-Not%20Affiliated-orange.svg)](#legal-disclaimer)
[![Totally Free](https://img.shields.io/badge/Price-Totally%20Free%20%26%20Open%20Source-brightgreen.svg)](#)

<p align="center">
  <b>High-fidelity 48kHz audio engine, studio equalizer, reverb mixer, and resilient 24/7 VPS streaming.</b><br>
  <b>Totally free forever. Zero paywalls. Zero license keys. Zero subscriptions.</b>
</p>

</div>

---

### ⚠️ Legal Disclaimer: Not Affiliated with Clubhouse

> **IMPORTANT**: **PowerDeck Pro is NOT affiliated with, associated with, authorized by, endorsed by, sponsored by, or in any way officially connected with Clubhouse ([Alpha Exploration Co., Inc.](https://www.clubhouse.com)) or any of its subsidiaries or affiliates.**  
> 
> - PowerDeck Pro is an independent, community-driven, 100% free open-source desktop client.
> - The official Clubhouse website is located at [https://www.clubhouse.com](https://www.clubhouse.com).
> - The name "Clubhouse", as well as related names, marks, logos, and emblems, are registered trademarks of their respective owners.

---

## 🌟 Totally Free & Open Source

PowerDeck Pro was built for creators, musicians, room moderators, and power users who need studio-quality audio control, ultra-stable connections, and complete freedom without artificial paywalls.

Every feature in PowerDeck Pro is **100% unlocked and totally free**:
- 🚫 **No License System**: No activation keys, no paid tiers, no expiration dates.
- 🔓 **All Features Unlocked**: Full access to all audio processing DSPs, equalizer bands, custom media uploads, and channel controls.
- 🌐 **100% Open Source**: Fully transparent codebase released under the permissive [MIT License](LICENSE).
- 💸 **Totally Free**: No subscriptions, no in-app purchases, completely free for the community.

---

## ✨ Key Features

### 🎛️ Studio-Grade Microphone Audio Suite
- **8-Band Parametric Equalizer**: Precision frequency tuning from 64 Hz sub-bass to 16 kHz air sheen with real-time dB feedback.
- **Convolver Studio Reverb**: 6 selectable acoustic room algorithms (Vocal Booth, Live Studio, Warm Chamber, Concert Hall, Cathedral, Outer Space).
- **Stereo Tempo Delay**: Configurable milliseconds delay, feedback percentage, and dry/wet mixer.
- **Dynamic Punch Compressor**: Enhances vocal presence and loudness with auto-limiting.
- **Adaptive Noise Gate**: Eliminates background fan hum, room echo, and keyboard clicks.
- **Voice Character Modulator**: Clean Studio, Deep Radio, Vintage Phone, Megaphone, Cyber Robot, and High Pitch profiles.
- **Zero-Latency Audio Monitor**: Real-time microphone loopback monitoring to your headphones.

### 🎙️ Audiophile Agora RTC Engine
- **48,000 Hz Sampling Rate (Full-Band Stereo)**: Studio sound fidelity at up to 192 kbps.
- **Acoustic Echo Cancellation (AEC)**, **Noise Suppression (ANS)**, and **Auto Gain Control (AGC)** with instant hardware pass-through mode for external XLR microphones and audio interfaces.

### ⚡ 24/7 VPS & RDP Streaming Resilience
- **Zero-Drop Background Audio**: Audio stream stays alive even when Windows Remote Desktop (RDP) is minimized or closed.
- **Sub-Second Auto-Reconnect**: Automatically detects disconnection or token expiration and reconnects within milliseconds without interrupting the room.
- **System Tray Minimization**: Keeps background broadcasting active when closing the main window.
- **Process Keepalive**: Chromium native occlusion and background throttling disabled for uninterrupted 24/7 bot and music streaming.

### 💬 Live Stage & Interaction
- **Floating Stage Reactions**: Interactive live emoji reactions with target user or full stage broadcasting.
- **Custom Reaction Library**: Upload and broadcast your own custom GIFs and video reaction loops.
- **Moderator Stage Tools**: Promote listeners, manage stage speakers, hand raise queue, and search room attendees.
- **Direct House Invitations**: Instant invite link generator and contact invite dialog.

### 🔐 Flexible Authentication
- **3 Unified Sign-In Options**:
  1. 📱 **Phone Number (OTP)**: Hardware-synced verification lock.
  2. 🔐 **Password Login**: Direct credential login for registered accounts.
  3. 🔑 **Token Direct Login**: Instant 1-click authentication using an existing auth token.
- **Automated Profile Synthesizer**: Generates and pairs Agora voice tokens, device IDs, and local `%APPDATA%\powerdeckpro\profile.json` automatically.

### 🎨 Premium Interface Design
- **Dual Dynamic Themes**: Deep Studio Dark (`#0B0D14`) and Crisp Modern Light (`#F3F5FB`).
- **Interactive Constellation Canvas**: 60 FPS neural particle physics with mouse repulsion and subtle glow aesthetics.

---

## 📥 Download Pre-Built Executables (Windows)

You can download the pre-compiled, ready-to-run binaries from the [**Releases Page**](https://github.com/worldofmathann/PowerDeck-Pro/releases):

| Format | File | Recommended For |
| :--- | :--- | :--- |
| **Installer** | [`PowerDeck.Pro.Setup.2.0.1.exe`](https://github.com/worldofmathann/PowerDeck-Pro/releases) | Standard Windows installation with Start Menu & Desktop shortcuts |
| **Portable** | [`PowerDeck.Pro.Portable.exe`](https://github.com/worldofmathann/PowerDeck-Pro/releases) | Single file executable; run from anywhere or USB drive without installing |

---

## 🚀 Running from Source

If you want to inspect, modify, or build PowerDeck Pro from source code:

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- [npm](https://www.npmjs.com/) (bundled with Node.js)
- [Git](https://git-scm.com/)

### 1. Clone the Repository
```bash
git clone https://github.com/worldofmathann/PowerDeck-Pro.git
cd PowerDeck-Pro
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Launch Development App
```bash
npm start
```

---

## 📦 Building Standalone Binaries

To compile your own `.exe` installer or portable executable from source:

```bash
# Build Windows Installer (.exe)
npm run build:exe

# Build Standalone Portable (.exe)
npm run build:portable

# Or run the complete protected build pipeline:
npm run build:protected
```
Outputs are generated in the `dist/` directory.

---

## 📁 Project Architecture

```
PowerDeck-Pro/
├── build/               # Application icons and packaging assets
├── dist/                # Output directory for compiled installers and portable binaries
├── giphy/               # Built-in media and GIF reaction libraries
├── java-core/           # Optional Java 21 authentication & token helper utilities
├── scripts/             # Build pipeline and release packaging automation
├── src/
│   ├── main.js          # Electron Main Process (IPC, Agora voice bridges, app lifecycle)
│   ├── preload.js       # Context isolation bridge exposing safe powerdeckAPI
│   └── renderer/
│       ├── agora-rtc.js # Agora RTC 4.x real-time voice streaming engine
│       ├── index.html   # Main application view & interface modals
│       ├── particles.js # 60 FPS constellation canvas physics
│       ├── pubnub.min.js# Real-time room event and handraise messaging
│       ├── renderer.js  # Main UI controller, Studio Equalizer DSP, and room stage logic
│       └── style.css    # Responsive theme engine and stylesheet
├── package.json         # Project metadata, scripts, and dependencies
├── LICENSE              # MIT Open Source License
└── README.md            # Documentation and project guide
```

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!
1. Fork the Project (`https://github.com/worldofmathann/PowerDeck-Pro/fork`)
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">
  <sub>Developed by <a href="https://github.com/worldofmathann">worldofmathann</a> and the open-source community.</sub>
</div>
