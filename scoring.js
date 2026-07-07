/* ============================================================
   scoring.js — the ONE source of truth for the CSD sleep math.
   Loaded by BOTH index.html (patient app) and doctor.html
   (dashboard) via a plain <script src="scoring.js"> tag.

   Entry fields: q1 got into bed, q2 tried to sleep, q3 minutes to
   fall asleep, q5 minutes awake during the night, q6 final
   awakening, q7 out of bed, qWake wanted wake-up time.
   (The DB column for qWake is want_wake — map it before calling.)

   ⚠ SE here is the MODIFIED variant requested by Dr.
   Papatheodosiou — window from Q2 (tried to sleep) to Q7 (out of
   bed), or to qWake when that is later than Q6. It is NOT the
   standard Carney CSD calculation (SLEEP 2012;35(2):287-302) and
   must be labeled as modified wherever it is displayed.

   Any change to this file must first be proven with worked
   examples in tests/math.test.js — the doctor reads these numbers
   to make clinical decisions.
   ============================================================ */

function toMin(t){ if(!t) return null; const [h,m]=String(t).split(":").map(Number); return h*60+m; }

/* Evening times (>= 12:00) anchor to the previous day: negative
   minutes relative to the diary-morning's midnight. */
function anchor(t){ const m=toMin(t); return m===null?null:(m>=720? m-1440 : m); }

function metrics(e){
  const bed=anchor(e.q1), trySl=anchor(e.q2), finalWake=toMin(e.q6), outBed=toMin(e.q7);
  const sol=Math.max(0,Number(e.q3)||0), waso=Math.max(0,Number(e.q5)||0);
  if(bed===null||outBed===null) return null;
  const tib = outBed - bed;
  const preSleep = (trySl!==null && trySl>=bed) ? trySl-bed : 0;
  const terminal = (finalWake!==null && outBed>=finalWake) ? outBed-finalWake : 0;
  let tst = tib - preSleep - sol - waso - terminal;
  if(tst<0) tst=0;
  // SE window: from "tried to sleep" (Q2) to "out of bed" (Q7) — or to the
  // "wanted-to-wake" time when that is later than the final awakening (Q6).
  const want = toMin(e.qWake);
  const winStart = (trySl!==null) ? trySl : bed;
  const winEnd = (want!==null && finalWake!==null && want>finalWake) ? want : outBed;
  const opp = winEnd - winStart;
  const se = opp>0 ? Math.min(100, Math.round(tst/opp*100)) : null;
  return {tib, tst, se, sol, waso, opp};
}

/* metrics for STATISTICS only — excludes implausible nights so averages/charts aren't skewed */
function statMetrics(e){ const m=metrics(e); if(!m || m.se==null || m.tib<=0 || m.tib>16*60) return null; return m; }

/* ------------------------------------------------------------
   Clinical dates: "today" is locked to the practice's timezone
   (Europe/Athens), so a patient travelling abroad — or a phone
   set to another timezone — cannot shift diary dates and skew
   compliance windows or averages. Times themselves stay the
   wall-clock HH:MM the patient reports.
   ------------------------------------------------------------ */
function athensToday(){
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date()); }
  catch(e){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
}

/* Last n ISO dates (YYYY-MM-DD), newest first, ending at Athens-today. */
function athensDaysBack(n){
  const [y,m,dd]=athensToday().split("-").map(Number);
  const d=new Date(Date.UTC(y, m-1, dd));
  const out=[];
  for(let i=0;i<n;i++){ out.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()-1); }
  return out;
}
