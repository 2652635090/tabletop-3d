/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

/**
 * 自带牌堆：扑克 54 张、狼人杀角色、塔罗大阿卡纳、潮汐。
 * 全是规则与文字都由本项目自己写的公版/原创内容，可以直接进版本控制。
 *
 * 第三方牌组（《三国杀》《UNO》这类）的文字**不放这里**，走可选牌组包：
 * 把 `public/packs/index.json` 放进去，启动时由 `game/packs.ts` 读一次，
 * 读不到就一个入口都不加。写法见 README 的「可选牌组包」一节与 `docs/pack.example.json`。
 *
 * 卡面不依赖任何图片素材——全部由 three/textures.ts 按 rank/suit/art/cat/label/text 程序化绘制，
 * 所以这些条目就是这套资产的全部内容，改这里等于改卡面。
 */
import type { CardSpec } from "./types";

type Suit = NonNullable<CardSpec["suit"]>;

/* ———— 扑克：52 张 + 大小王 ———— */

const POKER_SUITS: { suit: Suit; cat: string; art: string; color: string }[] = [
  { suit: "s", cat: "黑桃", art: "♠", color: "#1f2430" },
  { suit: "h", cat: "红桃", art: "♥", color: "#c0392b" },
  { suit: "d", cat: "方块", art: "♦", color: "#c0392b" },
  { suit: "c", cat: "梅花", art: "♣", color: "#1f2430" },
];

const POKER_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** 54 张：四门花色各 13 张，再加两张王。大小王没有花色，靠 art 认 */
export function poker54(): CardSpec[] {
  const out: CardSpec[] = [];
  for (const s of POKER_SUITS) {
    for (const rank of POKER_RANKS) {
      out.push({
        back: "poker",
        rank,
        suit: s.suit,
        cat: s.cat,
        art: s.art,
        color: s.color,
        text: ["J", "Q", "K"].includes(rank) ? `${rank}${s.art}：桥牌点值 ${["J", "Q", "K"].indexOf(rank) + 11}，21 点里按 10 算。` : undefined,
      });
    }
  }
  out.push(
    { back: "poker", label: "小王", cat: "JOKER", art: "王", color: "#3d7fbf", text: "小王：仅次于大王的百搭牌，斗地主里最大的单张之一。" },
    { back: "poker", label: "大王", cat: "JOKER", art: "皇", color: "#c8443c", text: "大王：一副牌里最大的一张，压过小王和任何点数。" },
  );
  return out;
}

/* ———— 狼人杀：18 张角色牌，够开一局 9—12 人 ———— */

const WOLF = "#7c2c3a";
const GOD = "#8a5cc4";
const VILLAGE = "#3f9d63";

/** 角色牌：art 是卡面正中那个大字，cat 标阵营，text 写这个角色的规则 */
function role(label: string, cat: string, art: string, color: string, text: string, n = 1): CardSpec[] {
  return Array.from({ length: n }, () => ({ back: "wolf", label, cat, art, color, text }));
}

/**
 * 狼人 4 + 狼王 1 + 六位神职 + 平民 7 = 18 张。
 * 技能描述按民间通用规则自己写的，给沙盒当提示用，不绑定某一套房规。
 */
export function werewolfDeck(): CardSpec[] {
  return [
    ...role("狼人", "狼人阵营", "狼", WOLF, "每晚与狼同伴共同决定一名猎杀对象。白天伪装成村民，凑够票就能把人送出局。", 4),
    ...role("狼王", "狼人阵营", "狂", WOLF, "被投票出局时可以带走一名玩家；被女巫毒死则没有这一脚。"),
    ...role("预言家", "神职", "验", GOD, "每晚查验一名玩家的阵营，法官只回答「好人」或「狼人」。"),
    ...role("女巫", "神职", "药", GOD, "全局各一瓶：解药救回当夜被杀的人，毒药带走一名玩家。同一夜不能两瓶一起用。"),
    ...role("猎人", "神职", "枪", GOD, "被狼夜里杀死或被投票出局时可以开枪带走一人；被女巫毒死后枪哑。"),
    ...role("守卫", "神职", "盾", GOD, "每晚守护一名玩家，当夜免疫狼刀。不能连续两晚守同一人。"),
    ...role("白痴", "神职", "痴", GOD, "被投票出局时翻牌亮明身份，本轮不出局，但从此不能投票。"),
    ...role("骑士", "神职", "剑", GOD, "白天可以决斗一名玩家：他是狼人则立刻出局，是好人则以死谢罪。"),
    ...role("平民", "好人阵营", "民", VILLAGE, "没有技能。靠发言与投票找出狼人，是狼刀下最厚的那层垫子。", 7),
  ];
}

/* ———— 三国杀与 UNO 的牌面文字不在这里 ———— */

/**
 * 那两套牌是别人家的产品：武将名与技能描述、UNO 的牌面构成，都不该进一个开源仓库。
 * 内容本身仍然可以用——按 README 的「可选牌组包」写成 `public/packs/index.json`，
 * 组件库就会多出对应的行；文件不在，那一行就不摆（不留死控件）。
 */

/**
 * 塔罗 · 大阿卡纳 22 张：从 0 号愚者到 21 号世界，罗马数字编号印在点数位。
 * art 用该牌的核心意象单字，cat 归「大阿卡纳」，text 是一句牌意，供桌面提示。
 */
const TAROT_MAJOR: [numeral: string, label: string, art: string, meaning: string][] = [
  ["0", "愚者", "愚", "新的开始、随性而行，一段还没有地图的旅程。"],
  ["I", "魔术师", "魔", "意志与创造力：手头的资源足以把想法变成现实。"],
  ["II", "女祭司", "祭", "直觉与潜流，答案在静默里而非言语中。"],
  ["III", "女皇", "后", "丰饶、滋养与感官的富足。"],
  ["IV", "皇帝", "帝", "结构、权威与靠秩序立起来的疆界。"],
  ["V", "教皇", "法", "传统、信仰与来自既定体系的指引。"],
  ["VI", "恋人", "恋", "选择与联结：价值观的一致性决定走向。"],
  ["VII", "战车", "车", "意志力驱动下的前进与自我掌控。"],
  ["VIII", "力量", "力", "以柔克刚的内在勇气，而非蛮力。"],
  ["IX", "隐者", "隐", "退一步自省，在孤独中寻光。"],
  ["X", "命运之轮", "轮", "转折点，周期转动带来不可抗的变化。"],
  ["XI", "正义", "正", "因果、平衡与诚实的裁量。"],
  ["XII", "倒吊人", "吊", "换个角度看世界，暂时的停滞是一种牺牲。"],
  ["XIII", "死神", "死", "结束与蜕变，旧形式让位给新的。"],
  ["XIV", "节制", "节", "调和、耐心与恰到好处的比例。"],
  ["XV", "恶魔", "魔", "束缚、欲望与被自己困住的模式。"],
  ["XVI", "高塔", "塔", "突如其来的崩塌，摧毁虚假的根基。"],
  ["XVII", "星星", "星", "希望、疗愈与重新抬头相信什么。"],
  ["XVIII", "月亮", "月", "幻象与不安，路还不清楚时放慢脚步。"],
  ["XIX", "太阳", "日", "喜悦、成功与坦荡的光明。"],
  ["XX", "审判", "审", "觉醒、召唤与一次清算后的重生。"],
  ["XXI", "世界", "界", "完成、整合与一段旅程的圆满收束。"],
];

export function tarotMajor(): CardSpec[] {
  return TAROT_MAJOR.map(([rank, label, art, meaning]) => ({
    back: "tarot",
    rank,
    label,
    cat: "大阿卡纳",
    art,
    color: "#6b3fa0",
    text: meaning,
  }));
}

/**
 * 潮汐 · 四种花色：art 是牌面角标用的单字，cat 是花色全名，color 直接取自规则文档的牌色。
 * 顺潮看颜色、叠潮看数字，所以这两样都必须进卡面，缺一样这张牌在桌上就认不出来。
 */
const TIDE_SUITS: { cat: string; art: string; color: string }[] = [
  { cat: "珊瑚", art: "珊", color: "#d1523f" },
  { cat: "海藻", art: "藻", color: "#2c7d63" },
  { cat: "贝壳", art: "贝", color: "#c98a24" },
  { cat: "深海", art: "澜", color: "#35618f" },
];

const TIDE_RUN_TEXT = "顺潮：同色数字相连 3 张以上；1 与 10 不算相连。";
const TIDE_PEARL_TEXT = "潮珠：万能牌，可当任意花色任意数字，每个组合至多用一张。";

/**
 * 44 张《潮汐》：四色 1—10 各一张（40 张）加 4 张潮珠。
 * 潮珠没有数字，所以只给 label 不给 rank——它进不了顺潮的数字序列，只顶替位置。
 */
export function tideDeck(): CardSpec[] {
  const out: CardSpec[] = [];
  for (const s of TIDE_SUITS) {
    for (let n = 1; n <= 10; n++) {
      out.push({ back: "tide", rank: String(n), cat: s.cat, art: s.art, color: s.color, text: TIDE_RUN_TEXT });
    }
  }
  for (let k = 0; k < 4; k++) {
    out.push({ back: "tide", label: "潮珠", cat: "潮珠", art: "珠", color: "#7b6fa8", text: TIDE_PEARL_TEXT });
  }
  return out;
}

/**
 * 自带牌堆目录：组件库「卡牌」页签的那几行从这里来。
 * 可选牌组包不在这张表里，由 `game/packs.ts` 在启动后单独读，读不到就少几行——
 * 宁可少几行，也不摆一排点了没反应的按钮。
 */
export const DECKS: { id: string; name: string; hint: string; make: () => CardSpec[] }[] = [
  { id: "poker", name: "扑克 54 张", hint: "四门花色各 13 张 + 大小王", make: poker54 },
  { id: "werewolf", name: "狼人杀角色", hint: "18 张：狼群 / 神职 / 平民", make: werewolfDeck },
  { id: "tarot", name: "塔罗 · 大阿卡纳", hint: "22 张：从愚者到世界", make: tarotMajor },
  { id: "tide", name: "潮汐 44 张", hint: "四色 1—10 各一张 + 4 张潮珠", make: tideDeck },
];
