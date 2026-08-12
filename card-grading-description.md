# How cards are fetched from 17Lands and graded

## Fetching from 17Lands

Source: `src/lib/getCardStore.ts`

1. **API call** — `fetchApiCards` (`getCardStore.ts:48`) hits `https://www.17lands.com/api/card_data` with query params:
   - `expansion` — set code, uppercased unless `code17Lands` is set on the `MagicSet`
   - `event_type` — format (PremierDraft, TradDraft, PickTwoDraft)
   - `time_period` — e.g. ALL_TIME
   - `colors` — optional, only for color-specific deck requests (uppercased, e.g. "WU")

   It spoofs a browser `User-Agent`/`Referer` and is wrapped in `retry` with exponential backoff (max 10 retries).

2. **What's fetched** — First the "all decks" data, then one request per color pair defined in `set.decks`. Each response is an envelope `{ data: ApiCard[] }` with per-card fields like `avg_seen`, `avg_pick`, `ever_drawn_win_rate`, `ever_drawn_game_count`, `game_count`, `win_rate`, etc.

3. **Cache / short-circuit** — The store is cached (file or Postgres). If a cached version exists and every card's `game_count` is identical to the fresh API data (`isExactMatch`), the old store is reused without re-grading.

4. **Enrichment** — Cards are joined to a Scryfall index (from the `default-cards` bulk file) to get name, color, CMC, and types. The 17Lands `url` is the primary key. Split cards have `///` normalized to `//`.

## Grade assignment

Source: `src/lib/CardGrader.ts`

Grades are **relative within each deck/color pair** (including "all"), so an A is not an absolute winrate — it means the card ranks in roughly the top 5% *of its own color pair*.

1. **Collect** — `add()` records each card's `ever_drawn_win_rate` and `ever_drawn_game_count` per deck.

2. **Filter** —
   - Cards with <100 drawn games are excluded from the reference distribution.
   - Cards with ≤500 drawn games get **no grade at all** and are dropped from the store.

3. **Normalize** — For each deck, the remaining winrates are fit to a normal distribution (`mean`/`std` via mathjs), and each card's winrate is converted to a percentile via the CDF, producing a **score 0–100**.

4. **Map to letter** — The score is looked up in `GRADE_THRESHOLDS`:

   | Score | Grade |
   |-------|-------|
   | ≥99   | A+    |
   | ≥95   | A     |
   | ≥90   | A-    |
   | ≥85   | B+    |
   | ≥76   | B     |
   | ≥68   | B-    |
   | ≥57   | C+    |
   | ≥45   | C     |
   | ≥36   | C-    |
   | ≥27   | D+    |
   | ≥17   | D     |
   | ≥5    | D-    |
   | else  | F     |
