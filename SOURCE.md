# GitHub Desktop 中文工具链 · 源码

> 由 `build-source.mjs` 自动汇总，逐字节取自工作目录，非手工整理。
> 生成时间 2026-11-19 13:20:08 · 共 14 个文件 / 1127 行

## 文件清单

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `tools/update-cn.mjs` | 199 | 主流程：识别版本 → 三级取补丁 → 转交安装 |
| `tools/apply-terms.mjs` | 125 | 术语保留层：单遍规则，whole → byZh → byContext → 片段 → 菜单 → 留白 |
| `tools/apply-map.mjs` | 72 | 词典应用：只翻界面位置，逻辑位置与枚举值不动 |
| `tools/extract.mjs` | 239 | 共享核心：AST 角色标注 + 按代码位置配对 + 词典生成 |
| `tools/audit.mjs` | 147 | 位置级体检：以官方原版为基准逐处核对 |
| `tools/restore-en.mjs` | 48 | 还原英文：数字版本排序 + 共享备份 + 逐字节校验 |
| `tools/fileops.mjs` | 33 | 原子替换：任一失败则全部回退（安装与还原共用） |
| `tools/term-scan.mjs` | 48 | 排查：扫描术语被硬翻成中文的情况 |
| `tools/term-pick.mjs` | 26 | 排查：按英文原文查译文 |
| `tools/zh-lookup.mjs` | 15 | 排查：按中文反查英文原文 |
| `apply-cn.bat` | 58 | 入口：双击打补丁 |
| `restore-en.bat` | 36 | 入口：双击还原英文 |
| `dist/GitHubDesktop-CN-Toolkit/check-cn.bat` | 25 | 入口：双击做体检 |
| `terms.json` | 56 | 术语规则表（四类手段） |

另有两个数据文件未展开：`zh-map.json`（1,234 条中英词典，1226 行）与 
`dist/site/index.html`（成果页，295 行）。

---

## tools/update-cn.mjs

_主流程：识别版本 → 三级取补丁 → 转交安装 · 199 行_

```js
// update-cn.mjs — GitHub Desktop 中文化"跟着版本走"
// 策略：① 本地已有对应版本补丁 → 直接用
//       ② 没有 → 从上游 lgw88/CN-GitHub-Desktop 拉该版本补丁并缓存
//       ③ 上游还没跟上 → 用 zh-map.json 词典给新版本做机器兜底翻译
//
// 安装流程（审查意见 P1-3）：先把两份文件在临时目录里产出并过完术语层、语法检查，
// 两份都通过后才写安装目录。中途失败时安装目录保持原样，不会留下半套文件。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { replaceFiles } from './fileops.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPDIR = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktop');
// 官方原版备份放在安装目录之外，任何副本/重新下载的工具包都能复用同一份
const BACKUP_ROOT = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktopCN', 'backup');
const UPSTREAM = process.env.CN_UPSTREAM || 'https://github.com/lgw88/CN-GitHub-Desktop.git';
const FILES = ['main.js', 'renderer.js'];
const TOOLS = path.join(ROOT, 'tools');

const log = (...a) => console.log(...a);
// 子脚本一律用当前 node 的绝对路径，避免 PATH 里 node 不可用时中途失败
const sh = (args, opts = {}) =>
  execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

const cjkCount = (s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length;
const vkey = (v) => v.split('.').map(Number);

// 数字排序，避免 3.6.9 排在 3.6.11 前面
export function newestInstall() {
  if (!fs.existsSync(APPDIR)) throw new Error(`未找到安装目录: ${APPDIR}`);
  const vers = fs.readdirSync(APPDIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^app-\d+\.\d+\.\d+/.test(d.name))
    .map((d) => d.name.replace(/^app-/, ''));
  if (!vers.length) throw new Error('安装目录下没有 app-x.y.z 子目录');
  vers.sort((a, b) => {
    const A = vkey(a), B = vkey(b);
    for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return B[i] - A[i];
    return 0;
  });
  return vers[0];
}

// 官方原版：优先共享备份，其次工具目录内的旧备份；都没有则当场备份（若安装目录已是中文则不做）
function resolveBackup(ver, appRes) {
  const shared = path.join(BACKUP_ROOT, `backup-${ver}`);
  const local = path.join(ROOT, `backup-${ver}`);
  for (const dir of [shared, local]) {
    if (fs.existsSync(path.join(dir, 'main.js'))) { log(`[备份] 复用已有原版备份（${dir}）`); return dir; }
  }
  const probe = fs.readFileSync(path.join(appRes, 'renderer.js'), 'utf8');
  if (cjkCount(probe) > 800) {
    log(`[警告] 当前文件已是中文版（${cjkCount(probe)} 个汉字），且本机没有该版本的原版备份`);
    log('       将以"无备份模式"继续：界面仍是中文，但术语层的整串规则会降级');
    return null;
  }
  fs.mkdirSync(shared, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(appRes, f), path.join(shared, f));
  log(`[备份] 官方原版已存到 ${shared}`);
  return shared;
}

function tryLocalPatch(ver) {
  const dir = path.join(ROOT, `patch-${ver}`);
  if (FILES.every((f) => fs.existsSync(path.join(dir, f)))) return dir;
  return null;
}

function tryUpstream(ver) {
  const cache = path.join(ROOT, '.upstream');
  try {
    if (!fs.existsSync(path.join(cache, '.git'))) {
      log('[上游] 首次克隆汉化仓库（只取文件列表，不拉全量）…');
      execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', UPSTREAM, cache],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
      log('[上游] 拉取最新提交…');
      execFileSync('git', ['-C', cache, 'fetch', '--depth', '1', 'origin', 'main'], { stdio: ['ignore', 'pipe', 'pipe'] });
      execFileSync('git', ['-C', cache, 'reset', '--soft', 'FETCH_HEAD'], { stdio: ['ignore', 'pipe', 'pipe'] });
    }
    const listing = execFileSync('git', ['-C', cache, 'ls-tree', '-r', 'HEAD'], { encoding: 'utf8' });
    const re = new RegExp(`^cn/(?:APP|app)-${ver.replace(/\./g, '\\.')}/resources/app/(main|renderer)\\.js$`, 'i');
    const wanted = [];
    for (const line of listing.split('\n')) {
      const m = /^(\d+) blob ([0-9a-f]+)\t(.+)$/.exec(line);
      if (m && re.test(m[3])) wanted.push({ sha: m[2], p: m[3] });
    }
    if (wanted.length < 2) { log(`[上游] 暂无 ${ver} 的补丁`); return null; }
    const dir = path.join(ROOT, `patch-${ver}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const w of wanted) {
      // 偏克隆里 blob 按需拉取：cat-file 会触发 promisor fetch，checkout 不会
      const buf = execFileSync('git', ['-C', cache, 'cat-file', '-p', w.sha], { maxBuffer: 64 * 1024 * 1024 });
      fs.writeFileSync(path.join(dir, path.basename(w.p)), buf);
    }
    log(`[上游] 已取得 ${ver} 补丁并缓存到 patch-${ver}`);
    return dir;
  } catch (e) {
    log('[上游] 获取失败：' + (e.stderr || e.message).toString().split('\n')[0]);
    return null;
  }
}

function dictFallback(ver, backupDir) {
  // 没有原版文件就没有对齐基准，词典兜底无从下手——直接退化为"不做任何事"
  if (!backupDir) { log('[兜底] 缺少原版文件，跳过词典兜底（保持现状）'); return null; }
  const mapPath = path.join(ROOT, 'zh-map.json');
  if (!fs.existsSync(mapPath)) { log('[兜底] 没有词典 zh-map.json'); return null; }
  const dir = path.join(ROOT, `patch-${ver}-auto`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of FILES) {
    sh([path.join(TOOLS, 'apply-map.mjs'), path.join(backupDir, f), path.join(dir, f), mapPath]);
  }
  log(`[兜底] 已用词典生成 patch-${ver}-auto（仅翻译界面位置）`);
  return dir;
}

// 阶段一：在临时目录产出两份成品（补丁 → 术语层 → 语法检查）
function stageOutputs(ver, srcDir, backupDir) {
  const buildDir = path.join(ROOT, '.build', `${ver}-${Date.now()}`);
  fs.mkdirSync(buildDir, { recursive: true });
  const terms = path.join(ROOT, 'terms.json');
  for (const f of FILES) {
    const stage = path.join(buildDir, f);
    fs.copyFileSync(path.join(srcDir, f), stage);
    if (fs.existsSync(terms)) {
      const official = backupDir ? path.join(backupDir, f) : '-';
      const out = sh([path.join(TOOLS, 'apply-terms.mjs'), official, stage, stage, terms]);
      log(`[术语] ${f}: ${out.split('\n').pop()}`);
    }
    sh(['--check', stage]);   // 两份都必须过语法检查，否则整批作废
  }
  return buildDir;
}

// 阶段二：两份都就绪后才落盘；任一写入失败则全部回退（与还原共用同一套替换逻辑）
function installFiles(appRes, buildDir) {
  return replaceFiles(appRes, FILES, buildDir);
}

// 词典重建：以当前版本的"原版 vs 补丁"重新生成，整份覆盖。
// 之前是追加式合并——换了提取算法后，旧的误译会永久留在词典里。重建可彻底清掉。
function refreshDict(ver, backupDir, srcDir) {
  try {
    if (!backupDir) return;
    const acc = {};
    const parts = [];
    for (const f of FILES) {
      const out = path.join(ROOT, 'tools', `map-${f.replace('.js', '')}-${ver}.json`);
      sh([path.join(TOOLS, 'extract.mjs'), path.join(backupDir, f), path.join(srcDir, f), out]);
      const m = JSON.parse(fs.readFileSync(out, 'utf8'));
      for (const [k, v] of Object.entries(m)) if (!(k in acc)) acc[k] = v;
      parts.push(`${f.replace('.js', '')} ${Object.keys(m).length}`);
      fs.rmSync(out, { force: true });
    }
    fs.writeFileSync(path.join(ROOT, 'zh-map.json'), JSON.stringify(acc, null, 2), 'utf8');
    log(`[词典] 已按 ${ver} 重建：${Object.keys(acc).length} 条（${parts.join(' / ')}）`);
  } catch (e) { log('[词典] 重建跳过：' + e.message.split('\n')[0]); }
}

// ---- 主流程 ----
function main() {
  const ver = newestInstall();
  const appRes = path.join(APPDIR, `app-${ver}`, 'resources', 'app');
  if (!fs.existsSync(path.join(appRes, 'main.js'))) {
    throw new Error(`未找到 ${appRes}\\main.js（若为 app.asar 打包，需先解包）`);
  }
  log(`当前安装版本：${ver}`);

  const backupDir = resolveBackup(ver, appRes);
  let srcDir = tryLocalPatch(ver);
  if (!srcDir) {
    log('[匹配] 本地无此版本补丁，尝试上游…');
    srcDir = tryUpstream(ver);
    if (srcDir) refreshDict(ver, backupDir, srcDir);
  }
  if (!srcDir) {
    log('[匹配] 上游未提供，改用词典兜底…');
    srcDir = dictFallback(ver, backupDir);
  }
  if (!srcDir) throw new Error('三条路径都失败，请手动检查网络或词典文件');

  const buildDir = stageOutputs(ver, srcDir, backupDir);
  installFiles(appRes, buildDir);
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.writeFileSync(path.join(ROOT, 'last-run.log'),
    `[${new Date().toISOString()}] ver=${ver} src=${path.basename(srcDir)}\n`, 'utf8');
  log(`[完成] ${ver} 已中文化（来源：${path.basename(srcDir)}）`);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try { main(); } catch (e) {
    log('[错误] ' + (e.message || e).toString().split('\n')[0]);
    process.exitCode = 1;
  }
}
```

## tools/apply-terms.mjs

_术语保留层：单遍规则，whole → byZh → byContext → 片段 → 菜单 → 留白 · 125 行_

```js
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
```

## tools/apply-map.mjs

_词典应用：只翻界面位置，逻辑位置与枚举值不动 · 72 行_

```js
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
```

## tools/extract.mjs

_共享核心：AST 角色标注 + 按代码位置配对 + 词典生成 · 239 行_

```js
// extract.mjs — 共享核心：带 AST 上下文的字符串采集 + 按代码位置配对
//
// 关键点（针对审查意见 P1-1 / P1-2 重写）：
//   1) 每个字符串都带上它在 AST 中的角色（child / prop:xxx / enum / expr），
//      后续"能不能翻"由角色决定，而不是只看英文原文是否同名。
//   2) 两份文件的配对以**字面量之间的代码片段**为锚点——代码片段逐字节相同
//      才认为落在同一处代码位置，避免"按值猜顺序"把译文张冠李戴。
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as acorn from 'acorn';

// 这些 props 承载的是给用户看的文案
const UI_PROP = new Set([
  'label', 'okButtonText', 'cancelButtonText', 'buttonText', 'confirmButtonText',
  'placeholder', 'title', 'ariaLabel', 'alt', 'text', 'message', 'description',
  'caption', 'header', 'subtitle', 'content', 'tooltip', 'screenReaderLabel',
  'actionLabel', 'emptyStateText',
]);

const PARSE_OPTS = {
  ecmaVersion: 'latest',
  sourceType: 'script',
  allowHashBang: true,
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
};

// 从最近的祖先开始判定角色；只沿"实际产生展示值"的分支向上看：
//   三元 → 仅 consequent/alternate（test 是判断条件，不产生展示值）
//   序列 → 仅最后一个表达式
//   逻辑 / 括号 / 字符串拼接 / 模板 → 两侧都可能成为结果，继续上溯
function classify(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const { parent, key, idx } = stack[i];
    const t = parent.type;

    if (t === 'ConditionalExpression') {
      if (key === 'consequent' || key === 'alternate') continue;
      return { role: 'expr', ui: false, prop: null };   // test 分支：条件判断，非界面文案
    }
    if (t === 'SequenceExpression') {
      if (typeof idx === 'number' && idx === parent.expressions.length - 1) continue;
      return { role: 'expr', ui: false, prop: null };
    }
    if (t === 'LogicalExpression' || t === 'ParenthesizedExpression' ||
        t === 'AwaitExpression' || t === 'TemplateLiteral' ||
        (t === 'BinaryExpression' && parent.operator === '+')) continue;

    if (t === 'AssignmentExpression' && key === 'right' &&
        parent.left && parent.left.type === 'MemberExpression' && parent.left.computed) {
      return { role: 'enum', ui: false, prop: null };
    }

    if (t === 'Property' && key === 'value') {
      const k = parent.key;
      const name = k && k.type === 'Identifier' ? k.name
        : (k && typeof k.value === 'string' ? k.value : null);
      if (name == null) return { role: 'prop:?', ui: false, prop: null };
      // 除了显式清单，按命名后缀泛化识别（xxxLabel / xxxText / xxxMessage…）
      const ui = UI_PROP.has(name) ||
        /(Label|Text|Message|Title|Description|Caption|Hint|Placeholder|Tooltip)$/.test(name) ||
        /^aria-/.test(name);
      return { role: 'prop:' + name, ui, prop: name };
    }

    if (t === 'CallExpression' && key === 'arguments' && typeof idx === 'number') {
      const c = parent.callee;
      const isCreate = c && c.type === 'MemberExpression' && c.property && c.property.name === 'createElement';
      if (isCreate && idx >= 2) return { role: 'child', ui: true, prop: null };
      return { role: 'arg', ui: false, prop: null };
    }

    return { role: 'expr', ui: false, prop: null };
  }
  return { role: 'expr', ui: false, prop: null };
}

// 带助记符的串（&File / &R.删除）天然是菜单文案：即使它是先赋值给变量、
// 稍后才塞进 label，也照界面位置处理。
function withMenuHint(value, ctx) {
  if (!ctx.ui && /^&[A-Za-z]/.test(value)) return { role: 'menu', ui: true, prop: null };
  return ctx;
}

// 采集：返回 [{kind,value,start,end,role,ui,prop}]
export function collectContext(src) {
  const ast = acorn.parse(src, PARSE_OPTS);
  const items = [];
  const stack = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const t = node.type;
    if (t === 'Literal' && typeof node.value === 'string') {
      items.push({ kind: 'str', value: node.value, start: node.start, end: node.end, ...withMenuHint(node.value, classify(stack)) });
    } else if (t === 'TemplateElement') {
      const v = node.value.cooked;
      const val = typeof v === 'string' ? v : node.value.raw;
      items.push({ kind: 'tpl', value: val, start: node.start, end: node.end, ...withMenuHint(val, classify(stack)) });
    }
    for (const k in node) {
      if (k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
      if ((t === 'Literal' || t === 'TemplateElement') && (k === 'value' || k === 'raw')) continue;
      const v = node[k];
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          const c = v[i];
          if (c && typeof c === 'object') {
            stack.push({ parent: node, key: k, idx: i });
            walk(c);
            stack.pop();
          }
        }
      } else if (v && typeof v === 'object') {
        stack.push({ parent: node, key: k, idx: undefined });
        walk(v);
        stack.pop();
      }
    }
  };
  walk(ast);
  items.sort((a, b) => a.start - b.start);
  return items;
}

// 兼容旧调用
export function collectStrings(src) {
  return collectContext(src);
}

// 字面量之间的代码片段（含首尾）
function segments(src, items) {
  const out = [];
  let prev = 0;
  for (const it of items) {
    out.push(src.slice(prev, it.start));
    prev = it.end;
  }
  out.push(src.slice(prev));
  return out;
}

// 按代码位置配对。
// 只有"足够长的代码片段"才当锚点（短片段如 , [ ] 会大量重复，凭它配对必然错位）；
// 两个锚点之间若条目数相同才逐一配对，条目数不同（补丁增删了字面量）则整段放弃，绝不猜。
const MIN_ANCHOR = 16;

export function alignByCode(srcO, srcP, lookahead = 40) {
  const A = collectContext(srcO);
  const B = collectContext(srcP);
  const sO = segments(srcO, A);
  const sP = segments(srcP, B);

  // 1) 找长锚点
  const anchors = [];
  let i = 0, j = 0;
  while (i < sO.length && j < sP.length) {
    if (sO[i] === sP[j]) {
      if (sO[i].length >= MIN_ANCHOR) anchors.push([i, j]);
      i++; j++;
      continue;
    }
    let da = -1, db = -1;
    for (let d = 1; d <= lookahead; d++) {
      if (da < 0 && i + d < sO.length && sO[i + d] === sP[j]) da = d;
      if (db < 0 && j + d < sP.length && sO[i] === sP[j + d]) db = d;
      if (da > 0 || db > 0) break;
    }
    if (da > 0 && (db < 0 || da <= db)) { i += da; continue; }
    if (db > 0) { j += db; continue; }
    i++; j++;
  }

  // 2) 锚点区间内：条目数相同才配对
  const pairs = [];
  const stats = { totalO: A.length, totalP: B.length, anchors: anchors.length, runs: 0, droppedRuns: 0, droppedItems: 0 };
  const consume = (ai, aj, bi, bj) => {
    const na = bi - ai, nb = bj - aj;
    if (na <= 0 && nb <= 0) return;
    stats.runs++;
    if (na === nb) {
      for (let k = 0; k < na; k++) pairs.push([A[ai + k], B[aj + k]]);
    } else {
      stats.droppedRuns++;
      stats.droppedItems += Math.max(na, nb);
    }
  };
  let prev = [0, 0];
  for (const [ai, aj] of anchors) {
    consume(prev[0], prev[1], ai, aj);   // 锚点之前的字面量
    prev = [ai, aj];                     // 锚点之后的那个字面量从下一段开始算
  }
  consume(prev[0], prev[1], A.length, B.length);

  return { pairs, stats };
}

// 英文串是否像一句界面文案（用于没有 UI 上下文时的兜底判断）
export function sentenceLike(v) {
  if (v.length < 4 || v.length > 200) return false;
  if (!/[A-Za-z]{2}/.test(v)) return false;
  if (!/\s/.test(v)) return false;                       // 多词
  if (/[{};=<>]|\$\{|%[sd]|::|&&|\|\||\\|\/|https?:|^\s*M[\d.\s-]/.test(v)) return false;
  if (!/[a-z]/.test(v)) return false;
  return true;
}

// 由配对结果生成词典：同一英文出现多种译法时整条丢弃（保留到各自位置，不猜）
export function buildMap(pairs) {
  const map = {};
  const conflicts = new Set();
  let dirty = 0;
  for (const [a, b] of pairs) {
    if (a.value === b.value) continue;
    const en = a.value, zh = b.value;
    if (!en.trim() || !/[A-Za-z]/.test(en) || !zh.trim()) { dirty++; continue; }
    if (en in map) {
      if (map[en] !== zh) conflicts.add(en);
      continue;
    }
    map[en] = zh;
  }
  for (const k of conflicts) delete map[k];
  return { map, conflicts: [...conflicts], dirty };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [, , origPath, patchedPath, outPath] = process.argv;
  const srcO = fs.readFileSync(origPath, 'utf8');
  const srcP = fs.readFileSync(patchedPath, 'utf8');
  const { pairs, stats } = alignByCode(srcO, srcP);
  const { map, conflicts, dirty } = buildMap(pairs);
  console.log(`原版字面量 ${stats.totalO} / 汉化 ${stats.totalP}`);
  console.log(`按代码位置配对 ${pairs.length} 对；锚点 ${stats.anchors} 个，区间 ${stats.runs} 段，` +
    `因条目数不等整段放弃 ${stats.droppedRuns} 段 / ${stats.droppedItems} 个`);
  console.log(`词典 ${Object.keys(map).length} 条，多译冲突丢弃 ${conflicts.length} 条，脏值 ${dirty} 条`);
  if (conflicts.length) console.log('  冲突示例: ' + conflicts.slice(0, 5).map((c) => JSON.stringify(c)).join(', '));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(map, null, 2), 'utf8');
}
```

## tools/audit.mjs

_位置级体检：以官方原版为基准逐处核对 · 147 行_

```js
// audit.mjs — 按"界面位置"核对汉化覆盖
//
// 审查意见 P2-5：旧的判断是"整包里找不到英文原词 = 已汉化"，文案被版本删掉或改写也会得分。
// 现在改为：以同版本官方原版为基准，用按代码位置配对，逐处核对该位置的译文。
//   ✓ 已中文化      该位置在汉化包里是中文
//   ✗ 仍英文        该位置仍是英文，且不属于有意保留
//   ≈ 有意保留      专有名词/逻辑值等刻意保留英文
//   - 无界面位置  原版里就没有这个文案
//
// 用法: node audit.mjs            （自动定位已安装的最新版本 + 共享备份）
//       node audit.mjs <app-目录> [原版目录]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { alignByCode } from './extract.mjs';

const LABELS = {
  菜单栏: ['File', 'Edit', 'View', 'Repository', 'Branch', 'Help', 'About GitHub Desktop', 'Check for updates', 'Quit', 'Options', 'Preferences', 'Undo', 'Redo', 'Select all'],
  顶部工具栏: ['Current repository', 'Current branch', 'Fetch origin', 'Pull origin', 'Push origin', 'Last fetched'],
  左侧列表: ['Changes', 'History', 'Filter', 'No local changes', 'Open in Visual Studio Code', 'Show in Explorer', 'Open in command prompt', 'Open in Git Bash'],
  提交区: ['Summary', 'Description', 'Commit message', 'Commit to', 'Commit changes', 'Amend last commit', 'Co-Authors', 'No description provided'],
  差异视图: ['Unified', 'Split', 'Discard changes', 'Discard all changes', 'Stash changes', 'Restore stash', 'Discard stash', 'Toggle whitespace'],
  分支操作: ['Create branch', 'Delete branch', 'Rename branch', 'Merge into current branch', 'Rebase current branch', 'Squash and merge', 'Compare on GitHub', 'Update from'],
  仓库操作: ['Add local repository', 'Clone repository', 'Create new repository', 'Remove repository', 'Repository settings', 'Publish repository', 'Show in GitHub', 'View on GitHub'],
  首选项页签: ['Accounts', 'Integrations', 'Appearance', 'Prompts', 'Advanced', 'Git', 'Sign in', 'Sign out', 'Email', 'Name'],
  通用按钮: ['Cancel', 'Save', 'Delete', 'Remove', 'Create', 'Close', 'Retry', 'Learn more', 'Continue', 'Back', 'Next', 'Done', 'OK'],
  提示与状态: ['Are you sure', 'No results', 'Loading', 'Unable to', 'Failed to', 'Warning', 'Notifications', 'Enable notifications'],
};

// 有意保留英文的（专有名词 / 逻辑值 / 键盘键名 / CSS 类名）
// 注意：Delete、Remove 不在此列——它们既可能是按钮文案，也可能是按键名，
// 必须由位置审计逐处判断，不能整词豁免，否则真漏译的删除按钮会被报成"有意保留"。
const INTENTIONAL = {
  Git: '专有名词', Preferences: 'Windows 用「选项」，此串为弹窗类型值',
  Unified: '单选值（标签已译）', Split: '单选值（标签已译）',
  Save: '键盘键名/快捷键映射',
  Done: 'CSS 类名拼接', Loading: '加载状态枚举',
  Warning: '告警级别枚举', 'No results': '搜索重置内部参数',
  Cancel: 'macOS 访达对话框按钮', File: '模块导出名',
  Accounts: '枚举值', Integrations: '枚举值', Appearance: '枚举值',
  Prompts: '枚举值', Advanced: '枚举值', Notifications: '枚举值',
};

function findAppRes() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const root = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktop');
  if (!fs.existsSync(root)) throw new Error(`未找到安装目录 ${root}`);
  const vers = fs.readdirSync(root)
    .filter((d) => /^app-\d+\.\d+\.\d+/.test(d))
    .map((d) => d.replace(/^app-/, ''))
    .sort((a, b) => {
      const A = a.split('.').map(Number), B = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return B[i] - A[i];
      return 0;
    });
  if (!vers.length) throw new Error('没有 app-x.y.z 目录');
  return { appRes: path.join(root, `app-${vers[0]}`, 'resources', 'app'), ver: vers[0] };
}

function findOfficial(ver) {
  if (process.argv[3]) return path.resolve(process.argv[3]);
  const shared = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktopCN', 'backup', `backup-${ver}`);
  const local = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', `backup-${ver}`);
  for (const d of [shared, local]) if (fs.existsSync(path.join(d, 'renderer.js'))) return d;
  return null;
}

// 归一化：去掉助记符 &、尾部省略号与空格
export const norm = (s) => s.replace(/&/g, '').replace(/(…|\.\.\.)\s*$/, '').replace(/\s+$/, '').trim();

// 位置级匹配：官方串可能是带 & 的菜单项（&File），也可能是被拼装的碎片（"Fetch "）
export function matchLabel(a, label) {
  if (!a.ui) return false;
  const v = norm(a.value), L = norm(label);
  if (v === L) return true;
  if (v.length >= 3 && (L === v || L.startsWith(v + ' '))) return true;   // "Fetch " → "Fetch origin"
  if (L.length >= 3 && v.startsWith(L + ' ')) return true;                // "Discard changes…" → "Discard changes"
  return false;
}

function run() {
  const found = findAppRes();
  const appRes = typeof found === 'string' ? found : found.appRes;
  const ver = typeof found === 'string' ? '' : found.ver;
  console.log(`检查目录：${appRes}`);

  const officialDir = (ver || process.argv[3]) ? findOfficial(ver) : null;
  if (!officialDir) {
    console.log('缺少同版本官方原版备份，无法做"位置级"核对。');
    console.log('（运行一次 apply-cn.bat 会自动保存；或把原版目录作为第二个参数传入）');
    return;
  }
  console.log(`原版基准：${officialDir}`);

  const pairs = [];
  const drops = { runs: 0, items: 0, anchors: 0 };
  for (const f of ['main.js', 'renderer.js']) {
    const o = fs.readFileSync(path.join(officialDir, f), 'utf8');
    const p = fs.readFileSync(path.join(appRes, f), 'utf8');
    const r = alignByCode(o, p);
    pairs.push(...r.pairs);
    drops.runs += r.stats.droppedRuns;
    drops.items += r.stats.droppedItems;
    drops.anchors += r.stats.anchors;
  }
  console.log(`按代码位置配对 ${pairs.length} 处（锚点 ${drops.anchors} 个）`);
  if (drops.runs) {
    console.log(`另有 ${drops.runs} 段区间因两份文件字面量数量不等而放弃配对（${drops.items} 个），` +
      `这些位置不计入分母`);
  }
  console.log('');

  let totalPos = 0, totalZh = 0, totalEn = 0, totalKept = 0, totalGone = 0;
  for (const [group, labels] of Object.entries(LABELS)) {
    const rows = [];
    for (const en of labels) {
      // 先精确匹配；一个都没有时才退回宽松匹配（碎片/带后缀的情况）
      let pos = pairs.filter(([a]) => a.ui && norm(a.value) === norm(en));
      if (!pos.length) pos = pairs.filter(([a]) => matchLabel(a, en));
      if (!pos.length) { totalGone++; rows.push(['- 无界面位置', en, '']); continue; }
      const zh = pos.filter(([, b]) => b.value !== en && /[\u4e00-\u9fa5]/.test(b.value)).length;
      const remain = pos.length - zh;
      totalPos += pos.length; totalZh += zh; totalEn += remain;
      const note = `中文 ${zh}/${pos.length}${remain ? `，仍英文 ${remain}` : ''}`;
      if (remain === 0) rows.push(['✓ 已中文化', en, note]);
      else if (INTENTIONAL[en]) { totalKept += remain; rows.push(['≈ 有意保留', en, note + '（' + INTENTIONAL[en] + '）']); }
      else rows.push(['✗ 仍英文', en, note]);
    }
    console.log(`【${group}】`);
    for (const [mark, en, note] of rows) console.log(`  ${mark.padEnd(12)} ${en}${note ? '  — ' + note : ''}`);
  }

  const pct = totalPos ? ((totalZh / totalPos) * 100).toFixed(1) : '0';
  console.log(`\n===== 汇总：${totalPos} 处界面位置，${totalZh} 已中文化（${pct}%），` +
    `${totalEn} 仍英文（其中 ${totalKept} 处为有意保留）=====`);
  if (totalGone) console.log(`另有 ${totalGone} 个标签没有找到界面位置（本版本不存在，或只出现在逻辑位置），不计入分母`);

  // 仍为英文的界面位置——直接回答"哪个按钮还没翻"
  const gaps = [...new Set(pairs.filter(([a, b]) => a.ui && b.value === a.value &&
    /[A-Za-z]/.test(a.value) && !/[\u4e00-\u9fa5]/.test(a.value)).map(([a]) => a.value))];
  console.log(`\n仍为英文的界面文本：${gaps.length} 条`);
  gaps.slice(0, 20).forEach((s) => console.log('  · ' + JSON.stringify(s)));
}

if (!!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { run(); } catch (e) { console.error('[错误] ' + e.message); process.exitCode = 1; }
}
```

## tools/restore-en.mjs

_还原英文：数字版本排序 + 共享备份 + 逐字节校验 · 48 行_

```js
// restore-en.mjs — 还原官方英文界面
// 与主流程复用同一套数字版本排序（3.6.11 > 3.6.9），并优先使用共享备份。
// 只有两个文件都复制成功才算还原成功，避免"报成功但只换了一个"。
import fs from 'node:fs';
import path from 'node:path';
import { replaceFiles } from './fileops.mjs';

const APPDIR = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktop');
const BACKUP_ROOT = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktopCN', 'backup');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FILES = ['main.js', 'renderer.js'];

function newestInstall() {
  if (!fs.existsSync(APPDIR)) throw new Error(`未找到安装目录: ${APPDIR}`);
  const vers = fs.readdirSync(APPDIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^app-\d+\.\d+\.\d+/.test(d.name))
    .map((d) => d.name.replace(/^app-/, ''));
  if (!vers.length) throw new Error('没有 app-x.y.z 目录');
  vers.sort((a, b) => {
    const A = a.split('.').map(Number), B = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return B[i] - A[i];
    return 0;
  });
  return vers[0];
}

try {
  const ver = newestInstall();
  const appRes = path.join(APPDIR, `app-${ver}`, 'resources', 'app');
  const shared = path.join(BACKUP_ROOT, `backup-${ver}`);
  const local = path.join(ROOT, `backup-${ver}`);
  const src = [shared, local].find((d) => fs.existsSync(path.join(d, 'main.js')));
  console.log(`Target : app-${ver}`);
  if (!src) {
    console.log(`[错误] 没有 ${ver} 的官方原版备份。查找过：`);
    console.log(`       ${shared}`);
    console.log(`       ${local}`);
    console.log('       重装 GitHub Desktop 可恢复原版文件。');
    process.exitCode = 1;
  } else {
    // 与安装共用同一套替换逻辑：任一失败则全部回退，避免只换了一个文件
    const done = replaceFiles(appRes, FILES, src);
    console.log(`[OK] 已还原官方英文（${done.join(' / ')}），来源 ${src}`);
  }
} catch (e) {
  console.log('[错误] ' + e.message);
  process.exitCode = 1;
}
```

## tools/fileops.mjs

_原子替换：任一失败则全部回退（安装与还原共用） · 33 行_

```js
// fileops.mjs — 原子替换若干文件：任一失败则把已写的全部回退到写前内容
// 安装与还原共用，避免"第一份成功、第二份失败"留下混装状态。
import fs from 'node:fs';
import path from 'node:path';

export function replaceFiles(appRes, files, sourceDir) {
  const before = new Map();
  for (const f of files) before.set(f, fs.readFileSync(path.join(appRes, f)));

  const written = [];
  try {
    for (const f of files) {
      fs.copyFileSync(path.join(sourceDir, f), path.join(appRes, f));
      written.push(f);
    }
  } catch (e) {
    for (const f of written) {
      try { fs.writeFileSync(path.join(appRes, f), before.get(f)); } catch { /* 回退尽力而为 */ }
    }
    throw new Error(`写入失败，已回退 ${written.length} 个文件：${e.message}`);
  }

  // 写入后回读比对，确认两份真的是新内容
  for (const f of files) {
    const a = fs.readFileSync(path.join(sourceDir, f));
    const b = fs.readFileSync(path.join(appRes, f));
    if (!a.equals(b)) {
      for (const g of files) fs.writeFileSync(path.join(appRes, g), before.get(g));
      throw new Error(`${f} 写入校验不一致，已全部回退`);
    }
  }
  return written;
}
```

## tools/term-scan.mjs

_排查：扫描术语被硬翻成中文的情况 · 48 行_

```js
// term-scan.mjs — 扫描词典/汉化文件里"专业术语被硬翻成中文"的情况
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'zh-map.json'), 'utf8'));

// 应当保留英文的术语（按类别）
const KEEP_EN = {
  '产品/平台': ['GitHub', 'GitHub Desktop', 'GitHub Enterprise', 'GitHub.com', 'Copilot', 'Visual Studio Code', 'VS Code'],
  '工具/环境': ['Git Bash', 'P S shell', 'Power Shell', 'WSL', 'Windows', 'macOS', 'Linux', 'Homebrew', 'Scoop'],
  '协议/凭据': ['SSH', 'GPG', 'HTTPS', 'OAuth', 'Personal Access Token', 'LFS'],
  'Git 概念': ['Pull Request', 'pull request', 'Fork', 'Issue', 'Release', 'Submodule', 'Worktree', 'Cherry-pick', 'Rebase', 'Commit', 'Branch', 'Repository', 'Stash', 'Merge', 'Remote', 'origin', 'upstream', 'HEAD', 'Tag'],
};

// 允许意译的 Git 动作（这些中文已约定俗成，不算过度翻译）
const OK_ZH_ACTIONS = ['提交', '分支', '代码仓', '暂存', '合并', '变基', '拉取请求', '远程', '标签', '复刻', '发行版', '克隆', '推送', '拉取', '获取'];

const rows = [];
for (const [cat, terms] of Object.entries(KEEP_EN)) {
  for (const t of terms) {
    for (const [en, zh] of Object.entries(map)) {
      if (!en.includes(t)) continue;
      if (!/[\u4e00-\u9fa5]/.test(zh)) continue;          // 译文里没有中文，说明术语本身被保留了
      // 判断术语本体是否被翻译：译文里是否出现该术语的英文
      const termKept = zh.includes(t);
      rows.push({ cat, term: t, en, zh, termKept });
    }
  }
}

const byCat = {};
for (const r of rows) (byCat[r.cat] ||= []).push(r);

for (const [cat, arr] of Object.entries(byCat)) {
  const uniq = new Map();
  for (const r of arr) uniq.set(r.en + '\u0000' + r.zh, r);
  const list = [...uniq.values()];
  const lost = list.filter(r => !r.termKept);
  console.log(`\n===== ${cat}：命中 ${list.length} 条，其中术语本体被译掉 ${lost.length} 条 =====`);
  const byTerm = {};
  for (const r of lost) (byTerm[r.term] ||= []).push(r);
  for (const [t, items] of Object.entries(byTerm)) {
    console.log(`  · ${t}（${items.length} 处）`);
    items.slice(0, 3).forEach(r => console.log(`      ${JSON.stringify(r.en).slice(0, 58)}\n        → ${JSON.stringify(r.zh).slice(0, 58)}`));
  }
}
```

## tools/term-pick.mjs

_排查：按英文原文查译文 · 26 行_

```js
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
```

## tools/zh-lookup.mjs

_排查：按中文反查英文原文 · 15 行_

```js
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
```

## apply-cn.bat

_入口：双击打补丁 · 58 行_

```bat
@echo off
setlocal enabledelayedexpansion
chcp 437 >nul
title GitHub Desktop Chinese Patcher

rem ------------------------------------------------------------------
rem  Auto-adapting Chinese patch for GitHub Desktop.
rem  1) exact patch for the installed version (local cache)
rem  2) else fetch the matching patch from upstream Git repo
rem  3) else machine-translate with the local dictionary
rem ------------------------------------------------------------------

set "APPDIR=%LOCALAPPDATA%\GitHubDesktop"
set "HERE=%~dp0"

if not exist "%APPDIR%" (
  echo [ERROR] GitHub Desktop not found: %APPDIR%
  goto :end
)

rem ---- locate node.exe (WorkBuddy ships its own, may not be on PATH) ----
set "NODE="
for %%p in (node.exe) do if not defined NODE if exist "%%~$PATH:p" set "NODE=%%~$PATH:p"
if not defined NODE (
  for /f "delims=" %%f in ('dir /b /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions\*\node.exe" 2^>nul') do (
    if not defined NODE set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\%%f"
  )
)
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE (
  echo [ERROR] node.exe not found. Install Node.js or run it from WorkBuddy.
  goto :end
)

rem ---- refuse to patch while the app is running ----
tasklist /fi "imagename eq GitHubDesktop.exe" 2>nul | "%SystemRoot%\System32\find.exe" /i "GitHubDesktop.exe" >nul
if not errorlevel 1 (
  echo [ERROR] GitHub Desktop is running.
  echo         Quit it first: tray icon - right click - Quit
  goto :end
)

echo Node   : !NODE!
echo Patch  : %HERE%
echo.
"!NODE!" "%HERE%tools\update-cn.mjs"
set "RC=!errorlevel!"
echo.
if "!RC!"=="0" (
  echo [DONE] Start GitHub Desktop to see the Chinese UI.
  echo        If it fails to start, run restore-en.bat
) else (
  echo [FAILED] see the messages above.
)

:end
echo.
pause
```

## restore-en.bat

_入口：双击还原英文 · 36 行_

```bat
@echo off
setlocal enabledelayedexpansion
chcp 437 >nul
title Restore English UI

set "HERE=%~dp0"

rem ---- locate node.exe ----
set "NODE="
for %%p in (node.exe) do if not defined NODE if exist "%%~$PATH:p" set "NODE=%%~$PATH:p"
if not defined NODE (
  for /f "delims=" %%f in ('dir /b /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions\*\node.exe" 2^>nul') do (
    if not defined NODE set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\%%f"
  )
)
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE (
  echo [ERROR] node.exe not found.
  goto :end
)

rem ---- refuse while the app is running ----
tasklist /fi "imagename eq GitHubDesktop.exe" 2>nul | "%SystemRoot%\System32\find.exe" /i "GitHubDesktop.exe" >nul
if not errorlevel 1 (
  echo [ERROR] GitHub Desktop is running. Quit it first: tray icon -^> Quit
  goto :end
)

"!NODE!" "%HERE%tools\restore-en.mjs"
set "RC=!errorlevel!"
echo.
if "!RC!"=="0" (echo [DONE] Restart GitHub Desktop to see the English UI.) else (echo [FAILED] see the messages above.)

:end
echo.
pause
```

## dist/GitHubDesktop-CN-Toolkit/check-cn.bat

_入口：双击做体检 · 25 行_

```bat
@echo off
setlocal enabledelayedexpansion
chcp 437 >nul
title Check translation coverage

set "HERE=%~dp0"

set "NODE="
for %%p in (node.exe) do if not defined NODE if exist "%%~$PATH:p" set "NODE=%%~$PATH:p"
if not defined NODE (
  for /f "delims=" %%f in ('dir /b /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions\*\node.exe" 2^>nul') do (
    if not defined NODE set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\%%f"
  )
)
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE (
  echo [ERROR] node.exe not found.
  goto :end
)

"!NODE!" "%HERE%tools\audit.mjs"

:end
echo.
pause
```

## terms.json

_术语规则表（四类手段） · 56 行_

```json
{
  "_说明": "专业术语保留层。fragments=中文片段→英文术语；whole=按英文原文整串覆盖；byZh=按当前中文整串修正；menuStyle=把 &F.文件 改成 文件(&F) 的中文菜单惯例。每次打补丁后由 apply-terms.mjs 应用。",
  "menuStyle": true,
  "fragments": {
    "GitHub桌面": "GitHub Desktop",
    "企业GitHub": "GitHub Enterprise",
    "智能助手": "Copilot",
    "拉取请求": "Pull Request",
    "个人访问令牌": "Personal Access Token",
    "分叉": "Fork"
  },
  "whole": {
    "Cherry-pick commit…": "Cherry-pick 提交…",
    "Cherry-pick ": "Cherry-pick ",
    "Rebase in progress": "Rebase 进行中",
    "Stash all changes…": "Stash 所有更改…",
    "Stash all changes": "Stash 所有更改",
    "Detached HEAD": "Detached HEAD",
    "Cannot publish detached HEAD": "无法发布 detached HEAD",
    "The current repository is in a detached HEAD state.": "当前代码仓处于 detached HEAD 状态。",
    "Checking out a commit will create a detached HEAD, and you will no longer be on any branch. Are you sure you want to checkout this commit?": "签出该提交会进入 detached HEAD 状态，之后将不在任何分支上。确定要签出吗？",
    "upstream": "upstream",
    "Upstream already exists": "upstream 已存在",
    "Upstream Already Exists": "upstream 已存在",
    "A tag with that name already exists": "该名称的 Tag 已存在",
    "Checkout in new worktree…": "在新 worktree 中检出…",
    "Fork this repository": "Fork 此代码仓",
    "fork behavior settings": "Fork 行为设置",
    "Issues will be created in ": "Issue 将创建到 ",
    "When a stash exists, access it at the bottom of the Changes tab to the left.": "存在 Stash 时，可在左侧「更改」标签页底部访问。"
  },
  "byZh": {
    "隐藏更改": "Stash 更改",
    "查看隐藏": "查看 Stash",
    "恢复隐藏": "恢复 Stash",
    "放弃隐藏": "放弃 Stash",
    "丢弃隐藏项?": "放弃 Stash?",
    "您确定要放弃这些隐藏的更改吗?": "确定要放弃这些 Stash 更改吗？",
    " 你隐藏的文件到修改列表中.": " 会将您的 Stash 文件移到「更改」列表中。",
    "查看您隐藏的更改": "查看您的 Stash 更改",
    "您现在可以将更改隐藏起来，然后再进行恢复。": "您现在可以 Stash 更改，之后再恢复。",
    "创建标签…": "创建 Tag…",
    "创建标记": "创建 Tag",
    "创建新标记": "创建新 Tag"
  },
  "byContext": [
    { "before": "?", "from": "Summary", "to": "摘要" },
    { "before": "??", "from": "Name", "to": "姓名" },
    { "before": "label:", "from": "Email", "to": "电子邮件" },
    { "before": "||", "from": "Save", "to": "保存" },
    { "beforeRegex": "createElement\\(\"span\",null,$", "from": "Summary", "to": "摘要" },
    { "before": "this.onShowPreferences},", "from": "Preferences", "to": "选项" },
    { "beforeRegex": "okButtonText:[A-Za-z_$][\\w$]*\\?$", "from": "Remove", "to": "移除" },
    { "beforeRegex": "okButtonText:[A-Za-z_$][\\w$]*\\?\"[^\"]*\":$", "from": "Delete", "to": "删除" }
  ]
}
```
