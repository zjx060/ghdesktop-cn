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
