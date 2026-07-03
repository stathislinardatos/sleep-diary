// ============================================================
// Supabase Edge Function: "send-report"
// One tap in the app -> this builds a PDF of the patient's
// diary and emails it to the doctor from the practice Gmail.
//
// Deploy (Supabase Dashboard > Edge Functions > Deploy new):
//   name: send-report   (paste this whole file)
// Secrets (Edge Functions > send-report > Secrets):
//   GMAIL_USER          e.g. praktiki.ypnou@gmail.com
//   GMAIL_APP_PASSWORD  16-char app password (myaccount.google.com/apppasswords)
//   DOCTOR_EMAIL        where reports arrive
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---- same sleep math as the app ----
const toMin = (t?: string | null) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const anchor = (t?: string | null) => { const m = toMin(t); return m === null ? null : (m >= 720 ? m - 1440 : m); };
function metrics(e: Record<string, unknown>) {
  const bed = anchor(e.q1 as string), trySl = anchor(e.q2 as string);
  const fw = toMin(e.q6 as string), ob = toMin(e.q7 as string);
  const sol = Number(e.q3) || 0, waso = Number(e.q5) || 0;
  if (bed === null || ob === null) return null;
  const tib = ob - bed;
  const pre = (trySl !== null && trySl >= bed) ? trySl - bed : 0;
  const term = (fw !== null && ob >= fw) ? ob - fw : 0;
  let tst = tib - pre - sol - waso - term; if (tst < 0) tst = 0;
  return { tib, tst, se: tib > 0 ? Math.round(tst / tib * 100) : null, sol, waso };
}
const fmtDur = (m: number | null) => m == null ? "-" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const QUAL = ["Πολύ κακή", "Κακή", "Μέτρια", "Καλή", "Πολύ καλή"];

async function buildPdf(email: string, rows: Record<string, unknown>[]) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regBytes, boldBytes] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf").then(r => r.arrayBuffer()),
    fetch("https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf").then(r => r.arrayBuffer()),
  ]);
  const reg = await doc.embedFont(regBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const navy = rgb(0.14, 0.17, 0.27), teal = rgb(0.41, 0.71, 0.68), grey = rgb(0.45, 0.45, 0.5);

  let page = doc.addPage([595, 842]); // A4 portrait, points
  let y = 800;
  const newPage = () => { page = doc.addPage([595, 842]); y = 800; };

  // letterhead
  page.drawText("Πέρσα Παπαθεοδοσίου MD MSc PhDc", { x: 40, y, size: 14, font: bold, color: navy }); y -= 16;
  page.drawText("Ψυχίατρος – Υπνίατρος · Επιστημονική Συνεργάτις Αιγινήτειου Νοσοκομείου", { x: 40, y, size: 9, font: reg, color: navy }); y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 2, color: teal }); y -= 22;

  page.drawText("Αναφορά Ημερολογίου Ύπνου", { x: 40, y, size: 13, font: bold, color: navy }); y -= 14;
  const first = rows[0].date, last = rows[rows.length - 1].date;
  page.drawText(`Ασθενής: ${email}   ·   Περίοδος: ${first} - ${last}   ·   ${rows.length} νύχτες`, { x: 40, y, size: 9, font: reg, color: grey }); y -= 20;

  const ms = rows.map(metrics).filter(Boolean) as NonNullable<ReturnType<typeof metrics>>[];
  if (ms.length) {
    const avg = (f: "tib" | "tst" | "se" | "sol" | "waso") => Math.round(ms.reduce((s, m) => s + (m[f] ?? 0), 0) / ms.length);
    page.drawText(`Μέσοι όροι:  TST ${fmtDur(avg("tst"))}   SE ${avg("se")}%   SOL ${avg("sol")} λεπτά   WASO ${avg("waso")} λεπτά`, { x: 40, y, size: 10, font: bold, color: navy }); y -= 22;
  }

  // table
  const cols = [
    { w: 62, h: "Ημ/νία" }, { w: 44, h: "Κρεβάτι" }, { w: 44, h: "Έγερση" }, { w: 56, h: "Ύπνος" },
    { w: 34, h: "SE" }, { w: 40, h: "SOL" }, { w: 44, h: "WASO" }, { w: 62, h: "Ποιότητα" }, { w: 129, h: "Σχόλια" },
  ];
  const drawRow = (cells: string[], f = reg, size = 8) => {
    let x = 40;
    cells.forEach((c, i) => {
      const maxChars = Math.floor(cols[i].w / (size * 0.52));
      page.drawText(String(c ?? "").slice(0, maxChars), { x, y, size, font: f, color: navy });
      x += cols[i].w;
    });
    y -= 13;
  };
  drawRow(cols.map(c => c.h), bold, 8);
  page.drawLine({ start: { x: 40, y: y + 9 }, end: { x: 555, y: y + 9 }, thickness: 0.7, color: teal });
  for (const r of rows) {
    if (y < 60) newPage();
    const m = metrics(r);
    drawRow([
      String(r.date), String(r.q1 ?? "-"), String(r.q7 ?? "-"),
      m ? fmtDur(m.tst) : "-", m?.se != null ? m.se + "%" : "-",
      (r.q3 ?? "0") + "λ", (r.q5 ?? "0") + "λ",
      r.q8 != null ? QUAL[r.q8 as number] : "-", String(r.q9 ?? ""),
    ]);
  }
  y -= 8;
  if (y < 50) newPage();
  page.drawText("Consensus Sleep Diary © 2011 Carney et al. Χρήση αναλλοίωτη, μη κερδοσκοπική. Carney CE et al., SLEEP 2012;35(2):287-302.",
    { x: 40, y, size: 6.5, font: reg, color: grey });
  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "not signed in" }, 401);

    const { data: rows, error } = await supabase.from("entries")
      .select("*").eq("user_id", user.id).order("date", { ascending: true }).limit(31);
    if (error) return json({ error: error.message }, 500);
    if (!rows?.length) return json({ error: "no diary entries yet" }, 400);

    const pdf = await buildPdf(user.email ?? "", rows);

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com", port: 465, tls: true,
        auth: { username: Deno.env.get("GMAIL_USER")!, password: Deno.env.get("GMAIL_APP_PASSWORD")! },
      },
    });
    await client.send({
      from: Deno.env.get("GMAIL_USER")!,
      to: Deno.env.get("DOCTOR_EMAIL")!,
      replyTo: user.email ?? undefined,
      subject: `Αναφορά ημερολογίου ύπνου — ${user.email}`,
      content: "auto",
      html: `<p>Αγαπητή κυρία Παπαθεοδοσίου,</p>
             <p>Συνημμένη θα βρείτε την αναφορά ημερολογίου ύπνου του/της ασθενούς <b>${user.email}</b>
             (${rows.length} νύχτες, ${rows[0].date} – ${rows[rows.length - 1].date}).</p>
             <p>Αυτό το μήνυμα στάλθηκε αυτόματα από την εφαρμογή Ημερολογίου Ύπνου.</p>`,
      attachments: [{
        filename: "sleep-report.pdf",
        content: pdf, encoding: "binary", contentType: "application/pdf",
      }],
    });
    await client.close();
    return json({ ok: true, nights: rows.length });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
