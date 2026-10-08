// Turns the collector's results.jsonl into Markdown tables, one per test.
//
//   node tools/limits-report.mjs results.jsonl [samples.jsonl] > report.md

import { readFileSync } from 'node:fs';

const [resultsFile, samplesFile] = process.argv.slice(2);
const lines = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const results = lines(resultsFile);
const samples = samplesFile ? lines(samplesFile) : [];

const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const FRAME = [
  ['value', (r) => r.value],
  ['fps', (r) => r.fps],
  ['1% low', (r) => r.low1Fps],
  ['median ms', (r) => r.p50Ms],
  ['worst ms', (r) => r.maxMs],
  ['JS+render CPU ms', (r) => r.cpuMs],
  ['draw calls', (r) => r.calls],
  ['triangles', (r) => k(r.triangles)],
];

const byTest = new Map();
for (const r of results) {
  if (!byTest.has(r.test)) byTest.set(r.test, []);
  byTest.get(r.test).push(r);
}

const out = [];
for (const [test, rows] of byTest) {
  out.push(`### ${test}\n`);
  if (rows[0].fps !== undefined) {
    out.push(`| ${FRAME.map(([h]) => h).join(' | ')} |`, `|${FRAME.map(() => '---').join('|')}|`);
    for (const r of rows) out.push(r.error ? `| ${r.value} | error: ${r.error} |` : `| ${FRAME.map(([, f]) => f(r)).join(' | ')} |`);
  } else {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((key) => !['test', 'ts', 'extensions', 'ua'].includes(key));
    out.push(`| ${keys.join(' | ')} |`, `|${keys.map(() => '---').join('|')}|`);
    for (const r of rows) out.push(`| ${keys.map((key) => r[key] ?? '').join(' | ')} |`);
  }
  out.push('');
}

if (samples.length) {
  const temps = samples.map((s) => Math.max(...Object.values(s.temps)));
  const gpu = samples.map((s) => s.gpuMHz);
  const cpu = samples.map((s) => s.cpuMHz);
  out.push(
    '### During the run\n',
    `- Hottest sensor: ${Math.min(...temps).toFixed(0)} to ${Math.max(...temps).toFixed(0)} °C`,
    `- CPU clock: ${Math.min(...cpu)} to ${Math.max(...cpu)} MHz; GPU clock: ${Math.min(...gpu)} to ${Math.max(...gpu)} MHz`,
    `- Free memory: ${Math.min(...samples.map((s) => s.avail))} to ${Math.max(...samples.map((s) => s.avail))} MB`,
    '',
  );
}
console.log(out.join('\n'));
