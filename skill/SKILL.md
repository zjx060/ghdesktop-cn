---
name: ghdesktop-cn
description: 把 GitHub Desktop 的英文界面汉化成中文，并能跟着版本升级自动适配；同时做位置级汉化覆盖率审计与一键还原。触发词：汉化 GitHub Desktop、GitHub Desktop 中文、桌面版汉化、更新中文化、重新打补丁、汉化覆盖率、还原英文界面、ghdesktop-cn。
---

# GitHub Desktop 中文化

把本机 GitHub Desktop 的界面换成中文。**官方从未提供多语言支持**，本项目通过替换
`resources/app` 下的 `main.js` / `renderer.js` 实现，并在其上做了跨版本适配与术语保留。

## 何时使用

- 用户说「汉化 / 中文化 GitHub Desktop」「桌面版还是英文」
- 用户升级了客户端，中文没了，要求「重新打补丁」
- 用户问「现在汉化到什么程度」「还有哪些没翻」
- 用户要求「还原英文界面」

## 铁律

1. **必须先确认客户端处于退出状态**。客户端运行时覆盖文件可能失败或导致下次启动异常。
   用 `tasklist /fi "imagename eq GitHubDesktop.exe"` 检查；若在运行，请用户从托盘退出，不要自己杀进程。
2. **不碰账号与仓库数据**。本操作只改 `resources/app` 下两个 JS 文件，任何涉及
   `%APPDATA%`、token、仓库目录的操作都超出范围。
3. **不翻译逻辑位置**。`enum` 反向映射、键名映射、`t.key` 比较、单选值等必须留英文，
   否则会改坏程序行为。这部分由 `apply-map.mjs` 的 AST 位置判断保证，**不要绕过它手动改文件**。
4. **失败即回退**。安装与还原共用 `fileops.mjs#replaceFiles()`，任一文件写入失败会全部回退；
   若最终文件损坏，引导用户运行还原。

## 执行步骤

脚本目录即本技能目录，下文以 `$SKILL` 指代。

1. 检查运行状态（见铁律 1）。未退出则停下，让用户退出后重试。
2. 直接调用主流程，**不要先手动读 JS 文件**：

   ```
   node "$SKILL/tools/update-cn.mjs"
   ```

3. 解读输出并汇报给用户，关键信息只有三类：
   - 识别到的版本（`当前安装版本：x.y.z`）
   - 补丁来源（`patch-<版本>` / `patch-<版本>-auto`）——后者代表走的是词典兜底，译文质量略低
   - 术语层统计与「完成」行

4. 若报「三条路径都失败」，按顺序排查：
   - 网络能否访问 GitHub（上游跟随需要 `git clone`）
   - `zh-map.json` 是否缺失
   - 最后手段：让用户重装客户端以恢复官方原版，再重跑

## 覆盖率审计

```
node "$SKILL/tools/audit.mjs"
```

也可指定目录：`node tools/audit.mjs <app-目录> <官方原版目录>`。
报告以**界面位置**为分母（不是"整包找不到英文"），会明确列出仍为英文的按钮/菜单文案，
以及因两份文件字面量数量不等而放弃配对的位置。汇报时引用「中文 x/n」，不要只说百分比。

## 还原英文

```
node "$SKILL/tools/restore-en.mjs"
```

从 `%LOCALAPPDATA%\GitHubDesktopCN\backup\backup-<版本>` 取官方原版还原；
备份按版本隔离，升级后各版本互不覆盖。没有备份时会明确报错，不会写坏文件。

## 术语保留

`terms.json` 定义四类规则，按优先级生效：

| 键 | 作用 |
| --- | --- |
| `whole` | 按英文原文整串覆盖（修硬错，如 `Detached HEAD` 保持英文） |
| `byZh` | 按当前中文整串修正（如 `隐藏更改 → Stash 更改`） |
| `byContext` | 按前后代码特征精确定位（同位不同义的词分情况处理） |
| `fragments` | 中文片段还原英文术语 + 中英之间补空格 |

保留英文的术语：`GitHub Desktop`、`GitHub Enterprise`、`Copilot`、`Pull Request`、
`Cherry-pick`、`Rebase`、`Stash`、`detached HEAD`、`worktree`、`upstream`、`Fork`、`Tag`、`SSH`、PAT。

用户要求调整某个译法时，**改 `terms.json` 而不是改 JS**。

## 环境

- Windows 10/11，需要 `node.exe`（18+）
- 解析器 acorn 已内置在 `node_modules/`，无需 `npm install`
- 首次运行会在 `%LOCALAPPDATA%\GitHubDesktopCN\backup\` 保存官方原版备份

## 汇报风格

给版本号、给了什么补丁、改了几处、语法检查结果、覆盖数字。不要复述脚本日志全文，
也不要宣称"应该没问题"——只说实际执行结果。
