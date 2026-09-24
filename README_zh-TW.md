# Obsidian Third-party Sync

基於 [Remotely Save](https://github.com/remotely-save/remotely-save) 二次開發的 Obsidian 同步外掛，**聚焦安全性升級**。重構了加密實作並精簡了程式碼架構。**與 Remotely Save 不相容**，切換前請務必備份 Vault 資料。

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | 繁體中文 | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | [Español](README_es.md) | [Italiano](README_it.md) | [Nederlands](README_nl.md) | [Dansk](README_da.md) | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## 免責聲明

- **這不是 Obsidian 官方提供的 [同步服務](https://obsidian.md/sync)。**
- **⚠️ 使用此外掛前，請務必備份你的 Vault。**

## 為什麼從 Remotely Save 派生？

### 安全升級（核心改進）

- **加密演算法**
  - Remotely Save：AES-CBC 或 AES-CTR (RClone)
  - 此外掛：**AES-256-GCM**
- **完整性驗證**
  - Remotely Save：無（CBC 模式易受 padding oracle 攻擊）
  - 此外掛：**GCM 內建 AuthTag 驗證**
- **初始化向量（IV）**
  - Remotely Save：從密碼衍生（同密碼下所有檔案 IV 相同）
  - 此外掛：**每次隨機生成**
- **Salt 長度**
  - Remotely Save：8 位元組（2^64 種可能）
  - 此外掛：**16 位元組**（2^128 種可能）
- **加密依賴**
  - Remotely Save：`crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - 此外掛：**純瀏覽器原生 `window.crypto.subtle` API**

### 架構精簡

相比原版，此外掛做了以下精簡：

- **儲存服務**：從 13 種精簡為 3 種主流服務（S3 / WebDAV / OneDrive），移除 Dropbox、Google Drive、Box、Azure Blob、pCloud、Yandex Disk、Koofr、Webdis 等
- **加密方案**：從 2 套（OpenSSL + RClone）合併為 1 套（AES-256-GCM）

## 功能特性

- **支援的儲存服務**：Amazon S3（及相容服務：騰訊雲 COS、阿里雲 OSS、Backblaze B2、MinIO 等）、WebDAV（堅果雲、Nextcloud、OwnCloud、Seafile、rclone 等）、OneDrive 個人版。詳見[服務連線性文件](./docs/services_connectable_or_not.md)。
- **端到端加密**（[詳見](./docs/encryption.md)）：設定密碼後，檔案在上傳前本地加密。採用 **AES-256-GCM + 瀏覽器原生 Web Crypto API**，輸出格式相容於 RClone Crypt 的 base64url 檔名編碼。
- **自動同步**：支援定時同步、啟動時同步、儲存時同步、遠端變更偵測後同步。
- **同步方向**：雙向同步 / 增量推送（備份模式）/ 增量拉取 / 帶刪除的增量模式。
- **變更比例保護**：當修改或刪除的檔案比例超過閾值時中止同步，防止誤操作。
- **衝突處理**：可設定衝突時保留較新版本或保留較大檔案。
- **大檔案跳過**：可設定跳過超過指定大小的檔案。
- **同步書籤及設定資料夾**（可選）。
- **狀態列顯示**同步進度與最後同步時間。
- **行動裝置支援**：在 Obsidian 行動裝置（Android / iOS）完整可用，包含端到端加密。
- **URI 匯入/匯出設定**（OneDrive OAuth 資訊除外）。
- **空資料夾清理**：自動清理同步後變為空的資料夾。
- **[最小侵入設計](./docs/minimal_intrusive_design.md)**。
- **完全開源**（[Apache-2.0](./LICENSE)）。
- **[同步演算法](./docs/sync_algorithm.md)**。
- **🌐 多語言支援** — 介面自動跟隨 Obsidian 顯示語言（共 14 種：English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский），無需手動設定，缺譯時自動回退英文。

## 限制與注意事項

- **無中繼資料同步 —— 刪除偵測依賴時間戳判斷**，建議配合增量推送/拉取模式使用。
- **簡單衝突解決**：檔案以修改時間判斷，較新者勝出。
- **雲端儲存會產生費用**：所有操作（上傳、下載、列出檔案、呼叫 API）均可能計費。
- **部分限制來自瀏覽器環境**，詳見[技術文件](./docs/browser_env.md)。
- **請保護 `data.json` 檔案**：包含敏感資訊（S3 金鑰、WebDAV 密碼等），不要分享給他人，建議加入 `.gitignore`。

## 安裝

**方式一**：在 Obsidian 社群外掛市場中搜尋 `Obsidian Third-party Sync` 安裝。

**方式二**：使用 [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat)，新增儲存庫 `nightfall-yl/obsidian-third-party-sync`。

**方式三**：手動下載最新 Release 的 `main.js`、`manifest.json`、`styles.css`，放入 Vault 的 `.obsidian/plugins/third-party-sync/` 目錄。

## 使用

### S3

- 準備 S3 資訊：Endpoint、Region、Access Key ID、Secret Access Key、Bucket 名稱。
- 在外掛設定中填入資訊，設定加密密碼（如需要）。
- 點擊左側欄圖示手動同步，或在設定中開啟自動同步。

### WebDAV

- 堅果雲、Nextcloud、OwnCloud、Seafile、rclone 等均支援。
- 部分服務需要安裝 `WebAppPassword` 等外掛配合。詳見 [WebDAV 設定文件](./docs/apache_cors_configure.md)。

### OneDrive（個人版）

- 僅支援個人版，不支援企業版。
- 授權後外掛在 `/Apps/third-party-sync/` 下讀寫檔案。
- 支援端到端加密（Vault 名稱本身不加密）。

### 自動同步

- 自動同步模式下出錯會靜默失敗。
- Obsidian 關閉後無法自動同步（瀏覽器外掛的技術限制）。

### 隱藏檔案

- 預設以 `.` 或 `_` 開頭的檔案和資料夾不同步。
- 可在設定中開啟同步 `_` 資料夾和 `.obsidian` 設定資料夾。

## 贊助

如果這個專案對你有幫助，歡迎請作者喝杯咖啡 ☕️

<img src="./docs/reward.jpg" width="360" alt="贊助碼" />

## 致謝

- 感謝 @fyears 的原始專案 [Remotely Save](https://github.com/remotely-save/remotely-save)。

## 問題回報

歡迎在 [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues) 回報問題。Pull Request 同樣歡迎！
