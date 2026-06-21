# Low-Level Design Document

## 1. データベース設計

### 1-1. 共通方針

- DBライブラリ: better-sqlite3を採用
- DB保存先: context.globalStorageUri
- DBファイル名: code-watch.sqlite
- DB作成タイミング: 拡張機能の初回起動時。vsixへの同梱はしない
- 作成時:
  - `PRAGMA foreign_keys = ON` で外部キーを有効化
  - `journal_mode = WAL` で高速化
  - `STRICT` でより正確なデータ型保存を担保
- 実行環境: VS Code Remote - WSL の remote Extension Host / Ubuntu / linux-x64
  - better-sqlite3を使うため、ネイティブ依存が発生する
  - universal vsixはMVPでは過剰と判断
  - まずは開発環境と同じこの条件での起動を目指す
- `started_at` / `ended_at` について:
  - ISO8601 / UTC フォーマットを使用 (例: "2026-06-18T12:34:56.789Z")
  - レコード作成時、`ended_at` は `started_at` と同じ値で初期化
    - その後、ハートビートで定期的に最新化
    - セッションが正常終了した場合、その正確な時刻が最終値となる

### 1-2. Sessions

| カラム名   | データ型            |
| ---------- | ------------------- |
| id         | INTEGER PRIMARY KEY |
| workspace  | TEXT NOT NULL       |
| started_at | TEXT NOT NULL       |
| ended_at   | TEXT NOT NULL       |

### 1-3. FileActivities

| カラム名   | データ型                                 |
| ---------- | ---------------------------------------- |
| id         | INTEGER PRIMARY KEY                      |
| session_id | INTEGER NOT NULL REFERENCES Sessions(id) |
| file_path  | TEXT NOT NULL                            |
| started_at | TEXT NOT NULL                            |
| ended_at   | TEXT NOT NULL                            |

### 1-4. Inactivities

| カラム名         | データ型                                       |
| ---------------- | ---------------------------------------------- |
| id               | INTEGER PRIMARY KEY                            |
| file_activity_id | INTEGER NOT NULL REFERENCES FileActivities(id) |
| started_at       | TEXT NOT NULL                                  |
| ended_at         | TEXT NOT NULL                                  |
| type             | TEXT NOT NULL REFERENCES InactivityTypes(type) |

### 1-5. InactivityTypes

| カラム名    | データ型         |
| ----------- | ---------------- |
| type        | TEXT PRIMARY KEY |
| description | TEXT NOT NULL    |

- 現状での選択肢は以下の3つ
  - sleep: PCがスリープ状態だった場合
  - unfocused: VS Code ウィンドウにフォーカスがなかった場合
  - idle: VS Code ウィンドウにフォーカスはあるが、操作されていない場合
