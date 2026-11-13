/**
 * Token 持久化：Obsidian SecretStorage + data.json 兼容迁移
 *
 * SecretStorage 在桌面端走系统钥匙串（macOS Keychain / Windows Credential Manager），
 * 移动端走平台安全存储。这比把 token 写进 data.json 安全得多。
 *
 * 迁移策略：
 *   首次加载 —— 若 SecretStorage 为空但 data.json 的 onedriveConfig 里有 token
 *              → 自动迁入 SecretStorage，并将 data.json 里的 token 字段清空（仅首次）。
 *   后续加载 —— 只读 SecretStorage，data.json 里的 token 永远为空。
 */
import type { App } from "obsidian";
import type { OnedriveConfig } from "./baseTypes";
import { log } from "./moreOnLog";

const SECRET_KEYS = {
  accessToken: "third-party-sync-onedrive-access-token",
  refreshToken: "third-party-sync-onedrive-refresh-token",
  expiresAt: "third-party-sync-onedrive-expires-at",
  expiresIn: "third-party-sync-onedrive-expires-in",
} as const;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // 毫秒时间戳
  expiresIn: number; // 秒
}

/**
 * 读写 SecretStorage 的 token 管理器。
 *
 * 生命周期：在 Plugin.onload 时初始化，每次鉴权成功后 setTokens，
 * revokeAuth 时 clearTokens。MyAuthProvider.getAccessToken 每次按需 getAccessToken。
 */
export class TokenStorage {
  private app: App | null = null;
  private tokens: StoredTokens | null = null;

  /**
   * 初始化并尝试从 SecretStorage 加载。
   * 若 SecretStorage 为空而 data.json 的 legacy 里有值，自动迁移。
   *
   * @param app       Obsidian App 实例（拿 secretStorage）
   * @param legacyCfg data.json 里现有的 onedriveConfig（仅用于首次迁移）
   * @param onMigrate 迁移成功后的回调，用于清空 data.json 的 token 字段
   */
  async initialize(
    app: App,
    legacyCfg: OnedriveConfig,
    onMigrate?: () => Promise<void>
  ): Promise<void> {
    this.app = app;

    // 1) 先读 SecretStorage
    const fromStorage = this.readFromSecretStorage();
    if (fromStorage) {
      this.tokens = fromStorage;
      log.debug("TokenStorage: loaded from SecretStorage");
      return;
    }

    // 2) SecretStorage 为空，尝试从 legacy 迁移
    const legacy = this.extractLegacyTokens(legacyCfg);
    if (legacy) {
      this.tokens = legacy;
      this.writeToSecretStorage(legacy);
      log.info(
        "TokenStorage: migrated legacy tokens from data.json → SecretStorage"
      );
      try {
        await onMigrate?.();
        log.info("TokenStorage: legacy token fields cleared from data.json");
      } catch (err) {
        log.warn("TokenStorage: failed to clear legacy fields", err);
      }
      return;
    }

    // 3) 两边都没有 —— 未鉴权状态
    this.tokens = null;
    log.debug("TokenStorage: no tokens found (not authenticated)");
  }

  /** 新鉴权成功后存入 */
  setTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    const expiresAt = Date.now() + expiresIn * 1000;
    this.tokens = {
      accessToken,
      refreshToken,
      expiresAt,
      expiresIn,
    };
    if (this.app) {
      this.writeToSecretStorage(this.tokens);
    }
    log.debug(
      `TokenStorage: tokens stored (expiresIn=${expiresIn}s, refresh=${refreshToken ? "yes" : "no"})`
    );
  }

  getAccessToken(): string | undefined {
    return this.tokens?.accessToken || undefined;
  }

  getRefreshToken(): string | undefined {
    return this.tokens?.refreshToken || undefined;
  }

  getExpiresAt(): number {
    return this.tokens?.expiresAt ?? 0;
  }

  /** 是否有可用的 access token */
  hasTokens(): boolean {
    return !!this.tokens && !!this.tokens.accessToken;
  }

  /**
   * access token 是否已过期（或在 bufferMs 内即将过期）。
   * 默认 120s buffer，与 Astra 保持一致。
   */
  isAccessTokenExpired(bufferMs = 120_000): boolean {
    if (!this.tokens) return true;
    return Date.now() + bufferMs >= this.tokens.expiresAt;
  }

  /** 撤回鉴权时清理（同时清 SecretStorage 和内存） */
  clearTokens(): void {
    this.tokens = null;
    if (this.app) {
      try {
        this.app.secretStorage.setSecret(SECRET_KEYS.accessToken, "");
        this.app.secretStorage.setSecret(SECRET_KEYS.refreshToken, "");
        this.app.secretStorage.setSecret(SECRET_KEYS.expiresAt, "");
        this.app.secretStorage.setSecret(SECRET_KEYS.expiresIn, "");
        log.debug("TokenStorage: SecretStorage cleared");
      } catch (err) {
        // SecretStorage 清失败不致命，data.json 里已经会被同时清空
        log.warn("TokenStorage: failed to clear SecretStorage", err);
      }
    }
  }

  // ─────────────────────────── private ───────────────────────────

  private readFromSecretStorage(): StoredTokens | null {
    if (!this.app) return null;
    const at = this.app.secretStorage.getSecret(SECRET_KEYS.accessToken);
    const rt = this.app.secretStorage.getSecret(SECRET_KEYS.refreshToken);
    const expiresAtStr = this.app.secretStorage.getSecret(SECRET_KEYS.expiresAt);
    const expiresInStr = this.app.secretStorage.getSecret(SECRET_KEYS.expiresIn);
    if (!at || !rt || !expiresAtStr) return null;
    const expiresAt = Number(expiresAtStr);
    const expiresIn = expiresInStr ? Number(expiresInStr) : 3600;
    if (
      !Number.isFinite(expiresAt) ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      return null;
    }
    return { accessToken: at, refreshToken: rt, expiresAt, expiresIn };
  }

  private writeToSecretStorage(tokens: StoredTokens): void {
    if (!this.app) return;
    try {
      this.app.secretStorage.setSecret(SECRET_KEYS.accessToken, tokens.accessToken);
      this.app.secretStorage.setSecret(SECRET_KEYS.refreshToken, tokens.refreshToken);
      this.app.secretStorage.setSecret(
        SECRET_KEYS.expiresAt,
        String(tokens.expiresAt)
      );
      this.app.secretStorage.setSecret(
        SECRET_KEYS.expiresIn,
        String(tokens.expiresIn)
      );
    } catch (err) {
      log.error("TokenStorage: writeToSecretStorage failed", err);
    }
  }

  /** 从 data.json 的 OnedriveConfig 里取出旧的 token（仅作迁移源） */
  private extractLegacyTokens(cfg: OnedriveConfig): StoredTokens | null {
    if (!cfg.accessToken || !cfg.refreshToken) return null;
    return {
      accessToken: cfg.accessToken,
      refreshToken: cfg.refreshToken,
      expiresAt: cfg.accessTokenExpiresAtTime || Date.now(),
      expiresIn: cfg.accessTokenExpiresInSeconds || 3600,
    };
  }
}
