import { chromium } from "playwright";
import { Client } from "pg";

/**
 * Screenshot a signed-in page. Fails loudly rather than silently capturing the
 * login screen, which is what a bad cookie looks like.
 *
 *   node scripts/shot.mjs <out.png> [route]
 */
const out = process.argv[2] ?? "shot.png";
const route = process.argv[3] ?? "dashboard";

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();
const { rows } = await pg.query(
  'SELECT "sessionToken" FROM public."Session" WHERE expires > now() ORDER BY expires DESC LIMIT 1',
);
await pg.end();
if (!rows[0]) {
  console.error("No valid session. Sign in at http://localhost:3000 first.");
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
await ctx.addCookies([
  {
    name: "authjs.session-token",
    value: rows[0].sessionToken,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  },
]);

const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const res = await page.goto(`http://localhost:3000/${route}`, {
  waitUntil: "domcontentloaded",
});
// Let Recharts mount and size itself against the container.
await page.waitForTimeout(1500);

const url = page.url();
if (url.includes("/login")) {
  console.error(`Redirected to /login (status ${res?.status()}). Cookie rejected.`);
  await browser.close();
  process.exit(1);
}

const charts = await page.locator("svg.recharts-surface").count();
const empties = await page.getByText("Collecting data").count();
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);

console.log(`url             : ${url}`);
console.log(`recharts charts : ${charts}`);
console.log(`"Collecting..." : ${empties}`);
console.log(`horizontal overflow: ${overflow ? "YES (layout bug)" : "no"}`);
console.log(`console errors  : ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  ! " + e.slice(0, 160));

await page.screenshot({ path: out, fullPage: true });
console.log(`saved ${out}`);
await browser.close();
