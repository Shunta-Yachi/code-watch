import * as vscode from "vscode";
import type Database from "better-sqlite3";
import { openDatabase } from "./db/database";
import { verifySqliteAvailable } from "./db/verifySqlite";

/**
 * Active SQLite connection owned by the current extension host.
 */
let activeDatabase: Database.Database | undefined;

/**
 * Activates the Code Watch extension and initializes persistent storage.
 *
 * Registers a disposable that invokes {@link closeActiveDatabase} when the
 * extension host shuts down.
 *
 * @param context - VS Code extension context for this activation.
 */
export function activate(context: vscode.ExtensionContext): void {
  try {
    verifySqliteAvailable();
    activeDatabase = openDatabase(context);
    context.subscriptions.push(
      new vscode.Disposable(() => {
        closeActiveDatabase();
      }),
    );
    console.log("Code Watch: SQLite is available");
    console.log("Code Watch: Database initialized");
    console.log("Code Watch: Extension activated");
  } catch (error) {
    closeActiveDatabase();
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
 * Storage cleanup is handled by the disposable registered in {@link activate},
 * so no explicit database close is performed here.
 */
export function deactivate(): void {
  console.log("Code Watch: Extension deactivated");
}

/**
 * Closes the active SQLite connection if one has been opened.
 */
function closeActiveDatabase(): void {
  activeDatabase?.close();
  activeDatabase = undefined;
}
