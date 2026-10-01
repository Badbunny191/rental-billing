/**
 * Cloudflare Workers AI Vision Benchmark
 * ======================================
 *
 * Run against 36 source meter images.
 * Hits the local wrangler dev endpoint POST /test-meter-ocr
 * which uses env.AI.run("@cf/llava-1.5-7b-hf", ...)
 *
 * Output:
 *   filename | expected | actual | match
 *
 * Usage:
 *   1. Terminal A: npx wrangler dev --port 8787
 *   2. Terminal B: node src/benchmark-cf-vision.mjs
 *
 * (You can also pass a custom URL via env: BASE_URL=http://localhost:8787)
 */

import fs from "node:fs/promises";
import path from "node:path";

const DIR = "/Users/thanet/rental-billing/test-images/meter";
const BASE_URL = process.env.BASE_URL || "http://localhost:8787";
const ENDPOINT = `${BASE_URL}/test-meter-ocr`;

async function main() {
  const gtRaw = await fs.readFile(path.join(DIR, "ground-truth.json"), "utf8");
  const gtMap = Object.fromEntries(
    JSON.parse(gtRaw).images.map((g) => [g.file, String(g.reading)])
  );

  const files = (await fs.readdir(DIR))
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  console.log(`Cloudflare Workers AI Vision Benchmark`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Images:   ${files.length}`);
  console.log(`Model:    @cf/llava-1.5-7b-hf\n`);

  // Health check
  try {
    const health = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "" }),
    });
    if (health.status === 500) {
      const t = await health.text();
      if (t.includes("AI binding not configured")) {
        console.error(`❌ AI binding not configured in wrangler.toml.`);
        process.exit(1);
      }
    }
    console.log(`✓ Endpoint reachable\n`);
  } catch (e) {
    console.error(`❌ Cannot reach ${ENDPOINT}`);
    console.error(`   Make sure wrangler dev is running: npx wrangler dev --port 8787`);
    console.error(`   Error: ${e.message}`);
    process.exit(1);
  }

  const results = [];
  let ok = 0, fail = 0;
  const errors = [];

  console.log("filename                            expected  actual    match  time");
  console.log("----------------------------------------------------------------------");

  for (const file of files) {
    const expected = gtMap[file] || "";
    const buf = await fs.readFile(path.join(DIR, file));
    const b64 = buf.toString("base64");

    const start = Date.now();
    let actual = "";
    let raw = "";
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64 }),
      });
      const json = await res.json();
      actual = String(json.reading || "");
      raw = String(json.raw || "");
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    } catch (e) {
      actual = "ERR";
      errors.push({ file, error: e.message });
    }
    const elapsed = Date.now() - start;

    const match = actual === expected;
    if (match) ok++;
    else fail++;

    results.push({ file, expected, actual, match, time_ms: elapsed, raw });

    const mark = match ? "✓" : "✗";
    console.log(
      `${file.padEnd(34)}  ${expected.padEnd(7)}  ${actual.padEnd(7)}  ${mark.padEnd(4)}  ${elapsed}ms`
    );
  }

  const accuracy = (ok / files.length) * 100;
  const totalTime = results.reduce((s, r) => s + r.time_ms, 0);
  const avgTime = totalTime / files.length;

  console.log("\n=== SUMMARY ===");
  console.log(`Accuracy:     ${ok}/${files.length} = ${accuracy.toFixed(1)}%`);
  console.log(`Avg latency:  ${avgTime.toFixed(0)}ms per image`);
  console.log(`Total time:   ${(totalTime/1000).toFixed(1)}s`);
  console.log(``);
  console.log(`Decision threshold: 90%`);
  console.log(`Status: ${accuracy >= 90 ? "✓ PASS — use Workers AI Vision" : "✗ FAIL — continue custom detector pipeline"}`);

  if (fail > 0) {
    console.log(`\nFailed (${fail}):`);
    results.filter((r) => !r.match).forEach((r) => {
      console.log(`  ${r.file}  expected=${r.expected}  got=${r.actual}`);
    });
  }

  // Save full report
  await fs.writeFile(
    path.join(DIR, "cf-vision-report.json"),
    JSON.stringify({
      endpoint: ENDPOINT,
      model: "@cf/llava-1.5-7b-hf",
      total: files.length,
      success: ok,
      fail,
      accuracy,
      avg_time_ms: avgTime,
      decision: accuracy >= 90 ? "pass" : "fail",
      results,
      errors,
    }, null, 2)
  );
  console.log(`\nFull report: ${path.join(DIR, "cf-vision-report.json")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });