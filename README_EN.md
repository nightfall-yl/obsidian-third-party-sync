# Obsidian Third-party Sync

**Obsidian Third-party Sync** is an unofficial fork of [Remotely Save](https://github.com/remotely-save/remotely-save), focusing on security updates and feature enhancements. **It is NOT backwards compatible with Remotely Save** — backup your data before use.

If you find it useful, please give it a star on GitHub: [![GitHub Repo stars](https://img.shields.io/github/stars/nightfall-yl/obsidian-third-party-sync?style=social)](https://github.com/nightfall-yl/obsidian-third-party-sync)

Pull requests are welcome!

## Disclaimer

- **This is NOT the [official sync service](https://obsidian.md/sync) provided by Obsidian.**
- **⚠️ ALWAYS backup your vault before using this plugin.**

## What's Different from Remotely Save

### Security Updates

- Upgraded encryption to [AES-GCM](https://github.com/nightfall-yl/obsidian-third-party-sync/commit/d9ad76e774b0b1cee2b36316058df926f4bfb2bf) — more secure, with ciphertext authentication to prevent [padding oracle attacks](https://cryptopals.com/sets/3/challenges/17).
- Salt upgraded from 8 to 16 bytes.
- IV no longer derived from user password.

## Features

- **Supported services**: Amazon S3 (and compatible: Tencent COS, Alibaba OSS, Backblaze B2, MinIO, etc.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, etc.), OneDrive personal. See [service compatibility docs](./docs/services_connectable_or_not.md).
- **Obsidian Mobile supported.** Sync vaults across desktop and mobile via cloud.
- **End-to-end encryption** ([details](./docs/encryption.md)): files are encrypted locally before upload using AES-256-GCM + RClone Crypt format when password is set.
- **Auto sync**: scheduled interval, startup, on-save, and remote-change detection.
- **Sync Direction**: Bidirectional / Incremental Push / Incremental Pull / with-delete variants.
- **Modification Ratio Protection**: guards against unintended mass file changes.
- **Sync bookmarks and config dir** (optional).
- **Status bar**: progress and last sync time display.
- **Debug mode**: export sync plans, export console logs.
- **URI import/export** for settings (excluding OneDrive OAuth info).
- **[Minimal intrusive design](./docs/minimal_intrusive_design.md).**
- **Fully open source** ([Apache-2.0](./LICENSE)).
- **[Sync algorithm](./docs/sync_algorithm.md).**

## Limitations & Notes

- **Without metadata sync, deletion sync relies on timestamp comparison.** Recommended to use with Incremental Push/Pull modes.
- **No conflict resolution algorithm.** Files are compared by modification time; the newer wins.
- **Cloud services cost money.** All operations (upload, download, file listing, API calls) may incur charges.
- **Some limitations come from browser environment**, see [technical docs](./docs/browser_env.md).
- **Protect your `data.json` file** — it contains sensitive information. Do not share with others; recommended to add to `.gitignore`.

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
