# 05 · 运行与构建

## 1. 环境要求

- Node.js（建议 ≥ 18，配合 esbuild 0.28）
- npm
- 测试用 Obsidian（桌面端），或用 BRAT 安装开发版

## 2. 常用命令（package.json scripts）

| 命令 | 实际执行 | 说明 |
|---|---|---|
| `npm install` | — | 安装依赖（含 Node polyfill 依赖） |
| `npm run dev` | `node esbuild.config.mjs` | 开发模式：**watch 增量构建 + inline sourcemap**，不压缩，持续监听 `src/` |
| `npm run build` | `node esbuild.config.mjs production` | 生产构建：压缩（minify）、无 sourcemap，产物 `main.js`，并把 `main.js / manifest.json / styles.css` 复制到 `dist/` |
| `npm run lint` | `eslint src/` | ESLint 检查（配置 `eslint.config.mjs`，含 obsidianmd 官方规则） |
| `npm run format` | `prettier --write .` | 全仓库格式化 |
| `npm run clean` | `rm -f main.js` | 清理产物 |
| `bash scripts/version.sh <ver>` | sed + python | **三文件联动升版**：manifest.json、package.json、package-lock.json 同步写入同一版本号 |

> 仓库**没有测试框架**与 test script；质量保障靠 ESLint + TS 类型检查 + 手动验证。

## 3. esbuild 配置详解（esbuild.config.mjs）

入口 `src/main.ts` → 产物 `main.js`，`format: "cjs"`、`platform: "browser"`、`target: "es2018"`、`treeShaking: true`。

### 3.1 external（运行时由 Obsidian 提供）

`obsidian`、`electron`、`@codemirror/*`、`@lezer/*` —— 不打包进产物，减小体积并复用宿主模块。

### 3.2 `nodeCoreFallbackPlugin`（L42-68）

- `assert/buffer/crypto/path/stream/url/util`（含 `node:` 前缀形式）→ 别名到对应 browserify 垫片；
- `fs/http/https/os/vm` → `empty-module` 命名空间（`export default {}`），因为只有传递依赖引用它们。

### 3.3 `immediateSafePlugin`（L74-96）

将 localforage 内嵌的 `lie` 库中 `immediate` 模块整体替换为 `setTimeout` 实现。原因：原实现链路 `MutationObserver → setImmediate+MessageChannel → document.createElement("script")` 中的动态 script 会**违反 Obsidian CSP**。这是本 fork 特有的兼容性修补。

### 3.4 define 与注入

```js
"process.env.DEFAULT_ONEDRIVE_CLIENT_ID":  构建期环境变量（默认 ""）
"process.env.DEFAULT_ONEDRIVE_AUTHORITY":  构建期环境变量（默认 ""）
"process.env.NODE_ENV": "production" | "development"
global: "globalThis"
```

OneDrive 的默认 clientID/authority 在构建时注入（`remoteForOnedrive.ts` 的 `DEFAULT_ONEDRIVE_CONFIG` 读取）。**若构建时未提供，OneDrive 授权界面将缺少默认应用 ID，需要用户自填 clientID**。

### 3.5 其他

- `inject: ["./esbuild.buffer-shim.js"]`：注入全局 `Buffer` 垫片（内容：`module.exports = { Buffer }`）。
- 生产构建后 `copyDistFiles()` 把三个发布文件复制到 `dist/`，方便直接复制进 vault。

## 4. 安装到 Obsidian（三种方式）

1. **手动安装**：
   ```bash
   npm run build
   mkdir -p "<Vault>/.obsidian/plugins/third-party-sync"
   cp main.js manifest.json styles.css "<Vault>/.obsidian/plugins/third-party-sync/"
   # 重启 Obsidian → 设置 → 第三方插件 → 启用 Third-party Sync
   ```
2. **BRAT**：添加仓库 `nightfall-yl/obsidian-third-party-sync`，自动跟踪 release。
3. **下载 Release**：从 GitHub Releases 取 `main.js`、`manifest.json`、`styles.css` 三个文件放入插件目录。

> 插件首次加载会自动在插件配置目录写 `.gitignore`（内容 `data.json`），防止敏感设置被 vault 内的 git 同步泄露（`main.ts:1376 tryToAddIgnoreFile`）。首次启用会弹出"同步算法知情同意"弹窗，同意后才启用全部功能。

## 5. 调试手段

| 手段 | 入口 | 作用 |
|---|---|---|
| 干跑 | 命令面板 "start-sync-dry-run" / 设置页按钮 | 只生成同步计划（`triggerSource="dry"`），不执行任何写操作，观察每项 `decision` |
| 调试模式 | 设置页 `debugEnabled` | `log.setLevel("debug")`，Notice 显示 8 步详细进度 |
| 日志入库 | 设置页 `logToDB` | 日志写入 IndexedDB `loggeroutput` 表，自动清理过期记录 |
| 同步计划导出 | `debugMode.ts` | 把 DB 中的同步计划/日志导出为 `_debug_remotely_save/` 下的 Markdown 表格（`sync_plans_hist_exported_on_*` / `log_hist_exported_on_*`） |
| 源码映射 | `npm run dev` | inline sourcemap，Obsidian 控制台可直接定位 TS 源码 |

## 6. 发布流程

1. 版本联动：`bash scripts/version.sh 26.1.6` → manifest.json / package.json / package-lock.json 同步。
2. 更新 `CHANGELOG.md`（自 26.1.2 起维护，Keep a Changelog 格式）与 `versions.json`（版本 → minAppVersion 映射）。
3. 提交后打 tag 并推送：`git tag 26.1.6 && git push origin 26.1.6`。
4. GitHub Actions（`.github/workflows/release.yml`）自动触发：
   - 用 `softprops/action-gh-release` 把 **main.js、manifest.json、styles.css** 发布为 Release 资产（自动生成 release notes）；
   - 用 `attest-build-provenance` 为三个资产生成构建来源证明（attestation）。

> 注意：CI 直接打包**仓库中已提交的 main.js**（工作流中没有 build 步骤），因此发布前必须确保本地 `npm run build` 后的 `main.js` 已提交入库。

## 7. 项目目录速览

```
obsidian-third-party-sync/
├── src/                    # 全部 TypeScript 源码（24 文件，~10.6k 行）
│   ├── main.ts             # 插件入口
│   ├── sync.ts             # 同步算法（V3 主路径 + 旧版）
│   ├── settings.ts         # 设置页
│   ├── remote*.ts          # 云存储后端（门面 + S3/WebDAV/OneDrive）
│   ├── localdb.ts          # IndexedDB 数据层
│   ├── encrypt.ts          # AES-256-GCM 加密
│   ├── i18n.ts + langs/    # 国际化（14 语言）
│   └── ...
├── esbuild.config.mjs      # 构建配置（含 2 个自定义插件）
├── manifest.json           # 插件清单（id/version/minAppVersion）
├── versions.json           # 版本映射
├── styles.css              # 样式
├── main.js                 # 构建产物（提交入库，供 Release 直接使用）
├── dist/                   # 本地构建输出副本
├── docs/                   # 设计文档（算法/加密/CORS/兼容性）
├── scripts/version.sh      # 三文件版本联动脚本
├── .github/workflows/release.yml  # tag 触发的发布流水线
└── wiki/                   # 本 Code Wiki
```
