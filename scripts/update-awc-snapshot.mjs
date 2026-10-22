import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const base = "https://aviationweather.gov/api/data";
async function get(path) {
  const response = await fetch(`${base}/${path}`, { headers: { "User-Agent": "VelocityXLPlanner/2.0 (public noncommercial simulator)", Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`AWC ${path}: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`AWC ${path}: schema changed`);
  return data;
}

const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/update-awc-snapshot.mjs OUTPUT.json");
const sigmets = await get("sigmet?format=json");
// Pilot reports are regional; the published scope is explicit. A 204 is no
// report, not evidence of smooth air. A failed endpoint aborts publication.
const pireps = await get("pirep?format=json&bbox=-130,20,-50,65");
const snapshot = { schemaVersion: 1, generatedAt: new Date().toISOString(),
  source: base, coverage: { sigmets: "AWC worldwide feed", pireps: "North America / North Atlantic bbox -130,20,-50,65" },
  sigmets, pireps };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot)}\n`);
process.stdout.write(`AWC live: ${sigmets.length} SIGMET, ${pireps.length} PIREP/AIREP\n`);
