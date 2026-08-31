# TUI eval prompts

Ten prompts for scoring an agent on Mudah. Pass = compiles, tests pass, snapshot matches.

1. Build a picker command named `env` with items staging and production. Use Screen.picker. Test with TestTui that down+enter selects production.
2. Build a two-step wizard: pick env, then type a note. Use Screen.wizard. Assert result keys.
3. Build a dashboard with a sidebar and a 3-row table. Use Screen.dashboard. Snapshot contains a `│` split bar.
4. Build a form from `s.object({ name: s.string(), live: s.boolean() })`. Toggle live with tab+space+enter.
5. Put two TextInputs in a Row. Tab focuses the second. Type `x` then tab then `y`.
6. Wrap a Column in Overlay. Open a modal. Escape must not quit. It closes the modal.
7. Push two Labels onto a Stack with reduced motion. Assert the top label is visible. Pop. Assert the first label.
8. List of three items. Click row 1. selectedIndex is 1.
9. TextInput: type `ab`, left, type `x`. Value is `axb`.
10. FuzzyList over alpha/beta/gamma. Type `b`. Snapshot contains beta and not alpha.
