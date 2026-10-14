# 03 · 关键类与函数说明

> 行号对应 v26.1.5 源码。签名从简，重点在语义。

## 1. `ThirdPartySyncPlugin`（src/main.ts:100）

插件主类，字段即运行时状态：

| 字段 | 说明 |
|---|---|
| `settings` / `db` / `i18n` / `vaultRandomID` | 设置、IndexedDB 句柄、翻译器、vault 唯一标识 |
| `syncStatus: SyncStatusType` | 同步状态机（idle/preparing/.../finish），兼任同步互斥锁 |
| `currentTriggerSource` / `isManual` / `isAlreadyRunning` | 本次同步的触发来源与重入标记 |
| `syncRibbon` / `statusBarElement` / `oauth2Info` | UI 元素与 OneDrive PKCE 临时状态（verifier/helperModal） |
| `autoRunIntervalID` / `syncOnSaveEvent` / `vaultScannerIntervalId` / `syncOnRemoteIntervalID` | 4 种自动同步的定时句柄 |

### 核心方法

| 方法 | 位置 | 说明 |
|---|---|---|
| `syncRun(triggerSource)` | L119 | **同步总入口**。互斥检查 → 建 RemoteClient → listFromRemote → isPasswordOk → getRemoteStates → 收集本地 → 读 prevSync → getSyncPlanV3 → doActualSyncV3 → 保存 lastSynced。全程按 step 弹 Notice（manual/dry 才弹），错误聚合展示 |
| `doActualSyncV3(...)` | L361 | 执行封装：WebDAV 并发降为 1；注入 `trash()` 删除回调、SizesConflictModal 回调、修改比例保护回调 |
| `onload()` | L630 | 生命周期：init oauth2Info → loadSettings → presetRules → I18n → OAuth 过期检查 → 迁移/初始化 DB → 注册 delete/rename 事件 → 注册 3 个协议处理器 → ribbon/命令/设置页 → SyncAlgoV2Modal 同意门 |
| `enableFeaturesAfterAgreement()` | L911 | 用户同意算法后才启用：自动同步、启动同步、保存触发、远端检测、状态栏 |
| `loadSettings()` / `saveSettings()` | L937 / L995 | 读 `data.json` 经 `messyConfigToNormal` 合并默认值；写出经 `normalConfigToMessy` |
| `toggleSyncOnSave(enabled)` | L1219 | 监听 vault `modify` 事件防抖延迟同步 + 每 30s 扫描配置目录是否有未同步变更 |
| `toggleSyncOnRemote(enabled)` | L1146 | 定时列远端并与 prevSync 基线比对，有新增/丢失才触发 `syncRun("auto")`；移动端启动时检测一次 |
| `checkIfOauthExpires()` | L999 | OneDrive 凭据 80 天强制过期检查，过期清空并提示重新授权 |
| `prepareDBAndVaultRandomID()` | L1074 | 调 `prepareDBs`，vault ID 优先从旧 data.json 迁移 |
| `trash(key)` | L1053 | 按 `deleteToWhere` 删除到系统回收站（失败降级 `.trash`）或 Obsidian `.trash` |
| `getRemoteClient(self)` | L507 | `new RemoteClient(serviceType, s3, webdav, onedrive, vaultName, saveSettings)` |

## 2. `RemoteClient`（src/remote.ts:12）

云存储统一门面。构造时仅初始化所选服务的客户端：

```ts
new RemoteClient(serviceType, s3Config?, webdavConfig?, onedriveConfig?, vaultName?, saveUpdatedConfigFunc?)
```

- WebDAV/OneDrive 必须传 `vaultName` + `saveUpdatedConfigFunc`：远端根目录默认取 vault 名（可被 `remoteBaseDir` 覆盖），且客户端可能原地改配置（depth 探测、token 刷新）需要回写。
- 方法均为"按 serviceType 三路转发"：`uploadToRemote`（L64，支持递归、密码、`remoteEncryptedKey`、`uploadRaw`/`rawContent` 直传 metadata）、`listFromRemote`（L114）、`downloadFromRemote`（L130，支持 `skipSaving` 只取内容不落盘）、`deleteFromRemote`（L174）、`checkConnectivity`（L206）、`getUser`（仅 OneDrive，L225）。

## 3. 三个后端实现的关键内部结构

| 类/函数 | 位置 | 说明 |
|---|---|---|
| `ObsHttpHandler extends FetchHttpHandler` | remoteForS3.ts:66 | AWS SDK HTTP 层替换为 Obsidian `requestUrl`，解决浏览器环境 CORS 与 Node API 缺失 |
| `getS3Client(s3Config)` | remoteForS3.ts:227 | 创建 S3Client；`forcePathStyle`、`requestChecksumCalculation: WHEN_REQUIRED`（兼容不实现 crc32 校验的服务） |
| `WrappedWebdavClient` | remoteForWebdav.ts:174 | 封装 `webdav` 库 client + 探测到的 `depth` 状态 + 认证类型 |
| `getWebdavClient(config, remoteBaseDir, saveUpdatedConfigFunc)` | remoteForWebdav.ts:284 | 建客户端；depth 为 `auto_unknown` 时先探测再回写配置 |
| `WrappedOnedriveClient` | remoteForOnedrive.ts:539 | 封装 Graph client；`initAuthAndFolderPath`（约 L539-585）：token 过期自动 `sendRefreshTokenReq`、解析 `approot`、确保 vault 文件夹存在 |
| `getAuthUrlAndVerifier / sendAuthReq / sendRefreshTokenReq` | remoteForOnedrive.ts:74/123/188 | OAuth2+PKCE 三件套 |
| `getUserDisplayName / getRevokeAddr` | remoteForOnedrive.ts:1039/1057 | 取账户名 / 注销地址 |

## 4. 同步算法关键函数（src/sync.ts）

| 函数 | 位置 | 语义 |
|---|---|---|
| `isPasswordOk(remote, password)` | L88 | 密码校验：远端为空 → ok；无密码 → 兼容判断；有密码 → 用候选密码 `decryptBase64urlToString` 解密首个远端 key，失败即密码错误。返回 `PasswordCheckType.reason`（ok/empty_remote/password_matched/password_not_matched/...） |
| `getRemoteStates(remote, db, vaultRandomID, remoteType, password)` | L215 | 遍历远端列表：有密码先解密 key；再查 `syncmetadatahistory` 反向映射补回真实 localKey/localMtime/localSize（加密名每次不同，必须靠映射表）；产出 `FileOrFolderMixedState[]` |
| `getSyncPlanV3(...)` | L1066 | V3 计划生成：`ensembleMixedStates` 合并三方 → 补 prevSync → 按路径长度降序排序（保证先处理深层路径）→ 逐项 `assignOperationTo*InplaceV3` → 汇总 `sizesGoWrong` 与 `deletions` → 返回 `{plan, sortedKeys, deletions, sizesGoWrong}` |
| `assignOperationToFileInplaceV3(record, keptFolder, skipSizeLargerThan, password, syncDirection)` | L1190 | **文件级决策树**（见下表），写入 `decision` 与 `decisionBranch` |
| `assignOperationToFolderInplaceV3` | 略 | 文件夹级：createFolder / skipFolder / 删除传播；`keptFolder` 保证有存活文件的父目录链不被删 |
| `doActualSyncV3(client, db, vaultRandomID, vault, plan, sortedKeys, sizesGoWrong, localDeleteFunc, password, lastSynced, concurrency, ...)` | L1426 | 执行：sizesGoWrong 非空 → 弹窗中止；修改比例保护检查；`splitThreeSteps` 三步分层 → PQueue 并发 → 每项 `syncIndividualItem`；错误≥3 熔断；完成后把存活项写回 `prevsyncrecords` |
| `splitThreeSteps` | 内部 | 把 plan 按依赖顺序拆为 folderCreationOps → deletionOps → uploadDownloads，每层内部再按路径深度分层 |
| `syncIndividualItem(key, isDeleteOp, val, ...)` | 内部 | 按 `val.decision` 执行：upload（含 raw metadata 直传）/ download / delete（本地 trash + 远端删除）/ 建目录 |
| `getSyncPlan` / `doActualSync` | L1573 / L1983 | 旧版算法（依赖远端 metadata 文件 + 本地文件操作历史），保留未删，`main.ts` 的 V3 路径不再调用 |
| `getRemoteMetadata` / `fetchMetadataFile` / `uploadExtraMeta` | L159 / L285 / L1682 | 旧版远端 metadata 读写，属遗留路径 |

### 文件级决策树要点（V3 三方合并）

前置：`isPullOnlyMode` / `isPushOnlyMode` / `isPullDeleteMode` / `isPushDeleteMode` 由 `syncDirection` 推导；比较大小时**有密码用加密尺寸，无密码用明文尺寸**（`sizeLocalComp`/`sizeRemoteComp`，L1212-1213）。

| decision | 分支号 | 触发条件（摘要） |
|---|---|---|
| `skipUploading` | 1 | mtime 相等且大小相等（即"无变化"） |
| `uploadLocalToRemote` | 2 | mtime 相等但大小不同 |
| `uploadLocalToRemote` / `skipUploading` | 4 / 51 | 本地较新；pull-only 时跳过 |
| `downloadRemoteToLocal` / `skipUploading` | 5 / 53 | 远端较新；push-only 时跳过 |
| `keepRemoteDelHist` | 7 / 61 | 本地存在、远端消失且有基线（远端被删）→ 双向连带删本地；pull-delete 模式同样删 |
| `skipUploading` | 60 | push-delete 模式下远端已不在，仅清理 |
| `uploadLocalToRemote` | 62 | push-only 下远端缺失但有基线：视为远端陈旧，重新上传以保持镜像 |
| `uploadLocalToRemote` / `skipUploading` | 64 / 63 | 全新本地文件；pull-only 时跳过 |
| （对称）本地缺失分支 | — | 全新远端文件 → `downloadRemoteToLocal`；本地删过 → 删远端 |
| 双方都无 + 有基线 | — | 双删，跳过 |
| `skipUploadingTooLarge` / `skipDownloadingTooLarge` / `errorLocalTooLargeConflictRemote` 等 | — | `skipSizeLargerThan` 阈值系列，进 `sizesGoWrong` |

## 5. 加密函数（src/encrypt.ts）

| 函数 | 位置 | 说明 |
|---|---|---|
| `getKeyFromPassword(salt, password, rounds)` | L6（内部） | PBKDF2-SHA256，默认 20,000 轮，派生 256bit |
| `encryptArrayBuffer` / `decryptArrayBuffer` | L38 / L73 | 内容加密主函数；格式 `[salt16 | iv12 | GCM 密文]`，GCM 自带 AuthTag 完整性校验 |
| `encryptStringToBase64url` / `decryptBase64urlToString` | L109 / L122 | 文件名加密（base64url 无填充编码，V3 主用；isPasswordOk 也用它做校验） |
| `getSizeFromOrigToEnc(x)` | L136 | encSize = x + 16(salt) + 16(tag) + 12(iv)，供决策树在加密模式下比较大小 |

## 6. 本地数据库 API（src/localdb.ts）

| 函数 | 说明 |
|---|---|
| `prepareDBs(vaultBasePath, vaultRandomIDFromOldConfigFile)` | 打开/迁移 7 张表，返回 `{db, vaultRandomID}`；vault ID 缺失时用 nanoid 生成并登记到映射表 |
| `loadPrevSyncRecordsByVault(db, vaultRandomID)` | 读 V3 基线记录（`PrevSyncRecord[]`） |
| `savePrevSyncRecordsByVault(db, vaultRandomID, records)` | 同步完成后整体重写基线（doActualSyncV3 L1566 调用） |
| `getSyncMetaMappingByRemoteKeyAndVault(...)` | 反向映射：远端加密 key → 本地 key/mtime/size（getRemoteStates 依赖） |
| `insertDeleteRecordByVault` / `insertRenameRecordByVault` | 监听 vault 事件实时记录文件操作（供旧版算法与历史审计） |
| `insertLoggerOutputByVault` / `clearExpiredLoggerOutputRecords` / `clearExpiredSyncPlanRecords` | 日志入库与 5 分钟周期清理（main.ts L1409-1447） |
| `migrateDBs*` 系列 | schema 迁移链 20211114 → 20220108（补 vaultRandomID 前缀）→ 20220326 → 20250430（新增 prevsyncrecords） |

## 7. 其他关键类

| 类 | 位置 | 说明 |
|---|---|---|
| `ThirdPartySyncSettingTab` | settings.ts:424 | 设置页主类；service chooser（L424-485）+ 各服务分组（S3 详设 L548-721）+ 全局项 + 连通性检查 |
| `OnedriveAuthModal` / `OnedriveRevokeAuthModal` | settings.ts:225 / 284 | OneDrive 授权/撤销流程弹窗 |
| `SyncAlgoV2Modal` | syncAlgoV2Notice.ts | 算法知情同意弹窗（回调 result: boolean） |
| `SizesConflictModal` | syncSizesConflictNotice.ts:6 | 超限文件冲突列表弹窗 |
| `I18n` | i18n.ts:12 | `t(key, vars?)`：auto 语言检测 → 词表查询 → en 回退 → Mustache 渲染 |

## 8. 工具函数精选（src/misc.ts）

- 路径：`dirname` / `getFolderLevels` / `getPathFolder` / `getParentFolder` / `mkdirpInVault`
- 编码：`encodeBase64` / `decodeBase64` / `arrayBufferToBase64` / `base64ToBase32` / `base64ToBase64url` / `hexStringToTypedArray`
- 分片：`getSplitRanges(bytesTotal, bytesEachPart)`（S3 multipart 用）
- 杂项：`isHiddenPath`（隐藏文件判定）、`statFix`（统一 stat 返回）、`unixTimeToStr`、`getLastSynced`（"刚刚/N 分钟前…"状态栏文案）、`roughSizeOfObject`、`reverseString`（metadata 混淆）
