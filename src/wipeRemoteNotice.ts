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
  readonly remoteItems: RemoteItem[];
  readonly remoteClient: RemoteClient;

  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    remoteItems: RemoteItem[],
    remoteClient: RemoteClient
  ) {
    super(app);
    this.plugin = plugin;
    this.remoteItems = remoteItems;
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

    t("modal_wipecloud_desc", {
      count: `${this.remoteItems.length}`,
    })
      .split("\n")
      .forEach((val) => {
        contentEl.createEl("p", { text: val });
      });

    // pull-only directions never benefit from wiping the remote:
    // after wiping, a pull sync would fetch nothing and do nothing.
    const syncDirection = this.plugin.settings.syncDirection;
    const isPullOnly =
      syncDirection === "incremental_pull_only" ||
      syncDirection === "incremental_pull_and_delete_only";

    if (isPullOnly) {
      contentEl.createEl("p", {
        text: t("modal_wipecloud_pullwarn"),
      });
    }

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
    if (isPullOnly) {
      confirmButton.disabled = true;
    }
    confirmButton.onclick = () => {
      this.close();
      void this.wipeAndResync();
    };
  }

  private async wipeAndResync() {
    const plugin = this.plugin;
    new Notice(plugin.i18n.t("modal_wipecloud_notice_start"));

    // Delete every remote item by its raw remote key.
    // The empty password bypasses local encryption derivation on purpose,
    // so stale files encrypted with an old password are also deleted.
    let failCount = 0;
    for (const item of this.remoteItems) {
      // skip folder placeholders (e.g. s3 "directory" keys),
      // every real file is covered by its own key
      if (item.key.endsWith("/")) {
        continue;
      }
      try {
        await this.remoteClient.deleteFromRemote(item.key, "", "");
      } catch (err) {
        failCount += 1;
        console.error(`wipe remote: failed to delete ${item.key}`, err);
      }
    }

    // reset local baselines so that every local file is
    // treated as newly created by the following sync
    await clearAllPrevSyncRecordsByVault(plugin.db, plugin.vaultRandomID);
    await clearAllSyncMetaMapping(plugin.db);

    if (failCount > 0) {
      new Notice(
        plugin.i18n.t("modal_wipecloud_notice_partialfail", {
          count: `${failCount}`,
        }),
        8000
      );
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

  let remoteItems: RemoteItem[];
  try {
    const remoteFiles = await remoteClient.listFromRemote();
    remoteItems = remoteFiles.Contents;
  } catch (err) {
    console.error("wipe remote: failed to list remote items", err);
    new Notice(plugin.i18n.t("modal_wipecloud_notice_listfail"), 8000);
    return;
  }

  new WipeCloudModal(plugin.app, plugin, remoteItems, remoteClient).open();
};
