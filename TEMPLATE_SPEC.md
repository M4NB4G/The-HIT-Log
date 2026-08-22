# HIT Log: Multi-Template Architecture Spec

Status: approved for implementation.

---

## 0. Handoff brief

You are implementing this spec against an existing single-file PWA. Read the
whole document before writing any code.

**Ground rules:**

1. **Verify before you trust.** This spec was written against `index.html` at
   904 lines. Every line number in section 2 is a pointer, not a fact. Re-read
   the file and confirm each reference resolves to what the spec claims. If the
   file has moved, say so and re-derive rather than patching blind.
2. **Work in the stated order.** Section 13 is sequenced by risk, not by
   convenience. Steps 1 and 2 are additive. **Step 3 is the migration and must
   ship alone**, with the user confirming their data survived before anything
   in step 4 or later is written. Do not batch step 3 with anything.
3. **Ask before changing anything not in this spec.** If implementation
   requires a decision the spec does not cover, stop and ask. Do not infer.
4. **Do not modify originals.** No destructive edits without approval.
5. **Bump `CACHE_VERSION` in `sw.js` on every deploy.** That file is not in the
   project directory and is not covered here, but the app will serve stale
   assets without it.

**Two behavior changes to expect, both intended, neither a bug:**

- Non-clean sets stop feeding progression and PRs (section 8). The user's
  2026-08-13 lateral raise at 8x35 was logged with partials, so it will
  reclassify and drop out of that exercise's PR. This is correct.
- `resetProgram()` stops resetting to `DEFAULT_PROGRAM` and starts re-seeding
  from an instance's own source template (section 3). The current behavior
  resets to the user's evolved routine while calling it a default.

**The single highest-risk fact:** the same deployed URL serves both the user and
a second person, whose data lives only in his own browser's localStorage. The v2
to v3 migration must be idempotent and must run correctly on a populated store
and an empty one. There is no way to test on his device first, and the only
diagnostic channel is asking him to export JSON, which is why section 10 adds
schema and instance fields to the export.

**Verification data available:** `hitlog_2026-08-21.json` in the project is a
real v2 export with two logged sessions. Use it as the migration test fixture.

---

Baseline for this document: `index.html` at 904 lines, storage key `hitlog.v2`,
export `version: 2`. If that file has moved again, re-verify section 2 before
implementing.

---

## 1. Goal

Let one deployment serve multiple training programs (yours, Perez's, and four
published routines) without forking the codebase, without a second URL, and
without any template switch being able to damage a program you have been
editing.

Non-goals: accounts, sync, sharing, server-side anything, importing the
`Health_Log.xlsx` archive.

---

## 2. What already exists (verified against the 904-line file)

Already done, do not rebuild:

- Baselines are separated from the exercise library. `S.baselines` holds
  `{set, date}` per exercise id, seeded from `LEGACY_BASELINES` (line 319) on
  first load. Every `baseSet` in `LIB` is empty. There is a baselines
  import/export pair in settings.
- `S.program` is fully user-editable: add, remove, reorder, custom exercises.
- Sets carry a `t` ISO timestamp. Sessions carry optional `bodyweight`.
- Progression derives from the PR (`bestFor`), not the last set (line 421).
- `bumpWeight` is percentage-based with a `pct` field, floored at `step`.
- Bodyweight exercises are flagged `bw:true` and skip load progression.
- `lastGroupDate(g)` already computes per-muscle-group recency.

Still hardcoded, and blocking multi-template:

| Line | Assumption |
| --- | --- |
| 274 | `WTHEME` keyed literally A/B/C |
| 339 | `ORDER = ["A","B","C"]` |
| 340 | `TARGET_DAYS = 24`, a single global number |
| 440 | `% 3` in `nextWorkout()` |
| 444 | `cycle % 2` in `resolveList()`, assumes exactly two alternates |
| 344 | `S.program` is one object, so there is nowhere to put a second program |
| 421 | `targetFor()` assumes one logged set per exercise per session |
| 801 | export payload has no schema version for the template layer |

Note: `TARGET_DAYS` currently reads 24 in the source. Resolved in section 11:
the Persyn target is 21 with a plus or minus three band, so the constant becomes
a `[18,24]` template field.

---

## 3. Core model: templates and instances

Two distinct things that are currently one object.

**Template.** Read-only reference data compiled into the app. Never mutated at
runtime. Carries provenance. Ships with defaults intended to be edited.

**Instance.** A user-owned working copy created from a template. Freely edited.
Holds a pointer back to its source template id. Multiple instances coexist.

Selecting a template creates a new instance. Switching programs selects a
different instance. Neither operation overwrites an existing instance. This is
the whole point: your program has already drifted from `DEFAULT_PROGRAM` (A runs
`flat, incline, fly` against the shipped `fly, incline, flat`; C runs `facepull`
third against the shipped `facepull` last), so any design where a template
switch writes into the single program slot would cost real work.

`resetProgram()` re-seeds an instance from **its own source template**, not from
a global default. Today it resets to `DEFAULT_PROGRAM`, which is your evolved
routine, not anyone's published routine. That naming is a lie and this fixes it.

### Migration identity

Your existing `S.program` becomes instance one, `source: "persyn"`, `edited:
true`. Nothing about your lists, alternations or order changes. All existing
sessions are stamped with instance one, which is unambiguous because the app has
only ever held one program. The 81-session 4-workout history in
`Health_Log.xlsx` is **not** imported and is not instance two. The schema does
not preclude adding it later.

---

## 4. Schema

```js
Template = {
  id:          "persyn",
  name:        "Persyn 3-Workout",
  source:      "Adapted from Mentzer, High-Intensity Training the Mike Mentzer
                Way (2003), compressed from four workouts to three.",
  adapted:     true,          // false only for routines reproduced as published
  rotation:    ["A","B","C"], // any length >= 1
  rest:        RestSpec,
  days:        { A: Day, B: Day, C: Day }
}

Day = {
  focus: "Chest & Back",
  note:  "",                  // optional, shown on the start screen
  slots: [ Slot, ... ]
}

Slot =
  { ex: "deadlift", sets: [SetSpec, ...] }              // fixed movement
| { alt: ["legpress","squat"], sets: [SetSpec, ...] }   // rotates by cycle
| { ex: "sapd", sets: [...], link: "preexhaust" }       // zero rest into next

SetSpec = {
  role:        "top" | "working",
  scheme:      "failure",
  progression: "double" | "follow" | null,
  rr:          "6-10"         // optional per-set override of the exercise rr
}
```

Rules:

- `sets` holds **logged** sets only. Warm-ups are never SetSpecs (section 6).
- Exactly one `role: "top"` per slot. It is the set that feeds progression and
  PRs. It is **not** necessarily the last entry: in Yates and Perez structures
  the governing set is set one and the dependent set follows it.
- `loadFactor` on a dependent set expresses its load as a fraction of the top
  set. Yates prescribes `0.9` (section 11). Omit for same-load.
- `rrAlt: ["8-10","15-20"]` alternates the rep range by cycle, resolved with the
  same `cycle % N` used for `alt`. Required by `yates_bng`, where the rep range
  itself is cycled deliberately rather than fixed.
- `alt` generalizes from two entries to N: `resolveList` becomes
  `it.alt[cycle % it.alt.length]`.
- `link: "preexhaust"` is a display and ordering hint (no rest before the next
  slot). It does not change progression.

### Registries, not branches

```js
SCHEMES      = { failure, forced, negatives, restpause, drop, partials, static }
PROGRESSIONS = { double, follow, none }
```

Adding a scheme means adding a registry entry, never a branch in `targetFor`.

`double` is the existing behavior: hit the top of the range, add a `bumpWeight`
step, reset reps to the bottom. `follow` means the set has no independent
target and derives from the top set (see section 7). `none` means log it, do not
prescribe it.

---

## 5. Rest: three intervals, all advisory

`TARGET_DAYS` splits into three fields because the published routines specify
different ones and they are not interchangeable.

```js
RestSpec = {
  interSession: [4,7],   // days between any two workouts
  perCode:      [21,24], // days until the same workout recurs
  perGroup:     [5,9],   // days until the same muscle group is trained again
  primary:      "perCode"
}
```

- Mentzer authors **interSession** (4 to 7 days). On a 4-workout rotation that
  yields 16 to 28 days perCode as a consequence, not as a rule.
- Persyn authors **perCode** (~21 days), from which interSession (~7) follows.
- Perez authors **perCode** (7 days, 4 sessions per week), from which
  interSession (1 to 2) follows.

`primary` selects which band is surfaced on the start screen. All three are
computable and viewable. None gates starting a session, ever.

**perGroup** is the one the app can compute but does not currently show.
`lastGroupDate(g)` already exists. It matters most for Perez, whose split puts
biceps on chest day and triceps on shoulder day, and it matters for any program
where session timing is set by the calendar rather than by recovery, because
then the rotation gives no guarantee about group spacing. Display only. Do not
infer anything from it automatically.

---

## 6. Warm-ups

Not modeled. Per your decision: a reminder, nothing else.

Rationale: an unprescribed, unlogged warm-up carries no data. Encoding it as a
SetSpec with a load percentage would invent numbers the app never observes.

Implementation: a session-level reminder on the start screen, once, sourced from
`Day.note` or a template-level string. Not per exercise. On a 7-slot workout a
per-exercise nag becomes noise within one session.

Consequence: warm-ups are prose, not structure. Every template's `sets` array
holds one or two entries.

Reminder text for `yates_bng`, sourced (*Blood and Guts* p.32): two or three
light sets on the first exercise for a body part, then a single warm-up set on
each subsequent exercise for that same body part, since the area is already
warm. Yates explicitly rejects pyramiding, on the grounds that six sets working
up to a heavy one wastes four sets and the energy that should have gone into
the growth-producing set.

---

## 7. Two heavy sets (Yates and Perez)

Perez confirmed "working to failure, all out to failure." That is the structure
Yates prescribes in *Blood and Guts* (1992), p.32, under the heading TWO HEAVY
SETS: after warming up he goes to his heaviest set, then drops the weight about
10 percent for a second set, on the reasoning that the body should in theory
grow from one set but a second heavy set does the trick in practice. p.28 puts
the same point as one or two sets per exercise.

So `yates_bng` and `perez` share this engine config. `mentzer_*` and `persyn`
do not.

```js
{ ex: "bbbench", sets: [
    { role: "top",     scheme: "failure", progression: "double" },
    { role: "working", scheme: "failure", progression: "follow", loadFactor: 0.9 } ] }
```

**`role: "top"` is set one here.** The naming denotes which set governs
progression, not where it sits in the slot. Set one is fresh and uncontaminated
by fatigue; set two is `follow`, with its load derived and no independent rep
target.

**Correction to an earlier recommendation.** This spec previously recommended
same load on both sets for Perez, on the grounds that the set-one to set-two rep
decay is a free effort signal. That recommendation was made without the source.
Yates prescribes a 10 percent drop, and Perez's structure comes from Yates.
`loadFactor` is therefore in the schema unconditionally, because `yates_bng`
needs it regardless of what Perez answers.

The same-load argument still has merit for Perez specifically, since the decay
signal does not survive a load change. Ship `yates_bng` at `0.9` as published
and let Perez's own value be his call.

**Perez rep ranges:** 8 to 12 across all movements, as stated, until he says
otherwise.

TODOs for Perez remain in section 11.

---

## 8. Beyond-failure techniques

`failure` is currently a free-text `"Yes"` string. Consolidation and Blood and
Guts both prescribe going past failure, so this needs to become an enum.

```js
endedWith: "clean" | "forced" | "negatives" | "restpause" | "drop" | "partials"
         | "static" | "short"
```

**Rule: only `clean` sets feed progression and PRs.** An assisted 8 reps is not
a clean 8. Without this the engine silently reads spotter help as strength and
bumps the load. Non-clean sets are stored, displayed, and flagged in history;
they just do not move the target.

`short` covers stopping before failure, which currently has no representation at
all.

Migration: existing `failure: "Yes"` maps to `clean`, anything else to `short`.
Your 2026-08-13 lateral note mentions partials, so the mapping will be
imperfect for that one set. Acceptable.

---

## 9. History scoping

Per your decision:

- **PRs, `bestFor`, `lastKnown`, baselines: exercise-global.** A deadlift is a
  deadlift regardless of which program you were running. Switching programs must
  not reset every target to zero.
- **Rotation state, cycle counts, `nextWorkout`, all three rest intervals:
  instance-scoped.** Filter `S.sessions` on `instance` for these.

Sessions gain an `instance` field. Every history scan must declare which of the
two scopes it is in. This is the most error-prone part of the change; a scan
that forgets to filter will silently blend two programs' rotations.

---

## 10. Storage and export

`hitlog.v2` to `hitlog.v3`. Migration must be idempotent and must run correctly
on both your data and Perez's empty state, because the same URL serves both and
there is no way to test on his device first.

```js
S = {
  schema:    3,
  instances: { i1: Instance, ... },
  active:    "i1",
  sessions:  [ {..., instance:"i1"} ],
  baselines: {...},   // unchanged, global
  custom:    {...},   // unchanged, global
  draft:     null     // gains an instance field
}
```

Export payload adds `schema`, `instances`, `active`, and per-session `instance`.
It currently has none of these, which means the only diagnostic channel you have
for Perez ("export the JSON and send it") cannot tell you which program he was
running. Fix this in the same change.

Import must accept a v2 export and migrate it forward.

---

## 11. Templates to ship

Six templates, three engine configs.

| id | rotation | set structure | adapted |
| --- | --- | --- | --- |
| `persyn` | 3 | 1 x failure | true |
| `mentzer_ideal` | 4 | 1 x failure, pre-exhaust pairs | false |
| `mentzer_consolidation` | 2 | 1 x failure, beyond-failure techniques encouraged | false |
| `yates_bng` | 3 in 5 | 2 heavy sets, second at 0.9 | true |
| `yates_natural` | 3 in 7-8 | 2 heavy sets, second at 0.9 | true |
| `perez` | 4 in 7 | 2 heavy sets, second at 0.9 | true |

### persyn

Migration target for your existing program. Rotation A/B/C. Slots as currently
in the live instance, **not** as in `DEFAULT_PROGRAM`, which has drifted (A runs
`flat, incline, fly` against the shipped `fly, incline, flat`; C runs `facepull`
third against the shipped `facepull` last).

```js
rest: { interSession:[6,8], perCode:[18,24], primary:"perCode" }
```

Resolved: the target is 21 days per code, with realistic drift of plus or minus
three. This supersedes both the 21 in the app's settings copy and the
`TARGET_DAYS = 24` constant; 24 is the top of the band, not the target. The
band is advisory display only and gates nothing.

### mentzer_ideal

From the project text, Little and Mentzer, *High-Intensity Training the Mike
Mentzer Way*, McGraw-Hill 2003, schematic listing. `adapted: false`, reproduce
as published including the rep ranges that differ from yours.

- W1 Chest & Back: DB flyes (pre-exhaust) 1x6-10 → incline press 1x1-3;
  straight-arm pulldowns (pre-exhaust) 1x6-10 → palms-up pulldowns 1x6-10;
  deadlifts 1x6-10
- W2 Legs & Abs: leg extensions (pre-exhaust) 1x12-20 → leg press 1x12-20;
  standing calf raises 1x12-20; sit-ups 1x12-20
- W3 Shoulders & Arms: DB lateral raises 1x6-10; bent-over laterals 1x6-10;
  palms-up pulldowns 1x6-10; triceps pressdowns (pre-exhaust) 1x6-10 → dips
  1x3-5
- W4: repeat W2
- `rest.interSession = [4,7]`, `primary = "interSession"`

Note the incline press at 1 to 3 reps and dips at 3 to 5. Those are as
published and are deliberately not your ranges.

### mentzer_consolidation

Provenance gap closed. Transcribed verbatim from the 2003 book's schematic
tables. `adapted: false`.

```js
rotation: ["W1","W2"]
W1  { alt:["bbsquat","legpress"], sets:[{role:"top", scheme:"failure", rr:"12-20"}] }
    { ex:"pulldown",              sets:[{role:"top", scheme:"failure", rr:"6-10"}]  }
    { ex:"dips",                  sets:[{role:"top", scheme:"failure", rr:"6-10"}]  }
W2  { alt:["deadlift","shrug"],   sets:[{role:"top", scheme:"failure", rr:"6-10"}]  }
    { ex:"pbn",                   sets:[{role:"top", scheme:"failure", rr:"6-10"}]  }
    { ex:"stdcalf",               sets:[{role:"top", scheme:"failure", rr:"12-20"}] }
rest: { interSession:[5,6], perCode:[10,12], primary:"interSession" }
```

Six exercises, three per workout, which matches what secondary sources describe
as the *Heavy Duty II* (1996) form. The two editions converge on the same
routine, so there is no second consolidation template to ship and no edition
blending to guard against.

**Dips are 6-10 here and 3-5 in `mentzer_ideal`, same book.** Both are as
published. Per-set `rr` overrides exist precisely so one cannot overwrite the
other.

**The close-grip palms-up pulldown is the existing `pulldown` id**, not a new
movement. Mike runs the same physical movement on two days with different
intent, tagged `pulldown` (lats, Chest & Back) and `curl` (biceps, Shoulders &
Arms). The consolidation slot is the lat-focused one. No new id.

Side effect worth knowing: because those are two ids, they carry two separate
PR histories (baselines 10x209 and 10x231, so they are genuinely not
interchangeable loads), and `lastGroupDate` sees Back and Biceps as unrelated
even when the same movement trained both. The perGroup interval will therefore
understate carryover for this pair. Display-only field, so this is a caveat, not
a defect.

**`alt` is stricter than the text.** Mentzer writes "alternated periodically";
`cycle % N` is a strict every-other-session swap. Not worth new machinery. The
day note should say the swap is meant to be occasional, and the user can pin
either movement by editing the slot.

**The rest instruction prescribes drift, uniquely among these templates.** Start
at 5 to 6 days, insert an extra rest day or two at random, increase the
regularity of insertion until training once every 6 to 7 days or less. No
`rest.drift` field is being added. The bands gate nothing and are advisory
display only, so a drift engine would be machinery serving a number nobody is
bound by. Ships as a 5 to 6 band with a note that it is a floor meant to grow.

**The substitution list is not `alt`, it is permission to edit.** Leg press for
squats, incline press for dips, Nautilus press for press behind neck. Slot
editing already covers this. Belongs in the day note.

### yates_bng

Source: Dorian Yates, *Blood and Guts* (1992). Split from p.37, movements from
the p.114 list, exercise counts from p.32, set structure from p.32, rep ranges
from p.49, frequency from p.28.

`adapted: true`. The split and the movement list are both verbatim from the
book, but the book never joins them. The selection from the p.114 pool is ours,
guided by the p.32 counts. Marking this `false` would be the exact failure the
flag exists to prevent.

**Cycle** (p.37, described as his off-season training and his 1992 Mr. Olympia
prep, a two-days-on one-day-off arrangement):

```
Day 1  chest, biceps, triceps
Day 2  quads, hamstrings, calves
Day 3  off
Day 4  back, deltoids
Day 5  off
```

Three sessions per five-day cycle. p.28 gives the honest band: three workouts
out of every six or seven days, with extra days taken when not recovered.

```js
rest: { interSession:[1,2], perCode:[5,7], primary:"perCode" }
```

**Exercise counts** (p.32): three for chest, three for thighs, four or five for
back, two each for biceps, triceps, shoulders, calves.

**Set structure**, every slot: two heavy sets, top set then `loadFactor: 0.9`
(section 7).

**Rep ranges** (p.49): six to 10 upper body. Lower body eight to 20, cycled
deliberately, roughly eight to 10 one workout and 15 to 20 the next. Lower-body
slots use `rrAlt: ["8-10","15-20"]`; upper-body slots use a fixed `rr: "6-10"`.

**Movement defaults**, drawn from the p.114 list:

| Day | Slots |
| --- | --- |
| 1 | barbell bench press; incline press; dumbbell flye; dumbbell concentration curl; dumbbell hammer curl; machine cable pressdown; lying EZ-curl extension |
| 2 | leg extension; `alt` leg press / hack squat; Smith machine squat; `alt` leg curl / stiff-legged deadlift; standing calf raise; seated calf raise |
| 4 | Nautilus pullover; pulldown machine; low-pulley row; chins with a dipping belt; barbell row; Smith machine press behind neck; dumbbell side lateral; bent-over raises or rear delt machine |

Two things to carry into the day notes:

The hamstring `alt` is sourced. p.118: he does only two hamstring exercises,
lying leg curls and stiff-legged deadlifts, and alternates between one or the
other each workout. That is a genuine every-other-session swap, so `cycle % 2`
fits it exactly, unlike the Mentzer consolidation case.

p.118 partially contradicts p.114 on chest and quads. He says decline barbell
presses are superior for mid to low chest and that he flat-benches only
occasionally because most pec tears come from it, and that he stopped
free-weight squatting in favour of leg presses, hack squats and Smith machine
squats. The p.114 list still leads chest with the barbell bench press. Ship
p.114 and put the decline preference and the pec-tear caution in the day note.

### yates_natural

**Our adaptation, not Yates's.** There is no Yates-authored program for
unenhanced lifters; what circulates is coaches adapting his. `source` must show
the chain: adapted from `yates_bng`, which is itself a composite of the 1992
book.

- Keep the three-session cycle and keep two heavy sets per exercise.
- Strip beyond-failure work to at most one exercise per session. Forced reps,
  heavy negatives and triple drops are the components most plausibly gated on
  enhancement and the ones that disproportionately extend recovery. Cutting the
  second heavy set is the wrong lever, and Yates himself argues against
  under-stimulating.
- Stretch the cycle from five days to seven or eight. This is a smaller
  intervention than it looks: p.28 already has him at three workouts per six or
  seven days, and p.37 is explicit that if the body says rest, rest.
- `rest: { interSession:[1,3], perCode:[7,9], primary:"perCode" }`
- `adapted: true`, with the notice displayed. Without it the app becomes another
  unattributed routine blog.

### perez

`adapted: true`. His split, filled with Yates movements. Runnable today; every
open question is defaulted to Yates rather than left blank, so he can start
before he answers anything.

**Cycle.** Four sessions over seven days, per his statement that he works out
four times a week.

```js
rotation: ["A","B","C","D"]
rest: { interSession:[1,2], perCode:[7,7], primary:"perCode" }
```

**Set structure, defaulted to Yates** (section 7): two heavy sets per exercise,
both to failure, top set first, second at `loadFactor: 0.9`, progression keyed
to set one.

**Rep range: 8 to 12 on every slot**, per his statement, applied universally
until he says otherwise. This is the one place we deliberately depart from
Yates, who runs six to 10 upper and eight to 20 lower with the lower-body range
cycled between workouts (p.49). No `rrAlt` in this template as a result. If he
later wants Yates's rep cycling, it is a per-slot field change, not a
restructure.

**Beyond-failure work: none by default.** Yates uses forced reps sparingly and
triple drops selectively (p.49, p.51). Perez did not ask for either, so every
slot ships `scheme: "failure"` and the enum (section 8) is available if he wants
it. Do not prescribe intensity techniques nobody requested.

**Movement defaults**, from the *Blood and Guts* p.114 list, selected against
the p.32 exercise counts (chest three, back four or five, shoulders two, biceps
two, triceps two, thighs three, calves two):

| Day | Focus | Slots |
| --- | --- | --- |
| A | Chest + Biceps | barbell bench press; incline press; dumbbell flye; dumbbell concentration curl; dumbbell hammer curl |
| B | Back + Abs | Nautilus pullover; pulldown machine; low-pulley row; barbell row; chins with a dipping belt; lying crunch over a bench; hanging leg raise |
| C | Legs | leg extension; `alt` leg press / hack squat; Smith machine squat; `alt` leg curl / stiff-legged deadlift; standing calf raise; seated calf raise |
| D | Shoulders + Traps + Triceps | Smith machine press behind neck; dumbbell side lateral; bent-over raises or rear delt machine; barbell shrug; machine cable pressdown; lying EZ-curl extension |

Five to seven slots per day, which at two heavy sets each is 10 to 14 sets to
failure per session. That is at or slightly below Yates's own sessions, which
run 14 (chest, biceps, triceps), 12 (quads, hamstrings, calves), and 12 to 14
(back, deltoids) using his p.32 exercise counts. Weekly, Yates is roughly 39 to
55 sets to failure across three sessions per five to seven days; Perez is about
48 across four per seven. He is inside the range, not above it.

If volume does need to come down later, the sourced lever is frequency, not
sets. p.37: if the body is sore and it is time to train that group, take the
extra day. p.28: three workouts per six or seven days rather than a fixed five.
Yates argues directly against under-stimulating, so cutting the second heavy set
is the wrong first move.

**Two gaps where the fill-in is not sourced.**

*Traps.* The p.114 list has no traps section at all; Yates's shoulder list is
press behind neck and lateral work only. Perez names traps explicitly, so
`shrug` is filled in from general practice, not from Yates. Flag it in the day
note.

*Hamstrings on a combined leg day.* Yates gives hamstrings their own place in a
legs-only session and alternates leg curl against stiff-legged deadlift each
workout (p.118). That carries over cleanly here since day C is legs-only, so the
`alt` is sourced. Quads get three slots per p.32.

**One thing his split does that Yates's does not.** Direct biceps work lands on
day A and heavy pulling lands on day B, so chins and rows hit biceps roughly 24
hours after they were trained to failure twice. Yates avoids this by putting
back with deltoids and biceps with chest, keeping the two a full cycle apart.
Not our call to change his split, and it is exactly what the perGroup interval
(section 5) is there to surface. Leave the split alone and let the number show.

**Still TODO, pending Perez, all now defaulted rather than blocking:** (a)
whether the second set drops 10 percent or matches load, defaulted to Yates's
0.9; (b) whether progression keys to set one, defaulted yes; (c) whether 8 to 12
is universal, defaulted yes per his statement; (d) his actual movement
preferences, defaulted to the Yates selection above.

---

## 12. Library dependency

Templates reference exercise ids. A template referencing an id absent from `LIB`
is a broken template, so the library must be expanded **before** the new
templates ship.

Required by `mentzer_consolidation` (confirmed):

| id | name | group | note |
| --- | --- | --- | --- |
| `bbsquat` | Barbell Squat | Quads | Mentzer means a barbell squat. Existing `squat` is the Smith machine variant and stays separate. |
| `shrug` | Barbell Shrug | Traps | alternate for `deadlift` |
| `pbn` | Press Behind Neck | Delts | |
| `stdcalf` | Standing Calf Raise | Calves | distinct from existing `calf` (seated) and `donkey` |

No `cgpulldown`. The close-grip palms-up pulldown maps to the existing
`pulldown`.

Required by `mentzer_ideal`: sit-ups, distinct from the existing `abs` machine
entry.

Required by `yates_bng` and `yates_natural`, from the p.114 list. Existing ids
cover dumbbell flye (`fly`), incline press (`incline`), Nautilus pullover
(`pullover`), pulldown (`pulldown`), low-pulley row (`row`), Smith machine squat
(`squat`), leg extension (`legext`), leg press (`legpress`), leg curl
(`legcurl`), seated calf raise (`calf`), pressdown (`pushdown`), dumbbell side
lateral (`lateral`), rear delt work (`revfly` or `bentlat`), and press behind
neck (`pbn`, added above). New:

`bbbench`, `chins`, `bbrow`, `hacksquat`, `sldl`, `concurl`, `hammercurl`,
`ezext`.

Optional, from p.118 preferences rather than the p.114 list: `declinebb`.

Required by `perez`, beyond the Yates set above: `crunch` (lying crunch over a
bench), `hangleg` (hanging leg raise), and `shrug` (already added for
`mentzer_consolidation`). Optional third ab movement from p.114: `revcrunch`.

Every new `LIB` entry needs `n, g, rr, mult, step, pct, unit`, and `bw:true`
where applicable (`chins`, `dips`, `hangleg`, `crunch` and `revcrunch` qualify).
None get a baseline; baselines are per-user.

---

## 13. Implementation order

1. Library expansion (section 12). Additive, zero risk, unblocks everything.
2. Registries and the `endedWith` enum (sections 4, 8). Progression rule change
   is the only behavior change; verify it against your two logged sessions.
3. Instances and the v2 to v3 migration (sections 3, 10). Highest risk. Ship
   this alone and confirm your data survives before touching templates.
4. De-hardcode rotation, theme, and rest (section 2 table).
5. Multi-set slots (section 7).
6. Templates as data (section 11).
7. Template picker UI and the `adapted` notice.

Steps 1 through 4 are worth doing even if the template work stalls.
