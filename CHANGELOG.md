# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> 说明：本更新日志自 `26.1.2` 起维护。

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