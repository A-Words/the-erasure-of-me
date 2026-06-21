# Agent 协作指南

## 项目现状

本仓库用于开发 2D 叙事解谜游戏《记忆的缝隙》。当前处于文档先行阶段，尚未创建可运行的 Phaser 工程。

- 技术基线：Phaser 3 + TypeScript + Vite
- 目标平台：PC 网页端
- 地图工具：Tiled
- 当前语言：简体中文
- 目标体验：20–30 分钟垂直切片

在脚手架实际创建前，不要声称 npm run dev、build、test 等命令已经可用。

## 事实来源

开始工作前先阅读与任务直接相关的文档：

- docs/GDD.md：产品目标、玩法、退化机制、主题与验收；
- docs/TECHNICAL_DESIGN.md：模块边界、输入、地图、存档和测试；
- docs/LEVEL_DESIGN.md：坐标、实体、谜题、检查点和提示；
- docs/NARRATIVE_SCRIPT.md：对白、日记、物件与系统文本；
- docs/ART_BIBLE.md：视觉、精灵、UI 和资产规范；
- docs/MEDICAL_REVIEW.md：医学来源、风险措辞和审核流程；
- docs/ROADMAP.md：里程碑、任务依赖和完成条件。

发生冲突时：

1. 医疗和敏感性问题以最新权威来源及专业审核意见为准；
2. 产品行为以 GDD 为准；
3. 技术边界以 TECHNICAL_DESIGN.md 为准；
4. 具体坐标、文本与资产以对应专项文档为准。

## 开发约束

- 游戏规则和可存档状态必须独立于 Phaser Scene、Sprite、Tween、Camera 和 DOM。
- Phaser 负责游戏世界表现；HUD、字幕、菜单、设置和科普页使用 DOM。
- 物理按键先转换为 InputAction，D3 退化只作用于游戏移动映射。
- 暂停、退出、字幕和无障碍设置永不随退化改变。
- 地图使用 Tiled；玩法逻辑引用稳定 ID 和 manifest key，不散落文件路径。
- 先用灰盒与占位资产验证玩法，再制作或接入正式资源。
- 不加入随机按键变化、死亡、追逐、战斗或诊断评分。
- 不根据谜题表现、用时或提示次数推断玩家的认知健康。

## 文档同步

文档是实现的一部分。行为、结构或约定变化时，主动修改对应文档，不必等待单独提醒：

- 改玩法、章节顺序、退化曲线或验收标准：同步 GDD.md；
- 改架构、状态、输入、存档、地图格式或命令：同步 TECHNICAL_DESIGN.md 和 README.md；
- 改地图、坐标、实体、答案、提示或检查点：同步 LEVEL_DESIGN.md；
- 改对白、日记、物件描述、字幕或内容 ID：同步 NARRATIVE_SCRIPT.md；
- 改科普、疾病、陪伴或宣传措辞：同时同步 NARRATIVE_SCRIPT.md 与 MEDICAL_REVIEW.md，并重新核验来源；
- 改尺寸、色彩、字体、精灵、UI 或资产命名：同步 ART_BIBLE.md；
- 改范围、依赖、优先级或里程碑：同步 ROADMAP.md；
- 改仓库结构、命令、测试或协作规则：主动更新本文件。

不要复制同一规则到多处后留下冲突；专项文档保存细节，GDD 保存产品基线，README 只做入口和快速说明。

## 验证要求

文档变更至少检查：

- Markdown 标题与代码围栏完整；
- README 本地链接存在；
- 医学来源链接仍可访问；
- 不存在互相冲突的 ID、路径、章节顺序或技术方案；
- git status --short 只包含预期改动。

代码建立后，根据改动范围执行：

- npm run lint；
- npm run test；
- npm run build；
- 涉及浏览器流程时运行 npm run test:e2e；
- Canvas、HUD、退化效果或响应式变化必须检查代表性截图；
- 无障碍相关改动至少验证纯键盘、静音和低扰动路径。

不得通过跳过测试、删除断言或放宽类型来掩盖问题。若受环境限制无法验证，应明确记录未验证项。

## Git 与提交

完成范围明确、内容完整且已经验证的文档、代码或资源变更后，可以自行执行 git add 和 git commit，无需再次询问。

提交必须：

- 使用 Conventional Commits，例如 docs: add level design、feat: implement input mapping、fix: preserve pause controls；
- 一个提交只表达一个清晰目的；
- 只暂存本次任务相关文件，不夹带用户已有或无关改动；
- 提交前复核 staged diff；
- 提交后检查 git status --short 和 git log -1 --oneline。

以下情况不要自行提交：

- 工作仍是草稿、实验或存在已知阻塞；
- 必要验证失败或尚未完成；
- 工作区包含无法安全区分的他人改动；
- 需要重写历史、强推、删除数据或执行其他破坏性操作。

除非用户明确要求，不 amend 既有提交、不强推、不重置用户改动。

