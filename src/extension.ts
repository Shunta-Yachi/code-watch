import * as vscode from "vscode";
import type Database from "better-sqlite3";
import { HEARTBEAT_INTERVAL_MS } from "./constants";
import { openDatabase } from "./db/database";
import { SqliteRepository } from "./db/repository";
import { verifySqliteAvailable } from "./db/verifySqlite";
import { SessionTracker } from "./tracking/sessionTracker";
import { resolveWorkspaceId } from "./tracking/workspace";
import { systemClock } from "./util/time";

/**
 * Active runtime resources owned by the current extension host.
 */
let activeRuntime: TrackingRuntime | undefined;

/**
 * Disposable runtime state for one extension activation.
 */
interface TrackingRuntime {
  /** Stops tracking and releases opened resources. */
  dispose(): void;
}

/**
 * Activates the Code Watch extension and initializes persistent storage.
 *
 * Registers a disposable that invokes {@link disposeActiveRuntime} when the
 * extension host shuts down.
 *
 * @param context - VS Code extension context for this activation.
 */
export function activate(context: vscode.ExtensionContext): void {
  let database: Database.Database | undefined;

  try {
    verifySqliteAvailable();
    database = openDatabase(context);
    activeRuntime = createTrackingRuntime(database);
    context.subscriptions.push(
      new vscode.Disposable(() => {
        disposeActiveRuntime();
      }),
    );
    console.log("Code Watch: SQLite is available");
    console.log("Code Watch: Database initialized");
    console.log("Code Watch: Extension activated");
  } catch (error) {
    if (activeRuntime !== undefined) {
      disposeActiveRuntime();
    } else {
      database?.close();
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("Code Watch: SQLite initialization failed:", message);
    void vscode.window.showErrorMessage(
      `Code Watch: Failed to initialize SQLite: ${message}`,
    );
    console.warn("Code Watch: Extension activated with errors");
  }
}

/**
 * Deactivates the Code Watch extension.
 *
 * Finalizes open tracking intervals and releases runtime resources.
 */
export function deactivate(): void {
  disposeActiveRuntime();
  console.log("Code Watch: Extension deactivated");
}

/**
 * Creates runtime resources for session tracking.
 *
 * @param database - Initialized SQLite database connection.
 * @returns Disposable runtime resources for the activation.
 */
function createTrackingRuntime(database: Database.Database): TrackingRuntime {
  const repository = new SqliteRepository(database);
  const workspaceId = resolveWorkspaceId(vscode.workspace);
  let sessionTracker: SessionTracker | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  if (workspaceId !== undefined) {
    sessionTracker = new SessionTracker(repository, workspaceId, systemClock);
    sessionTracker.start();
    heartbeatTimer = setInterval(() => {
      sessionTracker?.heartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    console.log("Code Watch: Session tracking started");
  } else {
    console.log("Code Watch: Session tracking skipped for empty workspace");
  }

  return {
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;

      if (heartbeatTimer !== undefined) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }

      try {
        const stoppedAt = systemClock.nowIso();
        sessionTracker?.stop(stoppedAt);
      } finally {
        database.close();
      }
    },
  };
}

/**
 * Disposes the active runtime if one has been created.
 */
function disposeActiveRuntime(): void {
  const runtime = activeRuntime;
  activeRuntime = undefined;
  runtime?.dispose();
}
