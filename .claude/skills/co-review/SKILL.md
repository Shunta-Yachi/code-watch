---
name: co-review
description: 指定されたコミットについて、ユーザーと共にコードレビューを行う
argument-hint: "[commit_hash]"
arguments: [commit_hash]
model: Opus
effort: xhigh
---

# Co-Review

## Overview

- ユーザーと一緒に、1つのコミット(変更セット)のコードレビューを行う
- 実際のコードレビューは複数ファイルにまたがるため、レビューの単位はファイルではなくコミットとする

## Variables

- <commit_hash>: $commit_hash が指定されていればその値。未指定の場合は`git rev-parse <commit_hash>` でHEADのコミットフルハッシュを用いる
- <short_hash>: `git rev-parse --short <commit_hash>` で取得した短縮ハッシュ
- <changed_files>: `git show --name-only --format= <commit_hash>` で取得した、そのコミットが変更した全ファイルのパス一覧

## Procedure

### Step 0. Preflight Check

- `git status`を実行
- 以下を確認
  - developブランチであること
  - git working treeがクリーンであること
  - 以上の条件が満たされない場合、ユーザーに警告を出し、スキルの実行を継続するか終了するかを選ばせる
- `git show $commit_hash`を実行
  - コミットメッセージと、全ファイルの差分を精読する
- <changed_files> を確認し、レビュー対象ファイルの一覧をユーザーに提示する

### Step 1. Ensure the user understands the code

#### Context

- 前提として、ユーザーのコーディング知識は初心者から中級者の中間程度
- そのため、まずはレビュー対象のコードへのユーザーの理解度をある程度担保しなければならない

#### Procedure

- 変更セット全体の中に、挙動のわからないコードがあるかを問う(コミットにつき1回のみ)
  - 必要であればファイルごとに順を追って確認する
- ユーザーが明示的に次のステップに進むよう指示するまで、以下の処理をループする:
  - 1: ユーザーが質問
  - 2: Claudeが解説。なるべく端的に、脱線を避けて。Claudeから「まだありますか？」のような問いは発さず、あくまで疑問への回答のみに徹する

### Step 2. Review by the user

- 変更セットのどこかに問題があるかユーザーに問う
  - ある場合: その指摘が妥当か判断する。ユーザーのコーディングレベルを考慮して、指摘を鵜呑みせず批判的に検討する
  - ない場合: 3に進む

### Step 3. Review by Claude

- 変更セット全体をレビューし、問題のありそうな点を重要度順にまとめる
  - 複数ファイルにまたがる問題(整合性・重複・依存関係など)にも注意する
- 重要度順に、一つずつユーザーと話し合い対処する

### Step 4. Wrap Up

- docs/review-log/ の有無をチェック。なければ作る
- 次の名前で Review Log ファイルを作成する: docs/review-log/<YYYY-MM-DD>\_<short_hash>.md
  - <YYYY-MM-DD> は `date +%F` で取得した今日の日付
  - <short_hash> は Variables 参照
- 以下の記法指示に従い、Review Logを書く
- Review Log と、（あれば）修正・変更をステージング・コミットする
  - その他のファイルがワーキングツリーにある場合、ユーザーに対処の方針を問う

## Review Log Format

```markdown
# Review Log: <short_hash>

## Metadata

- Review Date: <YYYY-MM-DD>
- Reviewed Commit: <commit_hash>
- Commit Message: コミットメッセージ全文
- Files:
  - path/to/file_a.ts
  - path/to/file_b.ts

## Questions from User

- Q1: aaa
  - A1: bbb
- Q2: xxx
  - A2: yyy

ユーザーとClaudeのQ&Aを記録。ユーザーの質問文は原則、逐語的に記録。Claudeの回答文は可能な限り簡素に要約。

## Problems and fixes

- P1: aaa
  - F1: bbb
- P2: xxx
  - F2: yyy

| Problem | Finder |
| ------- | ------ |
| P1      | User   |
| P2      | Claude |

そのレビュー全体で判明したコードの問題と、それに対して行った対処を簡潔にまとめる。
```
