# 《记忆的缝隙》资产登记台账

> 最近更新：2026-06-22
> 规则来源：ART_BIBLE.md 第 8、9 节

本表记录进入仓库的美术与音频资产。只有来源、许可证、锚点和审核状态完整的资产才能标记为 `shipped`。

| assetKey | owner | sourceFile | exportFile | license/source | status | reviewer | approvedAt | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| character.xu_old.idle.down | 项目团队 | assets-source/art/characters/character_xu_old_idle_down_v01_chromakey.png | public/assets/characters/character_xu_old_idle_down_v01_64x96.png | 项目定制生成；OpenAI ImageGen；无第三方素材 | review | 待填写 | — | 64×96；底部中心锚点；透明 PNG；标准模式实际场景已检查 |
| character.xiulan_old.idle.down | 项目团队 | assets-source/art/characters/character_xiulan_old_idle_down_v01_chromakey.png | public/assets/characters/character_xiulan_old_idle_down_v01_64x96.png | 项目定制生成；OpenAI ImageGen；无第三方素材 | review | 待填写 | — | 64×96；底部中心锚点；透明 PNG；尾声交互实体已接入 |
| prop.red_umbrella.closed | 项目团队 | assets-source/art/props/prop_red_umbrella_closed_v01.svg | public/assets/props/prop_red_umbrella_closed_v01.png | 项目原创 SVG；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 锚点红、木弯柄、深色补丁与缝线；SVG 原稿经 Chromium 导出透明 PNG，所有雨站红伞实体共用 |
| memory.rain.umbrella.illustration | 项目团队 | assets-source/art/memories/memory_rain_umbrella_v01.png | public/assets/memories/memory_rain_umbrella_v01.webp | 项目定制生成；OpenAI ImageGen；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1152×768 WebP；雨站初遇对白期间显示；红伞为唯一高辨识暖色 |
| memory.life.move.illustration | 项目团队 | assets-source/art/memories/memory_life_move_v01.png | public/assets/memories/memory_life_move_v01.webp | 项目定制生成；OpenAI ImageGen；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1152×768 WebP；木梳归位后显示；纸箱、未装床架和背景红伞与脚本一致 |
| memory.life.osmanthus.illustration | 项目团队 | assets-source/art/memories/memory_life_osmanthus_v01.png | public/assets/memories/memory_life_osmanthus_v01.webp | 项目定制生成；OpenAI ImageGen；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1152×768 WebP；搪瓷杯归位后显示；桂花、泥土与杯子构成冗余线索 |
| map.home | 项目团队 | public/assets/data/map.home.json | 同左 | 原创 Tiled 对象数据 | placeholder | Codex 浏览器验收 | 2026-06-22 | 灰盒对象层；正式 tile 仍待替换 |
| map.rain_station | 项目团队 | public/assets/data/map.rain_station.json | 同左 | 原创 Tiled 对象数据 | placeholder | Codex 自动化测试 | 2026-06-22 | 灰盒对象层；稳定 ID 已接入 |
| map.shared_life | 项目团队 | public/assets/data/map.shared_life.json | 同左 | 原创 Tiled 对象数据 | placeholder | Codex 自动化测试 | 2026-06-22 | 灰盒对象层；稳定 ID 已接入 |
| map.return_corridor | 项目团队 | public/assets/data/map.return_corridor.json | 同左 | 原创 Tiled 对象数据 | placeholder | Codex 自动化测试 | 2026-06-22 | 灰盒对象层；稳定 ID 已接入 |
| map.home_ending | 项目团队 | public/assets/data/map.home_ending.json | 同左 | 原创 Tiled 对象数据 | placeholder | Codex 自动化测试 | 2026-06-22 | 灰盒对象层；稳定 ID 已接入 |

## 生成与处理记录

### character.xu_old.idle.down

- 生成方式：内置 OpenAI ImageGen；`stylized-concept`。
- 生成目标：72 岁中国老人许志远，退休钟表维修师，低饱和手绘 2D，蓝灰开衫、暖白衬衫、深色长裤，稳定且有尊严的站姿。
- 生成限制：单人全身、无文字、无场景、无水印、纯 `#00ff00` 色键背景、不使用锚点红。
- 色键处理：`remove_chroma_key.py`，边缘软遮罩与去色溢出。
- 游戏帧处理：`scripts/normalize_character_seed.py`，透明内容统一缩放至 64×96，底部中心对齐。
- 当前结论：轮廓、服装和色彩可进入动画种子评审；正式 `idle`/`walk` 动画条完成前保持 `review`。

### character.xiulan_old.idle.down

- 生成方式：内置 OpenAI ImageGen；使用许志远种子帧作为画法与比例参考，不复制身份。
- 生成目标：70 岁中国老人林秀兰，退休语文教师，短卷银发、旧绿色开衫、纸色衬衫，稳定且愿意停下等待的站姿。
- 生成限制：单人全身、与许志远明显不同、无文字、无场景、无水印、纯 `#00ff00` 色键背景、不使用锚点红。
- 色键与游戏帧处理：与许志远相同；透明内容归一化至 64×96 并底部中心对齐。
- 当前结论：轮廓、服装和色彩可进入尾声实际构图评审；伸手和牵手动画完成前保持 `review`。

### memory.rain.umbrella.illustration

- 生成方式：内置 OpenAI ImageGen；两位老年角色资产只作为画法和视觉语言参考，画面使用年轻人物与简化面部细节。
- 生成目标：二十世纪七十年代末南方小城旧车站；秀兰把带补丁的红伞倾向在钟表铺檐下淋湿的志远。
- 生成限制：无可读文字、无现代物件、无额外前景人物、无亲吻或戏剧化姿态、无疾病或诊断隐喻。
- 运行时处理：高分辨率 PNG 原稿归档于 `assets-source`，通过 `scripts/prepare_memory_illustration.py` 导出 1152×768 WebP。
- 当前结论：内容、对白、裁切和叙事脚本一致，浏览器控制台无错误；待低扰动转场检查后决定是否升为 `approved`。

### memory.life.move.illustration

- 生成方式：内置 OpenAI ImageGen；使用已批准的雨站初遇插画维持同一对年轻人物、画法与纸张质感。
- 生成目标：1979 年刚搬进第一间家，两人坐在结实纸箱上谈论尚未装好的床架；旧红伞靠墙，退居背景。
- 生成限制：无可读文字、无现代家电、无额外人物、无浪漫海报姿势，不夸张贫困或疲惫。
- 运行时处理：高分辨率 PNG 原稿归档于 `assets-source`，导出 1152×768 WebP。
- 当前结论：内容与 `dialogue.life.memory_move` 一致；D2 实际构图、裁切和控制台检查通过。

### memory.life.osmanthus.illustration

- 生成方式：内置 OpenAI ImageGen；使用搬家记忆维持人物身份与画法，并将两人自然推进到中年。
- 生成目标：1992 年桂花第一次开放；秀兰擦拭窗台泥土，志远拿着带桂花纹样的搪瓷杯。
- 生成限制：无可读年份和文字、无现代电子设备、无额外前景人物、无红色强焦点、无疾病隐喻。
- 运行时处理：高分辨率 PNG 原稿归档于 `assets-source`，导出 1152×768 WebP。
- 当前结论：内容与 `dialogue.life.memory_osmanthus` 一致；D2 实际构图、裁切和控制台检查通过。
