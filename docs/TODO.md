---
Description: 開発者用TODOリスト
---

# TODO

Final Goal: MVP作成

## Milestone A: 開発環境セットアップ

Goal: リポジトリの開発環境セットアップ

- [x] AI駆動開発セットアップ
  - [x] AGENTS.md
  - [x] CLAUDE.md
- [x] Gitセットアップ
  - [x] Git運用ルールの策定
  - [x] 開発用ブランチ作成
- [x] VSCEプロジェクト雛形作成
  - [x] package.json / tsconfig.json
  - [x] ESLint / Prettier 設定
  - [x] better-sqlite3 ネイティブ依存の動作検証 (src/db/verifySqlite.ts)
- [x] WebView ビルド構成 (TypeScript)
  - [x] webview 用 tsconfig 追加 (tsconfig.webview.json: module ESNext / lib DOM / outDir media)
  - [x] compile / watch スクリプトに webview ビルドを追加
  - [x] 生成物 media/main.js を .gitignore へ追加
- [x] package.json コマンド定義 (contributes.commands)
- [x] テスト基盤セットアップ (Vitest 導入 / npm test スクリプト)
- [x] セットアップレビュー

## Milestone B: 設計

Goal: MVPの設計

- [x] SRS（要件定義 / 01-requirements.md）作成
- [x] SRSレビュー
- [x] HLD（基本設計 / 02-high-level-design.md）作成
- [x] HLDレビュー
- [x] LLD（詳細設計 / 03-low-level-design.md）作成
- [x] LLDレビュー（全13章）

## Milestone C: 実装

Goal: MVP機能の実装

### C-1. DB基盤

- [x] DB初期化処理 (globalStorageUri配下に code-watch.sqlite を作成)
  - [x] PRAGMA設定 (foreign_keys ON / WAL / STRICT)
  - [x] スキーマ作成 (Sessions / FileActivities / Inactivities / InactivityTypes)
  - [x] InactivityTypes の初期シード (sleep / unfocused / idle)
- [x] レコード操作関数の実装
  - [x] Session の作成 / ended_at 更新
  - [x] FileActivity の作成 / ended_at 更新
  - [x] Inactivity の作成
- [x] テスト: DB初期化処理 (PRAGMA / スキーマ / 初期シードの検証)
- [x] テスト: レコード操作関数 (各レコードの作成 / ended_at 更新の検証)
- [x] コードレビュー (C-1)

### C-2. 作業時間計測

> 依存注入によりコアは単体テスト可 (偽クロック + 実インメモリDB)。VS Code イベント購読の配線部のみ 結合テスト / Milestone D でカバー (LLD 13章)

- [x] セッション計測の開始 (Workspace起動時)
- [x] セッション計測の終了 (Workspace終了時, deactivate)
- [x] ハートビートによる定期保存 (デフォルト30秒毎の ended_at 更新)
- [x] 複数ワークスペース並行稼働の対応 (セッションを個別管理)
- [x] テスト: セッション計測 (start/heartbeat/stop による Session 行の生成・ended_at 更新)
- [ ] コードレビュー (C-2)

### C-3. ファイル別計測

> 依存注入によりコアは単体テスト可 (FileRef + 偽クロック + 実インメモリDB)。VS Code イベント購読の配線部のみ 結合テスト / Milestone D でカバー (LLD 13章)

- [x] アクティブファイルの切り替え検出 (onDidChangeActiveTextEditor)
- [x] FileActivity の開始 / 終了の紐付け
- [x] テスト: ファイル別計測 (アクティブ切替での FileActivity 開始/終了, file スキーム判定)
- [ ] コードレビュー (C-3)

### C-4. 非作業時間検出

- [x] idle 検出 (操作無し, 閾値3min)
- [x] unfocused 検出 (ウィンドウ非フォーカス, 閾値2min)
- [x] sleep 検出 (スリープ復帰, 閾値1min)
- [x] 閾値判定と優先順位制御 (sleep > unfocused > idle)
- [x] 閾値超過時のみ Inactivity レコード化
- [x] テスト: 非作業検出の状態機械 (idle/unfocused/sleep の区間生成 / 閾値超過判定 / 優先順位 sleep>unfocused>idle / sleepギャップによる truncate)
- [ ] コードレビュー (C-4)

### C-5. 設定

- [x] タイムゾーン判定の実装 (Intl 利用 / UTCフォールバック)
- [x] package.json 設定スキーマ (codeWatch.timezone を主要ゾーンの enum ドロップダウン + (custom) / codeWatch.timezoneCustom)
- [x] 設定値の読み込み (timezone / (custom)時は timezoneCustom / 空はOS自動 → UTCフォールバック)
- [x] テスト: タイムゾーン判定 (主要ゾーン選択 / custom / Intl 自動判定 / 不正時の UTC フォールバック)
- [ ] コードレビュー (C-5)

### C-6. 作業記録閲覧 (WebView)

- [x] WebView パネル実装
  - [x] WebviewViewProvider の登録 (codeWatch.activityView)
  - [x] WebView HTML / CSS 雛形の作成 (main.js は src/webview-ui/main.ts から生成)
  - [x] 共有メッセージ型を types.ts に定義 (MessageToExtension / MessageToWebview)
  - [x] src/webview-ui/main.ts (TS, ブラウザ側) 実装
  - [x] 拡張 ⇔ WebView 間メッセージング (集計データ受け渡し / 日付切り替え)
- [x] 集計ロジック実装
  - [x] 区間の日付按分ユーティリティ (タイムゾーン基準で [started_at, ended_at] を日ごとに分割)
    - 例: 6/1 22:00Z〜6/3 02:00Z → 6/1: 2h, 6/2: 24h, 6/3: 2h
  - [x] ファイル別作業時間の算出 (ended_at - started_at - 非作業時間, 日付別)
  - [x] ワークスペース別集計 (ファイル別作業時間の合計)
  - [x] 日付別トータル集計 (ファイル別作業時間の合計)
- [x] 表示UI実装
  - [x] トータル作業時間の表示
  - [x] ワークスペース別作業時間の表示
  - [x] ファイル別作業時間の表示
- [x] 日付切り替えボタンの実装
- [x] テスト: 集計ロジック (日付按分 / ファイル別算出 / ワークスペース別・トータル集計)
- [ ] コードレビュー (C-6)

## Milestone D: パッケージング・リリース

Goal: MVPの動作確認とリリース

- [ ] linux-x64向け vsix のパッケージング (package:linux-x64)
- [ ] WSL Remote環境での動作確認 (計測〜記録〜閲覧の一連)
- [ ] コミットルールに沿ったリリース (バージョン更新 / master マージ / タグ付け)
