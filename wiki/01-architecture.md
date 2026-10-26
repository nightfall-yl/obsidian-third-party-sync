# 01 · 整体架构

## 1. 技术栈与运行环境

| 项 | 说明 |
|---|---|
| 语言 | TypeScript 4.6（`tsconfig.json`，目标 ES2018） |
| 运行环境 | Obsidian（Electron 桌面端 / Capacitor 移动端），非 Node |
| 宿主 API | `obsidian` ^1.4.11（运行时 external，不打包进产物） |
| 打包 | esbuild（`esbuild.config.mjs`），单文件 bundle → `main.js`（CJS） |
| 加密 | 浏览器原生 `window.crypto.subtle`（无 Node crypto 依赖） |
| 本地存储 | `data.json`（设置）+ `localforage`/IndexedDB（同步元数据） |

## 2. 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│ UI / 入口层    main.ts (ThirdPartySyncPlugin)                │
│               settings.ts (设置Tab+OAuth弹窗)                │
│               syncAlgoV2Notice / syncSizesConflictNotice     │
│               wipeRemoteNotice (清空远端弹窗)                 │
│               i18n.ts + langs/ (14 语言)                     │
├─────────────────────────────────────────────────────────────┤
│ 同步业务层     sync.ts  ← V3 唯一路径（getSyncPlanV3 /        │
│               doActualSyncV3 / isPasswordOk / getRemoteStates)│
├─────────────────────────────────────────────────────────────┤
│ 云存储抽象     remote.ts (RemoteClient 门面，按 serviceType  │
│               分发)                                          │
│   ├─ remoteForS3.ts       (@aws-sdk/client-s3)              │
│   ├─ remoteForWebdav.ts   (webdav 库封装)                    │
│   └─ remoteForOnedrive.ts (Graph API + OAuth2/PKCE)          │
├─────────────────────────────────────────────────────────────┤
│ 数据与安全     localdb.ts (localforage/IndexedDB 7 张表)      │
│               metadataOnRemote.ts (远端元数据文件格式)         │
│               encrypt.ts (AES-256-GCM + PBKDF2)             │
│               configPersist.ts / importExport.ts             │
├─────────────────────────────────────────────────────────────┤
│ 基础设施       misc.ts / moreOnLog.ts / baseTypes.ts         │
│               obsFolderLister.ts / presetRules.ts            │
└─────────────────────────────────────────────────────────────┘
```

要点：

- **`remote.ts` 是唯一的云存储门面**。`sync.ts` 与 `main.ts` 只面对 `RemoteClient` 的 6 个方法（upload/list/download/delete/checkConnectivity/getUser），不感知具体服务商。
- **V3 是唯一同步算法**（`getSyncPlanV3`/`doActualSyncV3`）：不依赖远端 metadata 文件，用本地 prevSync 基线做三方合并。上游的 V2 遗留引擎（`getSyncPlan`/`doActualSync`/`getSyncPlan2` 等）已在 v26.1.9 移除，未接入主流程的实验性 `syncer.ts`/`fs*` 抽象已在 v26.1.8 移除；`sync.ts` 中保留的 `getRemoteMetadata`/`fetchMetadataFile`/`uploadExtraMeta` 仅服务于"重置远端同步元数据"调试功能与密码校验的兼容识别。

## 3. 一次同步的端到端流程（V3 主路径）

入口：`main.ts` → `syncRun(triggerSource)`（`src/main.ts:122`）：

```
(1) 起步        创建 .trash（如启用回收站同步）、互斥检查（syncStatus !== "idle" 则拒绝）
(2) 准备        new RemoteClient(...)，按 serviceType 初始化对应客户端
(3) 列远端      client.listFromRemote() → RemoteItem[]（key/lastModified/size/etag）
(4) 校验密码    isPasswordOk()：有密码时用候选密码解密首个远端 key 试错
(5) 还原远端态   getRemoteStates()：解密文件名 + 反查本地映射表 → FileOrFolderMixedState[]
(6) 收集本地     vault.getAllLoadedFiles() + listFilesInObsFolder()（配置目录/.trash）
(7) 读基线      loadPrevSyncRecordsByVault() ← IndexedDB prevsyncrecords 表
(8) 生成计划     getSyncPlanV3()：合并三方状态 → 每个文件/文件夹做出 decision
(9) 执行计划     doActualSyncV3()：拆三步(建目录/删除/上传下载) → PQueue 并发执行
(10) 收尾       保存 prevSync 记录回 DB、更新 lastSynced、恢复图标
```

步骤 (1)-(10) 位于 `src/main.ts:122-414`；执行封装在私有方法 `doActualSyncV3`（`src/main.ts:434`，WebDAV 强制并发 1 后转发给 `sync.ts` 的同名导出函数）。

### 通知与状态栏策略（v26.2.4）

- **通知**：自动触发（保存/自动运行/远端运行/启动运行）全程静默；手动触发不再弹"正在交换数据"开始通知，仅保留完成结果通知（失败/冲突通知不受影响）；dry 模式保留开始与完成提示。
- **调试模式**（`debugEnabled`）：恢复 8 步详细通知（`syncrun_step0`–`syncrun_step8`，如「1/8 OneDrive 正在准备」）。
- **状态栏实时进度**：`stepMsg`/`statusBarStepFunc` 在每个步骤点把文案镜像到状态栏（非调试格式如「1/2 OneDrive 正在交换数据」，调试模式序号为 7/8）；数据交换阶段经 `callbackSyncProcess` 回调逐项刷新为「1/2 OneDrive 正在交换数据 45/120（37%）」（每完成一个上传/下载更新一次，删除与建文件夹不计数），同步结束自动恢复"上次同步时间"显示。
- **服务名显示**：内部标识符经 `SERVICE_DISPLAY_NAMES`（`src/main.ts:95`）统一显示为 S3 / OneDrive / WebDAV。

### 三方合并模型

V3 的核心思想：**不依赖远端 metadata 文件，而用本地 IndexedDB 中的 `prevSync` 记录作为上一次同步的"基线"**，对每个 key 比较三方状态：

```
本地现在 (existLocal/mtimeLocal)  +  远端现在 (existRemote/mtimeRemote)
                        +  基线 (prevSync: 上次同步时的 mtime/size)
                        → 决策 (DecisionType)
```

决策树实现在 `assignOperationToFileInplaceV3`（内部为 `assignOperationToFileInplaceV3Inner`，`src/sync.ts:728`）与 `assignOperationToFolderInplaceV3`（`src/sync.ts:1014`），全部决策出口使用**自解释的 `decision` 动作名**（v26.1.6 起移除了旧版 branch 编号体系），约 40 个决策出口。典型分支：

| 本地 | 远端 | 基线 | 双向模式结果 |
|---|---|---|---|
| ✓ | ✓ | — | mtime 相等且大小相等 → `skipUploading`；不等则较新的一方覆盖 |
| ✓ | ✓ | 双方均晚于基线 | 真冲突：`keep_larger` 让较大者胜出，`keep_newer`（默认）走 mtime 流程 |
| ✓ | ✓ | 无基线且一方为空文件 | 空文件保护：空的一方让位于非空一方（冲突解决非"禁用"时生效） |
| ✓ | ✗ | ✓ | 远端已删除 → 连带删除本地（`keepRemoteDelHist`）；推送模式改为重新上传 |
| ✓ | ✗ | ✗ | 新本地文件 → `uploadLocalToRemote` |
| ✗ | ✓ | ✓ | 本地已删除 → 删除远端（`uploadLocalDelHistToRemote`）；拉取模式改为重新下载 |
| ✗ | ✓ | ✗ | 新远端文件 → `downloadRemoteToLocal` |
| ✗ | ✗ | ✓ | 双方都删除 → 跳过 |

`DecisionType`（`src/baseTypes.ts:142`）共 16 个变体：5 个文件基础动作（`skipUploading`/`uploadLocalToRemote`/`downloadRemoteToLocal`/`uploadLocalDelHistToRemote`/`keepRemoteDelHist`）+ 4 个文件夹动作（`createFolder`/`skipFolder`/`uploadLocalDelHistToRemoteFolder`/`keepRemoteDelHistFolder`）+ 6 个尺寸阈值动作 + 1 个 OneDrive 空文件动作（`skipUploadingOneDriveEmpty`）；V3 决策树实际产出其中 14 种。

方向特化：五种同步方向（双向 / 增量推送 / 推送带删除 / 增量拉取 / 拉取带删除）在决策树内通过 `isPullOnlyMode`/`isPushOnlyMode`/`isPullDeleteMode`/`isPushDeleteMode` 分流——推送模式"本地为主、远端为镜像"（远端独有内容不拉回、远端丢失重新推送），拉取模式"本地只增不减"（远端删除不删本地、本地新建不上传），带删除变体让删除按方向传播。`skipSizeLargerThan` 在决策后处理中生效（超限不上传/下载，单侧超限转 `error*TooLargeConflict*` 弹窗裁决）；OneDrive 明文 0 字节文件在规划层转为 `skipUploadingOneDriveEmpty`（不写 prevSync，避免下次同步误判为远端删除）。

## 4. 并发与原子性模型

- **PQueue 任务队列**（`p-queue`）：`doActualSyncV3` 将操作按"建目录 → 删除 → 上传/下载"三步分层（`splitThreeSteps`，删除层再按深度从深到浅），同一层内以 `settings.concurrency`（默认 5）并发执行；**WebDAV 强制并发 1**（`src/main.ts:438-441`），避免服务端过载。
- **失败熔断**：累计 3 个文件失败后 `queue.pause()` + `queue.clear()` 暂停剩余队列，最后以 `AggregateError` 抛出全部错误（`src/sync.ts:1200-1219`）；错误信息经 `extractRemoteErrorDetails`（`src/sync.ts:314`）提取 HTTP 状态码、S3 错误码、响应类型与 requestId，穿透 AWS SDK 的 "UnknownError" 包装。
- **修改比例保护**：执行前统计 `realModifyDeleteCount / allFilesCount`，达到 `protectModifyPercentage`（默认 50%；设 100 且全量修改时放行）直接中止并弹 Notice（`src/sync.ts:1129-1144`），防止误删/错误方向的全量覆盖。
- **同步互斥**：插件实例持有 `syncStatus`（`SyncStatusType`：idle/preparing/.../finish），非 idle 时拒绝再次进入；`alreadyScheduled` 标志防止保存触发重复排程。
- **首同步特殊处理**：`lastSynced == -1` 时强制将远端 6 个全局配置文件（`app.json`、`appearance.json`、`core-plugins-migration.json`、`core-plugins.json`、`graph.json`、`workspace.json`）改为下载方向（`src/sync.ts:1169-1175`）。
- **prevSync 写回规则**：同步完成后仅记录同步后仍存在的一侧/两侧项；单向跳过项（推送模式的远端独有项、拉取模式的本地独有项）不写入，避免下次同步被幻判为"对侧已删除"；下载项的 mtime 记录远端 mtime，避免误判真冲突（`src/sync.ts:1223-1268`）。

## 5. 持久化布局

| 介质 | 内容 | 写入方 |
|---|---|---|
| `data.json`（插件目录） | 全部用户设置（经 `normalConfigToMessy` 兼容格式包装） | `saveSettings()` |
| IndexedDB（`remotelysavedb`） | 7 张表：版本号、文件操作历史、本地⇄远端 key 映射、同步计划历史（保留不再写）、vault ID 映射、日志（保留不再写）、**prevSync 基线** | `localdb.ts` API |
| 远端对象存储 | 用户的笔记（加密或明文） | 各 `remoteFor*.ts` |
| 远端 metadata 文件 | `.third-party-sync-metadata-on-remote.json`（readme + 反转 base64url 的 JSON，轻度混淆） | 仅"重置远端同步元数据"调试功能写入；V3 主路径不再上传，仅兼容读取 |

关于**加密文件名的映射**：由于每文件随机 salt，同一明文文件名每次加密结果都不同，插件在每次上传时用 `upsertSyncMetaMappingDataByVault` 维护 `syncmetadatahistory` 表中的 `localKey ⇄ remoteKey` 映射；`getRemoteStates` 通过 `getSyncMetaMappingByRemoteKeyAndVault`（`src/sync.ts:235`）把远端加密 key 还原成本地路径与真实 mtime/size。

V3 重构后**同步计划不再写入数据库**：`syncplanshistory` / `loggeroutput` 两个 store 保留以兼容旧库 schema，历史数据留存但不再读写，"导出同步计划/导出日志历史"功能已随 v26.2.2 移除。

## 6. 触发来源与状态机

- **触发来源** `SyncTriggerSourceType`（`src/baseTypes.ts:187`）：`manual`（点 ribbon/命令）、`auto`（定时/保存/远端检测）、`dry`（干跑：只生成计划不执行）、`autoOnceInit`（启动后首同步）。通知策略见上文第 3 节。
- **同步状态** `SyncStatusType`（`src/sync.ts:54`）：`idle → preparing → getting_remote_files_list → ... → syncing → finish → idle`，驱动状态栏与 ribbon 图标。
- **远端变化检测**（`toggleSyncOnRemote`，`src/main.ts:1159`）：定时拉远端列表并与 prevSync 基线比对有无新增/丢失，发现变化才真正 `syncRun("auto")`；移动端在启动时额外检测一次。
- **保存触发**（`toggleSyncOnSave`，`src/main.ts:1232`）：监听 vault `modify` 事件防抖延迟同步；另有每 30 秒的配置目录扫描，发现未同步变更才排程。
