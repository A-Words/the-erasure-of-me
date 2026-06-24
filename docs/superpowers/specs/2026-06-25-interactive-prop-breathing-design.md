# 可交互道具呼吸高亮 设计规格

- 日期：2026-06-25
- 状态：已确认，待实现
- 范围：表现层增强，仅 `src/phaser/scenes/GameScene.ts` 与新增纯函数模块；不写入游戏状态或存档

## 1. 背景与目标

当前每个可交互实体的静止状态只有一个半径约 6 逻辑像素、alpha 0 的小点（`marker`），悬停时才显形。玩家反馈"不知道场景里哪些东西能交互"——任务焦点不清。

目标：给可交互道具加**轻微的呼吸高亮**，让玩家在静止时也能发现可交互物，且不破坏现有美术规范与无障碍降级。

### 决策记录

- **作用范围**：全部可交互道具常驻呼吸（不限于当前目标相关道具）。呼吸只表达"这东西能交互"，不暗示"该去找哪一个"，因此与现有 90 秒/150 秒分级目标提示不冲突。
- **视觉形式（方案 A）**：走 ART_BIBLE §4.2 背书的"微动"通道——有精灵的道具本体做轻微缩放呼吸，无精灵的交互点（出口）由热区小点呼吸。不新增发光 UI，避免与"可交互物不能只靠发光""每章最多一个强暖色焦点""不显示常驻大圆按钮或图标"冲突。

## 2. 范围

### 2.1 作用对象

`isEntityAvailable(state, id)` 为真且 `container.visible` 的实体：

- 有精灵的道具：床头合影 `entity.home.bedside_photo`、红线日记 `entity.home.journal`、蓝色钥匙碗 `entity.home.key_bowl`、眼镜盒 `entity.home.glasses_case`、红伞（雨站）→ **道具本体缩放呼吸**。
- 无精灵的交互点：出口/门区域 → 现有半径 6 小点做 alpha+缩放呼吸。
- **秀兰 `entity.ending.xiulan` 不参与**：她已有 reach_hand 动画，且尾声焦点由牵手长按承担。

### 2.2 通道职责

| 通道 | 触发 | 职责 |
| --- | --- | --- |
| 呼吸微动（新增） | 静止、可交互、标准模式 | 可发现性：哪些东西能交互 |
| 小点 marker（现有） | 悬停/聚焦 | 交互锚点 |
| 标签 label（现有） | 悬停/聚焦 | 对象名称 |
| 下中 HUD 提示（现有） | 近距 | 纯键盘路径的可交互信息 |
| 90s/150s 分级提示（现有） | 无进展 | 目标引导 |

呼吸与悬停共存：静止时道具呼吸、小点几乎不可见；悬停时该道具停止呼吸（回到基准缩放），小点+标签升起。

## 3. 实现

### 3.1 数据结构

`EntityView` 增加（均为表现层、不入存档）：

- `actor: Phaser.GameObjects.Image | Sprite | null` —— 目前 `createEntity` 中是局部变量，改为存入引用。
- `breathBaseScale: number` —— 创建时捕获 `actor.scaleX`，作为呼吸基准。
- `breathPhase: number` —— 按创建序号 `index * 0.6`（秒）稳定错相，避免所有道具同步。
- `breathKind: 'scale' | 'dot' | 'none'` —— `scale`：有精灵的道具；`dot`：无精灵出口；`none`：秀兰。

### 3.2 新增纯函数模块 `src/game/presentation/breathing.ts`

不依赖 Phaser，便于单测：

```ts
export function isBreathingActive(state: Readonly<GameState>): boolean {
  return (
    state.phase === 'playing' &&
    !state.modal &&
    state.dialogue.length === 0 &&
    !state.flags.includes('ending.ready_to_hold') &&
    !state.settings.reducedMotion
  );
}

export function computeBreathScale(
  base: number,
  timeSeconds: number,
  phaseOffset: number,
  periodSeconds = 2.4,
  amplitude = 0.035,
): number {
  const t = (timeSeconds + phaseOffset) / periodSeconds;
  // 正弦呼吸：0 -> +amp -> 0 -> -amp -> 0
  return base + Math.sin(t * Math.PI * 2) * amplitude;
}
```

### 3.3 渲染更新 `GameScene.update`

新增 `updateEntityBreathing(state, timeMs)`，从 `update()` 每帧调用，**早于** `phase !== 'playing'` 的 early return（使非游玩态也能把道具复位回基准缩放、小点归零）。

逻辑（`s` 为本帧共享正弦值，`s = Math.sin((timeSeconds + phase) / period * 2π)`，取值 -1..1）：

```text
active = isBreathingActive(state)
for view in entityViews:
  if !view.container.visible: continue          // 不可见实体跳过
  if view.breathKind == 'none': continue        // 秀兰

  if view.breathKind == 'scale':
    actor = view.actor
    if actor == null: continue
    if active && !view.hover:
      actor.setScale(view.breathBaseScale + s * 0.035)   // ±3.5%
    else:
      actor.setScale(view.breathBaseScale)               // reducedMotion / 悬停 / 非游玩：停回基准

  if view.breathKind == 'dot':
    if active && !view.hover:
      view.marker.setScale(1 + s * 0.12).setAlpha(0.12 + (s + 1) * 0.065)  // scale 0.88..1.12, alpha 0.12..0.25
    else:
      view.marker.setScale(1).setAlpha(0)               // reducedMotion 静止时小点不可见
```

> 注：上为逻辑说明，实际 `computeBreathScale` 复用同一正弦；alpha 由 `(s+1)/2` 映射到 0.12..0.25，与缩放同相位。

### 3.4 悬停交互

`setEntityHover` 现有逻辑不变。呼吸与悬停通过 `view.hover` 协调：悬停时 `updateEntityBreathing` 把道具停回基准缩放、小点归零，随后 `setEntityHover` 升起小点+标签。两者作用对象（actor vs marker）不同，无 tween 冲突。

### 3.5 章节切换

`buildChapter` 已 `children.removeAll(true)` 并重建 `entityViews`，基准缩放与相位随之重建，无需额外清理。

## 4. 降级与边界

| 条件 | 行为 |
| --- | --- |
| `reducedMotion` 开启 | 完全关闭呼吸：道具静止在基准缩放、小点维持 alpha 0。呼吸是标准模式增强；低扰动用户继续依赖现有"近距 HUD 提示 + 悬停标签"通道。符合 ART_BIBLE §4.2.1"不执行缩放或循环动画"。 |
| modal 打开 / 对白进行中 | 停止呼吸，道具复位基准。 |
| `ending.ready_to_hold` 持有 | 牵手长按时全停。 |
| 道具被拾取 | 下一 tick `isEntityAvailable` 为假 → 不可见 → 跳过。 |
| 玩家拾取动作中 | 不受影响（呼吸作用于道具，拾取作用于玩家角色）。 |
| 非游玩态（过场等） | 道具复位基准、小点归零。 |

## 5. 测试

### 5.1 单元测试 `tests/unit/breathing.test.ts`

覆盖 `isBreathingActive` 各分支（确定性、无 Phaser）：

- `phase === 'playing'` 且无 modal/对白/ready_to_hold/reducedMotion → 真；
- modal 打开 → 假；
- 对白非空 → 假；
- `ending.ready_to_hold` 在 flags → 假；
- `reducedMotion` 开启 → 假；
- `phase !== 'playing'` → 假。

`computeBreathScale` 边界：相位 0 时等于 `base`；半周期时等于 `base + amplitude`。

### 5.2 浏览器端到端

- 在 `accessibility.spec.ts` 增一条：reducedMotion 开启时道具缩放应停在基准（确定性断言，不依赖动画相位）。
- 对标准模式截一张代表性截图供人工复核（AGENTS.md 要求 Canvas 变化检查代表性截图）。
- **不**对标准模式呼吸相位做像素级断言（会 flaky）。

### 5.3 命令

```bash
npm run lint && npm run test && npm run build && npm run test:e2e
```

## 6. 文档同步

- **ART_BIBLE §4.2.1**（必改）：补一句——有精灵的可交互物在静止时带轻微缩放呼吸微动以区别装饰物；无精灵的交互点（出口）由热区小点轻微呼吸；减少动态效果模式下两者均关闭。保留"不显示常驻大圆按钮或图标""静止状态只保留一个几乎不可见的小点""悬停才显示名称标签"原意。
- **TECHNICAL_DESIGN**（小注）：在交互物渲染处补一句 EntityView 表现层含静止呼吸微动，reducedMotion 下降级。
- **GDD §7.2 / LEVEL_DESIGN 提示升级表**：不动。呼吸是常驻可发现性通道，与 90s/150s 分级目标提示职责不同，不冲突。

## 7. 不在本规格范围

- 不改色板、不新增资产、不加后处理光效。
- 不改退化曲线、不谜题化呼吸。
- 不写存档字段，不推断玩家认知健康。
- 不改秀兰尾声表现与牵手长按逻辑。
