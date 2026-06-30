import * as vscode from "vscode";
import type Database from "better-sqlite3";
import { HEARTBEAT_INTERVAL_MS, TICK_INTERVAL_MS } from "./constants";
import { openDatabase } from "./db/database";
import { SqliteRepository } from "./db/repository";
import { verifySqliteAvailable } from "./db/verifySqlite";
import { FileActivityTracker } from "./tracking/fileActivityTracker";
import type { FileRef } from "./tracking/fileActivityTracker";
import { InactivityDetector } from "./tracking/inactivityDetector";
import { SessionTracker } from "./tracking/sessionTracker";
import { resolveWorkspaceId } from "./tracking/workspace";
import { systemClock } from "./util/time";
import { ActivityViewProvider } from "./view/activityViewProvider";

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
    activeRuntime = createTrackingRuntime(database, context.extensionUri);
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
function createTrackingRuntime(
  database: Database.Database,
  extensionUri: vscode.Uri,
): TrackingRuntime {
  const repository = new SqliteRepository(database);
  const provider = new ActivityViewProvider(extensionUri, database);
  const workspaceId = resolveWorkspaceId(vscode.workspace);
  let sessionTracker: SessionTracker | undefined;
  let fileActivityTracker: FileActivityTracker | undefined;
  let inactivityDetector: InactivityDetector | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const disposables: vscode.Disposable[] = [
    vscode.window.registerWebviewViewProvider(
      ActivityViewProvider.viewType,
      provider,
    ),
    vscode.commands.registerCommand("codeWatch.refresh", () => {
      provider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("codeWatch.timezone") ||
        event.affectsConfiguration("codeWatch.timezoneCustom")
      ) {
        provider.refresh();
      }
    }),
  ];

  if (workspaceId !== undefined) {
    sessionTracker = new SessionTracker(repository, workspaceId, systemClock);
    sessionTracker.start();
    fileActivityTracker = new FileActivityTracker(
      repository,
      () => sessionTracker?.sessionId ?? fail("Session tracker is unavailable"),
      systemClock,
    );
    fileActivityTracker.start(toFileRef(vscode.window.activeTextEditor));
    inactivityDetector = new InactivityDetector(
      repository,
      () => fileActivityTracker?.getCurrentActivityId(),
      systemClock,
    );
    inactivityDetector.start();
    heartbeatTimer = setInterval(() => {
      safely("heartbeat", () => {
        sessionTracker?.heartbeat();
        fileActivityTracker?.heartbeat();
      });
    }, HEARTBEAT_INTERVAL_MS);
    tickTimer = setInterval(() => {
      safely("inactivity tick", () => {
        inactivityDetector?.onTick();
      });
    }, TICK_INTERVAL_MS);
    disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        safely("active editor change", () => {
          fileActivityTracker?.onChange(toFileRef(editor));
          inactivityDetector?.onUserActivity();
        });
      }),
      vscode.workspace.onDidChangeTextDocument(() => {
        safely("text document change", () => {
          inactivityDetector?.onUserActivity();
        });
      }),
      vscode.window.onDidChangeTextEditorSelection(() => {
        safely("text editor selection change", () => {
          inactivityDetector?.onUserActivity();
        });
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges(() => {
        safely("text editor visible range change", () => {
          inactivityDetector?.onUserActivity();
        });
      }),
      vscode.window.onDidChangeWindowState((state) => {
        safely("window focus change", () => {
          inactivityDetector?.onFocusChanged(state.focused);
        });
      }),
    );
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

      if (tickTimer !== undefined) {
        clearInterval(tickTimer);
        tickTimer = undefined;
      }

      try {
        const stoppedAt = systemClock.nowIso();
        safely("inactivity stop", () => {
          inactivityDetector?.stop(stoppedAt);
        });
        safely("file activity stop", () => {
          fileActivityTracker?.stop(stoppedAt);
        });
        sessionTracker?.stop(stoppedAt);
      } finally {
        for (const disposable of disposables) {
          disposable.dispose();
        }
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

/**
 * Projects a VS Code text editor into a file reference for tracking.
 *
 * @param editor - VS Code text editor.
 * @returns File reference, or `undefined` when no editor is active.
 */
function toFileRef(editor: vscode.TextEditor | undefined): FileRef | undefined {
  if (editor === undefined) {
    return undefined;
  }

  return {
    scheme: editor.document.uri.scheme,
    fsPath: editor.document.uri.fsPath,
  };
}

/**
 * Logs and suppresses runtime tracking errors.
 *
 * @param label - Operation label for diagnostics.
 * @param operation - Operation to run.
 */
function safely(label: string, operation: () => void): void {
  try {
    operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Code Watch: ${label} failed:`, message);
  }
}

/**
 * Throws an error for impossible runtime states.
 *
 * @param message - Error message.
 * @returns Never returns.
 */
function fail(message: string): never {
  throw new Error(message);
}
