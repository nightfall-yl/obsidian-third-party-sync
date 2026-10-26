# 02 · 主要模块职责

`src/` 共 23 个 TS 文件（含 `langs/index.ts` 与 `types/pako.d.ts`；v26.1.8/26.1.9 已移除实验性 syncer/fs* 死代码与 V2 遗留同步引擎），按功能分组说明。每节给出：职责 / 关键导出 / 上下游关系。

## A. 入口与 UI 层

### `main.ts`（1,375 行）— 插件入口
- 默认导出 **`ThirdPartySyncPlugin extends Plugin`**（L103），是全插件的生命周期与状态中枢。
- 职责：加载/保存设置、初始化 i18n 与 IndexedDB、注册 ribbon 图标与 2 个命令（`start-sync`、`start-sync-dry-run`）、注册 3 个 `obsidian://` 协议处理器（设置导入 `third-party-sync`、通用回调 `third-party-sync-cb`、OneDrive 回调 `third-party-sync-onedrive`）、4 种自动同步定时器、状态栏实时进度与同步互斥。
- 默认设置对象 `DEFAULT_SETTINGS`（L56-81）：`serviceType: "s3"`、`concurrency: 5`、`syncDirection: "bidirectional"`、`conflictAction: "keep_newer"`（设置项默认值）、`protectModifyPercentage: 50`、`deleteToWhere: "system_trash"`、`syncBookmarks: true`、`skipSizeLargerThan: -1`、各定时器 `-1`（关闭）等。
- 服务名显示映射 `SERVICE_DISPLAY_NAMES`（L95）：内部标识 `s3/onedrive/webdav` 统一显示为 S3 / OneDrive / WebDAV。
- 上游：几乎依赖所有模块；核心协作对象为 `sync.ts` 的 5 个导出函数与 `RemoteClient`。

### `settings.ts`（1,892 行）— 设置页
- **`ThirdPartySyncSettingTab extends PluginSettingTab`**（L425）：基于 Obsidian `SettingGroup` 分组渲染，层级为**选择服务**（含"当前状态"摘要卡：服务 · 同步方向 · 是否加密 · 上次同步时间，L464-483）→ **服务详情**（统一分组，S3/WebDAV/OneDrive 配置项按 serviceType 切换显隐）→ **基本设置**（加密密码、同步方向、保存运行/自动运行/远端运行/启动运行）→ **同步内容**（回收站、书签、下划线项、配置文件夹、状态栏显示、跳过大文件）→ **进阶设置**（并发、删除去向、冲突处理、修改保护比例、导出/导入）→ **调试**（调试开关常显；调试开启后显示 5 个调试项）。
- 调试区按钮按破坏性从轻到重排序：删除同步映射记录 → 重置远端同步元数据（删远端 metadata + 重新上传空 metadata，复用 `sync.ts` 的 `getRemoteMetadata`/`uploadExtraMeta`）→ 重设本地缓存和数据库（`destroyDBs`）→ 清空远端并重新推送（`openWipeCloudModal`，按钮带 `mod-warning` 警示色）。
- 弹窗类：**`OnedriveAuthModal`**（L226）/ **`OnedriveRevokeAuthModal`**（L285）OneDrive 授权与撤销；`PasswordModal`（L54，密码二次确认）、`ChangeRemoteBaseDirModal`（L127，远端基文件夹修改）、`SyncConfigDirModal`（L352，同步配置目录二次确认）为模块内私有类。
- 上游：`main.ts` 实例化；内部使用 `remoteForS3`/`remoteForOnedrive`/`remoteForWebdav` 的默认配置与连通性检查、`presetRules` 的 WebDAV 预设。

### `syncAlgoV2Notice.ts`（68 行）— 算法确认弹窗
- `SyncAlgoV2Modal`：首次启用时展示同步算法说明，用户同意才启用全部同步功能，不同意则 `plugin.unload()`（`main.ts:907-921`）。

### `syncSizesConflictNotice.ts`（94 行）— 大小冲突弹窗
- `SizesConflictModal`：`doActualSyncV3` 检测到超阈值文件（`sizesGoWrong` 非空）时展示冲突文件列表（加密名、本地/远端字节数）并提供复制详情按钮；同步因此中止（`sync.ts:1118-1122`）。

### `wipeRemoteNotice.ts`（202 行）— 清空远端弹窗（v26.2.2 新增）
- **`WipeCloudModal`**（L12）+ `openWipeCloudModal`（L191）：「清空远端并重新推送」两阶段加载弹窗——点击按钮立即弹出并显示统计进度提示（`modal_wipecloud_loading`），后台 `listFromRemote()` 统计远端文件完成后才启用确认按钮（大 vault 不再长时间无反馈）；增量拉取方向下确认按钮禁用并显示警告。
- 确认后 `wipeAndResync()`（L108）：先删文件、再按层级从深到浅删文件夹（否则 OneDrive/WebDAV 残留空文件夹树会被双向同步拉回本地）；以空密码按远端真实 key 逐个删除（旧密码加密的遗留文件同样可清除），每删 20 项刷新进度 Notice；删除失败不阻断仅计数。随后 `clearAllPrevSyncRecordsByVault` + `clearAllSyncMetaMapping` 清空本地基线与映射，最后自动 `plugin.syncRun("manual")` 全量重推。

### `i18n.ts`（47 行）+ `langs/index.ts`（31 行）— 国际化
- `I18n` 类（L12）：`t(key, vars)` 取词，`auto` 模式经 `moment.locale()` 跟随 Obsidian 语言（语言包不含该 locale 时回退英文）；缺键回退英文；变量用 **Mustache** 渲染。
- `langs/index.ts` 聚合 `LANGS`：14 种语言（en/zh_cn/zh_tw/ja/ko/de/fr/es/it/nl/da/sv/no/ru）。`TransItemType = string`，键缺失不会破坏构建。

## B. 同步业务层

### `sync.ts`（1,576 行）— 同步算法核心（最重要模块）
- 导出：`SyncStatusType`、`SyncPlanType`、`PasswordCheckType`、`isPasswordOk`（L86）、`getRemoteMetadata`（L157，供设置页"重置远端同步元数据"定位远端 metadata 文件）、`getRemoteStates`（L213）、`fetchMetadataFile`（L283，遗留保留，当前无调用点）、**`getSyncPlanV3`**（L601）、**`doActualSyncV3`**（L1099）、`uploadExtraMeta`（L1275，供"重置远端同步元数据"重传空 metadata）。
- 内部关键函数：`extractRemoteErrorDetails`（L314，从 AWS SDK UnknownError 中提取 http 状态码 / S3 code / content-type / requestId）、`isSkipItem`（L342，过滤配置目录/.trash/隐藏文件/插件自身 data.json/metadata 文件）、`ensembleMixedStates`（L385-588，合并远端态/本地文件/配置目录项；V3 不再消费删除历史，传入空数组）、`assignOperationToFileInplaceV3Inner`（L728，文件三方合并决策主体）、`assignOperationToFileInplaceV3`（L945，外层包装：尺寸阈值后处理 + OneDrive 空文件改写）、`assignOperationToFolderInplaceV3`（L1014，文件夹决策）、`dispatchOperationToActual`（L1320，按 decision 执行单项）、`splitThreeSteps`（L1459，拆分建目录/删除/上传下载三步并统计修改比例）、`syncIndividualItem`（L1558，单项执行入口）。

## C. 云存储后端层

### `remote.ts`（237 行）— 统一门面
- **`RemoteClient`**（L12）：构造时按 `serviceType` 保存对应配置并创建内部客户端；WebDAV/OneDrive 需要传入 `vaultName` 与 `saveUpdatedConfigFunc`（远端基目录默认取 vault 名、可被 `remoteBaseDir` 覆盖；客户端会**原地修改配置**并需要回写，如 WebDAV depth 探测结果、OneDrive 刷新 token）。
- 方法：`uploadToRemote` / `listFromRemote` / `downloadFromRemote` / `deleteFromRemote` / `checkConnectivity` / `getUser`（仅 OneDrive）/ `revokeAuth`（空实现），内部按类型转发到三个实现模块。

### `remoteForS3.ts`（647 行）
- `DEFAULT_S3_CONFIG`（L178，`bypassCorsLocally: true`、`partsConcurrency: 20`、`forcePathStyle: false`）、`getS3Client`（L227）：创建 S3Client 时配置 **`requestChecksumCalculation: "WHEN_REQUIRED"`**（仅当服务显式要求才附带请求校验和，兼容天翼云等不实现 crc32 校验的 S3 兼容商，见 CHANGELOG 26.1.3）与 **`retryMode: "adaptive"` + `maxAttempts: 10`**（遇 HTTP 429 限流时按自适应重试策略退避，最多 10 次尝试）。`bypassCorsLocally` 开启时 HTTP 层替换为 Obsidian `requestUrl`。
- **`ObsHttpHandler extends FetchHttpHandler`**（L66）：把 AWS SDK 的 HTTP 层替换为 Obsidian `requestUrl`，绕过浏览器 CORS 限制。
- 上传支持 5MB 分片（`@aws-sdk/lib-storage` multipart，`partsConcurrency` 并发）；列出用分页 `ListObjectsV2`；上传/下载/删除均支持密码加密与 metadata 同步（可用 `disableS3MetadataSync` 关闭）。

### `remoteForWebdav.ts`（588 行）
- `DEFAULT_WEBDAV_CONFIG`（L114）、**`WrappedWebdavClient`**（L174）、`getWebdavClient`（L284）。
- **Depth 自适应**：`auto_unknown` 初始，尝试 `PROPFIND Depth: infinity`，失败自动降级 `auto_1` 并写回配置（配合 `presetRules.ts` 对已知服务的预设）。
- 认证支持 digest/basic；目录树用 BFS 遍历；WebDAV 同步全程并发 1（`main.ts:438`）。

### `remoteForOnedrive.ts`（1,059 行）— 最复杂后端
- **OAuth2 + PKCE 全流程**：`getAuthUrlAndVerifier`（L74，生成授权 URL + code verifier）、`sendAuthReq`（L123，用回调 code 换 token）、`sendRefreshTokenReq`（L188，刷新）、`setConfigBySuccessfullAuthInplace`（L225，写回设置）。
- **`WrappedOnedriveClient`**（L539）+ `getOnedriveClient`（L715）：封装 `@microsoft/microsoft-graph-client`；初始化时检查 token 过期自动刷新，确保 `approot` 下以 vault 名（或 `remoteBaseDir`）命名的同步文件夹存在。
- 回调经 `obsidian://third-party-sync-onedrive` 协议处理器完成（`main.ts:764-865`）；凭据 80 天强制过期（`OAUTH2_FORCE_EXPIRE_MILLISECONDS`，`baseTypes.ts:116`）需重新授权；`deltaLink` 支持增量列目录；`DEFAULT_ONEDRIVE_CONFIG` 的 clientID/authority 由 esbuild `define` 注入。

## D. 数据与安全层

### `localdb.ts`（557 行）— 本地 IndexedDB
- 基于 localforage，库名 `remotelysavedb`，当前 schema 版本 `20250430`。
- 7 张表（L13-19）：`schemaversion`、`filefolderoperationhistory`（文件删除/重命名历史，由 vault `delete`/`rename` 事件实时写入，`main.ts:700-719`；V3 决策不再消费，供审计与单项完成后清理）、`syncmetadatahistory`（本地⇄远端 key 映射，`SyncMetaMappingRecord`）、`syncplanshistory`、`vaultrandomidmapping`、`loggeroutput`、**`prevsyncrecords`**（V3 三方合并的基线，`PrevSyncRecord`）。后两者保留仅兼容旧库 schema，已无读写 API。
- 关键 API：`prepareDBs(vaultBasePath, oldID) → {db, vaultRandomID}`（含迁移链 20211114→20220108→20220326→20250430）、`loadPrevSyncRecordsByVault` / `savePrevSyncRecordsByVault`（整体重写）/ `clearAllPrevSyncRecordsByVault`、`upsertSyncMetaMappingDataByVault` / `getSyncMetaMappingByRemoteKeyAndVault` / `clearAllSyncMetaMapping`、`insertDeleteRecordByVault` / `insertRenameRecordByVault` / `clearDeleteRenameHistoryOfKeyAndVault`、`loadFileHistoryTableByVault`、`destroyDBs`（删除整个 IndexedDB 库，"重设本地缓存和数据库"按钮用）。
- 所有记录 key 均以 `vaultRandomID` 前缀隔离多 vault 数据。

### `metadataOnRemote.ts`（127 行）— 远端元数据格式
- metadata 文件名：`.third-party-sync-metadata-on-remote.json` / `.bin`（另有 `...2` 变体）；兼容读取上游 `_remotely-save-metadata-on-remote.*` 遗留名。
- 格式：`{ readme, d }`，`d = reverse(base64url(JSON))`——轻度混淆防止用户手改；内容为 `{ version, generatedWhen, deletions: DeletionOnRemote[] }`（远端删除历史，旧版算法用；V3 主路径不再上传，仅被 `isPasswordOk` 用于识别"远端未加密"与设置页"重置远端同步元数据"）。
- `serializeMetadataOnRemote` / `deserializeMetadataOnRemote` / `isEqualMetadataOnRemote`（仅比较 deletions）。

### `encrypt.ts`（142 行）— 加密实现（fork 核心改进）
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
| `baseTypes.ts`（205 行） | 全部核心类型：三服务 Config 接口、`ThirdPartySyncPluginSettings`、`RemoteItem`、`FileOrFolderMixedState`（含 `prevSync` 基线字段）、`DecisionType`（16 个变体）、`SyncDirectionType`（5 种方向）、`ConflictActionType`（keep_newer/keep_larger）、`DeleteToWhereType`、`SyncTriggerSourceType`、URI 常量、`VALID_REQURL` API 版本门槛、OAuth2 80 天过期常量。文件头注明"只有类型，避免循环依赖" |
| `misc.ts`（623 行） | 工具集：路径处理（`dirname`/`getParentFolder`/`getFolderLevels`/`mkdirpInVault`/`atWhichLevel`）、编码转换（base64/hex/base32/base64url）、`getSplitRanges`（分片计算）、`unixTimeToStr`、`statFix`（统一 stat 返回，供 localdb 重命名记录使用）、`getLastSynced`（状态栏"上次同步"文案，返回 `{lastSyncMsg, lastSyncLabelMsg}`）、`isHiddenPath`、`reverseString`（metadata 混淆）、`roughSizeOfObject` 等 |
| `moreOnLog.ts`（6 行） | 仅导出 loglevel 全局实例 `log`（v26.2.2 移除日志入库后不再有其他逻辑） |
| `obsFolderLister.ts`（137 行） | `listFilesInObsFolder`：列出 `.obsidian` 配置目录与 `.trash` 内容（`ObsConfigDirFileType`），供同步配置目录与保存时扫描；`isInsideObsFolder`/`isInsideTrashFolder` 判定 |
| `presetRules.ts`（69 行） | `applyWebdavPresetRulesInplace` / `applyPresetRulesInplace`：按已知服务 URL 自动修正设置（如特定 WebDAV 服务的 depth 预设），onload 时静默应用 |
| `stubs/empty.js`、`types/pako.d.ts` | 构建辅助：空模块占位、pako 类型声明 |
