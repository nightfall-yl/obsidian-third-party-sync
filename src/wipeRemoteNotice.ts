import { App, Modal, Notice } from "obsidian";

import type RemotelySavePlugin from "./main";
import type { TransItemType } from "./i18n";
import {
  clearAllPrevSyncRecordsByVault,
  clearAllSyncMetaMapping,
} from "./localdb";
import { RemoteClient } from "./remote";
import type { RemoteItem } from "./baseTypes";

export class WipeCloudModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  remoteItems: RemoteItem[] = [];
  readonly remoteClient: RemoteClient;

  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    remoteClient: RemoteClient
  ) {
    super(app);
    this.plugin = plugin;
    this.remoteClient = remoteClient;
  }

  onOpen() {
    let { contentEl } = this;
    const t = (x: TransItemType, vars?: Record<string, string>) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("h2", {
      text: t("modal_wipecloud_title"),
    });

    // the remote listing may take a while on large vaults,
    // so the modal opens immediately with a loading placeholder
    // and fills in the real count once the listing finishes
    const descContainer = contentEl.createDiv();
    const renderDesc = (
      key: string,
      vars?: Record<string, string>,
      extraKey?: string
    ) => {
      descContainer.empty();
      t(key, vars)
        .split("\n")
        .forEach((val) => {
          descContainer.createEl("p", { text: val });
        });
      if (extraKey) {
        descContainer.createEl("p", { text: t(extraKey) });
      }
    };
    renderDesc("modal_wipecloud_loading");

    // pull-only directions never benefit from wiping the remote:
    // after wiping, a pull sync would fetch nothing and do nothing.
    const syncDirection = this.plugin.settings.syncDirection;
    const isPullOnly =
      syncDirection === "incremental_pull_only" ||
      syncDirection === "incremental_pull_and_delete_only";

    const buttonContainer = contentEl.createDiv({
      cls: "modal-button-container",
    });

    buttonContainer
      .createEl("button", { text: t("modal_wipecloud_cancel") })
      .onclick = () => {
      this.close();
    };

    const confirmButton = buttonContainer.createEl("button", {
      text: t("modal_wipecloud_confirm"),
      cls: "mod-warning",
    });
    confirmButton.disabled = true;
    confirmButton.onclick = () => {
      this.close();
      void this.wipeAndResync();
    };

    void this.loadItems(renderDesc, confirmButton, isPullOnly);
  }

  private async loadItems(
    renderDesc: (key: string, vars?: Record<string, string>) => void,
    confirmButton: HTMLButtonElement,
    isPullOnly: boolean
  ) {
    try {
      const remoteFiles = await this.remoteClient.listFromRemote();
      this.remoteItems = remoteFiles.Contents;
      renderDesc(
        "modal_wipecloud_desc",
        { count: `${this.remoteItems.length}` },
        isPullOnly ? "modal_wipecloud_pullwarn" : undefined
      );
      confirmButton.disabled = isPullOnly;
    } catch (err) {
      console.error("wipe remote: failed to list remote items", err);
      renderDesc("modal_wipecloud_notice_listfail");
    }
  }

  private async wipeAndResync() {
    const plugin = this.plugin;
    const t = (x: Parameters<typeof plugin.i18n.t>[0], vars?: Record<string, string>) => {
      return plugin.i18n.t(x, vars);
    };

    // Files go first, then folders deepest-first. Folders MUST be
    // deleted too (onedrive/webdav list real folders with trailing
    // "/"; their Graph/WebDAV DELETE is recursive): otherwise an
    // empty folder tree survives on the remote and a later
    // bidirectional sync pulls every empty folder back locally.
    // S3 "folder" placeholder keys are also deleted, which is harmless.
    const allKeys = this.remoteItems.map((item) => item.key);
    const fileKeys = allKeys.filter((key) => !key.endsWith("/"));
    const folderKeys = allKeys
      .filter((key) => key.endsWith("/") && key !== "/")
      .sort((a, b) => b.split("/").length - a.split("/").length);
    const deletionQueue = [...fileKeys, ...folderKeys];
    const total = deletionQueue.length;

    // persistent notice with live progress, hidden at the end
    const progressNotice = new Notice(
      t("modal_wipecloud_notice_start"),
      0
    );

    // Delete every remote item by its raw remote key.
    // The empty password bypasses local encryption derivation on purpose,
    // so stale files encrypted with an old password are also deleted.
    let failCount = 0;
    let done = 0;
    for (const key of deletionQueue) {
      try {
        await this.remoteClient.deleteFromRemote(key, "", "");
      } catch (err) {
        failCount += 1;
        console.error(`wipe remote: failed to delete ${key}`, err);
      }
      done += 1;
      if (done % 20 === 0 || done === total) {
        progressNotice.setMessage(
          t("modal_wipecloud_progress", {
            current: `${done}`,
            total: `${total}`,
          })
        );
      }
    }

    // reset local baselines so that every local file is
    // treated as newly created by the following sync
    try {
      await clearAllPrevSyncRecordsByVault(plugin.db, plugin.vaultRandomID);
      await clearAllSyncMetaMapping(plugin.db);
    } catch (err) {
      console.error("wipe remote: failed to reset local baselines", err);
      progressNotice.setMessage(t("modal_wipecloud_notice_resetfail"));
      window.setTimeout(() => progressNotice.hide(), 10 * 1000);
      return;
    }

    if (failCount > 0) {
      progressNotice.setMessage(
        t("modal_wipecloud_notice_partialfail", {
          count: `${failCount}`,
        })
      );
      window.setTimeout(() => progressNotice.hide(), 8 * 1000);
    } else {
      progressNotice.setMessage(t("modal_wipecloud_notice_done"));
      window.setTimeout(() => progressNotice.hide(), 5 * 1000);
    }

    // the resync re-uploads everything and rebuilds the
    // remote metadata file plus the new baselines
    await plugin.syncRun("manual");
  }

  onClose() {
    this.contentEl.empty();
  }
}

export const openWipeCloudModal = async (plugin: RemotelySavePlugin) => {
  const remoteClient = new RemoteClient(
    plugin.settings.serviceType,
    plugin.settings.s3,
    plugin.settings.webdav,
    plugin.settings.onedrive,
    plugin.app.vault.getName(),
    () => plugin.saveSettings()
  );

  new WipeCloudModal(plugin.app, plugin, remoteClient).open();
};
