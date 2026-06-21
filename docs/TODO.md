---
Description: 開発者用TODOリスト
Purpose:
  - タスク実施 → 次のタスク考案 → タスク実施 のループではなく、タスク考案 → タスク実施と全体のプロセスを二分化したい
  - ファーストステップを軽くすることで、始めやすい・続けやすい状況にしたい
Rule:
  - すべてのタスクは、実行可能な単位に細分化する
  - 細分化の目安は30分とする
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
- [ ] package.json コマンド定義 (contributes.commands)
- [ ] テスト基盤セットアップ (Vitest 導入 / npm test スクリプト)

## Milestone B: 設計

Goal: MVPの設計

- [x] MVP仕様書.md作成
- [x] テーブル設計書作成

## Milestone C: 実装

Goal: MVP機能の実装

### C-1. DB基盤

- [ ] DB初期化処理 (globalStorageUri配下に code-watch.sqlite を作成)
  - [ ] PRAGMA設定 (foreign_keys ON / WAL / STRICT)
  - [ ] スキーマ作成 (Sessions / FileActivities / Inactivities / InactivityTypes)
  - [ ] InactivityTypes の初期シード (sleep / unfocused / idle)
- [ ] レコード操作関数の実装
  - [ ] Session の作成 / ended_at 更新
  - [ ] FileActivity の作成 / ended_at 更新
  - [ ] Inactivity の作成
- [ ] テスト: DB初期化処理 (PRAGMA / スキーマ / 初期シードの検証)
- [ ] テスト: レコード操作関数 (各レコードの作成 / ended_at 更新の検証)

### C-2. 作業時間計測

> ユニットテストは対象外 (VS Code API 依存。Milestone D の手動確認でカバー)

- [ ] セッション計測の開始 (Workspace起動時)
- [ ] セッション計測の終了 (Workspace終了時, deactivate)
- [ ] ハートビートによる定期保存 (デフォルト1分毎の ended_at 更新)
- [ ] 複数ワークスペース並行稼働の対応 (セッションを個別管理)

### C-3. ファイル別計測

> ユニットテストは対象外 (VS Code API 依存。Milestone D の手動確認でカバー)

- [ ] アクティブファイルの切り替え検出 (onDidChangeActiveTextEditor)
- [ ] FileActivity の開始 / 終了の紐付け

### C-4. 非作業時間検出

- [ ] idle 検出 (操作無し, 閾値3min)
- [ ] unfocused 検出 (ウィンドウ非フォーカス, 閾値2min)
- [ ] sleep 検出 (スリープ復帰, 閾値1min)
- [ ] 閾値判定と優先順位制御 (sleep > unfocused > idle)
- [ ] 閾値超過時のみ Inactivity レコード化
- [ ] テスト: 閾値判定と優先順位制御 (閾値超過判定 / 優先順位 sleep>unfocused>idle)

### C-5. 設定

- [ ] タイムゾーン判定の実装 (Intl 利用 / UTCフォールバック)
- [ ] codeWatch.timezone 設定値の読み込み
- [ ] テスト: タイムゾーン判定 (Intl 取得成功 / 取得失敗時の UTC フォールバック)

### C-6. 作業記録閲覧 (WebView)

- [ ] WebView パネル実装
  - [ ] WebviewViewProvider の登録 (codeWatch.activityView)
  - [ ] WebView HTML / CSS 雛形の作成
  - [ ] 拡張 ⇔ WebView 間メッセージング (集計データ受け渡し / 日付切り替え)
- [ ] 集計ロジック実装
  - [ ] 区間の日付按分ユーティリティ (タイムゾーン基準で [started_at, ended_at] を日ごとに分割)
    - 例: 6/1 22:00Z〜6/3 02:00Z → 6/1: 2h, 6/2: 24h, 6/3: 2h
  - [ ] ファイル別作業時間の算出 (ended_at - started_at - 非作業時間, 日付別)
  - [ ] ワークスペース別集計 (ファイル別作業時間の合計)
  - [ ] 日付別トータル集計 (ファイル別作業時間の合計)
- [ ] 表示UI実装
  - [ ] トータル作業時間の表示
  - [ ] ワークスペース別作業時間の表示
  - [ ] ファイル別作業時間の表示
- [ ] 日付切り替えボタンの実装
- [ ] テスト: 集計ロジック (日付按分 / ファイル別算出 / ワークスペース別・トータル集計)

## Milestone D: パッケージング・リリース

Goal: MVPの動作確認とリリース

- [ ] linux-x64向け vsix のパッケージング (package:linux-x64)
- [ ] WSL Remote環境での動作確認 (計測〜記録〜閲覧の一連)
- [ ] コミットルールに沿ったリリース (バージョン更新 / master マージ / タグ付け)
