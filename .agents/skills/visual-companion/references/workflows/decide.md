# Decide

Use when the reader has to choose between two and four options: layout directions, API shapes, naming, or whether to do the work at all. The screen shows enough for the reader to judge each option; the decision itself stays in conversation.

Route elsewhere when the goal is a concrete proposal rather than a choice ([Design](design.md)), or when the reader first needs the mechanism explained ([Understand](understand.md)).

## Shape

1. **One question**, in the heading: "Which layout reads better?", not "Layout options".
2. **Two to four options**, differing along one dimension. More than four stops being a comparison, and options that differ in several ways cannot be judged.
3. **The trade-off, stated per option**: what it gains, what it costs. A short table reads faster than prose.
4. **A recommendation**, with the condition that would reverse it: "B, unless the list grows past a few hundred rows".
5. **`data-choice` on each option.** The attribute value is what the agent receives.

## Surface

- `push` with `vc-options` when the options fit on one screen.
- `compare` when two or three options each need their own CSS and cannot share a stylesheet.
- `states` when the choice is between full-viewport page states rather than alternatives.
- Leave the position control out. A choice is not a sequence, and a slider over options invites scrubbing instead of deciding.

## Recording the answer

Anything carrying `data-choice` reports on click. Add `data-multiselect` to an ancestor only when combinations are allowed.

`push` clears the previous screen's events, so read `events` before republishing. Treat a recorded choice as advisory until the reader confirms it in conversation.

## Check before showing

1. One question on the screen, in the heading.
2. Each option states its trade-off, not only its name.
3. The recommendation appears, with the condition that reverses it.
4. Keyboard reaches and selects every option, and the selection is visible without colour alone.
5. The screen proposes nothing the reader did not ask to see; proposals belong to Design.

Once the choice is settled, say what was chosen and where it lives, then stop. Implementing it is separate work that needs its own authorization.
