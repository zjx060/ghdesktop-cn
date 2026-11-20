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
