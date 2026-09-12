# 牌义资料与编辑方法

资料获取与中文整理日期：2026-09-12。中文版本 `rws-editorial-2026-09-12`，固定牌图版本保持 `rws-1909-v1`。

## 一手资料

A. E. Waite, *The Pictorial Key to the Tarot*，Wikisource 1922 年版本转录。

- [Part 2：大阿卡纳图像与象征](https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot/Part_2)
- [Part 3：小阿卡纳图像、78 张传统占断](https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot/Part_3)
- [Sacred Texts 版本与 public domain 声明](https://sacred-texts.com/tarot/pkt/index.htm)

`waite-part2.txt`、`waite-part3.txt` 是网页文本研究快照，包含站点导航，仅作核对材料。应用中的 `src/data/card-references.json` 摘录 Part 3 每张牌对应的历史原书段落，不展示网页导航或后续通用牌阵章节。历史原书属于公版；网站编辑性材料不被当作牌义内容。

## 现代开放资料

- [Corpora 的 tarot_interpretations.json](https://github.com/dariusk/corpora/blob/master/data/divination/tarot_interpretations.json)
- [仓库 CC0 许可声明](https://github.com/dariusk/corpora#license)

`corpora-source.json` 保留获取的数据快照。其说明署名 Mark McElroy, *A Guide to Tarot Meanings*；许可依据为 Corpora 仓库对数据的 CC0 声明，并非独立核实作者所有出版物均适用 CC0。

应用保存并展示 light / shadow 原始条目作为现代参考，不展示 fortune_telling 的确定性预言。light / shadow 表示建设面与挑战面，不直接等同正位与逆位。

## 中文编辑层

`src/data/*-guides.js` 覆盖 78 张牌，每张分别编写图像象征、正位、逆位、关系、事业与反思问题。属于结合原图、原书和现代资料的编辑性综合，不是逐字翻译，也不是某位作者的完整学说。各字段并非声称每句话均出自所列原书。

保留传统与现代解释的差别，例如命运之轮逆位原典有 increase / abundance，星星原典同时记录损失与希望；在中文相关条目直接说明。宫廷牌不固定对应年龄、性别、外貌。历史资料的过时判断保留在明确标识的原典展开区，不作为当前事实判断、医学诊断或收益承诺。

映射：m00–m21 对应现有大阿卡纳次序；w/c/s/p 对应 Wands/Cups/Swords/Coins；01–10 为数字牌，11/12/13/14 为 Page/Knight/Queen/King。洗牌、牌图与档案身份未改变。

验证：`node --test tests/domain.test.mjs tests/card-guides.test.mjs`。
