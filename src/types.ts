/**
 * Supported reasons for time that should be subtracted from file activity.
 */
export type InactivityType = "sleep" | "unfocused" | "idle";

/**
 * Persisted inactivity type lookup row.
 */
export interface InactivityTypeRow {
  /** Stable inactivity type key. */
  type: InactivityType;
  /** Human-readable explanation for the type. */
  description: string;
}

/**
 * Persisted session row.
 */
export interface SessionRow {
  /** Row identifier. */
  id: number;
  /** Workspace identifier recorded for the VS Code window. */
  workspace: string;
  /** UTC ISO timestamp at which the session started. */
  started_at: string;
  /** UTC ISO timestamp at which the session was last observed or ended. */
  ended_at: string;
}

/**
 * Persisted file activity row.
 */
export interface FileActivityRow {
  /** Row identifier. */
  id: number;
  /** Owning session row identifier. */
  session_id: number;
  /** Absolute file path tracked during this activity interval. */
  file_path: string;
  /** UTC ISO timestamp at which the activity interval started. */
  started_at: string;
  /** UTC ISO timestamp at which the activity interval was last observed or ended. */
  ended_at: string;
}

/**
 * Persisted inactivity row tied to a file activity interval.
 */
export interface InactivityRow {
  /** Row identifier. */
  id: number;
  /** Owning file activity row identifier. */
  file_activity_id: number;
  /** UTC ISO timestamp at which the inactivity interval started. */
  started_at: string;
  /** UTC ISO timestamp at which the inactivity interval ended. */
  ended_at: string;
  /** Reason for the inactive interval. */
  type: InactivityType;
}
