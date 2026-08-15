# HIT Log — change spec (v2)

Single-file PWA (`index.html`), vanilla JS, no build step, no dependencies. All state in
`localStorage` under key `hitlog.v2`. Deployed via GitHub → Netlify.

Work on a branch. **One commit per lettered change**, message prefixed with the letter
(e.g. `A: fix note textarea focus bug`) so any single item can be reverted independently.
Do not reformat or restructure unrelated code. Do not add dependencies, a build step, or
a framework.

---

## Verify before editing

Confirm each of these exists in `index.html` as written. If any does not match, stop and
report the mismatch rather than guessing — the file may have moved ahead of this spec.

```js
const LIB = {
  fly:      {n:"Dumbbell Flies",            g:"Chest",           rr:"10-15", mult:2, step:5,  unit:"per dumbbell",     baseSet:"11x75",  baseOn:"2026-01-22"},
  incline:  {n:"Low-Incline DB Press",      g:"Chest",           rr:"6-10",  mult:2, step:5,  unit:"per dumbbell",     baseSet:"9x75",   baseOn:"2026-04-03", ...},
  flat:     {n:"Incline DB Press (30°)",    g:"Chest",           rr:"6-10",  mult:2, step:5,  unit:"per dumbbell",     baseSet:"",       baseOn:"",           ...},
  pulldown: {n:"Palms-Up Pulldown",         g:"Back",            rr:"6-12",  mult:1, step:10, unit:"stack",            baseSet:"10x209", baseOn:"2026-05-08"},
  row:      {n:"Seated Cable Row",          g:"Back",            rr:"6-12",  mult:1, step:10, unit:"V-handle",         baseSet:"8x225",  baseOn:"2026-07-28"},
  deadlift: {n:"Barbell Deadlift",          g:"Posterior Chain", rr:"6-10",  mult:1, step:10, unit:"total bar",        baseSet:"11x355", baseOn:"2026-06-21"},
  // ... (other entries)
  dips:     {n:"Dips",                      g:"Chest",           rr:"5-12",  mult:1, step:5,  unit:"net: BW minus assist", baseSet:"6x297", baseOn:"2026-04-24", ...},
  sapd:     {n:"Straight-Arm Pulldown",     g:"Back",            rr:"6-12",  mult:1, step:10, unit:"stack",            baseSet:"12x110", baseOn:"2026-01-22"},
  bbcurl:   {n:"Barbell Curl",              g:"Biceps",          rr:"6-12",  mult:1, step:5,  unit:"total bar",        baseSet:"9x95",   baseOn:"2026-02-10"}
};

const DEFAULT_PROGRAM = {
  A:{focus:"Chest & Back",     list:["fly","incline","flat","pulldown","row","deadlift"]},
  B:{focus:"Legs & Abs",       list:["legext",{alt:["legpress","squat"]},"legcurl",{alt:["donkey","calf"]},"abs"]},
  C:{focus:"Shoulders & Arms", list:["facepull","lateral","revfly","curl","pushdown","dips"]}
};
const ORDER = ["A","B","C"];
const TARGET_DAYS = 21;
```

`targetFor(id)` reads `lastKnown(id)`. `bestFor(id)` ranks by `x.e1` (Epley e1RM).
`commit(id)` pushes `{ex, reps, weight, failure, note, e1, vol}`. `setv()` calls
`render()` for the note field, destroying the textarea mid-typing. There is no `pullover`
entry in LIB. `bbcurl` is in LIB but NOT in DEFAULT_PROGRAM.

---

## A. BUG — note textarea loses focus after one keystroke

**Commit first, before all other changes.** This is a live defect.

`setv()` routes `note` to a full `render()`, which replaces `#view`'s innerHTML and
destroys the focused textarea. `renderKeepFocus()` only restores weight and reps inputs.

Nothing rendered on the card reads `st.note`, so no re-render is needed:

```js
function setv(id,k,v){
  var st = entryFor(id);
  st[k] = (k === "note" || k === "failure") ? v : (v === "" ? "" : Number(v));
  if(k === "note") return;                       // state only, no re-render
  if(k === "weight" || k === "reps") renderKeepFocus(k); else render();
}
```

This bug class also applies to the new bodyweight input in item I — that field must
not call `render()` on input either.

---

## B. Add `pullover` to LIB

The Nautilus Lat Pull Over has been in use since WO65 (2026-03-03), replacing the
Straight-Arm Pulldown. It has no LIB entry. Add:

```js
pullover: {n:"Nautilus Lat Pullover", g:"Back", rr:"6-12", mult:1, step:10,
           unit:"stack", baseSet:"7x240", baseOn:"2026-04-03",
           warn:"Lat pre-exhaust for the pulldown. Rest until your heart rate settles before the pulldown — muscular failure, not breathing failure."}
```

Baseline is 7x240 (WO69, heaviest weight achieved).

---

## C. Add `bbcurl` to DEFAULT_PROGRAM C and add `pullover` to A

NOTE: the user may have already added bbcurl to C on their end. If bbcurl is already
present in C, do not duplicate it — just reorder as shown.

```js
A:{focus:"Chest & Back",     list:["fly","incline","flat","pullover","pulldown","row","deadlift"]},
C:{focus:"Shoulders & Arms", list:["lateral","revfly","curl","bbcurl","pushdown","dips","facepull"]}
```

Changes vs current:
- **A**: `pullover` inserted after `flat`, before `pulldown` (lat pre-exhaust pair).
- **C**: `facepull` moved from first to last (documented interference with laterals).
  `bbcurl` added after `curl` (user's established order). If already present, just
  confirm position.
- **B**: unchanged.

---

## D. Correct baselines

Six baselines are wrong. Replace in LIB:

```js
bbcurl:   baseSet:"8x80",   baseOn:"2026-04-24"
// was 9x95 — no such set exists. First barbell curl is WO71 at 8x80.

sapd:     baseSet:"7x110",  baseOn:"2025-11-17"
// was 12x110 — WO61 note: "No set. Will drop and work up to 12." Actual was 5x110.
// True best by weight: 7x110. Exercise replaced by pullover at WO65 but stays in LIB.

abs:      baseSet:"24x150", baseOn:"2026-04-10"
// was 20x190 on old Precor Downstairs machine. Switched to new seated machine at WO66.

lateral:  baseSet:"10x30",  baseOn:"2026-07-09"
// was 9x35. Form change (lat-flare technique) is treated as a new exercise.
// Post-change best: 10x30ea (WO79).

facepull: baseSet:"11x40",  baseOn:"2026-07-09"
// was 16x75. WO79 note: "New WO completely. Fixed my technique."

revfly:   baseSet:"13x20",  baseOn:"2026-07-09"
// was 11x20. Beaten by WO79: 13x20ea.
```

Also update one baseline that is correct by the old ranking but wrong under the new
heaviest-weight ranking (item H):

```js
squat:    baseSet:"13x260", baseOn:"2026-07-21"
// was 20x235. 13x260 (WO80) is the heavy-weight PR.
```

---

## E. Update `dips` entry

Change `unit` from `"net: BW minus assist"` to `"lb"`. User enters total weight on hands
(bodyweight or bodyweight + belt). Add `bw:true` (used by targetFor in item G).

```js
dips: {n:"Dips", g:"Chest", rr:"5-12", mult:1, step:5, unit:"lb", bw:true,
       baseSet:"6x297", baseOn:"2026-04-24",
       warn:"Ramp back over 3-4 cycles. Stop if the right pec talks."}
```

---

## F. Move baselines out of code (shareable app)

The app should ship clean so other users don't inherit the owner's PR history.

1. Strip `baseSet` and `baseOn` from every LIB entry (set both to `""`).
2. Add `S.baselines = {}` to the store (in `blank()` and the `load()` migration).
3. Change `lastKnown(id)` and `bestFor(id)` to read from `S.baselines[id]`
   instead of `e.baseSet` / `e.baseOn`. The seed-check logic stays the same:
   parse `S.baselines[id]` as `"RxW"`, return `{reps, weight, date, seeded:true}`.
4. In the Data tab, add a **"Load baselines"** button that accepts a `.json` file.
   The file format is `{"exercise_id": {"set":"RxW", "date":"YYYY-MM-DD"}, ...}`.
   On load, write the contents to `S.baselines`, `save()`, `render()`,
   and toast the count of exercises loaded.
5. Also add an **"Export baselines"** button that writes current `S.baselines`
   (or generates it from `bestFor` for every exercise that has logged data) to a
   downloadable `.json` file. This lets users back up their PRs and share them.
6. Existing `S` stores that have no `baselines` key: migrate by reading `baseSet`/
   `baseOn` from the OLD LIB values and writing them into `S.baselines` on first load
   after the update. This preserves data for the current user. The migration runs
   once: check `if(!d.baselines)`, populate from the pre-strip LIB snapshot, set
   `d.baselines` on the store.

Generate a separate file `mike-baselines.json` with the corrected values from item D
plus all other correct baselines, for the owner to load on first use after the update.

---

## G. `targetFor` chases the best set, not the last set

Change `targetFor(id)` to build its target from `bestFor(id)` instead of `lastKnown(id)`.
A rough session must not permanently ratchet the target down.

### G1. PR definition and ranking

**PR = most reps at the heaviest weight achieved.** Weight takes priority. If two sets
are at the same weight, the one with more reps wins.

Change `bestFor(id)` to rank by:
1. Heaviest effective weight (`weight * e.mult`), descending
2. Most reps at that weight, descending

Remove the Epley e1RM ranking. Keep computing `e1` on the set object for export, but
it no longer drives `bestFor`.

### G2. The open card shows Last, PR, and Target

Required: once the target derives from the best set, a card reading `Last: 5 × 75`
above `Target: 10 × 75` is unexplainable without the PR line.

```
Last:    5 × 75 ea          Jul 28
PR:      9 × 75 ea          Apr 3
Target: 10 × 75 ea
```

- **Last** — most recent set, from `lastKnown(id)`, with its date.
- **PR** — best set, from `bestFor(id)` (ranked per G1), with its date.
  Show `archived` prefix if seeded from baselines.
- **Target** — derived from the PR set.

When last and PR are the same set, render one line labeled `Last / PR`.

Leave the collapsed card as-is (one line, PR is one tap away).

### G3. Target-explaining copy references the PR set

The `cap` strings and `.bump` banner currently explain the target in terms of `t.prev`
(which was the last set). They must reference the **PR** set: e.g.
`"3 short of your PR: 9 × 75 ea."` The `Last` line stays informational with no
commentary.

Also: `"Next session goes to "+(wt + e.step)` must use `bumpWeight(wt, e)` from item H.

### G4. Bodyweight-loaded exercises

For exercises with `bw:true` (currently only `dips`): bodyweight is falling, so
best-set targeting would pin the target to a load that no longer exists.

- target **reps** = PR rep count + 1 (or reset to bottom of range if PR met the top)
- target **weight** = leave null so the field is entered fresh each session

---

## H. Percentage-based weight bumps

Add a `pct` field to every LIB exercise, default `5`. `step` becomes the machine's
minimum increment (rounding granularity).

```js
function bumpWeight(w, e){
  var raw = w * (e.pct == null ? 5 : e.pct) / 100;
  return w + Math.max(e.step, Math.round(raw / e.step) * e.step);
}
```

The `Math.max(e.step, ...)` floor prevents zero-increment on light weights (5% of a
20 lb cable stack rounds to zero).

Surface `pct` in the new-exercise form in `pickerFor()` (default 5). Include in
`exportJSON()`'s `library` block.

---

## I. Session bodyweight

Add a bodyweight field to each session.

- `startSession()` writes `bodyweight: null` onto the draft.
- The in-progress session header shows an editable bodyweight input (lb), blank by
  default. Optional — never block finishing a session on it.
- This input must NOT call `render()` on input (same bug class as item A). Write to
  `S.draft.bodyweight` and return.
- Persist on saved session object. Include in `exportJSON()`.
- Prefill from the most recent session that has one.

---

## J. Remove e1RM from the UI

- Drop the e1RM value from history set rows and from the collapsed done-card header
  (currently `s.e1+' lb e1RM'`).
- Keep computing `e1` on the set object and in exports. It leaves the interface only.

---

## K. `commit` writes a timestamp

In `commit(id)`, add `t: new Date().toISOString()` to the pushed set object.

---

## L. Schedule constants and copy

- `const TARGET_DAYS = 24;` (was 21).
- In `viewData()`, change "every Friday" to "every Tuesday" in the program description.

---

## Acceptance checks

1. `setv("dips","note","abc")` mutates `entry.dips.note` without calling `render()`
2. LIB contains a `pullover` entry with `rr:"6-12"` and `warn` mentioning heart rate
3. `resolveList("A",0)` includes `"pullover"` between `"flat"` and `"pulldown"`
4. `resolveList("C",0)` ends with `"facepull"` and contains `"bbcurl"` after `"curl"`
5. `resolveList("B",0)` and `resolveList("B",1)` still alternate leg press/squat
   and donkey/seated calf
6. LIB.bbcurl.baseSet is `"8x80"`, LIB.lateral.baseSet is `""` (stripped by item F),
   and `S.baselines.lateral` after import is `{set:"10x30", date:"2026-07-09"}`
7. `bestFor("incline")` ranks by heaviest weight, not Epley e1RM
8. `targetFor("pulldown")` derives from the best set (10x209), not from a later
   worse set
9. `targetFor("dips")` returns a null weight and a rep target based on best rep count
10. `bumpWeight(20, {step:5, pct:5})` → 25; `bumpWeight(640, {step:20, pct:5})` → 680
11. An open card where last != PR shows three lines: Last, PR, Target
12. An open card where last == PR shows a combined `Last / PR` line
13. No `cap` or `.bump` string explains the target in terms of the last set when
    last and PR differ
14. No string `e1RM` remains in rendered output
15. The bodyweight input does not call `render()` on input
16. Typing a note, then tapping reps `+`, leaves note text intact
17. Export includes `sessions[0].bodyweight`, `sessions[0].sets[0].t`,
    `library.dips.pct`, and `baselines`
18. A fresh `blank()` store has `baselines:{}` and every exercise shows "set baseline"
19. After loading `mike-baselines.json`, `bestFor("lateral")` returns `{reps:10, weight:30}`
20. Existing saved sessions survive — do not change the `hitlog.v2` storage key.
    Treat missing `bodyweight`, `t`, `pct`, and `baselines` as absent, not invalid.

---

## Migration note

The baseline migration in item F is critical: existing users who update the code must
not lose their seeded data. On first load after the update, if `S.baselines` is
undefined, populate it from the OLD hardcoded LIB values (snapshot them in a const
before stripping). After migration, the LIB fields are empty and `S.baselines` is the
sole seed source.
