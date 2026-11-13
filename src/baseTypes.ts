/**
 * Only type defs here.
 * To avoid circular dependency.
 */

import { Platform, requireApiVersion } from "obsidian";
import type { LangTypeAndAuto } from "./i18n";

export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export type SUPPORTED_SERVICES_TYPE = "s3" | "webdav" | "onedrive";

export type SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR =
  | "webdav"
  | "onedrive";

export interface S3Config {
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyID: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
  bypassCorsLocally?: boolean;
  partsConcurrency?: number;
  forcePathStyle?: boolean;
  disableS3MetadataSync: boolean;
}


export type WebdavAuthType = "digest" | "basic";
export type WebdavDepthType =
  | "auto_unknown"
  | "auto_1"
  | "auto_infinity"
  | "manual_1"
  | "manual_infinity";

export interface WebdavConfig {
  address: string;
  username: string;
  password: string;
  authType: WebdavAuthType;
  manualRecursive: boolean; // deprecated in 0.3.6, use depth
  depth?: WebdavDepthType;
  remoteBaseDir?: string;
}

export interface OnedriveConfig {
  accessToken: string;
  clientID: string;
  authority: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  accessTokenExpiresAtTime: number;
  deltaLink: string;
  /**
   * Remote snapshot (key -> RemoteItem) for delta API resume.
   * Stored next to deltaLink so the next sync can fetch only the
   * incremental changes instead of a full enumeration.
   * Cleared together with deltaLink when it expires (410 Gone) or on wipe.
   */
  remoteSnapshot?: Record<string, RemoteItem>;
  username: string;
  credentialsShouldBeDeletedAtTime?: number;
  remoteBaseDir?: string;
}

export interface ThirdPartySyncPluginSettings {
  s3: S3Config;
  webdav: WebdavConfig;
  onedrive: OnedriveConfig;
  password: string;
  serviceType: SUPPORTED_SERVICES_TYPE;
  debugEnabled?: boolean;

  // ── 自动同步（最终形态，26.2.7-preview） ──
  /** 自动同步周期毫秒数，含启动首次固定 5s 延迟；-1 = 关闭。选项见 settings.ts。 */
  autoRunEveryMilliseconds?: number;
  /** 保存后同步延迟毫秒数；-1 = 关闭（已删除 0/立即 档）。 */
  syncOnSaveAfterMilliseconds?: number;
  /** 远端变更后同步延迟毫秒数；-1 = 关闭。 */
  syncOnRemoteChangesAfterMilliseconds?: number;
  /** 迁移幂等标记：true 表示已处理过上一轮 autoSyncEnabled / autoSyncPeriodMinutes / syncOnSaveMode 残留，不再重复 */
  autoSyncConsolidatedMigrated?: boolean;

  /** @deprecated 26.2.7-preview 起合并入 autoRunEveryMilliseconds 的启动首次触发（autoRun > 0 时固定 5s），运行时不再消费 */
  initRunAfterMilliseconds?: number;

  agreeToUploadExtraMetadata?: boolean;
  concurrency?: number;
  syncConfigDir?: boolean;
  syncUnderscoreItems?: boolean;
  lang?: LangTypeAndAuto;
  skipSizeLargerThan?: number;
  enableStatusBarInfo: boolean;
  lastSynced?: number;
  syncTrash: boolean;
  syncBookmarks: boolean;
  syncDirection?: SyncDirectionType;
  protectModifyPercentage?: number;
  ignorePaths?: string[];
  onlyAllowPaths?: string[];
  conflictAction?: ConflictActionType;
  deleteToWhere?: DeleteToWhereType;

  /**
   * @deprecated
   */
  vaultRandomID?: string;
}

export interface RemoteItem {
  key: string;
  lastModified: number;
  size: number;
  remoteType: SUPPORTED_SERVICES_TYPE;
  etag?: string;
}

export const COMMAND_URI = "third-party-sync";
export const COMMAND_CALLBACK = "third-party-sync-cb";

export interface UriParams {
  func?: string;
  vault?: string;
  ver?: string;
  data?: string;
  compressed?: string;
}

// 80 days
export const OAUTH2_FORCE_EXPIRE_MILLISECONDS = 1000 * 60 * 60 * 24 * 80;

type DecisionTypeForFile =
  | "skipUploading" // special, mtimeLocal === mtimeRemote
  | "uploadLocalDelHistToRemote" // "delLocalIfExists && delRemoteIfExists && cleanLocalDelHist && uploadLocalDelHistToRemote"
  | "keepRemoteDelHist" // "delLocalIfExists && delRemoteIfExists && cleanLocalDelHist && keepRemoteDelHist"
  | "uploadLocalToRemote" // "skipLocal && uploadLocalToRemote && cleanLocalDelHist && cleanRemoteDelHist"
  | "downloadRemoteToLocal"; // "downloadRemoteToLocal && skipRemote && cleanLocalDelHist && cleanRemoteDelHist"

type DecisionTypeForFileSize =
  | "skipUploadingTooLarge"
  | "skipDownloadingTooLarge"
  | "skipUsingLocalDelTooLarge"
  | "skipUsingRemoteDelTooLarge"
  | "errorLocalTooLargeConflictRemote"
  | "errorRemoteTooLargeConflictLocal";

type DecisionTypeForFileOneDriveEmpty =
  | "skipUploadingOneDriveEmpty";

type DecisionTypeForFolder =
  | "createFolder"
  | "uploadLocalDelHistToRemoteFolder"
  | "keepRemoteDelHistFolder"
  | "skipFolder";

export type DecisionType =
  | DecisionTypeForFile
  | DecisionTypeForFileSize
  | DecisionTypeForFileOneDriveEmpty
  | DecisionTypeForFolder;

export interface FileOrFolderMixedState {
  key: string;
  existLocal?: boolean;
  existRemote?: boolean;
  mtimeLocal?: number;
  mtimeRemote?: number;
  deltimeLocal?: number;
  deltimeRemote?: number;
  sizeLocal?: number;
  sizeLocalEnc?: number;
  sizeRemote?: number;
  sizeRemoteEnc?: number;
  changeRemoteMtimeUsingMapping?: boolean;
  changeLocalMtimeUsingMapping?: boolean;
  decision?: DecisionType;
  syncDone?: "done";
  remoteEncryptedKey?: string;
  prevSync?: { mtime: number; size: number; keyType: "folder" | "file" };

  mtimeLocalFmt?: string;
  mtimeRemoteFmt?: string;
  deltimeLocalFmt?: string;
  deltimeRemoteFmt?: string;
}

export const API_VER_STAT_FOLDER = "0.13.27";
export const API_VER_REQURL = "0.13.26"; // desktop ver 0.13.26, iOS ver 1.1.1
export const API_VER_REQURL_ANDROID = "0.14.6"; // Android ver 1.2.1

export const VALID_REQURL =
  (!Platform.isAndroidApp && !Platform.isMobileApp && requireApiVersion(API_VER_REQURL)) ||
  (Platform.isAndroidApp && requireApiVersion(API_VER_REQURL_ANDROID)) ||
  (Platform.isMobileApp && !Platform.isAndroidApp && requireApiVersion(API_VER_REQURL)); // iOS uses the same version as desktop

export const DEFAULT_DEBUG_FOLDER = "_debug_remotely_save/";
export const DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX =
  "sync_plans_hist_exported_on_";
export const DEFAULT_LOG_HISTORY_FILE_PREFIX = "log_hist_exported_on_";

export type SyncTriggerSourceType = "manual" | "auto" | "dry" | "autoOnceInit";

export type DeleteToWhereType = "system_trash" | "obsidian_trash";
export type ConflictActionType = "keep_newer" | "keep_larger";

export type SyncDirectionType =
  | "bidirectional"
  | "incremental_pull_only"
  | "incremental_push_only"
  | "incremental_pull_and_delete_only"
  | "incremental_push_and_delete_only";

export interface SyncPlanType {
  ts: number;
  tsFmt?: string;
  syncTriggerSource?: SyncTriggerSourceType;
  remoteType: SUPPORTED_SERVICES_TYPE;
  mixedStates: Record<string, FileOrFolderMixedState>;
}
