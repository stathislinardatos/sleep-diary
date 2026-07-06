Continue work on the Consensus Sleep Diary project. Read CLAUDE.md first for full context, then do the following, in order, one at a time — show me the diff and explain each change before committing, and never push without my OK:

## 1. SECURITY REGRESSION — fix this first
csd-server/schema.sql currently has this policy (lines ~75-77):
```sql
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid());
```
This is MISSING a `with check` clause, which means a patient could update their own `role` column from 'patient' to 'doctor' via the API and gain read access to every other patient's health data (RLS lets a doctor read everything). This exact hole was found and fixed once already directly in the live Supabase database, but this reference file still has the old, vulnerable version — if anyone re-runs this whole file, it silently reintroduces the hole.

Fix the file to:
```sql
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
  );
```
Then tell me the exact SQL to paste into Supabase's SQL Editor to re-apply this fix to the LIVE database (idempotent — safe even if already applied), so I can confirm the live DB is protected, not just the file.

## 2. Verify the GDPR consent + practice PIN migration
I need to run this in Supabase SQL Editor (haven't yet):
```sql
alter table public.profiles add column if not exists consent_at timestamptz;
alter table public.profiles add column if not exists practice_pin text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, consent_at, practice_pin)
  values (
    new.id, new.email,
    nullif(new.raw_user_meta_data->>'gdpr_consent_at','')::timestamptz,
    nullif(new.raw_user_meta_data->>'practice_pin','')
  )
  on conflict (id) do nothing;
  return new;
end; $$;
```
Confirm this is still correct given the current index.html signup code (practice PIN default is "11111" in config.js), then I'll run it.

## 3. Test the doctor dashboard live
Walk me through:
- Setting one real account to role='doctor' via SQL
- Creating/using a second account as a test patient with a few nights of diary entries
- Opening https://stathislinardatos.github.io/sleep-diary/doctor.html, logging in as the doctor, and confirming the patient list, compliance %, avg SE/TST, and the 🛡 consent badge all render correctly with real data (not just the mock data it was built and verified against)

## 4. Then continue the roadmap in CLAUDE.md, in order
- Timezone tracking (times are bare HH:MM strings, implicitly Europe/Athens — no DST/travel handling)
- Extract shared scoring.js (toMin/anchor/metrics/statMetrics currently duplicated in index.html AND doctor.html — keep them in sync until then)
- Clearly label the modified Sleep Efficiency formula (it's a doctor-customized window, not the standard Carney CSD calculation) wherever it's shown to the doctor or patient
- Push notifications (morning diary reminders) — lowest priority, do last

## Ground rules (from CLAUDE.md — repeat back to me you've read them)
- CSD-Core questions 1-9: exact wording and order, never rephrase. Greek is a provisional translation, keep it marked as such.
- Verify every UI change on BOTH a desktop and a mobile viewport before calling it done — this project has been repeatedly broken by fixes verified on only one platform.
- iOS Safari quirks: native `<input type=date>` should stay a real, tappable input (don't hide it or use `-webkit-appearance:none`) — it opens the picker on tap by default; center it with a plain overlay label, not by styling the native value.
- One change at a time. Show the diff. Explain in plain language. Get my OK before committing. Never push without explicit approval.
