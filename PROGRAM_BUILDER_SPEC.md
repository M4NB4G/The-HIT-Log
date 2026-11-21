# HIT Log: Program Builder Spec

Status: parked. Build it when someone other than the owner wants to run a
custom routine. Until then nothing here is scheduled.

---

## 0. Handoff brief

Read the whole document before writing code. It was written against
`index.html` on 2026-11-21. It names functions, not line numbers, so search for
each name and check it still does what this spec says before you rely on it.

**Ground rules (same as the other specs):**

1. Verify before you trust. If a function has moved or changed, re-derive.
2. Ask before deciding anything this spec does not cover.
3. Never lose logged history. Every change below has to leave existing
   sessions readable in History, Records and the PR logic.
4. Bump `CACHE` in `sw.js` on every deploy.
5. Keep `index.html` on CRLF line endings (`.gitattributes` pins it).

**Why it exists:** the owner's routine (three workouts, adapted from the
Mentzer Ideal Routine) can't be built by anyone else in the app. A program can
only be started from a template. After that, its exercises can be edited but
its shape can't: the workouts, rotation and rest windows are fixed. Sending an
export is no substitute, because it carries the sender's whole history and
replaces the receiver's.

---

## 1. Goal

Two ways to shape a program, sharing one set of controls:

- **Individual settings.** Every part of a program's shape becomes editable
  from the Program tab, one setting at a time.
- **Wizard.** "Build from a template" walks through those same settings in
  order. Each step starts from the chosen template's values, and you can skip
  any step to keep them.

The individual settings are the real work. The wizard is a guided pass over
them and shouldn't contain logic of its own.

---

## 2. What exists today

**Data shape of a program** (`S.instances[id]`):

```
{ source, from?, name, renamed?, edited,
  rotation: ["A","B","C"],                       // order workouts come around
  rest: { interSession:[lo,hi],                  // days between any two workouts
          perCode:[lo,hi],                       // days before a workout returns
          primary:"interSession"|"perCode" },    // which clock Today leads with
  program: { A: { focus, note?, list:[slot, ...] }, ... } }
```

**A slot** is one of:

- a string id;
- `{ex, sets?, link?}`;
- `{alt:[ids], sets?, link?}`, members taking turns by cycle.

`sets` is a list of set specs: `{role, rr | rrAlt, progression, loadFactor,
scheme, pct}`. `link:"preexhaust"` runs the slot straight into the next one
with no rest.

**Already editable** (Program tab, `slotEditor`, `pickerFor`, `move`,
`removeEx`, `setAlt`, `altNext`):

- add, remove and reorder movements in a workout;
- make a slot take turns, and choose which member goes next;
- rename a workout's focus (`renameFocus`) and the program (`renameProgram`).

**Not editable, and in scope here:**

| Setting | Where it lives | Today |
|---|---|---|
| Number of workouts | `program` keys + `rotation` | template only |
| Rotation order | `rotation` | template only |
| Rest windows | `rest.interSession`, `rest.perCode` | template only |
| Which rest clock leads | `rest.primary` | template only |
| Rep range per slot | `slot.sets[i].rr` / `rrAlt` | template only |
| Sets per slot (one vs. top + back-off) | `slot.sets` | template only |
| Pre-exhaust links | `slot.link` | template only |
| Bump % per slot | `slot.sets[0].pct` | template only (movement-level `pct` is editable) |

---

## 3. Hazards to design around

These come from how the app already works. Each needs a deliberate answer.

1. **`letterCodes` re-letters workouts by rotation position on every load.**
   It renames workout codes to A, B, C… in rotation order and rewrites
   `session.workout` to match. If reordering the rotation just shuffled the
   `rotation` array, the next load would rename the workouts and move their
   history with them.
   - **Rule:** codes always stay A, B, C… in rotation order. To reorder, move
     the workout *contents* (`program[code]`) between letters, and re-key that
     instance's sessions and draft in the same step, the way `letterCodes`
     does. Write one helper for this and use it everywhere.
2. **Sessions reference workouts by code.**
   - `nextWorkout` finds the last session's code in `rotation`. A missing code
     sends the rotation back to its first workout.
   - `cyclesOf` counts sessions per code, which drives slots that take turns.
   - `focusOf` shows "" for a code that no longer exists.
   - **Rule:** removing a workout that has logged sessions must be refused, or
     archived so History can still name it. Pick one, and ask if unsure.
     Removing an unlogged workout is free.
3. **A draft session in progress** holds `workout`, `order` and `slotMap`
   built at start. **Rule:** refuse shape changes while `S.draft` exists
   ("Finish your session first"), just as `switchInstance` does.
4. **PR judging depends on the rep range in force.** Sets logged since
   2026-11-18 carry `lo`. Older ones fall back to the slot's range through
   `prFloor`, then the library's.
   - **Rule:** changing a slot's rep range never re-judges old sets. Their
     `lo` (or a frozen copy of the old range) has to survive.
   - Check `prFloor` before shipping: as written, it would read the *new*
     range for sets that have no `lo`. Stamp `lo` onto those sets before
     changing a range.
5. **`edited` and the stale-template notice.** Any shape change must call
   `markEdited()`, or the Program tab will offer to "update" the program back
   to its template.
6. **`resetProgram`** restores a template's workouts, rotation and rest.
   - After a shape change it must still ask first.
   - For a program carried over from a removed template (`inst.from`), it
     refuses. Keep that behaviour.
7. **Template groups** (`templateGroup`) read set structure to shelve
   templates. Instances never appear there, so editing an instance's sets
   doesn't affect the picker.

---

## 4. Individual settings (build first)

All of these live on the Program tab, in the program panel, under a
"Program shape" heading below the workouts list.

1. **Workouts.**
   - "Add workout" appends the next letter. It asks for a focus label and
     starts empty.
   - Remove follows hazard 2.
   - Reorder follows hazard 1. Use up/down arrows like the movement rows, not
     drag.
2. **Rest windows.** Two ranges, each a pair of number steppers in days:
   "Between workouts" and "Each workout returns every". Plus a toggle for
   which one Today leads with. Validate lo ≤ hi and lo ≥ 1.
3. **Per-slot settings** go inside the existing slot editor (`slotEditor`):
   - **Rep range:** text input like `6-10`, validated the same way as
     `mvRead`. Offer "alternate by cycle" to make an `rrAlt` pair.
   - **Sets:** "One set to failure" or "Top set + back-off". Back-off asks
     for a load % (`loadFactor`, default 90).
   - **Pre-exhaust into the next movement:** toggles `link`. Disabled on the
     last slot.
   - **Bump %:** optional, overrides the movement's own.

Each control saves on change, calls `markEdited()` and re-renders, the same
as the existing editors.

---

## 5. Wizard

Entry point: on each template card, a second button, "Customize first", next
to the existing start action. It creates the instance exactly as
`createInstance` does, then opens the wizard over it.

**Steps.** Every step has Back, Next and Skip.

1. **Name.** Prefilled with the template's name. A changed name sets
   `renamed`.
2. **Workouts.** The template's workouts as rows, with focus labels. Add,
   remove and reorder here. With no history yet, hazards 1 and 2 are moot.
3. **Rotation and rest.** The two rest windows and the leading clock (§4.2),
   showing what the template ships.
4. **Each workout, one screen per workout.** Its movements, using the
   existing movement editor and picker. Slot settings (§4.3) are behind each
   row.
5. **Review.** A read-only summary in the same layout as the Program panel's
   "How this program runs" block. Two buttons: "Start this program", or
   "Back to edit".

**Rules:**

- Leaving the wizard partway keeps the instance as it stands. It's a normal
  program and everything stays editable from the Program tab.
- The wizard writes through the same functions as §4. If a step needs logic
  §4 doesn't have, add it to §4.
- Wizard state that isn't program data (which step you're on) lives in a
  module variable like `mvEdit`, never in `S`, so it can't end up in an
  export.

---

## 6. Sharing a program (optional, after 4 and 5)

"Share program" writes a file holding one instance's shape plus the custom
movements it uses: no sessions, baselines, bodyweight or notes. "Import
program" adds it as a new instance alongside existing ones, never replacing
anything.

- Custom ids are random per phone. On import, match each one to an existing
  movement by name (case-insensitive, like `promoteCustom`), or create it.
- Never overwrite an existing movement's settings.

---

## 7. Testing

Use Playwright against the real exports in a scratch directory, never against
the repo. Seed `localStorage` with `dateMigrated:true` or dates shift a day.
Cover at least:

- Reorder workouts on a program with history. Every session keeps its focus
  label, `nextWorkout` is unchanged, and slots that take turns stay on the
  same member.
- Remove a workout with history. Refused (or archived), and History still
  shows the sessions.
- Change a slot's rep range. No old PR flag changes; check with `reflagPRs`.
- Any shape change with a draft open is refused.
- Rebuild the owner's routine from Mentzer Ideal with the wizard. The
  resulting `rotation`, `rest` and `program` must equal the owner's
  `S.instances.i1` with the `source`, `from`, `name` and `renamed` fields left
  out of the comparison.
- Export and import round trip, and the Program tab at 390 px width with no
  sideways scroll.

Send each step to an independent reviewer before it reaches `main`, as with
the 2026-11 movement work.
