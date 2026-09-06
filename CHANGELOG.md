# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> 说明：本更新日志自 `26.1.2` 起维护。

## [26.1.3] - 2026-09-04

### 问题修复

- 兼容部分 S3 兼容存储（如天翼云 `s3.cstcloud.cn`）：AWS SDK 默认会在 `PutObject` 上附加 `x-amz-checksum-crc32`，而部分服务不实现该校验和，导致上传被以校验和 mismatch（400/403）拒绝，表现为 `x-amz-checksum-crc32 mismatch`。现 S3 客户端配置 `requestChecksumCalculation: "WHEN_REQUIRED"`，仅当服务显式要求时才附带请求校验和。

## [26.1.2] - 2026-09-04

### 工程与代码质量

- 移除插件中无效的命令：删除「导出同步计划（JSON / 表格）」「从数据库导出终端日志」「查看同步状态」等已取消注册但残留的命令及对应死代码。
- 清理不再被代码引用的死翻译键（dead keys），减小打包体积。
- 补全缺失的翻译文案。