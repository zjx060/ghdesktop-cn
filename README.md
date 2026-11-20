# GitHub Desktop 中文工具链

把 GitHub Desktop 的英文界面换成中文，并且**跟着版本升级自动适配**。

官方从未提供多语言支持（[desktop/desktop](https://github.com/desktop/desktop) 明确不做 i18n），
本项目通过替换本机 `resources/app` 下的 `main.js` / `renderer.js` 实现汉化，
并在此基础上解决了社区补丁的两个老问题：**升级即失效**、**术语被硬翻**。

> 界面覆盖率以「界面位置」为分母统计：**232 处文字位置，209 处已中文化（90.1%）**，
> 其余为逻辑值或有意保留的专有名词。逐条明细见 [REGRESSION.md](REGRESSION.md)。

## 它解决什么

| 问题 | 做法 |
| --- | --- |
| 升级后中文没了 | 三级取补丁：本地缓存 → 上游跟随 → 词典兜底，双击一次重新汉化 |
| 术语被翻坏 | 四类术语规则（整串覆盖 / 中文侧修正 / 上下文定位 / 片段还原），`Pull Request`、`Stash`、`detached HEAD` 等保持英文 |
| 机翻写坏程序逻辑 | 用 AST 判断字符串角色，`enum`、键名映射、`t.key` 比较一律不翻 |
| 不知道翻了多少 | 位置级审计：以同版本官方原版为基线，逐处核对，能回答「哪个按钮还没翻」 |

## 快速开始

1. 完全退出 GitHub Desktop（托盘图标 → Quit）
2. 双击 `apply-cn.bat`
3. 重新打开客户端

想还原英文：`restore-en.bat`。想做一次体检：`check-cn.bat`。

也可以直接用命令行：

```bash
node tools/update-cn.mjs     # 打补丁
node tools/audit.mjs         # 覆盖率审计
node tools/restore-en.mjs    # 还原英文
```

依赖只有 Node.js 18+。解析器 `acorn` 已随仓库提供，**无需 `npm install`**。

## 目录结构

```
apply-cn.bat / restore-en.bat    双击入口
check-cn.bat                     覆盖率体检入口
terms.json                       术语规则（改译法只改这里）
zh-map.json                      1,204 条中英词典，由两份文件按代码位置对齐生成
tools/
  update-cn.mjs                  主流程：识别版本 → 取补丁 → 产出 → 安装
  apply-terms.mjs                术语保留层（单遍规则）
  apply-map.mjs                  词典应用（只翻界面位置）
  extract.mjs                    AST 角色标注 + 按代码位置配对
  audit.mjs                      位置级审计
  restore-en.mjs                 还原
  fileops.mjs                    原子替换（失败全部回退）
dist/                            可分发包与成果页
```

运行后会在 `%LOCALAPPDATA%\GitHubDesktopCN\backup\` 保存**官方原版备份**，
按版本隔离，升级后各版本互不覆盖。所有修改都可回滚。

## 原理简述

补丁的本质是「把 `renderer.js` 里几千个字符串换成中文」。难点不在替换，而在**判断哪个字符串能换**：

- 用 acorn 解析出语法树，给每个字符串标注角色（界面子节点 / 某个 prop / 枚举值 / 普通表达式）
- 只有界面角色才允许替换，`e[e.Delete=2]="Delete"` 这类反向映射永远不动
- 两份文件的字符串**按代码位置配对**（以字面量之间的代码片段为锚点），而不是按出现顺序猜
- 配对不上的整段放弃，宁可漏译也不写错

## 已知限制

- 汉化质量取决于社区补丁（[lgw88/CN-GitHub-Desktop](https://github.com/lgw88/CN-GitHub-Desktop)），本项目做修正而非重写全部译文
- 上游滞后新版本 1–3 天，其间走词典兜底，只覆盖界面位置，译文质量略低
- git 命令自身的输出不翻译——那是数据不是界面
- 仅支持 Windows（入口是批处理；脚本本身跨平台，但未做适配）

## 许可

MIT，见 [LICENSE](LICENSE)。第三方组件与数据来源已在 LICENSE 中列明。
本项目与 GitHub, Inc. 无隶属关系。
