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
| memory.life.cassette.illustration | 项目团队 | assets-source/art/memories/memory_life_cassette_v01.png | public/assets/memories/memory_life_cassette_v01.webp | 项目定制生成；OpenAI ImageGen；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1152×768 WebP；录音带归位后显示；录音机双线圈、停电光源与纪念日蛋糕构成冗余线索 |
| memory.ending.hand.illustration | 项目团队 | assets-source/art/memories/memory_ending_hand_v01.png | public/assets/memories/memory_ending_hand_v01.webp | 项目定制生成；OpenAI ImageGen；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1024×512 WebP；完成牵手长按后显示；蓝灰袖主动覆上旧绿袖等待掌心 |
| environment.home.background | 项目团队 | assets-source/art/environments/environment_home_v01.svg | public/assets/environments/environment_home_v01.png | 项目原创 SVG；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1280×720；清晨住宅四区、晨光、家具与关键物件构图 |
| environment.rain.background | 项目团队 | assets-source/art/environments/environment_rain_v01.svg | public/assets/environments/environment_rain_v01.png | 项目原创 SVG；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1280×720；斜向站台、积水、石板与钟表铺雨棚 |
| environment.life.background | 项目团队 | assets-source/art/environments/environment_life_v01.svg | public/assets/environments/environment_life_v01.png | 项目原创 SVG；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1280×720；三段生活空间叠影、纸箱、桂花窗与录音机 |
| environment.return.background | 项目团队 | assets-source/art/environments/environment_return_v01.svg | public/assets/environments/environment_return_v01.png | 项目原创 SVG；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1280×720；重复十字长廊、四向地砖箭头与暗红伞痕 |
| environment.ending.background | 项目团队 | assets-source/art/environments/environment_ending_v01.svg | public/assets/environments/environment_ending_v01.png | 项目原创 SVG；无第三方素材 | review | Codex 浏览器验收 | 2026-06-22 | 1280×720；回到现实清晨、暖白留白、桌上两碗热面 |
| map.home | 项目团队 | public/assets/data/map.home.json | 同左 | 原创 Tiled 对象数据 | review | Codex 浏览器验收 | 2026-06-22 | Tiled 对象层提供出生点和稳定 ID；正式背景已接入且坐标对齐 |
| map.rain_station | 项目团队 | public/assets/data/map.rain_station.json | 同左 | 原创 Tiled 对象数据 | review | Codex 浏览器验收 | 2026-06-22 | Tiled 对象层提供 2→4→5、伞标与出口；正式背景已接入 |
| map.shared_life | 项目团队 | public/assets/data/map.shared_life.json | 同左 | 原创 Tiled 对象数据 | review | Codex 浏览器验收 | 2026-06-22 | Tiled 对象层提供照片、物件和三槽位；正式背景已接入 |
| map.return_corridor | 项目团队 | public/assets/data/map.return_corridor.json | 同左 | 原创 Tiled 对象数据 | review | Codex 浏览器验收 | 2026-06-22 | Tiled 对象层提供四向出口；背景箭头与世界方向一致 |
| map.home_ending | 项目团队 | public/assets/data/map.home_ending.json | 同左 | 原创 Tiled 对象数据 | review | Codex 浏览器验收 | 2026-06-22 | Tiled 对象层提供秀兰锚点；正式尾声背景和 D4 构图已接入 |

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

### memory.life.cassette.illustration

- 生成方式：内置 OpenAI ImageGen；使用桂花记忆维持同一对中年人物、画法与纸张质感，并将两人自然推进到 2001 年。
- 生成目标：停电的银婚纪念日；秀兰在电池录音机旁轻轻哼唱，志远在油灯下安静倾听。
- 生成限制：无可读文字、无现代电子设备、无额外人物、无戏剧化浪漫姿势，不暗示爱情或音乐能够治疗疾病。
- 运行时处理：高分辨率 PNG 原稿归档于 `assets-source`，导出 1152×768 WebP。
- 当前结论：内容与录音带归位对白一致；D2 实际构图、裁切、退出清理和控制台检查通过。

### memory.ending.hand.illustration

- 生成方式：内置 OpenAI ImageGen；老年许志远与林秀兰角色种子用于身份、袖色、年龄、画法与低饱和纸张质感参考。
- 生成目标：秀兰先停下等待，志远从左侧主动把手覆在她开放的掌心上；远景只保留温热的面和褪色红伞。
- 生成限制：无可读文字、无医疗物件、无魔法光效、无拉拽或约束姿态、无奇迹治愈暗示，避免握手式和祈祷式构图。
- 运行时处理：高分辨率 2:1 PNG 原稿归档于 `assets-source`，导出 1024×512 WebP，与 `ART_BIBLE.md` 手部尾声特写规格一致。
- 当前结论：内容与 `dialogue.ending.handheld` 一致；D4 实际构图、裁切、标准/低扰动路径、退出科普页和控制台检查通过。

### environment.*.background

- 制作方式：项目原创 SVG，使用固定 1280×720 画布、低饱和色板、轻微纸张颗粒和章节专属构图，无第三方图形或字体。
- 运行时结构：背景只承担世界表现；出生点、交互对象和稳定 ID 继续来自对应 Tiled JSON 对象层，碰撞与玩法状态未写入图片。
- 可读性约束：中央主路径保持低噪点，每章暖色焦点不超过一个；雨站数字石板、生活物品纹理和长廊方向均保留非颜色冗余。
- 当前结论：五章候选背景已导出并接入 manifest；1280×720 逐章检查通过，关键物件、角色脚底、HUD 与 Tiled 坐标无阻塞遮挡，控制台无错误。
