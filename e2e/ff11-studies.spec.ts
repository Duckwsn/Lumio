import { test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const studies = [
  ["CS01", 1440, 900], ["CS02", 390, 844], ["CS02", 320, 568],
  ["CS03", 1440, 900], ["CS04", 390, 844], ["CS04", 844, 390],
  ["CS05", 1440, 900], ["CS06", 390, 844], ["CS06", 320, 568],
  ["CS07", 1440, 900], ["CS08", 1440, 900],
  ["CS09", 390, 844], ["CS09", 320, 568],
  ["CS10", 390, 844], ["CS10", 320, 568],
] as const;

test("FF1.1 isolated composition studies", async ({ browser }) => {
  const pass = process.env.FF11_STUDY_PASS ?? "pass1";
  const output = path.resolve("artifacts/frontfix/ff11/studies", pass);
  await mkdir(output, { recursive: true });
  const source = pathToFileURL(path.resolve("artifacts/frontfix/ff11/studies/study.html")).href;
  for (const [id, width, height] of studies) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${source}?study=${id}`);
    await page.screenshot({ path: path.join(output, `${id}-${width}x${height}.png`), fullPage: false });
    await context.close();
  }
});
