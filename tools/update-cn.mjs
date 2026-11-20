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
