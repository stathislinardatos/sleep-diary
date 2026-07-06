# Tests — Consensus Sleep Diary

Three suites, ~125 checks total. Run them after any change, before any push.

| Suite | What it proves | Needs |
|---|---|---|
| `syntax.test.js` | every inline `<script>` in index.html + doctor.html parses | node |
| `math.test.js` | sleep math against hand-computed worked examples; index.html and doctor.html copies agree (300-night fuzz); DB `want_wake` → `qWake` mapping present | node |
| `ui.test.js` | real browser (headless Edge) on 4 viewports: CSD questions 1–9 exact order/wording, signup consent + PIN end-to-end (network intercepted — **no junk accounts created**), every error path incl. offline honesty, all tabs, popup dismissal, doctor pipeline, PWA/static checks | node, `npm install`, dev server on :5178, Microsoft Edge |

```
node ../.claude/static-server.js   # in another terminal (or any static server on 5178)
npm install                        # once
npm test
```

Screenshots land in `shots/` (gitignored) — check them visually after UI changes.
Notes: `ui.test.js` makes two harmless live Supabase calls (a failed login, an aborted signup). The math worked examples are documented inline — if a math test fails, the doctor's numbers are wrong: stop and investigate, never "fix" the test.
