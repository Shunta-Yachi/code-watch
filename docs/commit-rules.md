# Rules of Commits

- Conventional Commits
- Semantic Versioning

この二つを中心に据える。
デフォルトで許可される feat / fix のほか、本リポジトリでは以下のprefixを使用できる

- docs: ドキュメント類の変更の場合
- refactor: 内部の書き方の変更に留まる場合
- ai: Claude Code / Codex 関連のファイルに対する変更の場合
- chore: カテゴライズ不要な些事
- style: 画面表示のみに関わる変更

なお、コミットメッセージは原則として日本語を用いる

## SemVerとの連携

本リポジトリで扱うあらゆるバージョン管理はSemVerによる
Conventional Commitsとの対応は以下

- MAJOR Change
  - type prefixの末尾に ! かつ、footerに BREAKING CHANGE: を記入
  - 本来のSemVerでは片方だけでもよいが、本リポジトリでは両方を使用
  - すべての prefix で使用可能
- MINOR Change
  - 原則、 feat のみ
- PATCH Change
  - 原則、 fix のみ

## 運用方法

- すべての開発は develop ブランチで行う
- 実装とテストがひと段落ついた段階で、ユーザーによるレビューを行う
- ユーザーのレビューが終了したとき、package.jsonのversionを上げ、それ単体のコミットを作る
- その後ただちに develop ブランチを master ブランチにマージする
  - この際 non-ff でマージする
  - マージコミットのメッセージは、以下のtypeに限定される
    - something!:
    - feat:
    - fix:
  - このマージコミットにタグを設定する
- 雑多なコミットはマージ前に squash してある程度整理しておく
  - (fix typo等)
- 仕様書のバージョンなど、細部のバージョニングを行った場合、原則としてそのコミットも行う

## コマンド例

```bash
npm version 1.0.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: バージョンを1.0.0に更新"
git switch master
git merge --no-ff develop -m "feat: 1.0.0をリリース"
git tag v1.0.0
git switch develop
```
