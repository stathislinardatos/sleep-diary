// Extract every inline <script> from the two pages and syntax-check each with node --check.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const outDir = path.join(__dirname, ".tmp");
fs.mkdirSync(outDir, { recursive: true });
let fail = 0;
for (const page of ["index.html", "doctor.html"]) {
  const html = fs.readFileSync(path.join("" + require("path").join(__dirname, "..") + "", page), "utf8");
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    i++;
    const isModule = /type\s*=\s*["']module["']/.test(m[1]);
    const f = path.join(outDir, `${page.replace(".html","")}-${i}${isModule ? ".mjs" : ".js"}`);
    fs.writeFileSync(f, m[2]);
    try {
      execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
      console.log(`OK   ${page} script #${i} (${isModule ? "module" : "classic"}, ${m[2].length} chars)`);
    } catch (e) {
      fail++;
      console.log(`FAIL ${page} script #${i}:\n${e.stderr}`);
    }
  }
}
for (const f of ["scoring.js", "config.js", "sw.js"]) {
  try {
    execFileSync(process.execPath, ["--check", path.join(__dirname, "..", f)], { stdio: "pipe" });
    console.log(`OK   ${f}`);
  } catch (e) { fail++; console.log(`FAIL ${f}:\n${e.stderr}`); }
}
process.exit(fail ? 1 : 0);
