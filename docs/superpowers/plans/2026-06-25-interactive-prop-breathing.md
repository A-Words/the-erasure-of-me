# 可交互道具呼吸高亮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给所有可交互道具加轻微的缩放/小点呼吸微动，让玩家在静止时也能发现可交互物，reducedMotion 下完全关闭。

**Architecture:** 新增无 Phaser 依赖的纯函数模块 `src/game/presentation/breathing.ts`（门控 `isBreathingActive` + 计算 `computeBreathScale`），由 `GameScene` 每帧调用，仅作用于表现层、不写入游戏状态或存档。`EntityView` 扩展 `actor` 引用、`breathBaseScale`、`breathPhase`、`breathKind`。

**Tech Stack:** Phaser 3 + TypeScript + Vite + Vitest（单测）+ Playwright（e2e）

## Global Constraints

- 游戏规则和可存档状态必须独立于 Phaser Scene、Sprite、Tween、Camera 和 DOM（AGENTS.md）。呼吸只作用于表现层。
- 减少动态效果（`reducedMotion`）、暂停、退出、字幕和无障碍设置永不随退化改变；reducedMotion 下完全关闭呼吸，不改小点既有行为。
- 不加入随机按键变化、死亡、追逐、战斗或诊断评分。
- 不根据谜题表现、用时或提示次数推断玩家的认知健康。
- 当前语言：简体中文；提交使用 Conventional Commits，一个提交一个目的，只暂存本任务相关文件。
- ART_BIBLE §4.2.1 背书"微动"通道；不得新增发光 UI、不得改色板、不得新增资产。

## File Structure

- **Create** `src/game/presentation/breathing.ts` — 无 Phaser 依赖的纯函数：`isBreathingActive(state)`、`computeBreathSine(timeSeconds, phaseOffset, period?)`（返回 -1..1 的共享正弦，单一事实源）、`computeBreathScale(base, timeSeconds, phaseOffset, period?, amplitude?)`（基于 `computeBreathSine`）。职责单一、可单测。
- **Create** `tests/unit/breathing.test.ts` — 上述纯函数的分支与边界测试。
- **Modify** `src/phaser/scenes/GameScene.ts` — `EntityView` 扩展呼吸字段；`createEntity` 捕获 actor 引用与基准缩放、分配 `breathKind`/`breathPhase`；`update` 每帧调用新方法 `updateEntityBreathing`。
- **Modify** `tests/e2e/accessibility.spec.ts` — 增一条 reducedMotion 断言。
- **Modify** `docs/ART_BIBLE.md` §4.2.1 — 补呼吸微动条款。
- **Modify** `docs/TECHNICAL_DESIGN.md` — EntityView 表现层小注。

参考规格：[docs/superpowers/specs/2026-06-25-interactive-prop-breathing-design.md](../specs/2026-06-25-interactive-prop-breathing-design.md)

---

### Task 1: 纯函数 breathing 模块与单测（TDD）

**Files:**
- Create: `src/game/presentation/breathing.ts`
- Test: `tests/unit/breathing.test.ts`

**Interfaces:**
- Produces（供 Task 2 的 `GameScene` 消费）：
  - `export function isBreathingActive(state: Readonly<GameState>): boolean`
  - `export function computeBreathSine(timeSeconds: number, phaseOffset: number, periodSeconds?: number): number` — 返回 -1..1 的共享正弦值，供 `computeBreathScale` 与 dot 分支共用，避免公式重复。
  - `export function computeBreathScale(base: number, timeSeconds: number, phaseOffset: number, periodSeconds?: number, amplitude?: number): number`
- Consumes: `GameState` 类型来自 `../../game/state/GameState`（`phase`、`modal`、`dialogue`、`flags: string[]`、`settings.reducedMotion` 均为顶层字段，见 `src/game/state/GameState.ts:44-68`）。

- [ ] **Step 1: 写失败测试**

创建 `tests/unit/breathing.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  computeBreathScale,
  computeBreathSine,
  isBreathingActive,
} from '../../src/game/presentation/breathing';
import { createInitialState } from '../../src/game/state/initialState';

function playingState() {
  const state = createInitialState();
  state.phase = 'playing';
  state.modal = null;
  state.dialogue = [];
  state.flags = [];
  state.settings.reducedMotion = false;
  return state;
}

describe('isBreathingActive', () => {
  it('is active during plain playing', () => {
    expect(isBreathingActive(playingState())).toBe(true);
  });

  it('is inactive when a modal is open', () => {
    const state = playingState();
    state.modal = 'inventory';
    expect(isBreathingActive(state)).toBe(false);
  });

  it('is inactive during dialogue', () => {
    const state = playingState();
    state.dialogue = ['一句话'];
    expect(isBreathingActive(state)).toBe(false);
  });

  it('is inactive while ready to hold', () => {
    const state = playingState();
    state.flags = ['ending.ready_to_hold'];
    expect(isBreathingActive(state)).toBe(false);
  });

  it('is inactive under reduced motion', () => {
    const state = playingState();
    state.settings.reducedMotion = true;
    expect(isBreathingActive(state)).toBe(false);
  });

  it('is inactive outside the playing phase', () => {
    const state = playingState();
    state.phase = 'title';
    expect(isBreathingActive(state)).toBe(false);
  });
});

describe('computeBreathSine', () => {
  it('returns 0 at phase 0', () => {
    expect(computeBreathSine(0, 0, 2.4)).toBeCloseTo(0, 5);
  });

  it('returns 1 at a quarter period', () => {
    expect(computeBreathSine(0.6, 0, 2.4)).toBeCloseTo(1, 5);
  });

  it('returns -1 at three quarters of a period', () => {
    expect(computeBreathSine(1.8, 0, 2.4)).toBeCloseTo(-1, 5);
  });

  it('applies the phase offset', () => {
    expect(computeBreathSine(0, 0.6, 2.4)).toBeCloseTo(1, 5);
  });
});

describe('computeBreathScale', () => {
  it('equals base at phase 0', () => {
    expect(computeBreathScale(1, 0, 0, 2.4, 0.035)).toBeCloseTo(1, 5);
  });

  it('reaches base + amplitude at a quarter period', () => {
    expect(computeBreathScale(1, 0.6, 0, 2.4, 0.035)).toBeCloseTo(1.035, 5);
  });

  it('reaches base - amplitude at three quarters of a period', () => {
    expect(computeBreathScale(1, 1.8, 0, 2.4, 0.035)).toBeCloseTo(0.965, 5);
  });

  it('applies the phase offset', () => {
    expect(computeBreathScale(1, 0, 0.6, 2.4, 0.035)).toBeCloseTo(1.035, 5);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/breathing.test.ts`
Expected: FAIL — `Cannot find module '../../src/game/presentation/breathing'`

- [ ] **Step 3: 写最小实现**

创建 `src/game/presentation/breathing.ts`：

```ts
import type { GameState } from '../state/GameState';

/**
 * 呼吸微动门控：仅在标准模式的纯游玩态下启用。
 * modal / 对白 / 牵手长按 / reducedMotion / 非游玩态 全部关闭。
 */
export function isBreathingActive(state: Readonly<GameState>): boolean {
  return (
    state.phase === 'playing' &&
    !state.modal &&
    state.dialogue.length === 0 &&
    !state.flags.includes('ending.ready_to_hold') &&
    !state.settings.reducedMotion
  );
}

/**
 * 共享正弦波：返回 -1..1。供 computeBreathScale 与 GameScene 的 dot 分支共用，
 * 避免同一呼吸公式散落两处。
 */
export function computeBreathSine(
  timeSeconds: number,
  phaseOffset: number,
  periodSeconds = 2.4,
): number {
  const t = (timeSeconds + phaseOffset) / periodSeconds;
  return Math.sin(t * Math.PI * 2);
}

/**
 * 纯正弦呼吸缩放计算。不依赖 Phaser，便于单测。
 * 公式：base + computeBreathSine(...) * amplitude
 */
export function computeBreathScale(
  base: number,
  timeSeconds: number,
  phaseOffset: number,
  periodSeconds = 2.4,
  amplitude = 0.035,
): number {
  return base + computeBreathSine(timeSeconds, phaseOffset, periodSeconds) * amplitude;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/breathing.test.ts`
Expected: PASS（全部 14 条：6 门控 + 4 sine + 4 scale）

- [ ] **Step 5: lint + 类型检查**

Run: `npm run lint`
Expected: 无错误。

Run: `npx tsc -b`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add src/game/presentation/breathing.ts tests/unit/breathing.test.ts
git commit -m "feat: add breathing presentation helpers"
```

---

### Task 2: GameScene 接入呼吸微动

**Files:**
- Modify: `src/phaser/scenes/GameScene.ts`
  - `EntityView` 接口（`18-24` 行附近）
  - `update`（`160-179` 行）：新增 `updateEntityBreathing` 调用
  - `createEntity`（`520-588` 行）：捕获 `actor` 引用与基准缩放，分配 `breathKind`/`breathPhase`
  - 新增私有方法 `updateEntityBreathing`

**Interfaces:**
- Consumes（来自 Task 1）：`isBreathingActive(state: Readonly<GameState>): boolean`、`computeBreathSine(timeSeconds, phaseOffset, periodSeconds?): number`、`computeBreathScale(base, timeSeconds, phaseOffset, periodSeconds?, amplitude?): number`
- Produces：无（终端任务，仅表现层行为）。

**关键决策（来自规格 §3）：**
- 有精灵的道具 → `breathKind: 'scale'`，对 `actor` 做 ±3.5% 缩放，周期 2.4s，相位 `index * 0.6`。
- 无精灵的交互点（出口/门）→ `breathKind: 'dot'`，对 `marker` 做缩放 0.88..1.12、alpha 0.12..0.25（与缩放同相位）。
- 秀兰 `entity.ending.xiulan` → `breathKind: 'none'`，不参与。
- `updateEntityBreathing` 必须在 `update()` 中 `if (state.phase !== 'playing') return;`（`164` 行）**之前**调用，使非游玩态也能把道具复位回基准缩放、小点归零。
- 门控：`active = isBreathingActive(state)` 为真且 `!view.hover` 且 `view.container.visible` 才呼吸；否则 `scale` 停回 `breathBaseScale`、`dot` 停回 `setScale(1).setAlpha(0)`。

- [ ] **Step 1: 扩展 EntityView 接口**

把 `src/phaser/scenes/GameScene.ts:18-24` 的接口改为：

```ts
interface EntityView {
  definition: WorldEntity;
  container: Phaser.GameObjects.Container;
  marker: Phaser.GameObjects.Shape;
  label: Phaser.GameObjects.Text;
  actor: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null;
  breathKind: 'scale' | 'dot' | 'none';
  breathBaseScale: number;
  breathPhase: number;
  hover: boolean;
}
```

- [ ] **Step 2: 在文件顶部加入 import**

在 `src/phaser/scenes/GameScene.ts:16`（`import { SceneBridge }` 之前或之后）加入：

```ts
import { computeBreathSine, computeBreathScale, isBreathingActive } from '../../game/presentation/breathing';
```

- [ ] **Step 3: 在 createEntity 中捕获呼吸字段**

修改 `createEntity`（`520-588` 行）中构造 `view` 的部分。当前 `actor` 是局部 `const`，需在构造 `view` 时引用它。同时按实体特征分配 `breathKind`。

定位 `createEntity` 内 `const view: EntityView = { definition: entity, container, marker, label, hover: false };`（`574` 行附近），替换为：

```ts
    const isXiulan = entity.id === 'entity.ending.xiulan';
    const breathKind: EntityView['breathKind'] = isXiulan
      ? 'none'
      : actor
        ? 'scale'
        : 'dot';
    const breathBaseScale = actor ? actor.scaleX : 1;
    // 稳定错相，避免所有道具同步；用当前实体数量作为确定性索引。
    const breathPhase = this.entityViews.length * 0.6;

    const view: EntityView = {
      definition: entity,
      container,
      marker,
      label,
      actor,
      breathKind,
      breathBaseScale,
      breathPhase,
      hover: false,
    };
```

> 注意：`createEntity` 上方已有 `const isXiulan = entity.id === 'entity.ending.xiulan';`（`522` 行）与 `const isUmbrella = ...`（`523` 行）以及 `const actor = ...`（`531-548` 行）。此处复用既有的 `isXiulan` 与 `actor`，不重复声明；若上方变量名一致，去掉本块里的 `const isXiulan` 重复行。`isUmbrella` 既有逻辑不变——红伞有 `actor`（image），自然落到 `breathKind: 'scale'`。

- [ ] **Step 4: 新增 updateEntityBreathing 方法**

在 `GameScene` 类中（建议放在 `updateEntityVisibility` 之后，`622-632` 行附近）新增：

```ts
  private updateEntityBreathing(state: Readonly<GameState>, timeMs: number): void {
    const active = isBreathingActive(state);
    const timeSeconds = timeMs / 1000;
    for (const view of this.entityViews) {
      if (!view.container.visible) continue;
      if (view.breathKind === 'none') continue;

      if (view.breathKind === 'scale') {
        const actor = view.actor;
        if (!actor) continue;
        if (active && !view.hover) {
          actor.setScale(
            computeBreathScale(view.breathBaseScale, timeSeconds, view.breathPhase),
          );
        } else {
          actor.setScale(view.breathBaseScale);
        }
        continue;
      }

      // breathKind === 'dot'
      if (active && !view.hover) {
        const s = computeBreathSine(timeSeconds, view.breathPhase);
        view.marker.setScale(1 + s * 0.12).setAlpha(0.12 + (s + 1) * 0.065);
      } else {
        view.marker.setScale(1).setAlpha(0);
      }
    }
  }
```

> 说明：`dot` 的 alpha 范围 `(s+1)*0.065` 在 s=-1 时为 0、s=1 时为 0.13，再加底 0.12 → 0.12..0.25，与规格 §3.3 一致。`scale` 与 `dot` 共用 `computeBreathSine`，呼吸公式单一事实源。`scale` 用 `computeBreathScale`（默认 amplitude 0.035）。

- [ ] **Step 5: 在 update 中调用**

修改 `update`（`160-179` 行）。当前第一行是 `const state = this.bridge.getSnapshot();`。在 `syncState`/`updatePlayerPose` 之后、`phase !== 'playing'` early return 之前插入调用。

定位 `update` 方法，改为：

```ts
  update(_time: number, delta: number): void {
    const state = this.bridge.getSnapshot();
    const action = state.phase === 'playing' ? this.currentMovementAction() : null;
    if (!action && state.player.moving) this.bridge.send({ type: 'STOP_MOVING' });
    this.updateEntityBreathing(state, _time);
    if (state.phase !== 'playing') return;
    this.tickAccumulator += delta / 1000;
    if (this.tickAccumulator >= 1) {
      this.bridge.send({ type: 'TICK', deltaSeconds: this.tickAccumulator });
      this.tickAccumulator = 0;
    }
    if (action) {
      const direction = mapMovement(action, state.degradationStage, state.mode);
      if (direction) this.bridge.send({ type: 'MOVE', direction, deltaSeconds: delta / 1000 });
    }
    if (this.holdingConfirm && state.flags.includes('ending.ready_to_hold')) {
      this.bridge.send({ type: 'HOLD', deltaSeconds: delta / 1000 });
    }
    const latestState = this.bridge.getSnapshot();
    this.updatePlayerPose(latestState);
  }
```

> 关键：`this.updateEntityBreathing(state, _time);` 放在 `if (state.phase !== 'playing') return;` **之前**，这样非游玩态会走 `active=false` 分支，把道具复位回基准缩放、小点归零。Phaser 的 `_time` 是页面启动以来的毫秒数，作为呼吸时间基准稳定可用。

- [ ] **Step 6: lint + 类型检查 + 构建**

Run: `npm run lint`
Expected: 无错误。

Run: `npx tsc -b`
Expected: 无错误。

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 7: 运行全部单测**

Run: `npm run test`
Expected: 全部通过（含 Task 1 的 breathing 测试与既有测试）。

- [ ] **Step 8: 提交**

```bash
git add src/phaser/scenes/GameScene.ts
git commit -m "feat: add resting breathing to interactive props"
```

---

### Task 3: e2e reducedMotion 断言 + 标准模式代表性截图

**Files:**
- Modify: `tests/e2e/accessibility.spec.ts`

**目的：** reducedMotion 开启时道具缩放停在基准（确定性，不依赖动画相位）；标准模式截一张代表性截图供人工复核（AGENTS.md 要求 Canvas 变化检查代表性截图）。不对标准模式呼吸相位做像素级断言（会 flaky）。

**关键约束：**
- 既有 `beforeEach` 已 `localStorage.clear()` 并 reload（`5-14` 行），并收集 `browserErrors`，`afterEach` 断言为空（`16-18` 行）——新测试沿用同一夹具，不重复清空。
- 既有 `startGameWithKeyboard` / `finishOpeningDialogue` 辅助（`25-32` 行）可直接复用。
- reducedMotion 在暂停菜单里是 labeled checkbox（见既有测试 `72` 行 `静音` 与 `文字大小` 的取法）；本测试改为断言 `data-breathing-active="false"`（呼吸门控关闭）并截图，不做精灵 transform scale 的像素级断言（会 flaky）。

- [ ] **Step 1: 写 e2e 测试**

在 `tests/e2e/accessibility.spec.ts` 末尾追加（最终方案：不注入测试专用钩子，改为断言 `data-breathing-active="false"` + 截图，由既有 `afterEach` 兜底无控制台错误。曾考虑读取 `window.__erasure.propScaleSnapshot` 的钩子方案，因会在产品代码里加测试专用状态、违反"游戏规则状态独立于 Phaser"而被否决）：

```ts
test('keeps interactive props stable under reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startGameWithKeyboard(page);
  await finishOpeningDialogue(page);

  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await canvas.focus();

  // 开启减少动态效果：暂停菜单里的 labeled checkbox（沿用既有 settings 取法）。
  await page.keyboard.press('Escape');
  const reducedMotion = page.getByLabel('减少动态效果');
  await reducedMotion.scrollIntoViewIfNeeded();
  await reducedMotion.focus();
  await page.keyboard.press('Space');
  await expect(reducedMotion).toBeChecked();
  // 显式点"继续"并等暂停层消失再截图，避免 Escape 在 checkbox 聚焦时被 UI 拦截导致截图仍停在暂停层。
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByRole('heading', { name: '暂停' })).not.toBeVisible();

  // reducedMotion 下呼吸必须完全关闭。
  await expect(app).toHaveAttribute('data-breathing-active', 'false');
  await page.screenshot({
    path: testInfo.outputPath('reduced-motion-prop-base-scale.png'),
    animations: 'disabled',
  });
});
```

- [ ] **Step 2: 标准模式代表性截图**

在同一文件再追加一条测试，截标准模式呼吸中的住宅画面（人工复核用，不做像素断言）：

```ts
test('captures standard-mode breathing snapshot for review', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startGameWithKeyboard(page);
  await finishOpeningDialogue(page);

  // 标准模式：不开启 reducedMotion，让呼吸运行，截一张供人工复核。
  await page.screenshot({
    path: testInfo.outputPath('standard-mode-breathing.png'),
    animations: 'allow',
  });
});
```

> 注意：`getByLabel('减少动态效果')` 的确切文案需与 UI 一致。先运行 Step 3 的 e2e；若因 label 文案不匹配导致 `reducedMotion` 定位失败，改用 `page.getByRole('checkbox', { name: /减少动态/ })` 并在注释记录实际文案。

- [ ] **Step 3: 运行 e2e**

先确保 Playwright 浏览器已安装（首次）：

Run: `npx playwright install chromium`
（项目既有 e2e 应已装过；若已装可跳过）

Run: `npm run test:e2e`
Expected: 全部通过，含新增两条；截图生成于 `test-results/`。

- [ ] **Step 4: 人工复核截图**

打开生成的 `standard-mode-breathing.png` 与 `reduced-motion-prop-base-scale.png`，确认：
- 标准模式：道具在画面中可见、无明显抖动错位；
- reducedMotion：道具静止、小点不可见。

> 这是 AGENTS.md 要求的"Canvas 变化必须检查代表性截图"。把检查结论记入提交说明。

- [ ] **Step 5: 提交**

```bash
git add tests/e2e/accessibility.spec.ts
git commit -m "test: add reduced-motion and breathing e2e coverage"
```

---

### Task 4: 文档同步（ART_BIBLE + TECHNICAL_DESIGN）

**Files:**
- Modify: `docs/ART_BIBLE.md` §4.2.1
- Modify: `docs/TECHNICAL_DESIGN.md`

**约束（来自 AGENTS.md 文档同步节）：**
- 改尺寸、色彩、字体、精灵、UI 或资产命名 → 同步 ART_BIBLE.md；
- 改架构、状态、输入、存档、地图格式或命令 → 同步 TECHNICAL_DESIGN.md 和 README.md（本任务不改架构/命令，README 无需改）。

- [ ] **Step 1: 同步 ART_BIBLE §4.2.1**

打开 `docs/ART_BIBLE.md`，定位 §4.2.1「交互点表现」（约 `87-94` 行）。在现有条目中补充呼吸条款，**保留**"不显示常驻大圆按钮或图标""静止状态只保留一个几乎不可见的小点""悬停才显示名称标签""减少动态效果模式下标签与小点直接切换透明度，不执行缩放或循环动画"等原意。

在 §4.2.1 列表末尾追加一条：

```markdown
- 有精灵的可交互物（床头合影、红线日记、钥匙碗、眼镜盒、红伞等）在静止时带轻微缩放呼吸微动（约 ±3.5%、2.4 秒正弦、相位错开），以轮廓微动区别于纯装饰物；无精灵的交互点（出口/门）由热区小点做轻微 alpha 与缩放呼吸（alpha 0.12–0.25、缩放 0.88–1.12）。呼吸仅作可发现性提示，不承担目标引导（仍由 90 秒/150 秒分级提示负责）。秀兰不参与呼吸。减少动态效果模式下两者均关闭，回归"近距 HUD 提示 + 悬停标签"通道。
```

- [ ] **Step 2: 同步 TECHNICAL_DESIGN**

打开 `docs/TECHNICAL_DESIGN.md`，在交互物渲染相关段落（§6 对象属性 `336` 行附近，或 EntityView 表现层描述处）补一小注。在 `可交互物至少包含：` 代码块之后追加段落：

```markdown
### 6.4 交互物表现层

EntityView 作为 Phaser 表现层持有静止呼吸微动：有精灵的道具以约 ±3.5%、2.4 秒正弦缩放呼吸，无精灵的出口由热区小点呼吸。门控由纯函数 `isBreathingActive` 统一管理——仅在标准模式的纯游玩态、无 modal、无对白、未牵手长按时启用；减少动态效果（reducedMotion）下完全关闭，道具复位基准缩放。呼吸状态不写入存档，独立于游戏规则层。
```

> 章节编号 `6.4` 需核对 `TECHNICAL_DESIGN.md` 既有编号顺序；若 `6.4` 已被占用，顺延为下一个可用编号并在 `6.3` 之后。

- [ ] **Step 3: 验证文档完整性**

Run: `npm run format:check`
Expected: 无 Markdown 报错（若有，仅修本次改动的两份文档）。

人工检查：
- Markdown 标题与代码围栏完整；
- README 本地链接未受影响（本任务未改 README）；
- 不存在互相冲突的 ID、路径或技术方案；
- `git status --short` 只包含 `docs/ART_BIBLE.md` 与 `docs/TECHNICAL_DESIGN.md`。

- [ ] **Step 4: 提交**

```bash
git add docs/ART_BIBLE.md docs/TECHNICAL_DESIGN.md
git commit -m "docs: document interactive prop breathing"
```

---

## Self-Review

**1. Spec coverage:**
- §2.1 作用对象（有精灵→scale、出口→dot、秀兰→none）→ Task 2 Step 3 的 `breathKind` 分配 ✓
- §2.2 通道职责与悬停共存 → Task 2 Step 4 的 `!view.hover` 门控 ✓
- §3.1 EntityView 字段（actor/breathBaseScale/breathPhase/breathKind）→ Task 2 Step 1 ✓
- §3.2 纯函数模块与签名 → Task 1 ✓
- §3.3 updateEntityBreathing 早于 early return → Task 2 Step 5（调用位置在 `phase !== 'playing' return` 之前）✓
- §3.4 悬停协调（作用对象不同无冲突）→ Task 2 Step 4 注释 ✓
- §3.5 章节切换重建 → 既有 `buildChapter` 已 `removeAll`，无需任务 ✓（规格 §3.5 已说明）
- §4 降级表各项 → Task 1 `isBreathingActive` 覆盖 modal/对白/ready_to_hold/reducedMotion/非游玩；Task 2 Step 4 的 else 分支覆盖复位 ✓
- §5.1 单测分支 → Task 1 Step 1 ✓
- §5.2 e2e reducedMotion + 截图 → Task 3 ✓
- §5.3 命令 lint/test/build/test:e2e → Task 2 Step 6-7、Task 3 Step 3 ✓
- §6 文档同步 ART_BIBLE + TECHNICAL_DESIGN → Task 4 ✓

**2. Placeholder scan:** Task 3 Step 1 给出了两段代码（带钩子版与降级版），并在决策段明确"采用降级路径"、给出最终简化代码——无 TBD。Task 4 Step 2 的章节编号给了顺延指令，非占位。无其他占位符。

**3. Type consistency:**
- `isBreathingActive(state: Readonly<GameState>)` — Task 1 定义、Task 2 消费，签名一致 ✓
- `computeBreathScale(base, timeSeconds, phaseOffset, periodSeconds?, amplitude?)` — Task 1 定义、Task 2 Step 4 调用 `computeBreathScale(view.breathBaseScale, timeSeconds, view.breathPhase)`（用默认 period/amplitude），一致 ✓
- `computeBreathSine(timeSeconds, phaseOffset, periodSeconds?)` — Task 1 定义、Task 2 Step 4 dot 分支调用 `computeBreathSine(timeSeconds, view.breathPhase)`，一致 ✓
- `EntityView.actor: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null` — Step 1 定义；`createEntity` 中 `actor` 实际类型为 `Sprite | Image | null`（见 `531-548` 行三元：sprite / image / null），兼容 ✓
- `breathKind: 'scale' | 'dot' | 'none'` — Step 1 定义、Step 3 分配、Step 4 判别，字面量一致 ✓
- `breathBaseScale`/`breathPhase` — Step 1 定义、Step 3 赋值、Step 4 使用，一致 ✓

无问题，计划完整。
