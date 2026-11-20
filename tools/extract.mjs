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
