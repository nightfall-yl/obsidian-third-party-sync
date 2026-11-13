/**
 * OAuth 2.0 Device Code Flow (RFC 8628) for OneDrive personal accounts.
 *
 * 与授权码 + PKCE 相比，设备码流程不需要 obsidian:// 重定向回调：
 * 桌面端与移动端都只依赖 requestUrl()，无需注册协议处理器，
 * 也不会出现「浏览器没跳回 Obsidian」的失败场景。
 *
 * 流程：
 *   ① POST /oauth2/v2.0/devicecode → 拿到 device_code / user_code / verification_uri
 *   ② 用户在浏览器打开 verification_uri 并输入 user_code 完成授权
 *   ③ 插件后台轮询 POST /oauth2/v2.0/token (grant_type=device_code) → 拿到 token
 */
import { requestUrl } from "obsidian";

import { log } from "./moreOnLog";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number; // 秒
  interval: number; // 建议轮询间隔（秒）
  message?: string;
}

export interface TokenResponse {
  token_type: "Bearer" | "bearer";
  expires_in: number;
  access_token: string;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/**
 * 语义化错误码：真正给用户看的文案由调用方按 i18n 渲染，
 * 这里只负责把 Entra / OAuth 的原始错误归类。
 */
export type AuthErrorCode =
  | "personal_only"
  | "code_expired"
  | "declined"
  | "cancelled"
  | "network"
  | "other";

export class AuthenticationError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
  }
}

export interface OAuthEndpoints {
  deviceCode: string;
  token: string;
}

export interface DeviceCodeFlowClientOptions {
  clientId: string;
  endpoints: OAuthEndpoints;
  scopes: string[];
}

export class DeviceCodeFlowClient {
  private cancelled = false;

  constructor(private readonly options: DeviceCodeFlowClientOptions) {}

  /** 取消进行中的轮询（用户关闭授权弹窗时调用） */
  cancelPolling(): void {
    this.cancelled = true;
  }

  /** Step 1: 请求设备码。返回用户要在浏览器里输入的 user_code。 */
  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    let resp;
    try {
      resp = await requestUrl({
        url: this.options.endpoints.deviceCode,
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        // 不抛错：Entra 把 AADSTS 错误码放在响应体里，必须读 body 才能分类
        throw: false,
        body: new URLSearchParams({
          client_id: this.options.clientId,
          scope: this.options.scopes.join(" "),
        }).toString(),
      });
    } catch (err) {
      throw new AuthenticationError(
        "network",
        err instanceof Error ? err.message : String(err)
      );
    }

    if (resp.status !== 200) {
      const body = safeParseBody(resp.text);
      throw new AuthenticationError(
        classifyError(body.error, body.error_description),
        body.error_description || body.error || `HTTP ${resp.status}`
      );
    }

    const data = resp.json as unknown as DeviceCodeResponse;
    log.debug(
      `DeviceCodeFlow: device code received (expires=${data.expires_in}s, interval=${data.interval}s)`
    );
    return data;
  }

  /**
   * Step 3: 轮询 token 端点，直到用户完成授权、设备码过期或遇到不可恢复错误。
   *
   * @param onPending 每次仍在等待（authorization_pending / 网络抖动）时回调，供 UI 刷新
   */
  async pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number,
    onPending?: () => void
  ): Promise<TokenResponse> {
    this.cancelled = false;
    const expiresAt = Date.now() + expiresIn * 1000;

    // 连续网络错误阈值：超过就放弃，而不是傻等设备码过期
    const MAX_NETWORK_ERRORS = 5;
    let networkErrorStreak = 0;

    while (Date.now() < expiresAt) {
      if (this.cancelled) {
        throw new AuthenticationError("cancelled", "authorization cancelled");
      }

      let resp;
      try {
        resp = await requestUrl({
          url: this.options.endpoints.token,
          method: "POST",
          contentType: "application/x-www-form-urlencoded",
          throw: false,
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            client_id: this.options.clientId,
            device_code: deviceCode,
          }).toString(),
        });
      } catch (err) {
        // 纯网络异常（拿不到 HTTP 响应）才计入 streak
        networkErrorStreak++;
        log.warn(
          `DeviceCodeFlow: network error (${networkErrorStreak}/${MAX_NETWORK_ERRORS})`,
          err instanceof Error ? err.message : String(err)
        );
        if (networkErrorStreak >= MAX_NETWORK_ERRORS) {
          throw new AuthenticationError(
            "network",
            err instanceof Error ? err.message : String(err)
          );
        }
        onPending?.();
        await sleep(interval * 1000);
        continue;
      }

      // 有 HTTP 响应 → 网络是通的
      networkErrorStreak = 0;

      if (resp.status === 200) {
        const data = resp.json as unknown as TokenResponse;
        log.info("DeviceCodeFlow: token obtained");
        return data;
      }

      const body = safeParseBody(resp.text);
      switch (body.error) {
        case undefined:
        case "":
          // 没有标准 OAuth 错误字段，按通用失败处理
          throw new AuthenticationError(
            "other",
            body.error_description || `HTTP ${resp.status}`
          );
        case "authorization_pending":
          onPending?.();
          break;
        case "slow_down":
          interval += 5;
          break;
        case "authorization_declined":
        case "access_denied":
          throw new AuthenticationError("declined", body.error_description || body.error);
        case "expired_token":
          throw new AuthenticationError("code_expired", body.error_description || body.error);
        default: {
          const classified = classifyError(body.error, body.error_description);
          throw new AuthenticationError(
            classified,
            body.error_description || body.error || `HTTP ${resp.status}`
          );
        }
      }

      await sleep(interval * 1000);
    }

    throw new AuthenticationError("code_expired", "device code expired");
  }

  /** 用 refresh_token 换一对新的 token（access_token + 新 refresh_token） */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    log.debug("DeviceCodeFlow: refreshing access token");
    let resp;
    try {
      resp = await requestUrl({
        url: this.options.endpoints.token,
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        throw: false,
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.options.clientId,
          refresh_token: refreshToken,
        }).toString(),
      });
    } catch (err) {
      throw new AuthenticationError(
        "network",
        err instanceof Error ? err.message : String(err)
      );
    }

    if (resp.status !== 200) {
      const body = safeParseBody(resp.text);
      throw new AuthenticationError(
        classifyError(body.error, body.error_description),
        body.error_description || body.error || `HTTP ${resp.status}`
      );
    }

    const data = resp.json as unknown as TokenResponse;
    log.debug("DeviceCodeFlow: token refreshed");
    return data;
  }
}

/** 把 Entra AADSTS 码与 OAuth error 归类成四种语义（其余落到 other） */
function classifyError(oauthError?: string, description?: string): AuthErrorCode {
  const desc = description ?? "";

  // 企业/学校账号不可用（本插件只支持个人账号）
  if (
    desc.includes("AADSTS50152") ||
    desc.includes("AADSTS70002") ||
    desc.includes("AADSTS50020") ||
    desc.includes("AADSTS50026")
  ) {
    return "personal_only";
  }

  // 设备码失效 / 已被使用
  if (desc.includes("AADSTS50166") || desc.includes("AADSTS50194")) {
    return "code_expired";
  }

  switch (oauthError) {
    case "access_denied":
    case "authorization_declined":
      return "declined";
    case "expired_token":
      return "code_expired";
    case "temporarily_unavailable":
      return "network";
    default:
      return "other";
  }
}

/** resp.json 是惰性 getter，非 JSON 响应体会抛错；这里只读 text 手动解析 */
function safeParseBody(text: string): {
  error?: string;
  error_description?: string;
} {
  try {
    return JSON.parse(text) as { error?: string; error_description?: string };
  } catch {
    return {};
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
