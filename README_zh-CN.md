# Obsidian Third-party Sync

**Obsidian Third-party Sync** 是 [Remotely Save](https://github.com/remotely-save/remotely-save) 的非官方分叉插件，**核心聚焦于安全性升级**。在保留原版全部基础功能的前提下，重构了加密实现并精简了代码架构。**与 Remotely Save 不兼容**，切换前请务必备份 Vault 数据。

如果你觉得有用，欢迎给个 Star：[![GitHub Repo stars](https://img.shields.io/github/stars/nightfall-yl/obsidian-third-party-sync?style=social)](https://github.com/nightfall-yl/obsidian-third-party-sync)

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a>
</p>

## 免责声明

- **这不是 Obsidian 官方提供的 [同步服务](https://obsidian.md/sync)。**
- **⚠️ 使用本插件前，请务必备份你的 Vault。**

## 为什么从 Remotely Save 分叉？

### 安全升级（核心改进）

- **加密算法**
  - Remotely Save：AES-CBC 或 AES-CTR (RClone)
  - 本插件：**AES-256-GCM**
- **完整性校验**
  - Remotely Save：无（CBC 易受 padding oracle 攻击）
  - 本插件：**GCM 内置 AuthTag 验证**
- **初始化向量（IV）**
  - Remotely Save：从密码派生（同密码下所有文件 IV 相同）
  - 本插件：**每次随机生成**
- **Salt 长度**
  - Remotely Save：8 字节（2^64 种可能）
  - 本插件：**16 字节**（2^128 种可能）
- **加密依赖**
  - Remotely Save：`crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - 本插件：**纯浏览器原生 `window.crypto.subtle` API**

### 架构精简

相比原版，本插件做了以下精简：

- **存储服务**：从 13 种精简为 3 种主流服务（S3 / WebDAV / OneDrive），移除 Dropbox、Google Drive、Box、Azure Blob、pCloud、Yandex Disk、Koofr、Webdis 等
- **加密方案**：从 2 套（OpenSSL + RClone）合并为 1 套（AES-256-GCM）

## 功能特性

- **支持的存储服务**：Amazon S3（及兼容服务：腾讯云 COS、阿里云 OSS、Backblaze B2、MinIO 等）、WebDAV（坚果云、Nextcloud、OwnCloud、Seafile、rclone 等）、OneDrive 个人版。详见[服务连接性文档](./docs/services_connectable_or_not.md)。
- **端到端加密**（[详见](./docs/encryption.md)）：设置密码后，文件在上传前本地加密。采用 **AES-256-GCM + 浏览器原生 Web Crypto API**，输出格式兼容 RClone Crypt 的 base64url 文件名编码。
- **自动同步**：支持定时同步、启动时同步、保存时同步、远端变化检测后同步。
- **同步方向**：双向同步 / 增量推送（备份模式）/ 增量拉取 / 带删除的增量模式。
- **变更比例保护**：当修改或删除的文件比例超过阈值时中止同步，防止误操作。
- **冲突处理**：可配置冲突时保留较新版本或保留较大文件。
- **大文件跳过**：可设置跳过超过指定大小的文件。
- **同步书签及配置文件夹**（可选）。
- **状态栏显示**同步进度与最后同步时间。
- **移动端支持**：在 Obsidian 移动端（Android / iOS）完整可用，包含端到端加密。
- **URI 导入/导出设置**（OneDrive OAuth 信息除外）。
- **空文件夹清理**：自动清理同步后变为空的文件夹。
- **[最小侵入设计](./docs/minimal_intrusive_design.md)**。
- **完全开源**（[Apache-2.0](./LICENSE)）。
- **[同步算法](./docs/sync_algorithm.md)**。
- **🌐 多语言支持** — 界面自动跟随 Obsidian 显示语言（共 14 种：English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский），无需手动设置，缺译时自动回退英文。

## 限制与注意事项

- **不同步元数据时，删除同步依赖时间戳判断**，建议配合增量推送/拉取模式使用。
- **无智能冲突解决算法**（原版 Pro 功能已移除），文件以修改时间判断，修改时间较新者胜出。
- **云存储会产生费用**：所有操作（上传、下载、列举文件、调用 API）均可能计费。
- **部分限制来自浏览器环境**，详见[技术文档](./docs/browser_env.md)。
- **请保护 `data.json` 文件**：包含敏感信息（S3 密钥、WebDAV 密码等），不要分享给他人，建议加入 `.gitignore`。

## 安装

**方式一**：在 Obsidian 社区插件市场中搜索 `Obsidian Third-party Sync` 安装。

**方式二**：使用 [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat)，添加仓库 `nightfall-yl/obsidian-third-party-sync`。

**方式三**：手动下载最新 Release 的 `main.js`、`manifest.json`、`styles.css`，放入 Vault 的 `.obsidian/plugins/third-party-sync/` 目录。

## 使用

### S3

- 准备 S3 信息：Endpoint、Region、Access Key ID、Secret Access Key、Bucket 名称。
- 在插件设置中填入信息，设置加密密码（如需要）。
- 点击左侧栏图标手动同步，或在设置中开启自动同步。

### WebDAV

- 坚果云、Nextcloud、OwnCloud、Seafile、rclone 等均支持。
- 部分服务需要安装 `WebAppPassword` 等插件配合。详见 [WebDAV 配置文档](./docs/apache_cors_configure.md)。

### OneDrive（个人版）

- 仅支持个人版，不支持企业版。
- 授权后插件在 `/Apps/third-party-sync/` 下读写文件。
- 支持端到端加密（Vault 名称本身不加密）。

### 自动同步

- 自动同步模式下出错会静默失败。
- Obsidian 关闭后无法自动同步（浏览器插件的技术限制）。

### 隐藏文件

- 默认以 `.` 或 `_` 开头的文件和文件夹不同步。
- 可在设置中开启同步 `_` 文件夹和 `.obsidian` 配置文件夹。

## 赞赏

如果这个项目对你有帮助，欢迎请作者喝杯咖啡 ☕️

<img src="./docs/reward.jpg" width="300" alt="赞赏码" />

## 鸣谢

- 感谢 @fyears 的原始项目 [Remotely Save](https://github.com/remotely-save/remotely-save)。

## 问题反馈

欢迎在 [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues) 反馈问题。Pull Request 同样欢迎！
