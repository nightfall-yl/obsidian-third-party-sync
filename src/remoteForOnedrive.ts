import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import type {
  DriveItem,
  UploadSession,
  User,
} from "@microsoft/microsoft-graph-types";
import { requestUrl, Vault } from "obsidian";
import {
  DEFAULT_CONTENT_TYPE,
  OnedriveConfig,
  RemoteItem,
} from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import {
  bufferToArrayBuffer,
  getRandomArrayBuffer,
  getRandomIntInclusive,
  mkdirpInVault,
} from "./misc";
import { DeviceCodeFlowClient, OAuthEndpoints } from "./onedriveAuth";
import type { TokenStorage } from "./tokenStorage";

import { log } from "./moreOnLog";

const SCOPES = ["User.Read", "Files.ReadWrite.AppFolder", "offline_access"];

export const DEFAULT_ONEDRIVE_CONFIG: OnedriveConfig = {
  accessToken: "",
  clientID: "ad95e28f-d89a-43db-8ce6-0e64ef1283aa",
  authority: "https://login.microsoftonline.com/consumers/",
  refreshToken: "",
  accessTokenExpiresInSeconds: 0,
  accessTokenExpiresAtTime: 0,
  deltaLink: "",
  username: "",
  credentialsShouldBeDeletedAtTime: 0,
};

////////////////////////////////////////////////////////////////////////////////
// Onedrive authorization using Device Code Flow (RFC 8628)
////////////////////////////////////////////////////////////////////////////////

function buildOAuthEndpoints(authority: string): OAuthEndpoints {
  const base = authority.replace(/\/$/, "");
  return {
    deviceCode: `${base}/oauth2/v2.0/devicecode`,
    token: `${base}/oauth2/v2.0/token`,
  };
}

/** 构造设备码授权客户端（供设置页授权弹窗使用） */
export function buildDeviceCodeFlowClient(
  cfg: OnedriveConfig
): DeviceCodeFlowClient {
  return new DeviceCodeFlowClient({
    clientId: cfg.clientID,
    endpoints: buildOAuthEndpoints(cfg.authority),
    scopes: SCOPES,
  });
}

////////////////////////////////////////////////////////////////////////////////
// HTTP helpers — transient retry + humanized errors
////////////////////////////////////////////////////////////////////////////////

/** 瞬态 HTTP 状态：Graph 网关抖动/限流，重试一下就好 */
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
export const isTransientHttpStatus = (status: number): boolean =>
  TRANSIENT_STATUSES.has(status);

/** 指数退避 sleep（1s → 2s → 4s → …） */
const sleepMs = (ms: number): Promise<void> =>
  new Promise<void>((res) => window.setTimeout(res, ms));

/**
 * 把 raw API 错误映射成 Notice 层的中文文案。
 * 原始错误保留在 err.cause?.rawBody / err.message 里供调试，
 * 用户只看到友好的一句话。
 */
export const humanizeApiError = (err: unknown): string => {
  if (err === null || err === undefined) {
    return "";
  }
  if (typeof err === "string") {
    return err;
  }
  if (!(err instanceof Error)) {
    return "";
  }
  const e = err as Error & { status?: number; code?: string };
  const status = e.status;
  const code = e.code;

  if (status !== undefined) {
    switch (status) {
      case 401:
        return "OneDrive 授权已失效，请重新授权";
      case 403:
        return "OneDrive 拒绝访问（权限不足或租户策略限制）";
      case 404:
      case 410:
        return "OneDrive 上找不到这个文件";
      case 429:
        return "OneDrive 请求过于频繁（限流），请稍后再试";
      case 502:
      case 503:
      case 504:
        return "OneDrive 服务暂时不可用，请稍后重试";
    }
  }

  if (code !== undefined) {
    switch (code) {
      case "UnknownError":
      case "generalException":
        return "OneDrive 服务暂时异常，请稍后重试";
      case "itemNotFound":
        return "OneDrive 上找不到这个文件";
      case "accessDenied":
        return "OneDrive 拒绝访问（权限不足）";
      case "invalidInput":
        return "请求参数有误";
    }
  }

  return e.message;
};

////////////////////////////////////////////////////////////////////////////////
// Other usual common methods
////////////////////////////////////////////////////////////////////////////////

const getOnedrivePath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  // https://docs.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder?view=odsp-graph-online
  const prefix = `/drive/special/approot:/${remoteBaseDir}`;
  if (fileOrFolderPath.startsWith(prefix)) {
    // already transformed, return as is
    return fileOrFolderPath;
  }

  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    return prefix;
  }
  if (key.endsWith("/")) {
    key = key.slice(0, key.length - 1);
  }

  key = `${prefix}/${key}`;
  return key;
};

const constructFromDriveItemToRemoteItemError = (x: DriveItem) => {
  return `parentPath="${x.parentReference.path}", selfName="${x.name}"`;
};

/**
 * Generic parser for OneDrive parent paths.
 * OneDrive returns paths like:
 *   /drive/root:/Apps/AnyAppName/VaultName/subfolder
 *   /drive/root:/应用/任意本地化名称/VaultName/subfolder
 *   /Livefolders/Apps/AnyAppName/VaultName/subfolder
 *   /drive/items/<id>!<id>:/VaultName/subfolder  (URI encoded)
 *
 * We extract the path AFTER remoteBaseDir (the vault folder name)
 * regardless of what App Folder name / localization scheme is used.
 * This avoids hard-coding plugin name strings and ensures compatibility with
 * any AAD app display name (Remotely Save, Third-party Sync, etc.)
 */
const extractKeyByRemoteBaseDir = (
  fullPathOrParentPath: string,
  remoteBaseDir: string,
  fileName: string,
  parentRefIsIdBased: boolean
): string | null => {
  // For /drive/items/ID:PATH style (ID-based parent reference),
  // fullPathOrParentPath = parent's colon-subpath, e.g. "/VaultName/sub"
  // or "/VaultName" itself. We need to re-append fileName at the end.
  if (parentRefIsIdBased) {
    const key = fullPathOrParentPath;
    if (key === `/${remoteBaseDir}`) {
      return fileName;
    }
    const prefix = `/${remoteBaseDir}/`;
    if (key.startsWith(prefix)) {
      return `${key.substring(prefix.length)}/${fileName}`;
    }
    return null;
  }

  // For named-path formats (/drive/root:/ or /Livefolders/...):
  // fullPathOrParentPath = parentPath/name, fully assembled
  // remoteBaseDir itself may appear at ANY path segment after the drive prefix
  const idx = fullPathOrParentPath.indexOf(`/${remoteBaseDir}/`);
  if (idx >= 0) {
    return fullPathOrParentPath.substring(idx + 1 + remoteBaseDir.length + 1);
  }
  // remoteBaseDir is the immediate parent (no subfolder)
  const trailing = fullPathOrParentPath.lastIndexOf(`/${remoteBaseDir}`);
  if (trailing >= 0 && trailing + remoteBaseDir.length + 1 === fullPathOrParentPath.indexOf(`/${fileName}`, trailing)) {
    // e.g. ".../AppFolder/VaultName/fileName"
    return fullPathOrParentPath.substring(trailing + 1 + remoteBaseDir.length + 1);
  }
  // Fallback for when fileName sits exactly after remoteBaseDir:
  // fullPathOrParentPath ends with /<remoteBaseDir>/<fileName>
  const suffix = `/${remoteBaseDir}/${fileName}`;
  if (fullPathOrParentPath.endsWith(suffix)) {
    return fileName;
  }
  return null;
};

const fromDriveItemToRemoteItem = (
  x: DriveItem,
  remoteBaseDir: string
): RemoteItem => {
  if (
    x === undefined ||
    x.parentReference === undefined ||
    x.parentReference.path === undefined ||
    x.name === undefined
  ) {
    throw Error(`invalid drive item shape`);
  }

  let key = "";

  // another possibile prefix
  const THIRD_COMMON_PREFIX_RAW = `/drive/items/`;

  const fullPathOriginal = `${x.parentReference.path}/${x.name}`;

  // The delta listing may surface the vault ROOT folder itself as one of the
  // items (its parent is the app folder, which does NOT contain remoteBaseDir).
  // Map it to the "/" root key so listFromRemote filters it out instead of
  // treating it as an unrecognized item.
  const isVaultRootItem =
    x.name === remoteBaseDir &&
    !x.parentReference.path.includes(`/${remoteBaseDir}`);
  if (isVaultRootItem) {
    return {
      key: "/",
      lastModified: Date.parse(x.fileSystemInfo.lastModifiedDateTime),
      size: 0,
      remoteType: "onedrive",
      etag: x.cTag || "",
    };
  }

  // Try generic parsing FIRST — this works for ANY app name / any localization
  // without hard-coding "Remotely Sync" / "Third-party Sync" / etc.
  // Format 1: /drive/root:/<LocalizedAppsFolder>/<AnyAppName>/<remoteBaseDir>/...
  // Format 2: /Livefolders/<LocalizedAppsFolder>/<AnyAppName>/<remoteBaseDir>/...
  let keyCandidate = extractKeyByRemoteBaseDir(
    fullPathOriginal,
    remoteBaseDir,
    x.name,
    false
  );
  if (keyCandidate !== null) {
    key = keyCandidate;
  } else if (x.parentReference.path.startsWith(THIRD_COMMON_PREFIX_RAW)) {
    // it's something like
    // /drive/items/<some_id>!<another_id>:/${remoteBaseDir}/<subfolder>
    // with uri encoded!
    const parPath = decodeURIComponent(x.parentReference.path);
    const colonSubpath = parPath.substring(parPath.indexOf(":") + 1);
    keyCandidate = extractKeyByRemoteBaseDir(
      colonSubpath,
      remoteBaseDir,
      x.name,
      true
    );
    if (keyCandidate === null) {
      throw Error(
        `we meet file/folder and do not know how to deal with it:\n${constructFromDriveItemToRemoteItemError(
          x
        )}`
      );
    }
    key = keyCandidate;
  } else {
    throw Error(
      `we meet file/folder and do not know how to deal with it:\n${constructFromDriveItemToRemoteItemError(
        x
      )}`
    );
  }

  const isFolder = "folder" in x;
  if (isFolder) {
    key = `${key}/`;
  }
  return {
    key: key,
    lastModified: Date.parse(x.fileSystemInfo.lastModifiedDateTime),
    size: isFolder ? 0 : x.size,
    remoteType: "onedrive",
    etag: x.cTag || "", // do NOT use x.eTag because it changes if meta changes
  };
};

/** 2xx is a usable response. */
export const isHttpSuccessStatus = (status: number): boolean => {
  return status >= 200 && status < 300;
};

/** 404 means the addressed remote item no longer exists. */
export const isHttpNotFoundStatus = (status: number): boolean => {
  return status === 404;
};

/**
 * A DELETE that answers 2xx or 404 has reached its goal: 404 means the item is
 * already gone, which is exactly the state the caller wanted.
 */
export const isDeleteResponseDone = (status: number): boolean => {
  return isHttpSuccessStatus(status) || isHttpNotFoundStatus(status);
};

/**
 * Build the shared Onedrive error shape: human-readable message plus the
 * machine-readable `status` / `code` fields that `isRemoteItemNotFoundError`
 * relies on. Used by every request path that reads the response itself
 * (`throw: false`) instead of letting `requestUrl` throw an opaque
 * `Request failed, status <code>` error.
 *
 * The raw body is stored on `cause` (accessible via `err.cause.rawBody`)
 * but intentionally NOT concatenated into the message — end-users see a short
 * summary, while debugging still has the full payload available.
 */
export const buildRemoteApiError = (
  method: string,
  theUrl: string,
  status: number,
  rawJson: unknown,
  rawText: unknown,
  detail: string = ""
): Error & { status?: number; code?: string; cause?: unknown } => {
  // `resp.json` is null when the body is not JSON; fall back to parsing text so
  // the Graph error code survives on every platform.
  let parsed: Record<string, unknown> | undefined;
  if (rawJson !== null && typeof rawJson === "object") {
    parsed = rawJson as Record<string, unknown>;
  } else if (typeof rawText === "string") {
    try {
      const fromText: unknown = JSON.parse(rawText);
      if (fromText !== null && typeof fromText === "object") {
        parsed = fromText as Record<string, unknown>;
      }
    } catch {
      // not JSON; the raw text is still reported below
    }
  }
  const raw =
    typeof rawText === "string" ? rawText : JSON.stringify(rawJson ?? {});
  const apiError = Error(
    `OneDrive API ${method} ${theUrl} 失败 (HTTP ${status}): ${
      detail || "无解析详情"
    }`
  ) as Error & { status?: number; code?: string; cause?: unknown };
  apiError.status = status;
  apiError.cause = { rawBody: raw };
  const graphErr = parsed?.error as Record<string, unknown> | undefined;
  if (graphErr !== undefined && typeof graphErr.code === "string") {
    apiError.code = graphErr.code;
  }
  return apiError;
};

// Shared helper for OneDrive Graph API JSON calls.
// Uses `throw: false` so a non-2xx response (e.g. HTTP 400) is returned instead
// of being swallowed by an opaque RequestUrlError, then surfaces the real Graph
// error code/message + HTTP status.
//
// Transient server failures (429/502/503/504) are retried up to 3 times with
// exponential backoff (1s → 2s → 4s); permanent failures throw immediately.
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

/** resp.json 是惰性 getter，非 JSON 响应体（HTML 错误页/空 body）会在 getter 里抛 SyntaxError；
 * 这里只读 text 手动解析，失败就返回 undefined。 */
function parseJsonBodySafe(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON
  }
  return undefined;
}

/** Graph error innerError 递归走查，拿根因 code + message */
function collectErrorDetail(node: unknown, depth: number): string {
  if (node === undefined || node === null || typeof node !== "object") {
    return "";
  }
  const obj = node as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof obj.code === "string") {
    parts.push(obj.code);
  }
  if (typeof obj.message === "string") {
    parts.push(obj.message);
  }
  let inner = "";
  if (depth < 5 && obj.innerError && typeof obj.innerError === "object") {
    inner = collectErrorDetail(obj.innerError, depth + 1);
  }
  const joined = parts.filter(Boolean).join(" ");
  return [joined, inner].filter(Boolean).join(" → ");
}

/** 把 finalizeApiError 抽出来：2xx 走 parseJsonBodySafe，非 2xx 走 buildRemoteApiError */
function finalizeApiError(
  method: string,
  theUrl: string,
  status: number,
  rawText: unknown
): Record<string, unknown> {
  if (status < 400) {
    return (
      parseJsonBodySafe(
        typeof rawText === "string" ? rawText : ""
      ) ?? {}
    );
  }
  const parsed =
    typeof rawText === "string" ? parseJsonBodySafe(rawText) : undefined;

  if (parsed !== undefined) {
    const o = parsed as {
      error?: unknown;
      error_description?: string;
    };
    if (o.error !== undefined || o.error_description !== undefined) {
      let detail = collectErrorDetail(o.error, 0);
      if (!detail && typeof o.error === "string") {
        detail = o.error;
      }
      if (o.error_description) {
        detail = detail
          ? `${detail} — ${o.error_description}`
          : o.error_description;
      }
      throw buildRemoteApiError(
        method,
        theUrl,
        status,
        parsed,
        rawText,
        detail
      );
    }
  }
  // 非 2xx 且没解析到标准 Graph error body → bare error status
  throw buildRemoteApiError(method, theUrl, status, null, rawText);
}

const oneDriveApiRequest = async (
  method: string,
  theUrl: string,
  headers: Record<string, string>,
  body?: string
): Promise<Record<string, unknown>> => {
  let resp: { status: number; text: string | null } | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = RETRY_BASE_MS * 2 ** (attempt - 1);
      log.warn(
        `oneDriveApiRequest retry ${attempt}/${MAX_RETRIES} after HTTP ${resp?.status}, backoff=${backoff}ms: ${method} ${theUrl}`
      );
      await sleepMs(backoff);
    }

    const r = await requestUrl({
      url: theUrl,
      method,
      contentType: "application/json",
      throw: false,
      headers,
      ...(body !== undefined ? { body } : {}),
    });
    resp = { status: r.status, text: r.text };

    if (r.status < 400) {
      break; // 成功退出循环，交给 finalizeApiError 返回
    }
    // 永久错误（401/403/404/410/...）——立即抛出不重试
    if (!isTransientHttpStatus(r.status)) {
      return finalizeApiError(method, theUrl, r.status, r.text);
    }
    // 瞬态错误 —— 继续循环（除非最后一次了）
  }

  if (resp === null) {
    throw new Error("oneDriveApiRequest: no response");
  }
  return finalizeApiError(method, theUrl, resp.status, resp.text);
};

/**
 * AuthProvider：每次 Graph API 调用前由 getAccessToken() 触发。
 *
 * - access token 过期前 2 分钟自动 refresh
 * - refresh 串行化（单飞锁），避免并发请求互相 invalidate refresh token
 * - Token 持久化完全走 TokenStorage（SecretStorage）
 */
class MyAuthProvider implements AuthenticationProvider {
  private refreshPromise: Promise<void> | null = null;
  readonly tokenStorage: TokenStorage;

  constructor(
    tokenStorage: TokenStorage,
    private readonly flowClient: DeviceCodeFlowClient
  ) {
    this.tokenStorage = tokenStorage;
  }

  getAccessToken = async (): Promise<string> => {
    if (!this.tokenStorage.hasTokens()) {
      throw new Error("尚未完成 OneDrive 鉴权，请在设置页点击「授权 OneDrive」。");
    }

    if (!this.tokenStorage.isAccessTokenExpired(120_000)) {
      const at = this.tokenStorage.getAccessToken();
      if (!at) throw new Error("Token 存储异常，请重新授权。");
      return at;
    }

    // 过期了 → 单飞锁下 refresh
    if (this.refreshPromise === null) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;

    const at = this.tokenStorage.getAccessToken();
    if (!at) throw new Error("Token 存储异常，请重新授权。");
    return at;
  };

  private async doRefresh(): Promise<void> {
    const rt = this.tokenStorage.getRefreshToken();
    if (!rt) {
      throw new Error("没有 refresh token，请在设置页重新授权。");
    }
    const resp = await this.flowClient.refreshToken(rt);
    this.tokenStorage.setTokens(
      resp.access_token,
      resp.refresh_token ?? rt,
      resp.expires_in
    );
  }
}

export class WrappedOnedriveClient {
  onedriveConfig: OnedriveConfig;
  remoteBaseDir: string;
  vaultFolderExists: boolean;
  authGetter: MyAuthProvider;
  /** 非敏感字段（deltaLink / remoteSnapshot）持久化回调；token 不再走这里 */
  saveSettingsCb?: () => Promise<void>;
  constructor(
    onedriveConfig: OnedriveConfig,
    remoteBaseDir: string,
    tokenStorage: TokenStorage,
    flowClient: DeviceCodeFlowClient,
    saveSettingsCb?: () => Promise<void>
  ) {
    this.onedriveConfig = onedriveConfig;
    this.remoteBaseDir = remoteBaseDir;
    this.vaultFolderExists = false;
    this.saveSettingsCb = saveSettingsCb;
    this.authGetter = new MyAuthProvider(tokenStorage, flowClient);
  }

  init = async () => {
    // check token (SecretStorage via TokenStorage)
    if (!this.authGetter.tokenStorage.hasTokens()) {
      throw Error("尚未完成 OneDrive 鉴权，请在设置页点击「授权 OneDrive」。");
    }

    // Ensure the vault folder exists under approot.
    // Use PATCH with path-based addressing + conflictBehavior, which is the
    // approach proven to work by upstream remotely-save on personal accounts:
    //   PATCH /drive/special/approot:/<vaultName>
    //   { "folder": {}, "@microsoft.graph.conflictBehavior": "replace" }
    // This is idempotent (creates a fresh folder or is a no-op if it exists),
    // and avoids the `POST /drive/special/approot/children` form, which can
    // return a generic 400 invalidRequest (empty innerError) on personal
    // Microsoft accounts.
    if (!this.vaultFolderExists) {
      await this.patchJson(
        `/drive/special/approot:/${this.remoteBaseDir}`,
        {
          folder: {},
          "@microsoft.graph.conflictBehavior": "replace",
        }
      );
      this.vaultFolderExists = true;
    }
  };

  buildUrl = (pathFragOrig: string) => {
    const API_PREFIX = "https://graph.microsoft.com/v1.0";
    let theUrl = "";
    if (
      pathFragOrig.startsWith("http://") ||
      pathFragOrig.startsWith("https://")
    ) {
      theUrl = pathFragOrig;
    } else {
      const pathFrag = encodeURI(pathFragOrig);
      theUrl = `${API_PREFIX}${pathFrag}`;
    }
    return theUrl;
  };

  getJson = async (pathFragOrig: string) => {
    const theUrl = this.buildUrl(pathFragOrig);
    log.debug(`getJson, theUrl=${theUrl}`);
    const accessToken = await this.authGetter.getAccessToken();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Cache-Control": "no-cache",
    };

    return oneDriveApiRequest("GET", theUrl, headers);
  };

  postJson = async (pathFragOrig: string, payload: Record<string, unknown>) => {
    const theUrl = this.buildUrl(pathFragOrig);
    log.debug(`postJson, theUrl=${theUrl}`);
    const accessToken = await this.authGetter.getAccessToken();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    return oneDriveApiRequest("POST", theUrl, headers, JSON.stringify(payload));
  };

  patchJson = async (pathFragOrig: string, payload: Record<string, unknown>) => {
    const theUrl = this.buildUrl(pathFragOrig);
    log.debug(`patchJson, theUrl=${theUrl}`);
    const accessToken = await this.authGetter.getAccessToken();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    return oneDriveApiRequest("PATCH", theUrl, headers, JSON.stringify(payload));
  };

  deleteJson = async (pathFragOrig: string) => {
    const theUrl = this.buildUrl(pathFragOrig);
    log.debug(`deleteJson, theUrl=${theUrl}`);
    // `throw: false`: a 404 (item already gone) must be reported as success,
    // not as an opaque `Request failed, status 404`.
    const resp = await requestUrl({
      url: theUrl,
      method: "DELETE",
      throw: false,
      headers: {
        Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
      },
    });
    if (isDeleteResponseDone(resp.status)) {
      if (isHttpNotFoundStatus(resp.status)) {
        log.debug(
          `deleteJson: remote item already absent (HTTP 404), nothing to do: ${theUrl}`
        );
      }
      return;
    }
    // Pass only `resp.text`: `resp.json` is a lazy getter in Obsidian that
    // throws on a non-JSON error page, which would replace this error with one
    // lacking `status`. buildRemoteApiError re-parses the text instead.
    throw buildRemoteApiError(
      "DELETE",
      theUrl,
      resp.status,
      null,
      resp.text
    );
  };

  putArrayBuffer = async (pathFragOrig: string, payload: ArrayBuffer) => {
    const theUrl = this.buildUrl(pathFragOrig);
    log.debug(`putArrayBuffer, theUrl=${theUrl}`);
    const accessToken = await this.authGetter.getAccessToken();
    // capture the real HTTP result instead of relying on requestUrl throwing,
    // so a failing PUT is visible in the console rather than silently swallowed.
    const resp = await requestUrl({
      url: theUrl,
      method: "PUT",
      body: payload,
      contentType: DEFAULT_CONTENT_TYPE,
      throw: false,
      headers: {
        "Content-Type": DEFAULT_CONTENT_TYPE,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (resp.status >= 200 && resp.status < 300) {
      return;
    }
    const raw =
      typeof resp.text === "string"
        ? resp.text
        : JSON.stringify(resp.json ?? {});
    throw Error(
      `OneDrive 文件上传失败 (HTTP ${resp.status}): ${raw}`
    );
  };

  /**
   * A specialized function to upload large files by parts
   * @param pathFragOrig
   * @param payload
   * @param rangeMin
   * @param rangeEnd the end, exclusive
   * @param size
   */
  putUint8ArrayByRange = async (
    pathFragOrig: string,
    payload: Uint8Array,
    rangeStart: number,
    rangeEnd: number,
    size: number
  ) => {
    const theUrl = this.buildUrl(pathFragOrig);
    log.debug(
      `putUint8ArrayByRange, theUrl=${theUrl}, range=${rangeStart}-${
        rangeEnd - 1
      }, len=${rangeEnd - rangeStart}, size=${size}`
    );
    // NO AUTH HEADER here!
    // Removed fallback from requestUrl on platforms where implementation differs.
    const res = await requestUrl({
      url: theUrl,
      method: "PUT",
      body: bufferToArrayBuffer(payload.subarray(rangeStart, rangeEnd)),
      contentType: DEFAULT_CONTENT_TYPE,
      headers: {
        // no "Content-Length" allowed here
        "Content-Range": `bytes ${rangeStart}-${rangeEnd - 1}/${size}`,
        /* "Cache-Control": "no-cache", not allowed here!!! */
      },
    });
    return res.json as DriveItem | UploadSession;
  };
}

export const getOnedriveClient = (
  onedriveConfig: OnedriveConfig,
  remoteBaseDir: string,
  tokenStorage: TokenStorage,
  flowClient: DeviceCodeFlowClient,
  saveSettingsCb?: () => Promise<void>
) => {
  return new WrappedOnedriveClient(
    onedriveConfig,
    remoteBaseDir,
    tokenStorage,
    flowClient,
    saveSettingsCb
  );
};

/**
 * Remove the snapshot entry referenced by a delta deletion item.
 * Returns false when the item carries too little metadata to locate the key —
 * the caller must then treat the merged snapshot as untrusted instead of
 * silently keeping a ghost entry.
 */
const removeDeletedEntryFromSnapshot = (
  snapshot: Record<string, RemoteItem>,
  item: DriveItem,
  remoteBaseDir: string
): boolean => {
  const name = item.name;
  const parentPath = item.parentReference?.path;
  if (name !== undefined && parentPath !== undefined) {
    try {
      const deletedItem = fromDriveItemToRemoteItem(item, remoteBaseDir);
      // "/" is the vault root sentinel: nothing to remove, but it is resolved.
      if (deletedItem.key !== "/") {
        delete snapshot[deletedItem.key];
      }
      return true;
    } catch {
      // incomplete metadata: fall back to looking the key up by name suffix
    }
  }
  if (name !== undefined) {
    const suffix = `/${name}`;
    for (const key of Object.keys(snapshot)) {
      if (key.endsWith(suffix) || key === suffix) {
        delete snapshot[key];
        return true;
      }
    }
  }
  return false;
};

/**
 * Use OneDrive delta API to list all files and folders.
 * https://learn.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_delta
 *
 * Two modes:
 *   1. Full enumeration (first sync / expired deltaLink): start from
 *      /delta?$top=200, page through everything, store the snapshot and
 *      deltaLink, return the full Contents.
 *   2. Delta resume (both deltaLink and snapshot present): fetch only the
 *      incremental changes via the stored deltaLink, merge them into the
 *      local snapshot (upsert for created/updated, removal for deleted),
 *      and return the merged full Contents. Any network error or 410 Gone
 *      falls back to a full enumeration (deltaLink + snapshot are cleared).
 */
export const listFromRemote = async (
  client: WrappedOnedriveClient,
  prefix?: string
) => {
  if (prefix !== undefined) {
    throw Error("prefix not supported (yet)");
  }
  await client.init();

  const NEXT_LINK_KEY = "@odata.nextLink";
  const DELTA_LINK_KEY = "@odata.deltaLink";

  const tryDeltaResume =
    !!client.onedriveConfig.deltaLink &&
    !!client.onedriveConfig.remoteSnapshot &&
    Object.keys(client.onedriveConfig.remoteSnapshot).length > 0;

  let items: DriveItem[] = [];
  let newDeltaLink = "";
  let usedFullEnumeration = false;

  const fetchAllPages = async (startUrl: string) => {
    const collected: DriveItem[] = [];
    let res = await client.getJson(startUrl);
    collected.push(...((res.value ?? []) as DriveItem[]));
    while (NEXT_LINK_KEY in res) {
      res = await client.getJson(res[NEXT_LINK_KEY] as string);
      collected.push(...((res.value ?? []) as DriveItem[]));
    }
    if (DELTA_LINK_KEY in res) {
      newDeltaLink = res[DELTA_LINK_KEY] as string;
    }
    return collected;
  };

  if (tryDeltaResume) {
    try {
      items = await fetchAllPages(client.onedriveConfig.deltaLink);
    } catch (err) {
      // deltaLink expired or remote unavailable -> fall back to full enumeration
      log.warn(
        `deltaLink resume failed, falling back to full enumeration: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      client.onedriveConfig.deltaLink = "";
      client.onedriveConfig.remoteSnapshot = undefined;
      await client.saveSettingsCb?.();
      usedFullEnumeration = true;
    }
  } else {
    usedFullEnumeration = true;
  }

  if (usedFullEnumeration) {
    const startUrl = `/drive/special/approot:/${client.remoteBaseDir}:/delta?$top=200`;
    items = await fetchAllPages(startUrl);
  }

  // build the change set (distinguish regular items from deleted ones)
  type DeltaEntry = { item: DriveItem; deleted: boolean };
  const entries: DeltaEntry[] = items.map((item) => ({
    item,
    deleted: (item as Record<string, unknown>).deleted !== undefined,
  }));

  // merge into the snapshot
  let snapshot: Record<string, RemoteItem> =
    client.onedriveConfig.remoteSnapshot ?? {};
  // A deletion we cannot map to a key leaves a ghost entry behind; the merge
  // must then be treated as untrusted instead of silently keeping it.
  let unresolvedDeletion = false;

  for (const entry of entries) {
    // deleted items: remove from the snapshot (deletion detection does not
    // depend on fromDriveItemToRemoteItem succeeding)
    if (entry.deleted) {
      if (!removeDeletedEntryFromSnapshot(snapshot, entry.item, client.remoteBaseDir)) {
        unresolvedDeletion = true;
        log.warn(
          `onedrive delta deletion without usable metadata, snapshot will be rebuilt by a full enumeration: ${JSON.stringify(
            {
              id: entry.item?.id,
              name: entry.item?.name,
              parentPath: entry.item?.parentReference?.path,
            }
          )}`
        );
      }
      continue;
    }

    try {
      const remoteItem = fromDriveItemToRemoteItem(
        entry.item,
        client.remoteBaseDir
      );
      if (remoteItem.key !== "/") {
        snapshot[remoteItem.key] = remoteItem;
      }
    } catch (err) {
      log.warn(
        `skip unrecognized onedrive item while listing remote: ${JSON.stringify(
          {
            name: entry.item?.name,
            parentPath: entry.item?.parentReference?.path,
          }
        )}`,
        err
      );
    }
  }

  if (unresolvedDeletion) {
    // The merge is not trustworthy: an unresolved deletion may have left a
    // ghost key. Invalidate the resume state exactly like the fallback branch
    // above (deltaLink and snapshot are cleared together), so the next listing
    // rebuilds the baseline from a full enumeration instead of carrying it on.
    client.onedriveConfig.deltaLink = "";
    client.onedriveConfig.remoteSnapshot = undefined;
    await client.saveSettingsCb?.();
  } else {
    // persist deltaLink + snapshot
    if (newDeltaLink) {
      client.onedriveConfig.deltaLink = newDeltaLink;
    }
    // only a full enumeration resets the snapshot; delta resume merges
    // incrementally into the existing snapshot
    client.onedriveConfig.remoteSnapshot = snapshot;
    await client.saveSettingsCb?.();
  }

  // return the full Contents
  return {
    Contents: Object.values(snapshot),
  };
};

export const getRemoteMeta = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string
) => {
  await client.init();
  const remotePath = getOnedrivePath(fileOrFolderPath, client.remoteBaseDir);
  const rsp = await client.getJson(
    `${remotePath}?$select=cTag,eTag,fileSystemInfo,folder,file,name,parentReference,size`
  );
  const driveItem = rsp as DriveItem;
  const res = fromDriveItemToRemoteItem(driveItem, client.remoteBaseDir);
  return res;
};

export const uploadToRemote = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string,
  vault: Vault,
  isRecursively: boolean = false,
  password: string = "",
  remoteEncryptedKey: string = "",
  foldersCreatedBefore: Set<string> | undefined = undefined,
  uploadRaw: boolean = false,
  rawContent: string | ArrayBuffer = ""
) => {
  await client.init();

  let uploadFile = fileOrFolderPath;
  if (password !== "") {
    uploadFile = remoteEncryptedKey;
  }
  uploadFile = getOnedrivePath(uploadFile, client.remoteBaseDir);
  log.debug(`uploadFile=${uploadFile}`);

  const isFolder = fileOrFolderPath.endsWith("/");

  if (isFolder && isRecursively) {
    throw Error("upload function doesn't implement recursive function yet!");
  } else if (isFolder && !isRecursively) {
    if (uploadRaw) {
      throw Error(`you specify uploadRaw, but you also provide a folder key!`);
    }
    // folder
    if (password === "") {
      // if not encrypted, mkdir a remote folder
      if (foldersCreatedBefore?.has(uploadFile)) {
        // created, pass
      } else {
        // https://stackoverflow.com/questions/56479865/creating-nested-folders-in-one-go-onedrive-api
        // use PATCH to create folder recursively!!!
        await client.patchJson(uploadFile, {
          folder: {},
          "@microsoft.graph.conflictBehavior": "replace",
        });
      }
      const res = await getRemoteMeta(client, uploadFile);
      return res;
    } else {
      // if encrypted,
      // upload a fake, random-size file
      // with the encrypted file name
      const byteLengthRandom = getRandomIntInclusive(
        1,
        65536 /* max allowed */
      );
      const arrBufRandom = await encryptArrayBuffer(
        getRandomArrayBuffer(byteLengthRandom),
        password
      );

      // an encrypted folder is always small, we just use put here
      await client.putArrayBuffer(
        `${uploadFile}:/content?${new URLSearchParams({
          "@microsoft.graph.conflictBehavior": "replace",
        })}`,
        arrBufRandom
      );
      const res = await getRemoteMeta(client, uploadFile);
      return res;
    }
  } else {
    // file
    // we ignore isRecursively parameter here
    let localContent = undefined;
    if (uploadRaw) {
      if (typeof rawContent === "string") {
        localContent = new TextEncoder().encode(rawContent).buffer;
      } else {
        localContent = rawContent;
      }
    } else {
      localContent = await vault.adapter.readBinary(fileOrFolderPath);
    }
    let remoteContent = localContent;
    if (password !== "") {
      remoteContent = await encryptArrayBuffer(localContent, password);
    }

    // no need to create parent folders firstly, cool!

    // hard code range size
    const MIN_UNIT = 327680; // bytes in msft doc, about 0.32768 MB
    const RANGE_SIZE = MIN_UNIT * 20; // about 6.5536 MB
    const DIRECT_UPLOAD_MAX_SIZE = 1000 * 1000 * 4; // 4 Megabyte

    if (remoteContent.byteLength < DIRECT_UPLOAD_MAX_SIZE) {
      // directly using put!
      await client.putArrayBuffer(
        `${uploadFile}:/content?${new URLSearchParams({
          "@microsoft.graph.conflictBehavior": "replace",
        })}`,
        remoteContent
      );
    } else {
      // upload large files!
      // ref: https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_createuploadsession?view=odsp-graph-online

      // 1. create uploadSession
      // uploadFile already starts with /drive/special/approot:/${remoteBaseDir}
      const s = await client.postJson(
        `${uploadFile}:/createUploadSession`,
        {
          item: {
            "@microsoft.graph.conflictBehavior": "replace",
          },
        }
      ) as unknown as UploadSession;
      const uploadUrl = s.uploadUrl;
      log.debug("uploadSession = ");
      log.debug(s);

      // 2. upload by ranges
      // convert to uint8
      const uint8 = new Uint8Array(remoteContent);

      // upload the ranges one by one
      let rangeStart = 0;
      while (rangeStart < uint8.byteLength) {
        await client.putUint8ArrayByRange(
          uploadUrl,
          uint8,
          rangeStart,
          Math.min(rangeStart + RANGE_SIZE, uint8.byteLength),
          uint8.byteLength
        );
        rangeStart += RANGE_SIZE;
      }
    }

    const res = await getRemoteMeta(client, uploadFile);
    return res;
  }
};

const downloadFromRemoteRaw = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string
): Promise<ArrayBuffer> => {
  await client.init();
  const key = getOnedrivePath(fileOrFolderPath, client.remoteBaseDir);
  const rsp = await client.getJson(
    `${key}?$select=@microsoft.graph.downloadUrl`
  );
  const downloadUrl = rsp["@microsoft.graph.downloadUrl"] as string;
  // `throw: false`: requestUrl would otherwise throw `Request failed, status
  // 404`, an error without `status`/`code`, which the sync engine cannot tell
  // apart from auth/throttling failures. Report it in the same shape as
  // oneDriveApiRequest so a gone item (404/itemNotFound) is recognised.
  const resp = await requestUrl({
    url: downloadUrl,
    headers: { "Cache-Control": "no-cache" },
    throw: false,
  });
  if (!isHttpSuccessStatus(resp.status)) {
    // Use the approot path (not the signed download URL) in the message so the
    // notice/log stays readable and no temporary token leaks into it.
    // Pass only `resp.text`: `resp.json` is a lazy getter in Obsidian that
    // throws on a non-JSON error page, which would replace this error with one
    // lacking `status`. buildRemoteApiError re-parses the text instead.
    throw buildRemoteApiError("GET", key, resp.status, null, resp.text);
  }
  return resp.arrayBuffer;
};

export const downloadFromRemote = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string,
  vault: Vault,
  mtime: number,
  password: string = "",
  remoteEncryptedKey: string = "",
  skipSaving: boolean = false
) => {
  await client.init();

  const isFolder = fileOrFolderPath.endsWith("/");

  if (!skipSaving) {
    await mkdirpInVault(fileOrFolderPath, vault);
  }

  if (isFolder) {
    // mkdirp locally is enough
    // do nothing here
    return new ArrayBuffer(0);
  } else {
    let downloadFile = fileOrFolderPath;
    if (password !== "") {
      downloadFile = remoteEncryptedKey;
    }
    downloadFile = getOnedrivePath(downloadFile, client.remoteBaseDir);
    const remoteContent = await downloadFromRemoteRaw(client, downloadFile);
    let localContent = remoteContent;
    if (password !== "") {
      localContent = await decryptArrayBuffer(remoteContent, password);
    }
    if (!skipSaving) {
      await vault.adapter.writeBinary(fileOrFolderPath, localContent, {
        mtime: mtime,
      });
    }
    return localContent;
  }
};

export const deleteFromRemote = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string,
  password: string = "",
  remoteEncryptedKey: string = ""
) => {
  if (fileOrFolderPath === "/") {
    return;
  }
  let remoteFileName = fileOrFolderPath;
  if (password !== "") {
    remoteFileName = remoteEncryptedKey;
  }
  remoteFileName = getOnedrivePath(remoteFileName, client.remoteBaseDir);

  await client.init();
  await client.deleteJson(remoteFileName);
};

/**
 * Drop one key from the persisted OneDrive remote snapshot.
 * Used for self-healing when the remote item is confirmed gone (404/410):
 * without this the stale key keeps coming back as "new remote content" and
 * every later sync retries a download that can only fail.
 */
export const removeFromRemoteSnapshot = async (
  client: WrappedOnedriveClient,
  key: string
): Promise<void> => {
  const snapshot = client.onedriveConfig.remoteSnapshot;
  if (snapshot === undefined || snapshot[key] === undefined) {
    return;
  }
  delete snapshot[key];
  await client.saveSettingsCb?.();
};

export const checkConnectivity = async (
  client: WrappedOnedriveClient,
  callbackFunc?: (err?: unknown) => void
) => {
  try {
    const k = await getUserDisplayName(client);
    return k !== "<unknown display name>";
  } catch (err) {
    log.debug(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
};

export const getUserDisplayName = async (client: WrappedOnedriveClient) => {
  await client.init();
  const res = await client.getJson("/me?$select=displayName") as User;
  return res.displayName || "<unknown display name>";
};

/**
 *
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-protocols-oidc#send-a-sign-out-request
 * https://docs.microsoft.com/en-us/graph/api/user-revokesigninsessions
 * https://docs.microsoft.com/en-us/graph/api/user-invalidateallrefreshtokens
 * @param client
 */
// export const revokeAuth = async (client: WrappedOnedriveClient) => {
//   await client.init();
//   await client.postJson('/me/revokeSignInSessions', {});
// };

export const getRevokeAddr = async () => {
  return "https://account.live.com/consent/manage";
};
