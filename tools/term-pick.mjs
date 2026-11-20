// term-pick.mjs — 打印指定英文原文及其当前中文译文（位置级配对）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { alignByCode } from "./extract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OFFICIAL = path.join(ROOT, "backup-3.6.11", "renderer.js");
const PATCHED = path.join(ROOT, "patch-3.6.11", "renderer.js");

const srcO = fs.readFileSync(OFFICIAL, "utf8");
const srcP = fs.readFileSync(PATCHED, "utf8");
const { pairs } = alignByCode(srcO, srcP);

for (const n of process.argv.slice(2)) {
  const re = new RegExp(n, "i");
  const hits = pairs.filter(([a]) => re.test(a.value));
  console.log(`\n### ${n}（${hits.length} 条）`);
  let shown = 0;
  for (const [a, b] of hits) {
    if (a.value === b.value) continue;
    console.log("   EN " + JSON.stringify(a.value));
    console.log("   ZH " + JSON.stringify(b.value));
    if (++shown >= 8) break;
  }
}
