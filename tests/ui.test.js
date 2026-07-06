/* Drive the sleep-diary app in headless Edge: desktop + iPhone viewports.
   Blocks Supabase signup calls so no junk accounts are created, but captures
   the request body to verify consent metadata is sent. */
const puppeteer = require("puppeteer-core");
const path = require("path");
const BASE = "http://localhost:5178";
const SHOT = p => path.join(__dirname, "shots", p);
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

async function testViewport(browser, label, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  let signupBody = null;
  await page.setRequestInterception(true);
  page.on("request", req => {
    if (req.url().includes("/auth/v1/signup")) {
      if (req.method() === "OPTIONS") // answer the CORS preflight so the real POST follows
        return req.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      signupBody = req.postData(); return req.abort(); // capture the POST, create no real account
    }
    req.continue();
  });
  page.on("pageerror", e => ok(`${label}: NO page JS error`, false, String(e).slice(0, 200)));

  // 1. main page (wait out the splash screen, ~4.3s)
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById("splash"), { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: SHOT(`${label}-1-main.png`) });
  const authBtn = await page.$("#authBtn");
  ok(`${label}: main page renders + sign-in button`, !!authBtn);

  // CSD clinical integrity: questions 1-9 all present, in order, exact stored wording
  const csd = await page.evaluate(() => {
    const t = window.T(); const body = document.body.innerText;
    let last = -1;
    for (let i = 1; i <= 9; i++) {
      const q = t["q" + i]; if (!q) return "missing STR key q" + i;
      const pos = body.indexOf(q.trim());
      if (pos < 0) return "q" + i + " not rendered";
      if (pos < last) return "q" + i + " out of order";
      last = pos;
    }
    return "ok";
  });
  ok(`${label}: CSD questions 1-9 present, exact wording, in order`, csd === "ok", csd);

  // 2. open login, switch to signup
  await page.click("#authBtn");
  await page.waitForSelector("#liEmail", { timeout: 5000 });
  await page.screenshot({ path: SHOT(`${label}-2-signin.png`) });
  await page.click("#liToggle");
  await page.waitForSelector("#liConsent", { timeout: 5000 });
  await page.screenshot({ path: SHOT(`${label}-3-signup.png`) });

  // 3. are all controls actually reachable (inside the viewport, scrolling the card if needed)?
  await page.evaluate(() => { const el = document.getElementById("liGo"); el && el.scrollIntoView({ block: "nearest" }); });
  const geom = await page.evaluate(() => {
    const r = id => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height, w: b.width }; };
    const card = document.querySelector("#loginOv .sheet").getBoundingClientRect();
    return { vh: innerHeight, vw: innerWidth, card: { top: card.top, bottom: card.bottom, h: card.height },
      pin: r("liPin"), consent: r("liConsent"), go: r("liGo"), email: r("liEmail"), close: r("liClose") };
  });
  const inView = b => b && b.top >= 0 && b.bottom <= geom.vh;
  ok(`${label}: card fits viewport (card ${Math.round(geom.card.h)}px vs viewport ${geom.vh}px)`, geom.card.top >= 0 && geom.card.bottom <= geom.vh);
  ok(`${label}: PIN field reachable`, inView(geom.pin));
  ok(`${label}: consent checkbox reachable`, inView(geom.consent));
  ok(`${label}: create-account button reachable`, inView(geom.go));
  // in a short window the card must SCROLL — email may start above, but must be scrollable back into view
  const emailReachable = await page.evaluate(() => {
    const el = document.getElementById("liEmail"); el.scrollIntoView({ block: "center" });
    const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight;
  });
  ok(`${label}: email field reachable (scroll if needed)`, emailReachable);
  const closeReachable = await page.evaluate(() => {
    const el = document.getElementById("liClose"); el.scrollIntoView({ block: "nearest" });
    const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight;
  });
  ok(`${label}: close (✕) reachable (scroll if needed)`, closeReachable);
  await page.evaluate(() => document.getElementById("liGo").scrollIntoView({ block: "nearest" }));

  // 4. clicking the label TEXT must toggle the checkbox (big tap target)
  await page.evaluate(() => document.querySelector("#loginOv label span b").click());
  let checked = await page.$eval("#liConsent", el => el.checked);
  ok(`${label}: tapping consent TEXT ticks the box`, checked);
  await page.evaluate(() => { document.getElementById("liConsent").checked = false; });

  // 5. validation: no consent -> error, no network
  await page.type("#liEmail", "test@example.com");
  await page.type("#liPw", "abcdef");
  await page.click("#liGo");
  let err = await page.$eval("#liErr", el => el.textContent);
  ok(`${label}: blocks signup without consent`, /συγκατάθεσης|consent/i.test(err), err.slice(0, 60));

  // 6. wrong PIN -> error, no network
  await page.evaluate(() => { document.getElementById("liConsent").checked = true; });
  await page.type("#liPin", "22222");
  await page.click("#liGo");
  err = await page.$eval("#liErr", el => el.textContent);
  ok(`${label}: rejects wrong PIN`, /PIN/i.test(err), err.slice(0, 60));
  await page.screenshot({ path: SHOT(`${label}-4-wrongpin.png`) });

  // 7. correct PIN -> signup request fires WITH metadata (aborted, no real account)
  await page.evaluate(() => { const p = document.getElementById("liPin"); p.value = ""; });
  await page.type("#liPin", "11111");
  await page.click("#liGo");
  await new Promise(r => setTimeout(r, 1500));
  const meta = signupBody ? JSON.parse(signupBody) : null;
  ok(`${label}: signup request sent to Supabase`, !!signupBody);
  ok(`${label}: consent timestamp in metadata`, !!(meta && meta.data && meta.data.gdpr_consent_at), meta ? JSON.stringify(meta.data) : "no body");
  ok(`${label}: PIN in metadata`, !!(meta && meta.data && meta.data.practice_pin === "11111"));

  // 8. language toggle to EN, re-open signup
  await page.click("#liClose");
  const langBtn = await page.$("#langBtn") || await page.$("[data-lang]") || null;
  const enOk = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button,a")].filter(b => /^(EN|ΕΛ|GR)$/i.test(b.textContent.trim()));
    if (btns.length) { btns[0].click(); return true; } return false;
  });
  if (enOk) {
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: SHOT(`${label}-5-en.png`) });
  }
  ok(`${label}: EN toggle found`, enOk);

  // 9. doctor.html login screen
  const p2 = await browser.newPage();
  await p2.setViewport(viewport);
  await p2.goto(BASE + "/doctor.html", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  await p2.screenshot({ path: SHOT(`${label}-6-doctor.png`) });
  const docLogin = await p2.$("#e");
  ok(`${label}: doctor.html renders login`, !!docLogin);
  await p2.close();
  await page.close();
}

async function desktopExtras(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", e => ok("extras: NO page JS error", false, String(e).slice(0, 200)));
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById("splash"), { timeout: 10000 });

  // every tab of the app opens without a JS error
  for (const tab of ["Ημερολόγιο", "Πορεία", "Ευεξία", "Ρυθμίσεις"]) {
    const clicked = await page.evaluate(t => {
      const b = [...document.querySelectorAll("nav *,button,a,div")].find(el => el.childElementCount === 0 && el.textContent.trim() === t);
      if (b) { b.click(); return true; } return false;
    }, tab);
    await new Promise(r => setTimeout(r, 500));
    const alive = await page.evaluate(() => document.body.innerText.trim().length > 50);
    await page.screenshot({ path: SHOT(`tab-${tab}.png`) });
    ok(`extras: tab "${tab}" opens and renders`, clicked && alive);
  }

  // popup dismissal: Esc, tap-outside, ✕ — all three must work
  const openLogin = async () => { await page.evaluate(() => document.querySelector('[data-page="today"],nav *')?.textContent), await page.evaluate(() => { const b = [...document.querySelectorAll("button,a")].find(el => el.textContent.trim() === "Σήμερα"); b && b.click(); }); await page.click("#authBtn"); await page.waitForSelector("#liEmail", { timeout: 5000 }); };
  await openLogin();
  await page.keyboard.press("Escape");
  ok("extras: Esc closes login popup", await page.evaluate(() => !document.getElementById("loginOv")));
  await openLogin();
  await page.mouse.click(15, 450);
  ok("extras: tap outside closes login popup", await page.evaluate(() => !document.getElementById("loginOv")));
  await openLogin();
  await page.click("#liClose");
  ok("extras: ✕ closes login popup", await page.evaluate(() => !document.getElementById("loginOv")));

  // error paths in SIGN-IN mode
  await openLogin();
  await page.click("#liGo"); // empty fields
  let err = await page.$eval("#liErr", el => el.textContent);
  ok("extras: empty sign-in shows 'fill both' error", /email/i.test(err), err.slice(0, 50));
  await page.type("#liEmail", "does-not-exist-csd-test@example.com");
  await page.type("#liPw", "wrongpassword");
  await page.click("#liGo"); // real round-trip to Supabase -> badCreds
  await page.waitForFunction(() => document.getElementById("liErr").textContent.length > 0, { timeout: 10000 });
  err = await page.$eval("#liErr", el => el.textContent);
  ok("extras: wrong credentials shows friendly error (live round-trip)", /σωστά|correct/i.test(err), err.slice(0, 60));

  // short password in SIGNUP mode
  await page.click("#liToggle");
  await page.waitForSelector("#liConsent", { timeout: 5000 });
  await page.type("#liEmail", "x@example.com");
  await page.type("#liPw", "abc");
  await page.evaluate(() => { document.getElementById("liConsent").checked = true; });
  await page.click("#liGo");
  err = await page.$eval("#liErr", el => el.textContent);
  ok("extras: short password rejected", /6/.test(err), err.slice(0, 50));

  // doctor dashboard pipeline: DB-shaped rows -> buildPatients -> correct SE + consent badge data
  const dp = await browser.newPage();
  await dp.goto(BASE + "/doctor.html", { waitUntil: "networkidle2", timeout: 30000 });
  const built = await dp.evaluate(() => {
    const today = new Date().toISOString().slice(0, 10);
    const row = { user_id: "t1", date: today, q1: "00:15", q2: "00:30", q3: 45, q5: 0, q6: "05:30", q7: "06:00", want_wake: "07:00" };
    const mapped = { ...row, qWake: row.want_wake }; // same mapping boot() now applies
    const p = window.__buildPatients([{ id: "t1", email: "test@x.gr", consent_at: "2026-07-06T10:00:00Z", practice_pin: "11111" }], { t1: [mapped] })[0];
    return { avgSE: p.avgSE, avgTST: p.avgTST, nights14: p.nights14, consent: !!p.consent, pin: p.pin };
  });
  ok("doctor pipeline: avg SE = 65 (wanted-wake rule respected)", built.avgSE === 65, `got ${built.avgSE}`);
  ok("doctor pipeline: avg TST = 255 min", built.avgTST === 255, `got ${built.avgTST}`);
  ok("doctor pipeline: night counted in 14-day compliance", built.nights14 === 1);
  ok("doctor pipeline: consent + PIN carried to the badge", built.consent && built.pin === "11111");
  await dp.close();

  // offline honesty: a network failure must say "no connection", never "wrong password"
  const op = await browser.newPage();
  await op.setViewport({ width: 1280, height: 900 });
  await op.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await op.waitForFunction(() => !document.getElementById("splash"), { timeout: 10000 });
  await op.click("#authBtn");
  await op.waitForSelector("#liEmail", { timeout: 5000 });
  if (await op.$("#liConsent")) { await op.click("#liToggle"); await op.waitForFunction(() => !document.getElementById("liConsent"), { timeout: 5000 }); }
  await op.setOfflineMode(true);
  await op.type("#liEmail", "offline@example.com");
  await op.type("#liPw", "somepassword");
  await op.click("#liGo");
  await op.waitForFunction(() => document.getElementById("liErr").textContent.length > 0, { timeout: 10000 });
  let oerr = await op.$eval("#liErr", el => el.textContent);
  ok("extras: OFFLINE sign-in says 'no connection' (not wrong password)", /σύνδεση|connection/i.test(oerr) && !/σωστά|correct/i.test(oerr), oerr.slice(0, 70));
  await op.click("#liToggle");
  await op.waitForSelector("#liConsent", { timeout: 5000 });
  await op.evaluate(() => { document.getElementById("liConsent").checked = true; });
  await op.type("#liEmail", "offline@example.com");
  await op.type("#liPw", "somepassword");
  await op.click("#liGo");
  await op.waitForFunction(() => document.getElementById("liErr").textContent.length > 0, { timeout: 10000 });
  oerr = await op.$eval("#liErr", el => el.textContent);
  ok("extras: OFFLINE signup says 'no connection', details not lost silently", /σύνδεση|connection/i.test(oerr), oerr.slice(0, 70));
  await op.setOfflineMode(false);
  await op.close();

  // EN: signup strings translated
  await page.click("#liClose");
  await page.evaluate(() => { const b = [...document.querySelectorAll("button,a")].find(el => /^EN$/i.test(el.textContent.trim())); b && b.click(); });
  await new Promise(r => setTimeout(r, 400));
  await page.click("#authBtn");
  await page.waitForSelector("#liEmail", { timeout: 5000 });
  if (!(await page.$("#liConsent"))) { await page.click("#liToggle"); await page.waitForSelector("#liConsent", { timeout: 5000 }); } // modal may reopen already in signup mode
  const enConsent = await page.evaluate(() => document.querySelector("#loginOv label span b").textContent);
  ok("extras: EN consent label translated", /consent to the processing/i.test(enConsent), enConsent.slice(0, 60));
  await page.close();
}

async function staticChecks() {
  const fs = require("fs");
  const get = u => new Promise(res => require("http").get(u, r => { let b = ""; r.on("data", c => b += c); r.on("end", () => res({ code: r.statusCode, body: b })); }).on("error", () => res({ code: 0, body: "" })));
  const man = await get(BASE + "/manifest.json");
  ok("static: manifest.json serves 200", man.code === 200);
  ok("static: manifest has name + icons (installable PWA)", /name/.test(man.body) && /icons/.test(man.body));
  const sw = await get(BASE + "/sw.js");
  ok("static: sw.js serves 200", sw.code === 200);
  const cfg = fs.readFileSync("" + require("path").join(__dirname, "..") + "/config.js", "utf8");
  ok("static: config.js has PRACTICE_PIN 11111", /PRACTICE_PIN:\s*"11111"/.test(cfg));
  const schema = fs.readFileSync("" + require("path").join(__dirname, "..") + "/csd-server/schema.sql", "utf8");
  ok("static: schema.sql role-escalation hole is closed (with check present)",
    /update own profile[\s\S]*?with check[\s\S]*?role = \(select role/.test(schema));
  const allow = ["supabase.co", "esm.sh", "cdnjs.cloudflare.com", "www.w3.org"];
  const bad = [];
  for (const f of ["index.html", "doctor.html", "config.js"]) {
    const src = fs.readFileSync("" + require("path").join(__dirname, "..") + "/" + f, "utf8");
    for (const m of src.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g))
      if (!allow.some(a => m[1].endsWith(a))) bad.push(f + ":" + m[1]);
  }
  ok("static: no third-party hosts beyond Supabase + 2 CDNs", bad.length === 0, bad.join(", "));
}

(async () => {
  require("fs").mkdirSync(path.join(__dirname, "shots"), { recursive: true });
  const exe = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(p => require("fs").existsSync(p));
  if (!exe) { console.error("No Edge/Chrome found for headless testing."); process.exit(2); }
  const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--no-first-run"] });
  await testViewport(browser, "desktop", { width: 1280, height: 900 });
  await testViewport(browser, "iphone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  // small phone (SE) — the tough case for overflow
  await testViewport(browser, "iphoneSE", { width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  // short desktop window — laptop at 125–150% Windows scaling (the "untouchable on PC" case)
  await testViewport(browser, "shortpc", { width: 1024, height: 560 });
  await desktopExtras(browser);
  await staticChecks();
  await browser.close();
  const fails = results.filter(r => !r.pass);
  console.log(`\n==== ${results.length - fails.length}/${results.length} passed ====`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("RUNNER ERROR:", e); process.exit(2); });
