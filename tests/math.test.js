/* Sleep-math unit tests against the shared scoring.js (the ONE copy
   used by both index.html and doctor.html), with hand-computed
   worked examples. If a check here fails, the numbers the doctor
   reads are wrong: fix the code, never the test. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "..");
const R = p => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

// -- load the real scoring.js --
const S = {};
vm.createContext(S);
vm.runInContext(R("scoring.js") + "; this.toMin=toMin; this.anchor=anchor; this.metrics=metrics; this.statMetrics=statMetrics; this.athensToday=athensToday; this.athensDaysBack=athensDaysBack;", S);

// -- single source of truth: no local math copies, both pages include scoring.js --
const idx = R("index.html"), doc = R("doctor.html");
ok("index.html includes scoring.js", /<script src="scoring\.js"><\/script>/.test(idx));
ok("doctor.html includes scoring.js", /<script src="scoring\.js"><\/script>/.test(doc));
ok("index.html has NO local copy of the math", !/function metrics\(/.test(idx) && !/function toMin\(/.test(idx));
ok("doctor.html has NO local copy of the math", !/function metrics\(/.test(doc) && !/const toMin\s*=/.test(doc));
ok("doctor.html maps DB want_wake -> qWake before the math", /qWake:\s*r\.want_wake/.test(doc));
ok("modified-SE labeled in doctor dashboard", /τροποποιημένος τύπος/.test(doc));
ok("modified-SE labeled in patient app / PDF", /seModNote/.test(idx) && /τροποποιημένος τύπος/.test(idx));

// -- H. primitives --
ok("toMin('07:05') = 425", S.toMin("07:05") === 425);
ok("toMin('') = null", S.toMin("") === null);
ok("toMin(null) = null", S.toMin(null) === null);
ok("anchor('12:00') = -720 (noon anchors to prev day)", S.anchor("12:00") === -720);
ok("anchor('11:59') = 719 (morning stays)", S.anchor("11:59") === 719);
ok("anchor('00:00') = 0", S.anchor("00:00") === 0);

// -- worked examples (hand-computed) --
// A. typical night: bed 23:00, try 23:30, 20' to fall asleep, 15' awake,
//    final wake 07:00, out of bed 07:30 -> TIB 510, TST 415, window 480, SE 86
const A = { q1:"23:00", q2:"23:30", q3:20, q5:15, q6:"07:00", q7:"07:30", qWake:null };
let m = S.metrics(A);
ok("A: TIB = 510", m.tib === 510, `got ${m.tib}`);
ok("A: TST = 415 (510-30 presleep-20 sol-15 waso-30 terminal)", m.tst === 415, `got ${m.tst}`);
ok("A: window = 480 (23:30->07:30)", m.opp === 480, `got ${m.opp}`);
ok("A: SE = 86 (415/480)", m.se === 86, `got ${m.se}`);

// B. THE wanted-wake rule: try 00:30, final wake 05:30, out 06:00, WANTED 07:00
//    window extends to 07:00 -> TIB 345, TST 255, window 390, SE 65
const B = { q1:"00:15", q2:"00:30", q3:45, q5:0, q6:"05:30", q7:"06:00", qWake:"07:00" };
m = S.metrics(B);
ok("B: TIB = 345", m.tib === 345, `got ${m.tib}`);
ok("B: TST = 255", m.tst === 255, `got ${m.tst}`);
ok("B: SE = 65 (window stretched to wanted wake 07:00)", m.se === 65, `got ${m.se}`);
// and the same night exactly as the DB stores it, mapped like doctor.html boot() does:
const dbB = { q1:"00:15", q2:"00:30", q3:45, q5:0, q6:"05:30", q7:"06:00", want_wake:"07:00" };
ok("B (DB row, mapped): SE = 65", S.metrics({ ...dbB, qWake: dbB.want_wake }).se === 65);

// C. perfect night -> SE exactly 100
m = S.metrics({ q1:"23:00", q2:"23:00", q3:0, q5:0, q6:"07:00", q7:"07:00", qWake:null });
ok("C: perfect night TST = 480", m.tst === 480, `got ${m.tst}`);
ok("C: perfect night SE = 100", m.se === 100, `got ${m.se}`);

// D. missing required fields -> null (no fake numbers)
ok("D: missing bed time -> null", S.metrics({ q2:"23:00", q7:"07:00" }) === null);
ok("D: missing out-of-bed -> null", S.metrics({ q1:"23:00", q6:"07:00" }) === null);

// E. absurd 999' latency -> TST clamps to 0, SE 0 (never negative)
m = S.metrics({ q1:"23:00", q2:"23:00", q3:999, q5:0, q6:"07:00", q7:"07:00", qWake:null });
ok("E: TST clamped to 0", m.tst === 0, `got ${m.tst}`);
ok("E: SE = 0", m.se === 0, `got ${m.se}`);

// F. tried to sleep BEFORE getting in bed -> presleep 0, window from 22:30
m = S.metrics({ q1:"23:00", q2:"22:30", q3:0, q5:0, q6:"07:00", q7:"07:00", qWake:null });
ok("F: SE = 94 (480/510, window from earlier try-time)", m.se === 94, `got ${m.se}`);

// G. statMetrics excludes implausible nights from averages
const G1 = { q1:"17:00", q7:"12:00" };            // 19h in bed
ok("G: 19h night still SHOWN (metrics != null)", S.metrics(G1) !== null);
ok("G: 19h night EXCLUDED from averages", S.statMetrics(G1) === null);
const G2 = { q1:"07:00", q7:"06:00" };            // negative TIB
ok("G: negative-TIB night metrics has se=null", (S.metrics(G2) || {}).se === null);
ok("G: negative-TIB night EXCLUDED from averages", S.statMetrics(G2) === null);

// -- Athens-locked clinical dates --
const today = S.athensToday();
ok("athensToday() is YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(today), today);
const expected = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
ok("athensToday() matches Europe/Athens calendar date", today === expected, `${today} vs ${expected}`);
const days = S.athensDaysBack(14);
ok("athensDaysBack(14) returns 14 dates, newest first = today", days.length === 14 && days[0] === today);
const backOk = days.every((d, i) => i === 0 || (new Date(days[i - 1]) - new Date(d)) === 86400000);
ok("athensDaysBack: consecutive calendar days, no gaps", backOk, days.join(","));
ok("index.html todayISO is Athens-locked", /todayISO = \(\) => athensToday\(\)/.test(idx));
ok("doctor.html isoDays is Athens-locked", /isoDays = n => athensDaysBack\(n\)/.test(doc));

console.log(`\n==== math: ${pass}/${pass + fail} passed ====`);
process.exit(fail ? 1 : 0);
