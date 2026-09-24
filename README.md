# Obsidian Third-party Sync

An Obsidian sync plugin, forked from [Remotely Save](https://github.com/remotely-save/remotely-save) with **security-first improvements**. Rebuilt the encryption layer (AES-256-GCM) and simplified the codebase. **NOT backwards compatible with Remotely Save** — please back up your vault before switching.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

English | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | [Español](README_es.md) | [Italiano](README_it.md) | [Nederlands](README_nl.md) | [Dansk](README_da.md) | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## Disclaimer

- **This is NOT the [official sync service](https://obsidian.md/sync) provided by Obsidian.**
- **⚠️ ALWAYS backup your vault before using this plugin.**

## Why Fork from Remotely Save?

### Security Upgrades (Core Improvements)

- **Cipher algorithm**
  - Remotely Save: AES-CBC or AES-CTR (RClone)
  - This Plugin: **AES-256-GCM**
- **Integrity check**
  - Remotely Save: None (CBC mode, which is vulnerable to padding oracle attacks)
  - This Plugin: **Built-in GCM AuthTag verification**
- **Initialization Vector (IV)**
  - Remotely Save: Derived from password (same IV for all files under same password)
  - This Plugin: **Randomly generated per file**
- **Salt length**
  - Remotely Save: 8 bytes (2^64 possibilities)
  - This Plugin: **16 bytes** (2^128 possibilities)
- **Encryption dependencies**
  - Remotely Save: `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - This Plugin: **Pure browser-native `window.crypto.subtle` API**

### Architecture Simplification

Compared to the original, this fork makes the following simplifications:

- **Storage services**: Reduced from 13 to 3 mainstream services (S3 / WebDAV / OneDrive). Removed Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis, etc.
- **Encryption schemes**: Merged from 2 (OpenSSL + RClone) into 1 (**AES-256-GCM**)

## Features

- **Supported services**: Amazon S3 (and compatible: Tencent COS, Alibaba OSS, Backblaze B2, MinIO, etc.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, etc.), OneDrive personal. See [service compatibility docs](./docs/services_connectable_or_not.md).
- **End-to-end encryption** ([details](./docs/encryption.md)): files are encrypted locally before upload using **AES-256-GCM via browser-native Web Crypto API**, output format compatible with RClone Crypt's base64url filename encoding.
- **Auto sync**: scheduled interval, startup, on-save, and remote-change detection.
- **Sync Direction**: bidirectional / incremental push (backup mode) / incremental pull / with-delete variants.
- **Modification Ratio Protection**: aborts sync if the ratio of modified/deleted files exceeds threshold, preventing accidental data loss.
- **Conflict handling**: configurable to keep newer or larger version on conflicts.
- **Large file skip**: skip files exceeding a configured size threshold.
- **Sync bookmarks and config dir** (optional).
- **Status bar**: displays sync progress and last sync time.
- **Mobile support**: full functionality on Obsidian mobile (Android / iOS), including end-to-end encryption.
- **URI import/export** for settings (excluding OneDrive OAuth info).
- **Empty folder cleanup**: automatically removes synced folders that become empty.
- **[Minimal intrusive design](./docs/minimal_intrusive_design.md).**
- **Fully open source** ([Apache-2.0](./LICENSE)).
- **[Sync algorithm](./docs/sync_algorithm.md).**
- **🌐 Multilingual** — The UI automatically follows your Obsidian display language (14 languages: English, 简体中文, 繁體中文, 日本語, 한국어, Deutsch, Français, Español, Italiano, Nederlands, Dansk, Svenska, Norsk, Русский). No manual setting required; falls back to English when a translation is missing.

## Limitations & Notes

- **No metadata sync — deletion detection relies on timestamp comparison.** Recommended to use with Incremental Push/Pull modes.
- **Simple conflict resolution**: files are compared by modification time; the newer version wins.
- **Cloud services cost money.** All operations (upload, download, file listing, API calls) may incur charges.
- **Some limitations come from browser environment**, see [technical docs](./docs/browser_env.md).
- **Protect your `data.json` file** — it contains sensitive info (S3 keys, WebDAV passwords, etc.). Do not share with others; recommended to add to `.gitignore`.

## Installation

**Option 1**: Search `Obsidian Third-party Sync` in Obsidian's community plugin marketplace.

**Option 2**: Use [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), add repo `nightfall-yl/obsidian-third-party-sync`.

**Option 3**: Manually download `main.js`, `manifest.json`, `styles.css` from the latest release and place them in your vault's `.obsidian/plugins/third-party-sync/` directory.

## Usage

### S3

- Prepare S3 info: Endpoint, Region, Access Key ID, Secret Access Key, Bucket name.
- Fill in settings and set encryption password (if needed).
- Click ribbon icon to manually sync, or enable auto sync in settings.

### WebDAV

- Works with Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, etc.
- Some services require plugins like `WebAppPassword`. See [WebDAV config docs](./docs/apache_cors_configure.md).

### OneDrive (Personal)

- Personal accounts only — OneDrive for Business is not supported.
- Plugin reads/writes under `/Apps/third-party-sync/` after authorization.
- E2E encryption supported (vault name itself is not encrypted).

### Auto Sync

- Errors silently fail in auto sync mode.
- Cannot run while Obsidian is closed (browser plugin technical limitation).

### Hidden Files

- Files/folders starting with `.` or `_` are excluded from sync by default.
- Enable sync for `_` folders and `.obsidian` config directory in settings.

## Buy Me a Coffee

If you find this plugin helpful, consider buying me a coffee ☕️

<img src="./docs/reward.jpg" width="360" alt="Buy me a coffee" />

## Credits

- Thanks to @fyears for the original [Remotely Save](https://github.com/remotely-save/remotely-save) project.

## Feedback

Open an issue on [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Pull requests are welcome!
