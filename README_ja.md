# Obsidian Third-party Sync

[Remotely Save](https://github.com/remotely-save/remotely-save) をフォークした Obsidian 同期プラグイン。**セキュリティ強化**を最優先に、暗号化レイヤーを AES-256-GCM で再構築し、コードベースを簡素化しました。**Remotely Save との後方互換性はありません** — 切り替え前に必ず Vault のバックアップを取ってください。

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | 日本語 | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | [Español](README_es.md) | [Italiano](README_it.md) | [Nederlands](README_nl.md) | [Dansk](README_da.md) | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## 免責事項

- **Obsidian 公式の [同期サービス](https://obsidian.md/sync) ではありません。**
- **⚠️ 使用前に必ず Vault をバックアップしてください。**

## なぜ Remotely Save からフォークしたのか？

### セキュリティ強化（主な改善点）

- **暗号化アルゴリズム**
  - Remotely Save：AES-CBC または AES-CTR (RClone)
  - このプラグイン：**AES-256-GCM**
- **完全性検証**
  - Remotely Save：なし（CBC モードは padding oracle 攻撃に脆弱）
  - このプラグイン：**GCM 内蔵 AuthTag 検証**
- **初期化ベクトル (IV)**
  - Remotely Save：パスワードから派生（同じパスワードでは全ファイル同じ IV）
  - このプラグイン：**ファイルごとにランダム生成**
- **Salt の長さ**
  - Remotely Save：8 バイト（2^64 通り）
  - このプラグイン：**16 バイト**（2^128 通り）
- **暗号化依存関係**
  - Remotely Save：`crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - このプラグイン：**ブラウザネイティブ `window.crypto.subtle` API**

### アーキテクチャの簡素化

オリジナルから以下の簡素化を行いました：

- **対応サービス**：13 種類から 3 種類の主流サービス（S3 / WebDAV / OneDrive）に削減。Dropbox、Google Drive、Box、Azure Blob、pCloud、Yandex Disk、Koofr、Webdis などは削除。
- **暗号化方式**：2 種類（OpenSSL + RClone）から 1 種類（**AES-256-GCM**）に統合。

## 主な機能

- **対応ストレージ**：Amazon S3（および互換サービス：腾讯云 COS、阿里云 OSS、Backblaze B2、MinIO など）、WebDAV（坚果云/Nutstore、Nextcloud、OwnCloud、Seafile、rclone など）、OneDrive 個人版。詳しくは[対応サービス一覧](./docs/services_connectable_or_not.md)を参照。
- **エンドツーエンド暗号化**（[詳細](./docs/encryption.md)）：パスワードを設定すると、ファイルはアップロード前に **AES-256-GCM（ブラウザネイティブ Web Crypto API）** でローカル暗号化され、RClone Crypt の base64url ファイル名エンコーディングと互換。
- **自動同期**：定期実行、起動時、保存時、リモート変更検知時の同期に対応。
- **同期方向**：双方向 / 増分プッシュ（バックアップモード）/ 増分プル / 削除を含む増分モード。
- **変更割合保護**：変更・削除ファイルの割合がしきい値を超えると同期を中止し、誤ったデータ消失を防止。
- **競合解決**：競合時に新しいバージョンを保持するか大きいファイルを保持するか設定可能。
- **大きなファイルのスキップ**：指定サイズを超えるファイルをスキップ。
- **ブックマークと設定ディレクトリの同期**（オプション）。
- **ステータスバー**：同期の進捗と最終同期時刻を表示。
- **モバイル対応**：Obsidian モバイル（Android / iOS）でもエンドツーエンド暗号化を含む全機能を利用可能。
- **設定の URI インポート/エクスポート**（OneDrive OAuth 情報は除く）。
- **空のディレクトリのクリーンアップ**：同期後に空になったディレクトリを自動削除。
- **[最小限の侵入的設計](./docs/minimal_intrusive_design.md)**。
- **完全オープンソース**（[Apache-2.0](./LICENSE)）。
- **[同期アルゴリズム](./docs/sync_algorithm.md)**。
- **🌐 多言語対応** — UI は Obsidian の表示言語に自動追従（全 14 言語：English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский）。手動設定不要、翻訳がない場合は英語にフォールバック。

## 制限と注意点

- **メタデータ同期なし — 削除検出はタイムスタンプ比較に依存**。増分プッシュ/プルモードでの使用を推奨。
- **シンプルな競合解決**：変更時刻で比較し、新しい方が勝つ。
- **クラウドサービスは料金が発生します**：アップロード、ダウンロード、ファイル一覧、API 呼び出しなどすべての操作に料金が発生する可能性があります。
- **制限の一部はブラウザ環境に由来します**。詳しくは[技術ドキュメント](./docs/browser_env.md)を参照。
- **`data.json` ファイルを保護してください**：S3 キー、WebDAV パスワードなど機密情報を含みます。他者と共有せず、`.gitignore` に追加することを推奨します。

## インストール

**方法 1**：Obsidian のコミュニティプラグインマーケットで `Obsidian Third-party Sync` を検索してインストール。

**方法 2**：[Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat) を使用し、リポジトリ `nightfall-yl/obsidian-third-party-sync` を追加。

**方法 3**：最新リリースから `main.js`、`manifest.json`、`styles.css` を手動でダウンロードし、Vault の `.obsidian/plugins/third-party-sync/` ディレクトリに配置。

## 使用方法

### S3

- S3 情報を準備：Endpoint、Region、Access Key ID、Secret Access Key、Bucket 名。
- プラグイン設定に入力し、暗号化パスワードを設定（必要な場合）。
- リボンアイコンをクリックして手動同期するか、設定で自動同期を有効化。

### WebDAV

- 坚果云/Nutstore、Nextcloud、OwnCloud、Seafile、rclone などに対応。
- 一部のサービスでは `WebAppPassword` などのプラグインが必要。詳しくは [WebDAV 設定ドキュメント](./docs/apache_cors_configure.md)を参照。

### OneDrive（個人版）

- 個人アカウントのみ — OneDrive for Business は未対応。
- 認証後、プラグインは `/Apps/third-party-sync/` 配下で読み書きを行います。
- エンドツーエンド暗号化に対応（Vault 名自体は暗号化されません）。

### 自動同期

- 自動同期モードではエラーは暗黙的に失敗します。
- Obsidian が閉じている間は実行できません（ブラウザプラグインの技術的制限）。

### 隠しファイル

- `.` または `_` で始まるファイル/ディレクトリはデフォルトで同期対象外。
- 設定で `_` ディレクトリと `.obsidian` 設定ディレクトリの同期を有効化できます。

## 作者にコーヒーを

このプラグインが役立った場合は、作者にコーヒーをご馳走ください ☕️

<img src="./docs/reward.jpg" width="360" alt="投げ銭コード" />

## クレジット

- オリジナル [Remotely Save](https://github.com/remotely-save/remotely-save) プロジェクトの @fyears に感謝。

## フィードバック

[GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues) に issue を作成してください。プルリクエストも歓迎します！
