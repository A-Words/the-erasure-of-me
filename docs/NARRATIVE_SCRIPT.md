# 《记忆的缝隙》叙事脚本

> 版本：v0.1
> 状态：垂直切片可录入稿
> 当前语言：简体中文
> 文字上限：可游玩正文不超过 6000 汉字

## 1. 使用规则

### 1.1 内容 ID

- dialogue：连续对白；
- narration：许志远的内心或感官描述；
- inspect：物件观察文本；
- journal：日记页；
- system：稳定系统提示；
- degraded：退化后的显示文本；
- guide：科普页文本。

实现时以内容 ID 为键保存原文。D2 只改变显示层，不能覆盖原始文本。

### 1.2 表达规范

- 许志远的停顿使用省略号，但避免把语言困难表演成滑稽口吃。
- 林秀兰提供选择、等待与提示，不用测试式问题逼迫许志远回忆。
- 系统提示不用“失败”“你忘了”“答错了”。
- 单条字幕最多两行，每行不超过 22 个汉字。
- 方括号内容为演出说明，不进入字幕。

## 2. 开场

### system.content_warning.title

内容提示

### system.content_warning.body

本作涉及认知衰退、迷路与家庭照护。你可以随时暂停、退出，或在设置中启用低扰动模式。

### system.fiction_notice

许志远是一位虚构人物。他的经历不代表所有阿尔茨海默病患者。

### system.mode.standard

标准模式

### system.mode.standard_desc

包含固定、可学习的方向错位，以及较完整的画面退化效果。

### system.mode.low_stimulation

低扰动模式

### system.mode.low_stimulation_desc

保留标准移动方向，降低模糊、漂移、闪动和镜头变化。

### dialogue.opening.audio

[黑屏。钟表走动，水壶开始加热。]

林秀兰（远处）：“老许，我去买面。钥匙还在老地方。”

## 3. 第一章：清晨的家

### dialogue.home.wake

[许志远坐起，床边钟表显示 7:15。]

许志远：“钥匙……今天要出门吗？”

### system.tutorial.move

使用 WASD 或方向键移动

### inspect.home.bedside_photo

照片里，我们站在一把红伞下面。

伞面太小，两个人的肩膀都湿了一半。

### system.tutorial.interact

靠近物件后，按 E、Enter 或空格查看

### narration.home.photo_pause

她那天说了什么？

……先别急。

### system.tutorial.map

按 M 查看地图

### system.map.home_room_names

卧室 / 客厅 / 厨房 / 玄关

### inspect.home.clock

我修过很多钟。

这只走得最准，可我总觉得它慢了。

### inspect.home.slippers

两双拖鞋。她的鞋尖总朝着门。

### inspect.home.glasses_case

眼镜盒是空的。

边角贴着一小块红胶布，免得和她的拿混。

### system.item_pickup.glasses_case

取得：眼镜盒

### system.tutorial.inventory

按 I 打开背包

### inspect.home.kettle

水刚烧开。她应该才出门不久。

### inspect.home.two_bowls

两只碗，一只盛面，一只总要多放一点葱。

### inspect.home.journal

封面写着：“给志远，也给明天的我。”

### journal.home.key

六月二十二日，晴转雨。

钥匙还在玄关的蓝色小碗里。别急，我去买面，很快回来。

——秀兰

### narration.home.after_journal

蓝色的小碗。门口。

这一次，我记住了。

### inspect.home.key_bowl.before

一只蓝色圆碗，底下压着旧公交票。

### system.item_pickup.home_key

取得：家门钥匙

### inspect.home.key_bowl.after

碗底有两道细裂纹，被人仔细补过。

### dialogue.home.door_missing_journal

许志远：“好像还少了什么。”

系统提示：“桌边的日记也许会有帮助。”

### dialogue.home.door_open

[钥匙插入门锁。远处响起雷声。]

许志远：“这场雨……我见过。”

## 4. 第二章：雨中的初遇

### dialogue.rain.arrival

[现实门锁声变为车站广播底噪。]

许志远：“这是哪一站？”

### inspect.rain.ticket

一张被雨水泡软的旧车票。

背面用铅笔写着：2 → 4 → 5。

### system.item_pickup.old_ticket

取得：旧车票

### system.degradation.d1

有些路名看不清了。钟声还在。

### degraded.map.unknown_place

……

### inspect.rain.stone_2

两个圆点，边缘磨得发亮。

### inspect.rain.stone_4

四个圆点，雨水积在凹槽里。

### inspect.rain.stone_5

五个圆点。最后一个像是后来补刻的。

### system.rain.sequence_progress

石板在雨里亮了一下。

### system.rain.sequence_soft_miss

这块石板没有回应。已经亮起的还在。

### journal.rain.route

第一次见到志远是在旧车站。

他站在钟表铺的屋檐下，浑身都湿了，还在低头修一只不走的表。

先经过三个站牌，再听钟楼的三声响。

### inspect.rain.umbrella_sign_a

褪色的伞铺招牌。伞柄朝向小巷。

### inspect.rain.umbrella_sign_b

又一把红伞。

雨太大，只有这个颜色没有散开。

### system.rain.sound_visual

钟声让积水向一个方向轻轻发颤。

### dialogue.rain.memory

[年轻的林秀兰撑伞停在屋檐边。]

林秀兰：“你要去车站吗？”

许志远：“……是。”

林秀兰：“那一起走吧。”

[她把伞向他那边偏。]

林秀兰：“伞往你那边一点，别淋着。”

### narration.rain.memory_end

那天的雨很大。

我不记得车开去了哪里，只记得她的半边肩膀湿了。

### memory.rain.umbrella.title

雨伞下的半边晴天

### memory.rain.umbrella.body

她把伞偏过来，自己淋湿了半边肩膀。

## 5. 第三章：共同生活

### dialogue.life.arrival

许志远：“这个家……怎么有三扇一样的窗？”

### system.degradation.d2

名字有些远。样子和触感还在。

### inspect.life.album

相册空着三格。

照片散在房间里，像是从不同年份吹来的。

### inspect.life.photo_move

空房间、纸箱，还有一把靠在墙边的红伞。

纸箱上写着：1979。

### inspect.life.photo_osmanthus

窗台的桂花已经长高。

墙边的身高刻度旁写着：1992。

### inspect.life.photo_anniversary

桌上有一块小蛋糕。

牌子上写着：银婚，2001。

### system.life.photo_pick

拿起这张照片

### system.life.photo_place

放在这里

### system.life.photo_soft_miss

这个顺序似乎接不上。其他照片没有移动。

### system.life.photo_complete

三个年份安静地排在了一起。

### inspect.life.wood_comb.full

木梳

齿很密，握柄上有一道修过的裂缝。

### degraded.life.wood_comb

木＿

### inspect.life.enamel_cup.full

搪瓷杯

杯身有一圈桂花，底部磨出了银色。

### degraded.life.enamel_cup

＿瓷＿

### inspect.life.cassette.full

录音带

标签上的字褪了，只剩一段熟悉的旋律。

### degraded.life.cassette

〰 〰 〰

### system.life.place_soft_miss

形状对不上。再看看照片里的位置。

### dialogue.life.memory_move

[年轻的两人坐在纸箱上。]

林秀兰：“床还没装，今晚怎么办？”

许志远：“纸箱挺结实。”

林秀兰：“那你睡纸箱，我睡床板。”

[两人笑。画面停在镜台上的木梳。]

### dialogue.life.memory_osmanthus

[林秀兰擦去窗台泥土。]

林秀兰：“桂花今年第一次开。”

许志远：“明年会更多。”

林秀兰：“那明年也一起闻。”

### dialogue.life.memory_cassette

[停电。录音机靠电池播放。]

许志远：“纪念日连灯都没有。”

林秀兰：“有声音就够了。”

[她跟着录音轻声哼唱。]

### narration.life.complete

不是照片替我们记住了一生。

是这些做过很多次、当时并不觉得特别的小事。

### memory.life.ordinary_days.title

许多普通的日子

### memory.life.ordinary_days.body

拆纸箱、等花开、在停电的晚上听一盘旧录音带。

### journal.life.ordinary_days

志远今天又问，桂花是哪一年种的。

我没有让他猜。我说，是我们搬来以后一起种的。

他摸了摸杯子上的花，说：“那一定开过很多次了。”

是啊。记不得年份，也不妨碍我们一起闻过花香。

## 6. 第四章：回家的路

### dialogue.return.arrival

许志远：“路怎么转了？”

### system.degradation.d3.standard

方向变了。地上的箭头还在。

### system.degradation.d3.low_stimulation

提示变得不可靠。地上的箭头还在。

### system.return.training

按一次上方向，看看脚步去了哪里

### narration.return.training_complete

不是我想的方向。

……可它没有再变。

### inspect.return.floor_arrow

箭头刻在地上。它指的是路，不是按键。

### inspect.return.umbrella_shadow

墙上没有伞，地上却有伞柄的影子。

### narration.return.wrong_once

我好像又回来了。

红伞还在前面。

### narration.return.wrong_twice

地上有一对浅浅的脚印。

有人走过，也有人在等我。

### system.return.hint_explicit

先朝伞柄指向的方向走。方向键和脚步的关系已经转过一圈。

### journal.return.last_page

如果你一时叫不出我的名字，也没关系。

我会再告诉你。

你不需要证明自己还记得多少，才值得被好好说话、好好陪着。

——秀兰

### narration.return.door

门后有人在哼歌。

我忘了歌名，但知道最后一句会落在哪里。

## 7. 尾声

### dialogue.ending.enter

[门打开。现实中的林秀兰提着面走进来。]

林秀兰：“我回来了。”

[许志远看着她，试图开口。]

许志远：“我……你是……”

[林秀兰没有靠近，只把东西放下。]

林秀兰：“我是秀兰。”

林秀兰：“别急，我回来了。”

### narration.ending.hand

她把手停在那里，没有催我。

### system.ending.hold

[无文字按键提示。掌心区域出现稳定暖色。]

### system.ending.hold_accessible

确认牵住她的手

### dialogue.ending.handheld

[许志远主动握住她的手。]

许志远：“手是暖的。”

林秀兰：“面也还是热的。”

### system.ending.theme

有些名字会远去，爱曾经来过的地方还留着温度。

### system.ending.guide_entry

了解认知障碍的早期变化与陪伴方式

### system.ending.exit

暂时离开

## 8. 通用物件与系统文本

### system.pause.title

暂停

### system.pause.resume

继续

### system.pause.settings

设置与无障碍

### system.pause.restart_puzzle

重置当前谜题

### system.pause.restart_chapter

从本章开始

### system.pause.exit

返回标题

### system.save.complete

已保存

### system.save.recovered

已从最近的安全位置继续

### system.save.corrupt

存档无法读取。设置已保留，可以从最近完成的章节重新开始。

### system.browser.pause

窗口暂时失去焦点，游戏已暂停。

### system.interact.unavailable

现在还无法使用它。

### system.door.need_item

好像还少了一件东西。

### system.hint.offer

需要再看一眼线索吗？

### system.hint.accept

看看线索

### system.hint.dismiss

我想再试试

## 9. 科普页正式文案

### guide.title

早期表现与就医陪伴指南

### guide.disclaimer

本页用于一般健康科普，不能替代专业筛查、诊断或治疗。如果你发现自己或家人的认知、情绪或日常能力持续发生变化并影响生活，请记录具体情况，并向正规医疗机构的相关专业人员咨询。

### guide.signs.title

值得留意的持续变化

### guide.signs.body

- 比过去更频繁地忘记近期事件，或反复询问同一件事；
- 经常放错物品，并且难以沿原路寻找；
- 在熟悉地点迷路，或混淆时间、地点；
- 完成熟悉任务、解决问题或作出决定变得困难；
- 跟随对话、理解表达或寻找词语变得困难；
- 视觉空间判断出现明显变化；
- 情绪、行为、兴趣或社交状态持续改变。

这些表现可能有多种原因，不能凭单一表现自行判断疾病。

### guide.actions.title

可以怎样行动

### guide.actions.body

1. 记录变化出现的时间、频率、具体场景和对生活的影响。
2. 与本人平静沟通，避免在多人面前测试、指责或争辩。
3. 预约正规医疗机构评估，携带既往病史、用药信息和观察记录。
4. 使用稳定日程、清晰标记、充足照明和紧急联系人信息改善安全。
5. 鼓励本人在能力允许的范围内继续参与熟悉活动和社会交往。
6. 照护者也需要休息，并可以向家人、社区和专业人员求助。

### guide.game_notice.title

关于游戏中的谜题

### guide.game_notice.body

照片排序、数字连接、颜色和形状辨识只用于叙事体验，不是医学筛查，也不能产生任何认知健康结论。

### guide.sources.title

资料来源

### guide.sources.body

- 世界卫生组织：Dementia
- 《应对老年期痴呆国家行动计划（2024—2030年）》
- 《应对老年期痴呆国家行动计划（2024—2030年）》政策解读

正式发布版本应显示可访问链接、来源机构、发布日期和本页复核日期。

## 10. 语音录制清单

原型优先录制以下 8 句林秀兰对白：

1. “老许，我去买面。钥匙还在老地方。”
2. “你要去车站吗？”
3. “那一起走吧。”
4. “伞往你那边一点，别淋着。”
5. “桂花今年第一次开。”
6. “有声音就够了。”
7. “我是秀兰。别急，我回来了。”
8. “面也还是热的。”

许志远只录制四组非语言声音：醒来呼吸、回忆停顿、迷路迟疑、牵手后的放松。其他对白先使用字幕，待测试确认节奏后再决定是否扩录。
