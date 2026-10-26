# 05 · 构建与运行

## 1. 命令速查

| 命令 | 作用 |
|---|---|
| `npm install` | 安装依赖（会应用 package.json `overrides` 的安全版本覆盖） |
| `npm run dev` | 开发构建：esbuild watch 模式，产物输出到 `dist/`，**inline sourcemap** 便于断点调试 |
| `npm run build` | 生产构建：esbuild 压缩 → `dist/main.js`，并复制 `manifest.json` / `styles.css` |
| `npm run lint` | ESLint 检查 `src/`（v26.2.1 清理死代码后 **0 errors / 0 warnings**） |
| `npm run format` | Prettier 格式化整个仓库 |
| `bash scripts/version.sh <版本号>` | **升级版本**（见第 5 节） |

> ⚠️ `npm run version` 无效——package.json 里的 `"version"` 是静态字段而非 script。升级版本请使用 `scripts/version.sh`。

## 2. esbuild 配置详解（esbuild.config.mjs）

```js
const production = process.env.NODE_ENV === "production";
const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/...", "@lezer/..."],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "dist/main.js",
  ... 详见下方插件与选项
});
```

### 自定义插件

| 插件 | 位置 | 作用 |
|---|---|---|
| `nodeCoreFallbackPlugin` | L42-68 | Node 内建模块映射：`buffer`/`assert`/`url`/`util`/`process` → 对应 browserify 包；`fs`/`http`/`https`/`os`/`vm` → **空模块**（命名空间 `empty-module`），因为插件在 Obsidian 浏览器环境运行 |
| `immediateSafePlugin` | L74-96 | 给 esbuild 产物中顶层立即执行的代码包一层 `try-catch`（防个别初始化异常拖垮整个插件加载） |
| `copyDistFiles` | L98-110 | 构建结束把 `manifest.json` / `styles.css` 复制到 `dist/` |

### 关键注入（`define` / `inject`）

| 注入 | 作用 |
|---|---|
| `global: "globalThis"` | 补 `global` 引用 |
| `"process.env.NODE_ENV": '"production"'` | 环境常量 |
| `DEFAULT_ONEDRIVE_CLIENT_ID` / `DEFAULT_ONEDRIVE_AUTHORITY` | OneDrive 应用凭据（构建期写死，源码中不含） |
| inject `esbuild.buffer-shim.js` | 全局 `Buffer` 垫片（配合 `buffer` polyfill） |

## 3. 安装与调试

1. `npm run dev`（或 `npm run build`）产出 `dist/`（`main.js` + `manifest.json` + `styles.css`）。
2. 复制三个文件到 `<Vault>/.obsidian/plugins/third-party-sync/`（或建符号链接指向 `dist/`，改代码后无需重复复制）。
3. 重启 Obsidian → 设置 → 第三方插件 → 启用 **Third-party Sync**。
4. 首次启用会弹**同步算法知情同意**弹窗（`SyncAlgoV2Modal`），同意后才启用全部同步功能；不同意则插件自动卸载。

### 调试手段

| 手段 | 说明 |
|---|---|
| 源码映射 | `npm run dev` 产物内联 sourcemap，可在 DevTools 直接定位 `src/*.ts` |
| 干跑 | 命令 **Third-party Sync: Run sync (dry-run)**：完整走一遍"列远端 → 校验密码 → 生成计划"，**不执行任何上传/下载/删除**，适合改动后验证决策结果 |
| 调试模式 | 设置 → 调试 → 开启"调试模式"：恢复 8 步详细通知（「1/8 OneDrive 正在准备」…），控制台出现 `debug` 级日志（经 loglevel） |
| 状态栏实时进度 | 同步期间状态栏显示当前步骤与「正在交换数据 45/120（37%）」，结束后显示"上次同步于 …" |
| 调试区修复按钮 | 设置 → 调试（按破坏性从轻到重）：删除同步映射记录 → 重置远端同步元数据 → 重设本地缓存和数据库 → 清空远端并重新推送（两阶段弹窗确认） |

插件首次加载时会自动在自身配置目录（`.obsidian/plugins/third-party-sync/`）写入 `.gitignore`（内容为 `data.json`），避免把用户凭据提交进 vault 的 git 仓库（`main.ts:1344`）。

## 4. 目录速览

```
.
├── esbuild.config.mjs        # esbuild 打包配置（见上）
├── manifest.json              # Obsidian 插件清单（id: third-party-sync，minAppVersion 1.11.0）
├── versions.json              # 插件版本 ↔ minAppVersion 映射
├── package.json               # 依赖与 scripts（overrides 见 04）
├── scripts/
│   └── version.sh             # 版本升级脚本（同步改 3 个 JSON）
├── dist/                      # 构建产物（.gitignore）
├── docs/                      # 用户向设计文档（同步算法/加密/CORS/浏览器环境等）
├── wiki/                      # 本 Code Wiki
└── src/                       # TypeScript 源码（23 个文件，~9,900 行）
    ├── main.ts                # 插件入口 ThirdPartySyncPlugin
    ├── settings.ts            # 设置页（1,892 行）
    ├── sync.ts                # V3 同步算法（1,576 行）
    ├── baseTypes.ts           # 核心类型 + DecisionType/SyncDirectionType
    ├── wipeRemoteNotice.ts    # 「清空远端并重新推送」两阶段弹窗
    ├── syncAlgoV2Notice.ts    # 算法知情同意弹窗
    ├── syncSizesConflictNotice.ts # 大小冲突弹窗
    ├── remote.ts              # 云存储统一门面 RemoteClient
    ├── remoteForS3.ts         # S3 后端（含 ObsHttpHandler/分片/限流重试）
    ├── remoteForWebdav.ts     # WebDAV 后端（depth 自适应）
    ├── remoteForOnedrive.ts   # OneDrive 后端（OAuth2+PKCE）
    ├── localdb.ts             # localforage/IndexedDB（7 张表，含 prevSync 基线）
    ├── metadataOnRemote.ts    # 远端 metadata 文件格式
    ├── encrypt.ts             # AES-256-GCM 加密（fork 核心）
    ├── configPersist.ts       # data.json 包装格式互转
    ├── importExport.ts        # 设置 URI 导入导出
    ├── i18n.ts + langs/       # 国际化（14 个语言包）
    ├── misc.ts / moreOnLog.ts / obsFolderLister.ts / presetRules.ts
    ├── stubs/empty.js         # 空模块占位
    └── types/pako.d.ts        # 类型声明
```

## 5. 版本升级与发布流程

1. **升级版本**：`bash scripts/version.sh 26.2.5`（示例）——脚本会同步修改 `manifest.json`、`package.json`、`versions.json`。
2. **本地验证**：`npm run lint` && `npm run build` 通过。
3. **提交**：commit 后推送到 `main`。
4. **打 tag 触发 Release**：`git tag 26.2.5 && git push origin 26.2.5`。
5. GitHub Actions（`.github/workflows/release.yml`）自动创建 Release：以仓库当前文件（含 `manifest.json`、`versions.json`）作为附件上传，并执行 `attest-build-provenance` 生成构建来源证明（工作流本身不执行构建）。
6. **Obsidian 社区插件上架**：release 中的 `manifest.json` / `main.js` / `versions.json` 文件 URL 即为上架所需素材。
