// build-source.mjs — 把工具链源码汇总成一份可读文档 SOURCE.md
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const FILES = [
  ['tools/update-cn.mjs', 'js', '主流程：识别版本 → 三级取补丁 → 转交安装'],
  ['tools/apply-terms.mjs', 'js', '术语保留层：单遍规则，whole → byZh → byContext → 片段 → 菜单 → 留白'],
  ['tools/apply-map.mjs', 'js', '词典应用：只翻界面位置，逻辑位置与枚举值不动'],
  ['tools/extract.mjs', 'js', '共享核心：AST 角色标注 + 按代码位置配对 + 词典生成'],
  ['tools/audit.mjs', 'js', '位置级体检：以官方原版为基准逐处核对'],
  ['tools/restore-en.mjs', 'js', '还原英文：数字版本排序 + 共享备份 + 逐字节校验'],
  ['tools/fileops.mjs', 'js', '原子替换：任一失败则全部回退（安装与还原共用）'],
  ['tools/term-scan.mjs', 'js', '排查：扫描术语被硬翻成中文的情况'],
  ['tools/term-pick.mjs', 'js', '排查：按英文原文查译文'],
  ['tools/zh-lookup.mjs', 'js', '排查：按中文反查英文原文'],
  ['apply-cn.bat', 'bat', '入口：双击打补丁'],
  ['restore-en.bat', 'bat', '入口：双击还原英文'],
  ['dist/GitHubDesktop-CN-Toolkit/check-cn.bat', 'bat', '入口：双击做体检'],
  ['terms.json', 'json', '术语规则表（四类手段）'],
];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\s+$/, '');
const lines = (s) => s.split('\n').length;

let total = 0;
const toc = [];
for (const [f, , desc] of FILES) {
  const n = lines(read(f));
  total += n;
  toc.push(`| \`${f}\` | ${n} | ${desc} |`);
}

const out = [];
out.push('# GitHub Desktop 中文工具链 · 源码');
out.push('');
out.push('> 由 `build-source.mjs` 自动汇总，逐字节取自工作目录，非手工整理。');
out.push(`> 生成时间 ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · 共 ${FILES.length} 个文件 / ${total} 行`);
out.push('');
out.push('## 文件清单');
out.push('');
out.push('| 文件 | 行数 | 职责 |');
out.push('| --- | ---: | --- |');
out.push(...toc);
out.push('');
out.push('另有两个数据文件未展开：`zh-map.json`（1,234 条中英词典，1226 行）与 ');
out.push('`dist/site/index.html`（成果页，295 行）。');
out.push('');
out.push('---');
out.push('');

for (const [f, lang, desc] of FILES) {
  const body = read(f);
  out.push(`## ${f}`);
  out.push('');
  out.push(`_${desc} · ${lines(body)} 行_`);
  out.push('');
  out.push('```' + lang);
  out.push(body);
  out.push('```');
  out.push('');
}

fs.writeFileSync(path.join(ROOT, 'SOURCE.md'), out.join('\n'), 'utf8');
console.log(`SOURCE.md 已生成：${FILES.length} 个文件，正文 ${total} 行`);
