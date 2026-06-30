import type Database from "better-sqlite3";
import type { AggregationResult, FileAggregation } from "../types";
import { dayRangeUtc, overlapMs } from "../util/time";

/**
 * File activity row used by aggregation queries.
 */
interface FileActivityAggregationRow {
  /** File activity row identifier. */
  id: number;
  /** Workspace identifier from the owning session. */
  workspace: string;
  /** Absolute file path. */
  file_path: string;
  /** UTC ISO timestamp at which the activity started. */
  started_at: string;
  /** UTC ISO timestamp at which the activity ended. */
  ended_at: string;
}

/**
 * Inactivity row used by aggregation queries.
 */
interface InactivityAggregationRow {
  /** UTC ISO timestamp at which inactivity started. */
  started_at: string;
  /** UTC ISO timestamp at which inactivity ended. */
  ended_at: string;
}

/**
 * Mutable aggregation bucket for one workspace.
 */
interface WorkspaceBucket {
  /** Workspace identifier. */
  workspace: string;
  /** File work durations keyed by absolute file path. */
  files: Map<string, number>;
}

/**
 * Computes work time for one local calendar day.
 *
 * @param database - Initialized SQLite database connection.
 * @param dateLocal - Local date in `YYYY-MM-DD` format.
 * @param timeZone - IANA timezone used to compute date boundaries.
 * @returns Aggregated work time.
 */
export function computeDailyAggregation(
  database: Database.Database,
  dateLocal: string,
  timeZone: string,
): AggregationResult {
  const { startUtc, endUtc } = dayRangeUtc(dateLocal, timeZone);
  const activityRows = database
    .prepare<[string, string], FileActivityAggregationRow>(
      `
SELECT fa.id, s.workspace, fa.file_path, fa.started_at, fa.ended_at
FROM FileActivities fa
JOIN Sessions s ON s.id = fa.session_id
WHERE fa.started_at < ? AND fa.ended_at > ?
ORDER BY s.workspace, fa.file_path, fa.id
`,
    )
    .all(endUtc, startUtc);
  const inactivityStatement = database.prepare<
    [number, string, string],
    InactivityAggregationRow
  >(
    `
SELECT started_at, ended_at
FROM Inactivities
WHERE file_activity_id = ? AND started_at < ? AND ended_at > ?
ORDER BY started_at, id
`,
  );
  const workspaces = new Map<string, WorkspaceBucket>();

  for (const row of activityRows) {
    const activityMs = overlapMs(
      row.started_at,
      row.ended_at,
      startUtc,
      endUtc,
    );
    const inactivityMs = inactivityStatement
      .all(row.id, endUtc, startUtc)
      .reduce(
        (total, inactivity) =>
          total +
          overlapMs(
            inactivity.started_at,
            inactivity.ended_at,
            startUtc,
            endUtc,
          ),
        0,
      );
    const workMs = Math.max(0, activityMs - inactivityMs);

    if (workMs === 0) {
      continue;
    }

    const workspace = getWorkspaceBucket(workspaces, row.workspace);
    workspace.files.set(
      row.file_path,
      (workspace.files.get(row.file_path) ?? 0) + workMs,
    );
  }

  const workspaceAggregations = [...workspaces.values()]
    .map((workspace) => {
      const files = toFileAggregations(workspace.files);
      return {
        workspace: workspace.workspace,
        totalMs: files.reduce((total, file) => total + file.workMs, 0),
        files,
      };
    })
    .filter((workspace) => workspace.totalMs > 0)
    .sort((left, right) => left.workspace.localeCompare(right.workspace));

  return {
    date: dateLocal,
    totalMs: workspaceAggregations.reduce(
      (total, workspace) => total + workspace.totalMs,
      0,
    ),
    workspaces: workspaceAggregations,
  };
}

/**
 * Gets or creates a workspace aggregation bucket.
 *
 * @param workspaces - Workspace bucket map.
 * @param workspaceId - Workspace identifier.
 * @returns Workspace bucket.
 */
function getWorkspaceBucket(
  workspaces: Map<string, WorkspaceBucket>,
  workspaceId: string,
): WorkspaceBucket {
  const existing = workspaces.get(workspaceId);
  if (existing !== undefined) {
    return existing;
  }

  const created = {
    workspace: workspaceId,
    files: new Map<string, number>(),
  };
  workspaces.set(workspaceId, created);
  return created;
}

/**
 * Converts a file duration map into sorted aggregation rows.
 *
 * @param files - File duration map.
 * @returns Sorted file aggregations.
 */
function toFileAggregations(files: Map<string, number>): FileAggregation[] {
  return [...files.entries()]
    .map(([filePath, workMs]) => ({ filePath, workMs }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}
