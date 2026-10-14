# 02 · 主要模块职责

`src/` 共 24 个 TS 文件（v26.1.5 已移除实验性的 syncer/fs* 死代码），按功能分组说明。每节给出：职责 / 关键导出 / 上下游关系。

## A. 入口与 UI 层

### `main.ts`（1,455 行）— 插件入口
- 默认导出 **`ThirdPartySyncPlugin extends Plugin`**，是全插件的生命周期与状态中枢。
- 职责：加载/保存设置、初始化 i18n 与 IndexedDB、注册 ribbon 图标与 2 个命令（`start-sync`、`start-sync-dry-run`）、注册 3 个 `obsidian://` 协议处理器（设置导入 `third-party-sync`、OneDrive 回调 `third-party-sync-onedrive`）、4 种自动同步定时器、状态栏与同步互斥。
- 默认设置对象 `DEFAULT_SETTINGS`（L60-86）：`serviceType: "s3"`、`concurrency: 5`、`syncDirection: "bidirectional"`、`protectModifyPercentage: 50`、`deleteToWhere: "system_trash"`、各定时器 `-1`（关闭）等。
- 上游：几乎依赖所有模块；核心协作对象为 `sync.ts` 的 6 个导出函数与 `RemoteClient`。

### `settings.ts`（1,859 行）— 设置页
- **`ThirdPartySyncSettingTab extends PluginSettingTab`**（L424）：按 `serviceType` 动态显示 S3/WebDAV/OneDrive 分组（L424-485）；S3 配置项区域含 endpoint、region、AK/SK、bucket、path-style、分片并发、CORS 提示与连通性检查按钮（L548-721）；其余全局项：同步方向、触发定时、并发、密码、同步范围（配置目录/.trash/书签/下划线文件）、冲突策略、删除目标、修改比例保护、大小阈值、语言、日志、调试、设置导入导出。
- **`OnedriveAuthModal`**（L225）/ **`OnedriveRevokeAuthModal`**（L284）：OneDrive 授权与撤销弹窗。
- 上游：仅 `main.ts` 实例化；内部使用 `remoteForS3`/`remoteForOnedrive` 的默认配置与连通性检查。

### `syncAlgoV2Notice.ts`（68 行）— 算法确认弹窗
- `SyncAlgoV2Modal`：首次启用时展示同步算法说明，用户同意才启用全部同步功能，不同意则 `plugin.unload()`（`main.ts:894-908`）。

### `syncSizesConflictNotice.ts`（94 行）— 大小冲突弹窗
- `SizesConflictModal`：`doActualSyncV3` 检测到超阈值文件（`sizesGoWrong` 非空）时展示冲突文件列表（加密名、本地/远端字节数）并提供复制详情按钮；同步因此中止（`sync.ts:1444-1448`）。

### `i18n.ts`（47 行）+ `langs/index.ts`（31 行）— 国际化
- `I18n` 类：`t(key, vars)` 取词，`auto` 模式经 `moment.locale()` 跟随 Obsidian 语言；缺键回退英文；变量用 **Mustache** 渲染。
- `langs/index.ts` 聚合 `LANGS`：14 种语言（en/zh_cn/zh_tw/ja/ko/de/fr/es/it/nl/da/sv/no/ru）。`TransItemType = string`，键缺失不会破坏构建。

## B. 同步业务层

### `sync.ts`（2,109 行）— 同步算法核心（最重要模块）
- 导出：`SyncStatusType`、`isPasswordOk`（L88）、`getRemoteMetadata`（L159，旧路径）、`getRemoteStates`（L215）、`fetchMetadataFile`（L285，旧路径）、**`getSyncPlanV3`**（L1066）、**`doActualSyncV3`**（L1426）、`getSyncPlan`（L1573，旧版）、`uploadExtraMeta`（L1682，旧路径）、`doActualSync`（L1983，旧版）。
- 内部关键函数：`ensembleMixedStates`（L354-556，合并远端态/本地文件/配置目录/删除历史）、`assignOperationToFileInplaceV3`（L1190，文件决策树）、`assignOperationToFolderInplaceV3`（文件夹决策）、`splitThreeSteps`（拆分建目录/删除/上传下载三步）、`syncIndividualItem`（按决策执行单项：上传/下载/删除/建目录）。
- 过滤逻辑（L310-352）：决定哪些配置目录项、`.trash`、隐藏文件、metadata 文件参与同步。

## C. 云存储后端层

### `remote.ts`（237 行）— 统一门面
- **`RemoteClient`**：构造时按 `serviceType` 保存对应配置并创建内部客户端；WebDAV/OneDrive 需要传入 `vaultName` 与 `saveUpdatedConfigFunc`（客户端会**原地修改配置**并需要回写，如 WebDAV depth 探测结果、OneDrive 刷新 token）。
- 方法：`uploadToRemote` / `listFromRemote` / `downloadFromRemote` / `deleteFromRemote` / `checkConnectivity` / `getUser` / `revokeAuth`，内部按类型转发到三个实现模块。

### `remoteForS3.ts`（642 行）
- `DEFAULT_S3_CONFIG`（L178）、`getS3Client`（L227，配置 `requestChecksumCalculation: "WHEN_REQUIRED"` 兼容天翼云等不实现 crc32 校验的服务，见 CHANGELOG 26.1.3）。
- **`ObsHttpHandler extends FetchHttpHandler`**（L66）：把 AWS SDK 的 HTTP 层替换为 Obsidian `requestUrl`，绕过浏览器 CORS 限制。
- 上传支持 5MB 分片（`@aws-sdk/lib-storage` multipart，`partsConcurrency` 并发）；列出用分页 `ListObjectsV2`；上传/下载/删除均支持密码加密与 metadata 同步（可用 `disableS3MetadataSync` 关闭）。

### `remoteForWebdav.ts`（588 行）
- `DEFAULT_WEBDAV_CONFIG`（L114）、**`WrappedWebdavClient`**（L174）、`getWebdavClient`（L284）。
- **Depth 自适应**：`auto_unknown` 初始，尝试 `PROPFIND Depth: infinity`，失败自动降级 `auto_1` 并写回配置（配合 `presetRules.ts` 对已知服务的预设）。
- 认证支持 digest/basic；目录树用 BFS 遍历；WebDAV 同步全程并发 1（`main.ts:365`）。

### `remoteForOnedrive.ts`（1,059 行）— 最复杂后端
- **OAuth2 + PKCE 全流程**：`getAuthUrlAndVerifier`（L74，生成授权 URL + code verifier）、`sendAuthReq`（L123，用回调 code 换 token）、`sendRefreshTokenReq`（L188，刷新）、`setConfigBySuccessfullAuthInplace`（L225，写回设置）。
- **`WrappedOnedriveClient`**（L539，L539-585）：封装 `@microsoft/microsoft-graph-client`；初始化时检查 token 过期自动刷新，确保 `approot` 下以 vault 名命名的同步文件夹存在。
- 回调经 `obsidian://third-party-sync-onedrive` 协议处理器完成（`main.ts:751-852`）；凭据 80 天强制过期（`OAUTH2_FORCE_EXPIRE_MILLISECONDS`，`baseTypes.ts:117`）需重新授权；`deltaLink` 支持增量列目录；`DEFAULT_ONEDRIVE_CONFIG` 的 clientID/authority 由 esbuild `define` 注入。

## D. 数据与安全层

### `localdb.ts`（732 行）— 本地 IndexedDB
- 基于 localforage，库名 `remotelysavedb`，当前 schema 版本 `20250430`。
- 7 张表（L14-20）：`schemaversion`、`filefolderoperationhistory`（文件删除/重命名历史，由 vault `delete`/`rename` 事件实时写入，`main.ts:687-706`）、`syncmetadatahistory`（本地⇄远端 key 映射，`SyncMetaMappingRecord`）、`syncplanshistory`、`vaultrandomidmapping`、`loggeroutput`、**`prevsyncrecords`**（V3 三方合并的基线，`PrevSyncRecord`）。
- 关键 API：`prepareDBs(vaultBasePath, oldID) → {db, vaultRandomID}`（含迁移链 20211114→20220108→20220326→20250430）、`loadPrevSyncRecordsByVault`、`savePrevSyncRecordsByVault`、`insertDeleteRecordByVault`、`insertRenameRecordByVault`、`insertLoggerOutputByVault`、`clearExpired*`。
- 所有记录 key 均以 `vaultRandomID` 前缀隔离多 vault 数据。

### `metadataOnRemote.ts`（127 行）— 远端元数据格式
- metadata 文件名：`.third-party-sync-metadata-on-remote.json` / `.bin`；兼容读取上游 `_remotely-save-metadata-on-remote.*` 遗留名。
- 格式：`{ readme, d }`，`d = reverse(base64url(JSON))`——轻度混淆防止用户手改；内容为 `{ version, generatedWhen, deletions: DeletionOnRemote[] }`（远端删除历史，旧版算法用）。
- `serializeMetadataOnRemote` / `deserializeMetadataOnRemote` / `isEqualMetadataOnRemote`（仅比较 deletions）。

### `encrypt.ts`（~140 行）— 加密实现（fork 核心改进）
- `encryptArrayBuffer`：随机 16B salt + PBKDF2(SHA-256, 20,000 轮) 派生 256bit key → AES-GCM（随机 12B IV）→ 输出 `[salt(16) | iv(12) | ciphertext]`。
- `decryptArrayBuffer`、`encryptStringToBase64url` / `decryptBase64urlToString`（**文件名加密**：AES-GCM 后 base64url 无填充编码，与 RClone Crypt 的文件名编码格式兼容）、`getSizeFromOrigToEnc`（encSize = origSize + 16 + 16 + 12）。
- 全部走 `window.crypto.subtle`，无 Node polyfill 依赖。

### `configPersist.ts`（59 行）
- `messyConfigToNormal` / `normalConfigToMessy`：`data.json` 中历史遗留的 `{readme, d}` 混淆包装格式与正常设置的互转；`loadSettings` 读入时转正常，`saveSettings` 写出时转回。

### `importExport.ts`（154 行）
- `exportSettingsUri`（L15）：克隆设置 → 剔除 OneDrive 凭据与废弃 vault ID → pako deflate → base64 → 生成 `obsidian://third-party-sync?func=settings&vault=...&data=...` URI。
- `importQrCodeUri`（L41）：校验 func/vault/版本，解压解码并补齐默认值，返回可合并的设置。

## E. 基础设施

| 文件 | 职责 |
|---|---|
| `baseTypes.ts`（~204 行） | 全部核心类型：三服务 Config 接口、`ThirdPartySyncPluginSettings`、`RemoteItem`、`FileOrFolderMixedState`、`DecisionType`、`SyncDirectionType`（5 种方向）、`ConflictActionType`、`DeleteToWhereType`、URI 常量、`VALID_REQURL` API 版本门槛。文件头注明"只有类型，避免循环依赖" |
| `misc.ts`（623 行） | 工具集：路径处理（`dirname`/`getParentFolder`/`getFolderLevels`/`mkdirpInVault`）、编码转换（base64/hex/base32/base64url）、`getSplitRanges`（分片计算）、`unixTimeToStr`、`statFix`、`getLastSynced`（状态栏"上次同步"文案）、`isSpecialFolderNameToSkip`、`reverseString`（metadata 混淆）、`roughSizeOfObject` 等 |
| `moreOnLog.ts`（33 行） | 封装 loglevel：`log` 全局实例 + `applyLogWriterInplace`（把日志镜像写入 IndexedDB，配合 `logToDB` 设置） |
| `obsFolderLister.ts`（137 行） | `listFilesInObsFolder`：列出 `.obsidian` 配置目录与 `.trash` 内容（`ObsConfigDirFileType`），供同步配置目录与保存时扫描 |
| `presetRules.ts`（69 行） | `applyPresetRulesInplace`：按已知服务 URL 自动修正设置（如特定 WebDAV 服务的 depth 预设），onload 时静默应用 |
| `debugMode.ts`（126 行） | 调试导出：把 IndexedDB 中的同步计划历史 / 日志历史导出为 vault 内 `_debug_remotely_save/` 目录下的 Markdown 表格文件 |
| `stubs/empty.js`、`types/pako.d.ts` | 构建辅助：esbuild 空模块命名空间占位、pako 类型声明 |
