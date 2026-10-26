# 03 · 关键类与函数说明

> 行号对应 v26.2.4 源码。签名从简，重点在语义。

## 1. `ThirdPartySyncPlugin`（src/main.ts:103）

插件主类，字段即运行时状态：

| 字段 | 说明 |
|---|---|
| `settings` / `db` / `i18n` / `vaultRandomID` | 设置、IndexedDB 句柄、翻译器、vault 唯一标识 |
| `syncStatus: SyncStatusType` | 同步状态机（idle/preparing/.../finish），兼任同步互斥锁 |
| `currentTriggerSource` / `isManual` / `isAlreadyRunning` | 本次同步的触发来源与重入标记 |
| `syncRibbon` / `statusBarElement` / `currSyncMsg` / `statusBarIntervalID` | UI 元素、当前进度文案缓存与状态栏 30 秒刷新句柄 |
| `oauth2Info` | OneDrive PKCE 临时状态（verifier/helperModal/authSetting/revokeAuthSetting） |
| `autoRunIntervalID` / `syncOnSaveEvent` / `vaultScannerIntervalId` / `syncOnRemoteIntervalID` | 4 种自动同步的定时/事件句柄 |

### 核心方法

| 方法 | 位置 | 说明 |
|---|---|---|
| `syncRun(triggerSource)` | L122 | **同步总入口**。互斥检查 → 建 RemoteClient → listFromRemote → isPasswordOk → getRemoteStates → 收集本地 → 读 prevSync → getSyncPlanV3 → doActualSyncV3 → 保存 lastSynced。`stepMsg`/`statusBarStepFunc` 把步骤文案镜像到状态栏，`notifyFunc` 按触发来源决定通知（自动静默、手动仅完成通知、dry 提示、调试模式 8 步通知），错误经 `extractRemoteErrorDetails` 聚合展示 |
| `doActualSyncV3(...)` | L434 | 执行封装（私有）：WebDAV 并发降为 1；注入 `trash()` 删除回调、SizesConflictModal 回调、`callbackSyncProcess` 状态栏进度回调（「1/2 OneDrive 正在交换数据 45/120（37%）」，调试模式序号 7/8）、修改比例保护回调 |
| `onload()` | L648 | 生命周期：init oauth2Info → loadSettings → presetRules → I18n → OAuth 过期检查 → 迁移/初始化 DB → 注册 delete/rename 事件 → 注册 3 个协议处理器 → ribbon/命令/设置页 → SyncAlgoV2Modal 同意门 |
| `enableFeaturesAfterAgreement()` | L924 | 用户同意算法后才启用：自动同步、启动同步、保存触发、远端检测、状态栏 |
| `loadSettings()` / `saveSettings()` | L950 / L1008 | 读 `data.json` 经 `messyConfigToNormal` 合并默认值；写出经 `normalConfigToMessy` |
| `checkIfPresetRulesFollowed()` | L1001 | onload 时静默应用 `presetRules` |
| `toggleSyncOnSave(enabled)` | L1232 | 监听 vault `modify` 事件防抖延迟同步 + 每 30s 扫描配置目录是否有未同步变更 |
| `toggleSyncOnRemote(enabled)` | L1159 | 定时列远端并与 prevSync 基线比对，有新增/丢失才触发 `syncRun("auto")`；移动端启动时检测一次 |
| `checkIfOauthExpires()` | L1012 | OneDrive 凭据 80 天强制过期检查，过期清空并提示重新授权 |
| `prepareDBAndVaultRandomID()` | L1087 | 调 `prepareDBs`，vault ID 优先从旧 data.json 迁移 |
| `trash(key)` | L1066 | 按 `deleteToWhere` 删除到系统回收站（失败降级 `.trash`）或 Obsidian `.trash` |
| `getRemoteClient(self)` | L525 | `new RemoteClient(serviceType, s3, webdav, onedrive, vaultName, saveSettings)` |
| `toggleStatusBar` / `toggleStatusText` | L1119 / L1100 | 状态栏元素创建（含移动端适配）与 30 秒空闲刷新 |
| `tryToAddIgnoreFile()` | L1344 | 首次加载在插件配置目录写 `.gitignore`（内容 `data.json`） |

> 另有 4 个遗留私有方法 `shouldSyncBasedOnSyncPlan`（L423）、`getLocalHistory`（L499）、`fetchMetadataFromRemote`（L506）、`getMetadataMtime`（L1302）保留但当前无调用点。

## 2. `RemoteClient`（src/remote.ts:12）

云存储统一门面。构造时仅初始化所选服务的客户端：

```ts
new RemoteClient(serviceType, s3Config?, webdavConfig?, onedriveConfig?, vaultName?, saveUpdatedConfigFunc?)
```

- WebDAV/OneDrive 必须传 `vaultName` + `saveUpdatedConfigFunc`：远端根目录默认取 vault 名（可被 `remoteBaseDir` 覆盖），且客户端可能原地改配置（depth 探测、token 刷新）需要回写。
- 方法均为"按 serviceType 三路转发"：`uploadToRemote`（L64，支持递归、密码、`remoteEncryptedKey`、`uploadRaw`/`rawContent` 直传 metadata）、`listFromRemote`（L114）、`downloadFromRemote`（L130，支持 `skipSaving` 只取内容不落盘）、`deleteFromRemote`（L174）、`checkConnectivity`（L206）、`getUser`（仅 OneDrive，L225）、`revokeAuth`（L233，空实现）。

## 3. 三个后端实现的关键内部结构

| 类/函数 | 位置 | 说明 |
|---|---|---|
| `ObsHttpHandler extends FetchHttpHandler` | remoteForS3.ts:66 | AWS SDK HTTP 层替换为 Obsidian `requestUrl`，解决浏览器环境 CORS 与 Node API 缺失 |
| `getS3Client(s3Config)` | remoteForS3.ts:227 | 创建 S3Client；`forcePathStyle`、`requestChecksumCalculation: "WHEN_REQUIRED"`（兼容不实现 crc32 校验的 S3 兼容商）、`retryMode: "adaptive"` + `maxAttempts: 10`（429 限流退避）；`bypassCorsLocally` 时挂 `ObsHttpHandler` |
| `WrappedWebdavClient` | remoteForWebdav.ts:174 | 封装 `webdav` 库 client + 探测到的 `depth` 状态 + 认证类型 |
| `getWebdavClient(config, remoteBaseDir, saveUpdatedConfigFunc)` | remoteForWebdav.ts:284 | 建客户端；depth 为 `auto_unknown` 时先探测再回写配置 |
| `WrappedOnedriveClient` / `getOnedriveClient` | remoteForOnedrive.ts:539 / 715 | 封装 Graph client；初始化时 token 过期自动 `sendRefreshTokenReq`、解析 `approot`、确保 vault 文件夹存在 |
| `getAuthUrlAndVerifier / sendAuthReq / sendRefreshTokenReq` | remoteForOnedrive.ts:74/123/188 | OAuth2+PKCE 三件套 |
| `setConfigBySuccessfullAuthInplace` | remoteForOnedrive.ts:225 | 授权成功后写回设置（含过期时间） |
| `getUserDisplayName / getRevokeAddr` | remoteForOnedrive.ts:1039/1057 | 取账户名 / 注销地址 |

## 4. 同步算法关键函数（src/sync.ts）

| 函数 | 位置 | 语义 |
|---|---|---|
| `isPasswordOk(remote, password)` | L86 | 密码校验：远端为空 → `empty_remote`；无密码 → 依据远端是否存在明文 metadata 文件等启发式返回 `no_password_both_sides`（放行同步）；有密码 → 用候选密码 `decryptBase64urlToString` 解密首个远端 key，成功 `password_matched`，失败 `password_not_matched` |
| `getRemoteStates(remote, db, vaultRandomID, remoteType, password)` | L213 | 遍历远端列表：有密码先解密 key；再查 `syncmetadatahistory` 反向映射补回真实 localKey/localMtime/localSize（加密名每次不同，必须靠映射表）；产出 `FileOrFolderMixedState[]` |
| `getSyncPlanV3(...)` | L601 | V3 计划生成：`ensembleMixedStates` 合并三方（V3 不再消费删除历史）→ 补 prevSync 基线 → 按路径长度降序排序（保证先处理深层路径）→ 逐项 `assignOperationTo*InplaceV3`（文件夹版为 async）→ 汇总 `sizesGoWrong` 与 `deletions` → 返回 `{plan, sortedKeys, deletions, sizesGoWrong}`；参数含 `syncDirection` 与 `conflictAction` |
| `assignOperationToFileInplaceV3(record, keptFolder, skipSizeLargerThan, password, syncDirection, conflictAction, remoteType)` | L945 | **文件级决策**（内部主体为 `assignOperationToFileInplaceV3Inner` L728，见下表），再经尺寸阈值后处理与 OneDrive 空文件改写 |
| `assignOperationToFolderInplaceV3(record, keptFolder, vault, ...)` | L1014 | 文件夹级：createFolder / skipFolder / 删除传播；`keptFolder` 保证有存活文件的父目录链不被删 |
| `doActualSyncV3(client, db, vaultRandomID, vault, plan, sortedKeys, sizesGoWrong, localDeleteFunc, password, lastSynced, concurrency, callbackSizesGoWrong, callbackSyncProcess, protectModifyPercentage, callbackProtectModifyPercentage, configDir, syncDirection)` | L1099 | 执行：sizesGoWrong 非空 → 回调弹窗中止；修改比例保护检查（100% 且全量修改时放行）；`splitThreeSteps` 三步分层 → PQueue 并发 → 每项 `syncIndividualItem`；单次上传/下载完成触发 `callbackSyncProcess`；错误经 `extractRemoteErrorDetails` 包装，累计 3 个熔断暂停队列并以 `AggregateError` 抛出；完成后按"仅记录存活项、单向跳过项不入库、下载项记远端 mtime"的规则重写 `prevsyncrecords` |
| `extractRemoteErrorDetails(error)` | L314 | 内部：从 AWS SDK `UnknownError` 的 `$metadata`/`$response` 提取 `http=`状态码、`code=`S3 错误码、`ctype=`响应类型、`reqid=`requestId，便于定位网关错误/拒绝访问等真实原因 |
| `ensembleMixedStates(...)` | L385 | 内部：合并远端态、本地 vault 文件、配置目录项为 mixedStates（V3 传入空删除历史） |
| `dispatchOperationToActual(...)` | L1320 | 内部：按 `decision` 执行上传/下载/删除/建目录；上传后 `upsertSyncMetaMappingDataByVault` 写映射；各动作完成后清理对应 key 的删除/重命名历史 |
| `splitThreeSteps(plan, sortedKeys)` | L1459 | 内部：按依赖顺序拆为 folderCreationOps（按层级）→ deletionOps（按层级且倒序执行）→ uploadDownloads（单层）；同时统计 `allFilesCount`/`realModifyDeleteCount`（修改比例保护）与 `realTotalCount`（进度回调分母，仅上传/下载计数） |
| `syncIndividualItem(key, deletionOp, val, ...)` | L1558 | 内部：单项执行入口，转发 `dispatchOperationToActual` |
| `getRemoteMetadata` / `fetchMetadataFile` / `uploadExtraMeta` | L157 / L283 / L1275 | 远端 metadata 定位/下载/上传。`getRemoteMetadata` 与 `uploadExtraMeta` 供设置页"重置远端同步元数据"使用；`fetchMetadataFile` 遗留保留、当前无调用点 |

### 文件级决策树要点（V3 三方合并，`decision` 动作名，无分支编号）

前置：`isPullOnlyMode` / `isPushOnlyMode` / `isPullDeleteMode` / `isPushDeleteMode` 由 `syncDirection` 推导；比较大小时**有密码用加密尺寸，无密码用明文尺寸**（`sizeLocalComp`/`sizeRemoteComp`，L750-751）。

| 条件（摘要） | decision |
|---|---|
| 双侧存在，mtime 相等且大小相等 | `skipUploading` |
| 双侧存在，mtime 相等但大小不同 | 拉取模式 → `downloadRemoteToLocal`（不写远端）；其余 → `uploadLocalToRemote` |
| 双侧存在，本地较新 | 拉取模式 → `skipUploading`；其余 → `uploadLocalToRemote` |
| 双侧存在，远端较新 | 推送模式 → `skipUploading`；其余 → `downloadRemoteToLocal` |
| 双方自基线后均被修改（真冲突，仅双向） | `keep_larger`：较大一方胜出（`uploadLocalToRemote`/`downloadRemoteToLocal`）；`keep_newer`（默认）：走上述 mtime 流程 |
| 双侧存在、无基线、一方为空文件（保护分支：双向且冲突解决非"禁用"） | 本地空 → `downloadRemoteToLocal`；远端空（明文同步）→ `uploadLocalToRemote` |
| 本地有、远端无、有基线（远端已删） | 双向/拉取带删除 → `keepRemoteDelHist`；推送 → `uploadLocalToRemote`（重推镜像）；拉取 → `skipUploading` |
| 本地有、远端无、无基线（新本地文件） | 拉取 → `skipUploading`；其余 → `uploadLocalToRemote` |
| 本地无、远端有、有基线（本地已删） | 推送带删除/双向 → `uploadLocalDelHistToRemote`；拉取带删除/推送 → `skipUploading`；拉取 → `downloadRemoteToLocal` |
| 本地无、远端有、无基线（新远端文件） | 推送 → `skipUploading`；其余 → `downloadRemoteToLocal` |
| 双方均无 + 有基线 | `skipUploading`（双删清理） |

文件夹级（`assignOperationToFolderInplaceV3`）：无存活子项时按方向决定 `createFolder`/`skipFolder`/`keepRemoteDelHistFolder`/`uploadLocalDelHistToRemoteFolder`；有存活子项（`keptFolder`）时保证父目录链被创建，并把"需保留"标记向上传播。

决策后处理（`assignOperationToFileInplaceV3` 外层）：

- **尺寸阈值**（`skipSizeLargerThan > 0`，L967-990）：上传/下载方向上超限 → `skipUploadingTooLarge` / `skipDownloadingTooLarge`；恰好单侧超限而另一侧正常 → `errorLocalTooLargeConflictRemote` / `errorRemoteTooLargeConflictLocal`（进 `sizesGoWrong`，弹 SizesConflictModal 中止同步）。
- **OneDrive 空文件**（L999-1006）：明文同步下 OneDrive 无法存储 0 字节文件，`uploadLocalToRemote` 改写为 `skipUploadingOneDriveEmpty`；该决策**不写入 prevSync**，下次同步仍视为"本地独有、从未同步"，避免误判"远端已删除"而移入回收站。

## 5. 加密函数（src/encrypt.ts）

| 函数 | 位置 | 说明 |
|---|---|---|
| `getKeyFromPassword(salt, password, rounds)` | L6（内部） | PBKDF2-SHA256，默认 20,000 轮，派生 256bit |
| `encryptArrayBuffer` / `decryptArrayBuffer` | L38 / L73 | 内容加密主函数；格式 `[salt16 \| iv12 \| GCM 密文]`，GCM 自带 AuthTag 完整性校验 |
| `encryptStringToBase64url` / `decryptBase64urlToString` | L109 / L122 | 文件名加密（base64url 无填充编码，V3 主用；isPasswordOk 也用它做校验） |
| `getSizeFromOrigToEnc(x)` | L136 | encSize = x + 16(salt) + 16(tag) + 12(iv)，供决策树在加密模式下比较大小 |

## 6. 本地数据库 API（src/localdb.ts）

| 函数 | 说明 |
|---|---|
| `prepareDBs(vaultBasePath, vaultRandomIDFromOldConfigFile)` | 打开/迁移 7 张表，返回 `{db, vaultRandomID}`；vault ID 缺失时用 nanoid 生成并登记到映射表 |
| `loadPrevSyncRecordsByVault(db, vaultRandomID)` | 读 V3 基线记录（`PrevSyncRecord[]`） |
| `savePrevSyncRecordsByVault(db, vaultRandomID, records)` | 同步完成后先清后写基线（doActualSyncV3 L1268 调用） |
| `clearAllPrevSyncRecordsByVault(db, vaultRandomID)` | 清空该 vault 全部基线（「清空远端并重新推送」用） |
| `upsertSyncMetaMappingDataByVault(...)` | 每次上传/建目录后写入 localKey⇄remoteKey 映射 |
| `getSyncMetaMappingByRemoteKeyAndVault(...)` | 反向映射：远端加密 key → 本地 key/mtime/size（getRemoteStates 依赖；remoteMtime/etag/serviceType 均需匹配） |
| `clearAllSyncMetaMapping(db)` | 清空全部映射（「删除同步映射记录」调试按钮与 wipe 用） |
| `insertDeleteRecordByVault` / `insertRenameRecordByVault` | 监听 vault 事件实时记录文件操作历史（审计用；单项同步完成后经 `clearDeleteRenameHistoryOfKeyAndVault` 清理） |
| `loadFileHistoryTableByVault` | 读取文件操作历史（按 actionWhen 升序） |
| `destroyDBs()` | 删除整个 `remotelysavedb` IndexedDB 库（「重设本地缓存和数据库」按钮用） |
| `migrateDBs*` 系列 | schema 迁移链 20211114 → 20220108（补 vaultRandomID 前缀）→ 20220326 → 20250430（新增 prevsyncrecords） |

> v26.2.2 移除日志/同步计划入库后，`insertLoggerOutputByVault`、`clearExpired*` 等 API 已删除；`syncplanshistory`/`loggeroutput` 两表保留仅兼容旧库 schema。

## 7. 其他关键类

| 类 | 位置 | 说明 |
|---|---|---|
| `ThirdPartySyncSettingTab` | settings.ts:425 | 设置页主类；基于 `SettingGroup` 分组：选择服务（含状态摘要卡）→ 服务详情（按服务显隐）→ 基本设置 → 同步内容 → 进阶设置（含导入导出）→ 调试 |
| `OnedriveAuthModal` / `OnedriveRevokeAuthModal` | settings.ts:226 / 285 | OneDrive 授权/撤销流程弹窗 |
| `PasswordModal` / `ChangeRemoteBaseDirModal` / `SyncConfigDirModal` | settings.ts:54 / 127 / 352 | 私有弹窗：密码二次确认 / 远端基文件夹修改 / 同步配置目录确认 |
| `WipeCloudModal` / `openWipeCloudModal` | wipeRemoteNotice.ts:12 / 191 | 「清空远端并重新推送」两阶段弹窗 + 入口函数 |
| `SyncAlgoV2Modal` | syncAlgoV2Notice.ts:4 | 算法知情同意弹窗（回调 result: boolean） |
| `SizesConflictModal` | syncSizesConflictNotice.ts:6 | 超限文件冲突列表弹窗 |
| `I18n` | i18n.ts:12 | `t(key, vars?)`：auto 语言检测 → 词表查询 → en 回退 → Mustache 渲染 |

## 8. 工具函数精选（src/misc.ts）

- 路径：`dirname` / `getFolderLevels` / `getPathFolder` / `getParentFolder` / `mkdirpInVault` / `atWhichLevel`（splitThreeSteps 分层用）
- 编码：`encodeBase64` / `decodeBase64` / `arrayBufferToBase64` / `base64ToBase32` / `base64ToBase64url` / `hexStringToTypedArray`
- 分片：`getSplitRanges(bytesTotal, bytesEachPart)`（S3 multipart 用）
- 杂项：`isHiddenPath`（隐藏文件判定）、`statFix`（统一 stat 返回，localdb 重命名记录使用）、`unixTimeToStr`、`getLastSynced(i18n, lastSyncedMillis)`（返回 `{lastSyncMsg, lastSyncLabelMsg}` 的"刚刚/N 分钟前…"状态栏文案）、`roughSizeOfObject`、`reverseString`（metadata 混淆）
