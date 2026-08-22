# HIT Log: Break-In Protocol Templates

Status: approved for implementation. Separate from `TEMPLATE_SPEC.md`, which is
now a build record of shipped work.

Baseline: `index.html` at 1642 lines, storage key `hitlog.v3`, schema 3.
Every line number below is a pointer to verify, not a fact. Re-read before
editing.

---

## 0. Handoff brief

**What this adds.** Two new templates from Mentzer's break-in protocol for
beginners and for anyone resuming after a layoff, plus the one engine change
they require.

**Why it is a separate document.** Every template shipped so far shares one
premise: a set is taken to failure, and progression reads that failure. This
protocol inverts it. The prescription is explicitly submaximal and there is no
progression at all in phase one. That is an engine change, not another entry in
`TEMPLATES`.

**Ground rules, unchanged from the prior spec:**

1. Verify line references before trusting them.
2. Ask before making any change this document does not specify.
3. Do not modify originals without approval.
4. Bump `CACHE_VERSION` in `sw.js` on deploy.
5. The same URL serves more than one person. Any change to stored data must be
   safe on a populated store and an empty one.

**What must NOT change:**

- `ENDED_WITH` (line 825) keeps its current meaning: how a *failure* set ended.
  Do not add a submaximal value to it. See section 2.
- No phase engine. Two templates and one link field, nothing more.
- `endedClean()` (line 841) keeps its current logic.

---

## 1. Source

Mentzer and Little, *High-Intensity Training the Mike Mentzer Way*, McGraw-Hill
2003, book p.71 (indexed as "Break-in period of training, 71"). Framed on
Selye's general adaptation syndrome: the alarm stage, then the stage of
resistance.

Both templates are `adapted: false`. Reproduce as published.

### Phase one, verbatim

Performed every day for five consecutive days. Eight exercises, one set of 10
repetitions each:

squats, barbell rows, bench press, press behind neck, deadlifts, standing
barbell curls, standing calf raises, sit-ups.

Load: light enough to complete 10 repetitions without extreme effort. The book
is explicit that going to exhaustion is counterproductive here, that it would
worsen the alarm stage, and that inducing debilitating soreness is not the
objective.

### Phase two, verbatim

Entered only if soreness persists after the five days. Rest the weekend, then
train three days a week. Same eight exercises. Two sets each:

- Set one: same weight, reps and intensity as phase one.
- Set two: **increase the weight by 10 percent**, still aiming for 10 reps.
  Still not to failure; the book says 10 reps should still be achievable with
  slightly greater effort.

### Duration

The book gives no fixed endpoint. One week and move on if ready. If two weeks of
break-in training still leaves the trainee sore, stay on it as long as
necessary, and it recommends a thorough physical examination for anyone adapting
that slowly. Duration is a judgment call the app must not automate.

---

## 2. The submaximal problem

**In plain terms.** Every set in this protocol stops before failure, on purpose.
The app currently records how a set ended using a control with these options:
clean, forced, negatives, rest-pause, drop, partials, static, short. The only
one that fits a deliberately easy set is `short`, and `endedClean()` treats
`short` as "did not count." So a trainee following the protocol exactly would
see eight sets a day flagged as though they had quit early, for five days
running. Accurate by the letter, wrong in substance, and it is the first thing a
new user would see.

**Decision: option A. The template declares it; the app does not ask.**

Submaximal is a property of the prescription, not an observation about what
happened. It was fixed before the trainee touched the bar. Asking them to report
it afterward is asking them to log a setpoint as if it were a measurement.

Implementation:

- Set specs in these two templates carry `scheme: "submax"`.
- Where `scheme === "submax"`, the ended-with control is **not rendered**
  (currently emitted around line 1119). The set records without it.
- Those sets are excluded from PRs and from progression. Reuse the existing
  exclusion path rather than writing a second one.
- `ENDED_WITH` gains nothing. It continues to describe failure sets only.

Note that `scheme` already exists in the data (`normalizeSlot`, line 745, sets a
default of `scheme:"failure"`) but is currently read nowhere. This is the first
code that reads it. Wiring it up is the known cost of option A and was accepted
deliberately.

---

## 3. No progression

Phase one has no progression of any kind. Phase two's second set is a fixed 10
percent over the first, not a progressive target.

- All set specs carry `progression: "none"`.
- `entryFor` (line 917) currently has two paths: a `follow` set derives its load
  from the logged top set, and everything else calls `targetFor()` for a
  prescribed progression target. `none` needs a third path: no prescribed
  target, open the entry blank or at the last logged value, prescribe nothing.
- `targetFor` (line 862) must not be consulted for these sets.

---

## 4. loadFactor above 1.0

Phase two's second set is `loadFactor: 1.1`.

**This inverts the field's meaning everywhere else it appears.** Yates uses 0.9,
a back-off. Here it is a ramp: heavier, not lighter. The multiply at line 927 is
unclamped so it already works, but anyone reading `loadFactor` later will assume
back-off. Add a comment at the field's definition and at the phase two template
noting that values above 1.0 are legitimate.

The second set is still `role: "working"`, `progression: "follow"`, and still
`scheme: "submax"`.

---

## 5. successor

One new optional string field on a template: the id of the template it is meant
to lead to.

```
mentzer_breakin     successor: "mentzer_breakin_2"
mentzer_breakin_2   successor: "mentzer_ideal"
```

A break-in exists to lead somewhere; without this it is a dead end in the
picker. The field earns its place twice, which is why it is a field rather than
prose in the blurb.

**Transition is manual.** The book's trigger for phase two is whether soreness
persists, which the app cannot observe and must not guess. Surface the successor
as an offer, never an automatic switch.

UI: on a template's card or detail view, a line pointing to what comes next. No
countdown, no session counter, no "you have completed the break-in" state.

---

## 6. The templates as data

Shorthands, following the existing `Y2` / `P2` convention near line 432:

```js
/* Break-in: submaximal by prescription, no progression.
   B2's second set is 10% HEAVIER, not a back-off. See BREAKIN_SPEC section 4. */
var B1 = [{role:"top", scheme:"submax", progression:"none", rr:"10-10"}];
var B2 = [{role:"top",     scheme:"submax", progression:"none", rr:"10-10"},
          {role:"working", scheme:"submax", progression:"follow",
           loadFactor:1.1, rr:"10-10"}];
```

Both templates use the same eight slots, in the book's order:

`bbsquat`, `bbrow`, `bbbench`, `pbn`, `deadlift`, `bbcurl`, `stdcalf`, `situp`

All eight ids already exist in the library. No library additions required.

```js
mentzer_breakin: {
  name:    "Mentzer Break-In",
  adapted: false,
  rotation:["A"],
  rest:    { interSession:[1,1], perCode:[1,1], primary:"interSession" },
  successor:"mentzer_breakin_2",
  days:    { A: { focus:"Full Body", slots: <eight slots, each B1> } }
}

mentzer_breakin_2: {
  name:    "Mentzer Break-In, Second Phase",
  adapted: false,
  rotation:["A"],
  rest:    { interSession:[2,3], perCode:[2,3], primary:"interSession" },
  successor:"mentzer_ideal",
  days:    { A: { focus:"Full Body", slots: <eight slots, each B2> } }
}
```

`rotation: ["A"]` is a single repeating workout. Confirm `nextWorkout` and the
cycle counter behave with a rotation of length one before shipping; the
generalization from `% 3` was written and tested against lengths 2, 3 and 4.

`blurb` for each should state plainly that these sets are not taken to failure
and that this is deliberate, since that contradicts what a user learns from
every other template in the picker.

The book's Monday/Wednesday/Friday framing for phase two is advisory only. The
app does not fix training to weekdays.

---

## 7. Implementation order

1. Read `scheme` in the set-spec path and suppress the ended-with control for
   `submax`. Verify nothing else in the app assumes the control is always
   present.
2. Add the `none` progression path in `entryFor`.
3. Comment `loadFactor` for values above 1.0.
4. Add `successor` as an optional field, plus its display.
5. Add the two templates.
6. Verify a rotation of length one.

Steps 1 and 2 are the only engine changes. Everything after is additive.

---

## 8. Scope note

These are the first templates in the app aimed at someone who is neither of its
two current users. Both are years past needing a break-in. Shipping them is
reasonable, but it is worth naming that it changes what the app is for.
