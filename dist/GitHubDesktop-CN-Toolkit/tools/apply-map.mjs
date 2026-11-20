// apply-map.mjs — 把中英词典应用到任意版本的官方 JS 上（跨版本兜底）
//
// 审查意见 P1-1 的核心修复：不再"只要英文同名就替换"，而是先看这个字符串
// 在 AST 里是什么角色：
//   child / prop:label / prop:okButtonText … → 界面文案，可翻
//   enum / arg / expr                        → 逻辑位置，默认不动
// 例外：像一句话的英文（多词、无代码符号）即使落在 expr 里也允许翻。
// 另加一道闸：译文必须含中文，杜绝 "en-US" → "zh-CN" 这类把常量改掉的脏映射。
import fs from 'node:fs';
import { collectContext } from './extract.mjs';

const [, , inPath, outPath, mapPath] = process.argv;
const dict = new Map(Object.entries(JSON.parse(fs.readFileSync(mapPath, 'utf8'))));
const src = fs.readFileSync(inPath, 'utf8');
const items = collectContext(src);

const esc = (str, q) => {
  let out = '';
  for (const ch of str) {
    if (ch === '\\') out += '\\\\';
    else if (ch === q) out += '\\' + q;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else out += ch;
  }
  return out;
};
const escTpl = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const edits = [];
let hit = 0, skipLogic = 0, skipNonCjk = 0;
const unmatchedUI = [];

for (const it of items) {
  const zh = dict.get(it.value);
  const isUi = it.ui;

  if (zh === undefined || zh === it.value) {
    if (isUi && /[A-Za-z]/.test(it.value) && !/[\u4e00-\u9fa5]/.test(it.value)) {
      unmatchedUI.push(it.value);
    }
    continue;
  }

  // 闸一：只翻界面位置（多词兜底已移除——漏掉的界面位置靠 AST 规则补，不靠猜）
  if (!isUi) { skipLogic++; continue; }
  // 闸二：译文必须含中文（否则是把一个常量改成另一个常量）
  if (!/[\u4e00-\u9fa5]/.test(zh)) { skipNonCjk++; continue; }
  // 闸三：枚举反向映射永不替换
  if (it.role === 'enum') { skipLogic++; continue; }

  hit++;
  if (it.kind === 'str') {
    const q = src[it.start];
    edits.push({ start: it.start, end: it.end, text: q + esc(zh, q) + q });
  } else {
    edits.push({ start: it.start, end: it.end, text: escTpl(zh) });
  }
}

edits.sort((a, b) => b.start - a.start);
let out = src;
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
fs.writeFileSync(outPath, out, 'utf8');

const uniq = [...new Set(unmatchedUI)];
console.log(`应用词典：界面位置替换 ${hit} 处；跳过逻辑位置 ${skipLogic} 处、非中文译文 ${skipNonCjk} 处`);
console.log(`仍为英文的界面文本 ${uniq.length} 条（按位置统计）`);
if (process.argv.includes('--report')) {
  uniq.slice(0, 25).forEach((s) => console.log('  · ' + JSON.stringify(s)));
}
