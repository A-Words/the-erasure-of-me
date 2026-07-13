# 《记忆的缝隙》技术设计文档

> 版本：v0.1
> 状态：开发基线
> 技术栈：Phaser 3 + TypeScript + Vite
> 包管理器：npm
> 对应 GDD：v0.1

## 1. 目标与约束

### 1.1 技术目标

1. 在普通 PC 浏览器中稳定运行 20–30 分钟的完整垂直切片。
2. 让游戏状态、退化规则和谜题逻辑可独立测试，不依赖 Phaser 精灵生命周期。
3. 让标准输入、D3 方向错位和低扰动模式共享同一套语义动作接口。
4. 保证键盘、静音、色觉差异和减少动态效果条件下可通关。
5. 支持按章加载资产、自动存档和静态站点部署。

### 1.2 非目标

- 不引入 React、Vue 或其他 UI 框架。
- 不实现账号、云存档、服务端、多人、排行榜和支付。
- 不实现物理引擎、战斗 ECS 或通用关卡编辑器。
- 不把 Phaser Scene、Sprite、Tween、Camera 或 DOM 节点写入存档。
- 不为原型开发自定义 WebGL 着色器；退化效果优先使用纹理、遮罩和轻量后处理。

## 2. 核心技术决策

| 决策 | 采用方案 | 原因 |
| --- | --- | --- |
| 渲染与场景 | Phaser 3 + Canvas Renderer | 适合 2D 俯视探索、Tilemap、相机与音频；垂直切片不依赖 WebGL，避免低端设备与无头浏览器的帧缓冲差异 |
| 语言 | TypeScript 严格模式 | 约束内容数据、存档和阶段配置 |
| 构建 | Vite | 快速开发、静态构建、按需导入 |
| UI | 原生 DOM + CSS | 字幕、设置和科普页需要可访问性与响应式 |
| 地图 | Tiled JSON | 可视化编辑碰撞、触发器和对象属性 |
| 状态 | 自研轻量 GameStore | 体量小，避免框架状态与 Phaser 生命周期耦合 |
| 单元测试 | Vitest | 与 Vite/TypeScript 配合直接 |
| 浏览器测试 | Playwright | 验证启动、键盘、暂停、存档和视觉状态 |
| 存档 | localStorage | 单机静态部署足够，易于版本迁移 |
| 部署 | 静态站点 | 无服务端依赖，可部署至常见静态托管 |

依赖版本在工程初始化时选用当时稳定版本，并由 package-lock.json 锁定；文档不硬编码会快速过期的补丁版本。

## 3. 架构边界

### 3.1 目录结构

~~~text
src/
  main.ts
  game/
    state/
      GameState.ts
      GameStore.ts
      initialState.ts
    systems/
      ChapterSystem.ts
      MovementSystem.ts
      InteractionSystem.ts
      InventorySystem.ts
      PuzzleSystem.ts
      DegradationSystem.ts
      HintSystem.ts
      NarrativeSystem.ts
      SaveSystem.ts
    rules/
      movementRules.ts
      puzzleRules.ts
      progressionRules.ts
    content/
      chapters/
      dialogues/
      items/
      puzzles/
      maps/
    input/
      actions.ts
      bindings.ts
      InputMapper.ts
    presentation/
      presentationEvents.ts
    assets/
      manifest.ts
      assetTypes.ts
  phaser/
    config.ts
    scenes/
      BootScene.ts
      MenuScene.ts
      GameScene.ts
      EndingScene.ts
    bridge/
      SceneBridge.ts
    presentation/
      PresentationDirector.ts
    view/
      actors/
      interactables/
      camera/
      effects/
      tilemaps/
      audio/
  ui/
    AppShell.ts
    hud/
    panels/
    subtitles/
    settings/
    guide/
  accessibility/
    AccessibilitySettings.ts
    visualCues.ts
  save/
    SaveRepository.ts
    migrations.ts
  telemetry/
    Telemetry.ts
public/
  assets/
    characters/
    environment/
    props/
    ui/
    fx/
    audio/
    data/
assets-source/
  tiled/
  art/
  audio/
tests/
  unit/
  integration/
  e2e/
~~~

### 3.2 依赖方向

~~~mermaid
flowchart LR
    Input["物理输入"] --> Mapper["InputMapper"]
    Mapper --> App["Application / Systems"]
    Content["Content Data"] --> App
    App --> Store["GameStore"]
    Store --> Bridge["SceneBridge"]
    Store --> UI["DOM UI"]
    Bridge --> Phaser["Phaser View"]
    Store --> Save["SaveRepository"]
~~~

约束：

- game/state、game/systems 和 game/rules 不得导入 Phaser。
- phaser 层只能通过 SceneBridge 读取快照或发送 InputAction。
- ui 层只能订阅 GameStore 并派发应用命令，不能直接访问 Phaser Sprite。
- 内容数据只保存业务 ID，不保存具体文件路径。
- SaveRepository 只接收纯数据快照。

### 3.3 GameStore

GameStore 是唯一运行时真值源，提供：

- getState：返回只读快照；
- dispatch：接收语义化命令；
- subscribe：通知 Phaser 更新完整游戏快照；
- subscribeSelector：只在选定字段变化时通知 DOM UI；
- replaceFromSave：经迁移与校验后恢复状态。

更新采用同步、确定性 reducer 或系统函数。动画完成只负责发送“表现结束”事件，不决定谜题真值。

~~~ts
interface GameState {
  schemaVersion: 1;
  mode: 'standard' | 'low_stimulation';
  chapterId: ChapterId;
  checkpointId: string;
  degradationStage: 'D0' | 'D1' | 'D2' | 'D3' | 'D4';
  player: PlayerState;
  inventory: InventoryState;
  journal: JournalState;
  puzzles: Record<string, PuzzleState>;
  hints: Record<string, HintState>;
  narrative: NarrativeState;
  settings: AccessibilitySettings;
  playTimeSeconds: number;
}
~~~

## 4. 启动与场景

### 4.1 启动流程

~~~mermaid
stateDiagram-v2
    [*] --> Boot
    Boot --> Menu: 核心资源与设置加载完成
    Menu --> Game: 新游戏或继续
    Game --> Game: 章节与检查点切换
    Game --> Ending: 第四章完成
    Ending --> Guide: 牵手演出结束
    Guide --> Menu: 重新开始或返回标题
~~~

### 4.2 Scene 职责

#### BootScene

- 加载最小启动资源、字体清单和资产 manifest；
- 初始化 GameStore、SaveRepository、AudioManager；
- 检查 WebGL/Canvas 能力并给出可理解的错误页面；
- 不展示剧情。

#### MenuScene

- 只提供标题背景与轻量环境动画；
- 主菜单本体由 DOM 呈现；
- 新游戏、继续、设置和内容提示通过应用命令进入 GameStore。

#### GameScene

- 挂载当前 Tilemap、角色、相机、音频和表现层；
- 以章节背景资产表现正式环境候选，Tiled 对象层继续作为出生点、交互物和稳定 ID 的权威来源；
- 交互物以环境资产中的物件轮廓为视觉主体；Scene 只挂载透明热区、悬停标签和极弱的小点反馈，不创建常驻圆形按钮；
- 住宅建筑壳层与家具分离：背景只绘制地板、墙体、洞口和固定光照，静态家具通过 manifest key 与场景坐标表组合，交互家具继续绑定稳定实体 ID；住宅壳层采用正交墙体平面，主要墙体、门洞和通道边界在画布平面上保持水平或垂直，仅用墙体立面、墙顶厚度和接触阴影表现轻微俯视；家具和小型交互物可采用符合摆放关系的自然角度，但不得出现互相冲突的落地面，也不得依赖发光或闪烁建立识别；入户门固定在右侧边；
- 指针点击与确认键共用近距离交互入口，Scene 只发送实体 ID，不在表现层判断交互结果；
- 将 Phaser 键盘输入送入 InputMapper；
- 读取 GameStore 快照更新角色、物件、特效和声音；
- Shared Life 通过同一 `visual_props` actor 在槽位 frame 与归位物件 frame 之间切换；领域层 `puzzle.life.photo_order.completed` 与 `placedObjects` 仍是唯一真值。三个年代薄雾先随照片排序完成整体收束，再随对应物件归位局部收束；三件全部归位后淡入 `environment.life.resolved` 当代客厅印象。所有淡变只属于 View，不参与碰撞或答案判断；场景不绘制年份牌，准确年份只由照片面板的 DOM 可控文字显示。
- `PresentationDirector` 统一承载“静静留意”、有效进展的短场景回应、第四章状态线索与章节入场氛围；它只读取快照和纯派生结果，销毁章节时清理全部 Graphics、Tween 与临时对象，不持有可存档真值。
- Scene 或 Game 进入销毁阶段后忽略迟到的状态通知；动画注册表尚不可用时显示同方向静态首帧，避免刷新恢复与页面卸载竞态；
- 不直接判断谜题完成、提示等级或存档条件。

#### EndingScene

- 负责尾声固定构图、林秀兰入场、长按牵手表现；
- 牵手命令仍由 GameStore 判断；
- 演出完成后激活 DOM 科普页。

### 4.3 SceneBridge

SceneBridge 是 Phaser 和领域层之间的唯一桥：

~~~ts
interface SceneBridge {
  getSnapshot(): Readonly<GameState>;
  send(action: InputAction): void;
  interact(targetId: string): void;
  notifyViewReady(viewId: string): void;
  subscribe(listener: (state: Readonly<GameState>) => void): () => void;
}
~~~

## 5. 输入架构

### 5.1 语义动作

~~~ts
type InputAction =
  | 'move_up'
  | 'move_down'
  | 'move_left'
  | 'move_right'
  | 'observe'
  | 'interact'
  | 'cancel'
  | 'open_inventory'
  | 'open_journal'
  | 'open_map'
  | 'pause';
~~~

### 5.2 映射层

输入依次经过：

1. PhysicalBinding：WASD、方向键、E、Enter 等物理键；
2. ModalGate：DOM 面板打开时阻断角色动作；
   原生按钮、输入框、下拉框和链接的 keydown/keyup 在 DOM 层停止冒泡，避免 Phaser 捕获 Enter、Space 和方向键；
3. AccessibilityOverride：低扰动模式覆盖 D3；
4. DegradationTransform：标准模式 D3 旋转移动动作；
5. ActionDispatcher：把 InputAction 送入系统。

暂停、取消和 DOM 菜单导航永远绕过 DegradationTransform。

### 5.3 移动

- 采用八方向动画中的四方向逻辑，不允许斜向移动。
- 角色速度为每秒 180 逻辑像素，低扰动模式不改变速度。
- `src/game/content/homeLayout.ts` 保存住宅统一视觉尺寸、家具脚印、墙体障碍、步行边界和排序线；Phaser Scene 引用 `homeVisualSizes`，不再为同一物件维护第二套显示尺寸。Tiled `collision` 对象层保持同一份家具脚印作者数据，后续 Content Loader 可由其生成纯数据 CollisionMap。
- MovementSystem 使用与 Phaser 无关的 `moveWithCollisions`，根据 CollisionMap、角色脚部碰撞体和当前 InputAction 分轴计算最终位置；阻挡大步长穿透，同时允许沿家具边缘滑动。
- Phaser Sprite 只跟随最终位置，不参与碰撞判定；本项目不启用 Arcade Physics 作为玩法真值。
- 住宅表现按脚底/家具底座 Y 值动态排序；交互小物继承承载家具的排序线。`environment.home.sunlight_overlay` 以低深度覆盖背景但位于家具下方；`crosswall_overlay` 与 `frontwall_overlay` 从背景像素机械提取，分别按中墙、前墙与左下竖墙段排序线重绘。背景、光照 overlay、非交互装饰、家具、建筑遮挡 overlay、人物与交互物均是可分别销毁的视图对象，不进入存档状态；住宅人物可使用纯视图缩放，但脚部可见像素必须与领域碰撞体底边对齐，领域坐标和碰撞体本身不随缩放改变。
- `entity.home.front_door` 是位于右下玄关门内侧 `(1225, 560)` 的纯交互 hotspot，不绑定家具 atlas frame；门洞、门框和门槛属于背景建筑结构。住宅角色不需要走进右墙门洞，右侧外墙和门框由碰撞矩形封闭，玩家在室内侧靠近 hotspot 即可触发开门对白和章节切换。只有未来出现可见开关门演出时才新增独立门板 sprite。
- 每次位置更新写入领域层坐标；DOM UI 通过纯选择器把坐标映射为“当前最近可用实体 ID”，仅在该 ID 变化时重绘情境交互提示。
- 按键释放或当前帧没有移动动作时，SceneBridge 发送 `STOP_MOVING`；领域层保留最后朝向并清除 `player.moving`，精灵只据此切回对应方向锚点帧。
- 恢复存档时先校验坐标是否落在当前导航区域。

### 5.4 长按交互

尾声牵手需要连续按住任一确认键 1.5 秒：

- keydown 开始计时；
- keyup、浏览器失焦或暂停立即取消；
- 进度属于领域状态，动画只读取进度；
- 长按进行中隐藏可见按键提示与通用进度条，Phaser 仅在秀兰开放掌心位置显示暖色反馈；DOM 保留视觉隐藏的 `progressbar` 供辅助技术读取；
- 减少动态效果模式以静态暖色渐变替代粒子；
- 长按阈值在无障碍设置中可改为 0.6 秒或单次确认。

## 6. Tilemap 与关卡数据

### 6.1 基本规格

- 编辑器：Tiled；
- 网格：64×64 逻辑像素；
- 地图格式：JSON；
- 相机设计分辨率：1280×720；
- 角色基准帧：64×96；
- 坐标原点：地图左上角；
- 所有实体锚点：底部中心。

### 6.2 图层规范

每张地图固定包含：

| 图层 | 类型 | 用途 |
| --- | --- | --- |
| background | Image Layer | 编辑参照：环境背景图，不参与运行时渲染 |
| visual_decor | Object Layer | 非交互装饰的 Tiled 可视化位置，已可作为运行时视觉数据 |
| visual_furniture | Object Layer | 家具摆放位置、图集帧、尺寸、排序和碰撞绑定，已可作为运行时视觉数据 |
| visual_props | Object Layer | 交互道具视觉位置、尺寸、排序和实体绑定，已可作为运行时视觉数据 |
| ground | Tile Layer | 地面 |
| floor_detail | Tile Layer | 地毯、水渍、裂纹 |
| walls_low | Tile Layer | 角色可被遮挡前的低墙 |
| objects_back | Tile/Object | 角色后方家具 |
| collision | Object Layer | 碰撞矩形或多边形 |
| navigation | Object Layer | 合法出生区与存档恢复区 |
| interactables | Object Layer | 可观察、拾取或使用的物件 |
| triggers | Object Layer | 退化、对白、检查点和过场触发 |
| exits | Object Layer | 房间/章节出口 |
| camera_zones | Object Layer | 房间式相机边界 |
| audio_zones | Object Layer | 环境声与声源 |
| objects_front | Tile/Object | 角色前景遮挡 |

#### 6.2.1 编辑参照层（visual_*）

`background` 是仅供 Tiled 编辑器可视化参照的图层，运行时背景仍由 asset manifest 加载。`visual_furniture`、`visual_decor` 和 `visual_props` 既承担 Tiled 编辑器中的可视化参照，也经 `tiledMapLoader` 转换为纯 `VisualPlacement[]` 供 Phaser View 渲染；这些视觉数据不进入存档，也不决定谜题真值。

- `visual_*` 层中的 tile 对象使用 Tiled tile object 的左下角坐标；适配层会转换为 Phaser Image 需要的中心坐标，使关卡作者在 Tiled 中看到的布局与游戏画面一致。
- 每个 `visual_*` 层和层内对象都带 `visual_reference=true` 自定义属性，用于与逻辑层区分。
- `visual_*` 层的对象名称以 `visual.` 前缀开头，不与 `interactables`、`collision`、`navigation` 等逻辑层的稳定 ID 冲突。
- `visual_props` 用 `entityId` 显式绑定 `interactables` 中的实体；`visual_furniture` 用 `collisionId` 显式绑定 `collision` 中的脚印矩形。
- 运行时通过 `src/game/content/tiledMapLoader.ts` 适配层解析 Tiled JSON；`scripts/validate_tiled_maps.mjs` 校验这些层存在、引用图片存在、稳定 ID 无重复且 `entityId` / `collisionId` 指向真实对象。

Rain Station 的环境表现拆为底图、地面积水反光层和雨线层：Tiled `background` 仍只指向底图编辑参照，GameScene 在运行时从 manifest 叠加 `environment.rain.puddle_reflection_overlay` 与 `environment.rain.rain_overlay`，再渲染 `visual_props`。雨线使用两张普通 Image 上下衔接，按累计时间进行帧率无关的下落循环；减少动态效果时只保留一张静态雨线并降低透明度。天气叠层不改变坐标、碰撞、谜题状态或 Tiled tile object 锚点。

#### 6.2.2 Tiled 内容适配层（tiledMapLoader）

`src/game/content/tiledMapLoader.ts` 是 Tiled JSON 与游戏领域层之间的唯一适配层。Phaser Scene 和游戏系统不直接解释 Tiled 对象，而是通过适配层输出的纯 TypeScript 数据结构获取运行时数据。

**职责：**

- 启动或切章时读取已加载的 Tiled JSON；GameScene 只写入 Phaser JSON cache，不再为未使用的 Tilemap cache 重复请求同一文件；GameStore 的碰撞提供器使用启动时从 `/assets/data/map.home.json` fetch 的纯 JSON；
- Phaser Loader 的 `maxParallelDownloads` 固定为 6，避免正式章节图片与 Tiled JSON 同时加载时压满旧浏览器连接；DOM 可先于 Canvas 出现，交互与测试必须等待场景就绪；这项限制不替代 macOS Safari 实机门槛；
- 将 `interactables` 对象层转换为 `WorldEntity[]`（坐标、kind、label）；
- 将 `collision` 对象层转换为 `NamedCollisionRect[]`（纯 `AxisAlignedRect`）；
- 将 `visual_furniture`、`visual_decor`、`visual_props` 对象层转换为 `VisualPlacement[]`（assetKey、frame、x/y、size、sortY、collisionId、entityId）；
- 将 `navigation` 对象层转换为 `SpawnPoint[]` 和 `MovementBounds`；
- 检测重复稳定 ID 并抛出明确错误。

**迁移状态（第二阶段）：**

| 数据 | Tiled 驱动 | 代码 fallback |
| --- | --- | --- |
| 家具视觉位置/帧/尺寸 | `visual_furniture` 层 | `homeLayout.ts:homeFurnitureLayout` |
| 装饰视觉位置/帧/尺寸 | `visual_decor` 层 | `homeLayout.ts:homeDecorLayout` |
| 道具视觉位置/尺寸 | `visual_props` 层（通过 entityId 绑定实体） | `maps.ts:chapterMaps.home.entities` |
| 交互物坐标/kind | `interactables` 层 | `maps.ts:chapterMaps.home.entities` |
| 实体深度排序 sortY | `visual_props` 层 sortY 属性 | `homeLayout.ts:homeEntitySortY` |
| 碰撞矩形 | `collision` 层 → `TiledCollisionProvider` | `homeLayout.ts:homeCollisionObstacles`（`CodeCollisionProvider` 测试 fallback） |
| 行走边界 | `navigation` 层 → `TiledCollisionProvider` | `homeLayout.ts:homeWalkBounds`（`CodeCollisionProvider` 测试 fallback） |
| 建筑遮挡 overlay | 代码常量 | `homeLayout.ts:homeArchitectureOverlays` |
| 角色缩放 | 代码常量 | `homeLayout.ts:homeVisualSizes.characterScale` |
| 道具视觉映射 | 代码常量 | `GameScene.ts:homePropVisuals` |

GameScene 优先使用 Tiled 适配层数据；如果 Tiled JSON 缺少 visual_\* 层或解析失败，自动回退到 `homeLayout.ts` 代码常量，不会白屏。GameStore 通过纯数据依赖注入接收碰撞数据：`main.ts` 在启动时 fetch 全部 5 张地图 JSON，通过 `TiledCollisionProvider` 解析为 `AxisAlignedRect[]` 和 `MovementBounds`，注入 GameStore 构造函数。GameStore 不再直接导入 `homeLayout.ts` 的碰撞常量；`CodeCollisionProvider` 作为测试 fallback 仍使用代码常量。

**5 张地图迁移状态：**

| 地图 | background | visual_props | visual_furniture | visual_decor | collision | navigation |
| --- | --- | --- | --- | --- | --- | --- |
| map.home | ✓ | ✓ (entityId) | ✓ (collisionId) | ✓ | ✓ Tiled 驱动 | ✓ Tiled 驱动 |
| map.rain_station | ✓ v02 + overlays | ✓ (entityId, 正式 prop tileset) | — | — | ✓ Tiled 驱动 | ✓ Tiled 驱动 |
| map.shared_life | ✓ v02 | ✓ (entityId, v02 props atlas；exit 由背景表现) | — | — | ✓ Tiled 驱动 | ✓ Tiled 驱动 |
| map.return_corridor | ✓ v02 | ✓ (entityId, placeholder) | — | — | ✓ Tiled 驱动 | ✓ Tiled 驱动 |
| map.home_ending | ✓ v02 | ✓ (entityId, actor-bound) | — | — | ✓ Tiled 驱动 | ✓ Tiled 驱动 |

五张正式地图的运行时碰撞均以 `chapterMaps` 的 1280×720 逻辑画布为准。单屏章节的 `navigation` 不使用 Tiled 文档的格网像素尺寸推导边界；雨站额外阻挡站房、候车亭、钟表铺、后景和临水站台边缘，回家长廊阻挡十字路口四角墙体，尾声阻挡隔墙与家具脚印。交互物可以位于实体物件表面，但其 125 像素交互环必须与可行走区域相交。

开发环境以 `?debug=1` 启动时，GameScene 会把 Tiled `navigation` 画成绿色边框，并把稳定 ID 对应的 `collision` 矩形画成半透明红色调试层。该层只读取已经解析的纯数据，不修改 GameStore、角色位置、碰撞结果或存档，生产构建不会启用。

非 home 地图中，rain_station 已为车票、2/4/5 石板、红伞招牌和钟表铺前红伞分配正式 tileset，其中钟表铺前红伞继续使用 `prop_red_umbrella_closed`；Shared Life 的照片、空相册、三件生活物件和三处放置槽使用 v02 `prop_life_shared_life_atlas` tileset。`entity.life.exit` 的正式走廊已经绘入 v02 背景，地图中只保留逻辑 `interactables` hotspot，不再创建无图像 visual_props。return_corridor 与 home_ending 使用 v02 章节背景，路线、出生点、检查点和交互对象数据未随换景改变；碰撞对象则按正式 1280×720 背景补齐实体墙和家具脚印。return_corridor 的无 gid visual_props placeholder 仍按本节规则保留；home_ending 的秀兰对象标记为 `actor-bound`，正式动画由 Scene 在运行时绑定。

`environment.return.background` 只绘制复用家、雨站和共同生活材质的空十字空间，不烘焙方向答案。`resolveReturnPresentation()` 从 `returnJunction`、`returnPrefix`、`routeLoops`、`hintLevel` 纯派生当前世界方向、线索类型、强度和脚印可见性：路口一使用地面箭头；路口二先用地面箭头、再用伞影；路口三使用哼唱波纹；完成三路口后才显示上方家门。提示脚印仅在错路至少两次或提示等级至少二级时出现。红伞线索只读取当前正确世界方向，不能由装饰层指向错误出口。

**Placeholder 对象规范：**

没有 gid 的 visual_props 对象必须携带以下属性：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| `placeholder` | `true` | 标记为占位对象 |
| `status` | `visual-placeholder` | 统一状态标识 |
| `replacement` | 非空字符串 | 后续应替换的正式视觉资产说明 |
| `entityId` | 非空字符串 | 必须指向 interactables 层的真实实体 |
| `size` | 整数 | 显示尺寸 |
| `sortY` | 整数 | 深度排序线 |
| `visual_reference` | `true` | 编辑参照层标记 |

有 gid 的正式 tile object 不得标记 `placeholder=true`。`scripts/validate_tiled_maps.mjs` Check 7 强制校验上述规则。后续替换 placeholder 为正式资产时，只需在 Tiled 中为对象分配 gid 并移除 placeholder/status/replacement 属性即可。

若无 gid 对象由运行时动画资产提供正式视觉，可使用 `status=actor-bound`；此时必须有指向真实 interactable 的 `entityId`，且不得再携带 placeholder/replacement。校验脚本将 actor-bound 与未完成占位对象分开验证。

**运行时冒烟测试：**

`tests/e2e/tiled-maps.spec.ts` 提供 5 张地图的运行时冒烟覆盖，验证 Tiled JSON → `tiledMapLoader` → GameScene 整条管线在生产构建中不会白屏或抛出控制台错误。测试通过 localStorage 存档注入跳转到各章节（生产构建不含调试面板），检查 canvas 可见、`data-chapter` 属性匹配、玩家坐标在地图边界内。连续章节跳转测试验证存档→重载循环不会破坏游戏状态。

### 6.3 对象属性

可交互物至少包含：

~~~ts
interface TiledInteractableProperties {
  entityId: string;
  interactionType: 'inspect' | 'pickup' | 'place' | 'door' | 'puzzle';
  contentId: string;
  requiredItemId?: string;
  completedFlag?: string;
  highlightStyle: 'outline' | 'motion' | 'reflection';
}
~~~

触发器至少包含 triggerId、triggerType、once、conditionId、commandId。关卡逻辑只认这些稳定 ID。

### 6.4 相机

- 使用房间式柔性跟随，默认 deadzone 为视口宽高的 18%；
- camera_zones 限制镜头不展示地图外空白；
- 进入新房间时 300 毫秒缓动至新边界；
- 减少动态效果模式改为 100 毫秒淡入，不使用位移缓动；
- 所有退化镜头效果不得改变碰撞、角色坐标和输入采样。

### 6.5 交互物与“静静留意”表现层

EntityView 作为 Phaser 表现层持有静止呼吸微动：有精灵的道具以约 ±3.5%、2.4 秒正弦缩放呼吸，无精灵的出口由热区小点呼吸。门控由纯函数 `isBreathingActive` 统一管理——仅在标准模式的纯游玩态、无 modal、无对白、未牵手长按时启用；减少动态效果（reducedMotion）下完全关闭，道具复位基准缩放。呼吸状态不写入存档，独立于游戏规则层。

Shift 触发的 `observe` 在产品文案中称为“静静留意”。`PresentationDirector` 只接收角色位置、当前可见实体和只读 `GameState`：把 192 像素近距之外的画面噪声压低，并加强范围内当前已经可见的实体轮廓或章节线索。该层不分派领域命令、不改变 `hintLevel`、不补出未解锁实体，也不读取答案来替玩家选择目标；松开 Shift、开始移动、打开 modal/对白或离开纯游玩态时立即结束，因此通关不依赖观察。标准模式使用克制的扩散圆和角色注意动画；`reducedMotion` 固定显示 192 像素静态边界、静态轮廓与注意姿态，不运行循环 Tween。

## 7. 谜题系统

### 7.1 数据驱动

~~~ts
interface PuzzleDefinition {
  id: string;
  chapterId: ChapterId;
  type: 'sequence' | 'ordering' | 'placement' | 'route';
  checkpointId: string;
  successCommandIds: string[];
  resetPolicy: 'local' | 'checkpoint';
  hintScheduleSeconds: [number, number, number];
}
~~~

PuzzleSystem 处理输入和状态；Phaser View 根据 puzzle.type 选择表现适配器。不得在 Scene 中以硬编码坐标判断答案。

### 7.2 提示计时

- 只统计谜题处于 active 且玩家可控制角色的时间；
- 打开菜单、日记、背包或浏览器失焦时暂停；
- 有效进展后重置当前提示计时，但不降低已解锁的提示等级；
- 提示显示可以关闭，关键冗余线索不能关闭。

### 7.3 有效进展回应

`src/game/presentation/presentationEvents.ts` 把只读 `GameState` 归一化为表现快照，再对相邻快照做纯增量比较。首个快照只建立基线，不补播历史事件；退回错误前缀、读取存档或同值重复通知不产生回应。当前有效进展包括雨站 2→4→5 的每一步和两个伞路标、Shared Life 的每件物品归位、第四章正确前缀与每个路口完成、新增记忆片段，以及尾声牵手完成。

每个事件同时驱动两个互不作为玩法真值的输出：

- `PresentationDirector` 在对应世界位置播放 0.6–1.2 秒的局部场景回应；普通进展约 0.6–0.7 秒，路口完成、记忆片段或牵手等较大节点可延长到约 0.9–1.2 秒。`reducedMotion` 改用保持 600 毫秒的静态轮廓，不做扩散或碎片位移；
- `AudioManager` 播放最多三音的低音/钟音语义锚点，服从静音与总线音量。进展事件与普通提示消息同次出现时，跳过 `soft_feedback`，避免叠音。

回应不写入存档，不增加分数、评级、连击或“记忆恢复”状态；它只承认刚发生的有效状态增量。后续新增有效进展类型时，必须同时补齐纯快照差分、场景落点、三音语义 cue 与单元测试。

### 7.4 路线回环

第四章错误出口不是地图传送失败：

1. RouteSystem 判定出口与目标不符；
2. 播放三秒熟悉房间片段；
3. 在当前路口安全点恢复位置；
4. 增加 routeLoopCount；
5. HintSystem 按次数增强线索。

## 8. 退化系统

DegradationSystem 只改变信息表现和移动动作映射，不修改谜题答案或安全 UI。

~~~ts
interface DegradationConfig {
  id: 'D0' | 'D1' | 'D2' | 'D3' | 'D4';
  mapMode: 'full' | 'washed' | 'hidden';
  itemLabelMode: 'full' | 'fragmented' | 'hidden';
  promptMode: 'full' | 'unstable' | 'hidden';
  movementTransform: 'identity' | 'rotate_clockwise_90';
  effectPresetId: string;
  fallbackCueIds: string[];
}
~~~

约束：

- 阶段切换只能由一次性 trigger 或章节入口命令触发；
- 配置不使用随机数；
- D3 映射变化前必须完成安全演示；
- 低扰动模式强制 movementTransform 为 identity；
- D4 隐藏游戏 HUD，但保留系统层、焦点与字幕能力。

## 9. DOM UI

### 9.1 层级

~~~text
#app
  #game-canvas
  #hud
    objective-chip
    minimap-shell
    inventory-chip
    journal-chip
    interaction-prompt
    subtitle-box
  #panel-layer
    inventory-panel
    journal-panel
    map-panel
  #system-layer
    pause-menu
    settings-dialog
    content-warning
    guide-page
~~~

### 9.2 状态规则

- 任一 panel-layer 或 system-layer 模态面板打开时，ModalGate 阻断移动。
- `src/game/presentation/mapPresentation.ts` 由 `GameState` 和章节内容派生地图路径、房间名、玩家位置、地标可见性与 D1 模式；DOM/SVG 只负责渲染，不持有地图进度。
- HUD 操作栏提供背包 / 日记 / 地图三个文字按钮，M 或指针打开同一份派生数据的完整地图弹窗；D4 下地图完全消失（按钮不渲染、`OPEN_MODAL: map` 与 M 键均被 `getMapMode === 'hidden'` 守卫忽略）。关闭面板后焦点返回原触发控件，Q、Backspace 和 Esc 均可关闭，面板打开期间角色移动保持冻结。
- 雨站第一次打开地图时保持完整路线；关闭后以可存档的 `rainMapClosedAtX` 记录当前位置，仅当玩家从该位置净向右移动超过两格时，领域状态才写入一次性 `degradation.d1.started`，并以不写入存档的 `mapWashSeconds` 冻结移动 1.2 秒。D1 视图隐藏未到达站牌与区域文字，但始终保留玩家、已到站牌、红伞及钟声方向。
- 字幕不抢占焦点。
- objective-chip 默认四秒后收起。
- HUD 总覆盖面积不超过 20%。
- 下中情境交互提示只在角色进入交互距离后出现，按钮同时服务纯键盘与指针/触屏点击；标签和实体可用性共用纯选择器，避免 Canvas 与 DOM 状态分叉。
- D1/D2 的文字变化由 UI 读取退化配置生成，不直接修改原始内容数据。
- 科普页使用语义化 HTML，来源链接可复制且可通过键盘访问。

### 9.3 CSS 变量

颜色和排版只通过语义变量引用：

~~~css
:root {
  --color-ink: #2f2b28;
  --color-paper: #eee7d8;
  --color-anchor: #b54949;
  --color-focus: #276a78;
  --font-ui: "Noto Sans SC", sans-serif;
  --font-diary: "Noto Serif SC", serif;
  --text-base: 20px;
}
~~~

完整视觉规范见 ART_BIBLE.md。

## 10. 资产加载

### 10.1 Manifest

~~~ts
interface AssetManifestEntry {
  key: string;
  type: 'image' | 'spritesheet' | 'tilemap' | 'audio' | 'json' | 'font';
  url: string;
  frameConfig?: { frameWidth: number; frameHeight: number };
  chapter?: ChapterId;
  preload: boolean;
}
~~~

玩法代码引用 key，例如 character.xu_old.walk.down，不引用文件路径。精灵条带的帧尺寸由 manifest 的 `frameConfig` 提供，Scene 不散落文件名或裁切参数。`preload: false` 的 DOM 插图不进入 Phaser 启动加载队列，由对应面板首次显示时按需加载，避免重复请求和延长首屏等待。

观察动作的资源加载与角色姿态遵循第 6.5 节：已映射的 `observe` 只选择表现层动画，不写入领域状态，也不参与谜题答案判断。交互物的常态可发现性仍由场景轮廓、材质及按需悬停标签负责，不把 Shift 变成全图答案扫描。

拾取动作只在交互对象 `kind` 为 `pickup` 且命令前后背包数量确实增加时播放，因此失败交互、重复拾取、观察和谜题不会误触发。该动作是 8 FPS 单次表现；移动输入可立即打断，减少动态效果下以 180 毫秒静态俯身姿态替代。

尾声牵手条带不自行计时，而是把领域层 `holdProgress` 的 0–1 进度映射为 4 个表现帧。取消长按后领域层归零，特写立即隐藏并恢复提示；完成后隐藏条带，由 DOM 尾声正式特写和对白接管。减少动态效果下进度期间固定为初触帧，语义进度条仍持续更新。

### 10.2 分组

- boot：标题、基础 UI、字体、占位图；
- shared：主角、通用脚步、交互音；
- home、rain、life、return、ending：按章资源；
- guide：科普页面不依赖 Phaser 资源。

离开章节后可释放大型背景和音频，但 shared 资源保留。切章前必须完成下一章最小资源加载。

## 11. 音频

- 使用 AudioManager 管理 music、ambience、voice、sfx 四个总线；
- AudioManager 对 Web Audio 合成与四路总线封装，领域层只发送语义音频命令；
- 浏览器首次用户交互后才解锁音频；
- 浏览器不提供 AudioContext/webkitAudioContext 时无声降级，所有关键声音线索仍由 DOM 或 Phaser 视觉提示表达；
- 当前垂直切片以项目原创 Web Audio 参数合成五章环境声和四层红伞主题，不加载第三方采样；
- D0–D4 的主题层级由纯数据 profile 决定，可独立测试；
- 声音导航事件同时发送 visualCueId；
- 有效进展使用独立语义 cue；每个 pattern 最多三音，单个回应控制在约 0.45–0.9 秒，不占用后期章节已经收束的 music 层；
- 单声道模式将声像提示转换为中央播放并强制启用视觉波纹；
- 浏览器失焦时暂停，恢复后不补播已过期的对白。

## 12. 存档

### 12.1 键与槽位封装

- erasure.save.slot.1.v1、erasure.save.slot.2.v1、erasure.save.slot.3.v1：三个独立进度槽；
- erasure.settings.v1：无障碍与音频设置；
- erasure.consent.v1：测试遥测同意状态。

每个槽存储 `SaveSlotRecordV1`，包含容器 `formatVersion`、ISO 8601 `savedAt` 和清理后的 `GameState`。UI 统一称其为“记忆片段”。当前片段只保存在运行时：开始新游戏或读取记忆时先激活片段，之后所有自动保存均写入该片段。旧 `erasure.save.v1` 不迁移也不展示，确认“清除全部本地数据”时删除。

### 12.2 写入时机

- 章节入口；
- 主谜题完成；
- 第四章每个路口通过；
- 尾声开始；
- 体验模式改变；
- 进入暂停或返回标题；
- 页面切到后台或关闭前。

领域进展按签名变化自动保存；离开类触发额外保存当前位置，但不增加周期性或逐帧写入。读取记忆本身不视为新保存。无障碍与音量设置独立写入全局设置键，不改变片段保存时间。

### 12.3 校验与迁移

- 槽位容器使用显式 formatVersion，领域状态使用 schemaVersion；
- 解析后检查 chapterId、checkpointId 和 puzzle IDs；
- 未知字段忽略，缺失必需字段触发迁移或回退；
- 坐标无效时通过 `src/game/content/maps.ts` 的 `checkpointSpawns` 恢复到当前章节 checkpoint 的安全出生点；未知或跨章节 checkpoint 才回退到章节默认出生点；
- 单槽损坏时不覆盖原字符串、不阻塞其他槽，并在对应槽卡显示可理解的恢复说明；
- 无障碍与音量设置使用独立键保存，并在 Phaser 和 AppShell 初始化前恢复；
- 首页只展示“继续游戏、开始游戏、读取记忆、设置”；没有有效片段时“继续游戏”使用原生 disabled；
- “继续游戏”通过 `savedAt` 读取最近有效片段；“读取记忆”页面展示三个片段的章节与保存时间并承担读取、删除和损坏提示；
- 新游戏按“模式 → 片段 → 确认”进入；覆盖、单片段删除及“清除全部本地数据”必须二次确认；后者同时删除三个槽、旧单槽键与设置并回到标题；
- localStorage 写入失败时保留旧槽内容，并通过 DOM `aria-live` 状态反馈失败，不得显示成功文案。

## 13. 测试策略

### 13.1 单元测试

- InputMapper 的标准、D3 与低扰动映射；
- PuzzleSystem 的排序、序列、放置和路线判定；
- HintSystem 的计时暂停与升级；
- DegradationSystem 的阶段切换和安全层不变量；
- 三片段 SaveData 的隔离、最新片段选择、瞬态清理、损坏回退和存储异常；
- NarrativeSystem 的条件触发与一次性对白。

### 13.2 集成测试

- GameStore → SceneBridge → View 状态同步；
- DOM 模态层打开时角色输入被阻断；
- 章节加载、检查点保存和刷新恢复；
- 声音线索与视觉替代同时触发；
- 低扰动模式中 D3 不旋转实际移动。

### 13.3 浏览器端到端测试

Playwright 覆盖：

1. 启动与首次设置；
2. 纯键盘完成第一章；
3. D1 地图视觉状态；
4. D2 背包标签状态；
5. D3 标准与低扰动两条路线；
6. 暂停、失焦与恢复；
7. 首页四入口、模式后选择片段、继续最新片段、选择性覆盖和单片段删除；
8. 暂停、返回标题、切后台与关闭前自动保存，以及损坏片段隔离和窄视口键盘操作；
9. 尾声长按与科普页；
10. 1024×576、1366×768、1920×1080 截图。

Canvas 状态不能只做 DOM 断言，代表性阶段必须保存截图并人工复核。

## 14. 调试与性能

开发模式通过查询参数 ?debug=1 打开可折叠调试层：

- 当前章节、检查点和退化阶段；
- 角色领域坐标与 Phaser 坐标；
- 碰撞、触发器和相机区域；
- 当前输入的物理键、语义动作和退化后动作；
- 谜题状态、提示计时和一次性 flags；
- FPS、纹理数量和音频状态。

发布构建隐藏调试入口。性能预算：

- 推荐设备目标 60 FPS，最低 30 FPS；
- 首次可玩资源不超过 15 MB；
- 总资源不超过 40 MB；
- 切章阻塞不超过 3 秒；
- 单次 DOM 状态更新避免重建整个 HUD；
- 不在 Phaser update 中创建临时数组、纹理或 DOM 节点。

## 15. 构建与部署

### 15.1 npm scripts

~~~json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "npm run build && playwright test",
  "lint": "eslint .",
  "format:check": "prettier --check \"src/**/*.{ts,css}\" \"tests/**/*.ts\" \"scripts/**/*.mjs\" \"public/assets/data/*.json\" \"*.{json,js,ts,html}\"",
  "validate:maps": "node scripts/validate_tiled_maps.mjs all",
  "assets:prepare:return-environment": "python scripts/prepare_environment_asset.py --input assets-source/art/environments/environment_return_v02_generated.png --output public/assets/environments/environment_return_v02.webp --width 1280 --height 720",
  "assets:prepare:ending-environment": "python scripts/prepare_environment_asset.py --input assets-source/art/environments/environment_ending_v02_generated.png --output public/assets/environments/environment_ending_v02.webp --width 1280 --height 720",
  "release:evidence": "node scripts/summarize_release_evidence.mjs",
  "release:package:internal": "npm run build && node scripts/package_release.mjs --channel internal",
  "release:package": "npm run build && node scripts/package_release.mjs --channel public"
}
~~~

### 15.2 构建要求

- Vite base 使用相对部署兼容配置或由环境变量注入；
- 所有资源文件名包含内容哈希；
- source map 是否公开由部署环境决定，测试构建保留；
- Playwright 默认使用 4 个 worker 并行四类浏览器；用例在首次导航前清理 localStorage，测试内刷新不得再次清除检查点，避免中止 Phaser 资源请求；
- GameScene 每次初建、切章重建或从标题重新进入同章存档时，在更新视图前先把 `canvas[data-scene-ready]` 重置为 `false` 并递增就绪版本；章节入场必须收到 Phaser 相机淡入完成事件后再连续完成两个 `POST_RENDER`，且版本仍匹配、Scene 仍 active，才设置为 `true`。若低帧率设备让基于游戏时间的淡入超过两倍作者时长，墙钟后备会先 `resetFX()` 明确结束效果，再等待两个真实渲染帧，不能一边残留淡入一边宣称就绪。章节销毁时移除属性并使旧回调失效；浏览器测试必须据此开始截图或键盘输入，禁止把 DOM 菜单就绪、旧视图清空或首帧调度当成 Canvas 可见帧就绪；
- 构建失败条件包括 TypeScript、lint、单元测试或资源 manifest 校验失败；
- 发布包只包含 public/assets 中已登记资产，不包含 assets-source。
- 内部候选与公开包均生成逐文件 SHA-256 清单并排除 source map；公开包额外要求项目级 LICENSE、PASS 外部证据报告和已关闭的资产 `review` 状态。

## 16. 隐私与安全

- 公开版默认关闭遥测；
- 不收集姓名、健康信息、自由文本、精确位置或按键序列；
- 外部链接使用安全的新窗口策略并清楚显示目标机构；
- 用户生成内容不存在，因此不需要上传接口；
- 科普页不得根据游玩表现生成健康判断；
- localStorage 清除入口放在设置页并要求二次确认。
- 外部试玩原始记录不由游戏收集；证据模板使用匿名 ID，汇总脚本只输出聚合门槛结果，原始文件默认保存在仓库外。

## 17. 开发前退出条件

开始第一章正式编码前必须满足：

1. Vite + TypeScript + Phaser 空场景可启动；
2. GameStore、SceneBridge 和 InputMapper 有最小单元测试；
3. DOM 暂停菜单能阻断场景输入；
4. Tiled 图层和对象属性按本文约定导出成功；
5. 占位角色在 64 像素网格地图中完成碰撞与相机跟随；
6. 存档可以写入并恢复测试检查点；
7. 第一章灰盒所需内容 ID 与 LEVEL_DESIGN.md 一致。
