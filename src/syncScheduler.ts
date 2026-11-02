/**
 * 统一自动同步调度器：合并「启动首次运行 / 定时周期 / 保存后触发」
 * 三个来源，用一个定时器 + 一个跨来源仲裁约束来替代原先多个独立定时器。
 *
 * 设计要点：
 * - AUTO_MIN_INTERVAL_MS = 30s 仅用于**跨来源抢占仲裁**：
 *   当 pending 中有 ≥ 2 个不同来源时，后到的被推至前次自动同步后 30 秒；
 *   **同一来源连续触发（trailing debounce）不受约束**
 * - 保存后同步 debounce 时长由外层（main.ts）在 onSaveModified() 调用时传入
 * - 启动首次延迟固定 5 秒，仅在 autoRunEveryMilliseconds > 0 时由 apply 内部注册
 * - 周期 tick 每次跑完整 syncRun，不设"先检测远端、无变化跳过"的门禁
 * - 手动同步不受最小间隔约束；同步进行中所有自动请求被挂起
 * - 对外暴露纯函数，便于独立单测
 *
 * 移植自 obsidian-astra SyncAutoScheduler（nightfall-yl/obsidian-third-party-sync），
 * 3 个独立 source + 跨来源仲裁的 minInterval 口径。
 */

// ─────────────────────────── 常量 ───────────────────────────

/** 跨来源抢占仲裁的最小间隔（毫秒）。手动同步不受此约束；同一来源连续触发不受此约束。 */
export const AUTO_MIN_INTERVAL_MS = 30_000;

// ─────────────────────────── 类型 ───────────────────────────

/**
 * 自动同步的触发来源（传给 syncRun 的 triggerSource 字符串）：
 * - autoOnceInit：启动首次（仅在 autoRunEveryMilliseconds > 0 时由 apply 内部注册）
 * - auto：定时周期（每次 requestRun("auto", 0)）
 * - autoSave：保存后 modify 事件（trailing debounce）
 */
export type AutoSyncSource =
  | "autoOnceInit" // 启动首次（一次性）
  | "auto"         // 定时周期
  | "autoSave";    // 保存后 modify 事件

interface SyncRequest {
  /** 哪个来源（影响 syncRun 的 triggerSource 字符串） */
  source: AutoSyncSource;
  /** 最早可以执行的绝对时间戳；debounce 会不断把这个推远 */
  earliestAt: number;
}

// ─────────────────────────── 纯函数（可单测） ───────────────────────────

/**
 * 计算一次请求实际应当在什么时间执行——考虑最小间隔约束。
 *
 * 规则：
 * 1. 如果 lastAutoSyncAt = -1（从未自动同步过）→ 按 earliestAt 执行，不推远
 * 2. 否则必须 >= lastAutoSyncAt + autoMinIntervalMs
 * 3. 返回 Math.max(earliestAt, minIntervalBoundary)
 *
 * 这是纯粹函数，无副作用，便于直接单测。
 */
export function computeScheduledRunTime(
  requestEarliestAt: number,
  lastAutoSyncAt: number,
  autoMinIntervalMs: number = AUTO_MIN_INTERVAL_MS
): number {
  const minBoundary =
    lastAutoSyncAt <= 0 ? requestEarliestAt : lastAutoSyncAt + autoMinIntervalMs;
  return Math.max(requestEarliestAt, minBoundary);
}

// ─────────────────────────── 类（生产使用） ───────────────────────────

/**
 * 统一自动同步调度器。
 *
 * 使用方式（由 Plugin 持有一个实例）：
 *   scheduler.apply({ initDelayMs, periodMs, saveDebounceMs })
 *     // 一次配置所有来源的开关
 *   scheduler.onSaveModified()      // .md 保存：trailing debounce
 *   scheduler.requestRun("autoRemote", 0) // 远端变更检测发现变化
 *   scheduler.markRunStarted()      // syncRun 开头标记
 *   scheduler.markRunFinished()     // syncRun 结尾标记
 *   scheduler.stop()                // unload / 关闭自动同步
 *
 * 每个 source（定时 / 启动首次 / 保存后 / 远端变更）独立维护自己的 pending，
 * 但真正执行时统一走 computeScheduledRunTime 计算延迟。
 */
export class SyncAutoScheduler {
  /** 唯一挂起的 setTimeout（任何来源被截断会 clear 并重置） */
  private pendingTimer: number | null = null;
  /** 周期 setInterval（开启 periodMs > 0 时注册） */
  private periodTimer: number | null = null;
  /** 自动同步执行过的最后时间戳；-1 = 从未 */
  private lastAutoSyncAt = -1;
  /** 当前挂起的自动请求（按 source 去重：每个 source 只保留 earliestAt 最晚的那个） */
  private pending = new Map<AutoSyncSource, SyncRequest>();
  /** 当前同步执行中：自动请求被挂起直到 finished；但 debounce 计时继续 */
  private syncInProgress = false;
  /** 最近一次 set "要执行的"请求时间（供 debounce 截断判断） */
  private scheduledRunAt = 0;

  constructor(
    /** 自动同步的执行函数；由 Plugin 传入 */
    private readonly runAutoSync: (source: AutoSyncSource) => Promise<void>,
    /** 注入时间函数（生产用 Date.now，单测用 fake now） */
    private readonly getNow: () => number = () => Date.now(),
    /** timer 实现（生产 window.setTimeout/clearTimeout/setInterval；单测注入 fake） */
    private readonly timer: {
      setTimeout: (cb: () => void, ms: number) => number;
      clearTimeout: (id: number) => void;
      setInterval?: (cb: () => void, ms: number) => number;
      clearInterval?: (id: number) => void;
    } = window
  ) {}

  /**
   * 一次配置所有自动同步来源。
   * @param initDelayMs 启动首次延迟（毫秒）；<= 0 时不注册启动首次
   * @param periodMs 定时周期（毫秒）；<= 0 时不注册周期同步
   * @param onPeriodTick 可选钩子：每个周期 tick 先调用。若返回 false 则跳过本次 requestRun，
   *                    用于远端变更检测门禁（listFromRemote + 对比 prevSync，无变化则不触发 syncRun）
   */
  /**
   * 一次配置自动同步：启动首次（periodMs > 0 时，固定 STARTUP_FIRST_DELAY_MS=5s）
   * + 周期运行（setInterval + 每次 requestRun("auto", 0)）。
   * 周期 tick 每次跑完整 syncRun，不设"先检测远端、无变化跳过"的门禁。
   * onChange 或设置关闭时调用 apply(0, 0) 来完全停止。
   *
   * 30s 全局最小间隔（AUTO_MIN_INTERVAL_MS）：
   * 仅用于**跨来源抢占仲裁**——当同一个时刻有两个及以上不同来源处于 pending 时，
   * 后到的（earliestAt 不是最小的那个）被推到前次自动同步后 30 秒。
   * 同一来源连续触发（trailing debounce 推远 earliestAt）不受此下限约束。
   * 手动同步完全不受此下限约束。
   */
  apply(initDelayMs: number, periodMs: number): void {
    this.stop(); // 幂等：先清旧的

    // 启动首次：仅在周期开启时才注册（周期关闭 → 首次也不跑）
    if (periodMs > 0 && initDelayMs > 0) {
      this.requestRun("autoOnceInit", initDelayMs);
    }

    // 周期运行：setInterval + 每次 requestRun("auto", 0)
    if (periodMs > 0 && this.timer.setInterval) {
      this.periodTimer = this.timer.setInterval(() => {
        this.requestRun("auto", 0);
      }, periodMs);
    }
  }

  /**
   * 停止所有自动调度——清空定时器、清空挂起请求。
   * unload 时或用户关闭自动同步时调用。
   */
  stop(): void {
    if (this.pendingTimer !== null) {
      this.timer.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.periodTimer !== null && this.timer.clearInterval) {
      this.timer.clearInterval(this.periodTimer);
      this.periodTimer = null;
    }
    this.pending.clear();
    this.scheduledRunAt = 0;
  }

  /**
   * vault .md modify 事件：触发 trailing debounce 的保存后同步请求。
   * 这是 registerVaultEvents 里 modify handler 应调用的方法。
   * @param debounceMs debounce 延迟（毫秒）；由 settings.syncOnSaveMode 映射而来
   */
  onSaveModified(debounceMs: number): void {
    this.requestRun("autoSave", debounceMs);
  }

  /**
   * 标记自动同步开始。会让挂起的自动请求等待到 run 结束后再继续调度。
   */
  markRunStarted(): void {
    this.syncInProgress = true;
  }

  /**
   * 标记自动同步结束。根据 lastAutoSyncAt 立即重新评估一次挂起请求是否该跑了。
   */
  markRunFinished(): void {
    this.syncInProgress = false;
    this.lastAutoSyncAt = this.getNow();
    // 重新评估挂起请求——minInterval 起点已推到刚刚，大部分会被顺延到 30s 后
    this.reschedule();
  }

  /** 距上次自动同步的剩余最小等待毫秒数（外部可读，供 StatusBar 等使用） */
  getMsUntilNextAuto(): number {
    if (this.pending.size === 0) return -1;
    if (this.syncInProgress) return AUTO_MIN_INTERVAL_MS;
    const now = this.getNow();
    let earliest = Infinity;
    for (const req of this.pending.values()) {
      const scheduled = computeScheduledRunTime(
        req.earliestAt,
        this.lastAutoSyncAt,
        AUTO_MIN_INTERVAL_MS
      );
      if (scheduled < earliest) earliest = scheduled;
    }
    return Math.max(0, earliest - now);
  }

  // ─────────────────────────── 内部 ───────────────────────────

  /**
   * 按来源提交/截断一个请求。
   * debounce 截断语义：同一个 source 再次触发时，只把 earliestAt 推远（不会并行堆积），
   * 但如果新请求比已有的更早（debounce 为 0 的周期触发 vs 推远的保存），则用新的替换旧的。
   */
  private requestRun(source: AutoSyncSource, debounceMs: number): void {
    const now = this.getNow();
    const earliestAt = now + debounceMs;

    // 同 source 的 pending 只保留最晚的 earliestAt（debounce 截断）
    const existing = this.pending.get(source);
    if (existing && existing.earliestAt >= earliestAt) {
      return; // 已有更晚的，忽略这次
    }
    this.pending.set(source, { source, earliestAt });

    // 用最早的 pending 来设定时器（每次都 clear + set，形成 trailing 效果）
    this.reschedule();
  }

  /**
   * 根据 pending + lastAutoSyncAt + syncInProgress 重新设 pendingTimer。
   * syncInProgress 时不设 timer（等 markRunFinished 再算）。
   *
   * 30s 全局最小间隔（AUTO_MIN_INTERVAL_MS）仅用于**跨来源抢占仲裁**：
   * pending.size >= 2 时，对 earliestAt 不是最小的那些 source 应用 minInterval 约束。
   * pending.size === 1 时，完全不应用 minInterval（同一来源 trailing debounce 正常）。
   */
  private reschedule(): void {
    if (this.pending.size === 0) return;
    if (this.syncInProgress) return; // 执行中，等 finished 再算

    const now = this.getNow();

    // 挑最早的 pending 作为当前要跑的（多 source 之间谁先到谁执行）
    let earliestReq: SyncRequest | null = null;
    let earliestAt = Infinity;
    for (const req of this.pending.values()) {
      if (req.earliestAt < earliestAt) {
        earliestAt = req.earliestAt;
        earliestReq = req;
      }
    }
    if (earliestReq === null) return;

    // minInterval 只在跨来源仲裁时应用（pending.size >= 2）
    // 同一来源单独 pending 时，直接按 earliestAt 执行，不受 30s 约束
    const shouldApplyMinInterval = this.pending.size >= 2;
    const scheduledRunAt = shouldApplyMinInterval
      ? computeScheduledRunTime(earliestAt, this.lastAutoSyncAt, AUTO_MIN_INTERVAL_MS)
      : earliestAt;

    const delay = scheduledRunAt - now;

    // 如果 scheduledRunAt 没变化（没有更早），不要重置 timer——否则会不断向后拖
    if (
      this.pendingTimer !== null &&
      scheduledRunAt === this.scheduledRunAt &&
      delay > 0
    ) {
      return;
    }

    if (this.pendingTimer !== null) {
      this.timer.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.scheduledRunAt = scheduledRunAt;

    // 如果 delay <= 0，立即执行（用 setTimeout 0 保持异步、避免栈内递归）
    this.pendingTimer = this.timer.setTimeout(() => {
      this.pendingTimer = null;
      this.executeOne();
    }, Math.max(0, delay));
  }

  /**
   * 执行最早的那个 pending 请求。执行后 reschedule 一次检查是否还有下一个。
   */
  private executeOne(): void {
    if (this.syncInProgress) return; // 刚好有人手动开跑了，这次让位
    if (this.pending.size === 0) return;

    const now = this.getNow();

    // 再挑最早的 pending——可能在 reschedule 之后又被 debounce 推远了
    let earliestReq: SyncRequest | null = null;
    let earliestAt = Infinity;
    for (const req of this.pending.values()) {
      if (req.earliestAt < earliestAt) {
        earliestAt = req.earliestAt;
        earliestReq = req;
      }
    }
    if (earliestReq === null) return;

    // minInterval 仅在跨来源仲裁时应用
    const shouldApplyMinInterval = this.pending.size >= 2;
    const scheduledRunAt = shouldApplyMinInterval
      ? computeScheduledRunTime(earliestAt, this.lastAutoSyncAt, AUTO_MIN_INTERVAL_MS)
      : earliestAt;
    if (scheduledRunAt > now) {
      // 还没到，重新设 timer
      this.scheduledRunAt = scheduledRunAt;
      this.pendingTimer = this.timer.setTimeout(
        () => {
          this.pendingTimer = null;
          this.executeOne();
        },
        scheduledRunAt - now
      );
      return;
    }

    // 可以执行——从 pending 中摘掉，标记执行中，调外部 runAutoSync
    this.pending.delete(earliestReq.source);
    this.markRunStarted();
    // 注意：runAutoSync 结束后 Plugin 会调 markRunFinished()，那是最终的 lastAutoSyncAt 落点
    void this.runAutoSync(earliestReq.source).finally(() => {
      // 兜底：如果 Plugin 那边没调 markRunFinished，这里补一下，避免 syncInProgress 卡死
      if (this.syncInProgress) this.markRunFinished();
      // 还有没有剩余 pending？
      if (this.pending.size > 0) {
        this.reschedule();
      }
    });
  }
}
