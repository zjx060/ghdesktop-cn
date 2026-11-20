# GitHub Desktop 中文化工具链

把 GitHub Desktop 的英文界面换成中文，**并且能跟着版本升级自动适配**。

官方从未提供多语言支持（desktop/desktop 明确不做 i18n），本项目通过替换本地 `resources/app` 下的 `main.js` / `renderer.js` 实现汉化，并在其上叠加了一层**术语保留**与**跨版本自适应**能力。

---

## 快速开始

1. 完全退出 GitHub Desktop（托盘图标右键 → Quit）
2. 双击 **`apply-cn.bat`**
3. 重新打开 GitHub Desktop

就这样。脚本会打印它做了什么，出错会明确提示。

想还原英文：双击 **`restore-en.bat`**（用打补丁前的备份一键还原）。

---

## 它会做什么

`apply-cn.bat` 按优先级走三条路，全部自动判断：

| 优先级 | 策略 | 说明 |
|---|---|---|
| 1 | 本地缓存 | 已有该版本补丁（`patch-<版本>/`）直接用 |
| 2 | 上游跟随 | 自动到 GitHub 上找该版本的汉化补丁并缓存（偏克隆，只拉两个文件） |
| 3 | 词典兜底 | 上游还没更新时，用内置 1200+ 条中英词典给新版本做机器翻译 |

打完补丁后，还会再跑一遍**术语保留层**（见下），最后做 `node --check` 语法自检，坏文件不会留在安装目录。

### 版本升级后怎么办

GitHub Desktop 升级会新建 `app-X.Y.Z` 目录，中文自然失效。升级后**再双击一次 `apply-cn.bat`** 即可，脚本会自动识别新版本。旧版本的官方原版会按版本分别备份（`backup-<版本>/`），不会被互相覆盖。

---

## 术语保留层

机器翻译最大的问题是把行业术语翻坏。本项目专门做了四类处理（配置见 `terms.json`）：

| 类型 | 作用 | 例子 |
|---|---|---|
| `whole` | 按英文原文整串覆盖，修硬错 | `Detached HEAD` 保持英文；`Rebase in progress → Rebase 进行中` |
| `byZh` | 按中文整串修正 | `隐藏更改 → Stash 更改`、`创建标记 → 创建 Tag` |
| `byContext` | 按前后代码特征精确定位 | 只把 `label:"Email"` 译成「电子邮件」，作为隐藏字段值的 `"Email"` 不动 |
| `fragments` | 中文片段改回英文术语 | `拉取请求 → Pull Request`、`智能助手 → Copilot` |

另外会自动在中英文之间补空格（中文排版惯例），并把 Windows 的 `&F.文件` 助记符改成中文惯例的 `文件(&F)`。

保留英文的术语举例：`GitHub Desktop`、`GitHub Enterprise`、`Copilot`、`Pull Request`、`Cherry-pick`、`Rebase`、`Stash`、`detached HEAD`、`worktree`、`upstream`、`Fork`、`Tag`、`SSH`、`PAT`。

---

## 目录说明

```
apply-cn.bat            打补丁（日常唯一入口）
restore-en.bat          还原英文
check-cn.bat            汉化覆盖率体检
terms.json              术语保留规则（想改译文直接改这里）
zh-map.json             中英词典（词典兜底时使用）
tools/update-cn.mjs     主流程：识别版本 → 取补丁 → 应用 → 术语层
tools/apply-terms.mjs   术语保留层实现
tools/apply-map.mjs     把词典应用到任意版本
tools/extract.mjs       对齐两份 JS，提取字符串映射
tools/audit.mjs         覆盖率体检
node_modules/acorn      内置的 JS 解析器（无需联网安装）
```

运行产物（首次运行后出现）：`patch-<版本>/`、`backup-<版本>/`、`.upstream/`。

---

## 环境要求

- Windows 10 / 11
- 一个 `node.exe`：脚本会依次找 `PATH`、WorkBuddy 自带 Node、`%ProgramFiles%\nodejs`。都没有的话装个 Node.js 18+ 即可。
- 解析器 acorn 已内置，不需要 `npm install`。

---

## 已知限制

- **汉化质量取决于上游补丁**。本项目不重写全部译文，而是复用社区汉化（`lgw88/CN-GitHub-Desktop`，MIT）并对其中发现的问题做覆盖修正。上游没覆盖到的少数长句可能仍是英文。
- **枚举值与逻辑键刻意保留英文**。例如告警级别 `Warning`、加载状态 `Loading`、单选值 `Unified`/`Split` ——这些字符串参与代码比较，翻译会导致功能异常。
- **Git 命令自身的输出不翻译**（`git` 报错、路径、仓库/分支/提交信息），那是数据不是界面。
- 上游补丁更新通常滞后新版本 1-3 天，这期间会走词典兜底，译文质量略低（约 88% 覆盖）。

## 风险与恢复

修改的是本地安装目录下的两个 JS 文件，**不涉及账号与仓库数据**。每次打补丁前会自动备份官方原版；万一程序打不开，运行 `restore-en.bat` 即可回到英文原状。

## 致谢

- 汉化补丁：[lgw88/CN-GitHub-Desktop](https://github.com/lgw88/CN-GitHub-Desktop)（MIT）
- 上游：[GitHub Desktop](https://github.com/desktop/desktop)（MIT）
- 本工具链的版本适配、术语层、词典与体检脚本为原创实现。
