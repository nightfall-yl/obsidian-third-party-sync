import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import type {
  DriveItem,
  UploadSession,
  User,
} from "@microsoft/microsoft-graph-types";
import { requestUrl, RequestUrlParam, Vault } from "obsidian";
import {
  COMMAND_CALLBACK_ONEDRIVE,
  DEFAULT_CONTENT_TYPE,
  OAUTH2_FORCE_EXPIRE_MILLISECONDS,
  OnedriveConfig,
  RemoteItem,
} from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import {
  bufferToArrayBuffer,
  getRandomArrayBuffer,
  getRandomIntInclusive,
  mkdirpInVault,
  encodeBase64,
} from "./misc";

import { log } from "./moreOnLog";

const SCOPES = ["User.Read", "Files.ReadWrite.AppFolder", "offline_access"];
const REDIRECT_URI = `obsidian://${COMMAND_CALLBACK_ONEDRIVE}`;
const ONEDRIVE_AUTH_TIMEOUT_MS = 30000;

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
// Onedrive authorization using PKCE
////////////////////////////////////////////////////////////////////////////////

// Helper functions for PKCE
async function generateCodeVerifier(): Promise<string> {
  const arrayBuffer = new Uint8Array(32);
  const crypto = (typeof window !== 'undefined' && window.crypto);
  if (!crypto || !crypto.getRandomValues) {
    throw new Error('Crypto API not available');
  }
  crypto.getRandomValues(arrayBuffer);
  return encodeBase64(String.fromCharCode(...arrayBuffer))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const crypto = (typeof window !== 'undefined' && window.crypto);
  if (!crypto || !crypto.subtle || !crypto.subtle.digest) {
    throw new Error('Crypto subtle API not available');
  }
  const digest = await crypto.subtle.digest('SHA-256', data);
  return encodeBase64(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function getAuthUrlAndVerifier(
  clientID: string,
  authority: string
) {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  // Build OAuth2 authorization URL manually (msal-browser v3 removed getAuthCodeUrl from PublicClientApplication)
  const baseAuthority = authority.replace(/\/$/, ""); // strip trailing slash
  const params = new URLSearchParams({
    client_id: clientID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    response_mode: "query",
  });
  const authCodeUrl = `${baseAuthority}/oauth2/v2.0/authorize?${params.toString()}`;

  return {
    authUrl: authCodeUrl,
    verifier: verifier,
  };
}

/**
 * Check doc from
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
 * https://docs.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online#code-flow
 */
export interface AccessCodeResponseSuccessfulType {
  token_type: "Bearer" | "bearer";
  expires_in: number;
  ext_expires_in?: number;
  scope: string;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
}
export interface AccessCodeResponseFailedType {
  error: string;
  error_description: string;
  error_codes: number[];
  timestamp: string;
  trace_id: string;
  correlation_id: string;
}

export const sendAuthReq = async (
  clientID: string,
  authority: string,
  authCode: string,
  verifier: string
): Promise<AccessCodeResponseSuccessfulType | AccessCodeResponseFailedType> => {
  try {
    // 从 authority URL 提取 tenant
    const authorityUrl = new URL(authority);
    const tenant = authorityUrl.pathname.replace(/^\//, "") || "common";

    const requestPromise = requestUrl({
      url: `${authority.replace(/\/$/, "")}/oauth2/v2.0/token`,
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      // Do NOT throw on non-2xx: we must read the response body to surface the
      // real Azure error_description (AADSTSxxxxx) instead of a bare "400".
      throw: false,
      body: new URLSearchParams({
        tenant: tenant,
        client_id: clientID,
        scope: SCOPES.join(" "),
        code: authCode,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
    }).json;

    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(Error("请求超时（30秒）。请检查网络连接后重试。"));
      }, ONEDRIVE_AUTH_TIMEOUT_MS);
    });

    const rsp = await Promise.race([requestPromise, timeoutPromise]) as AccessCodeResponseSuccessfulType | AccessCodeResponseFailedType;

    if (rsp.error !== undefined) {
      const rspFailed = rsp as AccessCodeResponseFailedType;
      log.debug("OneDrive auth error:", rspFailed);
      const errorMsg = rspFailed.error_description || rspFailed.error || "未知错误";
      return {
        ...rspFailed,
        error_description: errorMsg,
      };
    } else {
      return rsp;
    }
  } catch (err: unknown) {
    log.debug("OneDrive auth request failed:", err);
    const error = err as { response?: { data?: string | Record<string, unknown> }; message?: string };
    // 尝试解析响应体获取更详细的错误信息
    if (error.response && error.response.data) {
      const errorData: Record<string, unknown> = typeof error.response.data === 'string'
        ? JSON.parse(error.response.data) as Record<string, unknown>
        : error.response.data;
      const desc = typeof errorData.error_description === "string" ? errorData.error_description : "";
      const errCode = typeof errorData.error === "string" ? errorData.error : "";
      throw Error(`Azure API 错误: ${desc || errCode || JSON.stringify(errorData)}`);
    }
    
    throw Error(`网络请求失败: ${err.message || err}`);
  }
};

export const sendRefreshTokenReq = async (
  clientID: string,
  authority: string,
  refreshToken: string
): Promise<AccessCodeResponseSuccessfulType | AccessCodeResponseFailedType> => {
  // also use Obsidian request to bypass CORS issue.
  const body = new URLSearchParams({
    tenant: "consumers",
    client_id: clientID,
    scope: SCOPES.join(" "),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString();
  
  const requestParams: RequestUrlParam = {
    url: `${authority.replace(/\/$/, "")}/oauth2/v2.0/token`,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    throw: false, // surface real Azure error body on non-2xx
    body: body,
  };
  
  const requestPromise = requestUrl(requestParams).json;
  const timeoutPromise = new Promise<never>((_, reject) => {
    window.setTimeout(() => {
      reject(Error("请求超时（30秒）。请检查网络连接后重试。"));
    }, ONEDRIVE_AUTH_TIMEOUT_MS);
  });
  const rsp = await Promise.race([requestPromise, timeoutPromise]) as Record<string, unknown>;

  if (rsp.error !== undefined) {
    return rsp as AccessCodeResponseFailedType;
  } else {
    return rsp as AccessCodeResponseSuccessfulType;
  }
};

export const setConfigBySuccessfullAuthInplace = async (
  config: OnedriveConfig,
  authRes: AccessCodeResponseSuccessfulType,
  saveUpdatedConfigFunc: () => Promise<void> | undefined
) => {
  config.accessToken = authRes.access_token;
  config.accessTokenExpiresAtTime =
    Date.now() + authRes.expires_in * 1000 - 5 * 60 * 1000;
  config.accessTokenExpiresInSeconds = authRes.expires_in;
  config.refreshToken = authRes.refresh_token;

  // manually set it expired after 80 days;
  config.credentialsShouldBeDeletedAtTime =
    Date.now() + OAUTH2_FORCE_EXPIRE_MILLISECONDS;

  if (saveUpdatedConfigFunc !== undefined) {
    await saveUpdatedConfigFunc();
  }
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

// Shared helper for OneDrive Graph API JSON calls.
// Uses `throw: false` so a non-2xx response (e.g. HTTP 400) is returned instead
// of being swallowed by an opaque RequestUrlError, then surfaces the real Graph
// error code/message + HTTP status.
const oneDriveApiRequest = async (
  method: string,
  theUrl: string,
  headers: Record<string, string>,
  body?: string
): Promise<Record<string, unknown>> => {
  const resp = await requestUrl({
    url: theUrl,
    method,
    contentType: "application/json",
    throw: false,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  const json = (resp.json ?? {}) as Record<string, unknown>;
  const o = json as {
    error?: unknown;
    error_description?: string;
    status?: number;
  };

  // Graph errors nest the real cause inside error.innerError:
  //   { "error": { "code":"invalidRequest", "message":"Invalid request",
  //                "innerError": { "code":"...", "message":"..." } } }
  // Recursively walk innerError to surface the actual reason instead of the
  // generic outer message, so the root cause is visible to the user.
  const collectErrorDetail = (node: unknown, depth: number): string => {
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
    if (
      depth < 5 &&
      obj.innerError &&
      typeof obj.innerError === "object"
    ) {
      inner = collectErrorDetail(obj.innerError, depth + 1);
    }
    const joined = parts.filter(Boolean).join(" ");
    return [ joined, inner ].filter(Boolean).join(" → ");
  };

  if (o.error !== undefined || o.error_description !== undefined) {
    let detail = collectErrorDetail(o.error, 0);
    // Try parsing error as a plain string fallback
    if (!detail && typeof o.error === "string") {
      detail = o.error;
    }
    if (o.error_description) {
      detail = detail ? `${detail} — ${o.error_description}` : o.error_description;
    }
    // Always append the RAW response body so any detail we failed to parse
    // (e.g. innerError under a different key, or non-JSON payload) is visible.
    const raw = typeof resp.text === "string" ? resp.text : JSON.stringify(json);
    throw Error(
      `OneDrive API ${method} ${theUrl} 失败 (HTTP ${resp.status}): ${detail || "无解析详情"}\nRAW BODY: ${raw}`
    );
  }
  return json;
};

class MyAuthProvider implements AuthenticationProvider {
  onedriveConfig: OnedriveConfig;
  saveUpdatedConfigFunc: () => Promise<void>;
  constructor(
    onedriveConfig: OnedriveConfig,
    saveUpdatedConfigFunc: () => Promise<void>
  ) {
    this.onedriveConfig = onedriveConfig;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
  }
  getAccessToken = async () => {
    if (
      this.onedriveConfig.accessToken === "" ||
      this.onedriveConfig.refreshToken === ""
    ) {
      throw Error("The user has not manually auth yet.");
    }

    const currentTs = Date.now();
    if (this.onedriveConfig.accessTokenExpiresAtTime > currentTs) {
      return this.onedriveConfig.accessToken;
    } else {
      // use refreshToken to refresh
      const r = await sendRefreshTokenReq(
        this.onedriveConfig.clientID,
        this.onedriveConfig.authority,
        this.onedriveConfig.refreshToken
      );
      if ((r as Record<string, unknown>).error !== undefined) {
        const r2 = r as AccessCodeResponseFailedType;
        throw Error(
          `Error while refreshing accessToken: ${r2.error}, ${String(r2.error_codes)}: ${r2.error_description}`
        );
      }
      const r2 = r as AccessCodeResponseSuccessfulType;
      this.onedriveConfig.accessToken = r2.access_token;
      this.onedriveConfig.refreshToken = r2.refresh_token;
      this.onedriveConfig.accessTokenExpiresInSeconds = r2.expires_in;
      this.onedriveConfig.accessTokenExpiresAtTime =
        currentTs + r2.expires_in * 1000 - 60 * 2 * 1000;
      await this.saveUpdatedConfigFunc();
      return this.onedriveConfig.accessToken;
    }
  };
}

export class WrappedOnedriveClient {
  onedriveConfig: OnedriveConfig;
  remoteBaseDir: string;
  vaultFolderExists: boolean;
  authGetter: MyAuthProvider;
  saveUpdatedConfigFunc: () => Promise<void>;
  constructor(
    onedriveConfig: OnedriveConfig,
    remoteBaseDir: string,
    saveUpdatedConfigFunc: () => Promise<void>
  ) {
    this.onedriveConfig = onedriveConfig;
    this.remoteBaseDir = remoteBaseDir;
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.authGetter = new MyAuthProvider(onedriveConfig, saveUpdatedConfigFunc);
  }

  init = async () => {
    // check token
    if (
      this.onedriveConfig.accessToken === "" ||
      this.onedriveConfig.refreshToken === ""
    ) {
      throw Error("The user has not manually auth yet.");
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
    await requestUrl({
      url: theUrl,
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
      },
    });
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
    console.log(
      `[third-party-sync] PUT ${theUrl} -> HTTP ${resp.status}, bytes=${payload.byteLength}`
    );
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
  saveUpdatedConfigFunc: () => Promise<unknown>
) => {
  return new WrappedOnedriveClient(
    onedriveConfig,
    remoteBaseDir,
    saveUpdatedConfigFunc
  );
};

/**
 * Use delta api to list all files and folders
 * https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_delta?view=odsp-graph-online
 * @param client
 * @param prefix
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

  let res = await client.getJson(
    `/drive/special/approot:/${client.remoteBaseDir}:/delta`
  );
  let driveItems = (res.value as DriveItem[]);

  while (NEXT_LINK_KEY in res) {
    res = await client.getJson(res[NEXT_LINK_KEY] as string);
    driveItems.push(...structuredClone(res.value as DriveItem[]));
  }

  // lastly we should have delta link?
  if (DELTA_LINK_KEY in res) {
    client.onedriveConfig.deltaLink = res[DELTA_LINK_KEY] as string;
    await client.saveUpdatedConfigFunc();
  }

  // unify everything to RemoteItem
  const unifiedContents: RemoteItem[] = [];
  for (const item of driveItems) {
    if ((item as Record<string, unknown>).deleted !== undefined) {
      continue;
    }
    try {
      const normalized = fromDriveItemToRemoteItem(item, client.remoteBaseDir);
      if (normalized.key !== "/") {
        unifiedContents.push(normalized);
      }
    } catch (err) {
      log.warn(
        `skip unrecognized onedrive item while listing remote: ${JSON.stringify(
          {
            name: item?.name,
            parentPath: item?.parentReference?.path,
          }
        )}`,
        err
      );
    }
  }

  return {
    Contents: unifiedContents,
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
  const downloadUrl: string = rsp["@microsoft.graph.downloadUrl"];
  const content = (
    await requestUrl({
      url: downloadUrl,
      headers: { "Cache-Control": "no-cache" },
    })
  ).arrayBuffer;
  return content;
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
  return "https://account.live.com/consent/Manage";
};
