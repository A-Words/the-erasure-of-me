# 记忆的缝隙（The Erasure of Me）

《记忆的缝隙》是一款面向 PC 浏览器的 2D 俯视叙事解谜游戏。玩家扮演患有轻度阿尔茨海默病的老人许志远，在逐渐失去地图、文字提示和熟悉操作方式的过程中，循着老伴留下的日记、旧照片与一把红伞，寻找共同生活的痕迹。

## 当前状态

项目已建立 Phaser 工程，并进入可运行垂直切片阶段。当前版本包含标题与内容提示、五个场景、D0–D4 退化、标准/低扰动模式、四类谜题、DOM HUD 与系统菜单、自动存档、尾声和科普页。五章环境候选、第一章统一材质与生活装饰层、第三章“三扇同源窗”正式背景与透明道具图集、许志远四方向呼吸待机、行走/停止、观察、拾取与牵手、秀兰等待伸手、红伞、五幅核心记忆插图、五章 Web Audio 声场与四路混音已经接入；真人关键语音与外部审核仍需按路线图收尾。

- 目标体验：20–30 分钟垂直切片
- 技术基线：Phaser 3 + TypeScript + Vite
- 地图：HUD 文字入口与可展开 DOM/SVG 地图；雨站在关闭地图后净向右移动超过两格时触发一次性 D1 褪色
- 目标平台：PC 网页端
- 输入方式：键盘完整支持，鼠标作为可选输入
- 当前语言：简体中文

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [游戏设计文档](docs/GDD.md) | 产品定位、玩法、叙事、退化机制、公益目标与验收标准 |
| [技术设计](docs/TECHNICAL_DESIGN.md) | Phaser 架构、状态边界、输入、存档、地图和测试策略 |
| [关卡设计](docs/LEVEL_DESIGN.md) | 房间布局、实体、触发器、谜题、检查点与提示升级 |
| [叙事脚本](docs/NARRATIVE_SCRIPT.md) | 对白、日记、物件描述、系统文字和触发条件 |
| [美术规范](docs/ART_BIBLE.md) | 色彩、字体、角色比例、精灵规格、UI 与资产命名 |
| [资产登记台账](docs/ASSET_REGISTRY.md) | 美术与音频资产的来源、许可证、状态与审核记录 |
| [制作路线图](docs/ROADMAP.md) | 八周里程碑、任务依赖、优先级和完成条件 |
| [医学内容审核](docs/MEDICAL_REVIEW.md) | 权威来源、风险措辞、审核记录与发布检查 |
| [发布就绪台账](docs/RELEASE_READINESS.md) | 自动化、三视口、性能预算与外部发布门槛 |
| [外部测试证据包](docs/release-evidence/README.md) | 15 人试玩、无障碍、浏览器、专业审核和发布决定模板 |

文档冲突时采用以下优先级：

1. 医疗或敏感性问题以专业审核结论为准；
2. 产品行为以 GDD 为准；
3. 技术边界以技术设计为准；
4. 具体关卡坐标、对白与资产以各专项文档为准。

## 开发命令

使用 npm 安装依赖并运行：

~~~bash
npm install
npm run dev
npm run build
npm run preview
npm run test
npm run test:e2e
npm run lint
npm run validate:maps
npm run release:evidence -- <证据目录> --output <汇总报告路径>
npm run release:package:internal
npm run release:package -- <PASS 汇总报告路径>
npm run assets:prepare:home-environment
npm run assets:prepare:life-environment
npm run assets:prepare:life-props
npm run assets:pack:life-props
npm run assets:render:home-overlays
npm run assets:render:environments
~~~

`assets:prepare:life-environment` 会同时导出第三章初始年代叠影背景与三件物品全部归位后的收束态背景。

首次运行浏览器端到端测试前，需要安装 Playwright 浏览器；Edge 项目还需要系统已安装 Microsoft Edge：

~~~bash
npx playwright install chromium firefox webkit
~~~

资产处理脚本（如 `assets:prepare:*` 和 `assets:render:*`）需要 Python 3 与 Pillow 库，可通过以下命令安装：

~~~bash
pip install -r requirements.txt
~~~

## 开发原则

- 游戏规则与可存档状态独立于 Phaser Scene。
- Canvas 负责游戏世界，DOM 负责 HUD、菜单、字幕和无障碍设置。
- 所有物理按键先映射为 InputAction，再交给玩法系统。
- 退化规则固定、可观察、可重新学习；暂停与无障碍层永不退化。
- 关卡优先使用灰盒和占位资产验证，再进入正式美术生产。
- 不将游戏谜题、游玩数据或通关表现解释为医学筛查结果。

## 目录

~~~text
docs/
src/
  game/
  phaser/
  ui/
  accessibility/
public/assets/
assets-source/
tests/
~~~

完整目录职责见 [技术设计](docs/TECHNICAL_DESIGN.md)。

## 版权与内容声明

项目尚未确定开源许可证。第三方字体、音效、图片和工具必须记录来源与许可证，未确认授权的素材不得进入发布构建。

`npm run release:package` 在缺少项目级 LICENSE、PASS 外部证据或存在 `review` 资产时会拒绝生成公开包；内部候选包不会绕过这些发布门槛。浏览器包所含第三方运行时代码的许可文本见 `public/THIRD_PARTY_NOTICES.txt`。

本作涉及认知衰退和家庭照护，但不提供医学诊断或治疗建议。正式发布前，科普内容必须完成专业审核。
