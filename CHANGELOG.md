# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> 说明：本更新日志自 `26.1.2` 起维护。

## [26.2.1] - 2026-10-24

### 安全

- 通过 `overrides` 将传递依赖 `moment` 强制提升至 2.31.0，消除 GHSA-4p3w-j4w9-5jqw 公告（`obsidian` 官方包将其精确固定在 2.29.4；实际产物不打包该库，源码使用 Obsidian 宿主提供的 moment）。

### 工程与代码质量

- 按社区审查建议移除未使用的导入与常量：`main.ts` 的 `TAbstractFile` / `FileFolderHistoryRecord` / `iconNameStatusBar` / `iconNameLogs`，`sync.ts` 的 `requireApiVersion` / `API_VER_STAT_FOLDER` / `statFix`。ESLint 现为 0 errors / 0 warnings。

## [26.1.9] - 2026-10-23

### 修复

- **同步决策矩阵整体修正**（V3 规划器，五种同步模式 × 文件/文件夹 × prevSync 状态全闭环，跨多次同步状态稳定、无幽灵链）：
  - 增量推送（备份模式）：云端独有内容（文件/文件夹）不再被拉回本地重建，也不再被误判为"本地已删除"而删除云端备份；云端被外部删除而本地仍存在的文件会重新推送
  - 增量推送带删除：本地删除照常传播到云端；云端被外部删除而本地仍存在的文件/文件夹按"本地为主、云端桥接"原则重新推送；从未同步过的云端独有内容不会被顺手删除
  - 增量拉取：语义修正为"本地只增不减"——远端删除不再删除本地已有文件/文件夹；本地删除的文件若云端仍存在会被重新拉回；本地新建内容不上传，且不再在第二次同步时被误判"远端已删除"而移入回收站
  - 增量拉取带删除：远端删除照常传播到本地；本地删除被尊重（云端保留、不复活），本地已删文件夹不再被重建为空壳；本地新建内容不上传
  - 双向同步：内容流转与删除双向传播行为不变
  - 拉取模式下 mtime 相同但大小不同的歧义内容改为下载云端副本（此前一律上传本地，违反"拉取模式不写远端"原则）
- **修复设置项静默失效**：
  - `skipSizeLargerThan`（跳过大于该值的文件）此前在 V3 规划器中完全无效（尺寸限制逻辑仅存在于未接入主流程的 V2 遗留代码中）。现于 V3 决策后处理中生效：超限文件不上传/下载；恰好单侧超限而另一侧正常时弹出尺寸冲突弹窗供用户裁决；单位与设置下拉框一致（字节）
  - `conflictAction`（冲突时保留较新/较大版本）此前无任何逻辑消费。现于双向同步中生效：基于 prevSync 三方检测识别"双方自上次同步后均被修改"的真冲突，`keep_larger` 让较大文件胜出，`keep_newer`（默认）保持原有 mtime 流程；配套修正 prevSync 下载记录的 mtime 语义（改记远端 mtime），避免下载过的文件在后续同步中被误判为双方冲突
- **OneDrive 空文件安全化**：0 字节文件（未启用 E2E 加密时 OneDrive 无法存储）的上传跳过从执行器静默分支上移至规划层，转为专用决策 `skipUploadingOneDriveEmpty`（branch 81）。该决策不写入 prevSync 记录，下次同步仍视为"本地独有、从未同步"，从而消除此前双向同步模式下空文件在第二次同步被误判"远端已删除"而移入本地回收站的数据丢失链。五种同步模式下空文件均安全保留在本地，仅云端缺副本

### 国际化（i18n）

- 全部 14 种语言包的同步模式 3（增量拉取）描述重写为与实际语义一致（原文案仅称"远端创建或修改的文件会复制到本地"，未反映删除与本地新建行为，易误导用户）；顺带修正 ru 机翻误词（приёмка → извлечение）

### 工程与代码质量

- 移除 V2 遗留同步引擎全套死代码：`assignOperationToFileInplace`、`assignOperationToFolderInplace`、`getSyncPlan`、`doActualSync`，及 `main.ts` 中零调用的三个包装方法（`doActualSync` / `getSyncPlan` / `getSyncPlan2`，含一处历史参数错位），净删除约 850 行。V3 共用执行链（`splitThreeSteps` / `dispatchOperationToActual` / `syncIndividualItem` / `ensembleMixedStates` / `uploadExtraMeta`）经调用图核验后全部保留，运行时行为不受影响

## [26.1.8] - 2026-10-14

### 工程与代码质量

- 移除未接入主流程的实验性死代码：`syncer.ts`、`copyLogic.ts`、`fsAll/fsLocal/fsRemote/fsEncrypt.ts`、`entityTypes.ts`，及无引用的 base32 加密变体与 `CipherMethodType` 等关联类型，净删除约 1,245 行。运行时产物不受影响（相关代码本就被 tree-shaking 剔除）。

### 修复

- 按社区审查要求，`manifest.json` 的 description 移除 "Obsidian" 字样。

## [26.1.5] - 2026-09-13

### 修复

- 补全 `en.json`（回退基准）缺失的 35 个设置项 key（saverun / remoterun / sync_trash / sync_bookmarks / reset_sync_metadata / disable_s3_metadata_sync / debug_enabled / delsyncmap / autorun_second / webdav_depth_auto 等，原仅在 `zh_cn.json` 中存在）。此前英文及其他 13 种语言（含繁体中文）的这些设置项会显示原始 key 字符串，现已修复。随后已将这 35 个 key 完整翻译至全部 12 种非中文语言包（de/fr/es/it/ja/ko/nl/da/sv/no/ru/zh_tw），14 种语言包现已全部完整覆盖所有真实 key。

## [26.1.4] - 2026-09-12

### 国际化（i18n）

- 新增 **12 种** 完整本地化翻译文件（共 14 种），每种均覆盖全部 252 个键：
  - 繁體中文（zh_tw）、日本語（ja）、한국어（ko）
  - Deutsch（de）、Français（fr）、Español（es）、Italiano（it）
  - Nederlands（nl）、Dansk（da）、Svenska（sv）、Norsk（no）、Русский（ru）
- 所有 `{{变量}}` Mustache 占位符、换行符 `\n` 原样保留；技术术语（Obsidian / OneDrive / S3 / Webdav / CORS / Access Key ID 等）按各语言惯例原样保留。
- 插件通过 `moment.locale()` 自动跟随 Obsidian 界面语言切换，无需额外 UI 设置；缺键时回退到英文，不会因翻译缺失导致崩溃。

## [26.1.3] - 2026-09-04

### 问题修复

- 兼容部分 S3 兼容存储（如天翼云 `s3.cstcloud.cn`）：AWS SDK 默认会在 `PutObject` 上附加 `x-amz-checksum-crc32`，而部分服务不实现该校验和，导致上传被以校验和 mismatch（400/403）拒绝，表现为 `x-amz-checksum-crc32 mismatch`。现 S3 客户端配置 `requestChecksumCalculation: "WHEN_REQUIRED"`，仅当服务显式要求时才附带请求校验和。

## [26.1.2] - 2026-09-04

### 工程与代码质量

- 移除插件中无效的命令：删除「导出同步计划（JSON / 表格）」「从数据库导出终端日志」「查看同步状态」等已取消注册但残留的命令及对应死代码。
- 清理不再被代码引用的死翻译键（dead keys），减小打包体积。
- 补全缺失的翻译文案。