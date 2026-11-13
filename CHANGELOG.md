# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> 说明：本更新日志自 `26.1.2` 起维护。

## [26.3.0] - 2026-11-13

### 架构

- **OneDrive 鉴权方式重构：PKCE → Device Code Flow（RFC 8628）**：
  - 删除 PKCE 整套（`generateCodeVerifier` / `generateCodeChallenge` / `getAuthUrlAndVerifier` / `sendAuthReq` / `REDIRECT_URI` / `COMMAND_CALLBACK_ONEDRIVE` 协议处理器 / `plugin.oauth2Info` 成员），零残留
  - 新增 `src/onedriveAuth.ts`（~300 行）：`DeviceCodeFlowClient` 封装 `requestDeviceCode()` / `pollForToken()` / `refreshToken()` / `cancelPolling()`，Entra AADSTS 错误码 → 用户友好文案映射（企业账号 `AADSTS50152/70002/50020/50026` 归为 `personal_only`、设备码过期 `AADSTS50166/50194` 归为 `code_expired` 等 6 档）
  - 新增 `src/tokenStorage.ts`（~180 行）：Obsidian SecretStorage 持久化 token（桌面端进 macOS Keychain / Windows Credential Manager，移动端进平台安全存储），data.json 旧字段一次性迁移并清空；**minAppVersion 由 1.11.0 升至 1.11.4**（SecretStorage API 最低版本）
  - `DeviceCodeAuthModal` 纯展示 + 状态标记（等待/成功/失败 + 重试按钮），轮询逻辑外置到 settings tab，授权成功后 `tokenStorage.setTokens()` 写入 + 拉用户名 + Notice + 自动关闭；授权弹窗桌面端自动唤起浏览器并打开设备码页面
  - `OneDriveRevokeAuthModal` 撤回鉴权时追加 `lastSynced = -1`（换账号/重新授权后强制全量比对），同时清空 SecretStorage token + `deltaLink` + 远端快照
- **MyAuthProvider 单飞锁**：并发 refresh 只触发一次网络请求，避免互相 invalidate refresh_token
- **refresh_token grant 收拢**：删除独立 `sendRefreshTokenReq(clientID, authority, refreshToken)` 三参数函数，统一走 `DeviceCodeFlowClient.refreshToken()`，scope/endpoint/clientId 从 client 实例 options 取

### OneDrive API 增强

- **指数退避自动重试**：`oneDriveApiRequest` 对 429(限流) / 502 / 503 / 504(网关抖动) 瞬态错误自动重试 3 次（1s → 2s → 4s），401 / 403 / 404 / 410 等永久错误立即抛出不重试
- **`buildRemoteApiError` RAW BODY 清理**：原始响应体不再拼进 `Error.message`，改存 `err.cause.rawBody` 供调试；message 只保留简洁的 `OneDrive API {method} {url} 失败 (HTTP {status})`
- **`humanizeApiError()` 友好错误文案**：sync 失败 Notice 按 status/code 显示中文——401 "授权已失效"、429 "限流"、502/503/504 "服务暂时不可用"、`itemNotFound` "文件不存在" 等；同时修复下载错误路径把临时 signed URL 拼进 Notice 的问题，改用 key（approot 路径）

### 调整

- **OneDrive 声明文案更新**：disclaimer1 合并"只支持 OneDrive 个人版"限制声明；disclaimer2 与 folder 文案三语对齐简体语义；consent URL `account.live.com/consent/manage`；声明段落内的 URL 自动转为超链接（可点击新开标签页）
- **三服务远端声明与路径文案对齐**：
  - OneDrive 远端文件夹路径硬编码为 `/Apps/third-party-sync/Obsidian Vault`（不再根据插件 ID 与仓库名拼接）
  - WebDAV 远端文件夹路径硬编码为 `/Obsidian Vault`
  - S3 / WebDAV / OneDrive 声明第二段统一去除多余语气助词、三语对齐简体语义
  - 同步清理 settings.ts 中对应 `t()` 调用的变量传参（占位符已移除）

## [26.2.9] - 2026-11-12

### 修复
- **状态栏首次加载不显示**：移除 `toggleStatusBar` 里对 `.status-bar` DOM 容器的提前 return 守卫，容器不存在时只跳过样式操作，`addStatusBarItem()` 作为 Obsidian 插件级 API 无条件调用

### 调整
- **OneDrive 授权入口**：桌面端点授权后自动唤起系统浏览器打开授权页（`Platform.isMobileApp` 时跳过）；关闭弹窗即清空本轮 PKCE verifier，授权流程作废需重新发起
- **「同步配置文件夹」去掉实验性质标签**：三语标题移除 experimental / 实验性质 / 實驗性 后缀，风险提示文案保留

## [26.2.8] - 2026-11-04

### 修复

- **OneDrive 删除文件后同步反复中止（远端快照幽灵条目）**：删除笔记后远端快照未移除对应键，下一轮被判为"远端新增"去下载，元数据查询、二进制下载或本地 DELETE 任一处遇 HTTP 404 即累计错误、凑够 3 条整轮中止且每轮重复；现 404/410 统一视为"远端已不存在"——摘除快照键、跳过该条目、不计入错误累计（401/403/429/5xx 与网络错误仍正常报错）
- **delta 删除项缺可用路径时快照幽灵键残留**：OneDrive delta 返回的 deleted 条目若缺 `name` 或路径原被整条跳过，快照永久残留幽灵键；现优先算 key，字段不全时退化为文件名后缀反查，两者都失败时下一次同步自动清空并全量枚举重建基线
- **双向同步空文件覆盖非空文件（Issue #6）**：每日笔记等插件在本地重建空文件（先删后建）时，即使冲突策略设为"大版本存活"或"较新版本存活"，空文件仍会因 mtime 更新走 mtime 比较路径、覆盖远端非空副本；空文件保护此前仅覆盖 prevSync 不存在的无基线场景，现移除该限制，空文件在所有双向同步 + 冲突策略非 disabled 的双方存在场景下均被保护
- **「同步配置文件夹」开启后实际未生效（Issue #7）**：设置页 toggle 的 onChange 回调 else 分支无条件把 syncConfigDir 设为 false，用户在二次确认模态框点确认后 toggle.setValue(true) 会二次触发 onChange、落入 else 分支覆盖为 false——模态框 saveSettings 存的 true 被紧接着的 saveSettings 覆盖为 false；UI 显示打开但 data.json 里实际是 false，重启后加载为关闭且配置文件全部跳过。现 else 分支仅处理 val=false（用户主动关闭）的情况，模态框确认后的 re-entrant 回调什么都不做
- **状态栏同步进度文案统一**：百分比由全角括号改为中点分隔（`45/120 · 37%`），中英文模板统一在文件数前留一个空格；步骤序号与服务名保持不变
- **OneDrive 授权入口改进**：桌面端点击授权后自动唤起系统浏览器打开授权页，移动端保留可点链接与复制按钮；关闭授权弹窗即清空本轮 PKCE verifier，本次授权作废，需重新发起
- **状态栏首次加载不显示**：onload 时若 Obsidian status bar DOM 尚未就绪，`toggleStatusBar` 会提前 return 导致 `statusBarElement` 未创建，后续点击 ribbon 同步按钮也不会显示状态栏；现 `updateStatusBar` 入口加兜底，检测到元素缺失时自动补建

## [26.2.7] - 2026-11-03

### 设置

- **通用设置项精简**：
  - 「自动同步」下拉收窄为 **4 档**：-1(关) / 5min / 10min / 30min。删除 5s / 15s / 30s / 1min 四档。**存量用户若原设了 5s / 15s / 30s / 1min，自动归到 5 分钟**；-1 / 5min / 10min / 30min 原值保留。归一化在 loadSettings 内完成
  - 「保存后同步延迟」下拉删除"立即"档（0ms），收窄为 **4 档**：-1(关) / 5s / 10s / 30s。旧值 1min 档归到 30s；旧值 0 档仅 v2 残留迁移分支内映射到 5s，其余老用户保留 0 并在运行时按关闭处理（原"立即"变为关闭）
  - 「检测远端变更后同步延迟」下拉收窄为 **4 档**：-1(关) / 5s / 10s / 30s。删除 1s 档，原 1s 归一化为 30s；旧值 1min 档归到 30s
  - 「启动后运行一次」**删除**：启动后首次同步不再单独可配，跟随「自动同步」档位——自动同步 > 0 时，调度器启动后固定 5 秒触发首次（周期关闭 → 首次也不跑）。字段 initRunAfterMilliseconds 保留在数据模型里供旧数据兼容与回滚，运行时零消费

### 架构

- **SyncAutoScheduler 统一调度器**：
  - 自动同步来源从多个独立定时器合并为一个调度器管理
  - AUTO_MIN_INTERVAL_MS = 30s **仅用于跨来源抢占仲裁**：当 pending 中有 ≥ 2 个不同来源时，后到的被推至前次自动同步后 30 秒；**同一来源连续触发（trailing debounce）不受约束**（例如保存后设 5s 延迟，连续保存按 5s 节奏正常执行）
  - syncRun 执行中自动请求挂起，完成后重算
  - 手动同步完全不受此下限约束
- **保存后同步反馈环防护**：modify handler 主动排除插件自身 `data.json`，避免 `syncRun → saveSettings → modify → syncRun` 循环
- **幂等迁移逻辑**：自动同步相关字段（autoRunEveryMilliseconds / syncOnSaveAfterMilliseconds / syncOnRemoteChangesAfterMilliseconds）迁移时，若 data.json 里还存在上一轮的 v2 字段残留（autoSyncEnabled / autoSyncPeriodMinutes / syncOnSaveMode），v1 原值（含默认 -1）直接保留，v2 字段不再映射——只有 v2 字段的用户最终落到 -1（三项全关）；幂等标记 autoSyncConsolidatedMigrated 只跑一次

## [26.2.6] - 2026-11-01

### 性能

- **OneDrive「获取远端文件列表」提速（量级改善）**：`listFromRemote` 重写，修复 deltaLink 只存不用问题——
  - Delta 续传：首次同步存下完整远端快照（key → RemoteItem）与 `@odata.deltaLink`；后续同步仅拉取增量变化（增 / 改 / 删）合并进快照后返回完整列表，无改动时亚秒级完成
  - 分页尺寸 `$top=200`：OneDrive Graph 默认每页 20 条，全量枚举 1000 文件需 50 次串行往返；改传 `$top=200` 拉满 API 上限后降至 5 次，首次同步约 10× 提速
  - 删除语义补全：此前 delta 返回的 `deleted` 条目被直接跳过，续传时远端删除会被吞掉；现在删除条目正常解析并从快照移除（元数据异常时按文件名后缀反查兜底）
  - 失败回退：deltaLink 过期（410 Gone）或网络异常时自动清空续传状态，回退全量枚举，下次同步自动恢复；「清空远端并重新推送」会一并清空续传状态，避免脏快照

### 修复

- 修复 esbuild 构建脚本 url 依赖问题：此前 `nodeCoreAliases` 硬编码 `require.resolve("url/")`，移除 url 依赖后构建静默失败（退出码 1，被管道 `| tail` 掩蔽），产物仍停留在旧代码。现已将 url 移入 empty-module 空实现，build 以真退出码验证通过。

### 设置

- 设置页组名精简：「基本设置」→「通用」、「同步内容」→「同步」、「进阶设置」→「高级」。
- 「同步」组内顺序重排：「同步 _ 文件或文件夹」置顶，以下依次为「同步 .trash 文件夹」→「同步书签」→「同步配置文件夹」。

### 国际化

- **精简语言包，14 → 3**：删除 de / fr / es / ja / ru / ko / it / nl / sv / da / no 共 11 个语言包，仅保留 en、zh_cn、zh_tw。obsidian moment locale 检测到已移除语言时自动 fallback 到 en，不影响用户使用。产物 main.js 从 1.4mb 降至 ~1.0mb。

## [26.2.5] - 2026-10-31

### 安全

- 移除上游遗留的零引用运行时依赖 `url`（连同 browser 字段映射与 `qs` override）：其传递依赖 `qs@6.16.0` 处于 GHSA-6pq8-jhm2-2vcw 漏洞范围（查询字符串 DoS）。该依赖链从未进入构建产物，移除后 `qs` 彻底退出依赖树。

### 设置

- 「当前状态」摘要卡的上次同步时间格式由 ISO 8601（`2026-10-27T09:05:24+08:00`）改为简洁格式（`2026-10-27 09:05:24`）。
- 设置项调整归组：「禁用 S3 远端元数据同步」移至 S3 区（紧跟「本地绕过 CORS 问题」）；「检查可否连接」移至末位（分块并行度之后）。「跳过大文件」移至进阶设置。「同步内容」现含四个内容范围开关（回收站 / 书签 / 下划线项 / 配置文件夹），形式统一为胶囊开关。
- 移除「在状态栏显示上一次成功的同步」设置项：状态栏信息（上次同步时间与同步进度）现默认始终显示，桌面与移动端行为统一。
- 重写「本地绕过 CORS 问题」描述：改为中性说明两条网络通道（开启走 Obsidian 原生接口、无需配置 CORS 规则；关闭走标准接口、需在服务商配置）。「本地绕过 CORS 问题」改为胶囊开关，与其他布尔设置形式统一。
- 服务详情区标题精简：「OneDrive（个人版）设置」改为「OneDrive 设置」。
- 设置组「调试」更名为「重置」，「开启调试模式」开关更名为「开启重置」并重写描述（开启后显示各项重置与修复操作，同步过程显示 8 个步骤详细进度）。「开启重置」改为胶囊开关，与书签 / 回收站等开关形式统一。
- 重置类设置描述文案修正：「删除同步映射记录」的描述与名称术语统一；「重设本地缓存和数据库」修正中文标点与 S3 大小写、英文去除程序化写法（`{s3, password...}`）。
- 「重设本地缓存和数据库」行为补全：现在会同时把上次同步时间（lastSynced）重置为从未同步——此前仅清空 IndexedDB，data.json 中的 lastSynced 保留旧值，与"本地同步基线已清空"的状态不一致，且影响"无远端元数据文件时以 lastSynced 为回退基准"的同步判定。设置页摘要卡随之立即显示"从未同步"。
- 「清空远端并重新推送」的设置页描述在 12 个语言包（de/fr/es/it/nl/da/sv/no/ru/ja/ko/zh_tw）补齐翻译，并按确认弹窗口径修正作用范围表述（S3 为整个存储桶，WebDAV / OneDrive 为远端基文件夹）。

## [26.2.4] - 2026-10-25

### 新增

- 精简同步通知：自动触发（保存 / 自动运行 / 远端运行 / 启动运行）的同步本就静默，过程信息由状态栏实时进度呈现；手动触发的同步不再弹出「正在交换数据」开始通知，仅保留完成结果通知（失败 / 冲突通知不受影响），调试模式 8 步通知保留。
- 状态栏实时进度百分比：数据交换阶段状态栏显示「正在交换数据 45/120（37%）」格式的实时进度（每完成一个上传/下载更新一次；删除与建文件夹动作不计数），同步结束自动恢复为上次同步时间显示；14 个语言包同步新增文案。

### 修复

- 「清空远端并重新推送」在英文界面显示为裸 key（如 `modal_wipecloud_title`）：26.2.3 术语统一时英文语言包的 key 名被一并改为 `wiperemote`，与代码引用（`wipecloud`）及其他 13 个语言包不一致，导致回退链落空。现英文 key 名恢复为 `wipecloud`（值保持 remote 术语）。
- 「清空远端并重新推送」弹窗改为两阶段加载：点击立即弹出并显示统计进度，远端文件统计完成后才启用确认按钮，消除大 vault 下点击后的长时间无反馈。
- 「清空远端并重新推送」现在会连同文件夹一并删除（按层级从深到浅）：此前 OneDrive / WebDAV 的文件夹被当作 S3 占位符跳过，远端残留空文件夹树，切回双向同步后会被当作远端独有文件夹重新同步回本地。
- 双向同步新增无基线空文件保护：本地新建的空文件（如跨设备竞速的每日笔记）不再仅因 mtime 较新就上传覆盖远端非空副本，远端空文件也不会遮蔽本地非空副本（明文同步）；该保护在冲突解决非"禁用"时生效。
- 界面品牌名大小写修正：全部 14 个语言包中的 "Onedrive" / "Webdav" 统一为官方拼写 "OneDrive" / "WebDAV"（涉及服务设置标题、状态摘要卡服务名、服务选择描述、连接提示等约 70 处）；同步通知与状态栏此前直接显示内部标识符（如 "onedrive"），现改为显示规范服务名（S3 / OneDrive / WebDAV）。

### 设置

- 界面术语统一：云端 → 远端（「清空远端并重新推送」及全部相关提示文案），与「远端基文件夹」「远端同步元数据」等既有术语保持一致。

### 国际化

- 26.2.3 界面改版的 11 条新增文案补齐全部 14 个语言包（新增 121 条翻译），方向短标签沿用各语言既有术语。
- 同步通知与状态栏文案精简：移除「Third-party Sync」前缀，服务名（S3 / OneDrive / WebDAV）与步骤序号直接入句，如调试模式「1/8 OneDrive 正在准备」、非调试通知「1/2 OneDrive 正在交换数据」、状态栏进度「1/2 OneDrive 正在交换数据 45/120（37%）」（调试模式下序号对应为 7/8），步骤类文案末尾不再带标点符号；非调试开始通知措辞同步由「开始同步」改为「正在交换数据」，14 个语言包同步调整。

## [26.2.3] - 2026-10-25

### 新增

- 设置页顶部新增「当前状态」摘要行：打开设置即可一眼确认当前服务 · 同步方向 · 是否加密 · 上次同步时间，方便日常核对与报障截图。

### 设置

- 「同步方向」从高级设置上移至基本设置（紧跟加密密码之后）——它是决定其余设置语义的总纲，不应埋在高级区。
- 新增「同步内容」小节，聚合原先散落各处的六项：同步回收站、同步书签、下划线项、配置文件夹、状态栏显示、跳过大文件。
- 下划线项与同步配置文件夹由 enable/disable 下拉改为开关形式（配置文件夹的二次确认弹窗保留），与回收站 / 书签的交互统一。
- 触发时机四项按使用频率重排：保存运行 → 自动运行 → 远端运行 → 启动运行。
- 「导入导出」分组取消，导出 / 导入两项并入进阶设置；设置页层级精简为选择服务 → 基本设置 → 进阶设置 → 调试。
- 调试区「清空云端并重新推送」按钮改为警示色（`mod-warning`），与三个修复类按钮视觉区分。

## [26.2.2] - 2026-10-25

### 新增

- 新增「清空云端并重新推送」（调试区按钮）：删除当前同步服务的全部远端文件（S3 为整个存储桶，WebDAV / OneDrive 为远端基文件夹）并重置本地基线，随后自动执行一次全量推送。适用于加密密码更换、云端数据被污染或彻底重建云端备份。带二次确认弹窗（显示文件数与不可恢复警告）；增量拉取方向下禁用；以空密码按远端真实文件名删除，旧密码加密的遗留文件同样可清除；删除失败不阻断，中断可由后续同步自愈。

### 修复

- 调试模式下同步通知第 2–6 步显示为裸 key（如 `syncrun_step2`）：补齐缺失的 5 个步骤文案 key（获取云端列表 / 校验密码 / 解析云端状态 / 收集本地文件 / 生成计划），中文（简繁）与英文语言包同步更新，其余语言回退英文。

### 设置

- 设置项「同步方向」移除「（实验性质）」标注（V3 同步决策矩阵落地后不再适用），全部 14 个语言包同步清理。
- 调试区四个按钮按破坏性从轻到重重新排序：删除同步映射记录 → 重置远端同步元数据 → 重设本地缓存和数据库 → 清空云端并重新推送。

### 移除

- 移除「导出同步计划」与「导出日志历史」功能及其入口：同步计划在 V3 重构后已不再写入本地数据库，日志写入（`logToDB`，默认关闭）随之停止，约 -370 行死代码。IndexedDB 中 `syncplanshistory` / `loggeroutput` 两个存储保留以兼容旧库 schema，历史数据留存但不再读写。调试模式的其余能力（8 步详细通知、控制台日志、修复按钮）不受影响。

## [26.2.1] - 2026-10-24

### 安全

- 通过 `overrides` 将传递依赖 `moment` 强制提升至 2.31.0，消除 GHSA-4p3w-j4w9-5jqw 公告（`obsidian` 官方包将其精确固定在 2.29.4；实际产物不打包该库，源码使用 Obsidian 宿主提供的 moment）。
- 升级传递依赖 `brace-expansion` 全部三条版本线至修复版（1.1.21 / 2.1.7 / 5.0.12），消除 GHSA-q2hr-2g5m-vwhr 等 3 个 DoS 公告（该包仅存在于 eslint 开发链，不进产物）。

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
