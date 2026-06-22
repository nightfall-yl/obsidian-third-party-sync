import { Buffer } from "buffer";
import { Queue } from "@fyears/tsqueue";
// Use sub-module path to avoid Node.js-specific code in main entry on Android WebView
import { getReasonPhrase } from "http-status-codes/build/cjs/utils-functions";
import { requestUrl, Platform } from "obsidian";
import { VALID_REQURL, WebdavConfig } from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import { bufferToArrayBuffer, mkdirpInVault } from "./misc";

import { log } from "./moreOnLog";

import type {
  FileStat,
  WebDAVClient,
  Response,
  ResponseDataDetailed,
} from "webdav";
// @ts-ignore -- explicit path to browser build ensures same instance as createClient
import { getPatcher } from "webdav/dist/web/index.js";

// Helper: lowercase all keys of an object (same as upstream)
const objKeyToLower = (obj: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])
  );

// Helper: check if string contains only ISO-8859-1 chars (same as upstream)
const onlyAscii = (s: string): boolean =>
  !/[^\u0000-\u00ff]/g.test(s);

if (VALID_REQURL) {
  getPatcher().patch(
    "request",
    async (
      options: Record<string, unknown>
    ): Promise<Response> => {
      // Lowercase all header keys (same as upstream)
      const transformedHeaders = objKeyToLower(
        options.headers as Record<string, string>
      );
      delete transformedHeaders["host"];
      delete transformedHeaders["content-length"];

      const reqContentType =
        transformedHeaders["accept"] ?? transformedHeaders["content-type"];

      const p: Parameters<typeof requestUrl>[0] = {
        url: options.url as string,
        method: options.method as string,
        body: options.data as string | ArrayBuffer,
        headers: transformedHeaders,
        contentType: reqContentType,
        throw: false,
      };

      let r = await requestUrl(p);

      // iOS 401 hack (same as upstream)
      if (
        r.status === 401 &&
        Platform.isIosApp &&
        !(options.url as string).endsWith("/") &&
        !(options.url as string).endsWith(".md") &&
        options.method?.toString().toUpperCase() === "PROPFIND"
      ) {
        p.url = `${options.url}/`;
        r = await requestUrl(p);
      }

      // Lowercase response header keys, encode non-ASCII values (same as upstream)
      const rspHeaders = objKeyToLower(r.headers as Record<string, string>);
      for (const key in rspHeaders) {
        if (rspHeaders.hasOwnProperty(key)) {
          // avoid: Failed to read 'headers' property from 'ResponseInit':
          // String contains non ISO-8859-1 code point
          if (!onlyAscii(rspHeaders[key])) {
            rspHeaders[key] = encodeURIComponent(rspHeaders[key]);
          }
        }
      }

      const statusText = getReasonPhrase(r.status);
      // Use new Response() to create a standard Response object
      // (same approach as remotely-save upstream)
      if ([101, 103, 204, 205, 304].includes(r.status)) {
        return new Response(null, {
          status: r.status,
          statusText,
          headers: rspHeaders,
        });
      }
      return new Response(r.arrayBuffer, {
        status: r.status,
        statusText,
        headers: rspHeaders,
      });
    }
  );
}
// @ts-ignore -- explicit path to browser build ensures same instance as getPatcher
import { AuthType, BufferLike, createClient } from "webdav/dist/web/index.js";
export type { WebDAVClient } from "webdav";

export const DEFAULT_WEBDAV_CONFIG = {
  address: "",
  username: "",
  password: "",
  authType: "basic",
  manualRecursive: false,
  depth: "auto_unknown",
  remoteBaseDir: "",
} as WebdavConfig;

const getWebdavPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    key = `/${remoteBaseDir}/`;
  }
  if (!fileOrFolderPath.startsWith("/")) {
    key = `/${remoteBaseDir}/${fileOrFolderPath}`;
  }
  return key;
};

const getNormPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  // Primary: current remoteBaseDir
  if (
    fileOrFolderPath === `/${remoteBaseDir}` ||
    fileOrFolderPath.startsWith(`/${remoteBaseDir}/`)
  ) {
    return fileOrFolderPath.slice(`/${remoteBaseDir}/`.length);
  }

  // Compat: strip legacy "Remotely Save / Remotely Secure / Remotely Sync"
  // app sub-folders so old remote metadata can still be parsed
  // e.g. /Remotely Save/<vault>/<file>  or  /Remotely Sync/<vault>/<file>
  const LEGACY_APP_FOLDER_REGEX =
    /^\/Remotely (?:Save|Secure|Sync)\/[^/]+\//;
  const legacyMatch = fileOrFolderPath.match(LEGACY_APP_FOLDER_REGEX);
  if (legacyMatch !== null) {
    return fileOrFolderPath.slice(legacyMatch[0].length);
  }

  throw Error(
    `"${fileOrFolderPath}" doesn't starts with "/${remoteBaseDir}/" and is not a recognized legacy path`
  );
};

const fromWebdavItemToRemoteItem = (x: FileStat, remoteBaseDir: string) => {
  let key = getNormPath(x.filename, remoteBaseDir);
  if (x.type === "directory" && !key.endsWith("/")) {
    key = `${key}/`;
  }
  return {
    key: key,
    lastModified: Date.parse(x.lastmod).valueOf(),
    size: x.size,
    remoteType: "webdav",
    etag: x.etag || undefined,
  } as RemoteItem;
};

export class WrappedWebdavClient {
  webdavConfig: WebdavConfig;
  remoteBaseDir: string;
  client: WebDAVClient;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<unknown>;
  constructor(
    webdavConfig: WebdavConfig,
    remoteBaseDir: string,
    saveUpdatedConfigFunc: () => Promise<unknown>
  ) {
    this.webdavConfig = webdavConfig;
    this.remoteBaseDir = remoteBaseDir;
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
  }

  init = async () => {
    // init client if not inited
    const headers = {
      "Cache-Control": "no-cache",
    };
    if (this.client === undefined) {
      if (
        this.webdavConfig.username !== "" &&
        this.webdavConfig.password !== ""
      ) {
        this.client = createClient(this.webdavConfig.address, {
          username: this.webdavConfig.username,
          password: this.webdavConfig.password,
          headers: headers,
          authType:
            this.webdavConfig.authType === "digest"
              ? AuthType.Digest
              : AuthType.Password,
        });
      } else {
        this.client = createClient(this.webdavConfig.address, {
          headers: headers,
        });
      }
    }

    // check vault folder
    if (this.vaultFolderExists) {
      // pass
    } else {
      const res = await this.client.exists(`/${this.remoteBaseDir}/`);
      if (res) {
        this.vaultFolderExists = true;
      } else {
        await this.client.createDirectory(`/${this.remoteBaseDir}/`);
        this.vaultFolderExists = true;
      }
    }

    // adjust depth parameter
    if (this.webdavConfig.depth === "auto_unknown") {
      let testPassed = false;
      try {
        const res = await this.client.customRequest(
          `/${this.remoteBaseDir}/`,
          {
            method: "PROPFIND",
            headers: {
              Depth: "infinity",
            },
            responseType: "text",
          } as Parameters<typeof this.client.customRequest>[1]
        );
        if (res.status === 403) {
          throw Error("not support Infinity, get 403");
        } else {
          testPassed = true;
          this.webdavConfig.depth = "auto_infinity";
          this.webdavConfig.manualRecursive = false;
        }
      } catch {
        testPassed = false;
      }
      if (!testPassed) {
        try {
          await this.client.customRequest(
            `/${this.remoteBaseDir}/`,
            {
              method: "PROPFIND",
              headers: {
                Depth: "1",
              },
              responseType: "text",
            } as unknown as Parameters<typeof this.client.customRequest>[1]
          );
          testPassed = true;
          this.webdavConfig.depth = "auto_1";
          this.webdavConfig.manualRecursive = true;
        } catch {
          testPassed = false;
        }
      }
      if (testPassed) {
        // the depth option has been changed
        // save the setting
        if (this.saveUpdatedConfigFunc !== undefined) {
          await this.saveUpdatedConfigFunc();
        }
      }
    }
  };
}

export const getWebdavClient = (
  webdavConfig: WebdavConfig,
  remoteBaseDir: string,
  saveUpdatedConfigFunc: () => Promise<unknown>
) => {
  return new WrappedWebdavClient(
    webdavConfig,
    remoteBaseDir,
    saveUpdatedConfigFunc
  );
};

export const getRemoteMeta = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string
) => {
  await client.init();
  const remotePath = getWebdavPath(fileOrFolderPath, client.remoteBaseDir);
  const res = (await client.client.stat(remotePath, {
      details: false,
    })) as FileStat;
  return fromWebdavItemToRemoteItem(res, client.remoteBaseDir);
};

export const uploadToRemote = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string,
  vault: Vault,
  isRecursively: boolean = false,
  password: string = "",
  remoteEncryptedKey: string = "",
  uploadRaw: boolean = false,
  rawContent: string | ArrayBuffer = ""
) => {
  await client.init();
  let uploadFile = fileOrFolderPath;
  if (password !== "") {
    uploadFile = remoteEncryptedKey;
  }
  uploadFile = getWebdavPath(uploadFile, client.remoteBaseDir);

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
      await client.client.createDirectory(uploadFile, {
          recursive: false, // the sync algo should guarantee no need to recursive
        });
      const res = await getRemoteMeta(client, uploadFile);
      return res;
    } else {
      // if encrypted, upload a fake file with the encrypted file name
      await client.client.putFileContents(uploadFile, "", {
          overwrite: true,
        });

      return await getRemoteMeta(client, uploadFile);
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
    // updated 20220326: the algorithm guarantee this
    // // we need to create folders before uploading
    // const dir = getPathFolder(uploadFile);
    // if (dir !== "/" && dir !== "") {
    //   await client.client.createDirectory(dir, { recursive: false });
    // }
    await client.client.putFileContents(uploadFile, remoteContent, {
        overwrite: true,
      });

    return await getRemoteMeta(client, uploadFile);
  }
};

export const listFromRemote = async (
  client: WrappedWebdavClient,
  prefix?: string
) => {
  if (prefix !== undefined) {
    throw Error("prefix not supported");
  }
  await client.init();

  let contents = [] as FileStat[];
  if (
    client.webdavConfig.depth === "auto_1" ||
    client.webdavConfig.depth === "manual_1"
  ) {
    // the remote doesn't support infinity propfind,
    // we need to do a bfs here
    const q = new Queue([`/${client.remoteBaseDir}`]);
    const CHUNK_SIZE = 2;
    const chunk = <T>(arr: T[], size: number): T[][] =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
      );
    while (q.length > 0) {
      const itemsToFetch = [];
      while (q.length > 0) {
        itemsToFetch.push(q.pop());
      }
      const itemsToFetchChunks = chunk(itemsToFetch, CHUNK_SIZE);
      // log.debug(itemsToFetchChunks);
      const subContents = [] as FileStat[];
      for (const singleChunk of itemsToFetchChunks) {
        const r = singleChunk.map(async (x) => {
          return client.client.getDirectoryContents(x, {
              deep: false,
              details: false /* no need for verbose details here */,
              // TODO: to support .obsidian,
              // we need to load all files including dot,
              // anyway to reduce the resources?
              // glob: "/**" /* avoid dot files by using glob */,
            })
        });
        const r2 = (await Promise.all(r)).flat();
        subContents.push(...r2);
      }
      for (let i = 0; i < subContents.length; ++i) {
        const f = subContents[i];
        contents.push(f);
        if (f.type === "directory") {
          q.push(f.filename);
        }
      }
    }
  } else {
    // the remote supports infinity propfind
    contents = await client.client.getDirectoryContents(`/${client.remoteBaseDir}`, {
        deep: true,
        details: false /* no need for verbose details here */,
        // TODO: to support .obsidian,
        // we need to load all files including dot,
        // anyway to reduce the resources?
        // glob: "/**" /* avoid dot files by using glob */,
      });
  }
  const unifiedContents: RemoteItem[] = [];
  for (const x of contents) {
    // skip the root vault folder itself
    if (
      x.filename === `/${client.remoteBaseDir}` ||
      x.filename === `/${client.remoteBaseDir}/`
    ) {
      continue;
    }
    try {
      unifiedContents.push(fromWebdavItemToRemoteItem(x, client.remoteBaseDir));
    } catch (err) {
      log.warn(
        `skip unrecognized webdav item while listing remote: ${JSON.stringify({
          filename: x?.filename,
          type: x?.type,
        })}`,
        err
      );
    }
  }
  return {
    Contents: unifiedContents,
  };
};

const downloadFromRemoteRaw = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string
) => {
  await client.init();
  const buff = (await client.client.getFileContents(
    getWebdavPath(fileOrFolderPath, client.remoteBaseDir)
  )) as BufferLike;
  if (buff instanceof ArrayBuffer) {
    return buff;
  } else if (buff instanceof Uint8Array) {
    return bufferToArrayBuffer(buff);
  }
  throw Error(`unexpected file content result with type ${typeof buff}`);
};

export const downloadFromRemote = async (
  client: WrappedWebdavClient,
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

  // the file is always local file
  // we need to encrypt it

  if (isFolder) {
    // mkdirp locally is enough
    // do nothing here
    return new ArrayBuffer(0);
  } else {
    let downloadFile = fileOrFolderPath;
    if (password !== "") {
      downloadFile = remoteEncryptedKey;
    }
    downloadFile = getWebdavPath(downloadFile, client.remoteBaseDir);
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
  client: WrappedWebdavClient,
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
  remoteFileName = getWebdavPath(remoteFileName, client.remoteBaseDir);

  await client.init();
  try {
    await client.client.deleteFile(remoteFileName);
  } catch (err) {
    log.warn("some error while deleting", err);
  }
};

export const checkConnectivity = async (
  client: WrappedWebdavClient,
  callbackFunc?: (err?: string) => void
) => {
  if (
    !(
      client.webdavConfig.address.startsWith("http://") ||
      client.webdavConfig.address.startsWith("https://")
    )
  ) {
    const err = "Error: the url should start with http(s):// but it does not!";
    log.debug(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
  try {
    await client.init();
    const results = await getRemoteMeta(client, "/");
    if (results === undefined) {
      const err = "results is undefined";
      log.debug(err);
      if (callbackFunc !== undefined) {
        callbackFunc(err);
      }
      return false;
    }
    return true;
  } catch (err: unknown) {
    log.debug(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err instanceof Error ? err.message : JSON.stringify(err) ?? "unknown error");
    }
    return false;
  }
};
