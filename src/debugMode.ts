import { Vault } from "obsidian";

import type { SyncPlanType } from "./sync";
import {
  readAllSyncPlanRecordTextsByVault,
  readAllLogRecordTextsByVault,
} from "./localdb";
import type { InternalDBs } from "./localdb";
import { mkdirpInVault } from "./misc";
import {
  DEFAULT_DEBUG_FOLDER,
  DEFAULT_LOG_HISTORY_FILE_PREFIX,
  DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX,
  FileOrFolderMixedState,
} from "./baseTypes";

const turnSyncPlanToTable = (record: string) => {
  const syncPlan: SyncPlanType = JSON.parse(record) as SyncPlanType;
  const { ts, tsFmt, remoteType } = syncPlan;

  type allowedHeadersType = keyof FileOrFolderMixedState;
  const headers: allowedHeadersType[] = [
    "key",
    "remoteEncryptedKey",
    "existLocal",
    "sizeLocal",
    "sizeLocalEnc",
    "mtimeLocal",
    "deltimeLocal",
    "changeLocalMtimeUsingMapping",
    "existRemote",
    "sizeRemote",
    "sizeRemoteEnc",
    "mtimeRemote",
    "deltimeRemote",
    "changeRemoteMtimeUsingMapping",
    "decision",
    "decisionBranch",
  ];

  const lines = [
    `ts: ${ts}${tsFmt !== undefined ? " / " + tsFmt : ""}`,
    `remoteType: ${remoteType}`,
    `| ${headers.join(" | ")} |`,
    `| ${headers.map((_x) => "---").join(" | ")} |`,
  ];
  for (const [, v1] of Object.entries(syncPlan.mixedStates)) {
    const v = v1;
    const singleLine = [];
    for (const h of headers) {
      const field = v[h];
      if (field === undefined) {
        singleLine.push("");
        continue;
      }
      if (
        h === "mtimeLocal" ||
        h === "deltimeLocal" ||
        h === "mtimeRemote" ||
        h === "deltimeRemote"
      ) {
        const fmt = v[(h + "Fmt") as allowedHeadersType] as string;
        const fieldStr = typeof field === "object" ? JSON.stringify(field) : String(field);
        const s = `${fieldStr}${fmt !== undefined ? " / " + fmt : ""}`;
        singleLine.push(s);
      } else {
        singleLine.push(typeof field === "object" ? JSON.stringify(field) : String(field));
      }
    }
    lines.push(`| ${singleLine.map(String).join(" | ")} |`);
  }

  return lines.join("\n");
};

export const exportVaultSyncPlansToFiles = async (
  db: InternalDBs,
  vault: Vault,
  vaultRandomID: string,
  toFormat: "table" | "json" = "json"
) => {
  await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault);
  const records = await readAllSyncPlanRecordTextsByVault(db, vaultRandomID);
  let md = "";
  if (records.length === 0) {
    md = "No sync plans history found";
  } else {
    if (toFormat === "json") {
      md =
        "Sync plans found:\n\n" +
        records.map((x) => "```json\n" + x + "\n```\n").join("\n");
    } else if (toFormat === "table") {
      md =
        "Sync plans found:\n\n" + records.map(turnSyncPlanToTable).join("\n\n");
    }
  }
  const ts = Date.now();
  const filePath = `${DEFAULT_DEBUG_FOLDER}${DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX}${ts}.md`;
  await vault.create(filePath, md, {
    mtime: ts,
  });
};

export const exportVaultLoggerOutputToFiles = async (
  db: InternalDBs,
  vault: Vault,
  vaultRandomID: string
) => {
  await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault);
  const records = await readAllLogRecordTextsByVault(db, vaultRandomID);
  let md = "";
  if (records.length === 0) {
    md = "No logger history found.";
  } else {
    md =
      "Logger history found:\n\n" +
      "```text\n" +
      records.join("\n") +
      "\n```\n";
  }
  const ts = Date.now();
  const filePath = `${DEFAULT_DEBUG_FOLDER}${DEFAULT_LOG_HISTORY_FILE_PREFIX}${ts}.md`;
  await vault.create(filePath, md, {
    mtime: ts,
  });
};
