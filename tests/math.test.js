/* Sleep-math unit tests + index.html vs doctor.html parity.
   Extracts the REAL functions from both HTML files and runs hand-computed
   worked examples through them. */
const fs = require("fs"), vm = require("vm");
const R = p => fs.readFileSync("" + require("path").join(__dirname, "..") + "/" + p, "utf8");
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

// -- extract the math blocks --
const idx = R("index.html");
const doc = R("doctor.html");
const idxSrc = idx.match(/function toMin[\s\S]*?function statMetrics.*$/m)[0];
const docSrc = doc.match(/const toMin[\s\S]*?const statMetrics.*$/m)[0];
const IDX = {}, DOC = {};
vm.createContext(IDX); vm.runInContext(idxSrc + "; this.toMin=toMin; this.anchor=anchor; this.metrics=metrics; this.statMetrics=statMetrics;", IDX);
vm.createContext(DOC); vm.runInContext(docSrc + "; this.toMin=toMin; this.anchor=anchor; this.metrics=metrics; this.statMetrics=statMetrics;", DOC);

// -- H. primitives --
ok("toMin('07:05') = 425", IDX.toMin("07:05") === 425);
ok("toMin('') = null", IDX.toMin("") === null);
ok("toMin(null) = null", IDX.toMin(null) === null);
ok("anchor('12:00') = -720 (noon anchors to prev day)", IDX.anchor("12:00") === -720);
ok("anchor('11:59') = 719 (morning stays)", IDX.anchor("11:59") === 719);
ok("anchor('00:00') = 0", IDX.anchor("00:00") === 0);

// -- worked examples (hand-computed) --
// A. typical night: bed 23:00, try 23:30, 20' to fall asleep, 15' awake,
//    final wake 07:00, out of bed 07:30 -> TIB 510, TST 415, window 480, SE 86
const A = { q1:"23:00", q2:"23:30", q3:20, q5:15, q6:"07:00", q7:"07:30", qWake:null };
let m = IDX.metrics(A);
ok("A: TIB = 510", m.tib === 510, `got ${m.tib}`);
ok("A: TST = 415 (510-30 presleep-20 sol-15 waso-30 terminal)", m.tst === 415, `got ${m.tst}`);
ok("A: window = 480 (23:30->07:30)", m.opp === 480, `got ${m.opp}`);
ok("A: SE = 86 (415/480)", m.se === 86, `got ${m.se}`);

// B. THE wanted-wake rule: try 00:30, final wake 05:30, out 06:00, WANTED 07:00
//    window extends to 07:00 -> TIB 345, TST 255, window 390, SE 65
const B = { q1:"00:15", q2:"00:30", q3:45, q5:0, q6:"05:30", q7:"06:00", qWake:"07:00" };
m = IDX.metrics(B);
ok("B: TIB = 345", m.tib === 345, `got ${m.tib}`);
ok("B: TST = 255", m.tst === 255, `got ${m.tst}`);
ok("B: SE = 65 (window stretched to wanted wake 07:00)", m.se === 65, `got ${m.se}`);

// C. perfect night -> SE exactly 100
m = IDX.metrics({ q1:"23:00", q2:"23:00", q3:0, q5:0, q6:"07:00", q7:"07:00", qWake:null });
ok("C: perfect night TST = 480", m.tst === 480, `got ${m.tst}`);
ok("C: perfect night SE = 100", m.se === 100, `got ${m.se}`);

// D. missing required fields -> null (no fake numbers)
ok("D: missing bed time -> null", IDX.metrics({ q2:"23:00", q7:"07:00" }) === null);
ok("D: missing out-of-bed -> null", IDX.metrics({ q1:"23:00", q6:"07:00" }) === null);

// E. absurd 999' latency -> TST clamps to 0, SE 0 (never negative)
m = IDX.metrics({ q1:"23:00", q2:"23:00", q3:999, q5:0, q6:"07:00", q7:"07:00", qWake:null });
ok("E: TST clamped to 0", m.tst === 0, `got ${m.tst}`);
ok("E: SE = 0", m.se === 0, `got ${m.se}`);

// F. tried to sleep BEFORE getting in bed -> presleep 0, window from 22:30
m = IDX.metrics({ q1:"23:00", q2:"22:30", q3:0, q5:0, q6:"07:00", q7:"07:00", qWake:null });
ok("F: SE = 94 (480/510, window from earlier try-time)", m.se === 94, `got ${m.se}`);

// G. statMetrics excludes implausible nights from averages
const G1 = { q1:"17:00", q7:"12:00" };            // 19h in bed
ok("G: 19h night still SHOWN (metrics != null)", IDX.metrics(G1) !== null);
ok("G: 19h night EXCLUDED from averages", IDX.statMetrics(G1) === null);
const G2 = { q1:"07:00", q7:"06:00" };            // negative TIB
ok("G: negative-TIB night metrics has se=null", (IDX.metrics(G2) || {}).se === null);
ok("G: negative-TIB night EXCLUDED from averages", IDX.statMetrics(G2) === null);

// -- parity: same nights through doctor.html's copy --
const cmp = (a, b) => ["tib","tst","se","sol","waso"].every(k => (a?.[k] ?? "∅") === (b?.[k] ?? "∅"));
const nights = [A, B,
  { q1:"23:00", q2:"23:00", q3:0, q5:0, q6:"07:00", q7:"07:00", qWake:null },
  { q1:"23:00", q2:"22:30", q3:0, q5:0, q6:"07:00", q7:"07:00", qWake:null },
  { q1:"22:10", q2:"22:40", q3:35, q5:50, q6:"06:20", q7:"07:05", qWake:"06:00" },
  { q1:"01:30", q2:"02:00", q3:10, q5:120, q6:"09:00", q7:"09:45", qWake:"08:00" },
  { q1:"17:00", q7:"12:00" },
  { q1:"07:00", q7:"06:00" }];
nights.forEach((n, i) => ok(`parity night ${i + 1}: doctor.html math identical`, cmp(IDX.metrics(n), DOC.metrics(n))));

// fuzz: 300 random nights, both copies must agree
let mismatch = 0;
const rnd = n => Math.floor(Math.random() * n);
const hm = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`;
for (let i = 0; i < 300; i++) {
  const bed = 20 * 60 + rnd(420);
  const n = { q1: hm(bed), q2: rnd(5) ? hm(bed + rnd(90)) : null, q3: rnd(120), q5: rnd(90),
    q6: hm(5 * 60 + rnd(300)), q7: hm(6 * 60 + rnd(330)), qWake: rnd(3) ? hm(5 * 60 + rnd(300)) : null };
  if (!cmp(IDX.metrics(n), DOC.metrics(n))) mismatch++;
}
ok("fuzz: 300 random nights, both copies agree", mismatch === 0, `${mismatch} mismatches`);

// -- THE BUG CHECK: doctor.html receives RAW DB ROWS (want_wake, not qWake) --
// regression guard: the mapping line must exist in doctor.html
ok("doctor.html maps DB want_wake -> qWake before the math", /qWake:\s*r\.want_wake/.test(doc));
// and with that mapping applied, doctor math must equal patient math
const dbRowB = { q1:"00:15", q2:"00:30", q3:45, q5:0, q6:"05:30", q7:"06:00", want_wake:"07:00" }; // same night as B, DB column names
const mapped = { ...dbRowB, qWake: dbRowB.want_wake };
const docSE = DOC.metrics(mapped).se;
ok("DB-shaped row after mapping: doctor SE matches patient SE (65)", docSE === 65, `doctor SE=${docSE}`);
console.log(`\n==== math: ${pass}/${pass + fail} passed ====`);
process.exit(fail ? 1 : 0);
