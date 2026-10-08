import { ARROW_MAX, ARROW_MIN, BOARD_HOME, BOARDS, BOOK_SECTIONS, PALETTE, SHIELD_DEFAULT, TABLE, TRAY_DEFAULT, blankDeck, cardText, clamp, fixBook, fixCounter, fixGram, fixHour, fixMp3, fixShield, fixSlot, fixSpinner, fixStat, fixTablet, fixTrack, fixTray, fixZone, kindOfShape, matSpec, timerOf, uid } from "./catalog";
import { emptyState, MAX_PILE } from "./state";
import { poker54, tideDeck, werewolfDeck } from "./decks";
import type { CardSpec, GameObject, TableState } from "./types";

/** 新物件的落点：从桌面中心向外螺旋散开，避免叠在一起 */
let placed = 0;
export function nextSpot(): { x: number; z: number } {
  placed += 1;
  const i = placed % 24;
  const ring = Math.floor(i / 8);
  const a = (i % 8) * (Math.PI / 4) + ring * 0.4;
  const r = 0.16 + ring * 0.13;
  return {
    x: Math.max(-TABLE.w / 2 + 0.08, Math.min(TABLE.w / 2 - 0.08, Math.cos(a) * r)),
    z: Math.max(-TABLE.d / 2 + 0.08, Math.min(TABLE.d / 2 - 0.08, Math.sin(a) * r * 0.72 + 0.05)),
  };
}

export function makePiece(shape: string, color: string, at?: { x: number; z: number }, label?: string): GameObject {
  const kind = kindOfShape(shape);
  const spot = at ?? nextSpot();
  return { id: uid(), kind, shape, color, ...(label ? { label } : {}), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

export function makeDie(sides: number, color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid(), kind: "die", sides, color, value: 1, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

export function makeToken(label: string, color: string, count?: number, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid(), kind: "token", label, color, count, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

export function makeCard(card: CardSpec, color: string, at: { x: number; z: number }, faceUp = true, backImg?: string): GameObject {
  return { id: uid(), kind: "card", card, color, x: at.x, z: at.z, rot: 0, layer: 0, faceUp, ...(backImg ? { backImg } : {}) };
}

export function makePile(cards: CardSpec[], color: string, at?: { x: number; z: number }, faceUp = false): GameObject {
  return makeContainer("pile", cards, color, at, faceUp);
}

/** 容器：牌堆/卡牌盒/袋子都只带一堆牌，只是外观和取牌手感不同 */
export function makeContainer(kind: "pile" | "box" | "bag", cards: CardSpec[], color: string, at?: { x: number; z: number }, faceUp = false): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid(), kind, pile: cards.slice(0, MAX_PILE), color, x: spot.x, z: spot.z, rot: 0, layer: 0, faceUp };
}

/** 桌面计时器：初始都是暂停状态，left 等于 duration */
export function makeTimer(seconds: number, color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  const t = timerOf({ duration: seconds, left: seconds, endsAt: null });
  return { id: uid("t"), kind: "timer", color, ...t, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 指针：只用来指东西，位置和朝向就是它的全部状态 */
export function makePointer(color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("p"), kind: "pointer", color, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 路径箭头：从自身位置沿朝向铺 len 米 */
export function makeArrow(color: string, len = 0.3, at?: { x: number; z: number }, rot = 0): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("a"), kind: "arrow", color, len: Math.round(clamp(len, ARROW_MIN, ARROW_MAX) * 1000) / 1000, x: spot.x, z: spot.z, rot, layer: 0 };
}

/** 桌面文字标记：浮在桌面上的标牌 */
export function makeText(label: string, color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("x"), kind: "text", label: label.slice(0, 40), color, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 区域垫：几何圈住物件的贴面矩形，owner 决定谁能选中/看牌，priv 开启后锁定 */
export function makeZone(color: string, w: number, d: number, owner?: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("z"), kind: "zone", color, zone: fixZone({ w, d }), label: "区域", owner, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 垫子：几何与区域垫一样（能圈东西、能当出牌落点），但画成实心的一块垫面，可选贴图 */
export function makePad(color: string, w: number, d: number, owner?: string, img?: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("z"), kind: "zone", color, zone: fixZone({ w, d, pad: true, img }), label: "垫子", owner, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 统计垫：贴面的一块垫子，只数垫上的牌是竖着还是横着，不圈归属也不保密 */
export function makeStatMat(color: string, w: number, d: number, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("s"), kind: "stat", color, stat: fixStat({ w, d }), label: "统计垫", x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 卡槽带：一条贴面的吸附格子带，牌拖近就自动对齐进最近的空槽 */
export function makeSlotStrip(color: string, n: number, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("sl"), kind: "slot", color, slot: fixSlot({ n }), label: "卡槽", x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 桌上 3D 计算器：只带表达式，结果显示由各端算 */
export function makeCalc(color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("k"), kind: "calc", label: "计算器", color, calc: { expr: "" }, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 迷你计数器：读数 0、步进 1 的一小片，拖到卡牌边上就吸住 */
export function makeCounter(color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("n"), kind: "counter", label: "迷你计数器", color, counter: fixCounter({}), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 骰盘：一只开口四壁浅盘，把骰子放进去，挪盘子它们跟着走 */
export function makeTray(color: string, at?: { x: number; z: number }, w = TRAY_DEFAULT.w, d = TRAY_DEFAULT.d): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("dy"), kind: "tray", label: "骰盘", color, tray: fixTray({ w, d }), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 转盘：几等分一面盘，指针停在哪儿由每次「拨一下」算好 */
export function makeSpinner(n: number, color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("w"), kind: "spinner", label: "转盘", color, spinner: fixSpinner({ n }), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 计分轨：一条公共刻度轨，每人一枚位置棋子 */
export function makeTrack(n: number, color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("tk"), kind: "track", label: "计分轨", color, track: fixTrack({ n, marks: [] }), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 牌屏：立在面前的一块挡板，主人坐的那一侧屏前贴着牌就只有自己看得见 */
export function makeShield(color: string, owner?: string, at?: { x: number; z: number }, w = SHIELD_DEFAULT.w, h = SHIELD_DEFAULT.h): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("sd"), kind: "shield", label: "牌屏", color, shield: fixShield({ w, h }), owner, x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 沙漏：摆下来就是一整漏沙子，翻面才起算 */
export function makeHourglass(mins: number, color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("hg"), kind: "hour", label: "沙漏", color, hour: fixHour({ mins, at: null }), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}

/** 规则书：摊开的一本房规小书，首页写着「房规」，翻页与改字都在书面上 */
export function makeBook(color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("bk"), kind: "book", label: "规则书", color, book: fixBook({ page: 0, pages: BOOK_SECTIONS.map((t) => `${t}\n`) }), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}
/** 唱片机：一台空机摆上桌，得有人放张唱片上去才转得起来 */
export function makeGram(color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("gr"), kind: "gram", label: "唱片机", color, gram: fixGram(undefined), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}
/** 随身听：机器摆上桌，歌还在这台机器主人自己的电脑上，按下共享才轮到全桌一起听 */
export function makeMp3(color: string, by = "", at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("mp"), kind: "mp3", label: "随身听", color, mp3: fixMp3({ by }), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}
/** 平板浏览器：一台空机摆上桌，得有人填个地址才开得出页面 */
export function makeTablet(color: string, at?: { x: number; z: number }): GameObject {
  const spot = at ?? nextSpot();
  return { id: uid("tv"), kind: "tablet", label: "平板浏览器", color, tablet: fixTablet(undefined), x: spot.x, z: spot.z, rot: 0, layer: 0 };
}
/** 拿进手牌的牌：不落在桌面上，只在持有者的手牌条里出现 */
export function makeHandCard(card: CardSpec, color: string, owner: string, backImg?: string): GameObject {
  return { ...makeCard(card, color, { x: 0, z: 0 }, false, backImg), owner, hand: true };
}

/** 导入的大图当桌垫：cols/rows 只用来表达长宽比，cell 决定实际米制尺寸 */
export function makeMat(img: string, w: number, h: number, long = 1.3): GameObject {
  const r = Math.max(0.15, Math.min(6.7, w / Math.max(1, h)));
  // 短边取整会把图片拉变形（16:9 变 1.71:1），桌垫不画格子所以留小数
  const side = (v: number) => Math.round(v * 1000) / 1000;
  const cols = r >= 1 ? 12 : side(12 * r);
  const rows = r >= 1 ? side(12 / r) : 12;
  return { id: uid("b"), kind: "board", board: matSpec(img, cols, rows, long), x: 0, z: 0, rot: 0, layer: 0 };
}

export function makeBoard(presetId: string): GameObject | null {  const preset = BOARDS.find((b) => b.id === presetId);
  if (!preset || preset.board.cols === 0) return null;
  // 棋类带来的是「一手一子」；吸附默认就是开的，落点进格不用预设额外声明
  return { id: uid("b"), kind: "board", preset: preset.id, board: preset.board, ...(preset.grid ? { grid: true } : {}), x: BOARD_HOME.x, z: BOARD_HOME.z, rot: 0, layer: 0 };
}

export function boardSetup(presetId: string): Omit<GameObject, "id">[] {
  const preset = BOARDS.find((b) => b.id === presetId);
  if (!preset?.setup) return [];
  return preset.setup(presetId).map((o) => ({ ...o, id: uid() })) as Omit<GameObject, "id">[];
}

/** 开局就洗好牌：Fisher-Yates，反正是沙盒，随时可以再按洗牌 */
function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 《潮汐》规则书的一页页正文：规则本体印在小本子上，桌上就不用再贴一张说明。
 * 每页上限 420 字（BOOK_CHARS），翻页与改字都在书面自己身上走。
 */
const TIDE_BOOK = [
  "潮汐 · 开局\n四人各发 10 张手牌，潮道摊 4 张正面横排，剩下的牌整局不进游戏，谁也不许翻。人少就少发：潮库只用来发牌与补不了牌。",
  "一个回合\n① 从手里放 1 张进潮道；② 从潮道这 5 张里挑 1 张，正面放进自己的收藏区；③ 潮道回到 4 张，永不补牌。拿走潮珠的那一回合可以额外多拿 1 张。\n禁止：跳过回合、一次放 2 张、不放就拿、把手伸进收藏区改牌。",
  "计分\n顺潮 = 同色数字相连 3 张以上，得 张数×3−3。叠潮 = 同数字异色 3 或 4 张，得 张数×4。潮珠是万能牌，一个组合至多用一张；一张牌只进一个组，1 与 10 不算相连，落单的牌不计分。\n选中自己收藏区的牌，右侧会算出最高分与拆法。",
  "结束与平分\n谁把手牌打空，从他这里开始进入收摊：空手的人那一回合只拿不放。当某一轮开始时潮道张数少于人数，桌上的残牌统统沉潮，游戏结束。\n总分相同先比最长的那一组，再比成组的总张数。",
  "变体\n暗潮：潮道开局有 2 张扣着，谁拿走谁当场翻开。\n宽潮道（新手桌）：潮道改 6 张，放 1 拿 1。\n双人加长：两人各 14 张手牌。\n大潮池（2—3 人老玩家）：放 2 拿 1，潮道满 8 张整行沉掉，从潮库翻 4 张开一条新的。",
  "上手提示\n先盯花色，别盯大数字——数字大小在本游戏里完全不加分。\n放牌前看一眼下家的收藏区：他缺的那张，就是你手里最贵的那张。\n潮珠尽早用掉，但别急着交出去——每组只能塞一张，第二张就只是个筹码。",
];

/** 预设牌局：一次性生成整套物件 */
export function starter(kind: string, tableName: string): TableState {
  const state = emptyState(tableName);
  if (kind === "empty") return state;
  if (kind === "cards") {
    const deck = poker54();
    const half = Math.floor(deck.length / 2);
    state.o = [
      makePile(shuffled(deck), "#2c4a7c", { x: -0.16, z: 0.16 }),
      makePile(deck.slice(half), "#7c2c3a", { x: 0.16, z: 0.16 }),
      makeContainer("box", [], "#3d5c46", { x: 0.34, z: 0.16 }, false),
      makeToken("出牌", "#d9a026", 0, { x: 0, z: -0.16 }),
    ];
    return state;
  }
  if (kind === "werewolf") {
    // 18 张角色牌一叠发完就够 9—12 人；计时器当夜晚的限时，警徽是警长标记
    state.o = [
      makePile(shuffled(werewolfDeck()), "#7c2c3a", { x: -0.2, z: 0.12 }),
      makeContainer("box", [], "#3d5c46", { x: 0.2, z: 0.12 }, false),
      makeToken("警徽", "#d9a026", 1, { x: 0, z: -0.2 }),
      makeToken("出局", "#6b7280", 0, { x: 0.12, z: -0.2 }),
      { ...makeTimer(45, "#8a5cc4", { x: -0.42, z: -0.16 }), label: "夜晚" },
      makeText("天黑请闭眼", "#8a5cc4", { x: 0.42, z: -0.24 }),
    ];
    return state;
  }
  if (kind === "rpg") {
    const board = makeBoard("grid6");
    state.o = [
      ...(board ? [board] : []),
      makeDie(20, "#c8443c", { x: -0.5, z: 0.3 }),
      makeDie(12, "#3d7fbf", { x: -0.42, z: 0.36 }),
      makeDie(6, "#3f9d63", { x: -0.34, z: 0.3 }),
      makeDie(6, "#3f9d63", { x: -0.27, z: 0.36 }),
      makePiece("pawn", PALETTE[0], { x: -0.2, z: -0.1 }),
      makePiece("pawn", PALETTE[1], { x: -0.05, z: -0.1 }),
      makePiece("cube", PALETTE[3], { x: 0.1, z: -0.1 }),
      makeToken("先攻", "#8a5cc4", 1, { x: 0.48, z: 0.3 }),
      makeToken("伤害", "#c8443c", 0, { x: 0.56, z: 0.3 }),
      makeContainer("bag", blankDeck(6, "遭遇"), "#8a5cc4", { x: 0.62, z: 0.42 }),
    ];
    return state;
  }
  if (kind === "monopoly") {
    const board = makeBoard("ring40");
    state.o = [
      ...(board ? [board] : []),
      makePile(poker54(), "#2c4a7c", { x: 0, z: 0.55 }),
      makePile([], "#7c2c3a", { x: 0.09, z: 0.55 }, false),
      makeDie(6, "#c8443c", { x: -0.08, z: 0.5 }),
      makeDie(6, "#c8443c", { x: -0.15, z: 0.55 }),
      ...[0, 1, 2, 3].map((i) => makePiece("pawn", PALETTE[i], { x: -0.03 + i * 0.03, z: 0.42 })),
      ...Array.from({ length: 8 }, (_, i) => makeToken("钱", "#3f9d63", 100 * (i + 1), { x: 0.2 + (i % 4) * 0.04, z: 0.42 + Math.floor(i / 4) * 0.04 })),
    ];
    return state;
  }
  if (kind === "tide") {
    // 44 张全数上桌：潮道先摊开 4 张正面，剩下的 40 张压在潮库里，一发牌就分掉了
    const deck = shuffled(tideDeck());
    const lane = deck.slice(0, 4);
    const stock = deck.slice(4);
    state.o = [
      makePile(stock, "#35618f", { x: -0.3, z: -0.42 }),
      { ...makePile([], "#6b7280", { x: 0.3, z: -0.42 }), label: "沉潮" },
      { ...makePad("#35618f", 0.33, 0.13, undefined, undefined, { x: 0, z: -0.12 }), label: "潮道" },
      ...lane.map((c, i) => makeCard(c, "#35618f", { x: -0.105 + i * 0.07, z: -0.12 })),
      ...[0, 1, 2, 3].map((i) => ({ ...makeZone("#2f9e9b", 0.46, 0.34, undefined, { x: -0.72 + i * 0.48, z: 0.34 }), label: `收藏区 ${i + 1}` })),
      { ...makeBook("#35618f", { x: 0.95, z: -0.1 }), book: fixBook({ page: 0, pages: TIDE_BOOK }) },
    ];
    return state;
  }
  const preset = BOARDS.find((b) => b.id === kind);
  if (preset) {
    const board = makeBoard(kind);
    state.o = [
      ...(board ? [board] : []),
      ...(boardSetup(kind) as GameObject[]),
    ];
    // 只有靠掷骰推进的盘才配骰子：象棋围棋摆开就是开局，塞个骰子没用
    if (preset.die) state.o.push(makeDie(6, "#c8443c", { x: 0.55, z: 0.45 }));
    return state;
  }
  return state;
}

export function deckOf(n: number, prefix = "卡"): CardSpec[] {
  return Array.from({ length: Math.min(60, Math.max(1, n)) }, (_, i) => ({ back: "plain", label: `${prefix} ${i + 1}` }));
}

export function cardName(card?: CardSpec): string {
  return cardText(card) || "空白卡";
}
