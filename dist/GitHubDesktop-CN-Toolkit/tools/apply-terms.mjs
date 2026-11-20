// apply-terms.mjs — 术语保留层：把被硬翻的专业术语改回英文，并修正硬错
// 用法: node apply-terms.mjs <官方原版|-> <已汉化> <输出> [terms.json]
//
// 审查意见 P2-4：改为**每个字符串只走一遍**。先用按代码位置配对建立
// "位置 → 英文原文" 映射，然后单次遍历目标文件，按统一顺序决定最终文本：
//   whole（按英文整串覆盖） → byZh（按中文整串修正） → byContext（按代码特征）
//   → 片段还原 → 菜单格式 → 中英留白
// 不再有"第二遍用已生成编辑位置"的分裂逻辑，也不会出现 byZh 命中后跳过格式化的不一致。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectContext, alignByCode } from './extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , officialPath, patchedPath, outPath, termsPath] = process.argv;
const cfg = JSON.parse(fs.readFileSync(termsPath || path.join(ROOT, 'terms.json'), 'utf8'));
const hasOfficial = !!officialPath && officialPath !== '-';

const src = fs.readFileSync(patchedPath, 'utf8');
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

// 位置 → 英文原文（只在能把两份文件按代码位置对齐时才有）
const enByStart = new Map();
if (hasOfficial) {
  const srcO = fs.readFileSync(officialPath, 'utf8');
  const { pairs } = alignByCode(srcO, src);
  for (const [a, b] of pairs) enByStart.set(b.start, a.value);
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const CJK = '\\u4e00-\\u9fa5';

// 片段还原：纯字符串替换，不再吞掉两侧汉字（留白交给 addSpacing），
// 避免同一术语紧邻出现时只替换一次
const frags = Object.entries(cfg.fragments || {}).sort((a, b) => b[0].length - a[0].length);
function restoreFragments(s) {
  if (!new RegExp(`[${CJK}]`).test(s)) return s;
  let out = s;
  for (const [cn, en] of frags) if (out.includes(cn)) out = out.split(cn).join(en);
  return out;
}

// 菜单助记符：&F.文件 → 文件(&F)
function toChineseMenu(s) {
  const m = /^&([A-Za-z])\.(.+?)(…|\.\.\.)?$/.exec(s);
  if (!m) return s;
  return `${m[2]}(&${m[1]})${m[3] || ''}`;
}

// 中英之间留白
function addSpacing(s) {
  if (!new RegExp(`[${CJK}]`).test(s)) return s;
  return s
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9@#$])/g, '$1 $2')
    .replace(/([A-Za-z0-9%)\]}])([\u4e00-\u9fa5])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ');
}

// 上下文精确替换（仅当字符串前方是特定代码片段时才改）
function contextual(s, start) {
  for (const rule of cfg.byContext || []) {
    if (s !== rule.from) continue;
    if (rule.before !== undefined) {
      const before = src.slice(Math.max(0, start - rule.before.length), start);
      if (before === rule.before) return rule.to;
    }
    if (rule.beforeRegex) {
      const win = src.slice(Math.max(0, start - 80), start);
      if (new RegExp(rule.beforeRegex).test(win)) return rule.to;
    }
  }
  return s;
}

const edits = [];
const count = { whole: 0, byZh: 0, ctx: 0, frag: 0, menu: 0, space: 0 };

for (const it of items) {
  const en = enByStart.get(it.start);
  let next = it.value, tag = '';

  if (en != null && has(cfg.whole || {}, en)) { next = cfg.whole[en]; tag = 'whole'; }
  else if (has(cfg.byZh || {}, it.value)) { next = cfg.byZh[it.value]; tag = 'byZh'; }
  else { const c = contextual(it.value, it.start); if (c !== it.value) { next = c; tag = 'ctx'; } }

  // 统一后处理：只对界面位置或命中显式规则的串执行，
  // 不再对所有字面量做术语替换和留白（避免碰逻辑字符串）。
  if (it.ui || tag) {
    const f1 = restoreFragments(next); if (f1 !== next) { next = f1; tag = tag || 'frag'; }
    const f2 = cfg.menuStyle ? toChineseMenu(next) : next; if (f2 !== next) { next = f2; tag = tag || 'menu'; }
    const f3 = addSpacing(next); if (f3 !== next) { next = f3; tag = tag || 'space'; }
  }

  if (next === it.value) continue;
  if (count[tag] == null) count.frag++; else count[tag]++;

  if (it.kind === 'str') {
    const q = src[it.start];
    edits.push({ start: it.start, end: it.end, text: q + esc(next, q) + q });
  } else {
    edits.push({ start: it.start, end: it.end, text: escTpl(next) });
  }
}

edits.sort((x, y) => y.start - x.start);
let out = src;
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
fs.writeFileSync(outPath, out, 'utf8');

console.log(`术语层：整串覆盖 ${count.whole}，中文侧 ${count.byZh}，上下文 ${count.ctx}，` +
  `片段 ${count.frag}，菜单 ${count.menu}，留白 ${count.space}（对齐位置 ${enByStart.size} 个）`);
