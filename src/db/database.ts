import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { DB_FILE_NAME } from "../constants";
import type { InactivityType, InactivityTypeRow } from "../types";

/**
 * Minimal extension context shape needed to resolve global storage.
 */
export interface DatabaseStorageContext {
  /** VS Code global storage URI for the current extension. */
  globalStorageUri: {
    /** Filesystem path backing the global storage URI. */
    fsPath: string;
  };
}

/**
 * Static inactivity types inserted into initialized databases.
 */
const INACTIVITY_TYPE_SEEDS: readonly InactivityTypeRow[] = [
  {
    type: "sleep",
    description: "The computer was asleep.",
  },
  {
    type: "unfocused",
    description: "The VS Code window was not focused.",
  },
  {
    type: "idle",
    description: "The VS Code window was focused but no activity was detected.",
  },
];

/**
 * Opens and initializes the extension database under VS Code global storage.
 *
 * @param context - VS Code extension context that provides global storage.
 * @returns Initialized SQLite database connection.
 */
export function openDatabase(
  context: DatabaseStorageContext,
): Database.Database {
  const storagePath = context.globalStorageUri.fsPath;
  fs.mkdirSync(storagePath, { recursive: true });
  return openDatabaseAtPath(path.join(storagePath, DB_FILE_NAME));
}

/**
 * Opens and initializes the extension database at an explicit filesystem path.
 *
 * @param databasePath - Absolute or relative path to the SQLite database file.
 * @returns Initialized SQLite database connection.
 */
export function openDatabaseAtPath(databasePath: string): Database.Database {
  const database = new Database(databasePath);

  try {
    initializeDatabase(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

/**
 * Applies PRAGMA settings, creates the schema, and seeds static lookup data.
 *
 * @param database - SQLite database connection to initialize.
 */
export function initializeDatabase(database: Database.Database): void {
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");

  database.exec(`
CREATE TABLE IF NOT EXISTS Sessions (
  id         INTEGER PRIMARY KEY,
  workspace  TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS InactivityTypes (
  type        TEXT PRIMARY KEY,
  description TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS FileActivities (
  id         INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES Sessions(id),
  file_path  TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS Inactivities (
  id               INTEGER PRIMARY KEY,
  file_activity_id INTEGER NOT NULL REFERENCES FileActivities(id),
  started_at       TEXT NOT NULL,
  ended_at         TEXT NOT NULL,
  type             TEXT NOT NULL REFERENCES InactivityTypes(type)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_fileactivities_session ON FileActivities(session_id);
CREATE INDEX IF NOT EXISTS idx_inactivities_activity ON Inactivities(file_activity_id);
`);

  const insertSeed = database.prepare<[InactivityType, string]>(`
INSERT OR IGNORE INTO InactivityTypes (type, description)
VALUES (?, ?)
`);

  const seedInactivityTypes = database.transaction(() => {
    for (const seed of INACTIVITY_TYPE_SEEDS) {
      insertSeed.run(seed.type, seed.description);
    }
  });

  seedInactivityTypes();
}
