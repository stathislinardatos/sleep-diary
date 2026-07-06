# CLAUDE.md — Consensus Sleep Diary

Auto-loaded context for Claude Code. Read this first.

## What this is
A non-profit clinical **sleep-diary web app** for **Dr. Persa Papatheodosiou** (psychiatrist–sleep specialist, Athens) and her insomnia patients. Greek-first with an EN toggle.

- **Live (patient app):** https://stathislinardatos.github.io/sleep-diary/
- **Live (doctor dashboard):** https://stathislinardatos.github.io/sleep-diary/doctor.html
- **Fallback (old prototype):** https://stathislinardatos.github.io/sleep-diary/classic/
- **Repo:** github.com/stathislinardatos/sleep-diary (GitHub Pages auto-deploys `main`)
- **Backend:** Supabase project `khifufzabxjballchzsr` (EU / Frankfurt), Postgres + Auth + RLS.

## File map
| File | Role |
|---|---|
| `index.html` | The whole patient app (~1150 lines): classic `<script>` = UI + sleep math; `<script type="module">` = Supabase cloud layer (auth, sync). |
| `doctor.html` | Standalone doctor dashboard (login + role gate + patient list + detail). Has its OWN copy of the sleep math — keep in sync (Priority 3 = extract shared `scoring.js`). |
| `config.js` | `window.CSD_CONFIG` = Supabase URL + **publishable** key (public-safe; privacy is enforced by RLS, not by hiding this). |
| `csd-server/schema.sql` | DB schema (profiles/entries/notes + RLS). Reference; run in Supabase SQL editor. |
| `csd-server/supabase-function/index.ts` | **DEAD CODE** — old server email function, replaced by client-side share sheet. Ignore/delete. |
| `manifest.json`, `sw.js`, `icon-*.png` | PWA (installable, network-first service worker). |
| `classic/index.html` | Original localStorage-only prototype (fallback). |
| `.claude/static-server.js`, `.claude/launch.json` | Local dev server (gitignored). |

## Run locally
Served over http (the app uses an ES module that blocks on `file://`):
```
node .claude/static-server.js   # serves repo root at http://localhost:5178
```
Then open http://localhost:5178 (patient) or /doctor.html (doctor). Hard-refresh to bypass the service worker after changes.

## Deploy
`git push origin main` → GitHub Pages rebuilds in ~1–2 min. Root = patient app, `/doctor.html` = dashboard, `/classic/` = prototype.

## Data model
`entries` columns: `user_id, date, q1..q9, want_wake, oob_min, submitted_at`, unique `(user_id,date)`. Times are bare `HH:MM` strings + a `date` (implicitly Europe/Athens — NO timezone tracking yet). Store RAW answers; compute metrics on read.

## Sleep math (the important part)
`toMin` / `anchor` / `metrics` in index.html (duplicated in doctor.html).
- Evening times (>=12:00) anchor to the previous day (negative minutes rel. to diary-morning midnight).
- **TST** = actual sleep. **SE (MODIFIED, doctor's variant — NOT standard Carney):** `TST / window`, where window = from Q2 (tried to sleep) to Q7 (out of bed), OR to `want_wake` when it's later than Q6 (final awakening). SE clamped ≤100.
- `statMetrics()` excludes implausible nights (tib≤0 / >16h / se null) from averages & charts; the per-night table shows everything.

## Current state — DONE
- Cross-platform UI (iPhone/Android/PC), PWA installable.
- Accounts: email+password, **optional** login (guests get 1 free day, then prompted to sign up). Login popup dismissible (×, Esc, tap-outside).
- Cloud sync: **last-write-wins by `submitted_at`** (never clobbers newer local); notes sync; offline-first; sync errors logged (not swallowed).
- Corrupt-storage resilient; inputs clamped/validated; XSS-safe.
- PDF report (client-side, branded) + send via share sheet / mailto greeting.
- **RLS role-lock applied** (patient cannot escalate to doctor).
- Custom Gmail SMTP + email confirmation ON.
- Doctor dashboard v1 (compliance %, avg SE/TST, attention flags, patient detail).

## Pending MANUAL steps (Supabase dashboard)
1. Make an account a doctor to use the dashboard:
   `update public.profiles set role='doctor' where email='<email>';`
2. (Already run:) `alter table public.entries add column if not exists want_wake text; alter table public.entries add column if not exists oob_min text;`
3. (Already run:) the RLS `with check` fix on `update own profile`.
4. **GDPR consent → DB** (needed for the consent feature): run in SQL editor:
   ```sql
   alter table public.profiles add column if not exists consent_at timestamptz;
   alter table public.profiles add column if not exists practice_pin text;
   ```
   …then re-run the `create or replace function public.handle_new_user()` block from `csd-server/schema.sql` (it now copies `gdpr_consent_at` + `practice_pin` from signup metadata into `profiles`).

## Roadmap (priority order)
1. **Doctor dashboard** — v1 done; needs live verification with a doctor session + a populated patient. Next: sleep-restriction helper, richer per-patient trends.
2. **GDPR consent checkbox** on signup — BUILT (checkbox + optional practice PIN `11111` in config.js, consent_at/practice_pin in profiles, 🛡 badge in dashboard); awaiting mobile verification + manual SQL step 4 above.
3. **Timezone tracking**, **extract `scoring.js`** (shared by index.html + doctor.html), clearly label modified-SE.
4. Push notifications (morning reminders). Legal: CSD license for for-profit use; official Greek translation.

## Hard rules / conventions
- **CSD-Core questions 1–9: exact wording & order, never rephrase** (© Carney et al.; cite SLEEP 2012;35(2):287-302). The 2 extra questions (want_wake, oob_min) are supplementary, kept OUTSIDE the numbered CSD set. Greek is a **provisional** translation — keep it marked as such.
- Health data = GDPR: EU region, RLS on every table, no analytics, no third-party scripts beyond Supabase + the two CDNs (supabase-js, html2pdf).
- The companion/reminders never give medical advice. Accessibility: large fonts, older patients, Greek default.
- Workflow: one change at a time, show the diff and explain before committing, never push without the user's OK. Verify UI on BOTH a desktop and a mobile viewport (iOS uses a wider system font — leave margin).
- Can't fully test iOS from a preview: the native `<input type=date>` opens the picker on tap by default (don't hide it / don't use `-webkit-appearance:none`); verify centering with a plain element, not the native value.

## Testing note
No automated test suite yet — verification is manual/eval in a headless preview. The headless renderer can't rasterize `html2canvas`, so the PDF's visual output must be checked on a real device.
