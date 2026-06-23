import Database from "better-sqlite3";

/**
 * Verifies that the native `better-sqlite3` module loads and can execute
 * basic statements in the current runtime.
 *
 * @remarks
 * Runs as a startup smoke test. It opens a private in-memory database
 * (`:memory:`) and runs a table-less `SELECT 1`, exercising the full
 * prepare/execute/fetch path without creating a schema or touching the
 * filesystem. The connection is always closed, so the check leaves no side
 * effects.
 *
 * The most likely failure point is constructing the database, which throws
 * when the prebuilt native binary is missing or incompatible with the
 * runtime's ABI (for example, a Node/Electron version mismatch).
 *
 * @throws Error if the native module cannot be loaded or the verification
 * query returns an unexpected result.
 */
export function verifySqliteAvailable(): void {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
    if (row?.ok !== 1) {
      throw new Error(`SQLite query returned unexpected result: ok=${row?.ok}`);
    }
  } finally {
    db.close();
  }
}
