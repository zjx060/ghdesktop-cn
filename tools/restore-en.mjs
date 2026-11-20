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
