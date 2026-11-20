// zh-lookup.mjs — 反向查询：给定中文串，找出对应的英文原文
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { alignByCode } from "./extract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcO = fs.readFileSync(path.join(ROOT, "backup-3.6.11", "renderer.js"), "utf8");
const srcP = fs.readFileSync(path.join(ROOT, "patch-3.6.11", "renderer.js"), "utf8");
const { pairs } = alignByCode(srcO, srcP);

for (const zh of process.argv.slice(2)) {
  const hit = pairs.find(([, b]) => b.value === zh);
  console.log(hit ? `EN ${JSON.stringify(hit[0].value)}\n   ZH ${JSON.stringify(zh)}\n` : `? 未找到: ${JSON.stringify(zh)}\n`);
}
