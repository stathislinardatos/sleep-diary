# CSD Web App — Blueprint & Resource Kit

A compact guide for building a Consensus Sleep Diary web app for patients/clients and research participants.

---

## 0. Do this first: licensing

The CSD is **© 2011 Carney, Buysse, Ancoli-Israel, Edinger, Krystal, Lichstein & Morin**.

- **Free for not-for-profit use** — but the diary must **not be altered** and you must cite Carney et al., 2012 (*SLEEP*, 35(2), 287–302).
- **For-profit/industry use requires permission** from the first author (Dr. Colleen Carney). Contact via [consensussleepdiary.com](https://consensussleepdiary.com/) or [drcolleencarney.com](https://drcolleencarney.com/sleep-diary/).
- "Not altered" means: keep exact item wording and order. You can digitize the format (dropdowns, time pickers) but don't rephrase questions.
- Note: an **official CSD web/iOS/Android app already exists** at consensussleepdiary.com — worth trying before building, if only to learn from it.

---

## 1. Recommended stack (one pick per layer)

| Layer | Pick | Why | Source |
|---|---|---|---|
| Framework | **Next.js** (React + TypeScript) | Full-stack in one project; biggest ecosystem; best docs | [nextjs.org](https://nextjs.org) |
| Database + Auth | **Supabase** (hosted PostgreSQL) | Auth, row-level security (patients only see their data), realtime, free tier. HIPAA-compliant plan available | [supabase.com](https://supabase.com) |
| ORM | **Drizzle** | Type-safe, lightweight, SQL-like | [orm.drizzle.team](https://orm.drizzle.team) |
| Validation | **Zod** | One schema validates forms *and* API — critical for clean research data | [zod.dev](https://zod.dev) |
| Forms | **React Hook Form** (+ Zod resolver) | The standard for multi-field forms | [react-hook-form.com](https://react-hook-form.com) |
| UI | **Tailwind CSS + shadcn/ui** | Accessible components; fast to build clean clinical UI | [ui.shadcn.com](https://ui.shadcn.com) |
| Charts | **Recharts** | Simple React charts for sleep trends/SE over time | [recharts.org](https://recharts.org) |
| Dates/times | **date-fns + @date-fns/tz** | Timezone-safe math — the #1 source of sleep-diary bugs | [date-fns.org](https://date-fns.org) |
| Export | **SheetJS (xlsx)** or plain CSV | Researchers need CSV/Excel export | [sheetjs.com](https://sheetjs.com) |
| Hosting | **Vercel** | Zero-config Next.js deploys, free tier | [vercel.com](https://vercel.com) |

That's the whole stack — ~9 dependencies, all mainstream and maintained.

**Alternatives if you prefer simpler:** a single-server **SvelteKit + SQLite** app, or for research-only use, skip building entirely and use **[REDCap](https://projectredcap.org)** (free for academic institutions; the standard for study data capture, already has scheduled daily surveys).

---

## 2. The data model (from your PDF)

**CSD-Core: 9 items per morning** — get into bed time (1), tried to sleep time (2), sleep onset latency in min (3), number of awakenings (4), total duration of awakenings in min (5), final awakening time (6), out-of-bed time (7), sleep quality 5-point scale (8), comments (9). **CSD-M** adds items 6b–6d (time in bed after final awakening, early awakening) plus nap/medication/alcohol/caffeine items.

**Computed variables (the standard scoring):**

```
TIB  = out-of-bed time (Q7) − into-bed time (Q1)
SOL  = Q3
WASO = Q5
TWT  = SOL + WASO (+ terminal wakefulness: Q7 − Q6)
TST  = TIB − TWT − (Q2 − Q1 pre-sleep time in bed)
SE   = TST / TIB × 100
```

Report weekly averages of each. Note the field debates the SE denominator (TIB vs. attempted-sleep window) — see [Reed & Sacco, JCSM 2016](https://jcsm.aasm.org/doi/10.5664/jcsm.5498); store raw times so you can compute either.

---

## 3. Expert advice (the stuff that separates good from great)

1. **Times cross midnight — design for it.** "Bed 11:30 PM, up 7:20 AM" spans two calendar dates. Store every time as a full timestamp anchored to the *morning of entry*, and store the user's timezone. Never store bare clock times.
2. **Store raw answers, compute metrics on the fly.** Never save only SE/TST — scoring conventions differ between labs; raw data lets you re-score.
3. **The diary is completed each morning, within ~1 hour of getting up.** Send a morning reminder (email or web push). Record a submission timestamp — researchers use it to verify compliance and detect backfilling.
4. **Missed days stay blank** (per CSD instructions). Allow gaps; never force retroactive completion, but consider allowing a 1-day grace window with a "late entry" flag.
5. **Entry should take under 2 minutes.** Time pickers with 5-min steps, sensible defaults from yesterday's entry, mobile-first layout (people fill it in from bed).
6. **Validate plausibility, don't block.** Warn on impossible combos (e.g., awakenings duration > time in bed) but let users submit with confirmation — forcing "valid" data creates fake data.
7. **Privacy is non-negotiable for patient data.** Sleep data + identity = health data (HIPAA/GDPR). Use row-level security, encrypt at rest (Supabase default), separate participant IDs from names for research export, and get a BAA (Supabase Team plan) before real patient use.
8. **Clinician/researcher dashboard:** per-participant table of the last 7–14 days + weekly means of SE/TST/SOL/WASO, compliance %, and one-click CSV export. That covers 95% of what a CBT-I clinician needs (SE drives sleep-restriction titration).
9. **Accessibility:** insomnia skews older; large fonts, high contrast, keyboard-navigable forms (shadcn/ui components are WCAG-friendly out of the box).
10. **Reference code:** the [sleepdiary GitHub org](https://github.com/sleepdiary) has an MIT-licensed [core library](https://github.com/sleepdiary/core) for sleep-diary data handling — stale (2023) but useful to study, not depend on.

---

## 4. Key sources

- **The definitive paper:** [Carney et al. 2012 — The Consensus Sleep Diary: Standardizing Prospective Sleep Self-Monitoring](https://pmc.ncbi.nlm.nih.gov/articles/PMC3250369/) (free full text; contains the diary, instructions, and rationale)
- **Psychometrics:** [Maich et al. — Psychometric Properties of the CSD in Insomnia Disorder](https://www.researchgate.net/publication/303593292_Psychometric_Properties_of_the_Consensus_Sleep_Diary_in_Those_With_Insomnia_Disorder)
- **Diagnostic cutoffs:** [Natale et al. — The CSD: Quantitative Criteria for Primary Insomnia Diagnosis](https://www.researchgate.net/publication/275358376_The_Consensus_Sleep_Diary_Quantitative_Criteria_for_Primary_Insomnia_Diagnosis)
- **How patients misread the CSD** (design your UI around these): [Cognitive interview study, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10879077/)
- **Digital diary UX pilot:** [Experience with a digital sleep diary in insomnia, 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10757200/)
- **Official CSD site/app:** [consensussleepdiary.com](https://consensussleepdiary.com/)
- **Clinician resources:** [cbtiweb.org](https://cbtiweb.org)

---

## 5. Suggested build order

1. Static one-night CSD form (exact PDF wording) with validation → 2. Auth + save entries per user → 3. 7-day diary view + computed SE/TST/SOL/WASO → 4. Trends chart + CSV export → 5. Clinician/researcher dashboard with participant list and compliance → 6. Reminders (email/push) → 7. Privacy hardening + BAA before real patients.

Ship step 1–3 first; that's already a usable clinical tool.
