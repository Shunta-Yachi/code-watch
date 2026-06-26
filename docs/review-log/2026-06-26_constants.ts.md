# Review Log: constants.ts

- Date: 2026-06-26
- File: @src/constants.ts

## Code Diff

```diff
 export const DB_FILE_NAME = "code-watch.sqlite";
+
+/**
+ * Interval used to persist open tracking intervals.
+ */
+export const HEARTBEAT_INTERVAL_MS = 30_000;
```

コミット `65376b2`「feat: セッション計測を実装」で、`HEARTBEAT_INTERVAL_MS`(値 `30_000`)を追加。
`extension.ts` の `setInterval` で 30 秒ごとに `sessionTracker.heartbeat()` を呼ぶために使用される。

## Questions from User

- Q1: アンダースコアは、可読性のため？
  - A1: はい。`30_000` は数値区切り文字(numeric separator)で、桁を見やすくするためだけのもの。`30_000` と `30000` は同じ値で動作に影響しない。
- Q2: なぜMSを使う？ Minutes、Secondsのほうがわかりやすいのでは？
  - A2: `_MS` はミリ秒の意味。`setInterval` / `setTimeout` の単位がミリ秒固定のため、ミリ秒で持てば変換なしでそのまま渡せ、単位の取り違えバグも防げる。

## Problems

- P1: TSDoc コメント `Interval used to persist open tracking intervals.` が不正確・不明瞭。"interval" が「時間間隔」と「追跡の単位」の二重の意味で使われ混乱を招き、実際の役割(heartbeat による進行中セッションの周期的な永続化)も表現できていない。
  - F1: コメントを `Interval (in milliseconds) at which the active session's heartbeat fires to periodically persist tracking progress.` に書き換えた。

| Problem | Finder |
| ------- | ------ |
| P1      | Claude |

> [!NOTE]
> P: Problem, F: fix
