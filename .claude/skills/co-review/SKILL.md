---
name: co-review
description: 指定されたファイルについて、ユーザーと共にコードレビューを行う
argument-hint: "[file_path]"
arguments: [file_path]
model: Opus
effort: xhigh
---

# Co-Review

## Overview

- ユーザーと一緒にコードレビューを行う

## Variables

- <file_name>: $file_path のベース名(ディレクトリを除いたファイル名。例 src/foo.ts → foo.ts)

## Procedure

### Step 0. Preflight Check

- `git status`を実行
- 以下を確認
  - developブランチであること
  - git working treeがクリーンであること
  - 以上の条件が満たされない場合、ユーザーに警告を出し、スキルの実行を継続するか終了するかを選ばせる
- `git show HEAD -- $file_path`を実行
  - 内容を精読

### Step 1. Ensure the user understands the code

#### Context

- 前提として、ユーザーのコーディング知識は初心者から中級者の中間程度
- そのため、まずはレビュー対象のコードへのユーザーの理解度をある程度担保しなければならない

#### Procedure

- レビュー対象の中に、挙動のわからないコードがあるかを問う(1ファイルにつき1回のみ)
- ユーザーが明示的に次のステップに進むよう指示するまで、以下の処理をループする:
  - 1: ユーザーが質問
  - 2: Claudeが解説。なるべく端的に、脱線を避けて。Claudeから「まだありますか？」のような問いは発さず、あくまで疑問への回答のみに徹する

### Step 2. Review by the user

- コードのどこかに問題があるかユーザーに問う
  - ある場合: その指摘が妥当か判断する。ユーザーのコーディングレベルを考慮して、指摘を鵜呑みせず批判的に検討する
  - ない場合: 4に進む

### Step 3. Review by Claude

- レビューを行い、問題のありそうな点を重要度順にまとめる
- 重要度順に、一つずつユーザーと話し合い対処する

### Step 4. Wrap Up

- docs/personal/review-log/ の有無をチェック。なければ作る
- 次の名前で Review Log ファイルを作成する: docs/review-log/<YYYY-MM-DD>\_<file_name>.md
  - <YYYY-MM-DD> は `date +%F` で取得した今日の日付
  - <file_name> は $file_path のベース名(Variables参照)
- 以下の記法指示に従い、Review Logを書く

## Review Log Format

```markdown
# Review Log: <file_name>

## Metadata

- Review Date: <YYYY-MM-DD>
- Commit: <commit_hash>
- Path: $file_path

## Code Diff

対象ファイルのDiffを表示。

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
