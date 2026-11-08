/**
 * Outcome-event queue (GAZE_GESTURE_PLAN §4.5), one event per outcome,
 * never per frame. Flush every 2s or at 20 events; beacon on page hide;
 * failed batches retry on the next flush (max 3 tries per batch).
 */

import type { InputAction, InputEvent, InputOutcome, InputType } from "./types";

const FLUSH_MS = 2000;
const FLUSH_AT = 20;
const MAX_RETRIES = 3;

type Poster = (events: InputEvent[]) => Promise<boolean>;

export class EventQueue {
  private queue: InputEvent[] = [];
  private retries = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly sessionId: string;

  constructor(
    private residentId: string,
    private post: Poster,
    sessionId?: string,
  ) {
    this.sessionId = sessionId ?? `s-${residentId}-${Date.now().toString(36)}`;
  }

  add(
    inputType: InputType,
    action: InputAction,
    target: string,
    outcome: InputOutcome,
    options: { holdMs?: number; gesture?: string | null; confidence?: number } = {},
  ): void {
    this.queue.push({
      ts: new Date().toISOString(),
      resident_id: this.residentId,
      session_id: this.sessionId,
      input_type: inputType,
      action,
      target,
      hold_ms: Math.round(options.holdMs ?? 0),
      gesture: options.gesture ?? null,
      confidence: options.confidence ?? 1,
      outcome,
    });
    if (this.queue.length >= FLUSH_AT) void this.flush();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onHide);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onHide);
    }
    void this.flush();
  }

  pending(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    const ok = await this.post(batch);
    if (!ok && this.retries < MAX_RETRIES) {
      this.retries += 1;
      this.queue = [...batch, ...this.queue];
    } else {
      this.retries = 0;
    }
  }

  private onHide = (): void => {
    if (document.visibilityState !== "hidden" || this.queue.length === 0) return;
    // Beacon so navigation doesn't lose the batch (TC12).
    const body = JSON.stringify({ events: this.queue });
    const sent = navigator.sendBeacon?.(
      "/backend/input-events",
      new Blob([body], { type: "application/json" }),
    );
    if (sent) this.queue = [];
  };
}
