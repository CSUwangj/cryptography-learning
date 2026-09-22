// Throwaway synthetic reference. Layout and dependency graph precede presentation.
const S = [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7];
const P = Array.from({ length: 16 }, (_, i) => (i % 4) * 4 + Math.floor(i / 4));
const keys = [0x3a94, 0xa94d, 0x94d6];
const bit = (value, i) => (value >>> (15 - i)) & 1;
const hex = value => value.toString(16).toUpperCase().padStart(4, '0');
const nibble = (value, i) => (value >>> (12 - i * 4)) & 15;
const substitute = value => [0, 1, 2, 3].reduce((out, i) => (out << 4) | S[nibble(value, i)], 0);
const permute = value => P.reduce((out, to, from) => out | (bit(value, from) << (15 - to)), 0);
const operations = [
  { kind: 'xor', round: 0 }, { kind: 'sbox', round: 0 }, { kind: 'permute', round: 0 },
  { kind: 'xor', round: 1 }, { kind: 'sbox', round: 1 }, { kind: 'permute', round: 1 },
  { kind: 'xor', round: 2 },
];
let a = 0x0f0f, b = 0x00ff;
const stages = [{ a, b, id: 'plaintext' }];
for (const op of operations) {
  const transform = value => op.kind === 'xor' ? value ^ keys[op.round] : op.kind === 'sbox' ? substitute(value) : permute(value);
  a = transform(a); b = transform(b);
  stages.push({ a, b, id: `round-${op.round}/${op.kind}/output` });
}
stages.forEach(Object.freeze);
Object.freeze(stages);
const edges = operations.map(op => Array.from({ length: 16 }, (_, from) => {
  const targets = op.kind === 'sbox' ? [0, 1, 2, 3].map(i => Math.floor(from / 4) * 4 + i)
    : [op.kind === 'permute' ? P[from] : from];
  return targets.map(to => ({ from, to }));
}).flat());
const copy = {
  'en-US': {
    title: 'One continuous avalanche trace',
    intro: 'Throwaway reference · Teaching SPN · One changed input: plaintext 0F0F → 00FF. The key stays fixed. Scroll down to follow every operation; scroll sideways on small screens.',
    legend: 'Each cell: A | B (baseline | changed). Underline + ≠ = actual difference. Bold blue paths = selected-bit dependency, not necessarily a flipped value. Click a bit, or focus it with Tab and press Enter / Space.',
    selected: 'Selected bit', ancestors: 'Ancestors above; descendants below. Matching key bits are fixed XOR operands.',
    state: 'STATE FLOW · A | B', key: 'ROUND KEYS · FIXED IN BOTH RUNS',
    byte: 'Byte', plaintext: 'Plaintext', ciphertext: 'Ciphertext', after: 'After', round: 'Round',
    xor: 'Key mixing', sbox: 'Substitution · S-box lookup', permute: 'Permutation',
    mask: 'Mask', changed: 'changed', dependency: '4 inputs → 4 outputs: dependency',
    mapping: 'Bit positions: source → destination', table: 'S-box: input → output (hex)',
    same: 'A = B', keyHint: 'Click to highlight this XOR connection',
    foot: 'Synthetic two-round SPN + final key mixing. Bit 0 is the most significant bit. S-box paths show structural dependence; eight simultaneous input differences do not establish an individual bit’s causal contribution. All values and lookups remain visible.',
    keyCase: 'Same view: key-change case', keyIntro: 'Plaintext stays fixed; only the key changes. The separate key column makes the divergence begin at key mixing.', keyStage: 'Stage', baseline: 'Run A · baseline', changedRun: 'Run B · changed key', keyColumn: 'Separate round-key column', sameInput: 'same input', fixed: 'fixed', warning: 'Comparison warning: the changed input port is key.',
    scroll: 'Continuous propagation diagram; scroll horizontally if needed',
  },
  'zh-CN': {
    title: '一条连续的雪崩传播轨迹',
    intro: '一次性参考原型 · 教学 SPN · 仅明文输入改变：0F0F → 00FF，密钥保持不变。向下滚动查看每个操作；窄屏可横向滚动。',
    legend: '每格：A | B（基准 | 改变后）。下划线 + ≠ 表示实际差异。蓝色粗线表示所选位的依赖关系，不一定发生翻转。点击任意位，或用 Tab 聚焦后按 Enter / 空格。',
    selected: '所选位', ancestors: '上方为祖先，下方为后继；对应密钥位是固定的异或操作数。',
    state: '状态流 · A | B', key: '轮密钥 · 两次执行完全相同',
    byte: '字节', plaintext: '明文', ciphertext: '密文', after: '操作后', round: '轮次',
    xor: '密钥混合', sbox: '替换 · S 盒查表', permute: '置换',
    mask: '差异掩码', changed: '位改变', dependency: '4 个输入 → 4 个输出：依赖关系',
    mapping: '位位置：来源 → 目标', table: 'S 盒：输入 → 输出（十六进制）',
    same: 'A = B', keyHint: '点击突出显示此异或连接',
    foot: '合成的两轮 SPN，最后再混合一次密钥。第 0 位是最高有效位。S 盒路径表示结构依赖；八个输入位同时变化，无法据此确定单个位的独立因果贡献。所有数值与查表关系始终可见。',
    keyCase: '同一视图：密钥变化示例', keyIntro: '明文保持不变，只改变密钥。单独的密钥列显示分叉从密钥混合开始。', keyStage: '阶段', baseline: '运行 A · 基准', changedRun: '运行 B · 密钥变化', keyColumn: '单独的轮密钥列', sameInput: '相同输入', fixed: '固定', warning: '比较警告：变化的输入端口是 key。',
    scroll: '连续传播图；必要时可横向滚动',
  },
};
let locale = 'en-US';
let selected = { stage: 0, bit: 4 };
let selectedKey = null;
const X = i => 206 + i * 40;
const Y = stage => 70 + stage * 280;
const label = (index, t) => index === 0 ? t.plaintext : index === stages.length - 1 ? t.ciphertext : `${t.after} ${t[operations[index - 1].kind]}`;
const text = (x, y, value, cls = '', extra = '') => `<text x="${x}" y="${y}" class="${cls}" ${extra}>${value}</text>`;
function render() {
  const t = copy[locale];
  document.documentElement.lang = locale;
  for (const id of ['title', 'intro', 'legend']) document.getElementById(id).textContent = t[id];
  document.getElementById('footnote').textContent = t.foot;
  document.getElementById('key-case-title').textContent = t.keyCase;
  document.getElementById('key-case-intro').textContent = t.keyIntro;
  renderKeyShowcase(t);
  document.getElementById('selection').textContent = `${t.selected}: ${label(selected.stage, t)} / ${selected.bit}. ${t.ancestors}`;
  const active = stages.map(() => new Set());
  active[selected.stage].add(selected.bit);
  for (let s = selected.stage; s < edges.length; s++) {
    edges[s].forEach(e => { if (active[s].has(e.from)) active[s + 1].add(e.to); });
  }
  for (let s = selected.stage - 1; s >= 0; s--) {
    edges[s].forEach(e => { if (active[s + 1].has(e.to)) active[s].add(e.from); });
  }
  let svg = text(190, 24, t.state, 'heading') + text(955, 24, t.key, 'heading');
  svg += '<path d="M925 0 V2100" class="divider"/>';
  svg += text(206, 49, `${t.byte} 0 · 0–7`) + text(526, 49, `${t.byte} 1 · 8–15`);
  operations.forEach((op, s) => {
    const top = Y(s) + 46, bottom = Y(s + 1), middle = (top + bottom) / 2;
    // Draw muted paths first, so every selected path remains visible above them.
    const related = e => active[s].has(e.from) && active[s + 1].has(e.to);
    [...edges[s]].sort((a, b) => Number(related(a)) - Number(related(b))).forEach(e => {
      svg += `<path d="M${X(e.from)} ${top} L${X(e.to)} ${bottom}" class="wire ${related(e) ? 'related' : ''}"/>`;
    });
    svg += text(16, middle - 18, `${t.round} ${op.round + 1}`, 'muted');
    svg += text(16, middle + 6, t[op.kind], 'heading');
    if (op.kind === 'xor') {
      const ky = middle - 30;
      svg += `<path d="M950 ${middle} H180" class="key-wire ${selectedKey === op.round ? 'key-selected' : ''}"/>`;
      for (let i = 0; i < 16; i++) {
        svg += `<circle cx="${X(i)}" cy="${middle}" r="10" class="xor ${active[s].has(i) ? 'active' : ''}"/>`;
        svg += text(X(i), middle + 5, '⊕', 'center');
      }
      svg += `<g role="button" tabindex="0" data-key="${op.round}" aria-label="K${op.round}: ${hex(keys[op.round])}. ${t.keyHint}" aria-pressed="${selectedKey === op.round}">`;
      svg += `<rect x="950" y="${ky - 22}" width="350" height="118" rx="2" class="key-box ${selectedKey === op.round ? 'chosen' : ''}"/>`;
      svg += text(964, ky, `K${op.round} · ${hex(keys[op.round])} · ${t.same}`, 'heading');
      for (let i = 0; i < 16; i++) svg += text(966 + i * 20, ky + 30, bit(keys[op.round], i), active[s].has(i) ? 'key-bit' : 'mono');
      svg += text(964, ky + 55, t.keyHint, 'small') + '</g>';
      svg += text(950, ky + 115, `A: ${hex(stages[s].a)} ⊕ ${hex(keys[op.round])} = ${hex(stages[s + 1].a)}`, 'mono');
      svg += text(950, ky + 140, `B: ${hex(stages[s].b)} ⊕ ${hex(keys[op.round])} = ${hex(stages[s + 1].b)}`, 'mono');
    } else if (op.kind === 'sbox') {
      for (let n = 0; n < 4; n++) {
        const left = X(n * 4) - 17;
        const relevant = [...active[s]].some(i => Math.floor(i / 4) === n);
        svg += `<rect x="${left}" y="${middle - 35}" width="154" height="70" class="operation ${relevant ? 'active' : ''}"/>`;
        svg += text(left + 8, middle - 15, `S${n}`, 'heading');
        for (const [run, dy] of [['a', 7], ['b', 26]]) {
          const v = nibble(stages[s][run], n);
          svg += text(left + 8, middle + dy, `${run.toUpperCase()}: ${v.toString(16).toUpperCase()} → ${S[v].toString(16).toUpperCase()}`, 'mono');
        }
      }
      svg += text(950, middle - 60, t.table, 'heading');
      for (let i = 0; i < 16; i++) {
        const used = [0, 1, 2, 3].some(n => [...active[s]].some(j => Math.floor(j / 4) === n) && (nibble(stages[s].a, n) === i || nibble(stages[s].b, n) === i));
        svg += text(955 + (i % 4) * 84, middle - 30 + Math.floor(i / 4) * 25, `${i.toString(16).toUpperCase()}→${S[i].toString(16).toUpperCase()}`, used ? 'lookup' : 'mono');
      }
      svg += text(950, middle + 88, t.dependency, 'small');
    } else {
      svg += text(950, middle - 52, t.mapping, 'heading');
      P.forEach((to, from) => {
        svg += text(955 + (from % 4) * 84, middle - 22 + Math.floor(from / 4) * 25, `${from}→${to}`, active[s].has(from) ? 'lookup' : 'mono');
      });
    }
  });
  stages.forEach((stage, s) => {
    const y = Y(s), mask = stage.a ^ stage.b;
    const count = Array.from({ length: 16 }, (_, i) => bit(mask, i)).reduce((sum, v) => sum + v, 0);
    svg += text(16, y + 4, label(s, t), 'heading');
    svg += text(16, y + 26, `A ${hex(stage.a)} | B ${hex(stage.b)}`, 'mono');
    svg += text(16, y + 48, `${t.mask} ${hex(mask)}`, 'small');
    svg += text(16, y + 68, `${count}/16 ${t.changed} · ${count / 16 * 100}%`, 'small');
    for (let i = 0; i < 16; i++) {
      const diff = bit(mask, i), chosen = selected.stage === s && selected.bit === i;
      svg += `<g role="button" tabindex="0" data-stage="${s}" data-bit="${i}" aria-pressed="${chosen}" aria-label="${label(s, t)}, ${i}: A ${bit(stage.a, i)}, B ${bit(stage.b, i)}${diff ? ', ≠' : ', ='}">`;
      svg += `<rect x="${X(i) - 18}" y="${y}" width="36" height="46" class="cell ${diff ? 'different' : ''} ${active[s].has(i) ? 'active' : ''} ${chosen ? 'chosen' : ''}"/>`;
      svg += text(X(i), y + 12, i, 'center bit-index');
      svg += text(X(i), y + 30, `${bit(stage.a, i)}│${bit(stage.b, i)}`, `center mono ${diff ? 'difference-value' : ''}`);
      svg += '</g>';
    }
    svg += `<path d="M506 ${y - 3} V${y + 49}" class="byte-divider"/>`;
  });
  const diagram = document.getElementById('diagram');
  diagram.setAttribute('aria-label', t.scroll);
  diagram.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="2110" aria-label="${t.title}">${svg}</svg>`;
}
function renderKeyShowcase(t) {
  const changedKeys = [0xc271, 0x6f20, 0x4d12];
  const keyStages = [{ a: 0x0f0f, b: 0x0f0f }];
  let ka = 0x0f0f, kb = 0x0f0f;
  operations.forEach(op => { const transform = value => op.kind === 'xor' ? value ^ (op.round ? keys[op.round] : keys[0]) : op.kind === 'sbox' ? substitute(value) : permute(value); const transformChanged = value => op.kind === 'xor' ? value ^ changedKeys[op.round] : op.kind === 'sbox' ? substitute(value) : permute(value); ka = transform(ka); kb = transformChanged(kb); keyStages.push({ a: ka, b: kb }); });
  let svg = text(190, 24, `${t.keyCase} · ${t.state}`, 'heading') + text(955, 24, t.keyColumn, 'heading') + '<path d="M925 0 V2100" class="divider"/>';
  svg += text(206, 49, `${t.byte} 0 · 0–7`) + text(526, 49, `${t.byte} 1 · 8–15`);
  operations.forEach((op, s) => {
    const top = Y(s) + 46, bottom = Y(s + 1), middle = (top + bottom) / 2;
    for (let i = 0; i < 16; i++) svg += `<path d="M${X(i)} ${top} L${X(op.kind === 'permute' ? P[i] : i)} ${bottom}" class="wire key-trace-wire"/>`;
    svg += text(16, middle - 18, `${t.round} ${op.round + 1}`, 'muted') + text(16, middle + 6, t[op.kind], 'heading');
    if (op.kind === 'xor') {
      svg += `<path d="M950 ${middle} H180" class="key-wire key-trace-wire"/>`;
      svg += `<rect x="950" y="${middle - 52}" width="350" height="82" rx="2" class="key-box key-showcase-box"/>`;
      svg += text(964, middle - 26, `K${op.round} A · ${hex(keys[op.round])}`, 'heading') + text(964, middle - 4, `K${op.round} B · ${hex(changedKeys[op.round])}`, 'key-showcase-text');
      svg += text(950, middle + 58, `A ${hex(keyStages[s].a)} ⊕ ${hex(keys[op.round])} = ${hex(keyStages[s + 1].a)}`, 'mono') + text(950, middle + 82, `B ${hex(keyStages[s].b)} ⊕ ${hex(changedKeys[op.round])} = ${hex(keyStages[s + 1].b)}`, 'mono');
    } else if (op.kind === 'sbox') {
      for (let n = 0; n < 4; n++) svg += `<rect x="${X(n * 4) - 17}" y="${middle - 35}" width="154" height="70" class="operation key-showcase-box"/>`;
    } else svg += text(950, middle - 52, t.mapping, 'heading');
  });
  keyStages.forEach((stage, s) => {
    const y = Y(s), mask = stage.a ^ stage.b, count = Array.from({ length: 16 }, (_, i) => bit(mask, i)).reduce((sum, v) => sum + v, 0);
    svg += text(16, y + 4, label(s, t), 'heading') + text(16, y + 26, `A ${hex(stage.a)} | B ${hex(stage.b)}`, 'mono') + text(16, y + 48, `${t.mask} ${hex(mask)}`, 'small') + text(16, y + 68, `${count}/16 ${t.changed} · ${count / 16 * 100}%`, 'small');
    for (let i = 0; i < 16; i++) { const diff = bit(mask, i); svg += `<rect x="${X(i) - 18}" y="${y}" width="36" height="46" class="cell key-showcase-cell ${diff ? 'different' : ''}"/>` + text(X(i), y + 12, i, 'center bit-index') + text(X(i), y + 30, `${bit(stage.a, i)}│${bit(stage.b, i)}`, `center mono ${diff ? 'difference-value' : ''}`); }
    svg += `<path d="M506 ${y - 3} V${y + 49}" class="byte-divider"/>`;
  });
  document.getElementById('key-diagram').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="2110" aria-label="${t.keyCase}">${svg}</svg>`;
}
function activate(event) {
  if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
  const target = event.target.closest('[data-bit], [data-key]');
  if (!target) return;
  event.preventDefault();
  let selector;
  if (target.hasAttribute('data-key')) {
    selectedKey = Number(target.dataset.key);
    selector = `[data-key="${selectedKey}"]`;
  } else {
    selected = { stage: Number(target.dataset.stage), bit: Number(target.dataset.bit) };
    selectedKey = null;
    selector = `[data-stage="${selected.stage}"][data-bit="${selected.bit}"]`;
  }
  render();
  document.querySelector(selector).focus({ preventScroll: true });
}
document.getElementById('diagram').addEventListener('click', activate);
document.getElementById('diagram').addEventListener('keydown', activate);
document.getElementById('locale').addEventListener('change', event => { locale = event.target.value; render(); });
render();
