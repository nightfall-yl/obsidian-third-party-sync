import {
  Modal,
  Notice,
  Plugin,
  Setting,
  setIcon,
  FileSystemAdapter,
  Platform, Vault, EventRef, TFile, normalizePath,
} from "obsidian";

import type {
  FileOrFolderMixedState,
  ThirdPartySyncPluginSettings,
  SyncTriggerSourceType,
  SyncPlanType,
} from "./baseTypes";
import {
  COMMAND_CALLBACK,
  COMMAND_CALLBACK_ONEDRIVE,
  COMMAND_URI,
} from "./baseTypes";
import { importQrCodeUri } from "./importExport";
import {
  loadFileHistoryTableByVault,
  loadPrevSyncRecordsByVault,
  prepareDBs,
  InternalDBs,
  insertDeleteRecordByVault,
  insertRenameRecordByVault,
} from "./localdb";
import { RemoteClient } from "./remote";
import {
  AccessCodeResponseSuccessfulType,
  DEFAULT_ONEDRIVE_CONFIG,
  sendAuthReq as sendAuthReqOnedrive,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplaceOnedrive,
} from "./remoteForOnedrive";
import { DEFAULT_S3_CONFIG } from "./remoteForS3";
import { DEFAULT_WEBDAV_CONFIG } from "./remoteForWebdav";
import { ThirdPartySyncSettingTab } from "./settings";
import { SyncStatusType, isPasswordOk, getRemoteStates, getSyncPlanV3, doActualSyncV3 } from "./sync";
import { DeletionOnRemote, MetadataOnRemote, deserializeMetadataOnRemote } from "./metadataOnRemote";
import { messyConfigToNormal, normalConfigToMessy } from "./configPersist";
import { ObsConfigDirFileType, listFilesInObsFolder } from "./obsFolderLister";
import { I18n } from "./i18n";
import type { LangTypeAndAuto, TransItemType } from "./i18n";
import { SyncAlgoV2Modal } from "./syncAlgoV2Notice";
import { applyPresetRulesInplace } from "./presetRules";
import { SyncAutoScheduler, type AutoSyncSource } from "./syncScheduler";

import { log } from "./moreOnLog";
import AggregateError from "aggregate-error";

import { SizesConflictModal } from "./syncSizesConflictNotice";
import {getLastSynced} from "./misc";

const DEFAULT_SETTINGS: ThirdPartySyncPluginSettings = {
  s3: DEFAULT_S3_CONFIG,
  webdav: DEFAULT_WEBDAV_CONFIG,
  onedrive: DEFAULT_ONEDRIVE_CONFIG,
  password: "",
  serviceType: "s3",
  debugEnabled: false,
  // 自动同步最终形态：三个独立下拉，全部默认 -1（关闭）
  autoRunEveryMilliseconds: -1,
  syncOnSaveAfterMilliseconds: -1,
  syncOnRemoteChangesAfterMilliseconds: -1,
  autoSyncConsolidatedMigrated: false,
  agreeToUploadExtraMetadata: false,
  concurrency: 5,
  syncConfigDir: false,
  syncUnderscoreItems: false,
  lang: "auto",
  skipSizeLargerThan: -1,
  enableStatusBarInfo: undefined,
  lastSynced: -1,
  syncTrash: false,
  syncBookmarks: true,
  syncDirection: "bidirectional",
  protectModifyPercentage: 50,
  deleteToWhere: "system_trash",
};

interface OAuth2Info {
  verifier?: string;
  helperModal?: Modal;
  authSetting?: Setting;
  revokeAuthSetting?: Setting;
}

const iconNameSyncWait = "rotate-ccw";
const iconNameSyncRunning = "refresh-ccw";

// Display name for a service type identifier ({{serviceType}} in i18n texts):
// the raw identifier "onedrive" must show as "OneDrive"
const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  s3: "S3",
  onedrive: "OneDrive",
  webdav: "WebDAV",
};
const serviceDisplayName = (serviceType: string): string =>
  SERVICE_DISPLAY_NAMES[serviceType] ?? serviceType;

export default class ThirdPartySyncPlugin extends Plugin {
  settings: ThirdPartySyncPluginSettings;
  db: InternalDBs;
  syncStatus: SyncStatusType;
  statusBarElement: HTMLSpanElement;
  oauth2Info: OAuth2Info;
  currSyncMsg?: string;
  syncRibbon?: HTMLElement;
  i18n: I18n;
  vaultRandomID: string;
  isManual: boolean;
  isAlreadyRunning: boolean;
  private autoScheduler: SyncAutoScheduler;
  private vaultEventRefs: EventRef[] = [];
  private remoteCheckIntervalID?: number;
  private vaultScannerIntervalId?: number;
  statusBarIntervalID: number;
  currentTriggerSource?: SyncTriggerSourceType;

  async syncRun(triggerSource: SyncTriggerSourceType = "manual") {
    this.isManual = triggerSource === "manual";
    this.isAlreadyRunning = false;
    this.currentTriggerSource = triggerSource;
    const MAX_STEPS = this.settings.debugEnabled ? 8 : 2;
    await this.createTrashIfDoesNotExist();

    const t = (x: TransItemType, vars?: Record<string, string>) => {
      return this.i18n.t(x, vars);
    };

    // Display name for the current service ({{serviceType}} in syncrun_step1 /
    // syncrun_shortstep1)
    const serviceDisplayNameCurrent = serviceDisplayName(this.settings.serviceType);

    const getNotice = (s: SyncTriggerSourceType, msg: string, timeout?: number) => {
      if (s === "manual" || s === "dry") {
        new Notice(msg, timeout);
      }
    };

    // Notice function - shows notifications at each step
    const notifyFunc = async (s: SyncTriggerSourceType, step: number) => {
      if (s !== "manual" && s !== "dry") {
        return; // Auto sync doesn't show notices
      }

      if (this.settings.debugEnabled) {
        // Debug mode: show all steps with detailed format
        switch (step) {
          case 0:
            if (s === "dry") {
              getNotice(s, t("syncrun_step0", { current: "0", maxSteps: "8", serviceType: serviceDisplayNameCurrent }), 0);
            }
            break;
          case 1:
            getNotice(s, t("syncrun_step1", {
              current: "1", maxSteps: "8", serviceType: serviceDisplayNameCurrent
            }));
            break;
          case 2:
          case 3:
          case 4:
          case 5:
          case 6:
            getNotice(s, t(`syncrun_step${step}`, {
              current: `${step}`, maxSteps: "8"
            }));
            break;
          case 7:
            if (s === "dry") {
              getNotice(s, t("syncrun_step7skip", { current: "7", maxSteps: "8", serviceType: serviceDisplayNameCurrent }));
            } else {
              getNotice(s, t("syncrun_step7", { current: "7", maxSteps: "8", serviceType: serviceDisplayNameCurrent }));
            }
            break;
          case 8:
            getNotice(s, t("syncrun_step8", { current: "8", maxSteps: "8", serviceType: serviceDisplayNameCurrent }));
            break;
        }
      } else {
        // Non-debug mode: show short format
        switch (step) {
          case 0:
            if (s === "dry") {
              getNotice(s, t("syncrun_shortstep0", { serviceType: serviceDisplayNameCurrent }), 0);
            }
            break;
          // case 1: no "starting" notice any more - the status bar shows live
          // progress (1/2 … 45/120 (37%)) right after the click; only the
          // completion notice stays (case 8)
          case 7:
            if (s === "dry") {
              getNotice(s, t("syncrun_shortstep2skip", { serviceType: serviceDisplayNameCurrent }));
            }
            break;
          case 8:
            getNotice(s, t("syncrun_shortstep2", { serviceType: serviceDisplayNameCurrent }));
            if (s === "dry") {
              getNotice(s, t("syncrun_shortstep3drydone", { serviceType: serviceDisplayNameCurrent }));
            }
            break;
        }
      }
    };

    // Step message builder - shared wording for notices and the status bar.
    // Not gated by trigger source: auto syncs stay silent on notices
    // but still update the status bar.
    const stepMsg = (s: SyncTriggerSourceType, step: number): string => {
      if (this.settings.debugEnabled) {
        switch (step) {
          case 0:
            return t("syncrun_step0", { current: "0", maxSteps: "8", serviceType: serviceDisplayNameCurrent });
          case 1:
            return t("syncrun_step1", {
              current: "1", maxSteps: "8", serviceType: serviceDisplayNameCurrent
            });
          case 2:
          case 3:
          case 4:
          case 5:
          case 6:
            return t(`syncrun_step${step}`, {
              current: `${step}`, maxSteps: "8"
            });
          case 7:
            return s === "dry"
              ? t("syncrun_step7skip", { current: "7", maxSteps: "8", serviceType: serviceDisplayNameCurrent })
              : t("syncrun_step7", { current: "7", maxSteps: "8", serviceType: serviceDisplayNameCurrent });
          case 8:
            return t("syncrun_step8", { current: "8", maxSteps: "8", serviceType: serviceDisplayNameCurrent });
        }
        return "";
      }
      switch (step) {
        case 0:
          return t("syncrun_shortstep0", { serviceType: serviceDisplayNameCurrent });
        case 1:
          return t("syncrun_shortstep1", { serviceType: serviceDisplayNameCurrent });
        case 7:
          return s === "dry" ? t("syncrun_shortstep2skip", { serviceType: serviceDisplayNameCurrent }) : "";
        case 8:
          return s === "dry" ? t("syncrun_shortstep3drydone", { serviceType: serviceDisplayNameCurrent }) : t("syncrun_shortstep2", { serviceType: serviceDisplayNameCurrent });
      }
      return "";
    };

    // Status bar step function - mirrors the notice messages onto
    // the status bar so the sync progress is visible while running
    const statusBarStepFunc = (s: SyncTriggerSourceType, step: number) => {
      if (this.statusBarElement === undefined || this.settings.enableStatusBarInfo !== true) {
        return;
      }
      const msg = stepMsg(s, step);
      if (msg === "") {
        return;
      }
      this.statusBarElement.setText(msg);
      this.statusBarElement.setAttribute("aria-label", msg);
    };

    // Status bar function - updates status bar at step 1 and step 8
    const statusBarFunc = async (s: SyncTriggerSourceType, step: number, everythingOk: boolean) => {
      if (step === 1) {
        // Show "syncing..." on status bar
        this.updateSyncStatus("syncing");
      } else if (step === 8) {
        if (everythingOk) {
          // Update with the latest lastSynced time
          this.updateSyncStatus("idle");
        } else {
          this.updateSyncStatus("idle");
        }
      }
    };

    // Make sure two syncs can't run at the same time
    if (this.syncStatus !== "idle") {
      if (triggerSource == "manual") {
        // Show notice for debug, mobile, or desktop
        if (this.settings.debugEnabled) {
          new Notice(t("syncrun_debug_alreadyrunning", {stage: this.syncStatus}));
        } else {
          new Notice("1/" + t("syncrun_alreadyrunning", {maxSteps: MAX_STEPS}));
          this.isAlreadyRunning = true;
        }

        log.debug(this.manifest.name, " already running in stage: ", this.syncStatus);

        if (this.currSyncMsg !== undefined && this.currSyncMsg !== "") {
          log.debug(this.currSyncMsg);
        }  
      }

      return;
    }

    // 通知统一调度器：同步执行中（minInterval 起点在 finally 里落盘）
    this.autoScheduler?.markRunStarted();
    try {
      this.setSyncIcon(true, triggerSource);

      // Step 0 for dry mode
      if (triggerSource === "dry") {
        void notifyFunc(triggerSource, 0);
        statusBarStepFunc(triggerSource, 0);
      }

      // Step 1 - start
      void notifyFunc(triggerSource, 1);
      statusBarStepFunc(triggerSource, 1);
      void statusBarFunc(triggerSource, 1, true);

      // Step 2 - prepare for sync
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- required to preserve 'this' context in callbacks
      const self = this;
      const client = this.getRemoteClient(self);

      // Step 3 - list remote files
      await notifyFunc(triggerSource, 2);
      statusBarStepFunc(triggerSource, 2);
      const remoteRsp = await client.listFromRemote();

      // Step 4 - check password
      await notifyFunc(triggerSource, 3);
      statusBarStepFunc(triggerSource, 3);
      await isPasswordOk(
        remoteRsp.Contents,
        this.settings.password
      );

      // Step 4 - get remote states (part of processing remote data)
      const remoteStates = await getRemoteStates(
        remoteRsp.Contents, 
        this.db, 
        this.vaultRandomID, 
        client.serviceType, 
        this.settings.password
      );

      // Step 5 - get local files
      await notifyFunc(triggerSource, 4);
      statusBarStepFunc(triggerSource, 4);
      const local = this.app.vault.getAllLoadedFiles();
      let localConfigDirContents: ObsConfigDirFileType[] = await listFilesInObsFolder(this.app.vault, this.manifest.id, this.settings.syncTrash);
      
      // Step 6 - load prevSync records for V3
      await notifyFunc(triggerSource, 5);
      statusBarStepFunc(triggerSource, 5);
      const prevSyncRecords = await loadPrevSyncRecordsByVault(this.db, this.vaultRandomID);

      // Step 7 - generate sync plan using V3
      await notifyFunc(triggerSource, 6);
      statusBarStepFunc(triggerSource, 6);
      const {
        plan, sortedKeys, deletions, sizesGoWrong
      } = await getSyncPlanV3(
        remoteStates,
        local,
        localConfigDirContents,
        prevSyncRecords,
        client.serviceType,
        triggerSource,
        this.app.vault,
        this.settings.syncConfigDir,
        this.settings.syncTrash,
        this.settings.syncBookmarks,
        this.app.vault.configDir,
        this.settings.syncUnderscoreItems,
        this.settings.skipSizeLargerThan,
        this.settings.password,
        this.settings.syncDirection ?? "bidirectional",
        this.settings.conflictAction ?? "keep_newer"
      );

      // Step 8 - execute sync using V3
      await notifyFunc(triggerSource, 7);
      statusBarStepFunc(triggerSource, 7);
      await this.doActualSyncV3(client, plan, sortedKeys, sizesGoWrong, deletions, self);

      // Step 10 - update last synced time
      this.settings.lastSynced = Date.now();
      await this.saveSettings();

      // Update status bar with the latest sync time
      this.updateSyncStatus("idle");

      // Step 8 (finish)
      void notifyFunc(triggerSource, 8);
      void statusBarFunc(triggerSource, 8, true);
      statusBarStepFunc(triggerSource, 8);

      this.setSyncIcon(false);
    } catch (error) {
      const msg = t("syncrun_abort", {
        manifestID: this.manifest.id,
        theDate: `${Date.now()}`,
        triggerSource: triggerSource,
        syncStatus: this.syncStatus,
      });
      log.error(msg);
      log.error(error);
      getNotice(triggerSource, msg, 10 * 1000);
      if (error instanceof AggregateError) {
        for (const e of error.errors) {
          getNotice(triggerSource, (e as Error).message, 10 * 1000);
        }
      } else {
        getNotice(triggerSource, (error as Error).message, 10 * 1000);
      }
      this.updateSyncStatus("idle");
      this.setSyncIcon(false);
    } finally {
      // 通知统一调度器：本次结束。markRunFinished 会把 minInterval 起点推到当前时刻，
      // 且 reschedule() 可能发现还有挂起的自动请求等待执行。
      this.autoScheduler?.markRunFinished();
    }
  }

  private async createTrashIfDoesNotExist() {
    if (this.settings.syncTrash) {
      // when syncing to a device which never trashed a file we will error if this folder does not exist
      await this.createTrashFolderIfDoesNotExist(this.app.vault);
    }
  }

  private shouldSyncBasedOnSyncPlan = async (syncPlan: SyncPlanType) => {
    for (const key in syncPlan.mixedStates) {
      const fileState = syncPlan.mixedStates[key];

      if (fileState.existLocal && fileState.existRemote && fileState.mtimeLocal > fileState.mtimeRemote) {
        return true;
      }
    }
    return false;
  };

  private async doActualSyncV3(client: RemoteClient, plan: SyncPlanType, sortedKeys: string[], sizesGoWrong: FileOrFolderMixedState[], deletions: DeletionOnRemote[], self: this) {
    const t = (x: TransItemType, vars?: Record<string, string>) => {
      return this.i18n.t(x, vars);
    };
    const effectiveConcurrency =
      client.serviceType === "webdav"
        ? 1
        : this.settings.concurrency;
    return doActualSyncV3(
      client,
      this.db,
      this.vaultRandomID,
      this.app.vault,
      plan,
      sortedKeys,
      sizesGoWrong,
      (key: string) => self.trash(key),
      this.settings.password,
      this.settings.lastSynced,
      effectiveConcurrency,
      (ss: FileOrFolderMixedState[]) => {
        new SizesConflictModal(
          self.app,
          self,
          this.settings.skipSizeLargerThan,
          ss,
          this.settings.password !== ""
        ).open();
      },
      async (index: number, total: number) => {
        // live exchange progress onto the status bar:
        // "1/2 OneDrive … 45/120 (37%)"; in debug mode this is step 7/8
        if (this.statusBarElement === undefined || this.settings.enableStatusBarInfo !== true) {
          return;
        }
        const percent = total > 0 ? Math.round((index / total) * 100) : 0;
        const stepPrefix = this.settings.debugEnabled ? "7/8 " : "1/2 ";
        const msg = `${stepPrefix}${t("syncrun_progressing", {
          serviceType: serviceDisplayName(this.settings.serviceType),
          index: `${index}`,
          total: `${total}`,
          percent: `${percent}`,
        })}`;
        this.statusBarElement.setText(msg);
        this.statusBarElement.setAttribute("aria-label", msg);
      },
      this.settings.protectModifyPercentage,
      (errorMsg: string) => {
        const parts = errorMsg.split("|");
        if (parts[0] === "syncrun_abort_protectmodifypercentage") {
          const [, threshold, realCount, allCount, percent] = parts;
          const msg = t("syncrun_abort_protectmodifypercentage", {
            protectModifyPercentage: parseInt(threshold),
            realModifyDeleteCount: parseInt(realCount),
            allFilesCount: parseInt(allCount),
            percent: percent,
          });
          new Notice(msg, 0);
        }
      }
      , this.app.vault.configDir
      , this.settings.syncDirection ?? "bidirectional"
    );
  }

  private async getLocalHistory() {
    return await loadFileHistoryTableByVault(
      this.db,
      this.vaultRandomID
    );
  }

  private async fetchMetadataFromRemote(metadataFile: FileOrFolderMixedState, client: RemoteClient) {
    if (metadataFile === undefined) {
      log.debug("no metadata file, so no fetch");
      return {
        deletions: [],
      } as MetadataOnRemote;
    }

    const buf = await client.downloadFromRemote(
      metadataFile.key,
      this.app.vault,
      metadataFile.mtimeRemote,
      this.settings.password,
      metadataFile.remoteEncryptedKey,
      true
    );
    return deserializeMetadataOnRemote(buf);
  }

  private getRemoteClient(self: this) {
    const client = new RemoteClient(
      this.settings.serviceType,
      this.settings.s3,
      this.settings.webdav,
      this.settings.onedrive,
      this.app.vault.getName(),
      () => self.saveSettings()
    );
    return client;
  }

  private updateSyncStatus(status: SyncStatusType) {
    this.syncStatus = status;
    this.updateStatusBar();
  }

  private setSyncIcon(running: boolean, triggerSource?: "manual" | "auto" | "dry" | "autoOnceInit") {
    if (this.syncRibbon === undefined) {
      return;
    }

    if (running) {
      setIcon(this.syncRibbon, iconNameSyncRunning);

      this.syncRibbon.setAttribute(
        "aria-label",
        this.i18n.t("syncrun_syncingribbon", {
          pluginName: this.manifest.name,
          triggerSource: triggerSource,
        })
      );
    } else {
      setIcon(this.syncRibbon, iconNameSyncWait);
      
      this.syncRibbon.setAttribute("aria-label", this.manifest.name);
    }
  }

  // Helper function to get status bar prefix from sync source (like remotely-save)
  private getStatusBarShortMsgFromSyncSource(s: SyncTriggerSourceType | undefined): string {
    if (s === undefined) {
      return "";
    }
    switch (s) {
      case "manual":
        return this.i18n.t("statusbar_sync_source_manual");
      case "dry":
        return this.i18n.t("statusbar_sync_source_dry");
      case "auto":
        return this.i18n.t("statusbar_sync_source_auto");
      case "autoOnceInit":
        return this.i18n.t("statusbar_sync_source_auto_once_init");
      default:
        return "";
    }
  }

  // Set current sync progress message (called during sync)
  private setCurrSyncMsg(i: number, total: number, pathName?: string) {
    if (this.statusBarElement === undefined) return;

    const L = `${total}`.length;
    const iStr = `${i}`.padStart(L, "0");
    const prefix = this.getStatusBarShortMsgFromSyncSource(this.currentTriggerSource);
    const shortMsg = prefix + this.i18n.t("syncrun_status_progress", {
      current: iStr,
      total: total.toString()
    });
    
    this.currSyncMsg = shortMsg;
    
    if (pathName) {
      this.statusBarElement.setAttribute("aria-label", `${shortMsg} - ${pathName}`);
    }
    this.statusBarElement.setText(shortMsg);
  }

  // Update last sync message (called when sync finishes or on idle)
  private updateLastSyncMsg(lastSyncedMillis?: number) {
    if (this.statusBarElement === undefined) return;

    let lastSyncMsg: string;
    let lastSyncLabelMsg: string;

    // Use the provided lastSyncedMillis if available, otherwise use settings.lastSynced
    const syncTime = lastSyncedMillis !== undefined ? lastSyncedMillis : this.settings.lastSynced;

    if (syncTime !== undefined && syncTime > 0) {
      const deltaTime = Date.now() - syncTime;
      const seconds = Math.floor(deltaTime / 1000);

      if (seconds < 60) {
        // Within 1 minute - show "刚刚" (just now)
        lastSyncMsg = this.i18n.t("statusbar_time_now");
      } else {
        lastSyncMsg = getLastSynced(this.i18n, syncTime).lastSyncMsg;
      }
      lastSyncLabelMsg = lastSyncMsg;
    } else {
      lastSyncMsg = this.i18n.t("statusbar_lastsync_never");
      lastSyncLabelMsg = this.i18n.t("statusbar_lastsync_never_label");
    }

    this.statusBarElement.setText(lastSyncMsg);
    this.statusBarElement.setAttribute("aria-label", lastSyncLabelMsg);
  }

  private updateStatusBar(syncQueue?: {i: number, total: number}) {
    const enabled = this.statusBarElement !== undefined && 
      this.settings.enableStatusBarInfo === true;

    if (!enabled) return;

    if (this.syncStatus === "syncing" && syncQueue !== undefined) {
      // During sync - show progress with prefix
      this.setCurrSyncMsg(syncQueue.i, syncQueue.total);
    } else if (this.syncStatus === "idle") {
      // Idle - show last sync time
      this.updateLastSyncMsg(this.settings.lastSynced);
    }
  }

  async onload() {
    this.oauth2Info = {
      verifier: "",
      helperModal: undefined,
      authSetting: undefined,
      revokeAuthSetting: undefined,
    }; // init

    this.currSyncMsg = "";

    await this.loadSettings();
    await this.checkIfPresetRulesFollowed();

    // lang should be load early, but after settings
    this.i18n = new I18n(this.settings.lang, async (lang: LangTypeAndAuto) => {
      this.settings.lang = lang;
      await this.saveSettings();
    });
    const t = (x: TransItemType, vars?: Record<string, string>) => {
      return this.i18n.t(x, vars);
    };

    if (this.settings.debugEnabled) {
      log.setLevel("debug");
    }

    await this.checkIfOauthExpires();

    // MUST before prepareDB()
    // And, it's also possible to be an empty string,
    // which means the vaultRandomID is read from db later!
    const vaultRandomIDFromOldConfigFile =
      await this.getVaultRandomIDFromOldConfigFile();

    // no need to await this
    void this.tryToAddIgnoreFile();

    const vaultBasePath = this.getVaultBasePath();

    try {
      await this.prepareDBAndVaultRandomID(
        vaultBasePath,
        vaultRandomIDFromOldConfigFile
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : JSON.stringify(err);
      new Notice(errMsg, 10 * 1000);
      throw err;
    }

    // must AFTER preparing DB

    this.registerEvent(
      this.app.vault.on("delete", async (fileOrFolder) => {
        await insertDeleteRecordByVault(
          this.db,
          fileOrFolder,
          this.vaultRandomID
        );
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", async (fileOrFolder, oldPath) => {
        await insertRenameRecordByVault(
          this.db,
          fileOrFolder,
          oldPath,
          this.vaultRandomID
        );
      })
    );

    this.registerObsidianProtocolHandler(COMMAND_URI, async (inputParams) => {
      const parsed = importQrCodeUri(inputParams, this.app.vault.getName());
      if (parsed.status === "error") {
        new Notice(parsed.message);
      } else {
        const copied = structuredClone(parsed.result);
        // new Notice(JSON.stringify(copied))
        this.settings = {
          ...this.settings,
          ...copied,
          s3: {
            ...this.settings.s3,
            ...(copied?.s3 ?? {}),
          },
          webdav: {
            ...this.settings.webdav,
            ...(copied?.webdav ?? {}),
          },
          onedrive: {
            ...this.settings.onedrive,
            ...(copied?.onedrive ?? {}),
          },
        };
        void this.saveSettings();
        new Notice(
          t("protocol_saveqr", {
            manifestName: this.manifest.name,
          })
        );
      }
    });

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK,
      async (inputParams) => {
        new Notice(
          t("protocol_callbacknotsupported", {
            params: JSON.stringify(inputParams),
          })
        );
      }
    );

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK_ONEDRIVE,
      async (inputParams) => {
        try {
          if (inputParams.code !== undefined) {
            if (!this.oauth2Info.verifier) {
              throw Error("OneDrive auth verifier is missing. Please restart auth.");
            }

            if (this.oauth2Info.helperModal !== undefined) {
              this.oauth2Info.helperModal.contentEl.empty();

              t("protocol_onedrive_connecting")
                .split("\n")
                .forEach((val: string) => {
                  this.oauth2Info.helperModal.contentEl.createEl("p", {
                    text: val,
                  });
                });
            }

            let rsp = await sendAuthReqOnedrive(
              this.settings.onedrive.clientID,
              this.settings.onedrive.authority,
              inputParams.code,
              this.oauth2Info.verifier
            );

            const rsp2 = rsp as Record<string, unknown>;
            if (rsp2.error !== undefined) {
              const errorMsg = typeof rsp2.error_description === "string" ? rsp2.error_description : JSON.stringify(rsp);
              throw Error(`Azure API 错误: ${errorMsg}`);
            }

            await setConfigBySuccessfullAuthInplaceOnedrive(
              this.settings.onedrive,
              rsp as AccessCodeResponseSuccessfulType,
              async () => await this.saveSettings()
            );

            const client = new RemoteClient(
              "onedrive",
              undefined,
              undefined,
              this.settings.onedrive,
              this.app.vault.getName(),
              async () => await this.saveSettings()
            );
            this.settings.onedrive.username = await client.getUser();
            await this.saveSettings();

            this.oauth2Info.verifier = ""; // reset it
            this.oauth2Info.helperModal?.close(); // close it
            this.oauth2Info.helperModal = undefined;

            const isAuthed = this.settings.onedrive.username !== "";
            if (this.oauth2Info.authSetting !== undefined) {
              this.oauth2Info.authSetting.settingEl.toggleClass("tp-sync-auth-hidden", isAuthed);
            }
            this.oauth2Info.authSetting = undefined;

            this.oauth2Info.revokeAuthSetting?.setDesc(
              t("protocol_onedrive_connect_succ_revoke", {
                username: this.settings.onedrive.username,
              })
            );
            if (this.oauth2Info.revokeAuthSetting !== undefined) {
              this.oauth2Info.revokeAuthSetting.settingEl.toggleClass("tp-sync-revoke-hidden", !isAuthed);
            }
            this.oauth2Info.revokeAuthSetting = undefined;

            new Notice(t("protocol_onedrive_connect_succ_revoke", {
              username: this.settings.onedrive.username,
            }));
          } else {
            new Notice(t("protocol_onedrive_connect_fail"));
            throw Error(
              t("protocol_onedrive_connect_unknown", {
                params: JSON.stringify(inputParams),
              })
            );
          }
        } catch (err: unknown) {
          log.debug("OneDrive auth protocol handler error:", err);
          const error = err as { message?: string };
          // 关闭 helper modal 并显示错误
          if (this.oauth2Info.helperModal) {
            this.oauth2Info.helperModal.contentEl.empty();
            this.oauth2Info.helperModal.contentEl.createEl("p", { text: "鉴权失败" });
            this.oauth2Info.helperModal.contentEl.createEl("p", { 
              text: error.message || "未知错误",
              cls: "onedrive-auth-error"
            });
          }
          
          // 重置状态
          this.oauth2Info.verifier = "";
          this.oauth2Info.authSetting = undefined;
          this.oauth2Info.revokeAuthSetting = undefined;
        }
      }
    );

    this.syncRibbon = this.addRibbonIcon(
      iconNameSyncWait,
      `${this.manifest.name}`,
      async () => this.syncRun("manual")
    );

    this.addCommand({
      id: "start-sync",
      name: t("command_startsync"),
      icon: iconNameSyncWait,
      callback: () => {
        void this.syncRun("manual");
      },
    });

    this.addCommand({
      id: "start-sync-dry-run",
      name: t("command_drynrun"),
      icon: iconNameSyncWait,
      callback: () => {
        void this.syncRun("dry");
      },
    });

    this.addSettingTab(new ThirdPartySyncSettingTab(this.app, this));

    // Status bar info is always shown (the toggle setting was removed in 26.2.5)
    this.settings.enableStatusBarInfo = true;

    void this.saveSettings();

    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   log.info("click", evt);
    // });

    // Check if user has agreed to the sync algorithm (same as remotely-save)
    // If not agreed → show agreement modal without enabling features
    // If agreed → enable all sync features
    if (!this.settings.agreeToUploadExtraMetadata) {
      new SyncAlgoV2Modal(this.app, this.i18n, (result) => {
        if (result) {
          this.settings.agreeToUploadExtraMetadata = true;
          void this.saveSettings();
          this.enableFeaturesAfterAgreement();
        } else {
          // User disagreed → unload plugin completely
          this.unload();
        }
      }).open();
    } else {
      // Already agreed before → enable all features directly
      this.enableFeaturesAfterAgreement();
    }
  }

  private enableFeaturesAfterAgreement() {
    // 初始化统一调度器（如果还没创建）
    if (!this.autoScheduler) {
      this.autoScheduler = new SyncAutoScheduler(
        (source: AutoSyncSource) => {
          const triggerSource: SyncTriggerSourceType =
            source === "autoOnceInit" ? "autoOnceInit" : "auto";
          return this.syncRun(triggerSource);
        }
      );
    }

    // 配置调度器：启动首次延迟 + 定时周期
    this.applyAutoSchedulerSetup();
    this.registerVaultEvents();
    this.setupRemoteChangeCheck();

    this.toggleStatusBar(true);
    this.toggleStatusText(true);
    this.updateSyncStatus("idle");
  }

  onunload() {
    this.syncRibbon = undefined;
    if (this.oauth2Info !== undefined) {
      this.oauth2Info.helperModal = undefined;
      this.oauth2Info = undefined;
    }

    // 停止所有自动同步调度
    this.autoScheduler?.stop();
    this.teardownRemoteChangeCheck();
    this.unregisterVaultEvents();
    if (this.vaultScannerIntervalId !== undefined) {
      window.clearInterval(this.vaultScannerIntervalId);
      this.vaultScannerIntervalId = undefined;
    }
    this.toggleStatusText(false);
    this.toggleStatusBar(false);
  }

  async loadSettings() {
    let rawData: Record<string, unknown> | null = null;
    try {
      rawData = await this.loadData() as Record<string, unknown> | null;
    } catch (e) {
      log.warn("Failed to load settings, using defaults:", e);
      rawData = null;
    }

    if (!rawData || typeof rawData !== 'object') {
      log.debug("No existing settings found, using default configuration");
      rawData = {};
    }

    this.settings = Object.assign(
      {},
      structuredClone(DEFAULT_SETTINGS),
      messyConfigToNormal(rawData as ThirdPartySyncPluginSettings)
    );
    if (this.settings.onedrive.clientID === "") {
      this.settings.onedrive.clientID = DEFAULT_SETTINGS.onedrive.clientID;
    }
    if (this.settings.onedrive.authority === "") {
      this.settings.onedrive.authority = DEFAULT_SETTINGS.onedrive.authority;
    }
    if (this.settings.onedrive.remoteBaseDir === undefined) {
      this.settings.onedrive.remoteBaseDir = "";
    }
    if (this.settings.webdav.manualRecursive === undefined) {
      this.settings.webdav.manualRecursive = false;
    }
    if (this.settings.webdav.depth === undefined) {
      this.settings.webdav.depth = "auto_unknown";
    }
    if (this.settings.webdav.remoteBaseDir === undefined) {
      this.settings.webdav.remoteBaseDir = "";
    }
    if (this.settings.s3.partsConcurrency === undefined) {
      this.settings.s3.partsConcurrency = 20;
    }
    if (this.settings.s3.forcePathStyle === undefined) {
      this.settings.s3.forcePathStyle = false;
    }
    if (this.settings.s3.disableS3MetadataSync == undefined) {
      this.settings.s3.disableS3MetadataSync = false;
    }
    if (this.settings.deleteToWhere === undefined) {
      this.settings.deleteToWhere = "system_trash";
    }

    // ── 自动同步：处理上一轮 v2 字段残留 → 最终形态（幂等，只跑一次） ──
    // 判断：有 v2 字段（autoSyncEnabled / autoSyncPeriodMinutes / syncOnSaveMode）残留才需要迁移
    if (!this.settings.autoSyncConsolidatedMigrated) {
      const raw = this.settings as unknown as Record<string, unknown>;
      const hasV2Residue =
        "autoSyncEnabled" in raw ||
        "autoSyncPeriodMinutes" in raw ||
        "syncOnSaveMode" in raw;

      if (hasV2Residue) {
        // 优先级：v1 原值 > v2 映射值（用户可能来回升级过）
        // 自动同步：v1 存在 → 原样保留；否则 v2 周期分钟数 * 60000
        const v1AutoRun = this.settings.autoRunEveryMilliseconds;
        if (v1AutoRun === undefined) {
          const v2PeriodMin = raw.autoSyncPeriodMinutes as number | undefined;
          this.settings.autoRunEveryMilliseconds =
            v2PeriodMin !== undefined ? v2PeriodMin * 60_000 : -1;
        }

        // 保存后同步：v1 存在 → 0 档已删除 → 5000；60000 档已收窄 → 30000；否则原样保留
        const v1Save = this.settings.syncOnSaveAfterMilliseconds;
        if (v1Save !== undefined) {
          if (v1Save === 0) this.settings.syncOnSaveAfterMilliseconds = 5_000;
          else if (v1Save === 60_000) this.settings.syncOnSaveAfterMilliseconds = 30_000;
          // 其他合法值（-1 / 5000 / 10000 / 30000）原样保留
        } else {
          const v2Mode = raw.syncOnSaveMode as string | undefined;
          if (v2Mode === "off") this.settings.syncOnSaveAfterMilliseconds = -1;
          else if (v2Mode === "immediate") this.settings.syncOnSaveAfterMilliseconds = 5_000;
          else if (v2Mode === "delay5s") this.settings.syncOnSaveAfterMilliseconds = 5_000;
          else this.settings.syncOnSaveAfterMilliseconds = -1;
        }

        // 远端变更：v1 存在 → 60000 档已收窄 → 30000；否则原样保留；v2 没有这个概念 → -1（关闭）
        if (this.settings.syncOnRemoteChangesAfterMilliseconds === undefined) {
          this.settings.syncOnRemoteChangesAfterMilliseconds = -1;
        } else if (this.settings.syncOnRemoteChangesAfterMilliseconds === 60_000) {
          this.settings.syncOnRemoteChangesAfterMilliseconds = 30_000;
        }

        this.settings.autoSyncConsolidatedMigrated = true;
        // 立即落盘，把 v2 残留清干净
        void this.saveSettings();
      } else {
        // 没有 v2 残留：可能是 v1 直接升级，也可能是新安装
        // 但仍需要把 initRunAfterMilliseconds 的 0 值处理（合并入 autoRun 的启动首次后，
        // initRun 字段本身不活跃，但如果有人把 autoRun 关了只开了 initRun，syncScheduler
        // 的 start(periodMs=0) 不会触发任何首次——这是正确行为，因为 autoRun=-1 时不启动）
        // 这里不需要额外处理，幂等标记仍需落盘避免重复进 block
        this.settings.autoSyncConsolidatedMigrated = true;
        void this.saveSettings();
      }
    }

    // ── autoRunEveryMilliseconds 档位归一化：收窄到 4 档（-1 / 5min / 10min / 30min） ──
    const LEGAL_AUTORUN_MS = new Set([-1, 300_000, 600_000, 1_800_000]);
    const curAutoRun = this.settings.autoRunEveryMilliseconds;
    if (
      curAutoRun !== undefined &&
      curAutoRun > 0 &&
      !LEGAL_AUTORUN_MS.has(curAutoRun)
    ) {
      // 不合法值（5s / 15s / 30s / 1min 等）就近向上归到 5 分钟
      this.settings.autoRunEveryMilliseconds = 300_000;
      void this.saveSettings();
    }

    // ── save / remote 档位归一化：覆盖已过迁移标记但 data.json 里仍残留 60000 的老用户 ──
    const LEGAL_SAVE_MS = new Set([-1, 5_000, 10_000, 30_000]);
    const curSave = this.settings.syncOnSaveAfterMilliseconds;
    if (curSave !== undefined && curSave > 0 && !LEGAL_SAVE_MS.has(curSave)) {
      this.settings.syncOnSaveAfterMilliseconds = 30_000;
      void this.saveSettings();
    }

    const LEGAL_REMOTE_MS = new Set([-1, 5_000, 10_000, 30_000]);
    const curRemote = this.settings.syncOnRemoteChangesAfterMilliseconds;
    if (curRemote !== undefined && curRemote > 0 && !LEGAL_REMOTE_MS.has(curRemote)) {
      this.settings.syncOnRemoteChangesAfterMilliseconds = 30_000;
      void this.saveSettings();
    }
  }

  async checkIfPresetRulesFollowed() {
    const res = applyPresetRulesInplace(this.settings);
    if (res.changed) {
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(normalConfigToMessy(this.settings));
  }

  async checkIfOauthExpires() {
    let needSave: boolean = false;
    const current = Date.now();

    // fullfill old version settings
    if (
      this.settings.onedrive.refreshToken !== "" &&
      this.settings.onedrive.credentialsShouldBeDeletedAtTime === undefined
    ) {
      this.settings.onedrive.credentialsShouldBeDeletedAtTime =
        current + 1000 * 60 * 60 * 24 * 30;
      needSave = true;
    }

    // check expired or not
    let onedriveExpired = false;
    if (
      this.settings.onedrive.refreshToken !== "" &&
      current >= this.settings.onedrive.credentialsShouldBeDeletedAtTime
    ) {
      onedriveExpired = true;
      this.settings.onedrive = structuredClone(DEFAULT_ONEDRIVE_CONFIG);
      needSave = true;
    }

    // save back
    if (needSave) {
      await this.saveSettings();
    }

    // send notice
    if (onedriveExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth OneDrive for a while, you need to re-auth it again.`,
        6000
      );
    }
  }

  async getVaultRandomIDFromOldConfigFile() {
    let vaultRandomID = "";
    if ((this.settings as { vaultRandomID?: string }).vaultRandomID !== undefined) {
      // In old version, the vault id is saved in data.json
      // But we want to store it in localForage later
      if ((this.settings as { vaultRandomID?: string }).vaultRandomID !== "") {
        // a real string was assigned before
        vaultRandomID = (this.settings as { vaultRandomID?: string }).vaultRandomID!;
      }
      delete (this.settings as Record<string, unknown>).vaultRandomID;
      await this.saveSettings();
    }
    return vaultRandomID;
  }

  async trash(x: string) {
    if (this.settings.deleteToWhere === "obsidian_trash") {
      await this.app.vault.adapter.trashLocal(x);
    } else {
      // system_trash: attempt system trash first, fallback to .trash folder
      if (!(await this.app.vault.adapter.trashSystem(x))) {
        await this.app.vault.adapter.trashLocal(x);
      }
    }
  }

  getVaultBasePath() {
    if (this.app.vault.adapter instanceof FileSystemAdapter) {
      // in desktop
      return this.app.vault.adapter.getBasePath().split("?")[0];
    } else {
      // in mobile
      return this.app.vault.adapter.getResourcePath("").split("?")[0];
    }
  }

  async prepareDBAndVaultRandomID(
    vaultBasePath: string,
    vaultRandomIDFromOldConfigFile: string
  ) {
    const { db, vaultRandomID } = await prepareDBs(
      vaultBasePath,
      vaultRandomIDFromOldConfigFile
    );
    this.db = db;
    this.vaultRandomID = vaultRandomID;
  }

  // Needed to update text for get command
  toggleStatusText(enabled: boolean) {
    // Clears the current interval
    if (this.statusBarIntervalID !== undefined) {
      window.clearInterval(this.statusBarIntervalID);
      this.statusBarIntervalID = undefined;
    }

    // Set up interval
    if (enabled) {
      this.statusBarIntervalID = window.setInterval(() => {
        if (this.syncStatus !== "syncing") {
          void this.updateStatusBar();
        }
      }, 30_000);

      this.updateStatusBar();
    }
  }

  toggleStatusBar(enabled: boolean) {  
    this.statusBarElement?.remove();

    const statusBar = activeDocument.getElementsByClassName("status-bar")[0] as HTMLElement | undefined;

    // Guard: if status bar doesn't exist (e.g., iOS), skip DOM manipulation
    if (!statusBar) {
      return;
    }

    // Remove any third-party sync classes
    statusBar.removeClass("third-party-sync-show-status-bar");
    statusBar.addClass("tp-statusbar-reset-margin");

    Array.from(statusBar.children).forEach((element) => {
      element.removeClass("third-party-sync-hidden");
    });

    if (enabled && this.settings.enableStatusBarInfo) {
      // Enable status bar on mobile
      if (Platform.isMobile) {
        statusBar.addClass("third-party-sync-show-status-bar");
        
        // Shifts up the status bar on phone to not cover the navmenu
        if (Platform.isPhone) {
          const navBar = activeDocument.getElementsByClassName("mobile-navbar")[0] as HTMLElement | undefined;
          if (!navBar) return;
          const height = window.getComputedStyle(navBar).getPropertyValue('height');
          statusBar.style.marginBottom = height;
        }
      }

      // Create third-party sync element
      this.statusBarElement = this.addStatusBarItem();
      this.statusBarElement.createSpan();
      this.statusBarElement.setAttribute("data-tooltip-position", "top");    
      this.updateStatusBar(); 
    }
  }

  /**
   * 配置统一调度器：读 autoRunEveryMilliseconds。
   * 周期关闭 → 不启动调度器（启动首次也不跑）。
   * 周期开启 → 固定 5s 启动首次 + 周期运行（每次跑完整 syncRun，不设门禁）。
   * onChange 时重新调这个函数即可。
   */
  applyAutoSchedulerSetup() {
    if (!this.autoScheduler) return;

    const periodMs = this.settings.autoRunEveryMilliseconds ?? -1;
    if (periodMs <= 0) {
      // 关闭 → 全停
      this.autoScheduler.stop();
      return;
    }

    const initDelayMs = 5_000; // 固定首次延迟 5 秒，仅在 periodMs > 0 时由 apply 内部注册
    this.autoScheduler.apply(initDelayMs, periodMs);
  }

  /** 注册 vault 事件：delete/rename 历史记录 + modify 保存后同步 + 30s configDir 扫描 */
  registerVaultEvents() {
    // 幂等：已注册就跳过
    if (this.vaultEventRefs.length > 0) return;

    // 删除/重命名历史是三向合并的核心输入，必须始终记录
    const deleteRef = this.app.vault.on("delete", async (file) => {
      await insertDeleteRecordByVault(this.db, file, this.vaultRandomID);
    });
    this.vaultEventRefs.push(deleteRef);

    const renameRef = this.app.vault.on("rename", async (file, oldPath) => {
      await insertRenameRecordByVault(
        this.db,
        file,
        oldPath,
        this.vaultRandomID
      );
    });
    this.vaultEventRefs.push(renameRef);

    // ── 保存后同步：trailing debounce（debounceMs 读 settings.syncOnSaveAfterMilliseconds） ──
    // 排除插件自身数据文件：syncRun → saveSettings 写 data.json → modify 会形成反馈环
    const pluginDir =
      this.manifest.dir ??
      normalizePath(
        [this.app.vault.configDir, "plugins", this.manifest.id].join("/")
      );
    const pluginOwnDataFiles = new Set<string>([
      normalizePath([pluginDir, "data.json"].join("/")),
    ]);

    const modifyRef = this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile)) return;
      const normalized = normalizePath(file.path);
      if (pluginOwnDataFiles.has(normalized)) return;

      const debounceMs = this.settings.syncOnSaveAfterMilliseconds ?? -1;
      if (debounceMs <= 0) return; // -1 关闭；0 立即档已删除（迁移时映射到 5000）

      if (this.syncStatus !== "idle") return; // 正在同步中
      this.autoScheduler?.onSaveModified(debounceMs);
    });
    this.vaultEventRefs.push(modifyRef);

    // ── 30s config 目录扫描（独立于保存后同步，覆盖 .obsidian 配置变更不触发 modify 的场景） ──
    const scanVault = async () => {
      const debounceMs = this.settings.syncOnSaveAfterMilliseconds ?? -1;
      if (
        this.syncStatus !== "idle" ||
        debounceMs <= 0 ||
        !this.settings.syncConfigDir
      ) {
        return;
      }

      log.debug("Scanning config directory for changes");
      let localConfigContents = await listFilesInObsFolder(
        this.app.vault,
        this.manifest.id,
        this.settings.syncTrash
      );

      for (const file of localConfigContents) {
        if (
          file.key.includes(
            `${this.app.vault.configDir}/plugins/third-party-sync/`
          )
        ) {
          continue;
        }
        if (file.mtime > this.settings.lastSynced) {
          log.debug("Unsynced config file found: ", file.key);
          this.autoScheduler?.onSaveModified(debounceMs);
          break;
        }
      }
    };
    this.vaultScannerIntervalId = window.setInterval(() => { void scanVault(); }, 30_000);
  }

  unregisterVaultEvents() {
    for (const ref of this.vaultEventRefs) {
      this.app.vault.offref(ref);
    }
    this.vaultEventRefs = [];
  }

  /**
   * 远端变更后同步：独立 setInterval 轮询 listFromRemote + 对比 prevSync。
   * 这是第三个独立开关，和 applyAutoSchedulerSetup 完全解耦。
   */
  setupRemoteChangeCheck() {
    // 先清旧的
    if (this.remoteCheckIntervalID !== undefined) {
      window.clearInterval(this.remoteCheckIntervalID);
      this.remoteCheckIntervalID = undefined;
    }

    const intervalMs = this.settings.syncOnRemoteChangesAfterMilliseconds ?? -1;
    if (intervalMs <= 0) return;

    let checkingRemote = false;

    const syncOnRemote = async () => {
      if (this.syncStatus !== "idle" || checkingRemote) return;

      checkingRemote = true;
      try {
        const client = this.getRemoteClient(this);
        const remoteRsp = await client.listFromRemote();
        const remoteStates = await getRemoteStates(
          remoteRsp.Contents,
          this.db,
          this.vaultRandomID,
          client.serviceType,
          this.settings.password
        );
        const prevSyncRecords = await loadPrevSyncRecordsByVault(
          this.db,
          this.vaultRandomID
        );
        const prevSyncMap = new Map(prevSyncRecords.map((r) => [r.key, r]));

        let hasRemoteChanges = false;
        for (const remote of remoteStates) {
          if (!remote.key) continue;
          const prev = prevSyncMap.get(remote.key);
          if (!prev || prev.mtime !== remote.mtimeRemote) {
            hasRemoteChanges = true;
            break;
          }
        }
        if (!hasRemoteChanges) {
          for (const prev of prevSyncRecords) {
            const remoteExists = remoteStates.some((r) => r.key === prev.key);
            if (!remoteExists) {
              hasRemoteChanges = true;
              break;
            }
          }
        }

        if (hasRemoteChanges) {
          log.debug("Sync on Remote ran | Remote changes detected");
          void this.syncRun("auto");
        }
      } catch (error) {
        log.debug("Sync on Remote check failed:", error);
      } finally {
        checkingRemote = false;
      }
    };

    // 移动端：启动时立即检查一次
    if (Platform.isMobileApp) {
      void syncOnRemote();
    }

    this.remoteCheckIntervalID = window.setInterval(
      () => { void syncOnRemote(); },
      intervalMs
    );
  }

  teardownRemoteChangeCheck() {
    if (this.remoteCheckIntervalID !== undefined) {
      window.clearInterval(this.remoteCheckIntervalID);
      this.remoteCheckIntervalID = undefined;
    }
  }

  async getMetadataMtime() {
    // V3: No remote metadata file, use lastSynced from settings
    return this.settings.lastSynced;
  }

  /**
   * Because data.json contains sensitive information,
   * We usually want to ignore it in the version control.
   * However, if there's already a an ignore file (even empty),
   * we respect the existing configure and not add any modifications.
   * @returns
   */
  async tryToAddIgnoreFile() {
    const pluginConfigDir = this.manifest.dir;
    const pluginConfigDirExists = await this.app.vault.adapter.exists(
      pluginConfigDir
    );
    if (!pluginConfigDirExists) {
      // what happened?
      return;
    }
    const ignoreFile = `${pluginConfigDir}/.gitignore`;
    const ignoreFileExists = await this.app.vault.adapter.exists(ignoreFile);

    const contentText = "data.json\n";

    try {
      if (!ignoreFileExists) {
        // not exists, directly create
        // no need to await
        void this.app.vault.adapter.write(ignoreFile, contentText);
      }
    } catch {
      // just skip
    }
  }

  private async createTrashFolderIfDoesNotExist(vault: Vault) {
    let trashStat = await vault.adapter.stat('.trash');
    if (trashStat == null) {
      await vault.adapter.mkdir('.trash');
    }
  }
}
