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

## 2. モジュール構成

### 2-1. ディレクトリ構成

```text
src/
  extension.ts              エントリ。activate / deactivate と依存配線
  constants.ts              閾値・間隔などの定数
  types.ts                  共有型定義 (DB行型・集計結果・WebViewメッセージ型。4-2, 12 参照)
  db/
    database.ts             接続生成・初期化 (PRAGMA / スキーマ / シード)
    repository.ts           Session / FileActivity / Inactivity の書き込み操作
    verifySqlite.ts         (既存) ネイティブ依存の可用性検証
  tracking/
    sessionTracker.ts       セッション計測・ハートビート
    fileActivityTracker.ts  アクティブファイル追跡
    inactivityDetector.ts   idle / unfocused / sleep 検出
  settings/
    timezone.ts             タイムゾーン判定
  view/
    activityViewProvider.ts WebviewViewProvider 実装 (拡張ホスト側)
    aggregation.ts          集計ロジック・日付按分
  webview-ui/
    main.ts                 WebView エントリ (TS, ブラウザ側)。media/main.js へコンパイル
    vscode.d.ts             acquireVsCodeApi() のグローバル型宣言
  util/
    time.ts                 ISO8601(UTC) 変換・日付範囲算出
media/
  main.js                   src/webview-ui/main.ts のコンパイル生成物 (ESM。tsc -p tsconfig.webview.json)
  main.css / icon.svg       静的アセット (既存 icon.svg)
```

### 2-2. 定数 (constants.ts)

| 定数                     | 値                    | 用途                                                   |
| ------------------------ | --------------------- | ------------------------------------------------------ |
| `HEARTBEAT_INTERVAL_MS`  | 30_000                | ハートビート間隔 (HLD: デフォルト30秒)                 |
| `SLEEP_THRESHOLD_MS`     | 60_000                | sleep 記録閾値 (1min)                                  |
| `UNFOCUSED_THRESHOLD_MS` | 120_000               | unfocused 記録閾値 (2min)                              |
| `IDLE_THRESHOLD_MS`      | 180_000               | idle 記録閾値 (3min)                                   |
| `TICK_INTERVAL_MS`       | 15_000                | 非作業検出の監視ティック (idle判定・sleepギャップ検出) |
| `DB_FILE_NAME`           | `"code-watch.sqlite"` | DBファイル名                                           |

## 3. ライフサイクル（activate / deactivate）

### 3-1. activate(context)

1. `verifySqliteAvailable()`（既存）。失敗時は 11 章のフォールバックに従い、以降の計測をスキップする。
2. `openDatabase(context)` で DB 初期化（4-1）。`Repository` を生成。
3. ワークスペースが開かれている場合のみ計測を開始する（`resolveWorkspaceId()` が `undefined` を返すフォルダ無しウィンドウでは計測しない）。
   - `SessionTracker.start()`
   - `FileActivityTracker.start(window.activeTextEditor)`
   - `InactivityDetector.start()`
   - 単一のハートビート `setInterval(HEARTBEAT_INTERVAL_MS)` を張り、毎回 `sessionTracker.heartbeat()` と `fileActivityTracker.heartbeat()` を呼ぶ。
4. `ActivityViewProvider` を `window.registerWebviewViewProvider("codeWatch.activityView", provider)` で登録（計測の有無に関わらず登録する）。
5. コマンド `codeWatch.refresh` を登録（10-3）。
6. 生成した Disposable（イベント購読・タイマー・プロバイダ・DB・トラッカー）をすべて `context.subscriptions` に push（11-2）。

> 補足: 本拡張は `extensionKind: "workspace"` かつ DB は `globalStorageUri`（全ウィンドウ共有）に置く。複数ウィンドウは各々が独立した Extension Host で activate され、**1ウィンドウ = 1 Session** として並行稼働する（HLD「同数のセッションを並行稼働」を満たす）。共有 DB への同時書き込みは WAL + `busy_timeout`（4-1）で調停する。

### 3-2. deactivate()

VS Code の deactivate は短時間で完了する必要があり、better-sqlite3 は同期 API のため同期的に確定処理を行う。

1. ハートビートタイマーを停止。
2. `inactivityDetector.stop(now)`：開いている非作業区間があれば確定（6・7章のルールに従い閾値判定のうえ記録）。
3. `fileActivityTracker.stop(now)`：現在の FileActivity の `ended_at` を `now` で確定。
4. `sessionTracker.stop(now)`：Session の `ended_at` を `now` で確定。
5. `database.close()`。

> 異常終了（クラッシュ等で deactivate 未実行）の場合、`ended_at` は最後のハートビート値（最大 `HEARTBEAT_INTERVAL_MS` 分だけ過去）で残る。これは DB設計（1-1）の方針どおり許容する。

## 4. DBアクセス層

### 4-1. 初期化シーケンス (database.ts)

`openDatabase(context: ExtensionContext): Database`

1. `context.globalStorageUri` のディレクトリを `workspace.fs.createDirectory` で作成（存在時は no-op）。
2. `new Database(path.join(globalStoragePath, DB_FILE_NAME))` で接続。
3. PRAGMA を適用：
   - `foreign_keys = ON`
   - `journal_mode = WAL`
   - `busy_timeout = 5000`（多ウィンドウ同時書き込みのロック待ち。LLDで補う実装詳細）
4. スキーマ作成（冪等。section 1 のテーブルを `STRICT` で生成）：

```sql
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
CREATE INDEX IF NOT EXISTS idx_inactivities_activity  ON Inactivities(file_activity_id);
```

5. `InactivityTypes` の初期シード（冪等。`INSERT OR IGNORE`）：`sleep` / `unfocused` / `idle` の3行（description は section 1-5 の文言）。

> スキーマ変更時はマイグレーションを行わず、DBファイルを作り直す（MVP方針）。将来必要になれば `PRAGMA user_version` による版管理へ移行する。

### 4-2. リポジトリ (repository.ts)

すべて prepared statement。タイムスタンプは `util/time.ts` の `nowIso()`（`new Date().toISOString()`）で生成する。

| 関数                                                       | 振る舞い                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `createSession(workspace, at): number`                     | `started_at = ended_at = at` で INSERT。`lastInsertRowid` を返す |
| `touchSession(id, at): void`                               | `ended_at = at` に UPDATE（ハートビート/確定）                   |
| `createFileActivity(sessionId, filePath, at): number`      | `started_at = ended_at = at` で INSERT                           |
| `touchFileActivity(id, at): void`                          | `ended_at = at` に UPDATE                                        |
| `createInactivity(fileActivityId, type, start, end): void` | 確定済み区間を INSERT                                            |

## 5. セッション計測 (sessionTracker.ts)

```ts
class SessionTracker {
  constructor(repo: Repository, workspaceId: string);
  start(at?: string): void; // createSession → sessionId 保持
  heartbeat(at?: string): void; // touchSession(sessionId, at)
  stop(at?: string): void; // touchSession(sessionId, at) 最終確定
  get sessionId(): number;
}
```

- `resolveWorkspaceId()`（util）: `workspace.workspaceFile?.fsPath ?? workspace.workspaceFolders?.[0]?.uri.fsPath ?? undefined`。`undefined` の場合は計測しない（3-1）。
- スタート/ストップ条件は VS Code が activate/deactivate で表現する（SRS 2-1：Workspace を開いた/閉じた）。

## 6. ファイル別計測 (fileActivityTracker.ts)

```ts
class FileActivityTracker {
  constructor(repo: Repository, getSessionId: () => number);
  start(editor: TextEditor | undefined, at?: string): void;
  heartbeat(at?: string): void;
  stop(at?: string): void;
  getCurrentActivityId(): number | undefined; // InactivityDetector が参照
}
```

- 対象は `editor.document.uri.scheme === "file"` のみ。Output / untitled 等の非ファイルは追跡しない。`file_path = uri.fsPath`。
- 購読: `window.onDidChangeActiveTextEditor(editor => onChange(editor))`。
- `onChange`:
  1. 現在の FileActivity があれば `touchFileActivity(currentId, now)` で確定（`ended_at = now`）。
  2. 新エディタが file スキームなら `createFileActivity(sessionId, fsPath, now)` で新規 open、`currentActivityId` 更新。非ファイルなら `currentActivityId = undefined`。
- `heartbeat()`: `currentActivityId` があれば `touchFileActivity`。
- 同一ファイルへの再アクティブ化でも区間を切り替える（連続区間は集計時に合算されるため問題ない）。

## 7. 非作業時間検出 (inactivityDetector.ts)

Inactivity は独立した「休憩ログ」ではなく、計測時間（FileActivity）から有効作業時間を差し引くための補正である（算定式は9章）。そのため常に、その時点で開いている FileActivity に紐づけて記録する。

非作業区間を **互いに重複しない** 連続区間として生成し、閾値を満たすものだけ `Inactivities` に記録する。これにより集計時（9章）の二重控除を防ぐ。優先順位 `sleep > unfocused > idle` は「区間の重なりを上位種別に寄せる」ことで担保する。

### 7-1. 状態と入力

- 状態 `state ∈ { ACTIVE, IDLE, UNFOCUSED }`、補助変数 `lastActivityAt`、`segStart`（IDLE/UNFOCUSED 区間の開始）、`segFileActivityId`、`lastTickAt`。
- ユーザー操作イベント（いずれも `onUserActivity(now)` を呼ぶ）: `workspace.onDidChangeTextDocument` / `window.onDidChangeTextEditorSelection` / `window.onDidChangeTextEditorVisibleRanges` / `window.onDidChangeActiveTextEditor`。
- フォーカス: `window.onDidChangeWindowState(s => onFocusChanged(s.focused, now))`。
- ティック: `setInterval(TICK_INTERVAL_MS)` → `onTick(now)`。
- 記録先ファイル: `segFileActivityId`（区間開始時点の `getCurrentActivityId()`）。区間開始時に開いている FileActivity が無ければ、その区間は記録しない。これは欠陥ではなくモデルの当然の帰結で、ファイル未オープン時は計測時間（FileActivity）自体が無く、差し引く対象が存在しないため（`Inactivities.file_activity_id` が NOT NULL であることとも整合）。

### 7-2. 遷移

| 現状態    | イベント                                                            | 動作                                                                       |
| --------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ACTIVE    | onUserActivity                                                      | `lastActivityAt = now`                                                     |
| ACTIVE    | onTick かつ focused かつ `now - lastActivityAt ≥ IDLE_THRESHOLD_MS` | `state=IDLE`、`segStart=lastActivityAt`、`segFileActivityId` 取得          |
| ACTIVE    | onFocusChanged(false)                                               | `state=UNFOCUSED`、`segStart=now`、`segFileActivityId` 取得                |
| IDLE      | onUserActivity                                                      | `finalize(idle, segStart, now)`、`state=ACTIVE`、`lastActivityAt=now`      |
| IDLE      | onFocusChanged(false)                                               | `finalize(idle, segStart, now)`、`state=UNFOCUSED`、`segStart=now`         |
| UNFOCUSED | onFocusChanged(true)                                                | `finalize(unfocused, segStart, now)`、`state=ACTIVE`、`lastActivityAt=now` |
| UNFOCUSED | onUserActivity                                                      | 無視（非フォーカス中の発火は採用しない）                                   |

`finalize(type, start, end)`:

```text
duration = end - start
if segFileActivityId が存在 かつ duration ≥ THRESHOLD[type]:
    repo.createInactivity(segFileActivityId, type, start, end)
```

idle は閾値超過後にのみ IDLE 状態へ入るため、記録される区間は常に `[lastActivityAt, 復帰時刻]`（閾値以上）となる。

### 7-3. sleep（ギャップ）検出と優先

スリープ中はティックタイマーも停止するため、復帰時の `onTick` で `gap = now - lastTickAt` が想定（`TICK_INTERVAL_MS`）を大きく超える。

```text
onTick(now):
  gap = now - lastTickAt
  if gap ≥ SLEEP_THRESHOLD_MS:        # スリープ/サスペンドとみなす
      handleSleep(gapStart = lastTickAt, gapEnd = now)
  else:
      # 通常のidle判定 (7-2 の ACTIVE→IDLE)
  lastTickAt = now
```

`handleSleep(gapStart, gapEnd)`（sleep が idle/unfocused に優先）:

1. 開区間があれば、スリープ突入前の部分のみ確定: `state ∈ {IDLE, UNFOCUSED}` なら `finalize(currentType, segStart, gapStart)`。
2. `finalize(sleep, gapStart, gapEnd)`（`segFileActivityId` は突入時点の値を使用）。
3. 復帰後は初期化: `lastActivityAt = gapEnd`、現在のフォーカス状態に応じて `state` を再設定（focused → ACTIVE、非focused → UNFOCUSED で `segStart=gapEnd`）。

この設計により、生成される非作業区間は常に重複せず、優先順位（idle はフォーカス喪失で unfocused に切替、両者は sleep ギャップに truncate される）が満たされる。

### 7-4. 既知の制約

- `onDidChangeTextDocument` はフォーマッタ/自動保存/外部変更など非ユーザー起因でも発火しうる。MVP では区別せずアクティブ扱いとする。

## 8. 設定（タイムゾーン判定）(settings/timezone.ts)

UIでのタイプミスを避けるため、設定は2つに分ける（主要ゾーンはドロップダウン、マイナーゾーンは custom 欄。VS Code の設定UIはフラットで入れ子不可のため）。

### 8-1. 設定スキーマ (package.json contributes.configuration)

- `codeWatch.timezone`: `enum` で「`""`（システム自動）/ 主要IANAゾーン / `"(custom)"`」から選ぶドロップダウン（`enumItemLabels` でラベル付け）。
  - 主要ゾーン（既定。個人用途に応じて増減可）: `Asia/Tokyo` / `UTC` / `Europe/London` / `America/New_York` / `America/Los_Angeles` / `Australia/Sydney`。
- `codeWatch.timezoneCustom`: 自由入力。`codeWatch.timezone` が `"(custom)"` のときのみ使用する任意のIANA名。

### 8-2. 判定ロジック

```ts
function resolveTimezone(): string; // IANA 名を返す
```

1. `sel = getConfiguration("codeWatch").get<string>("timezone")` を読む。
2. `sel === ""` → `Intl.DateTimeFormat().resolvedOptions().timeZone`（OS自動判定）。
3. `sel === "(custom)"` → `get<string>("timezoneCustom")` を使用。
4. それ以外 → `sel`（主要ゾーン）をそのまま使用。
5. 2〜4 の結果が妥当でない（`isValidTimeZone` が false / 空）場合は `"UTC"` にフォールバック（HLD/SRS 準拠）。

```ts
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
```

- `workspace.onDidChangeConfiguration` で `codeWatch.timezone` / `codeWatch.timezoneCustom` の変更を検知したら、ビューを再集計・再描画する（10章）。
- タイムゾーンは集計の日付境界算出（9章）でのみ使用し、保存値（DB の `*_at`）は常に UTC のまま。

## 9. 集計 (view/aggregation.ts)

### 9-1. 入力・出力

```ts
function computeDailyAggregation(
  db: Database,
  dateLocal: string,
  timeZone: string,
): AggregationResult;
```

- `dateLocal`: 選択タイムゾーンでのカレンダー日付 `"YYYY-MM-DD"`。
- 出力（SRS 2-3 / HLD 4 の算定方式に準拠）:

```ts
interface AggregationResult {
  date: string; // dateLocal
  totalMs: number; // = ファイル別作業時間の合計
  workspaces: {
    workspace: string;
    totalMs: number; // 配下ファイルの合計
    files: { filePath: string; workMs: number }[];
  }[];
}
```

### 9-2. 日付境界の按分 (util/time.ts)

```ts
function dayRangeUtc(
  dateLocal: string,
  timeZone: string,
): { startUtc: string; endUtc: string };
```

- 選択 tz における当日 00:00 と翌日 00:00 を UTC instant に変換して返す。
- tz の UTC オフセットは DST により日付ごとに変わるため、境界ごとにオフセットを算出する（UTC候補を tz でフォーマットしてローカル時刻との差からオフセットを逆算、DST 境界も収束させる）。`Asia/Tokyo`・`UTC` は DST 非対象のため単純。
- ユーザー例: セッション `6/1 22:00Z〜6/3 02:00Z`（tz=UTC）は、各日の `[startUtc,endUtc)` でクランプして 6/1: 2h, 6/2: 24h, 6/3: 2h に按分される。

### 9-3. アルゴリズム

```text
{ startUtc, endUtc } = dayRangeUtc(dateLocal, timeZone)

# 当日と重なる FileActivity を取得（workspace も同時取得）
rows = SELECT fa.id, fa.file_path, s.workspace, fa.started_at, fa.ended_at
       FROM FileActivities fa JOIN Sessions s ON s.id = fa.session_id
       WHERE fa.started_at < endUtc AND fa.ended_at > startUtc

for each row:
    workMs = clamp(row, startUtc, endUtc)          # min(ended,end) - max(started,start)
    inact  = Σ clamp(i, startUtc, endUtc)          # 当該 file_activity_id の Inactivities
             (i.started_at < endUtc AND i.ended_at > startUtc)
    fileWorkMs = max(0, workMs - inact)
    → file_path 単位で workspace に加算

workspace.totalMs = Σ files.workMs
result.totalMs    = Σ 全 files.workMs              # SRS: トータル = ファイル別合計
```

- Inactivities は検出側（7章）で重複しないことが保証されるため、単純加算でユニオンと等価。

## 10. 作業記録閲覧（WebView）(view/activityViewProvider.ts)

### 10-1. プロバイダ

`ActivityViewProvider implements vscode.WebviewViewProvider`（`viewType = "codeWatch.activityView"`、package.json 登録済み）。

- `resolveWebviewView`: `webview.options = { enableScripts: true, localResourceRoots: [media] }`。`getHtml()` で CSP + nonce 付き HTML を生成し、`media/main.js`（`src/webview-ui/main.ts` のコンパイル生成物）を `<script type="module" nonce>` として、`media/main.css` を読み込む。`onDidReceiveMessage` を配線。
- 内部に「表示中の日付 `currentDate`（既定: 今日）」を保持。

### 10-2. メッセージプロトコル

| 方向         | type         | ペイロード                                        |
| ------------ | ------------ | ------------------------------------------------- |
| WebView→拡張 | `ready`      | なし（初期描画要求）                              |
| WebView→拡張 | `changeDate` | `{ date: "YYYY-MM-DD" }`（前日/翌日ボタン）       |
| 拡張→WebView | `render`     | `{ result: AggregationResult, timeZone: string }` |

- `ready` / `changeDate` 受信時: `timeZone = resolveTimezone()` →（`changeDate` なら `currentDate` 更新）→ `computeDailyAggregation` → `render` を post。
- 日付切替ボタンは WebView 側で `currentDate ± 1日` を算出して `changeDate` を送る。

### 10-3. リフレッシュ

- コマンド `codeWatch.refresh`（4章 package.json で定義）→ `provider.refresh()` → `currentDate` で再集計し `render` を post。
- `onDidChangeConfiguration("codeWatch.timezone")` でも `refresh()` を呼ぶ。

## 11. エラーハンドリングとリソース破棄

### 11-1. エラーハンドリング方針

- DB 初期化失敗（`verifySqliteAvailable` / `openDatabase`）: 既存実装どおり `showErrorMessage` を出し、**計測機能を無効化して拡張自体は活性のまま縮退**（ビュー登録は行う）。
- 個々の DB 書き込み（ハートビート・各 create/touch）は try/catch で囲み、`console.error` に記録して握りつぶす。イベントループ/タイマーへ例外を伝播させない。

### 11-2. リソース破棄

- すべての購読（イベント listener、ティック/ハートビートの `setInterval` を包む `Disposable`、WebviewViewProvider、トラッカー、`Database`）を `context.subscriptions` に登録。
- `deactivate`（3-2）で各トラッカーの確定処理 → `db.close()` を同期実行する。

## 12. 型定義 (types.ts)

```ts
type InactivityType = "sleep" | "unfocused" | "idle";

interface SessionRow {
  id: number;
  workspace: string;
  started_at: string;
  ended_at: string;
}
interface FileActivityRow {
  id: number;
  session_id: number;
  file_path: string;
  started_at: string;
  ended_at: string;
}
interface InactivityRow {
  id: number;
  file_activity_id: number;
  started_at: string;
  ended_at: string;
  type: InactivityType;
}

interface AggregationResult {
  date: string;
  totalMs: number;
  workspaces: {
    workspace: string;
    totalMs: number;
    files: { filePath: string; workMs: number }[];
  }[];
}

// 拡張ホスト ⇔ WebView メッセージプロトコル (10-2)
type MessageToExtension =
  | { type: "ready" }
  | { type: "changeDate"; date: string };

type MessageToWebview = {
  type: "render";
  result: AggregationResult;
  timeZone: string;
};
```

- メッセージ型は拡張ホスト側（`activityViewProvider.ts`）と WebView 側（`webview-ui/main.ts`）の双方が `import type` で参照し、`postMessage` の送受信をコンパイル時に型検証する。`types.ts` は vscode / DOM いずれにも依存しない純粋な型のみで構成し、両環境から安全に共有できる状態を保つ。

## 13. テスト容易性（依存注入）

ユニットテスト（Vitest）の対象を最大化するため、「高コストな依存（`vscode` / 実時刻 / タイマー）」を注入し、判断ロジックを純粋化する。VS Code イベントの購読は合成ルート（`extension.ts`）の薄いアダプタに集約し、各トラッカー/検出器自体は `vscode` を import しない。

### 13-1. 注入する依存

| 依存               | 抽象                                       | 既定実装                   | テストでの差し替え                                 |
| ------------------ | ------------------------------------------ | -------------------------- | -------------------------------------------------- |
| 時刻               | `Clock { nowIso(): string }`               | `Date` ベース              | 偽クロック（任意時刻を返す）                       |
| 永続化             | `Repository`（インタフェース）             | better-sqlite3 実装        | **実インメモリDB**（`:memory:`）。モックは使わない |
| アクティブファイル | `FileRef { scheme; fsPath }`               | `TextEditor` から射影      | プレーンオブジェクト                               |
| タイマー           | 検出器外の駆動（`onTick(now)` を呼ぶだけ） | `setInterval`              | テストから直接 `onTick` を呼ぶ                     |
| VS Code イベント   | アダプタ（13-3）                           | `window.onDidChange*` 購読 | 直接ハンドラ呼び出し                               |

### 13-2. 純粋化する単位

- `InactivityDetector`: `onUserActivity(now)` / `onFocusChanged(focused, now)` / `onTick(now)` を外部から呼ぶ純粋な状態機械（7章）。`vscode` 非依存。Clock・Repository・`getCurrentActivityId` を注入。
- `SessionTracker` / `FileActivityTracker`: Clock・Repository を注入。`FileActivityTracker` は `FileRef` を受け取り、6章の `TextEditor` には依存しない（アダプタで射影する）。
- `Repository` / `aggregation` / `timezone` / `util/time`: もとから `vscode` 非依存。

### 13-3. アダプタ（テスト対象外の薄い層）

`extension.ts`（合成ルート）で以下の配線のみ行い、ロジックは持たない:

- `window.onDidChangeActiveTextEditor(e => fileTracker.onChange(toFileRef(e)))`
- `window.onDidChangeWindowState(s => detector.onFocusChanged(s.focused, clock.nowIso()))`
- 操作イベント群（`onDidChangeTextDocument` 等）→ `detector.onUserActivity(clock.nowIso())`
- `setInterval(TICK_INTERVAL_MS, () => detector.onTick(clock.nowIso()))`
- `setInterval(HEARTBEAT_INTERVAL_MS, () => { session.heartbeat(); fileTracker.heartbeat(); })`

この配線部のみ `@vscode/test-electron` の結合テスト、または Milestone D の手動確認でカバーする。

### 13-4. テスト可能性マトリクス

| 単位                                 | ユニットテスト | 手段                               |
| ------------------------------------ | -------------- | ---------------------------------- |
| Repository / DB初期化                | 可             | 実 `:memory:` DB                   |
| InactivityDetector（状態機械全体）   | 可             | 偽クロック + ハンドラ直呼び + 実DB |
| SessionTracker / FileActivityTracker | 可             | 偽クロック + 実DB + `FileRef`      |
| aggregation（日付按分含む）          | 可             | 実DB                               |
| timezone 判定                        | 可             | Intl                               |
| アダプタ配線（13-3）                 | 不可           | 結合テスト / 手動                  |

## 14. 設計判断メモ（採用理由・不採用案）

LLD本文だけでは伝わりにくい「なぜこの形か / 何を採らなかったか」をレビューに基づき記録する。

- **集計の配置**: `view/aggregation.ts`。`db/` 配下に置く案もあったが、書き込み = `db/`・読み取り = `view/` で整理（「画面のための計算」と捉える）。
- **FileActivity は区間ごと1行**: 「同一セッション内は1ファイル1レコード」案は不採用。算定式 `ended_at - started_at - 非作業` は「1行 = 連続1区間」を前提とし、1行に丸めると他ファイルの時間が混入する。日付按分（9章）も各区間の実時刻を要する。区間ごと1行は SQL で足し引き・日境界クランプができる正規化形（行数 〜数百/日 は非問題）。
- **トラッカーはクラス記法**: 状態＋ライフサイクルを持つため自然。ファクトリ関数案もあったが不採用。
- **ハートビート 30秒**: 60秒から変更。電池消費差は無視できるレベルで、ライブ表示の鮮度とクラッシュ時の取りこぼし（最大30秒）を改善。
- **インデックスは最小2つ**（`session_id` / `file_activity_id`）: `(started_at, ended_at)` は `ended_at` が頻繁更新で索引コストがある一方、MVP規模では恩恵が薄く不採用（必要なら後付け）。
- **スキーマ変更はマイグレーションせず作り直し**（YAGNI）。将来必要なら `PRAGMA user_version`。
- **タイムゾーンは設定UIのドロップダウン**: コマンド+QuickPick案は不採用（設定はコマンドより設定画面が自然）。enum はフラットで入れ子不可のため、主要ゾーンの enum ＋ `(custom)` / `codeWatch.timezoneCustom` の2設定で「主要は手前・マイナーは一段深く」を表現。
- **UIは WebView**: TreeView 案より表示自由度を優先（SRS指定）。
- **WebView は TypeScript 実装（tsc のみ・専用 tsconfig）**: 素の `main.js` 案は不採用。拡張ホスト⇔WebView のメッセージ型（12章）を `types.ts` で共有し、`postMessage` 境界を型安全化できる利点を優先した。バンドラ（esbuild 等）も不採用——WebView が単一ファイル・外部ランタイム依存なしで、共有型を `import type` で参照すれば生成物が単一の `media/main.js` に収まり、`tsc -p tsconfig.webview.json`（`module: ESNext` / `moduleResolution: Bundler` / `lib: ["ES2022","DOM"]`）だけで成立するため。WebView が複数ファイル化、または npm 依存をブラウザ側に持つ必要が生じた時点で、esbuild 等の導入を再検討する。
- **ファイル未オープン中の非作業は記録しない**: 制約ではなく当然の帰結。Inactivity は計測時間（FileActivity）から有効作業時間を差し引く補正であり、ファイルが無い ＝ 計測時間ゼロ ＝ 差し引く対象が無い。
