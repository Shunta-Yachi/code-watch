import * as vscode from "vscode";
import { verifySqliteAvailable } from "./db/verifySqlite";

export function activate(_context: vscode.ExtensionContext): void {
  try {
    verifySqliteAvailable();
    console.log("Code Watch: SQLite is available");
    console.log("Code Watch: Extension activated");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Code Watch: SQLite verification failed:", message);
    void vscode.window.showErrorMessage(
      `Code Watch: Failed to initialize SQLite: ${message}`,
    );
    console.warn("Code Watch: Extension activated with errors");
  }
}

export function deactivate(): void {
  console.log("Code Watch: Extension deactivated");
}
