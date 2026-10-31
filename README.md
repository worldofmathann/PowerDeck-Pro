# ⚡ PowerDeck Pro - Advanced Clubhouse Auth & Agora Audio Engine

> **Crafted for High Performance Desktop Architecture**  
> Electron (Node.js / Web) • Rust Core (`powerdeck_core`) • Java 21 LTS (`PowerDeckAuth`)

---

## 🌟 Overview

**PowerDeck Pro** is an enterprise-grade desktop authentication and session synthesizer application designed for Clubhouse API and Agora real-time voice infrastructure.

Featuring:
- **3 Unified Authentication Methods**:
  1. 📱 **Login with Phone Number (OTP)**: Synchronized hardware session lock. The hardware Device ID generated for registration check is strictly preserved and paired with the complete verification request to ensure token issuance succeeds.
  2. 🔐 **Password Login**: Direct authentication with registered phone number and password.
  3. 🔑 **Token Direct Login**: Instant authentication by supplying an active token.
- **Dedicated Separated Token Preview Box**: Prominent, high-clarity monospace card with 1-click clipboard copy, mask/unmask toggle, and character counter.
- **Automated `profile.json` Synthesizer**:
  - Automatically queries `/api/me` upon successful authentication.
  - Builds the complete Clubdeck/Powerdeck profile configuration structure.
  - Injects the official **Agora Key (`938de3e8055e42b281bb8c6f69c21f78`)** and PubNub configurations for real-time audio channels and house creation.
  - Directly saves to **`%APPDATA%\powerdeckpro\profile.json`**.
- **Instant Transition to Home Page (Step 1)**:
  - Displays user profile photo, display name, `@username`, User ID, and following counts.
  - Shows active session credentials, paired hardware device ID, and Agora RTC status.
  - Quick action buttons to **Open Folder**, **View profile.json in modal**, and **Copy Path**.
- **Dual Theme Engine**: Dark (`#0B0D14`) & Light (`#F3F5FB`) with high contrast and smooth transitions.
- **60 FPS Constellation Particle Canvas**: Glowing radial halos, neural distance lines, and mouse magnetism/repulsion.

---

## 🚀 Quick Start (Electron Desktop App)

### 1. Install Dependencies
```bash
npm install
```

### 2. Launch the Application
```bash
npm start
```

---

## 🦀 Rust Core (`rust-core`)

The complete authentication logic, profile synthesizer, and file persistence are also implemented in high-performance Rust:

### Build Rust Binary:
```bash
cargo build --manifest-path rust-core/Cargo.toml
```

### Run Rust CLI Commands:
```bash
# 1. Generate Hardware Device ID
.\rust-core\target\debug\powerdeck_core.exe device-id

# 2. Check profile.json existence in %APPDATA%\powerdeckpro
.\rust-core\target\debug\powerdeck_core.exe check-profile

# 3. Start Phone Number Auth
.\rust-core\target\debug\powerdeck_core.exe phone-start +14155552671 <DEVICE_ID>

# 4. Verify OTP (Auto-saves to %APPDATA%\powerdeckpro\profile.json)
.\rust-core\target\debug\powerdeck_core.exe phone-verify +14155552671 <OTP_CODE> <DEVICE_ID>

# 5. Password Authentication
.\rust-core\target\debug\powerdeck_core.exe password +14155552671 <PASSWORD> <DEVICE_ID>

# 6. Fetch Profile with Existing Token
.\rust-core\target\debug\powerdeck_core.exe token-fetch <TOKEN> <DEVICE_ID>
```

---

## ☕ Java Core (`java-core`)

A standalone Java 21 implementation using `java.net.http.HttpClient`:

### Compile & Run:
```bash
javac -d java-core java-core/PowerDeckAuth.java
java -cp java-core com.powerdeckpro.PowerDeckAuth
```

---

## 📁 Profile Location & Structure

Target profile path:
```
%APPDATA%\powerdeckpro\profile.json
(C:\Users\<Username>\AppData\Roaming\powerdeckpro\profile.json)
```

Generated JSON Template includes:
```json
{
  "apiRoot": "https://www.clubhouseapi.com/api",
  "userAgent": "clubhouse/android",
  "userAgentStatic": "clubhouse/2640 (iPhone; iOS 17.1.2; Scale/3.00)",
  "appVersion": "24.01.02",
  "appBuild": "2640",
  "agoraKey": "938de3e8055e42b281bb8c6f69c21f78",
  "pubnubRoot": "https://clubhouse.pubnub.com",
  "pubnubPubKey": "pub-c-6878d382-5ae6-4494-9099-f930f938868b",
  "pubnubSubKey": "sub-c-a4abea84-9ca3-11ea-8e71-f2b83ac9263d",
  "pubnubSDK": "PubNFub-ObjC-iOS/4.15.11",
  "deviceId": "LOCKED-HARDWARE-UUID",
  "user": {
    "user_id": 123456,
    "name": "Display Name",
    "photo_url": "https://...",
    "username": "handle"
  },
  "tokens": {
    "auth": "AUTHENTICATION_TOKEN"
  },
  "token": "AUTHENTICATION_TOKEN",
  "userId": 123456,
  "verified": true
}
```

---

## 🎨 Dual Theme Palette

| Element | Dark Mode | Light Mode |
|---|---|---|
| Background | `#0B0D14` | `#F3F5FB` |
| Surface | `#121522` | `#FFFFFF` |
| Primary Accent | `#7C6FFF` | `#6355EE` |
| Success / Token | `#39E58C` | `#10B981` |
| Warning | `#FFD166` | `#F59E0B` |
| Error | `#FF6675` | `#EF4444` |
