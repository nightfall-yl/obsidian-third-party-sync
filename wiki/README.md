# Code Wiki — Obsidian Third-party Sync

> 生成日期：2026-10-26 · 对应版本：`26.2.4`（manifest.json）

## 项目简介

**Third-party Sync**（插件 ID：`third-party-sync`）是一个 Obsidian 同步插件，fork 自开源项目 [Remotely Save](https://github.com/remotely-save/remotely-save)，并做了**安全优先（security-first）**的重构。它允许用户在本地 Vault 与第三方云存储之间同步笔记，支持：

- **三种云存储后端**：Amazon S3（及其兼容服务：腾讯 COS、阿里 OSS、Backblaze B2、MinIO、天翼云等）、WebDAV（坚果云、Nextcloud、OwnCloud、Seafile 等）、OneDrive 个人版
- **端到端加密（E2EE）**：上传前在本地用 **AES-256-GCM**（浏览器原生 Web Crypto API）加密文件内容与文件名
- **V3 同步算法**：以本地 IndexedDB 中的 prevSync 记录为"上一次同步基线"，对本地/远端/基线做三方合并决策，五种同步方向 + 冲突策略（保留较新/较大）
- **多种同步触发方式**：手动 / 定时 / 启动后 / 保存时 / 远端变化检测
- **数据保护机制**：修改比例保护（protectModifyPercentage）、大文件跳过（单侧超限弹窗裁决）、失败熔断（累计 3 个文件失败即暂停队列）、无基线空文件保护
- **状态栏实时进度**：数据交换阶段显示「正在交换数据 45/120（37%）」，同步结束自动恢复上次同步时间
- **全平台**：桌面端与移动端（Android/iOS）均可用（`isDesktopOnly: false`）
- **14 种语言 UI**：通过 `moment.locale()` 自动跟随 Obsidian 界面语言，缺键回退英文

与上游 Remotely Save 的核心差异（详见 `README.md`）：

| 维度 | Remotely Save | 本项目 |
|---|---|---|
| 加密算法 | AES-CBC / AES-CTR（RClone） | **AES-256-GCM**（内置 AuthTag 完整性校验） |
| IV | 由密码派生（同密码所有文件相同） | **每文件随机生成**（12 字节） |
| Salt | 8 字节 | **16 字节** |
| 加密实现 | crypto-browserify + rclone-crypt + Web Worker | **纯浏览器原生 `window.crypto.subtle`** |
| 存储服务 | 13 种 | **3 种**（S3 / WebDAV / OneDrive） |
| 兼容性 | — | **不向后兼容** Remotely Save（切换前务必备份） |

## 关键数字

| 指标 | 值 |
|---|---|
| TypeScript 源码 | ~9,900 行，23 个文件（`src/`，含 `langs/index.ts` 与 `types/pako.d.ts`；v26.1.8/26.1.9 清理了 syncer/fs* 与 V2 遗留引擎死代码） |
| 最大模块 | `src/settings.ts`（1,892 行，设置页）、`src/sync.ts`（1,576 行，同步算法）、`src/main.ts`（1,375 行，插件入口） |
| 打包产物 | `main.js`（esbuild bundle，CJS 格式） |
| 最低 Obsidian 版本 | 1.11.0 |
| 开源协议 | Apache-2.0 |

## Wiki 目录

| 文档 | 内容 |
|---|---|
| [01-architecture.md](./01-architecture.md) | 项目整体架构：分层设计、V3 同步流程与三方合并决策、并发与熔断模型、持久化布局 |
| [02-modules.md](./02-modules.md) | 主要模块职责：`src/` 下全部 23 个文件逐个说明 |
| [03-classes-and-functions.md](./03-classes-and-functions.md) | 关键类与函数说明：插件类、客户端类、同步算法、加密函数等 |
| [04-dependencies.md](./04-dependencies.md) | 依赖关系：运行时/开发依赖、安全版本覆盖（overrides）、Node polyfill 策略、内部模块依赖图 |
| [05-build-and-run.md](./05-build-and-run.md) | 运行方式：构建命令、esbuild 配置详解、安装调试、发布流程 |

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（watch + inline sourcemap）
npm run build        # 生产构建（压缩 main.js 并复制到 dist/）
npm run lint         # ESLint 检查 src/（当前 0 errors / 0 warnings）
```

安装到 Obsidian：把 `main.js`、`manifest.json`、`styles.css` 复制到
`<Vault>/.obsidian/plugins/third-party-sync/` 目录后重启 Obsidian 并启用插件。
详见 [05-build-and-run.md](./05-build-and-run.md)。

## 延伸阅读（仓库自带设计文档）

- `docs/sync_algorithm.md` — 同步算法说明
- `docs/encryption.md` — 加密方案细节
- `docs/minimal_intrusive_design.md` — 最小侵入设计
- `docs/import_export_some_settings.md` — 设置 URI 导入导出
- `docs/s3_cors_configure.md` / `docs/apache_cors_configure.md` — S3/Apache CORS 配置
- `docs/services_connectable_or_not.md` — 各服务连通性矩阵
- `docs/sync_ignoring_large_files.md` — 大文件跳过说明
- `docs/browser_env.md` / `docs/browser_env_cors.md` / `docs/browser_env_no_nodejs.md` / `docs/browser_env_oauth2_pkce.md` — 浏览器环境（CORS / 无 Node / OAuth2+PKCE）
- `docs/code_design.md` — 上游代码设计沿革
