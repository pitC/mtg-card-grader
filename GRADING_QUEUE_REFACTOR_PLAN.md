# Grading Queue Refactor — Implementation Plan

> Covers objectives in `GRADING_SCENARIOS.md` as clarified 2026-09-17. No implementation yet — this is the build blueprint for `grading-queue-refactor` branch.

## 1. Goals & Non-Goals

**Goals (per clarifications):**
- G1: Grading queue is an immutable snapshot taken only on entry to grading mode (`GRADING_SCENARIOS.md:4` + clarification #1, #15).
- G2: Sort order = grid swimlane order: grade buckets `A > B > C > D > E > Ungraded` (`js/constants.js:1`, `js/render.js:431`), within-lane color order = Scryfall `order=color` (`js/scryfall.js:167`) which is `Colorless -> W -> U -> B -> R -> G -> multicolor` (clarification #2). Rely on fetch order stability, not re-sorting by color code.
- G3: Grading a card never mutates the queue (clarification #3, #5, #12); auto-advance moves `gradingIndex` forward in snapshot; `Back` can revisit just-graded card even if it no longer matches entry filter (Scenario 4).
- G4: Navigation wraps (cycles) when `queue.length > 1` (clarifications #8, #9); single-card queue disables auto-advance and both buttons (clarification #13).
- G5: Startup: if any ungraded exists → grade mode with `ungraded` snapshot; else → grid mode, toggle loads `all` snapshot (Scenario 1/2, clarification #7).
- G6: Grid-card click derives snapshot from current grid filters (including `gridFilters.grades/colors/rarities/query` + `compareActive/compareFilter`) and starts at clicked card (Scenario 3/4, clarification #11).
- G7: Toggle `grade -> grid` shows all grades, no auto-filter to `ungraded` (clarification #6). Scroll `window/gridView` restored on return to grid (clarification #10).

**Non-Goals:** No persistence of queue across reload, no Firestore sync change, no new build step.

---

## 2. Current Implementation — Why It Fails the Scenarios

| Area | File | Current behavior | Violated principle |
|---|---|---|---|
| `applyFilter` derives `state.filtered` live on every `render` | `js/render.js:27-75` | Recomputes from `gridFlatFiltered(state)` which partitions `state.cards.filter(gridMatches)` live. For toggle entry without filters it recomputes `ungradedFlat` each render so grading `Card B` shrinks `filtered` and `index` is clamped — not snapshot-stable. | P3, P4 |
| `_forcedGradeCardId` / `_fromGrid` hacks to inject graded card into `ungraded` queue and to distinguish grid-enter vs toggle-enter | `js/render.js:37-66`, `js/gradeNav.js:17-58` | Back nav works by temporarily splicing forced card into `ungradedFlat`; breaks P3 (mutation) and makes wrap logic inconsistent. `_fromGrid` forces different `moveState` branch. | P1, P3, #8 wrap |
| `moveState` bounds: `prev/next` disable at ends, no wrap | `js/gradeNav.js:9`, `js/gradeNav.js:61`, `js/render.js:129` | Contradicts #8/#9 wrap requirement. | #8 |
| `gradeCurrentCard` calls `render` which re-derives `filtered`, so auto-advance is side-effect of filter recompute, not `index+1` in snapshot. Single-card auto-advance still advances with clamp. | `js/app.js:250-273` | Violates #13 (should stay). | #13 |
| Grid click sets `state._fromGrid=true` and `flat.indexOf(card)` then `setTab('grade',{index})` | `js/render.js:506-513` | Correct start index but snapshot not stored; subsequent grading mutates `filtered`. Also `filtered` vs `flat` divergence when `gridFiltersActive`. | P3 |
| Init: `allCardsGraded` check (`js/app.js:518`) auto-switches to grid, otherwise grade with `index=0` + live `applyFilter` | `js/app.js:514-524` | Works for Scenario 2 but `filtered` is ungraded-only live list, not snapshot object with wrap. | P4 |

**Takeaway:** Need explicit snapshot state; delete `_forcedGradeCardId`/`_fromGrid` and live `filtered` derivation in grade mode.

---

## 3. Proposed State Shape

Add to `state` in `js/app.js:18-36` (and test helpers):

```js
gradingQueue: null,   // null | Array<card> — immutable snapshot, ordered P2
gradingIndex: 0,      // integer index into gradingQueue for grade view
// keep for grid view:
filtered: [],         // still used only for grid view (or also grade but sourced from queue)
index: 0,             // grid index legacy? Option A: keep `index` as alias to gradingIndex when tab==='grade'
```

**Decision:** Keep `state.filtered` + `state.index` as grade-view source but populate them *once* from `gradingQueue` on entry, and never recompute in grade mode. Alternative — introduce `gradingQueue`/`gradingIndex` and make `renderGradeView` read from them. To minimize churn and keep tests simple, expose both:

- `state.gradingQueue` = snapshot array (or `null` when in grid)
- `state.gradingIndex` = cursor
- In grade mode: `state.filtered === state.gradingQueue` and `state.index === state.gradingIndex` (alias invariant, asserted in tests). `applyFilter` becomes no-op when `tab==='grade'`.

Remove: `state._forcedGradeCardId`, `state._fromGrid`.

New helper: `js/render.js` `buildGradingQueue(state, options)` (pure, testable).

---

## 4. Queue Construction Algorithm — `buildGradingQueue(state, { source, anchorCard })`

Pure function, unit-testable without DOM.

```
function gridFlatFilteredForQueue(state):
  // same as current gridFlatFiltered but explicitly documents reliance on stable fetch order
  filtered = state.cards.filter(c => gridMatches(state, c)) // respects all active filters per #11
  lanes = Map(G→[] for G in GRADES), ungraded=[]
  for card in filtered:
    g = state.grades[card.id]?.grade ?? null
    (lanes.get(g) ?? ungraded).push(card) // preserves input order = scryfall order=color
  return [...GRADES.flatMap(g=>lanes.get(g)), ...ungraded]

function buildGradingQueue(state, { source }):
  if source === 'startup-ungraded':
    flat = gridFlatFilteredForQueue(state with no filters? see below)
    // Scenario 1: all ungraded cards, in P2 order
    // Since gridFilters empty at startup, gridFlatFiltered == P2 order; filter to ungraded
    return flat.filter(c => !state.grades[c.id])
  if source === 'startup-or-toggle-all':
    // Scenario 2 toggle when all graded, or any toggle with no entry filter? Spec says toggle with no grid-click but no filter at startup?
    // Per scenarios: startup-ungraded is case 1; toggle-all is "all cards in set" regardless of current grid filters? Clarification #6 says toggle grid->grade after all graded loads all.
    // Also Scenario 1 toggle to grid shows no filter; re-entering grade via toggle when some ungraded remain: what queue?
    // Decision: toggle entry (not grid click) always means ungraded snapshot if any ungraded, else all. But Scenario 2 says all when none ungraded.
    // For plan: define toggleQueue = ungradedFlat.length ? ungradedFlat : flat  (flat = gridFlatFiltered with filters ignored)
    // Note: per clarification #4, startup ignores filters; toggle entry should ignore current gridFilters and use global flat (all cards P2).
    flat = allCardsFlat(state) // gridFlatFiltered with gridMatches bypassed: partition all state.cards by grade, preserve order
    ungradedFlat = flat.filter(c => !state.grades[c.id])
    return ungradedFlat.length ? ungradedFlat : flat
  if source === 'grid-click':
    // Scenario 3/4: filtered by current gridFilters (including compare) at click time
    flatFiltered = gridFlatFilteredForQueue(state) // already filtered
    return flatFiltered
```

**Open nuance for plan review:** Scenario 3 says grid no-filter click → "all cards in set" - same as `gridFlatFiltered` with no filters = `allCardsFlat`. Scenario 4 says filter applied → filtered set. So `grid-click` unified as `gridFlatFiltered`. Toggle entry distinct: must ignore filters (use `allCardsFlat`). Confirm in implementation.

**Sorting guarantee:** Because `state.cards` is fetched `order=color` (`js/scryfall.js:167`) and `gridFlatFiltered` is stable partition, within-lane order automatically is Scryfall color order. Add test asserting `flat` preserves relative order from `state.cards` within each grade.

`anchorCard` (clicked card) determines `gradingIndex`: `queue.indexOf(anchorCard)` (or 0 for toggle/startup). If anchor not in queue (should not happen), fallback 0.

---

## 5. Entry Points — When Queue Is (Re)built

Only these call `buildGradingQueue` + `setTab('grade', ...)` (P4):

| Trigger | Source | Queue | Start index | File change |
|---|---|---|---|---|
| App init, some ungraded | `startup-ungraded` | ungraded P2 | 0 | `js/app.js:514-524` refactor `init()` |
| App init, all graded | no queue | — | — | `js/app.js:518` `setTab('grid')` keeps `gradingQueue=null` until toggle |
| Toggle `grid -> grade` (tabGroup click, `data-tab=grade`) | `toggle-all` | `ungradedFlat ?? flat` (P2, filter-agnostic) | 0 (clarification #7 top of A) | `js/app.js:340` + `js/render.js:531` `setTab` |
| Grid lane card click | `grid-click` | `gridFlatFiltered` with active filters at click time | `queue.indexOf(clickedCard)` | `js/render.js:502-514` |

Leaving grade (`setTab('grid')` or cardWrap click `js/app.js:362`) clears nothing except `tab`; `gradingQueue` retained until next grade entry where it is overwritten. `gridScrollTop` capture stays as-is (`js/render.js:542-549`).

Grading (`gradeCurrentCard`, `clearCurrentCard`) and `move()` must **not** call `buildGradingQueue` or `applyFilter`.

---

## 6. Navigation & Grading Side-Effects

**New `js/gradeNav.js:moveState` logic (grade mode):**

```
if (state.tab === 'grade' && state.gradingQueue) {
  if (state.gradingQueue.length <= 1) return // #13 disable both, no wrap
  len = state.gradingQueue.length
  next = (state.gradingIndex + delta) % len // wrap with mod (handle negative)
  if (next<0) next+=len
  state.gradingIndex = next
  state.index = next // alias
  state.filtered = state.gradingQueue // keep alias invariant
  resetGradeButtons(el); render(state,el) without rebuilding queue
  return
}
// grid mode: old linear logic unchanged (index clamp, no wrap needed)
```

Button disabled state (`js/render.js:126-134`): In grade mode with queue, `prevBtn.disabled = nextBtn.disabled = queue.length <=1`; else wrap means never disabled. Keep disabled for grid mode linear.

**Grading (`js/app.js:250` `gradeCurrentCard`):**

```
state.grades[card.id] = {cardName, grade, gradedAt}
 // do NOT rebuild queue/filtered
 if (state.gradingQueue.length === 1) {
   // #13: single card, stay on same card, just re-render seal/buttons
   resetGradeButtons(el); renderWithoutQueueRebuild(state,el); persist...
   return
 }
 // auto-advance in queue (wrap)
 state.gradingIndex = (state.gradingIndex + 1) % state.gradingQueue.length
 state.index = state.gradingIndex
 resetGradeButtons(el); renderWithoutQueueRebuild(...); persist...
```

`clearCurrentCard` similar but no auto-advance (stay on same index; if cleared, queue still contains card).

`handleGradeKeydown` delegates to same `move`/`gradeFn`, so wrap applies to arrow keys (#14).

**Render path:** Refactor `js/render.js:524` `render(state,el)` to `if (tab==='grade' && gradingQueue) { updateProgress; renderGradeView } else { applyFilter; ... }`. `applyFilter` becomes grid-only. Add `renderWithoutQueueRebuild` helper or add flag to `render`.

---

## 7. Scroll Retention

Keep existing `js/render.js:542-589` + `js/app.js:432-446` listeners. No change except queue refactor does not interfere. Already captures `window.scrollY / documentElement.scrollTop / gridView.scrollTop` on `grid -> grade` and restores on `grade -> grid` via `setTab('grid')` double-rAF. Verify with test covering clarification #10.

---

## 8. Testability — Scenario → Unit Test Mapping

All tests pure-state, jsdom as existing `test/render.test.js` & `test/gradeNav.test.js` pattern with `makeState()`/`makeEl()`. No network.

**New test file:** `test/gradingQueue.test.js` (or extend `render.test.js` + `gradeNav.test.js`) — prefer new file for plan, then merge per existing conventions (AGENTS.md: prefer editing existing).

**Helpers:** `makeCards` with deterministic `order=color` sequence: mix grades `A,B,ungraded` and colors `C,W,U,B,R,G,multicolor` to assert P2 stable order. Provide `makeStateWithGrades` helper.

| Scenario | Test case (Vitest) | Asserts |
|---|---|---|
| **P2 sort** | `buildGradingQueue sorts by grade then scryfall color` | Input cards in mixed order, expect lanes `[A:colorless,W,U] [B:...] [ungraded:W,C]` |
| **P2 colorless first** | `colorless before W within lane` | #3 clarification |
| **P4 snapshot immutable** | `queue not rebuilt on grade` | Build queue, grade `queue[0]` to B, expect `gradingQueue.length` unchanged and `queue[0]` still at index 0 with new grade when revisiting via Back |
| **S1 startup ungraded** | `init with some ungraded → grade queue = ungraded P2, index 0` | `makeState` with 2 ungraded, `buildGradingQueue(startup-ungraded)` length 2, not including graded |
| **S1 grade auto-advance + Back** | `grade advances to next, Back returns to graded card` | Wrap disabled for this queue? S1 has 2 ungraded → after grade first, index 1, Back → index 0 shows seal |
| **S1 wrap** | `next from last wraps to first, prev from first wraps to last` | Queue `[b,c,d]` length 3, index 2 → move(1) → index 0 |
| **S1 toggle to grid no filter** | `toggle grade->grid shows unfiltered grid (3 lane groups)` | `setTab('grid')` renders all, `gridFiltersActive===false` |
| **S2 startup all graded → grid** | `allCardsGraded → tab grid, queue null` | `allCardsGraded` true → `state.tab==='grid'` |
| **S2 toggle loads all P2** | `toggle grid->grade with all graded → queue = all P2, index 0 (top of A)` | `#7` |
| **S3 grid click no filter** | `click card C in unfiltered grid → queue = all P2, index at C` | `gridFlatFiltered` length 4, anchor index correct, wrap next/prev cycle whole set |
| **S3 scroll retain** | `grid scroll captured on entry, restored on exit` | Mock `window.scrollY`, `setTab('grade')` then `setTab('grid')` restores |
| **S4 grid click with grade filter A** | `click with filter grades=[A] → queue filtered to A only, P2` | Only A cards |
| **S4 re-grade + Back shows non-matching** | `grade A→B advances, Back shows B card even though queue was A-filtered` | After grade, `gradingQueue[0]` still present, `state.grades` shows B, move(-1) returns to it |
| **S4 queue not mutated after re-grade** | `second grade on revisited card does not splice queue` | Grade A→B→C, queue length constant 2 |
| **Single card** | `queue length 1: grade does not auto-advance, prev/next disabled` | `#13` |
| **Keyboard** | `ArrowLeft/Right wrap, A-E grades and auto-advance` | `#14` via `handleGradeKeydown` |
| **Compare filter** | `compareFilter over → queue respects comparisonMatchesFilter` | `#11` |
| **Within-lane scryfall order** | `multicolor after mono` | Cards with `colors:['W','U']` after mono |

**Existing tests to update:** `test/render.test.js:100` `applyFilter` tests that expect `grade` mode to derive `ungraded` live — will change to snapshot semantics. `test/gradeNav.test.js:73` base-order navigation tests expecting `_forcedGradeCardId` — will be replaced with queue wrap tests. Keep `renderGridView` lane tests unchanged.

**TDD flow (Red-Green-Refactor per AGENTS.md):**
1. Red: Add failing `test/gradingQueue.test.js` for P2 sort + snapshot immutability.
2. Green: Implement `buildGradingQueue` + `state.gradingQueue` in `js/render.js`, wire `setTab`/`init`/`grid click` to use it, make `moveState` wrap.
3. Red: Add S1/S2/S3/S4 scenario tests one by one, confirm failure.
4. Green: Wire each entry point; fix `gradeCurrentCard` auto-advance.
5. Refactor: Delete `_forcedGradeCardId`/`_fromGrid`, simplify `applyFilter` to grid-only, clean `renderGradeView` button disabled logic.

---

## 9. File Changes Inventory

| File | Change type | Details |
|---|---|---|
| `js/render.js` | **Major** | Add `buildGradingQueue`, `allCardsFlat`, expose `gridFlatFiltered` (keep) but make internal; modify `applyFilter` to no-op in grade mode; change `setTab` to build/restore queue; update `render` to avoid rebuilding; fix `renderGradeView` prev/next disabled for wrap; remove `_forcedGradeCardId` logic lines 37-66 |
| `js/gradeNav.js` | **Major** | Rewrite `moveState` to use `gradingQueue`/`gradingIndex` with modulo wrap, early return for single-card, remove `_forcedGradeCardId`/`_fromGrid` branches |
| `js/app.js` | **Medium** | Extend `state` with `gradingQueue`/`gradingIndex`; update `gradeCurrentCard`/`clearCurrentCard` to advance index not rebuild; update `init` startup branch; update tabGroup click handler (remove forced clears); update `move` delegate |
| `js/constants.js` | None | Grade order already correct |
| `js/scryfall.js` | None | Color order already via `order=color` |
| `test/gradingQueue.test.js` | **New** | Scenario-driven tests above |
| `test/render.test.js` | Edit | Update `applyFilter` expectations to snapshot; add queue sort tests |
| `test/gradeNav.test.js` | Edit | Replace base-order `_forced` tests with wrap tests |
| `css/`/`index.html` | None | |

---

## 10. Risks & Mitigations

- **Stable sort assumption:** `state.cards` order must remain Scryfall color order after caching (`js/scryfall.js:141` cache). Mitigation: test asserts `buildGradingQueue` preserves input order within lane; add comment in `fetchSetCards`/`loadSetCardsCache`.
- **Alias invariant drift:** `state.filtered`/`state.index` vs `gradingQueue`/`gradingIndex` could diverge. Mitigation: single source of truth (`gradingQueue`), alias set in one place (`setTab`/`move`/`grade`), assert invariant in tests.
- **Existing `_forced` behavior removal:** Could break no-filter navigation tests that expect splice. Mitigation: replace with explicit wrap tests; run `npm test` + `npm run lint` after each refactor step per AGENTS.md.
- **Scroll restore timing:** Double-rAF restore (`js/render.js:579`) may need re-trigger after queue refactor but logic unchanged. Add jsdom scroll test with mocked `requestAnimationFrame`.

---

## 11. Implementation Sequence (TDD)

1. **Branch ready:** `grading-queue-refactor` (already created).
2. **Step 1 — Pure queue builder:** Add `buildGradingQueue` + tests, no wiring. `npm test` red → green.
3. **Step 2 — State + entry points:** Wire `init` and grid-click to snapshot, delete `_fromGrid` writes. Tests for S1/S2/S3 red → green.
4. **Step 3 — Navigation wrap:** Rewrite `moveState`, update button disabled. Tests for wrap/single-card red → green.
5. **Step 4 — Grading side-effects:** Update `gradeCurrentCard` to use queue index, not `applyFilter`. Tests for P3/S4 red → green.
6. **Step 5 — Cleanup:** Remove `_forcedGradeCardId` from `state`, `applyFilter`, `renderGradeView`; simplify `render`. Lint + full suite green.
7. **Step 6 — Docs:** Update `AGENTS.md` quirks if needed, delete this plan or keep as `docs/`.

---

## 12. Verification Checklist

- [ ] `npm test` green (all Vitest jsdom, `npx vitest run --reporter=verbose test/gradingQueue.test.js`)
- [ ] `npm run lint` clean (`no-unused-vars` on new helpers, `eqeqeq`/`no-else-return` respected)
- [ ] Manual: startup with ungraded → grade queue ungraded, grade → next, Back → graded shows seal, Prev at first wraps to last, Next at last wraps to first
- [ ] Manual: startup all graded → grid, toggle → all P2 at top A, single-card set → no auto-advance
- [ ] Manual: grid filter A, click → queue filtered, re-grade A→B → next, Back → B card
- [ ] Manual: grid no-filter click → all, toggle grid with scroll → scroll restored

