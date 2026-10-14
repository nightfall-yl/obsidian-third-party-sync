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
│               syncAlgoV2Notice / syncSizesConflictNotice    │
│               i18n.ts + langs/ (14 语言)                     │
├─────────────────────────────────────────────────────────────┤
│ 同步业务层     sync.ts  ← V3 主路径（getSyncPlanV3 /         │
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
│               entityTypes.ts / obsFolderLister.ts            │
│               presetRules.ts / debugMode.ts                  │
└─────────────────────────────────────────────────────────────┘
```

要点：

- **`remote.ts` 是唯一的云存储门面**。`sync.ts` 与 `main.ts` 只面对 `RemoteClient` 的 6 个方法（upload/list/download/delete/checkConnectivity/getUser），不感知具体服务商。
- **V3 是当前主同步算法**（`getSyncPlanV3`/`doActualSyncV3`）；`getSyncPlan`/`doActualSync` 是保留的旧版实现（带远端 metadata 文件），`main.ts` 中 `getSyncPlan2()`/`fetchMetadataFromRemote()` 等私有方法也属于旧路径遗留。
- 曾有一套 `syncer.ts` + `fs*` 的实验性抽象（未接入主流程），已在清理死代码时移除（v26.1.5 之后）。

## 3. 一次同步的端到端流程（V3 主路径）

入口：`main.ts` → `syncRun(triggerSource)`（`src/main.ts:119`），8 步状态推进：

```
(1) 起步        图标旋转、创建 .trash、互斥检查（syncStatus !== "idle" 则拒绝）
(2) 准备        new RemoteClient(...)，按 serviceType 初始化对应客户端
(3) 列远端      client.listFromRemote() → RemoteItem[]（key/lastModified/size/etag）
(4) 校验密码    isPasswordOk()：有密码时用候选密码解密首个远端 key 试错
(5) 还原远端态   getRemoteStates()：解密文件名 + 反查本地映射表 → FileOrFolderMixedState[]
(6) 收集本地     vault.getAllLoadedFiles() + listFilesInObsFolder()（配置目录/.trash）
(7) 读基线      loadPrevSyncRecordsByVault() ← IndexedDB prevsyncrecords 表
(8) 生成计划     getSyncPlanV3()：合并三方状态 → 每个文件/文件夹做出决策
(9) 执行计划     doActualSyncV3()：拆三步(建目录/删除/上传下载) → PQueue 并发执行
(10) 收尾       保存 prevSync 记录回 DB、更新 lastSynced、恢复图标
```

对应源码锚点：步骤 (3)-(9) 位于 `src/main.ts:245-307`；执行封装在 `src/main.ts:361-407`。

### 三方合并模型

V3 的核心思想：**不依赖远端 metadata 文件，而用本地 IndexedDB 中的 `prevSync` 记录作为上一次同步的"基线"**，对每个 key 比较三方状态：

```
本地现在 (existLocal/mtimeLocal)  +  远端现在 (existRemote/mtimeRemote)
                        +  基线 (prevSync: 上次同步时的 mtime/size)
                        → 决策 (DecisionType)
```

决策树实现在 `assignOperationToFileInplaceV3`（`src/sync.ts:1190`）与 `assignOperationToFolderInplaceV3`，典型分支：

| 本地 | 远端 | 基线 | 结果 |
|---|---|---|---|
| ✓ | ✓ | — | mtime 相等且大小相等 → `skipUploading`；不等则较新的一方覆盖（受同步方向约束） |
| ✓ | ✗ | ✓ | 远端已删除 → 双向模式连带删除本地（`keepRemoteDelHist`）；push-only 模式重新上传 |
| ✓ | ✗ | ✗ | 新本地文件 → `uploadLocalToRemote` |
| ✗ | ✓ | ✓ | 本地已删除 → 删除远端 |
| ✗ | ✓ | ✗ | 新远端文件 → `downloadRemoteToLocal` |
| ✗ | ✗ | ✓ | 双方都删除 → 跳过 |

每个决策记录 `decisionBranch` 编号（1-64+），便于导出同步计划时人工审计。

## 4. 并发与原子性模型

- **PQueue 任务队列**（`p-queue`）：`doActualSyncV3` 将操作按"建目录 → 删除 → 上传/下载"三步分层（`splitThreeSteps`），同一层内以 `settings.concurrency`（默认 5）并发执行；**WebDAV 强制并发 1**（`src/main.ts:365-368`），避免服务端过载。
- **失败熔断**：累积 3 个任务错误后 `queue.pause()` + `queue.clear()`，最后以 `AggregateError` 抛出全部错误（`src/sync.ts:1526-1545`）。
- **修改比例保护**：执行前统计 `realModifyDeleteCount / allFilesCount`，超过 `protectModifyPercentage`（默认 50%）直接中止并弹 Notice（`src/sync.ts:1454-1470`），防止误删/错误方向的全量覆盖。
- **同步互斥**：插件实例持有 `syncStatus`（`SyncStatusType`：idle/preparing/.../finish），非 idle 时拒绝再次进入；`alreadyScheduled` 标志防止保存触发重复排程。
- **首同步特殊处理**：`lastSynced == -1` 时强制将远端 6 个全局配置文件（`app.json`、`workspace.json` 等）改为下载方向（`src/sync.ts:1495-1501`）。

## 5. 持久化布局

| 介质 | 内容 | 写入方 |
|---|---|---|
| `data.json`（插件目录） | 全部用户设置（经 `normalConfigToMessy` 兼容格式包装） | `saveSettings()` |
| IndexedDB（`remotelysavedb`） | 7 张表：版本号、文件操作历史、本地⇄远端 key 映射、同步计划历史、vault ID 映射、日志、**prevSync 基线** | `localdb.ts` API |
| 云端对象存储 | 用户的笔记（加密或明文）+ 远端 metadata 文件（旧版路径） | 各 `remoteFor*.ts` |
| 云端 metadata 文件 | `.third-party-sync-metadata-on-remote.json`（readme + 反转 base64url 的 JSON，轻度混淆） | `metadataOnRemote.ts`（V3 主路径不再上传，仅兼容读取） |

关于**加密文件名的映射**：由于每文件随机 salt，同一明文文件名每次加密结果都不同，插件用 `syncmetadatahistory` 表维护 `localKey ⇄ remoteKey` 双向映射；`getRemoteStates` 通过 `getSyncMetaMappingByRemoteKeyAndVault`（`src/sync.ts:237`）把远端加密 key 还原成本地路径与真实 mtime/size。

## 6. 触发来源与状态机

- **触发来源** `SyncTriggerSourceType`（`src/baseTypes.ts:185`）：`manual`（点 ribbon/命令）、`auto`（定时/保存/远端检测）、`dry`（干跑：只生成计划不执行）、`autoOnceInit`（启动后首同步）。仅 manual/dry 弹 Notice，auto 静默。
- **同步状态** `SyncStatusType`（`src/sync.ts:56`）：`idle → preparing → getting_remote_files_list → ... → syncing → finish → idle`，驱动状态栏与 ribbon 图标。
- **远端变化检测**（`toggleSyncOnRemote`，`src/main.ts:1146`）：定时拉远端列表，与 prevSync 基线比对有无新增/丢失，发现变化才真正 `syncRun("auto")`；移动端在启动时额外检测一次。
