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

/**
 * Aggregated work time for a single file path.
 */
export interface FileAggregation {
  /** Absolute path of the file. */
  filePath: string;
  /** Effective work duration after subtracting inactivity. */
  workMs: number;
}

/**
 * Aggregated work time for a workspace and its files.
 */
export interface WorkspaceAggregation {
  /** Workspace identifier recorded on session rows. */
  workspace: string;
  /** Effective work duration across all files in the workspace. */
  totalMs: number;
  /** File-level work durations. */
  files: FileAggregation[];
}

/**
 * Aggregated work time for one local calendar day.
 */
export interface AggregationResult {
  /** Local date in `YYYY-MM-DD` format. */
  date: string;
  /** Effective work duration across all workspaces and files. */
  totalMs: number;
  /** Workspace-level work durations. */
  workspaces: WorkspaceAggregation[];
}

/**
 * Messages sent from the WebView script to the extension host.
 */
export type MessageToExtension =
  | {
      /** Requests the initial render. */
      type: "ready";
    }
  | {
      /** Requests rendering for another local date. */
      type: "changeDate";
      /** Local date in `YYYY-MM-DD` format. */
      date: string;
    };

/**
 * Messages sent from the extension host to the WebView script.
 */
export interface MessageToWebview {
  /** Instructs the WebView to render aggregation data. */
  type: "render";
  /** Aggregated work time for the selected day. */
  result: AggregationResult;
  /** IANA timezone used for the aggregation date boundaries. */
  timeZone: string;
}
