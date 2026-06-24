import type Database from "better-sqlite3";
import type { InactivityType } from "../types";

/**
 * Write-side persistence contract used by tracking components.
 */
export interface Repository {
  /**
   * Creates a session row with matching start and end timestamps.
   *
   * @param workspace - Workspace identifier for the active VS Code window.
   * @param at - UTC ISO timestamp used for both `started_at` and `ended_at`.
   * @returns Identifier of the inserted session row.
   */
  createSession(workspace: string, at: string): number;

  /**
   * Updates the session end timestamp.
   *
   * @param id - Session row identifier.
   * @param at - UTC ISO timestamp to store as `ended_at`.
   */
  touchSession(id: number, at: string): void;

  /**
   * Creates a file activity row with matching start and end timestamps.
   *
   * @param sessionId - Owning session row identifier.
   * @param filePath - Absolute path of the active file.
   * @param at - UTC ISO timestamp used for both `started_at` and `ended_at`.
   * @returns Identifier of the inserted file activity row.
   */
  createFileActivity(sessionId: number, filePath: string, at: string): number;

  /**
   * Updates the file activity end timestamp.
   *
   * @param id - File activity row identifier.
   * @param at - UTC ISO timestamp to store as `ended_at`.
   */
  touchFileActivity(id: number, at: string): void;

  /**
   * Records a finalized inactive interval for a file activity.
   *
   * @param fileActivityId - Owning file activity row identifier.
   * @param type - Inactivity reason.
   * @param start - UTC ISO timestamp at which the interval started.
   * @param end - UTC ISO timestamp at which the interval ended.
   */
  createInactivity(
    fileActivityId: number,
    type: InactivityType,
    start: string,
    end: string,
  ): void;
}

/**
 * better-sqlite3-backed implementation of the tracking repository.
 */
export class SqliteRepository implements Repository {
  /** Prepared statement for inserting session rows. */
  private readonly createSessionStatement: Database.Statement<
    [string, string, string]
  >;

  /** Prepared statement for updating session end timestamps. */
  private readonly touchSessionStatement: Database.Statement<[string, number]>;

  /** Prepared statement for inserting file activity rows. */
  private readonly createFileActivityStatement: Database.Statement<
    [number, string, string, string]
  >;

  /** Prepared statement for updating file activity end timestamps. */
  private readonly touchFileActivityStatement: Database.Statement<
    [string, number]
  >;

  /** Prepared statement for inserting inactivity rows. */
  private readonly createInactivityStatement: Database.Statement<
    [number, InactivityType, string, string]
  >;

  /**
   * Prepares all write statements for reuse.
   *
   * @param database - Initialized SQLite database connection.
   */
  constructor(database: Database.Database) {
    this.createSessionStatement = database.prepare(`
INSERT INTO Sessions (workspace, started_at, ended_at)
VALUES (?, ?, ?)
`);
    this.touchSessionStatement = database.prepare(`
UPDATE Sessions
SET ended_at = ?
WHERE id = ?
`);
    this.createFileActivityStatement = database.prepare(`
INSERT INTO FileActivities (session_id, file_path, started_at, ended_at)
VALUES (?, ?, ?, ?)
`);
    this.touchFileActivityStatement = database.prepare(`
UPDATE FileActivities
SET ended_at = ?
WHERE id = ?
`);
    this.createInactivityStatement = database.prepare(`
INSERT INTO Inactivities (file_activity_id, type, started_at, ended_at)
VALUES (?, ?, ?, ?)
`);
  }

  /** {@inheritdoc Repository.createSession} */
  createSession(workspace: string, at: string): number {
    const result = this.createSessionStatement.run(workspace, at, at);
    return toRowId(result.lastInsertRowid);
  }

  /** {@inheritdoc Repository.touchSession} */
  touchSession(id: number, at: string): void {
    this.touchSessionStatement.run(at, id);
  }

  /** {@inheritdoc Repository.createFileActivity} */
  createFileActivity(sessionId: number, filePath: string, at: string): number {
    const result = this.createFileActivityStatement.run(
      sessionId,
      filePath,
      at,
      at,
    );
    return toRowId(result.lastInsertRowid);
  }

  /** {@inheritdoc Repository.touchFileActivity} */
  touchFileActivity(id: number, at: string): void {
    this.touchFileActivityStatement.run(at, id);
  }

  /** {@inheritdoc Repository.createInactivity} */
  createInactivity(
    fileActivityId: number,
    type: InactivityType,
    start: string,
    end: string,
  ): void {
    this.createInactivityStatement.run(fileActivityId, type, start, end);
  }
}

/**
 * Converts a SQLite rowid into a JavaScript number.
 *
 * @param rowId - Row identifier returned by better-sqlite3.
 * @returns Numeric row identifier.
 * @throws Error when the row identifier cannot be represented safely.
 */
function toRowId(rowId: number | bigint): number {
  const numericRowId = Number(rowId);
  if (!Number.isSafeInteger(numericRowId)) {
    throw new Error(`SQLite rowid is outside the safe integer range: ${rowId}`);
  }
  return numericRowId;
}
