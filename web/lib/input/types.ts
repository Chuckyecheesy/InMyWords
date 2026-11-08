/**
 * Gaze/gesture input layer (docs/GAZE_GESTURE_PLAN.md).
 * Only OUTCOME events leave the device — never video, never raw gaze.
 */

export type InputType = "touch" | "gaze" | "gesture";
export type InputAction = "select" | "approve" | "cancel" | "custom";
export type InputOutcome = "confirmed" | "cancelled" | "timeout";

export type InputEvent = {
  ts: string;
  resident_id: string;
  session_id: string;
  input_type: InputType;
  action: InputAction;
  target: string;
  hold_ms: number;
  gesture: string | null;
  confidence: number;
  outcome: InputOutcome;
};

export type InputProfile = {
  resident_id: string;
  preferred_select: InputType;
  preferred_yes: string; // "Thumb_Up" | "touch" | "gaze"
  dwell_ms: number;
  rates: Partial<Record<InputType, number>>;
  notes: string[];
  events_counted: number;
  confidence: "low" | "medium" | "high";
};

export type GazePoint = { x: number; y: number };

export type DwellPhase = "idle" | "fixating" | "selected" | "cooldown" | "paused";

export type DwellState = {
  phase: DwellPhase;
  tileId: string | null;
  /** 0..1 ring fill for the currently fixated tile */
  progress: number;
};
