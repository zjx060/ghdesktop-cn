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
