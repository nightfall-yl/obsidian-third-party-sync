# Obsidian Third-party Sync

**Obsidian Third-party Sync** is an unofficial fork of [Remotely Save](https://github.com/remotely-save/remotely-save), **focused on security upgrades**. It retains all core features from the original while rebuilding the encryption implementation and simplifying the codebase. **It is NOT backwards compatible with Remotely Save** — backup your vault before switching.

If you find it useful, please give it a star: [![GitHub Repo stars](https://img.shields.io/github/stars/nightfall-yl/obsidian-third-party-sync?style=social)](https://github.com/nightfall-yl/obsidian-third-party-sync)

Pull requests are welcome!

## Disclaimer

- **This is NOT the [official sync service](https://obsidian.md/sync) provided by Obsidian.**
- **⚠️ ALWAYS backup your vault before using this plugin.**

## Why Fork from Remotely Save?

### Security Upgrades (Core Improvements)

| Item | Remotely Save | This Plugin |
|:-----|:--------------|:------------|
| **Cipher algorithm** | AES-CBC or AES-CTR (RClone) | **AES-256-GCM** |
| **Integrity check** | None (CBC vulnerable to padding oracle attacks) | **Built-in GCM AuthTag verification** |
| **Initialization Vector (IV)** | Derived from password (same IV for all files under same password) | **Randomly generated per file** |
| **Salt length** | 8 bytes (2^64 possibilities) | **16 bytes** (2^128 possibilities) |
| **Encryption dependencies** | `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker | **Pure browser-native `window.crypto.subtle` API** |

> See [commit d9ad76e](https://github.com/nightfall-yl/obsidian-third-party-sync/commit/d9ad76e774b0b1cee2b36316058df926f4bfb2bf) for encryption changes. Read [encryption docs](./docs/encryption.md) for details.

### Architecture Simplification

Compared to the original, this fork makes the following simplifications:

- **Storage services**: Reduced from 13 to 3 mainstream services (S3 / WebDAV / OneDrive). Removed Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis, etc.
- **Encryption schemes**: Merged from 2 (OpenSSL + RClone) into 1 (**AES-256-GCM**)

### All Retained Core Features

- 5 sync directions (bidirectional / incremental push / incremental pull / push+delete / pull+delete)
- Modification ratio protection (prevents accidental mass changes)
- Large file skip, conflict handling (keep newer or larger version), empty folder cleanup
- Auto sync: scheduled interval, startup, on-save, remote-change detection
- End-to-end encryption, mobile support, status bar progress display, debug mode
- URI import/export settings, bookmark & config directory sync
- Minimal intrusive design

## Features

- **Supported services**: Amazon S3 (and compatible: Tencent COS, Alibaba OSS, Backblaze B2, MinIO, etc.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, etc.), OneDrive personal. See [service compatibility docs](./docs/services_connectable_or_not.md).
- **End-to-end encryption** ([details](./docs/encryption.md)): files are encrypted locally before upload using **AES-256-GCM via browser-native Web Crypto API**, output format compatible with RClone Crypt's base64url filename encoding.
- **Auto sync**: scheduled interval, startup, on-save, and remote-change detection.
- **Sync Direction**: bidirectional / incremental push (backup mode) / incremental pull / with-delete variants.
- **Modification Ratio Protection**: aborts sync if the ratio of modified/deleted files exceeds threshold, preventing accidental data loss.
- **Conflict handling**: configurable to keep newer or larger version on conflicts.
- **Large file skip**: skip files exceeding a configured size threshold.
- **Sync bookmarks and config dir** (optional).
- **Status bar**: progress and last sync time display.
- **Debug mode**: export sync plans, export console logs.
- **URI import/export** for settings (excluding OneDrive OAuth info).
- **[Minimal intrusive design](./docs/minimal_intrusive_design.md).**
- **Fully open source** ([Apache-2.0](./LICENSE)).
- **[Sync algorithm](./docs/sync_algorithm.md).**

## Limitations & Notes

- **Without metadata sync, deletion sync relies on timestamp comparison.** Recommended to use with Incremental Push/Pull modes.
- **No smart conflict resolution algorithm** (original Pro feature removed). Files are compared by modification time; the newer wins.
- **Cloud services cost money.** All operations (upload, download, file listing, API calls) may incur charges.
- **Some limitations come from browser environment**, see [technical docs](./docs/browser_env.md).
- **Protect your `data.json` file** — it contains sensitive info (S3 keys, WebDAV passwords, etc.). Do not share with others; recommended to add to `.gitignore`.

## Installation

**Option 1**: Search `Obsidian Third-party Sync` in Obsidian's community plugin marketplace.

**Option 2**: Use [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), add repo `nightfall-yl/obsidian-third-party-sync`.

**Option 3**: Manually download `main.js`, `manifest.json`, `styles.css` from the latest release and place them in your vault's `.obsidian/plugins/obsidian-third-party-sync/` directory.

## Building

```bash
git clone https://github.com/nightfall-yl/obsidian-third-party-sync
cd obsidian-third-party-sync
npm install

# Development build (watch mode)
npm run dev

# Production build (esbuild)
npm run build
```

Deploy to plugin directory:
```bash
cp main.js styles.css manifest.json /your/path/to/vault/.obsidian/plugins/obsidian-third-party-sync
```

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
- Plugin reads/writes under `/Apps/obsidian-third-party-sync/` after authorization.
- E2E encryption supported (vault name itself is not encrypted).

## Auto Sync

- Supports scheduled interval, startup, on-save, and remote-change detection auto sync.
- Errors silently fail in auto sync mode.
- Cannot run while Obsidian is closed (browser plugin technical limitation).

## Hidden Files

- Files/folders starting with `.` or `_` are excluded from sync by default.
- Enable sync for `_` folders and `.obsidian` config directory in settings.

## Debugging

See [debugging docs](./docs/how_to_debug/README.md).

## Credits

- Thanks to @fyears for the original [Remotely Save](https://github.com/remotely-save/remotely-save) project.

## Feedback

Open an issue on [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Pull requests are welcome!
