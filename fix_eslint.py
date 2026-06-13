import re

with open('src/settings.ts', 'r') as f:
    content = f.read()

# 1. Fix imports: remove unused, add activeDocument
content = content.replace(
    '''import {
  App,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  SettingGroup,
  Platform,
  requireApiVersion,
  setIcon,
} from "obsidian";''',
    '''import {
  App,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  SettingGroup,
  setIcon,
  activeDocument as activeDoc,
} from "obsidian";'''
)

# 2. Remove unused imports from baseTypes
content = content.replace(
    '''import {
  API_VER_REQURL,
  DEFAULT_DEBUG_FOLDER,''',
    '''import {
  DEFAULT_DEBUG_FOLDER,'''
)

# 3. Remove unused imports from remoteForOnedrive
content = content.replace(
    '''import {
  DEFAULT_ONEDRIVE_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierOnedrive,
  sendAuthReq as sendAuthReqOnedrive,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplaceOnedrive,
  AccessCodeResponseSuccessfulType,
} from "./remoteForOnedrive";''',
    '''import {
  DEFAULT_ONEDRIVE_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierOnedrive,
} from "./remoteForOnedrive";'''
)

# 4. Remove unused encrypt and DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2 imports
content = content.replace(
    '''import {encryptStringToBase64url} from "./encrypt";
import {DEFAULT_FILE_NAME_FOR_METADATAONREMOTE, DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2} from "./metadataOnRemote";''',
    '''import {DEFAULT_FILE_NAME_FOR_METADATAONREMOTE} from "./metadataOnRemote";'''
)

# 5. Add activeDocument alias after imports
content = content.replace(
    '''import {getRemoteMetadata, uploadExtraMeta} from "./sync";

async function copyToClipboard''',
    '''import {getRemoteMetadata, uploadExtraMeta} from "./sync";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const activeDocument: Document = activeDoc;

async function copyToClipboard'''
)

# 6. Replace document. with activeDocument. everywhere
content = content.replace('document.createElement', 'activeDocument.createElement')
content = content.replace('document.createDocumentFragment', 'activeDocument.createDocumentFragment')
content = content.replace('document.createTextNode', 'activeDocument.createTextNode')
content = content.replace('document.body.appendChild', 'activeDocument.body.appendChild')
content = content.replace('document.body.removeChild', 'activeDocument.body.removeChild')
content = content.replace(
    '    document.execCommand("copy");',
    '    // eslint-disable-next-line @typescript-eslint/no-deprecated\n    activeDocument.execCommand("copy");'
)

# 7. Fix unused vars: idx -> _idx in PasswordModal
content = content.replace(
    '    ].forEach((val, idx) => {\n      if (idx < 3) {',
    '    ].forEach((val, _idx) => {\n      if (_idx < 3) {'
)

# 8. Fix unused (val, idx) -> (val) in forEach
content = content.replace(
    '      .forEach((val, idx) => {\n        contentEl.createEl("p", {\n          text: val,\n        });\n      });',
    '      .forEach((val) => {\n        contentEl.createEl("p", {\n          text: val,\n        });\n      });'
)

# 9. Fix unused 'e' in wrapTextWithPasswordHide
content = content.replace(
    'hider.addEventListener("click", (e) => {',
    'hider.addEventListener("click", (_e) => {'
)

# 10. Fix unused 'e' in catch blocks
content = content.replace(
    '''            } catch (e) {
              // fallback below
            }''',
    '''            } catch (_e) {
              // fallback below
            }'''
)
content = content.replace(
    '''              } catch (e) {
                return undefined;
              }''',
    '''              } catch (_e2) {
                return undefined;
              }'''
)

# 11. Fix all onChange(async (value) => to onChange((value) =>
content = re.sub(r'\.onChange\(async \(value\) =>', '.onChange((value) =>', content)

# 12. Fix all onChange(async (val to onChange((val
content = re.sub(r'\.onChange\(async \(val(:\s*\w+)?\) =>', r'.onChange((val\1) =>', content)

# 13. Replace await this.plugin.saveSettings() with void this.plugin.saveSettings()
content = content.replace('await this.plugin.saveSettings();', 'void this.plugin.saveSettings();')

# 14. Fix addButton(async (button) => to addButton((button) =>
content = content.replace('.addButton(async (button) =>', '.addButton((button) =>')

# 15. Fix addDropdown(async (dropdown) => to addDropdown((dropdown) =>
content = content.replace('.addDropdown(async (dropdown) =>', '.addDropdown((dropdown) =>')

# 16-27. Fix all onClick(async () => patterns
# S3 connectivity check
content = content.replace(
    '''          button.onClick(async () => {
            new Notice(t("settings_checkonnectivity_checking"));
            const client = new RemoteClient("s3", this.plugin.settings.s3);
            const errors = { msg: "" };
            const res = await client.checkConnectivity((err: string) => {
              errors.msg = err;
            });
            if (res) {
              new Notice(t("settings_s3_connect_succ"));
            } else {
              new Notice(t("settings_s3_connect_fail"));
              new Notice(errors.msg);
            }
          });''',
    '''          button.onClick(() => {
            void (async () => {
              new Notice(t("settings_checkonnectivity_checking"));
              const client = new RemoteClient("s3", this.plugin.settings.s3);
              const errors = { msg: "" };
              const res = await client.checkConnectivity((err: string) => {
                errors.msg = err;
              });
              if (res) {
                new Notice(t("settings_s3_connect_succ"));
              } else {
                new Notice(t("settings_s3_connect_fail"));
                new Notice(errors.msg);
              }
            })();
          });'''
)

# OnedriveRevokeAuthModal button (no await)
content = content.replace(
    '''          button.onClick(async () => {
            new OnedriveRevokeAuthModal(''',
    '''          button.onClick(() => {
            new OnedriveRevokeAuthModal('''
)

# OnedriveAuthModal button (no await)
content = content.replace(
    '''          button.onClick(async () => {
            const modal = new OnedriveAuthModal(''',
    '''          button.onClick(() => {
            const modal = new OnedriveAuthModal('''
)

# Onedrive connectivity check
content = content.replace(
    '''          button.onClick(async () => {
            new Notice(t("settings_checkonnectivity_checking"));
            const client = new RemoteClient(
              "onedrive",''',
    '''          button.onClick(() => {
            void (async () => {
              new Notice(t("settings_checkonnectivity_checking"));
              const client = new RemoteClient(
                "onedrive",'''
)
# Close the void async wrapper for onedrive connectivity
content = content.replace(
    '''              new Notice(errors.msg);
            }
          });
        });
    });

    //////////////////////////////////////////////////
    // below for webdav''',
    '''              new Notice(errors.msg);
              }
            })();
          });
        });
    });

    //////////////////////////////////////////////////
    // below for webdav'''
)

# Webdav connectivity check
content = content.replace(
    '''          button.onClick(async () => {
            new Notice(t("settings_checkonnectivity_checking"));
            const client = new RemoteClient(
              "webdav",''',
    '''          button.onClick(() => {
            void (async () => {
              new Notice(t("settings_checkonnectivity_checking"));
              const client = new RemoteClient(
                "webdav",'''
)
# Close the void async wrapper for webdav connectivity
content = content.replace(
    '''              new Notice(errors.msg);
            }
          });
        });
    });

    // 控制 Setting 显隐''',
    '''              new Notice(errors.msg);
              }
            })();
          });
        });
    });

    // 控制 Setting 显隐'''
)

# PasswordModal onClick
content = content.replace(
    '''        button.onClick(async () => {
          this.plugin.settings.password = this.newPassword;
          void this.plugin.saveSettings();
          new Notice(t("modal_password_notice"));
          this.close();
        });''',
    '''        button.onClick(() => {
          void (async () => {
            this.plugin.settings.password = this.newPassword;
            void this.plugin.saveSettings();
            new Notice(t("modal_password_notice"));
            this.close();
          })();
        });'''
)

# ChangeRemoteBaseDirModal first onClick
content = content.replace(
    '''          button.onClick(async () => {
            // in the settings, the value is reset to the special case ""
            this.plugin.settings[this.service].remoteBaseDir = "";
            void this.plugin.saveSettings();
            new Notice(t("modal_remotebasedir_notice"));
            this.close();
          });''',
    '''          button.onClick(() => {
            void (async () => {
              // in the settings, the value is reset to the special case ""
              this.plugin.settings[this.service].remoteBaseDir = "";
              void this.plugin.saveSettings();
              new Notice(t("modal_remotebasedir_notice"));
              this.close();
            })();
          });'''
)

# ChangeRemoteBaseDirModal second onClick
content = content.replace(
    '''          button.onClick(async () => {
            this.plugin.settings[this.service].remoteBaseDir =
              this.newRemoteBaseDir;
            this.plugin.settings.lastSynced = -1;
            void this.plugin.saveSettings();
            new Notice(t("modal_remotebasedir_notice"));
            this.close();
          });''',
    '''          button.onClick(() => {
            void (async () => {
              this.plugin.settings[this.service].remoteBaseDir =
                this.newRemoteBaseDir;
              this.plugin.settings.lastSynced = -1;
              void this.plugin.saveSettings();
              new Notice(t("modal_remotebasedir_notice"));
              this.close();
            })();
          });'''
)

# OnedriveRevokeAuthModal clean button
content = content.replace(
    '''        button.onClick(async () => {
          try {
            this.plugin.settings.onedrive = JSON.parse(''',
    '''        button.onClick(() => {
          void (async () => {
            try {
              this.plugin.settings.onedrive = JSON.parse('''
)
content = content.replace(
    '''            new Notice(t("modal_onedriverevokeauth_clean_fail"));
          }
        });
      });''',
    '''            new Notice(t("modal_onedriverevokeauth_clean_fail"));
            }
          })();
        });
      });'''
)

# SyncConfigDirModal onClick
content = content.replace(
    '''        button.onClick(async () => {
          this.plugin.settings.syncConfigDir = true;
          void this.plugin.saveSettings();
          this.saveDropdownFunc();
          new Notice(t("modal_syncconfig_notice"));
          this.close();
        });''',
    '''        button.onClick(() => {
          void (async () => {
            this.plugin.settings.syncConfigDir = true;
            void this.plugin.saveSettings();
            this.saveDropdownFunc();
            new Notice(t("modal_syncconfig_notice"));
            this.close();
          })();
        });'''
)

# OnedriveAuthModal copyBtn.onclick
content = content.replace(
    '''    copyBtn.onclick = async () => {
      await copyToClipboard(authUrl);
      new Notice(t("modal_onedriveauth_copynotice"));
    };''',
    '''    copyBtn.onclick = () => {
      void copyToClipboard(authUrl).then(() => {
        new Notice(t("modal_onedriveauth_copynotice"));
      });
    };'''
)

# Fix runScheduled unused var
content = content.replace(
    '''        let runScheduled = false;
        dropdown''',
    '''        dropdown'''
)

# Fix floating promises: toggleSyncOnSave
content = content.replace(
    '''            if (realVal < 0) {
              this.plugin.toggleSyncOnSave(false);
            } else {
              this.plugin.toggleSyncOnSave(true);
            }''',
    '''            if (realVal < 0) {
              void this.plugin.toggleSyncOnSave(false);
            } else {
              void this.plugin.toggleSyncOnSave(true);
            }'''
)

# Fix floating promises: toggleSyncOnRemote
content = content.replace(
    '''          if (realVal <= 0) {
              this.plugin.toggleSyncOnRemote(false);
            } else {
              this.plugin.toggleSyncOnRemote(true);
            }''',
    '''          if (realVal <= 0) {
              void this.plugin.toggleSyncOnRemote(false);
            } else {
              void this.plugin.toggleSyncOnRemote(true);
            }'''
)

# Fix syncRun floating promise in setInterval
content = content.replace(
    '''              const intervalID = window.setInterval(() => {
                this.plugin.syncRun("auto");
              }, realVal);''',
    '''              const intervalID = window.setInterval(() => {
                void this.plugin.syncRun("auto");
              }, realVal);'''
)

# Fix sentence-case for "basic" and "digest"
content = content.replace(
    '''          dropdown.addOption("basic", "basic");
          if (VALID_REQURL) {
            dropdown.addOption("digest", "digest");
          }''',
    '''          // eslint-disable-next-line obsidianmd/ui/sentence-case
          dropdown.addOption("basic", "basic");
          if (VALID_REQURL) {
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            dropdown.addOption("digest", "digest");
          }'''
)

# Fix sentence-case for placeholder
content = content.replace(
    '''          .setPlaceholder("obsidian://third-party-sync?func=settings&vault=&version=&data=&compressed=1")''',
    '''          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder("obsidian://third-party-sync?func=settings&vault=&version=&data=&compressed=1")'''
)

# Fix deprecated vaultRandomID
content = content.replace(
    '''          delete settingsOnlyS3.vaultRandomID;''',
    '''          // eslint-disable-next-line @typescript-eslint/no-deprecated
          delete settingsOnlyS3.vaultRandomID;'''
)
content = content.replace(
    '''          delete settingsOnlyWebdav.vaultRandomID;''',
    '''          // eslint-disable-next-line @typescript-eslint/no-deprecated
          delete settingsOnlyWebdav.vaultRandomID;'''
)

# Fix export buttons onClick
content = content.replace(
    '''        button.onClick(async () => {
          const settingsOnlyS3 = structuredClone(this.plugin.settings);
          delete settingsOnlyS3.onedrive;
          delete settingsOnlyS3.webdav;
          delete settingsOnlyS3.vaultRandomID;''',
    '''        button.onClick(() => {
          void (async () => {
            const settingsOnlyS3 = structuredClone(this.plugin.settings);
            delete settingsOnlyS3.onedrive;
            delete settingsOnlyS3.webdav;
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            delete settingsOnlyS3.vaultRandomID;'''
)
# Close void async for S3 export
content = content.replace(
    '''          await copyToClipboard(uri);
          new Notice(t("modal_export_button_notice"));
        });
      })
      .addButton(async (button) => {
        button.setButtonText(t("settings_export_webdav_button"));
        button.onClick(async () => {
          const settingsOnlyWebdav = structuredClone(this.plugin.settings);
          delete settingsOnlyWebdav.onedrive;
          delete settingsOnlyWebdav.s3;
          delete settingsOnlyWebdav.vaultRandomID;''',
    '''          await copyToClipboard(uri);
            new Notice(t("modal_export_button_notice"));
          })();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("settings_export_webdav_button"));
        button.onClick(() => {
          void (async () => {
            const settingsOnlyWebdav = structuredClone(this.plugin.settings);
            delete settingsOnlyWebdav.onedrive;
            delete settingsOnlyWebdav.s3;
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            delete settingsOnlyWebdav.vaultRandomID;'''
)
# Close void async for Webdav export
content = content.replace(
    '''          await copyToClipboard(uri);
          new Notice(t("modal_export_button_notice"));
        });
      })
    );''',
    '''          await copyToClipboard(uri);
            new Notice(t("modal_export_button_notice"));
          })();
        });
      })
    );'''
)

# Fix import button onClick (no await left, just remove async)
content = content.replace(
    '''        button.onClick(async () => {
          const rawInput = importUriInput.trim();''',
    '''        button.onClick(() => {
          const rawInput = importUriInput.trim();'''
)

# Fix debug section buttons
# Output settings console
content = content.replace(
    '''        button.onClick(async () => {
          const c = messyConfigToNormal(await this.plugin.loadData());
          new Notice(t("settings_outputsettingsconsole_notice"));
          log.debug("output settings to console:", c);
        });''',
    '''        button.onClick(() => {
          void (async () => {
            const c = messyConfigToNormal(await this.plugin.loadData());
            new Notice(t("settings_outputsettingsconsole_notice"));
            log.debug("output settings to console:", c);
          })();
        });'''
)

# Sync plans json
content = content.replace(
    '''            button.onClick(async () => {
              await exportVaultSyncPlansToFiles(''',
    '''            button.onClick(() => {
              void (async () => {
                await exportVaultSyncPlansToFiles('''
)
# Close void async for sync plans json
content = content.replace(
    '''              new Notice(t("settings_syncplans_notice"));
            });
          })
          .addButton(async (button) => {
            button.setButtonText(t("settings_syncplans_button_table"));
            button.onClick(async () => {
              await exportVaultSyncPlansToFiles(''',
    '''              new Notice(t("settings_syncplans_notice"));
              })();
            });
          })
          .addButton((button) => {
            button.setButtonText(t("settings_syncplans_button_table"));
            button.onClick(() => {
              void (async () => {
                await exportVaultSyncPlansToFiles('''
)
# Close void async for sync plans table
content = content.replace(
    '''              new Notice(t("settings_syncplans_notice"));
            });
          });
        new Setting(debugOptionsDiv)''',
    '''              new Notice(t("settings_syncplans_notice"));
              })();
            });
          });
        new Setting(debugOptionsDiv)'''
)

# Del sync plans
content = content.replace(
    '''            button.onClick(async () => {
              await clearAllSyncPlanRecords(this.plugin.db);
              new Notice(t("settings_delsyncplans_notice"));
            });''',
    '''            button.onClick(() => {
              void (async () => {
                await clearAllSyncPlanRecords(this.plugin.db);
                new Notice(t("settings_delsyncplans_notice"));
              })();
            });'''
)

# Log to DB export
content = content.replace(
    '''            button.onClick(async () => {
              await exportVaultLoggerOutputToFiles(''',
    '''            button.onClick(() => {
              void (async () => {
                await exportVaultLoggerOutputToFiles('''
)
# Close void async for log export
content = content.replace(
    '''              new Notice(t("settings_logtodbexport_notice"));
            });
          });

        new Setting(debugOptionsDiv)
          .setName(t("settings_logtodbclear"))''',
    '''              new Notice(t("settings_logtodbexport_notice"));
              })();
            });
          });

        new Setting(debugOptionsDiv)
          .setName(t("settings_logtodbclear"))'''
)

# Log to DB clear
content = content.replace(
    '''            button.onClick(async () => {
              await clearAllLoggerOutputRecords(this.plugin.db);
              new Notice(t("settings_logtodbclear_notice"));
            });''',
    '''            button.onClick(() => {
              void (async () => {
                await clearAllLoggerOutputRecords(this.plugin.db);
                new Notice(t("settings_logtodbclear_notice"));
              })();
            });'''
)

# Del sync map
content = content.replace(
    '''            button.onClick(async () => {
              await clearAllSyncMetaMapping(this.plugin.db);
              new Notice(t("settings_delsyncmap_notice"));
            });''',
    '''            button.onClick(() => {
              void (async () => {
                await clearAllSyncMetaMapping(this.plugin.db);
                new Notice(t("settings_delsyncmap_notice"));
              })();
            });'''
)

# Output base path vault id (no await, just remove async)
content = content.replace(
    '''            button.onClick(async () => {
              new Notice(this.plugin.getVaultBasePath());
              new Notice(this.plugin.vaultRandomID);
            });''',
    '''            button.onClick(() => {
              new Notice(this.plugin.getVaultBasePath());
              new Notice(this.plugin.vaultRandomID);
            });'''
)

# Reset cache
content = content.replace(
    '''            button.onClick(async () => {
              await destroyDBs();
              new Notice(t("settings_resetcache_notice"));
            });''',
    '''            button.onClick(() => {
              void (async () => {
                await destroyDBs();
                new Notice(t("settings_resetcache_notice"));
              })();
            });'''
)

# Reset sync metadata
content = content.replace(
    '''            button.onClick(async () => {
              // Delete all remote metadata file(s) and upload empty one.''',
    '''            button.onClick(() => {
              void (async () => {
                // Delete all remote metadata file(s) and upload empty one.'''
)
# Close void async for reset sync metadata
content = content.replace(
    '''              new Notice(t("settings_reset_sync_metadata_notice_end"));
              log.debug("Remote metadata file deleted. (2/2)")
            });
          });
      }''',
    '''              new Notice(t("settings_reset_sync_metadata_notice_end"));
                log.debug("Remote metadata file deleted. (2/2)")
              })();
            });
          });
      }'''
)

# Fix floating promises in logToDB onChange
content = content.replace(
    '''                  applyLogWriterInplace((...msg: unknown[]) => {
                    insertLoggerOutputByVault(''',
    '''                  applyLogWriterInplace((...msg: unknown[]) => {
                    void insertLoggerOutputByVault('''
)

content = content.replace(
    '''                clearExpiredLoggerOutputRecords(this.plugin.db);''',
    '''                void clearExpiredLoggerOutputRecords(this.plugin.db);'''
)

# Fix addSetting callbacks that return Setting (thenable) - add eslint-disable comments
# For addSetting callbacks with block body that have 'return setting.setName'
content = content.replace('return setting.setName', 'setting.setName')

# For addSetting((setting) => setting expression body, add eslint-disable-next-line
content = content.replace(
    '    sgChooser.addSetting((setting) => setting',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgChooser.addSetting((setting) => setting'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_password"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_password"))'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_saverun"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_saverun"))'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n    .setName(t("settings_remoterun"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n    .setName(t("settings_remoterun"))'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_autorun"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_autorun"))'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_runoncestartup"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_runoncestartup"))'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_skiplargefiles"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_skiplargefiles"))'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_enablestatusbar_info"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_enablestatusbar_info"))'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_sync_trash"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_sync_trash"))'
)
content = content.replace(
    '    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_sync_bookmarks"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgBasic.addSetting((setting) => setting\n      .setName(t("settings_sync_bookmarks"))'
)

# Advanced settings
content = content.replace(
    '    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_concurrency"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_concurrency"))'
)
content = content.replace(
    '    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_syncunderscore"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_syncunderscore"))'
)
content = content.replace(
    '    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_deletetowhere"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_deletetowhere"))'
)
content = content.replace(
    '    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_conflictaction"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_conflictaction"))'
)
content = content.replace(
    '    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_protectmodifypercentage"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_protectmodifypercentage"))'
)
content = content.replace(
    '    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_configdir"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgAdv.addSetting((setting) => setting\n      .setName(t("settings_configdir"))'
)

# Import/Export settings
content = content.replace(
    '    sgImportExport.addSetting((setting) => setting\n      .setName(t("settings_export"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgImportExport.addSetting((setting) => setting\n      .setName(t("settings_export"))'
)
content = content.replace(
    '    sgImportExport.addSetting((setting) => setting\n      .setName(t("settings_import"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgImportExport.addSetting((setting) => setting\n      .setName(t("settings_import"))'
)

# Debug settings
content = content.replace(
    '    sgDebug.addSetting((setting) =>\n      setting',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgDebug.addSetting((setting) =>\n      setting'
)

# For the addSetting callbacks with block body (sgServiceDetail), also add eslint-disable
# These are the ones with 'setting.setName' (no return) inside block body
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_endpoint"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_endpoint"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_region"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_region"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_accesskeyid"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_accesskeyid"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_secretaccesskey"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_secretaccesskey"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_bucketname"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_bucketname"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_urlstyle"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_urlstyle"))'
)

# The bypasscorslocally addSetting (inside if block)
content = content.replace(
    '      sgServiceDetail.addSetting((setting) => {\n        s3Settings.push(setting);\n        setting.setName(t("settings_s3_bypasscorslocally"))',
    '      // eslint-disable-next-line @typescript-eslint/no-misused-promises\n      sgServiceDetail.addSetting((setting) => {\n        s3Settings.push(setting);\n        setting.setName(t("settings_s3_bypasscorslocally"))'
)

content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_parts"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_s3_parts"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_checkonnectivity"))\n        .setDesc(t("settings_checkonnectivity_desc"))\n        .addButton((button) => {\n          button.setButtonText(t("settings_checkonnectivity_button"));\n          button.onClick(() => {\n            void (async () => {\n              new Notice(t("settings_checkonnectivity_checking"));\n              const client = new RemoteClient("s3"',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      s3Settings.push(setting);\n      setting.setName(t("settings_checkonnectivity"))\n        .setDesc(t("settings_checkonnectivity_desc"))\n        .addButton((button) => {\n          button.setButtonText(t("settings_checkonnectivity_button"));\n          button.onClick(() => {\n            void (async () => {\n              new Notice(t("settings_checkonnectivity_checking"));\n              const client = new RemoteClient("s3"'
)

# Onedrive settings
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      onedriveSettings.push(setting);\n      onedriveRevokeAuthSetting = setting;',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      onedriveSettings.push(setting);\n      onedriveRevokeAuthSetting = setting;'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      onedriveSettings.push(setting);\n      onedriveAuthSetting = setting;',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      onedriveSettings.push(setting);\n      onedriveAuthSetting = setting;'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      onedriveSettings.push(setting);\n      setting.setName(t("settings_remotebasedir"))\n        .setDesc(t("settings_remotebasedir_desc"))\n        .addText((text) =>\n          text\n            .setPlaceholder(this.app.vault.getName())\n            .setValue(newOnedriveRemoteBaseDir)',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      onedriveSettings.push(setting);\n      setting.setName(t("settings_remotebasedir"))\n        .setDesc(t("settings_remotebasedir_desc"))\n        .addText((text) =>\n          text\n            .setPlaceholder(this.app.vault.getName())\n            .setValue(newOnedriveRemoteBaseDir)'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      onedriveSettings.push(setting);\n      setting.setName(t("settings_checkonnectivity"))\n        .setDesc(t("settings_checkonnectivity_desc"))\n        .addButton((button) => {\n          button.setButtonText(t("settings_checkonnectivity_button"));\n          button.onClick(() => {\n            void (async () => {\n              new Notice(t("settings_checkonnectivity_checking"));\n              const client = new RemoteClient(\n                "onedrive"',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      onedriveSettings.push(setting);\n      setting.setName(t("settings_checkonnectivity"))\n        .setDesc(t("settings_checkonnectivity_desc"))\n        .addButton((button) => {\n          button.setButtonText(t("settings_checkonnectivity_button"));\n          button.onClick(() => {\n            void (async () => {\n              new Notice(t("settings_checkonnectivity_checking"));\n              const client = new RemoteClient(\n                "onedrive"'
)

# Webdav settings
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_addr"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_addr"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_user"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_user"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_password"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_password"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_auth"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_auth"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_depth"))',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_webdav_depth"))'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_remotebasedir"))\n        .setDesc(t("settings_remotebasedir_desc"))\n        .addText((text) =>\n          text\n            .setPlaceholder(this.app.vault.getName())\n            .setValue(newWebdavRemoteBaseDir)',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_remotebasedir"))\n        .setDesc(t("settings_remotebasedir_desc"))\n        .addText((text) =>\n          text\n            .setPlaceholder(this.app.vault.getName())\n            .setValue(newWebdavRemoteBaseDir)'
)
content = content.replace(
    '    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_checkonnectivity"))\n        .setDesc(t("settings_checkonnectivity_desc"))\n        .addButton((button) => {\n          button.setButtonText(t("settings_checkonnectivity_button"));\n          button.onClick(() => {\n            void (async () => {\n              new Notice(t("settings_checkonnectivity_checking"));\n              const client = new RemoteClient(\n                "webdav"',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgServiceDetail.addSetting((setting) => {\n      webdavSettings.push(setting);\n      setting.setName(t("settings_checkonnectivity"))\n        .setDesc(t("settings_checkonnectivity_desc"))\n        .addButton((button) => {\n          button.setButtonText(t("settings_checkonnectivity_button"));\n          button.onClick(() => {\n            void (async () => {\n              new Notice(t("settings_checkonnectivity_checking"));\n              const client = new RemoteClient(\n                "webdav"'
)

# Sync direction setting
content = content.replace(
    '    sgAdv.addSetting((setting) => {\n      syncDirSetting = setting;',
    '    // eslint-disable-next-line @typescript-eslint/no-misused-promises\n    sgAdv.addSetting((setting) => {\n      syncDirSetting = setting;'
)

with open('src/settings.ts', 'w') as f:
    f.write(content)

print('All fixes applied successfully')
