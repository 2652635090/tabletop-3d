import type { BookSpec, BoardSpec, CardSpec, CounterSpec, GameObject, GramSpec, HourSpec, Kind, Mp3Spec, ShieldSpec, SpinnerSpec, TabletSpec, TrackMark, TrackSpec, ZoneSpec } from "./types";

export const PALETTE = [
  "#c8443c", "#3d7fbf", "#3f9d63", "#d9a026", "#8a5cc4", "#2f9e9b",
  "#d0693f", "#6b7280", "#1f2937", "#f2efe6",
];

export const DICE_COLORS = PALETTE.slice(0, 8);

/** 卡面图片 key 的形状：内容哈希，桌面状态里只带这个短串 */
export const IMAGE_KEY = /^[a-z0-9]{6,24}$/;

/** 一张标准牌：63x90 毫米，比例 0.7。带图的牌按图改形，但不改到这条基准以外 */
export const CARD_BASE = { w: 0.063, d: 0.09 };
/** 比例超过这个范围就不当牌看了：再宽是横幅，再窄是书签 */
export const CARD_RATIO_MIN = 0.34;
export const CARD_RATIO_MAX = 2.9;
/** 卡形边长的硬上下限：保证还塞得进盒口、也还点得中 */
const CARD_SIDE_MIN = 0.034;
const CARD_SIDE_MAX = 0.112;
const CARD_AREA = CARD_BASE.w * CARD_BASE.d;
const CARD_DIAG = Math.hypot(CARD_BASE.w, CARD_BASE.d);

/** 比例合法的收口：脏值直接不认，超界的夹到横幅/书签两端 */
export function fixRatio(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  if (v < 0.05 || v > 20) return undefined;
  return Math.min(CARD_RATIO_MAX, Math.max(CARD_RATIO_MIN, v));
}

/**
 * 卡面有图时的牌形：等面积优先，所以方图不会比标准牌大一圈；
 * 等面积会顶出边界的（很宽或很高）就整体缩回限内，宁可小一点也不让一张牌占半张桌。
 */
export function cardShape(ratio?: number): { w: number; d: number } {
  const r = fixRatio(ratio) ?? CARD_BASE.w / CARD_BASE.d;
  let w = Math.min(CARD_SIDE_MAX, Math.sqrt(CARD_AREA * r));
  let d = w / r;
  if (d > CARD_SIDE_MAX) {
    d = CARD_SIDE_MAX;
    w = d * r;
  }
  if (w < CARD_SIDE_MIN || d < CARD_SIDE_MIN) {
    const k = CARD_SIDE_MIN / Math.min(w, d);
    w *= k;
    d *= k;
  }
  return { w, d };
}

/** 这件东西的牌形：单张看自己，牌堆/盒/袋看顶牌——一整叠只能是一个尺寸 */
export function shapeOf(o: GameObject): { w: number; d: number } {
  if (o.kind === "card") return cardShape(o.card?.ratio);
  if (o.kind === "pile" || o.kind === "box" || o.kind === "bag") return cardShape(o.pile?.at(-1)?.ratio);
  return { ...CARD_BASE };
}

let seq = 0;
export function uid(prefix = "o"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36).slice(-5)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** 桌布尺寸（米） */
export const TABLE = { w: 2.4, d: 1.6, h: 0.75, rim: 0.06 };

/**
 * 棋盘在桌上的初始位置：整体往后挪 2 分给玩家留出伸手的地方。
 * 自动摆子要按这个落点算，否则整盘棋会往观众侧滑出半格。
 */
export const BOARD_HOME = { x: 0, z: -0.02 };

export interface ShapeInfo {
  id: string;
  name: string;
  kind: Kind;
  hint?: string;
}

export const SHAPES: ShapeInfo[] = [
  { id: "pawn", name: "兵", kind: "pawn", hint: "高身圆柱棋子" },
  { id: "tall", name: "立桩", kind: "pawn", hint: "细高标记桩" },
  { id: "meeple", name: "米宝", kind: "pawn", hint: "工人剪影" },
  { id: "flag", name: "王冠旗", kind: "pawn", hint: "起始玩家标记" },
  { id: "disc", name: "圆片", kind: "disc", hint: "跳棋/圆片" },
  { id: "coin", name: "筹码", kind: "disc", hint: "厚筹码" },
  { id: "cube", name: "方块", kind: "cube", hint: "工人/资源块" },
  { id: "bar", name: "长条", kind: "cube", hint: "多米诺/骨牌" },
  { id: "tri", name: "三角片", kind: "cube", hint: "三角指示片，尖头指方向" },
  { id: "star", name: "五角星", kind: "cube", hint: "星形标记，胜利/奖励" },
];

/**
 * 每一形棋子归哪一类：立体的算 pawn，扁片算 disc，其余是方块。
 * 摆子、放子都按这张表认，不然国际象棋的「chess-king」会被当成方块码。
 */
export const SHAPE_KIND: Record<string, Kind> = {
  pawn: "pawn", tall: "pawn", meeple: "pawn", flag: "pawn",
  "chess-pawn": "pawn", "chess-rook": "pawn", "chess-knight": "pawn", "chess-bishop": "pawn", "chess-queen": "pawn", "chess-king": "pawn",
  disc: "disc", coin: "disc", piece: "disc", stone: "disc", puck: "disc", man: "disc",
};

export function kindOfShape(shape: string): Kind {
  return SHAPE_KIND[shape] ?? "cube";
}

export interface BoardPreset {
  id: string;
  name: string;
  board: BoardSpec;
  /** 自动布子 */
  setup?: (idPrefix: string) => Omit<GameObject, "id">[];
  /** 开局就把网格锁定打开：棋类一手一子，摆歪了这盘就废了 */
  grid?: boolean;
  /** 开局附带一颗 d6：跑道、战棋要掷骰，五盘棋类不要 */
  die?: boolean;
  /** 踩子即吃：落点压在异色子上就把它拿掉。象棋一子一吃；围棋靠围，压上去不算吃 */
  take?: boolean;
  /** 开局子就摆在这盘面上：「摆回开局」才有得摆。围棋那四十枚摊在盘边的不算 */
  opening?: boolean;
  /** 这套棋的行棋规矩挂在哪个规则集上：认得出角色才点得出可行落点，没有就一律不给点位 */
  rule?: string;
}

const cellOf = (cols: number, rows: number, cell: number, theme: string): BoardSpec => ({
  layout: "grid", cols, rows, cell, theme,
});

export const BOARDS: BoardPreset[] = [
  { id: "none", name: "纯桌布", board: { layout: "grid", cols: 0, rows: 0, cell: 0.075, theme: "felt" } },
  {
    id: "chess",
    name: "国际象棋 8×8",
    board: cellOf(8, 8, 0.082, "checker"),
    setup: (p) => standardChess(p),
    grid: true,
    opening: true,
  },
  {
    id: "checkers",
    name: "跳棋 8×8",
    board: cellOf(8, 8, 0.082, "checker"),
    setup: (p) => checkers(p),
    grid: true,
    opening: true,
  },
  {
    id: "xiangqi",
    name: "中国象棋 9×10",
    board: { layout: "lines", cols: 9, rows: 10, cell: 0.058, theme: "xiangqi" },
    setup: (p) => xiangqi(p),
    grid: true,
    take: true,
    opening: true,
    rule: "xiangqi",
  },
  {
    id: "gomoku",
    name: "五子棋 15×15",
    board: { layout: "lines", cols: 15, rows: 15, cell: 0.05, theme: "wood" },
    setup: (p) => stoneSet(p, "puck"),
    grid: true,
    rule: "gomoku",
  },
  {
    id: "go9",
    name: "围棋 9×9",
    board: { layout: "lines", cols: 9, rows: 9, cell: 0.058, theme: "wood" },
    setup: (p) => stoneSet(p, "stone"),
    grid: true,
  },
  {
    id: "go13",
    name: "围棋 13×13",
    board: { layout: "lines", cols: 13, rows: 13, cell: 0.046, theme: "wood" },
    setup: (p) => stoneSet(p, "stone"),
    grid: true,
  },
  {
    id: "go",
    name: "围棋 19×19",
    board: { layout: "lines", cols: 19, rows: 19, cell: 0.042, theme: "wood" },
    setup: (p) => stoneSet(p, "stone"),
    grid: true,
  },
  {
    id: "ring40",
    name: "环形 40 格",
    // 环形一圈是 4·(cols-1) 格，要 40 格就得 11 列——照 10 列摆出来只有 36 格，名不副实
    board: { layout: "ring", cols: 11, rows: 11, cell: 0.072, theme: "ring" },
    setup: (p) => ringRunners(p, 4),
    die: true,
  },
  {
    id: "track24",
    name: "环形 24 格",
    board: { layout: "ring", cols: 7, rows: 7, cell: 0.085, theme: "candy" },
    setup: (p) => ringRunners(p, 4),
    die: true,
  },
  {
    id: "hex7",
    name: "六边形 7×7",
    board: { layout: "hex", cols: 7, rows: 7, cell: 0.055, theme: "slate" },
    setup: (p) => hexSquad(p),
    die: true,
  },
  {
    id: "hex10",
    name: "六边形 10×8",
    board: { layout: "hex", cols: 10, rows: 8, cell: 0.048, theme: "slate" },
    setup: (p) => hexSquad(p),
    die: true,
  },
  {
    id: "hex11",
    name: "六边形 11×11",
    board: { layout: "hex", cols: 11, rows: 11, cell: 0.04, theme: "slate" },
    setup: (p) => hexSquad(p),
    die: true,
  },
  {
    id: "grid6",
    name: "战棋 6×10",
    board: cellOf(10, 6, 0.09, "sand"),
    setup: (p) => gridUnits(p),
    die: true,
  },
  {
    id: "draughts",
    name: "国际跳棋 10×10",
    board: cellOf(10, 10, 0.062, "checker"),
    setup: (p) => checkers(p, 4),
    grid: true,
    opening: true,
  },
  {
    id: "reversi",
    name: "黑白棋 8×8",
    board: cellOf(8, 8, 0.078, "checker"),
    setup: (p) => reversi(p),
    grid: true,
    opening: true,
  },
  {
    id: "ttt",
    name: "井字棋 3×3",
    board: cellOf(3, 3, 0.13, "wood"),
    grid: true,
  },
];

/** 一句话说明这块盘开局给什么：组件库的格子用它，别处也不再各写一套文案 */
export function boardHint(b: BoardPreset): string {
  const gear = b.setup ? (b.die ? "含自动摆子 + 骰子" : "含自动摆子") : b.die ? "空格盘 + 骰子" : "空白棋盘";
  const how = b.grid ? "开局锁网格，一手一子" : "吸附默认开着，落点进格";
  return `${how} · ${gear}`;
}

export const CARD_BACKS = ["classic", "weave", "plain", "poker", "wolf", "tarot", "tide"];
/** 内置卡背的中文名，卡牌管理与选中栏共用 */
export const CARD_BACK_NAMES: Record<string, string> = {
  classic: "花纹",
  weave: "编织",
  plain: "纯色",
  poker: "扑克格",
  wolf: "狼纹",
  tarot: "塔罗",
  tide: "潮汐",
};
/** 卡面类别文案与徽记的长度上限：桌面状态要留在额度内 */
export const CARD_CAT_MAX = 12;
export const CARD_ART_MAX = 4;

export function blankDeck(n = 10, label = "空白卡"): CardSpec[] {
  return Array.from({ length: n }, (_, i) => ({ back: "plain", label: `${label} ${i + 1}` }));
}

export function suitColor(suit?: CardSpec["suit"]): string {
  return suit === "h" || suit === "d" ? "#c0392b" : "#1f2430";
}

export const SUIT_GLYPH: Record<NonNullable<CardSpec["suit"]>, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

/** 一张牌在记录、列表和手牌条上的一行名字：带效果文字的游戏牌要一起报出来 */
export function cardText(card?: CardSpec): string {
  if (!card) return "";
  const name = card.label ?? "";
  if (card.rank) {
    const pip = card.suit ? `${card.rank}${SUIT_GLYPH[card.suit]}` : card.rank;
    return name ? `${pip} ${name}` : pip;
  }
  return name || card.art || "";
}

/** 卡名与效果文本的长度上限：桌面状态要留在额度内 */
export const CARD_LABEL_MAX = 20;
export const CARD_TEXT_MAX = 240;
/** 内置卡背样式之外的自定义卡背走图片 key */
export const TIMER_MIN = 1;
export const TIMER_MAX = 3600;
export const ARROW_MIN = 0.06;
export const ARROW_MAX = 1.6;

/** 卡牌字段的收口：超长截断、非法图片 key 丢掉，保证各端归约出的状态一致 */
export function fixCard(spec?: CardSpec): CardSpec | undefined {
  if (!spec || typeof spec !== "object") return undefined;
  const out: CardSpec = { back: typeof spec.back === "string" && CARD_BACKS.includes(spec.back) ? spec.back : "plain" };
  if (typeof spec.rank === "string") out.rank = spec.rank.slice(0, 3);
  if (spec.suit === "s" || spec.suit === "h" || spec.suit === "d" || spec.suit === "c") out.suit = spec.suit;
  if (typeof spec.label === "string" && spec.label.length) out.label = spec.label.slice(0, CARD_LABEL_MAX);
  if (typeof spec.art === "string" && spec.art.length) out.art = spec.art.slice(0, CARD_ART_MAX);
  if (typeof spec.cat === "string" && spec.cat.length) out.cat = spec.cat.slice(0, CARD_CAT_MAX);
  if (typeof spec.text === "string" && spec.text.length) out.text = spec.text.slice(0, CARD_TEXT_MAX);
  if (typeof spec.color === "string" && /^#[0-9a-fA-F]{6}$/.test(spec.color)) out.color = spec.color.toLowerCase();
  if (typeof spec.img === "string" && IMAGE_KEY.test(spec.img)) out.img = spec.img;
  // 无边框只在真有卡面图时保留：没有图的牌本来就是一张版式卡
  if (spec.borderless === true && out.img) out.borderless = true;
  // 牌形比例同样只跟图走：比例夹进 0.34~2.9，脏值一律丢
  const ratio = fixRatio(spec.ratio);
  if (ratio && out.img) out.ratio = ratio;
  return out;
}

/** 卡背图片 key 只在合法时保留 */
export function fixBackImg(v: unknown): string | undefined {
  return typeof v === "string" && IMAGE_KEY.test(v) ? v : undefined;
}

export function timerOf(o: Pick<GameObject, "duration" | "left" | "endsAt">): { duration: number; left: number; endsAt: number | null } {
  const duration = clamp(Math.round(Number(o.duration) || 0), TIMER_MIN, TIMER_MAX);
  const left = clamp(Math.round(Number(o.left) || 0), 0, TIMER_MAX);
  const at = Number(o.endsAt);
  return { duration, left, endsAt: Number.isFinite(at) && at > 0 ? Math.round(at) : null };
}

/** 剩余秒数：运行中按本地时钟算，暂停时读 left */
export function remainingOf(o: Pick<GameObject, "duration" | "left" | "endsAt">, now = Date.now()): number {
  const t = timerOf(o);
  if (t.endsAt === null) return t.left;
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** 白子偏暖象牙、黑子偏墨，国际象棋和跳棋共用这一对，摆在盘上才像一副 */
export const CHESS_COLORS: [string, string] = ["#f3ece0", "#2c2723"];

/** 六个角色和各自的中文叫法：开局摆子、组件库按钮都读这张表 */
export const CHESS_ROLES: { shape: string; name: string }[] = [
  { shape: "chess-pawn", name: "兵" },
  { shape: "chess-rook", name: "车" },
  { shape: "chess-knight", name: "马" },
  { shape: "chess-bishop", name: "象" },
  { shape: "chess-queen", name: "后" },
  { shape: "chess-king", name: "王" },
];

/** 开局拿自己那块盘的规格：摆子坐标和棋盘贴图必须同源，不然子坐不到线上 */
function presetSpec(id: string): BoardSpec | null {
  return BOARDS.find((b) => b.id === id)?.board ?? null;
}

/** 规格签名：格子一样、边长一样、主题一样就是同一张盘 */
const specKey = (b: BoardSpec) => `${b.layout}|${b.cols}|${b.rows}|${b.cell}|${b.theme}`;

/**
 * 这块盘是哪张预设摆出来的：先认物件身上记的预设 id，没带回来（老房间）就按规格找，
 * 只有一张对得上才敢认——国际象棋和跳棋规格完全相同，猜错就把开局摆成另一套子。
 */
export function presetOf(board: GameObject): BoardPreset | null {
  const spec = board.board;
  if (!spec) return null;
  const key = specKey(spec);
  const byId = board.preset ? BOARDS.find((b) => b.id === board.preset) : null;
  if (byId && specKey(byId.board) === key) return byId;
  const hits = BOARDS.filter((b) => specKey(b.board) === key);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * 格心坐标：直接走 `cellFor`，和拖动吸附同一套算法。
 * 开局摆出来的子和吸附落点分毫不差，锁网格后不会再被推开重排。
 */
function atCell(spec: BoardSpec, cell: number, dx = 0, dz = 0) {
  const at = cellFor(spec, cell);
  return { x: BOARD_HOME.x + (at?.x ?? 0) + dx, z: BOARD_HOME.z + (at?.z ?? 0) + dz };
}

function onCell(spec: BoardSpec, col: number, row: number, dx = 0, dz = 0) {
  return atCell(spec, row * spec.cols + col, dx, dz);
}

/** 标准棋局摆法：后 ranks 一字排开，兵成一线，六角色各有自己的身形 */
function standardChess(p: string): Omit<GameObject, "id">[] {
  const spec = presetSpec(p);
  if (!spec) return [];
  const [light, dark] = CHESS_COLORS;
  const back = ["chess-rook", "chess-knight", "chess-bishop", "chess-queen", "chess-king", "chess-bishop", "chess-knight", "chess-rook"];
  const out: Omit<GameObject, "id">[] = [];
  const put = (shape: string, color: string, col: number, row: number) => {
    out.push({ kind: "pawn", shape, color, layer: 0, rot: 0, ...onCell(spec, col, row) } as Omit<GameObject, "id">);
  };
  for (let c = 0; c < 8; c++) {
    put(back[c], dark, c, 0);
    put("chess-pawn", dark, c, 1);
    put("chess-pawn", light, c, 6);
    put(back[c], light, c, 7);
  }
  return out;
}

/** 深色格摆子：英式跳棋铺三排（每方 12 枚），国际跳棋铺四排（每方 20 枚） */
function checkers(p: string, ranks = 3): Omit<GameObject, "id">[] {
  const spec = presetSpec(p);
  if (!spec) return [];
  const out: Omit<GameObject, "id">[] = [];
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      // 跳棋只走深色格：开局就把子摆在各自那格里
      if ((r + c) % 2 !== 1) continue;
      if (r < ranks || r > spec.rows - 1 - ranks) {
        const color = r < ranks ? CHESS_COLORS[1] : CHESS_COLORS[0];
        out.push({ kind: "disc", shape: "man", color, layer: 0, rot: 0, ...onCell(spec, c, r) } as Omit<GameObject, "id">);
      }
    }
  }
  return out;
}

/** 黑白两色：围棋、五子共用一套，深子偏墨黑，浅子是贝壳白 */
export const GO_COLORS: [string, string] = ["#14151a", "#f4f1e8"];

/** 象棋子的两色刻字：红先黑后，每边七种字，供开局摆子和组件库共用 */
export const XIANGQI_GLYPHS: { color: string; glyphs: string[] }[] = [
  { color: "#b8322a", glyphs: ["帥", "仕", "相", "馬", "車", "炮", "兵"] },
  { color: "#26262b", glyphs: ["將", "士", "象", "馬", "車", "砲", "卒"] },
];

/**
 * 每一套行棋规矩登记的两家涂色（顺序就是 0 家 / 1 家，规则引擎按这个序号算敌我）。
 * 登记了就不认第三色：一子一色，涂成别的颜色在这盘上谁都吃不了它，也别说它被谁吃了。
 */
export const RULE_CAMPS: Record<string, [string, string]> = {
  xiangqi: [XIANGQI_GLYPHS[0].color, XIANGQI_GLYPHS[1].color],
  gomoku: GO_COLORS,
};

/** 两家名号（顺序跟 RULE_CAMPS 对齐）：裁判播报胜负要用「红方已被将死」这种话，别报颜色码 */
export const RULE_CAMP_NAMES: Record<string, [string, string]> = {
  xiangqi: ["红方", "黑方"],
  gomoku: ["黑棋", "白棋"],
};

export interface PieceItem { shape: string; name: string; label?: string }
export interface PieceSide { name: string; color: string; items: PieceItem[] }

/**
 * 每一套棋的专属棋子，按「方」分行：开局摆子、组件库的按钮都读这一份，
 * 所以加一套棋只要在这里添一行，不用再去 UI 里抄一遍按钮。
 */
export interface PieceSet { id: string; name: string; hint: string; sides: PieceSide[] }

const oneShape = (colors: [string, string], names: [string, string], shape: string, label: string): PieceSide[] =>
  colors.map((color, i) => ({ name: names[i], color, items: [{ shape, name: label }] })) as PieceSide[];

export const PIECE_SETS: PieceSet[] = [
  {
    id: "chess",
    name: "国际象棋",
    hint: "六个角色各有身形：王后车象兵马，一格一子",
    sides: [
      { name: "白方", color: CHESS_COLORS[0], items: CHESS_ROLES.map((r) => ({ shape: r.shape, name: r.name })) },
      { name: "黑方", color: CHESS_COLORS[1], items: CHESS_ROLES.map((r) => ({ shape: r.shape, name: r.name })) },
    ],
  },
  {
    id: "xiangqi",
    name: "中国象棋",
    hint: "圆木子上刻字，红黑两边的字不一样",
    sides: XIANGQI_GLYPHS.map((g, i) => ({
      name: i === 0 ? "红方" : "黑方",
      color: g.color,
      items: g.glyphs.map((ch) => ({ shape: "piece", name: ch, label: ch })),
    })),
  },
  {
    id: "go",
    name: "围棋子",
    hint: "双面凸的黑白子，一手一子",
    sides: oneShape(GO_COLORS, ["黑方", "白方"], "stone", "棋子"),
  },
  {
    id: "gomoku",
    name: "五子",
    hint: "平凸的黑白子，比围棋子大一圈",
    sides: oneShape(GO_COLORS, ["黑方", "白方"], "puck", "棋子"),
  },
  {
    id: "checkers",
    name: "跳棋人",
    hint: "带凸缘的扁子。摞起来称王得先关掉这盘的网格锁定，开着就一格一子",
    sides: oneShape([CHESS_COLORS[1], CHESS_COLORS[0]], ["黑方", "白方"], "man", "棋人"),
  },
];

/**
 * 黑白子摆在盘边：容器只装卡牌，棋罐盛不了子，所以摊成方阵放在棋盘右手边。
 * 每色 5 列 4 行，两色上下相接排成一长条——并排摆的话整条宽度会伸出桌面右沿。
 */
function stoneSet(p: string, shape: "stone" | "puck"): Omit<GameObject, "id">[] {
  const spec = presetSpec(p);
  if (!spec) return [];
  const gap = pieceSize(shape).r * 2.6;
  const x0 = boardSize(spec).w / 2 + 0.07;
  const out: Omit<GameObject, "id">[] = [];
  GO_COLORS.forEach((color, i) => {
    for (let k = 0; k < 20; k++) {
      out.push({
        kind: "disc", shape, color, layer: 0, rot: 0,
        x: x0 + (k % 5) * gap,
        z: (i * 4 + Math.floor(k / 5)) * gap - 3.5 * gap,
      } as Omit<GameObject, "id">);
    }
  });
  return out;
}

/** 黑白棋起手：中央四子对角同色，另两格换色——绿子先手，摆在 (4,4)(5,5)，浅子 (4,5)(5,4) */
function reversi(p: string): Omit<GameObject, "id">[] {
  const spec = presetSpec(p);
  if (!spec) return [];
  const [light, dark] = GO_COLORS;
  const out: Omit<GameObject, "id">[] = [];
  const put = (col: number, row: number, color: string) => {
    out.push({ kind: "disc", shape: "disc", color, layer: 0, rot: 0, ...onCell(spec, col, row) } as Omit<GameObject, "id">);
  };
  put(3, 3, dark); put(4, 4, dark);
  put(3, 4, light); put(4, 3, light);
  return out;
}

/** 环形跑道：几人抢跑就摆几枚，各占一格排在起点往后。环形的格号就是它自己那一圈 */
function ringRunners(p: string, n: number): Omit<GameObject, "id">[] {
  const spec = presetSpec(p);
  if (!spec) return [];
  return Array.from({ length: n }, (_, i) => ({
    kind: "pawn", shape: "pawn", color: PALETTE[i % PALETTE.length], layer: 0, rot: 0,
    ...atCell(spec, i),
  }) as Omit<GameObject, "id">);
}

/** 蜂窝战棋：两拨小人各占三角，摆在各自那半边 */
function hexSquad(p: string): Omit<GameObject, "id">[] {
  const spec = presetSpec(p);
  if (!spec) return [];
  const out: Omit<GameObject, "id">[] = [];
  const put = (col: number, row: number, color: string, shape: string) => {
    out.push({ kind: "pawn", shape, color, layer: 0, rot: 0, ...onCell(spec, col, row) } as Omit<GameObject, "id">);
  };
  for (let i = 0; i < 3; i++) {
    put(i, 0, PALETTE[0], "pawn");
    put(spec.cols - 1 - i, spec.rows - 1, PALETTE[1], "pawn");
  }
  put(0, 1, PALETTE[0], "tall");
  put(spec.cols - 1, spec.rows - 2, PALETTE[1], "tall");
  return out;
}

/** 方格战棋：左右各三枚兵加一枚指挥，开局就有对峙的样子 */
function gridUnits(p: string): Omit<GameObject, "id">[] {
  const spec = presetSpec(p);
  if (!spec) return [];
  const out: Omit<GameObject, "id">[] = [];
  for (let r = 1; r <= 3; r++) {
    out.push({ kind: "pawn", shape: "pawn", color: PALETTE[0], layer: 0, rot: 0, ...onCell(spec, 1, r) } as Omit<GameObject, "id">);
    out.push({ kind: "pawn", shape: "pawn", color: PALETTE[1], layer: 0, rot: 0, ...onCell(spec, spec.cols - 2, r) } as Omit<GameObject, "id">);
  }
  out.push({ kind: "pawn", shape: "tall", color: PALETTE[0], layer: 0, rot: 0, ...onCell(spec, 0, 2) } as Omit<GameObject, "id">);
  out.push({ kind: "pawn", shape: "tall", color: PALETTE[1], layer: 0, rot: 0, ...onCell(spec, spec.cols - 1, 2) } as Omit<GameObject, "id">);
  return out;
}

/**
 * 象棋开局：9 条竖线（file 0—8）× 10 条横线（rank 0—9，0 在远侧）。
 * 子坐在线的交点上，坐标就交给 onCell —— 和吸附、贴图同一个格心，谁也不差半格。
 */
function xiangqi(p: string): Omit<GameObject, "id">[] {
  const spec = presetSpec(p);
  if (!spec) return [];
  const [red, black] = XIANGQI_GLYPHS.map((g) => g.color) as [string, string];
  const out: Omit<GameObject, "id">[] = [];
  const put = (color: string, label: string, file: number, rank: number) => {
    out.push({
      kind: "disc", shape: "piece", color, label, layer: 0, rot: 0,
      ...onCell(spec, file, rank),
    } as Omit<GameObject, "id">);
  };
  const home = ["車", "馬", "相", "仕", "帥", "仕", "相", "馬", "車"];
  const away = ["車", "馬", "象", "士", "將", "士", "象", "馬", "車"];
  for (let f = 0; f < 9; f++) {
    put(black, away[f], f, 0);
    put(red, home[f], f, 9);
  }
  for (const f of [1, 7]) {
    put(black, "砲", f, 2);
    put(red, "炮", f, 7);
  }
  for (const f of [0, 2, 4, 6, 8]) {
    put(black, "卒", f, 3);
    put(red, "兵", f, 6);
  }
  return out;
}

/**
 * 桌布嵌板离桌面的高度。贴面薄片（区域垫、指针光点）都按这个面来浮，
 * 少了它这些片会被自己脚下的桌布糊住，看起来像掉进了桌面里。
 */
export const FELT_Y = 0.0016;

/** 区域垫这类贴面薄片的悬浮量：越过桌布嵌板才看得见，同时小到不会和卡面抢深度 */
export const DECAL_LIFT = 0.0009;

/** 棋子 resting 高度：桌布 0.0016 → 桌垫 0.006 → 棋盘 0.022 */
export function surfaceY(state: { o: GameObject[] }, x: number, z: number): number {
  const board = state.o.find((b) => b.kind === "board" && onBoard(b, x, z));
  if (!board?.board) return FELT_Y;
  return Math.max(FELT_Y, board.layer * 0.004 + boardThickness(board.board));
}

/** 每往上叠一层抬多高（米）：牌厚 2.4mm，留一点余量免得贴合面闪 */
export const LAYER_H = 0.004;
/** 最高能叠到第几层：0.84m，够一只装满牌的盒子（约 0.27m）放大到三倍还能把筹码停在顶面上 */
export const LAYER_MAX = 210;

/** 俯仰角范围：±80° 够把牌斜靠起来，再多就是倒扣过来看不见牌面了 */
export const TILT_MAX = 80;

export function clampTilt(v: number): number {
  return Math.round(clamp(Number.isFinite(v) ? v : 0, -TILT_MAX, TILT_MAX) * 10) / 10;
}

/** 棋盘自己就是台面，区域垫、统计垫与卡槽带是贴面薄片：这三类不参与高度锁定 */
export function pinnable(o: GameObject): boolean {
  return !o.hand && o.kind !== "board" && !DECAL_KINDS.includes(o.kind);
}

export const BOARD_THICK = 0.022;
export const MAT_THICK = 0.006;
/** 尖顶六边形一格的多宽：√3 倍边长（cell 是中心到顶点的距离） */
export const HEX_W = Math.sqrt(3);

/**
 * 交叉线棋盘（围棋、五子棋、象棋）：最外一圈线离嵌板边缘留这么多「格」。
 * 线阵本身只占 cols-1 格宽，画线的贴图和落子的吸附都从这一个数换算出来，
 * 两边各自算一套的话棋子就会压在线上而不是坐在交点上。
 */
export const LINES_BORDER = 1.4;

/** 象棋子的半径与厚度（米）：直径留够 0.009 的缝，摆满一排也不会互相挤开 */
export const PIECE_R = 0.0245;
export const PIECE_H = 0.011;

/**
 * 每一形棋子的底盘半径与总高（米）。渲染几何、碰撞盒、开局摆子都读这一份：
 * 尺寸只在各自棋盘的格子里留得下缝，落下去才不会互相挤开、才谈得上一格一子。
 */
export const PIECE_SIZE: Record<string, { r: number; h: number }> = {
  disc: { r: 0.0225, h: 0.0085 },
  coin: { r: 0.0205, h: 0.0135 },
  piece: { r: PIECE_R, h: PIECE_H },
  // 围棋子双面凸、五子棋子是平凸的扁子，跳棋子更宽更薄——三者的直径都跟着自己棋盘的格走
  stone: { r: 0.0175, h: 0.0092 },
  puck: { r: 0.0205, h: 0.0098 },
  man: { r: 0.029, h: 0.0085 },
  pawn: { r: 0.019, h: 0.05 },
  tall: { r: 0.0125, h: 0.066 },
  // 米宝是个人形剪影：胳膊比身子宽，占桌按最宽的那对肩膀算
  meeple: { r: 0.0165, h: 0.044 },
  flag: { r: 0.0155, h: 0.072 },
  "chess-pawn": { r: 0.017, h: 0.056 },
  "chess-rook": { r: 0.02, h: 0.066 },
  "chess-knight": { r: 0.02, h: 0.076 },
  "chess-bishop": { r: 0.019, h: 0.082 },
  "chess-queen": { r: 0.021, h: 0.094 },
  "chess-king": { r: 0.022, h: 0.104 },
  // 三角片与五角星是平躺在盘面上的薄片标记：r 是底面外接半径，h 就是片子的厚度
  tri: { r: 0.026, h: 0.009 },
  star: { r: 0.026, h: 0.009 },
};

/** 按 shape 取棋子尺寸：没登记的形状照旧当圆片处理 */
export function pieceSize(shape?: string): { r: number; h: number } {
  return PIECE_SIZE[shape ?? ""] ?? PIECE_SIZE.disc;
}

export function boardThickness(spec: BoardSpec): number {
  return spec.layout === "mat" ? MAT_THICK : BOARD_THICK;
}

/** 能装牌容器的种类：牌堆、卡牌盒、袋子共用同一套 pile 数据与摸牌逻辑 */
export const CONTAINER_KINDS: Kind[] = ["pile", "box", "bag"];

/** 真有正反两面、翻一下会变样的种类：归约里的 flip 只认这些。
 *  牌屏立在原地、沙漏用翻面起算、规则书用翻页，给它们挂「翻到正面」就是一颗空按钮。 */
export const FLIPPABLE: Kind[] = ["card", ...CONTAINER_KINDS];

export function isContainer(o: GameObject): boolean {
  return CONTAINER_KINDS.includes(o.kind) && Array.isArray(o.pile);
}

/** 一张牌的身份：能认出「就是这一张」的那几个字段凑成一个 32 位指纹 */
function cardTag(c: CardSpec): number {
  const s = `${c.back ?? ""}|${c.rank ?? ""}|${c.suit ?? ""}|${c.label ?? ""}|${c.art ?? ""}|${c.cat ?? ""}|${c.text ?? ""}|${c.color ?? ""}|${c.img ?? ""}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

/**
 * 洗过没有：同一叠牌、同一批牌，只是顺序换了。
 * 判据是「张数一样 + 与顺序无关的两份总和一样 + 按顺序滚出来的那份不一样」。
 * 摸走一张（张数变了）、在牌堆里改一张牌的名字（总和变了）都不算洗，只有真的重新排过序才算。
 */
export function sameCardsReordered(before?: CardSpec[], after?: CardSpec[]): boolean {
  if (!before?.length || !after?.length || before.length !== after.length) return false;
  let sum = 0;
  let square = 0;
  let rollA = 0;
  let rollB = 0;
  for (let i = 0; i < before.length; i++) {
    const a = cardTag(before[i]);
    const b = cardTag(after[i]);
    sum = (sum + a - b) | 0;
    square = (square + Math.imul(a, a) - Math.imul(b, b)) | 0;
    rollA = (Math.imul(rollA, 31) + a) | 0;
    rollB = (Math.imul(rollB, 31) + b) | 0;
  }
  return sum === 0 && square === 0 && rollA !== rollB;
}

/** 贴面薄片：垫在桌布上，不占高度也不挡路，只按几何范围管事 */
export const DECAL_KINDS: Kind[] = ["zone", "stat", "slot", "track"];

/** 区域垫长宽范围（米） */
export const ZONE_MIN = 0.15;
export const ZONE_MAX = 2.2;

/** 统计垫长宽范围（米）：比区域垫小一档，它是块垫子不是半个桌面 */
export const STAT_MIN = 0.12;
export const STAT_MAX = 1.2;

/**
 * 座位的进攻范围（家）：数到第几家以内打得着。空手默认 1，只够得着左右邻座；
 * 八家一桌绕一圈最远是 4 家，上限给到 8 是让沙盒里摆整张牌桌的人也调得出去。
 */
export const REACH_MIN = 1;
export const REACH_MAX = 8;
export const REACH_DEFAULT = 1;
/** 防御范围（家）：别人数到你时多算几家，相当于那一匹 +1 马；不给负数，减距离归进攻范围管 */
export const GUARD_MIN = 0;
export const GUARD_MAX = 3;

/** 统计垫尺寸的收口：和区域垫同一套算法，但上下限不同，两者不共用 */
export function fixStat(v: unknown): { w: number; d: number } {
  const raw = v && typeof v === "object" ? (v as { w?: unknown; d?: unknown }) : {};
  const w = clamp(Number(raw.w) || 0.6, STAT_MIN, STAT_MAX);
  const d = clamp(Number(raw.d) || 0.42, STAT_MIN, STAT_MAX);
  return { w: Math.round(w * 1000) / 1000, d: Math.round(d * 1000) / 1000 };
}

/** 归约后的区域尺寸：长宽与攻防一定在表上，垫子标记与贴图只在非默认时留 */
export type ZoneFixed = Required<Omit<ZoneSpec, "pad" | "img">> & Pick<ZoneSpec, "pad" | "img">;

/** 区域尺寸的收口：非法值回落到默认，超范围截断，保证各端归约一致。归约完攻防范围一定在表上 */
export function fixZone(v: unknown): ZoneFixed {
  const raw =
    v && typeof v === "object"
      ? (v as { w?: unknown; d?: unknown; reach?: unknown; guard?: unknown; pad?: unknown; img?: unknown })
      : {};
  const w = clamp(Number(raw.w) || 0.5, ZONE_MIN, ZONE_MAX);
  const d = clamp(Number(raw.d) || 0.36, ZONE_MIN, ZONE_MAX);
  const img = typeof raw.img === "string" && IMAGE_KEY.test(raw.img) ? raw.img : undefined;
  return {
    w: Math.round(w * 1000) / 1000,
    d: Math.round(d * 1000) / 1000,
    reach: Math.round(clamp(Number(raw.reach) || REACH_DEFAULT, REACH_MIN, REACH_MAX)),
    guard: Math.round(clamp(Number(raw.guard) || 0, GUARD_MIN, GUARD_MAX)),
    pad: raw.pad === true ? true : undefined,
    img,
  };
}

/** 卡槽带的格数范围：一格放一张牌，十四条够排一整副小牌 */
export const SLOT_MIN = 1;
export const SLOT_MAX = 14;

/** 一格占多宽（米）：比一张牌的 6.3cm 宽一点，排满了也不挤 */
export const SLOT_PITCH = 0.072;
/** 带子多深（米）：比一张牌的 9cm 长一点，牌躺进去正好盖住格子 */
export const SLOT_DEPTH = 0.1;

/** 格数收口：小数抹平，超范围截断，各端算出同一条带子 */
export function fixSlot(v: unknown): { n: number } {
  const raw = v && typeof v === "object" ? (v as { n?: unknown }) : {};
  const n = Math.round(clamp(Number(raw.n) || 3, SLOT_MIN, SLOT_MAX));
  return { n };
}

/** 带子的长宽（米）：格数乘一格步长 */
export function slotSize(o: GameObject): { w: number; d: number } {
  return { w: (o.slot ?? fixSlot(undefined)).n * SLOT_PITCH, d: SLOT_DEPTH };
}

/**
 * 带子上第 i 格的世界坐标：沿带子自己的横轴居中铺开，整条带子跟着 rot 转。
 * 牌的朝向也一并给出——牌躺进槽里就该和带子平行，不然整理个什么。
 */
export function slotSpot(strip: GameObject, i: number): { x: number; z: number; rot: number } {
  const s = strip.slot ?? fixSlot(undefined);
  const rad = ((strip.rot || 0) * Math.PI) / 180;
  const lx = (i - (s.n - 1) / 2) * SLOT_PITCH * scaleOf(strip);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: r3(strip.x + lx * cos),
    z: r3(strip.z + lx * sin),
    rot: deg360(strip.rot || 0),
  };
}

/** 点压在哪条带子上：横向给半格容差，斜着带过去一点也算瞄准了它 */
export function slotAt(state: { o: GameObject[] }, x: number, z: number, exclude: Iterable<string> = []): GameObject | null {
  const skip = new Set(exclude);
  let best: GameObject | null = null;
  let near = Infinity;
  for (const s of state.o) {
    if (s.hand || s.kind !== "slot" || skip.has(s.id)) continue;
    const size = slotSize(s);
    if (!inRect(s.x, s.z, s.rot || 0, size.w + SLOT_PITCH * 0.5, size.d * 1.5, x, z)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < near) {
      near = d;
      best = s;
    }
  }
  return best;
}

/** 第 i 格被别的牌占着了吗：只看牌心落没落进那一格，exclude 是正在搬的那些 */
export function slotBusy(state: { o: GameObject[] }, strip: GameObject, i: number, exclude: Iterable<string> = []): boolean {
  const skip = new Set(exclude);
  const at = slotSpot(strip, i);
  const r = SLOT_PITCH * 0.5 * scaleOf(strip);
  for (const o of state.o) {
    if (o.hand || skip.has(o.id) || o.kind !== "card" || !o.card) continue;
    if (Math.abs(o.x - at.x) < r && Math.abs(o.z - at.z) < r) return true;
  }
  return false;
}

/**
 * 带子上离落点最近的空槽：一格都没占就返回 null，让牌照原样落下。
 * exclude 是这次一起搬的牌（它们正飞在空中，不算占位），used 是同一次拖动里已经排好的格。
 */
export function slotNear(state: { o: GameObject[] }, strip: GameObject, x: number, z: number, exclude: Iterable<string> = [], used?: Set<string>): { x: number; z: number; rot: number; i: number } | null {
  const n = fixSlot(strip.slot).n;
  let best: { x: number; z: number; rot: number; i: number } | null = null;
  let near = Infinity;
  for (let i = 0; i < n; i++) {
    if (used?.has(`${strip.id}:${i}`)) continue;
    if (slotBusy(state, strip, i, exclude)) continue;
    const at = slotSpot(strip, i);
    const d = Math.hypot(at.x - x, at.z - z);
    if (d < near) {
      near = d;
      best = { ...at, i };
    }
  }
  return best && near <= SLOT_PITCH * 0.85 ? best : null;
}

/** 摊在带子上的散牌：跟统计垫一样只看几何，手牌与牌堆里的牌不算 */
export function slotCards(state: { o: GameObject[] }, strip: GameObject): string[] {
  const size = slotSize(strip);
  const ids: string[] = [];
  for (const o of state.o) {
    if (o.kind !== "card" || o.hand || !o.card) continue;
    if (inRect(strip.x, strip.z, strip.rot || 0, size.w, size.d, o.x, o.z)) ids.push(o.id);
  }
  return ids;
}

/** 迷你计数器读数范围：四位数字加一个负号，在这一小片上还认得出来，上限与计数标记对齐 */
export const COUNTER_V_MIN = -9999;
export const COUNTER_V_MAX = 9999;

/** 步进档：一下走多少。默认 1，选中栏给三档换 */
export const COUNTER_STEP_MIN = 1;
export const COUNTER_STEP_MAX = 100;
export const COUNTER_STEPS = [1, 5, 10];

/** 这一小片的尺寸（米）：宽约标准卡宽的四成，薄薄一片贴在牌边上不翘 */
export const COUNTER_BODY = { w: 0.026, d: 0.016, h: 0.004 };
/** 与宿主边缘留的缝（米）：贴死了会和牌面 z-fighting */
export const COUNTER_GAP = 0.002;
/** 落点离边中点多远还算「瞄准了这条边」：超出就照原样落下，不硬吸 */
export const COUNTER_SNAP_TOL = 0.03;
/** host 存的是物件 id，长度按桌上 id 的实际形状给个宽裕上限 */
export const COUNTER_HOST_MAX = 32;
/** 四条边的叫法，下标就是 CounterSpec.edge：0 上(-z) / 1 右(+x) / 2 下(+z) / 3 左(-x) */
export const COUNTER_EDGE_NAMES = ["上", "右", "下", "左"];

/** 读数与步进的收口：脏值回落到 0/1，超范围截断，各端归约出同一片计数器 */
export function fixCounter(v: unknown): CounterSpec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: CounterSpec = {
    v: Math.round(clamp(Number(raw.v) || 0, COUNTER_V_MIN, COUNTER_V_MAX)),
    step: Math.round(clamp(Number(raw.step) || 1, COUNTER_STEP_MIN, COUNTER_STEP_MAX)),
  };
  // host 只是字段归一化，宿主到底还在不在桌上由归约收口，这里查不了
  const host = typeof raw.host === "string" ? raw.host.trim().slice(0, COUNTER_HOST_MAX) : "";
  if (host) {
    const edge = Number(raw.edge);
    out.host = host;
    out.edge = edge === 1 || edge === 2 || edge === 3 ? edge : 0;
  }
  return out;
}

/**
 * 计数器吸在宿主第 edge 条边上的世界坐标与朝向：整片跟着宿主转，
 * 所以先算宿主自己的局部偏移再旋转——顺序反了，牌一转计数器就飞到对角去。
 */
export function counterSpot(host: GameObject, edge: 0 | 1 | 2 | 3): { x: number; z: number; rot: number } {
  const s = shapeOf(host);
  const k = scaleOf(host);
  const hw = (s.w * k) / 2;
  const hd = (s.d * k) / 2;
  // 整片坐在牌边外侧、不压住牌面：偏移默认半个身位再加缝，不然物理会把宿主牌一起顶走
  const pad = COUNTER_BODY.d / 2 + COUNTER_GAP;
  const off = [
    { lx: 0, lz: -(hd + pad) },
    { lx: hw + pad, lz: 0 },
    { lx: 0, lz: hd + pad },
    { lx: -(hw + pad), lz: 0 },
  ][edge];
  const rad = ((host.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: r3(host.x + off.lx * cos - off.lz * sin),
    z: r3(host.z + off.lx * sin + off.lz * cos),
    // 左右两条边要让读数顺着牌边躺，所以额外转 90°
    rot: deg360((host.rot || 0) + (edge === 1 || edge === 3 ? 90 : 0)),
  };
}

/** 点压在哪张牌上：只认摊在桌上的单张散牌，牌堆/盒/袋是一叠，吸在它边上说不清吸的是哪张 */
export function hostAt(state: { o: GameObject[] }, x: number, z: number, exclude: Iterable<string> = []): GameObject | null {
  const skip = new Set(exclude);
  let best: GameObject | null = null;
  let near = Infinity;
  for (const c of state.o) {
    if (c.hand || c.kind !== "card" || !c.card || skip.has(c.id)) continue;
    const s = shapeOf(c);
    const k = scaleOf(c);
    // 判定框比牌面大一圈：把计数器往边外放一点也算瞄准了这条边
    if (!inRect(c.x, c.z, c.rot || 0, s.w * k + COUNTER_SNAP_TOL * 2, s.d * k + COUNTER_SNAP_TOL * 2, x, z)) continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < near) {
      near = d;
      best = c;
    }
  }
  return best;
}

/** 落点离宿主的哪条边最近：0 上 / 1 右 / 2 下 / 3 左 */
export function nearestEdge(host: GameObject, x: number, z: number): 0 | 1 | 2 | 3 {
  let best: 0 | 1 | 2 | 3 = 0;
  let near = Infinity;
  for (const e of [0, 1, 2, 3] as const) {
    const at = counterSpot(host, e);
    const d = Math.hypot(at.x - x, at.z - z);
    if (d < near) {
      near = d;
      best = e;
    }
  }
  return best;
}

/** 吸在这一件身上的所有计数器：拖宿主要把它们一起带走，选中栏也要报个数 */
export function countersOn(state: { o: GameObject[] }, hostId: string): GameObject[] {
  return state.o.filter((o) => o.kind === "counter" && o.counter?.host === hostId);
}

/**
 * 骰盘：一只开口四壁浅盘。状态里只存内径（米），墙高与壁厚是固定外观、不进状态，
 * 所以四份校验镜像只要对齐内径这一对数字。
 */
export const TRAY_MIN = 0.1;
export const TRAY_MAX = 0.6;
export const TRAY_DEFAULT = { w: 0.2, d: 0.14 };
/** 盘壁厚度（米）：只在渲染与内径判定里用，不进状态 */
export const TRAY_WALL = 0.012;
/** 盘壁高度（米）：矮矮一圈，接得住骰子又不挡住看牌面 */
export const TRAY_H = 0.028;

/** 内径的收口：脏值回落到默认，超范围截断，各端算出同一只盘 */
export function fixTray(v: unknown): { w: number; d: number } {
  const raw = v && typeof v === "object" ? (v as { w?: unknown; d?: unknown }) : {};
  const w = clamp(Number(raw.w) || TRAY_DEFAULT.w, TRAY_MIN, TRAY_MAX);
  const d = clamp(Number(raw.d) || TRAY_DEFAULT.d, TRAY_MIN, TRAY_MAX);
  return { w: Math.round(w * 1000) / 1000, d: Math.round(d * 1000) / 1000 };
}

/** 盘的外沿尺寸（米）：内径加两壁，物理碰撞盒与占桌半径都按它算 */
export function trayOuter(o: GameObject): { w: number; d: number } {
  const s = o.tray ?? fixTray(undefined);
  return { w: s.w + TRAY_WALL * 2, d: s.d + TRAY_WALL * 2 };
}

/** 点是否落在盘的内腔里：按盘的朝向反向旋转，比内径半边长 */
export function inTray(t: GameObject, x: number, zz: number): boolean {
  const s = t.tray ?? fixTray(undefined);
  return inRect(t.x, t.z, t.rot || 0, s.w, s.d, x, zz);
}

/** 盘里躺着哪些骰子：拖动盘子要把它们一起带走，只看几何不挂载 */
export function diceInTray(state: { o: GameObject[] }, tray: GameObject): string[] {
  const ids: string[] = [];
  for (const o of state.o) {
    if (o.kind !== "die" || o.hand) continue;
    if (inTray(tray, o.x, o.z)) ids.push(o.id);
  }
  return ids;
}

/** 落点压在哪只盘上：拖骰子松手时判它进不进盘，取最近的一只 */
export function trayAt(state: { o: GameObject[] }, x: number, z: number, exclude: Iterable<string> = []): GameObject | null {
  const skip = new Set(exclude);
  let best: GameObject | null = null;
  let near = Infinity;
  for (const t of state.o) {
    if (t.hand || t.kind !== "tray" || skip.has(t.id)) continue;
    if (!inTray(t, x, z)) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < near) {
      near = d;
      best = t;
    }
  }
  return best;
}

/** 转盘等分范围：两格是抛硬币，二十四格已经看不清扇区上的字了 */
export const SPIN_MIN = 2;
export const SPIN_MAX = 24;
/** 转盘半径（米）：比一枚筹码大一圈，摆上桌不占地方也看得清 */
export const SPIN_R = 0.088;
/** 一圈最多转几圈动画：转二十圈要等半天，四圈足够把悬念给足 */
export const SPIN_TURNS = 4;

/** 扇区数与结果的收口：脏值一律丢掉，各端算出同一张转盘 */
export function fixSpinner(v: unknown): SpinnerSpec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: SpinnerSpec = { n: Math.round(clamp(Number(raw.n) || 8, SPIN_MIN, SPIN_MAX)) };
  const value = Number(raw.value);
  if (Number.isFinite(value) && value >= 0 && value < out.n) out.value = Math.floor(value);
  const at = Number(raw.at);
  if (Number.isFinite(at) && at >= 1e12 && at <= 1e13) out.at = Math.round(at);
  return out;
}

/**
 * 静止时盘面绕 Y 轴转过的角度（度）：第 i 格画在盘面的 [i·per, (i+1)·per) 之间，
 * 而 rotation.y 越大盘面在桌面上越往逆时针偏，所以正的 (i+0.5)·per 正好把那一格送到正上方的指针下。
 */
export function spinAngle(o: GameObject): number {
  const s = o.spinner ?? fixSpinner(undefined);
  if (s.value === undefined) return 0;
  return ((s.value + 0.5) * 360) / s.n;
}

/** 一次拨动播多久（毫秒）：太短看不清落在哪格，太长等着烦 */
export const SPIN_MS = 2600;

/**
 * 某一时刻盘面该转过的角度（度）：起转后从落点往后退 SPIN_TURNS 圈，按缓出曲线扫回来。
 * 只由 (落点, 起转时刻, 现在) 三样算出来，所以网格被重建、迟到的人后加入，看到的都是同一段动画。
 */
export function spinAngleAt(o: GameObject, now = Date.now()): number {
  const rest = spinAngle(o);
  const s = o.spinner ?? fixSpinner(undefined);
  if (s.at === undefined || !Number.isFinite(now)) return rest;
  const t = (now - s.at) / SPIN_MS;
  if (!(t > 0) || t >= 1) return rest;
  return rest + SPIN_TURNS * 360 * (1 - t) ** 3;
}

/** 计分轨的刻度数范围：五格记不了什么分，八十格铺满半张桌子 */
export const TRACK_MIN = 5;
export const TRACK_MAX = 80;
/** 一格的间距（米）：二十格约 0.44 米，正好是一条手臂够得着的长度 */
export const TRACK_PITCH = 0.022;
/**
 * 轨道多深（米）：尺子上那三条带子要各就各位——
 * 远半侧从上到下是刻度线、数字，中线走棋子，近半侧留给名字。
 */
export const TRACK_DEPTH = 0.075;
/** 一条轨上最多几枚棋子：入座上限是 8，多留两个位置给同一台机器换手 */
export const TRACK_MARK_MAX = 10;
/** 新摆的计分轨默认几格：二十格记一局够用，摊开也只有半米 */
export const TRACK_DEFAULT = 20;

/** 刻度轨的收口：格数与每人的位置都夹进合法区间，脏条目直接丢掉 */
export function fixTrack(v: unknown): TrackSpec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const n = Math.round(clamp(Number(raw.n) || TRACK_DEFAULT, TRACK_MIN, TRACK_MAX));
  const marks: TrackMark[] = [];
  const seen = new Set<string>();
  for (const m of Array.isArray(raw.marks) ? raw.marks : []) {
    if (!m || typeof m !== "object") continue;
    const rec = m as Record<string, unknown>;
    const by = typeof rec.by === "string" ? rec.by.slice(0, 24) : "";
    if (!by || seen.has(by)) continue;
    seen.add(by);
    const mark: TrackMark = { by, at: Math.round(clamp(Number(rec.at) || 0, 0, n - 1)) };
    if (typeof rec.name === "string" && rec.name.length) mark.name = rec.name.slice(0, 20);
    if (typeof rec.color === "string" && /^#[0-9a-fA-F]{6}$/.test(rec.color)) mark.color = rec.color.toLowerCase();
    marks.push(mark);
    if (marks.length >= TRACK_MARK_MAX) break;
  }
  return { n, marks };
}

/** 轨道的长宽（米）：两头各留半格，第一格和最后一格的棋子才不会压出边界 */
export function trackSize(o: GameObject): { w: number; d: number } {
  const n = (o.track ?? fixTrack(undefined)).n;
  return { w: (n + 1) * TRACK_PITCH, d: TRACK_DEPTH };
}

/**
 * 第 i 格在轨道自身横轴上的偏移（米）：0 在轨道中心。
 * 棋子是轨道网格的子物体，所以只算这条局部轴，转场与缩放交给父级。
 */
export function trackOffset(i: number, n: number): number {
  return (i - (n - 1) / 2) * TRACK_PITCH;
}

/** 某个人的那枚棋子 */
export function trackMark(o: GameObject, by: string): TrackMark | undefined {
  return (o.track?.marks ?? []).find((m) => m.by === by);
}

/** 点是否落在一个按 rot 转过的矩形里 */
function inRect(cx: number, cz: number, rot: number, w: number, d: number, x: number, zz: number): boolean {
  const rel = { x: x - cx, z: zz - cz };
  const rad = ((rot || 0) * Math.PI) / 180;
  const rx = rel.x * Math.cos(-rad) - rel.z * Math.sin(-rad);
  const rz = rel.x * Math.sin(-rad) + rel.z * Math.cos(-rad);
  return Math.abs(rx) <= w / 2 && Math.abs(rz) <= d / 2;
}

/** 把桌面绝对坐标换算到物件自己的局部轴上（横轴沿 rot 的正面，纵轴往「自己这一侧」为正） */
function localOf(cx: number, cz: number, rot: number, x: number, z: number): { lx: number; lz: number } {
  const rad = ((rot || 0) * Math.PI) / 180;
  const dx = x - cx;
  const dz = z - cz;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  // 世界轴转回局部轴要用转置：local→world 是 (lx,lz)→(lx·c+lz·s, -lx·s+lz·c)，反过来解即得下式
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

/** 牌屏的宽度范围（米）：比一张牌还窄就谈不上遮挡，半米以上挡的是半张桌子 */
export const SHIELD_MIN = 0.16;
export const SHIELD_MAX = 0.6;
/** 屏高范围（米）：矮了挡不住牌面，高了压住同桌的视线 */
export const SHIELD_H_MIN = 0.09;
export const SHIELD_H_MAX = 0.28;
/** 屏前那条被挡住的窄带有多深（米）：牌贴在自己和屏之间才算躲在屏后 */
export const SHIELD_BAND = 0.07;
/** 新摆的牌屏默认开本：立得住一张牌，摊开也不挡别人的地盘 */
export const SHIELD_DEFAULT = { w: 0.24, h: 0.15 };

/** 牌屏尺寸的收口：脏值一律夹回合法区间，各端算出同一块屏 */
export function fixShield(v: unknown): ShieldSpec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    w: r3(clamp(Number(raw.w) || SHIELD_DEFAULT.w, SHIELD_MIN, SHIELD_MAX)),
    h: r3(clamp(Number(raw.h) || SHIELD_DEFAULT.h, SHIELD_H_MIN, SHIELD_H_MAX)),
  };
}

/** 是否躲在某块屏的遮挡带里（屏主人这一侧的那一窄条） */
function behindShield(s: GameObject, x: number, z: number): boolean {
  const sp = s.shield ?? fixShield(undefined);
  const { lx, lz } = localOf(s.x, s.z, s.rot, x, z);
  return Math.abs(lx) <= sp.w / 2 && lz >= -0.005 && lz <= SHIELD_BAND;
}

/**
 * 这件物件躲在谁的牌屏后面：只认认领过主人的屏，几块屏都盖住时按最小的那块算，
 * 跟区域垫同一套「小范围说了算」的口径，不然顺手摆的小屏会被大屏吃掉。
 */
export function shieldOver(state: { o: GameObject[] }, o: GameObject): GameObject | undefined {
  if (o.kind === "shield") return undefined;
  let best: GameObject | undefined;
  let bestW = Infinity;
  for (const s of state.o) {
    if (s.kind !== "shield" || !s.owner || !behindShield(s, o.x, o.z)) continue;
    const w = (s.shield ?? fixShield(undefined)).w;
    if (w < bestW) {
      bestW = w;
      best = s;
    }
  }
  return best;
}

/** 沙漏的一档几分钟：一分钟太急，十分钟以上不如直接用计时器 */
export const HOUR_MIN = 1;
export const HOUR_MAX = 10;
export const HOUR_DEFAULT = 3;
/** 沙漏外壳：底半径与总高（米），玻璃罩按这两个数画 */
export const HOUR_R = 0.032;
export const HOUR_H = 0.078;

/** 沙漏的收口：分钟数夹进档位，起算时刻只认合理的 epoch 毫秒 */
export function fixHour(v: unknown): HourSpec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const mins = Math.round(clamp(Number(raw.mins) || HOUR_DEFAULT, HOUR_MIN, HOUR_MAX));
  const at = Number(raw.at);
  return { mins, at: Number.isFinite(at) && at >= 1e12 && at <= 1e13 ? Math.round(at) : null };
}

/** 这一漏还剩几秒：没在漏就是整整一分漏，漏完归零 */
export function hourLeft(o: GameObject, now = Date.now()): number {
  const h = o.hour ?? fixHour(undefined);
  const total = h.mins * 60;
  if (h.at === null) return total;
  return Math.max(0, Math.min(total, Math.ceil((h.at + total * 1000 - now) / 1000)));
}

/** 这一漏是不是漏到底了：界面拿它决定要不要提醒翻回去 */
export function hourDone(o: GameObject, now = Date.now()): boolean {
  const h = o.hour ?? fixHour(undefined);
  return h.at !== null && now - h.at >= h.mins * 60 * 1000;
}

/** 上瓶还剩几分之几（0~1）：渲染层照它画两边沙面的高度 */
export function hourRatio(o: GameObject, now = Date.now()): number {
  const h = o.hour ?? fixHour(undefined);
  if (h.at === null) return 1;
  return clamp(1 - (now - h.at) / (h.mins * 60 * 1000), 0, 1);
}

/** 规则书最多几页、每页多少字：再长就不该写在小本子上 */
export const BOOK_PAGE_MAX = 24;
export const BOOK_CHARS = 420;
/** 摊开的开本（米）：约莫一本卡牌书的大小，两页并排 */
export const BOOK_SPREAD = { w: 0.17, d: 0.115 };
/** 一本新规则书给几页空架子：房规、计分、备忘，摆下来就有得写 */
export const BOOK_SECTIONS = ["房规", "计分", "备忘"];

/** 书页的收口：脏页丢掉、每页截长、页码夹进本子里，至少留一页才谈得上「翻开」 */
export function fixBook(v: unknown): BookSpec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const src = Array.isArray(raw.pages) ? raw.pages : [];
  const pages = src.slice(0, BOOK_PAGE_MAX).map((p) => (typeof p === "string" ? p.slice(0, BOOK_CHARS) : ""));
  while (!pages.length) pages.push("");
  return { pages, page: Math.round(clamp(Number(raw.page) || 0, 0, pages.length - 1)) };
}

/**
 * 摊开看到的那一对页：右页是当前页，左页是它前面那一页。
 * 跟真书一样，第一页摊开时左边是封里（空白）。
 */
export function bookSpread(s: BookSpec): { l: string; r: string } {
  return { l: s.pages[s.page - 1] ?? "", r: s.pages[s.page] ?? "" };
}

/**
 * 唱片的音频 key 形状：跟卡面一样是内容哈希，但首位固定是 a，
 * 这样同一台服务器上的两个仓库（图片 / 音频）各走各的门，谁也错拿不到对方的字节。
 */
export const AUDIO_KEY = /^a[a-z0-9]{5,23}$/;
/** 一首歌的字节上限：按 320kbps 算约莫十分钟，再长的歌该先剪短 */
export const AUDIO_MAX_BYTES = 24 * 1024 * 1024;
/** 曲名最长几个字：刻在机身上的那一行放不下长文件名 */
export const GRAM_NAME_MAX = 24;
/** 时长上限（秒）：一小时的录音不叫唱片，那是播客 */
export const GRAM_DUR_MAX = 3600;
/** 默认音量：桌上人多，一上来就满格会吓一跳 */
export const GRAM_VOL_DEFAULT = 0.7;
/** 机身的开本（米）：一张十二寸唱片的盘子加一臂，比规则书宽一圈 */
export const GRAM_BODY = { w: 0.36, d: 0.3, h: 0.1 };

/** 唱片机的收口：脏 clip 当空机，音量时长全夹回合法区间，各端算出同一台机器 */
export function fixGram(v: unknown): GramSpec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const clip = typeof raw.clip === "string" && AUDIO_KEY.test(raw.clip) ? raw.clip : null;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const dur = r3(clamp(Number(raw.dur) || 0, 0, GRAM_DUR_MAX));
  const playing = raw.playing === true && !!clip;
  // 在放就得有个起播时刻；没给就当下这一瞬，免得各端拿到同一台机器却推出三个进度
  const at = playing ? (typeof raw.at === "number" && Number.isFinite(raw.at) ? Math.round(raw.at) : Date.now()) : null;
  return {
    clip,
    name: typeof raw.name === "string" ? raw.name.trim().slice(0, GRAM_NAME_MAX) : "",
    dur,
    // 位置不能越过曲子本身；没在放也就没起播时刻
    pos: r3(clamp(Number(raw.pos) || 0, 0, dur || 0)),
    playing,
    at,
    // 音量 0 是「拧到静音」这个合法读数，不能用 || 兜底，否则下一笔无关改动会把音量偷偷拧回七成
    vol: r3(clamp(typeof raw.vol === "number" && Number.isFinite(raw.vol) ? raw.vol : GRAM_VOL_DEFAULT, 0, 1)),
    loop: raw.loop === true,
  };
}

/**
 * 此刻该播到第几秒：在放就按起播时刻往前推，循环时绕回曲子开头。
 * 各端各推各的，谁也不为进度往桌上写一笔，所以这几台之间差的只是墙钟的零头。
 */
export function gramPos(g: GramSpec, now = Date.now()): number {
  if (!g.playing || g.at === null || !g.dur) return g.pos;
  const t = g.pos + (now - g.at) / 1000;
  if (t < 0) return 0;
  return g.loop ? t % g.dur : Math.min(t, g.dur);
}

/** 还能往下推几秒：进度条与「快进」按钮都按这个收口，推到头就不摆那一行 */
export function gramLeft(g: GramSpec, now = Date.now()): number {
  return Math.max(0, g.dur - gramPos(g, now));
}

/** 随身听的几档上限：曲名与时长跟唱片同一档，多出来的只有归属、共享与线路那块 */
export const MP3_NAME_MAX = 24;
export const MP3_DUR_MAX = 3600;
/** 默认音量：这是一台贴耳朵的机器，比桌上那台大喇叭收着些 */
export const MP3_VOL_DEFAULT = 0.6;
/** 机身的开本（米）：一台巴掌大的随身听，比规则书窄得多 */
export const MP3_BODY = { w: 0.14, d: 0.075, h: 0.02 };
/** 主人 id 的最长长度（clientId 形状） */
export const MP3_BY_MAX = 24;
/**
 * 一台机器同时往外推的份数：全桌就那几个人，多开只是把同一首歌唱好几遍
 */
export const MP3_PUSH_MAX = 4;
/**
 * 点对点的一段（原始字节数）：base64 之后约 128KB，留在实时通道那条 256KB 的帧上限以内。
 * 一首歌切成几百段，一段一段地顺着线路走，服务器只替人递一下，自己一份都不存。
 */
export const MP3_CHUNK = 96 * 1024;

/**
 * 播放器的收口：脏 clip 当空机。共享与否决定桌面上那套走带参数算不算数——
 * 没共享出去时这里一律归零（放的是本机自己那份，见 mp3View），四端拿到同一个空转的壳。
 */
export function fixMp3(v: unknown): Mp3Spec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const clip = typeof raw.clip === "string" && AUDIO_KEY.test(raw.clip) ? raw.clip : null;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const dur = r3(clamp(Number(raw.dur) || 0, 0, MP3_DUR_MAX));
  const shared = raw.shared === true && !!clip;
  // 没共享出去的曲子只在它主人自己这台机器上响，桌上那份就是个空转的壳
  const playing = shared && raw.playing === true;
  const at = playing ? (typeof raw.at === "number" && Number.isFinite(raw.at) ? Math.round(raw.at) : Date.now()) : null;
  return {
    clip,
    name: typeof raw.name === "string" ? raw.name.trim().slice(0, MP3_NAME_MAX) : "",
    dur,
    pos: r3(clamp(Number(raw.pos) || 0, 0, dur || 0)),
    playing,
    at,
    vol: r3(clamp(typeof raw.vol === "number" && Number.isFinite(raw.vol) ? raw.vol : MP3_VOL_DEFAULT, 0, 1)),
    loop: shared && raw.loop === true,
    by: typeof raw.by === "string" ? raw.by.trim().slice(0, MP3_BY_MAX) : "",
    shared,
  };
}

/** 此刻该播到第几秒：与唱片机同一套算法，各端各推各的，没人每秒往桌上写一笔 */
export function mp3Pos(m: Mp3Spec, now = Date.now()): number {
  if (!m.playing || m.at === null || !m.dur) return m.pos;
  const t = m.pos + (now - m.at) / 1000;
  if (t < 0) return 0;
  return m.loop ? t % m.dur : Math.min(t, m.dur);
}

export function mp3Left(m: Mp3Spec, now = Date.now()): number {
  return Math.max(0, m.dur - mp3Pos(m, now));
}

/** 这台机器归谁：空 by 是旧数据或本地单机，谁都不算主人，谁都能上手 */
export function mp3Mine(m: Mp3Spec, clientId: string): boolean {
  return !m.by || m.by === clientId;
}

/** 平板：B 站片号的形状。BV 号是「BV」加一串 base58，B 站这些年前后放宽过长度，所以认得宽松、只挡明显脏的 */
export const BV_ID = /^BV[0-9A-Za-z]{10,16}$/;
/** 分 P 上限：一话番剧也排不到这么多 P，超出就当没给 */
export const TABLET_PAGE_MAX = 100;
/** 地址栏能吞多少字，也管存进状态的那一条：人贴进来的往往是整条链接，带一堆参数 */
export const TABLET_ADDR_MAX = 500;
/** 重新载入的计数上限：绕回 0，免得有人按住不放把状态撑大 */
export const TABLET_REV_MAX = 999;
/** B 站片页的标准形状：地址栏贴进来的 B 站链接一律折回这一种，认得出 BV 才给那一套走带按钮 */
export const BILI_VIDEO = "https://www.bilibili.com/video/";
/**
 * 只放行 http/https 的绝对地址。scheme 白名单是唯一那道闸：
 * javascript: 与 data: 一旦能挂上屏，就等于把任意脚本塞进同桌每一个人的浏览器里。
 */
const WEB_URL = /^https?:\/\/[^/\s<>"'\\][^\s<>"'\\]*$/;

/** 一条能不能当网址挂上屏：纯字符串判断，不发请求，Node 与浏览器同一套口径 */
export function isWebUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 0x21) return false;
  return v.length <= TABLET_ADDR_MAX && WEB_URL.test(v);
}

/**
 * 从地址里认出 B 站那一种片子，认出来才谈得上分 P 与进度。
 * 只认折好的那一种形状（biliAddr 产出的），别的站、别的 B 站页面都当普通网页。
 */
export function biliOf(url: string): string | null {
  if (!url.startsWith(BILI_VIDEO)) return null;
  const rest = url.slice(BILI_VIDEO.length);
  const hit = /^(BV[0-9A-Za-z]{10,16})(?:[/?#]|$)/.exec(rest);
  return hit && BV_ID.test(hit[1]) ? hit[1] : null;
}

/** 位置上限（秒）：六小时。跨源播放器读不到时长，只能给一个不至于写出 NaN 的夹 */
export const TABLET_POS_MAX = 21600;
/** 机身三围（米）：一块十寸平板平躺在桌上，屏面朝上。h 是厚度，不是立起来的高度 */
export const TABLET_BODY = { w: 0.26, d: 0.16, h: 0.008 };
/** 屏幕的开本（米）：16:9，四边等宽边框，CSS3D 那块 iframe 就按这个尺寸贴。按多少像素画归 game/tablet.ts 那一串档位 */
export const TABLET_SCREEN = { w: 0.232, h: 0.1305 };

/**
 * 平板的收口：脏地址当空机，空机就没有在放也没有起播时刻；不是 B 站的地址就没有走带可言，
 * 位置、集数、静音跟着归零。各端拿到同一份就推出同一台机器——和唱片机一个说法，进度不往桌上写。
 */
export function fixTablet(v: unknown): TabletSpec {
  const raw = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  let url = typeof raw.url === "string" ? raw.url.trim() : "";
  // 老房间里只写着片号：折成 B 站的片页，别一上线就把别人那一屏清成空白
  if (!url && typeof raw.bv === "string" && BV_ID.test(raw.bv.trim())) url = BILI_VIDEO + raw.bv.trim();
  if (!isWebUrl(url)) url = "";
  const bili = biliOf(url);
  const playing = raw.playing === true && !!bili;
  // 在放就得有个起播时刻；没给就当下这一瞬，免得几台机器各推各的进度
  const at = playing ? (typeof raw.at === "number" && Number.isFinite(raw.at) ? Math.round(raw.at) : Date.now()) : null;
  return {
    url,
    page: bili ? Math.round(clamp(Number(raw.page) || 1, 1, TABLET_PAGE_MAX)) : 1,
    pos: bili ? r3(clamp(Number(raw.pos) || 0, 0, TABLET_POS_MAX)) : 0,
    playing,
    at,
    mute: !!bili && raw.mute === true,
    rev: Math.round(clamp(Number(raw.rev) || 0, 0, TABLET_REV_MAX)),
  };
}

/**
 * 此刻该播到第几秒：在放就按起播时刻往前推。各端各推各的，没人每秒往桌上写一笔。
 * 读不到真实时长，所以只夹到上限；放到头由播放器自己停。
 */
export function tabletPos(t: TabletSpec, now = Date.now()): number {
  if (!t.playing || t.at === null) return t.pos;
  return Math.min(Math.max(t.pos + (now - t.at) / 1000, 0), TABLET_POS_MAX);
}

/** 点是否落在区域内：按区域朝向反向旋转偏移后比较半边长 */
export function inZone(z: GameObject, x: number, zz: number): boolean {
  const s = z.zone ?? fixZone(undefined);
  return inRect(z.x, z.z, z.rot || 0, s.w, s.d, x, zz);
}

/**
 * 牌是竖着还是横着压在统计垫上：按垫子自己的朝向比，横竖各占 90°。
 * 差 45° 时按竖放算（牌本来就是竖版），和区域垫一样只看几何，不做挂载。
 */
export function cardLie(mat: GameObject, o: GameObject): "up" | "side" {
  let a = (((o.rot || 0) - (mat.rot || 0)) % 180 + 180) % 180;
  if (a > 90) a = 180 - a;
  return a < 45 ? "up" : "side";
}

/** 统计垫上摊着的牌：只数散牌，手牌和牌堆都不算 */
export function statCards(state: { o: GameObject[] }, mat: GameObject): { up: number; side: number; ids: string[] } {
  const s = mat.stat ?? fixStat(undefined);
  let up = 0;
  let side = 0;
  const ids: string[] = [];
  for (const o of state.o) {
    if (o.kind !== "card" || o.hand || !o.card) continue;
    if (!inRect(mat.x, mat.z, mat.rot || 0, s.w, s.d, o.x, o.z)) continue;
    ids.push(o.id);
    if (cardLie(mat, o) === "up") up += 1;
    else side += 1;
  }
  return { up, side, ids };
}

/** 物件所属区域：取面积最小的覆盖它的区域；区域自身不参与，避免自我圈住 */
export function zoneOf(state: { o: GameObject[] }, o: GameObject): GameObject | undefined {
  if (o.kind === "zone") return undefined;
  let best: GameObject | undefined;
  let bestArea = Infinity;
  for (const z of state.o) {
    if (z.kind !== "zone" || !inZone(z, o.x, o.z)) continue;
    const s = z.zone ?? fixZone(undefined);
    const area = s.w * s.d;
    if (area < bestArea) {
      bestArea = area;
      best = z;
    }
  }
  return best;
}

/**
 * 拖牌压在哪个容器口上：底面投影外扩一档容差，盒边稍偏一点也算要丢进去。
 * 好几个叠在一起取中心离落点最近的那个；正被拖着的那些不能当自己的目标。
 */
export function containerAt(state: { o: GameObject[] }, x: number, z: number, exclude: Iterable<string> = []): GameObject | null {
  const skip = new Set(exclude);
  let best: GameObject | null = null;
  let near = Infinity;
  for (const b of state.o) {
    if (b.hand || skip.has(b.id) || !isContainer(b)) continue;
    const box = boxOf(b);
    if (!inRect(b.x, b.z, b.rot || 0, box.hx * 2.7, box.hz * 2.7, x, z)) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < near) {
      near = d;
      best = b;
    }
  }
  return best;
}

/**
 * 主人是否已经离席：区域垫的 owner 是一个客户端 id，换标签页、重开浏览器都会换一个新的 id。
 * 旧主人不在席时这块区域不该继续把别人锁在外面——里面的牌选不中、区域自己也改不动。
 */
function ownerGone(z: GameObject | undefined, present?: Set<string>): boolean {
  return !!present && !!z?.owner && !present.has(z.owner);
}

/** 隐私区域且我不是创建者：他人不能选中与使用里面的东西；创建者已经离席则不再锁人 */
export function zoneLocked(z: GameObject | undefined, meId: string, present?: Set<string>): boolean {
  return !!z?.priv && !!meId && z.owner !== meId && !ownerGone(z, present);
}

/** 别人的牌屏：屏本身只许主人挪，屏前那一窄条里的东西对别人也别想选中 */
function shieldLocked(s: GameObject | undefined, meId: string, present?: Set<string>): boolean {
  return !!s?.owner && !!meId && s.owner !== meId && !ownerGone(s, present);
}

/** 物件对当前观看者是否上锁：锁住的棋盘、统计垫与桌垫对谁都选不中；别人开了隐私模式的区域本身与区域内的东西也算锁住 */
export function lockedOut(o: GameObject, state: { o: GameObject[] }, meId: string, present?: Set<string>): boolean {
  // 锁住就整块点不中：棋盘上了锁是为下棋清静，子照常落盘，只是没人能再把它拖走
  if (o.kind === "board" || o.kind === "stat") return o.lock === true;
  if (meId === "") return false;
  if (o.kind === "zone") return zoneLocked(o, meId, present);
  if (o.kind === "shield") return shieldLocked(o, meId, present);
  return zoneLocked(zoneOf(state, o), meId, present) || shieldLocked(shieldOver(state, o), meId, present);
}

/** 能上锁的垫子：统计垫、桌垫，以及摆好的棋盘——锁的是「别被顺手拖走」 */
export function lockable(o: GameObject): boolean {
  return o.kind === "stat" || o.kind === "board";
}

/** 能开网格锁定的：真有格子的棋盘。桌垫摊的是一整张图，没格可锁 */
export function gridable(o: GameObject): boolean {
  return o.kind === "board" && !!o.board && o.board.layout !== "mat";
}

/** 桌垫：跟棋盘共用 kind，只有贴了一整张大图的那种才算垫子 */
export function isMat(o: GameObject): boolean {
  return o.kind === "board" && o.board?.layout === "mat";
}

/**
 * 组件库的页签：一件东西只有一个家。
 * 以前「辅助」是个杂物抽屉——音乐、指针、规则书全塞在一格里，棋盘的网格盘又压根没有入口。
 * 这张表就是那份归属：Palette 照它分组，rules-check 照它查漏（新 kind 没登记就报）。
 */
export const PALETTE_TABS = [
  { id: "piece", label: "棋子" },
  { id: "die", label: "骰子" },
  { id: "card", label: "卡牌" },
  { id: "mark", label: "标记" },
  { id: "site", label: "场地" },
  { id: "music", label: "影音" },
  { id: "tool", label: "工具" },
] as const;

export type PaletteTab = (typeof PALETTE_TABS)[number]["id"];

export const KIND_TAB: Record<Kind, PaletteTab> = {
  pawn: "piece",
  disc: "piece",
  cube: "piece",
  die: "die",
  spinner: "die",
  tray: "die",
  card: "card",
  pile: "card",
  box: "card",
  bag: "card",
  token: "mark",
  text: "mark",
  pointer: "mark",
  arrow: "mark",
  track: "mark",
  zone: "site",
  stat: "site",
  slot: "site",
  shield: "site",
  board: "site",
  gram: "music",
  mp3: "music",
  tablet: "music",
  timer: "tool",
  hour: "tool",
  book: "tool",
  calc: "tool",
  counter: "tool",
};

/**
 * 物件叫什么：选中栏的标题、长按菜单里「××加宽」这类行名，全从这一处取。
 * 同一个 kind 换了一身皮就叫另一个名字（区域/垫子/图片垫子，棋盘/桌垫），这里按当前那份皮分开算。
 */
export function displayName(o: GameObject): string {
  switch (o.kind) {
    case "zone":
      return o.zone?.img ? "图片垫子" : o.zone?.pad ? "垫子" : "区域";
    case "board":
      return isMat(o) ? "桌垫" : "棋盘";
    case "pile":
      return "牌堆";
    case "box":
      return "卡牌盒";
    case "bag":
      return "袋子";
    case "die":
      return `d${o.sides ?? 6} 骰子`;
    case "token":
      return "计数标记";
    case "pawn":
    case "disc":
    case "cube":
      return SHAPES.find((s) => s.id === o.shape)?.name ?? "棋子";
    case "card":
      return "卡牌";
    case "timer":
      return "计时器";
    case "pointer":
      return "指针";
    case "arrow":
      return "路径箭头";
    case "text":
      return "文字";
    case "stat":
      return "统计垫";
    case "slot":
      return "卡槽带";
    case "calc":
      return "计算器";
    case "counter":
      return "迷你计数器";
    case "spinner":
      return "转盘";
    case "track":
      return "计分轨";
    case "shield":
      return "牌屏";
    case "hour":
      return "沙漏";
    case "book":
      return "规则书";
    case "gram":
      return "唱片机";
    case "mp3":
      return "随身听";
    case "tablet":
      return "平板浏览器";
    case "tray":
      return "骰盘";
    default:
      return "物件";
  }
}

/** 牌面是否对该玩家保密：物件在别人的区域里就保密，与隐私开关无关（关闭后仍不能看牌面）；躲在别人牌屏后同理 */
export function faceHidden(o: GameObject, state: { o: GameObject[] }, meId: string, present?: Set<string>): boolean {
  if (o.kind === "zone") return false;
  if (o.kind !== "card" && !CONTAINER_KINDS.includes(o.kind)) return false;
  if (shieldLocked(shieldOver(state, o), meId, present)) return true;
  const z = zoneOf(state, o);
  return !!z && !!meId && z.owner !== meId && !ownerGone(z, present);
}

/** 模型体积倍数范围 */
export const SCALE_MIN = 0.35;
export const SCALE_MAX = 3;

export function scaleOf(o: GameObject): number {
  const v = Number(o.scale);
  return Number.isFinite(v) ? clamp(v, SCALE_MIN, SCALE_MAX) : 1;
}

/** 导入大图当桌垫：cols×rows 决定长宽比，cell 决定实际尺寸（米） */
export function matSpec(img: string, cols: number, rows: number, long: number): BoardSpec {
  const side = clamp(long, 0.3, 2.3) / Math.max(cols, rows);
  return { layout: "mat", cols, rows, cell: side, theme: "image", img };
}

export function boardAt(state: { o: GameObject[] }, x: number, z: number): GameObject | undefined {
  return state.o.find((b) => b.kind === "board" && onBoard(b, x, z));
}

export function onBoard(b: GameObject, x: number, z: number): boolean {
  const s = boardSize(b.board!);
  return Math.abs(x - b.x) <= s.w / 2 + 0.01 && Math.abs(z - b.z) <= s.d / 2 + 0.01;
}

export function boardSize(spec: BoardSpec): { w: number; d: number } {
  if (spec.layout === "ring") return { w: spec.cols * spec.cell, d: spec.rows * spec.cell };
  if (spec.layout === "mat") return { w: spec.cols * spec.cell, d: spec.rows * spec.cell };
  // 六边形是尖顶朝上：横着一格宽 √3·size，竖着错开一排只涨 1.5·size，奇数排再让半格
  if (spec.layout === "hex") {
    const hex = Math.sqrt(3) * spec.cell;
    return { w: hex * (spec.cols + 0.5) + 0.016, d: spec.cell * (1.5 * spec.rows + 0.5) + 0.016 };
  }
  if (spec.layout === "lines") {
    const border = spec.cell * LINES_BORDER;
    return { w: (spec.cols - 1) * spec.cell + border * 2, d: (spec.rows - 1) * spec.cell + border * 2 };
  }
  return { w: spec.cols * spec.cell + 0.018 * 2, d: spec.rows * spec.cell + 0.018 * 2 };
}

/**
 * 已知点在某一盘棋的相对坐标上，吸到最近的格心／交叉点并回报第几格（0 起，行主序）。
 * 单独拆出来是因为占用表要对全盘物件反复问同一块盘，每次再 find 一遍棋盘太贵。
 */
export function snapOn(spec: BoardSpec, relX: number, relZ: number): { x: number; z: number; cell: number | null } {
  if (spec.layout === "mat") return { x: relX, z: relZ, cell: null };
  if (spec.layout === "hex") {
    const h = hexSnap(spec, relX, relZ);
    return h ? { x: h.x, z: h.z, cell: h.cell } : { x: relX, z: relZ, cell: null };
  }
  if (spec.layout === "ring") return ringSnap(spec, relX, relZ);
  const col = clamp(Math.round(relX / spec.cell + (spec.cols - 1) / 2), 0, spec.cols - 1);
  const row = clamp(Math.round(relZ / spec.cell + (spec.rows - 1) / 2), 0, spec.rows - 1);
  const cell = row * spec.cols + col;
  const at = cellFor(spec, cell);
  if (!at) return { x: relX, z: relZ, cell: null };
  return { x: at.x, z: at.z, cell };
}

/**
 * 吸附到棋盘上最近的格心／交叉点。
 * 判定与贴图共用 cellFor 那套「号数减去半路数」的偏移，所以线数为偶数的盘也吸得到交点——
 * 拿整数行列号乘 cell 的话，象棋盘上的子会永远骑在线缝里。
 */
export function snap(state: { o: GameObject[] }, x: number, z: number): { x: number; z: number; cell: number | null } {
  const b = boardAt(state, x, z);
  const spec = b?.board;
  if (!b || !spec) return { x, z, cell: null };
  // 自动吸附是默认开着的那一档：显式关掉（snap:false）才让棋子骑在格缝上，锁定盘无论如何都吸
  if (b.snap === false && !b.grid) return { x, z, cell: null };
  const r = snapOn(spec, x - b.x, z - b.z);
  return r.cell === null ? { x, z, cell: null } : { x: b.x + r.x, z: b.z + r.z, cell: r.cell };
}

/**
 * 第 i0 条线（0 起）在棋盘中心的哪一侧：一律按「格号减去半路数」算偏移。
 * 线数为偶数时中心落在两条线之间，只有这种写法才吸得到交点——
 * 拿整数行列号乘 cell 的话，象棋盘上的子会永远骑在线缝里。
 */
export function cellFor(spec: BoardSpec, i: number): { x: number; z: number; col: number; row: number } | null {
  if (spec.layout === "mat") return null;
  if (spec.layout === "ring") {
    const n = spec.cols * 4 - 4;
    if (i < 0 || i >= n) return null;
    return { ...ringCellPos(spec, i), col: i, row: 0 };
  }
  const col = i % spec.cols;
  const row = Math.floor(i / spec.cols);
  if (col < 0 || row < 0 || col >= spec.cols || row >= spec.rows) return null;
  if (spec.layout === "hex") return { ...hexPos(spec, col, row), col, row };
  return {
    x: (col - (spec.cols - 1) / 2) * spec.cell,
    z: (row - (spec.rows - 1) / 2) * spec.cell,
    col,
    row,
  };
}

/** 一盘棋一共多少格：蜂窝与网格按行列铺满，环形只有外圈 */
export function cellCount(spec: BoardSpec): number {
  if (spec.layout === "mat") return 0;
  if (spec.layout === "ring") return spec.cols * 4 - 4;
  return spec.cols * spec.rows;
}

/**
 * 网格里最近的一个空格：想要的格心被占了，就按真实距离由近到远往外找，
 * 全盘占满才罢休。象棋一子一格、围棋一手一子，都靠它把落点排整齐。
 */
export function freeCellAt(spec: BoardSpec, want: number, taken: Set<number>): number | null {
  if (!taken.has(want)) return want;
  const from = cellFor(spec, want);
  if (!from) return null;
  let best: { i: number; d: number } | null = null;
  for (let i = 0; i < cellCount(spec); i++) {
    if (taken.has(i)) continue;
    const c = cellFor(spec, i);
    if (!c) continue;
    const d = Math.hypot(c.x - from.x, c.z - from.z);
    if (!best || d < best.d || (d === best.d && i < best.i)) best = { i, d };
  }
  return best ? best.i : null;
}

/** 离格心超过这个距离就不算「正坐在格上」：毫米级，比一格小得多 */
export const GRID_EPS = 0.0025;

/** 网格锁定只管「摆上去的子」：牌、容器、垫子这些照样想放哪放哪 */
export function gridHug(o: GameObject): boolean {
  return o.kind === "pawn" || o.kind === "disc" || o.kind === "cube" || o.kind === "die" || o.kind === "token";
}

/** 某一枚正坐在这一盘的哪一格：没在盘上、偏出格心或者压根不是子就算不出。盘和物件都已给定，不再回头找棋盘 */
function cellOnBoard(b: GameObject, spec: BoardSpec, o: GameObject): number | null {
  if (o.id === b.id || !gridHug(o) || !blocks(o)) return null;
  const s = boardSize(spec);
  if (Math.abs(o.x - b.x) > s.w / 2 + 0.01 || Math.abs(o.z - b.z) > s.d / 2 + 0.01) return null;
  const g = snapOn(spec, o.x - b.x, o.z - b.z);
  if (g.cell === null || Math.hypot(b.x + g.x - o.x, b.z + g.z - o.z) > GRID_EPS) return null;
  return g.cell;
}

/** 落在锁定棋盘上、且正正坐在格心里的那一枚：算硬障碍，谁也别想把它挤歪 */
export function gridCell(state: { o: GameObject[] }, o: GameObject): { board: GameObject; cell: number } | null {
  const b = boardAt(state, o.x, o.z);
  const spec = b?.board;
  if (!b || !b.grid || !spec) return null;
  const cell = cellOnBoard(b, spec, o);
  return cell === null ? null : { board: b, cell };
}

/** 满桌扫一遍，挑出所有坐在锁定格心上的物件：挤开时它们是钉子，谁也推不动 */
export function anchoredIds(objects: GameObject[]): Set<string> {
  const out = new Set<string>();
  for (const b of objects) {
    if (b.kind !== "board" || !b.grid || !b.board) continue;
    for (const o of objects) {
      const cell = cellOnBoard(b, b.board, o);
      if (cell !== null) out.add(o.id);
    }
  }
  return out;
}

/** 一块锁定盘上已经被占的格号：只扫这一盘，别每问一次就把整桌重新 find 一遍 */
function cellsInUse(state: { o: GameObject[] }, b: GameObject, spec: BoardSpec, skipId: string, carrying: Set<string>): Set<number> {
  const used = new Set<number>();
  for (const other of state.o) {
    if (other.id === skipId || carrying.has(other.id)) continue;
    const cell = cellOnBoard(b, spec, other);
    if (cell !== null) used.add(cell);
  }
  return used;
}

/**
 * 落点收进棋盘格心：锁定盘本格被占就散到最近的空格并标成已用，只开吸附的盘吸到格心就完事。
 * 给了 takes 就顺手管吃子：那一格上站的是异色子，就不散开、正踩上去，并把被吃者的 id 记进 takes。
 */
export function gridSpot(
  state: { o: GameObject[] },
  o: GameObject,
  x: number,
  z: number,
  carrying: Set<string>,
  taken: Map<string, Set<number>>,
  takes?: Set<string>,
): { x: number; z: number } | null {
  if (!gridHug(o)) return null;
  const b = boardAt(state, x, z);
  const spec = b?.board;
  if (!b || !b.grid || !spec) return null;
  const g = snapOn(spec, x - b.x, z - b.z);
  if (g.cell === null) return null;
  let busy = taken.get(b.id);
  if (!busy) {
    busy = cellsInUse(state, b, spec, o.id, carrying);
    taken.set(b.id, busy);
  }
  const prey = takes ? preyOnCell(state, b, spec, g.cell, o, carrying, takes) : null;
  const cell = prey ? g.cell : freeCellAt(spec, g.cell, busy);
  if (cell === null) return null;
  const at = cellFor(spec, cell);
  if (!at) return null;
  busy.add(cell);
  return { x: b.x + at.x, z: b.z + at.z };
}

/** 这一盘吃不吃子：预设写明「踩子即吃」，而且网格锁定开着——吃子本来就是格心之间的事 */
export function takesCapture(b: GameObject): boolean {
  return b.kind === "board" && b.grid === true && presetOf(b)?.take === true;
}

/** 这一盘认不认得行棋规矩（不看锁开没开）：认不出预设、或预设压根没写规矩，就是 null */
export function boardRule(b: GameObject): string | null {
  return b.kind === "board" ? presetOf(b)?.rule ?? null : null;
}

/** 规矩此刻用得上吗：点位就是格心，锁没开的话落点不往格心上贴，标了也落不稳 */
export function rulesOn(b: GameObject): boolean {
  return b.grid === true && boardRule(b) !== null;
}

/** 某一枚正坐在这盘的哪一格：不在格心、压根不是子就是 null。规则按格算账，问这一份 */
export function seatOf(o: GameObject, b: GameObject, spec: BoardSpec): number | null {
  return cellOnBoard(b, spec, o);
}

/** 两家子怎么分敌我：涂了不同颜色才算敌人，有一方没涂色就说不清敌我，别乱吃也别拦路。
 * 递了 camps 就再严一档：两色都得是这盘登记过的那两家才作数——第三色（随手拉来的标记、罐口的备用子）在这盘上谁也不吃。 */
export function enemyOf(a: GameObject, b: GameObject, camps?: [string, string] | null): boolean {
  return foes(a, b, camps);
}

/** 能上桌当棋子使的：跟「占不占格」同一套口径，骰子不算——它是随机器，不是谁家的兵 */
function playable(o: GameObject): boolean {
  return o.kind !== "die" && gridHug(o) && blocks(o);
}

/** 两枚子算不算两家：颜色不同才是敌人，都没涂色就说不清敌我，别乱吃 */
function foes(a: GameObject, b: GameObject, camps?: [string, string] | null): boolean {
  if (!a.color || !b.color || a.color.toLowerCase() === b.color.toLowerCase()) return false;
  if (!camps) return true;
  const x = campSide(a, camps);
  const y = campSide(b, camps);
  return x >= 0 && y >= 0 && x !== y;
}

/** 这一盘登记的两家颜色：没挂规矩、或规矩没登颜色的盘就是 null，退到「异色即敌」的沙盒口径 */
export function campsOf(b: GameObject): [string, string] | null {
  const rule = boardRule(b);
  return rule ? RULE_CAMPS[rule] ?? null : null;
}

/** 这一枚算盘上的哪一家：0 / 1，颜色对不上登记的两家就是 -1（第三色，谁也不认它） */
export function campSide(o: GameObject, camps: [string, string] | null): number {
  const color = (o.color ?? "").toLowerCase();
  return camps ? camps.findIndex((c) => c.toLowerCase() === color) : -1;
}

/**
 * 落点这一格上的吃子目标：棋类盘、格里正好站着一枚异色子才成立，找到的目标记进 claimed。
 * 拖动的红环、松手的落点、归约的删子问的都是它，所以圈住谁就没的就是谁。
 */
export function preyAt(
  state: { o: GameObject[] },
  mover: GameObject,
  x: number,
  z: number,
  carrying: Set<string> = new Set<string>([mover.id]),
  claimed?: Set<string>,
): GameObject | null {
  if (!gridHug(mover)) return null;
  const b = boardAt(state, x, z);
  const spec = b?.board;
  if (!b || !spec || !takesCapture(b)) return null;
  const g = snapOn(spec, x - b.x, z - b.z);
  return g.cell === null ? null : preyOnCell(state, b, spec, g.cell, mover, carrying, claimed ?? new Set<string>());
}

/** 某一格上站着的那枚敌手：同色、或者一格里挤了几枚说不清吃谁，都当场放弃 */
function preyOnCell(
  state: { o: GameObject[] },
  b: GameObject,
  spec: BoardSpec,
  cell: number,
  mover: GameObject,
  carrying: Set<string>,
  claimed: Set<string>,
): GameObject | null {
  let found: GameObject | null = null;
  const camps = campsOf(b);
  for (const o of state.o) {
    if (o.id === mover.id || o.id === b.id || carrying.has(o.id) || claimed.has(o.id) || !playable(o)) continue;
    if (cellOnBoard(b, spec, o) !== cell) continue;
    if (found || !foes(o, mover, camps)) return null;
    found = o;
  }
  if (found) claimed.add(found.id);
  return found;
}


/** 奇数排整体让出半格宽，两排一起再往回缩四分之一格，整片蜂窝才居中在棋盘上 */
function hexSkew(spec: BoardSpec, row: number): number {
  const hexW = HEX_W * spec.cell;
  return (row % 2 ? hexW / 2 : 0) - hexW / 4;
}

/**
 * 第 col 列、第 row 行的六边形格心（相对棋盘中心的米制偏移）。
 * 尖顶六边形竖着排：一排之间只前进 1.5 倍边长，奇数排横向让出半个格宽。
 * 贴图和吸附都读这一份，画出来的格子和吸进去的位置才对得上。
 */
export function hexPos(spec: BoardSpec, col: number, row: number): { x: number; z: number } {
  return {
    x: (col - (spec.cols - 1) / 2) * HEX_W * spec.cell + hexSkew(spec, row),
    z: (row - (spec.rows - 1) / 2) * spec.cell * 1.5,
  };
}

/** 一个点最近的那格：先看附近三排，每排再比三格，取中心离得最近的 */
function hexSnap(spec: BoardSpec, relX: number, relZ: number): { x: number; z: number; cell: number } | null {
  const hexW = HEX_W * spec.cell;
  const row0 = Math.round(relZ / (1.5 * spec.cell) + (spec.rows - 1) / 2);
  let best: { col: number; row: number; d: number } | null = null;
  for (let r = row0 - 1; r <= row0 + 1; r++) {
    if (r < 0 || r >= spec.rows) continue;
    const c0 = Math.round((relX - hexSkew(spec, r)) / hexW + (spec.cols - 1) / 2);
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (c < 0 || c >= spec.cols) continue;
      const at = hexPos(spec, c, r);
      const d = Math.hypot(at.x - relX, at.z - relZ);
      if (!best || d < best.d) best = { col: c, row: r, d };
    }
  }
  if (!best) return null;
  const at = hexPos(spec, best.col, best.row);
  return { x: at.x, z: at.z, cell: best.row * spec.cols + best.col };
}

/**
 * 第 i 格跑道在盘心的相对坐标。格子是一圈单格宽的赛道，
 * 所以坐的是这条带的中线（外沿往里半格），不是最外边那根线——
 * 贴图把数字写在带子里，子就得坐在带子里，差半格看着就是压着边线跑。
 */
export function ringCellPos(spec: BoardSpec, i: number) {
  const per = spec.cols - 1;
  const n = per * 4;
  const k = ((i % n) + n) % n;
  const half = (spec.cols * spec.cell) / 2;
  const mid = half - spec.cell / 2;
  const o = k % per;
  const a = -half + (o + 0.5) * spec.cell;
  const side = Math.floor(k / per);
  if (side === 0) return { x: a, z: -mid };
  if (side === 1) return { x: mid, z: a };
  if (side === 2) return { x: -a, z: mid };
  return { x: -mid, z: -a };
}

/**
 * 环形吸附：四条边各按「沿线数第几格」取一个候选格心（越界就夹到该边的头尾），
 * 再比谁真的离得近。只按角度分格不行——方环角上那条 45° 射线对出去的格子，
 * 和眼睛看到的那一格差着一两格；只按最近的边也不行，角上的格子两边都够得着。
 */
function ringSnap(spec: BoardSpec, relX: number, relZ: number): { x: number; z: number; cell: number | null } {
  const per = Math.max(1, spec.cols - 1);
  const cell = spec.cell;
  const half = (spec.cols * cell) / 2;
  let best: { cell: number; d: number } | null = null;
  for (let side = 0; side < 4; side++) {
    const along = side === 0 || side === 2 ? relX : relZ;
    const t = side === 0 || side === 1 ? along + half : half - along;
    const o = clamp(Math.round(t / cell - 0.5), 0, per - 1);
    const idx = side * per + o;
    const at = ringCellPos(spec, idx);
    const d = Math.hypot(at.x - relX, at.z - relZ);
    if (!best || d < best.d - 1e-9) best = { cell: idx, d };
  }
  // 赛道只有一格宽：偏进 infield 超过一格就不再往圈上吸，骰子和牌堆才有地方待
  if (!best || best.d > cell) return { x: relX, z: relZ, cell: null };
  const at = ringCellPos(spec, best.cell);
  return { x: at.x, z: at.z, cell: best.cell };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 导入时「每张份数」的手填范围：一张图解码一次铺成 N 份同样的牌，像素只上传一次。只管导入那一下，不进状态，所以四份校验镜像用不上 */
export const COPY_MIN = 1;
export const COPY_MAX = 999;

/** 手打的份数收进范围：空着、打歪的、负的都当一张一份 */
export function fixCopies(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? clamp(n, COPY_MIN, COPY_MAX) : COPY_MIN;
}

/** 坐标保留三位小数（毫米）：各端算出的落点才对得上 */
export function r3(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
}

/** 角度收进 0~359 的整数度：和归约端同一套，槽位朝向不会各算各的 */
export function deg360(v: number): number {
  const deg = Number.isFinite(v) ? v : 0;
  return Math.round(((deg % 360) + 360) % 360);
}

export function inTable(x: number, z: number) {
  const hw = TABLE.w / 2 - 0.03;
  const hd = TABLE.d / 2 - 0.03;
  return { x: clamp(x, -hw, hw), z: clamp(z, -hd, hd) };
}

export const OBJECT_LIMIT = 420;

/** 物件占桌面的半径（米）：碰撞与选中圈都用它，渲染层也 import 这一份 */
export function footprintOf(o: GameObject): number {
  if (o.kind === "board") {
    if (!o.board) return 0.3;
    const s = boardSize(o.board);
    return Math.max(s.w, s.d) / 2;
  }
  const k = scaleOf(o);
  // 带图的牌改了牌形，占桌半径按对角线同比跟着改，标准比例时系数正好是 1
  const isCard = o.kind === "card" || o.kind === "pile" || o.kind === "box" || o.kind === "bag";
  const ck = isCard ? Math.hypot(shapeOf(o).w, shapeOf(o).d) / CARD_DIAG : 1;
  switch (o.kind) {
    case "card": return 0.038 * k * ck;
    case "zone": return (Math.max(o.zone?.w ?? 0.5, o.zone?.d ?? 0.36) / 2) * k;
    case "stat": return (Math.max(o.stat?.w ?? 0.6, o.stat?.d ?? 0.42) / 2) * k;
    case "slot": return (slotSize(o).w / 2) * k;
    case "track": return (trackSize(o).w / 2) * k;
    case "spinner": return SPIN_R * k;
    case "pile": return 0.042 * k * ck;
    case "box": return 0.05 * k * ck;
    case "bag": return 0.033 * k * ck;
    case "die": return 0.019 * k;
    case "token": return 0.02 * k;
    case "disc": return pieceSize(o.shape).r * k;
    case "cube":
      if (o.shape === "tri" || o.shape === "star") return pieceSize(o.shape).r * k;
      return (o.shape === "bar" ? 0.03 : 0.017) * k;
    case "pawn": return pieceSize(o.shape).r * k;
    case "timer": return 0.032 * k;
    case "calc": return 0.06 * k;
    case "pointer": return 0.03 * k;
    case "shield": return ((o.shield ?? fixShield(undefined)).w / 2) * k;
    // 平板是立着的一块宽屏：占桌面按屏宽取，跟牌屏一个口径
    case "tablet": return (TABLET_BODY.w / 2) * k;
    case "hour": return HOUR_R * k;
    case "book": return (Math.hypot(BOOK_SPREAD.w, BOOK_SPREAD.d) / 2) * k;
    case "gram": return (Math.hypot(GRAM_BODY.w, GRAM_BODY.d) / 2) * k;
    case "mp3": return (Math.hypot(MP3_BODY.w, MP3_BODY.d) / 2) * k;
    case "counter": return (Math.hypot(COUNTER_BODY.w, COUNTER_BODY.d) / 2) * k;
    case "tray": return (Math.max(trayOuter(o).w, trayOuter(o).d) / 2) * k;
    case "arrow": return Math.max(0.035, ((o.len ?? 0.3) / 2) * 1.15) * k;
    case "text": return 0.085 * k;
    default: return 0.02 * k;
  }
}

/**
 * 每类物件的碰撞盒（米，缩放前）：hx/hz 是底面半边长，h 是立起来的全高，
 * 数值照着 three/pieces.ts 里的实际网格来，渲染和物理才对得上。
 */
const BOXES: Record<Kind, { hx: number; hz: number; h: number }> = {
  card: { hx: 0.0315, hz: 0.045, h: 0.0024 },
  pile: { hx: 0.0315, hz: 0.045, h: 0.006 },
  box: { hx: 0.038, hz: 0.049, h: 0.034 },
  bag: { hx: 0.03, hz: 0.03, h: 0.06 },
  die: { hx: 0.016, hz: 0.016, h: 0.032 },
  token: { hx: 0.0195, hz: 0.0195, h: 0.0075 },
  disc: { hx: 0.0225, hz: 0.0225, h: 0.0085 },
  cube: { hx: 0.0155, hz: 0.0155, h: 0.031 },
  pawn: { hx: 0.018, hz: 0.018, h: 0.05 },
  timer: { hx: 0.0305, hz: 0.0305, h: 0.009 },
  pointer: { hx: 0.015, hz: 0.015, h: 0.072 },
  arrow: { hx: 0.15, hz: 0.0075, h: 0.005 },
  text: { hx: 0.085, hz: 0.03, h: 0.012 },
  calc: { hx: 0.041, hz: 0.0575, h: 0.011 },
  zone: { hx: 0.25, hz: 0.18, h: 0.001 },
  stat: { hx: 0.3, hz: 0.21, h: 0.001 },
  slot: { hx: 0.108, hz: 0.05, h: 0.001 },
  // 转盘是一块立起来的圆盘面，指针占一点高度
  spinner: { hx: 0.088, hz: 0.088, h: 0.016 },
  // 计分轨是贴面薄片：hx 按格数现算，这里只兜住默认宽度
  track: { hx: 0.231, hz: 0.0375, h: 0.004 },
  // 牌屏是一块立着的薄板：hx 沿屏面按屏宽现算，纵深只有板厚那一线
  shield: { hx: 0.12, hz: 0.008, h: 0.15 },
  // 平板浏览器是一块平躺的薄板：屏面朝上坐在桌布上，盒就是机身那一圈，厚度只有 h 那一线
  tablet: { hx: TABLET_BODY.w / 2, hz: TABLET_BODY.d / 2, h: TABLET_BODY.h },
  // 沙漏按木架那一圈取盒，玻璃罩上下都收口，不会比架子更宽
  hour: { hx: 0.032, hz: 0.032, h: 0.078 },
  // 规则书摊开就是两片书页，盒高留一点给书脊
  book: { hx: 0.085, hz: 0.0575, h: 0.014 },
  // 唱片机按机箱取盒：唱臂伸出去那一截算在盒里，推它不会推着盘子转
  gram: { hx: 0.18, hz: 0.15, h: 0.085 },
  // 随身听就是一块巴掌大的盒子，边上那颗耳机座凸出去一点，算在盒里
  mp3: { hx: 0.07, hz: 0.0375, h: 0.02 },
  // 迷你计数器是一小片薄板，盒就照它的三围取，不加任何凸出
  counter: { hx: COUNTER_BODY.w / 2, hz: COUNTER_BODY.d / 2, h: COUNTER_BODY.h },
  // 骰盘是一只浅盒：hx/hz 按外沿现算，盒高只到盘壁那么矮
  tray: { hx: 0.112, hz: 0.082, h: TRAY_H },
  board: { hx: 0.3, hz: 0.3, h: 0.022 },
};

/** 碰撞盒：形状、骰面数、箭头长度、装了多少牌都会改变它，最后统一乘体积缩放 */
export function boxOf(o: GameObject): { hx: number; hz: number; h: number } {
  const box = { ...(BOXES[o.kind] ?? BOXES.token) };
  // 棋子一形一尺寸：底盘半径与总高都从 PIECE_SIZE 来，渲染几何用的也是它，物理才对得上视觉
  if ((o.kind === "disc" || o.kind === "pawn") && o.shape) {
    const p = pieceSize(o.shape);
    Object.assign(box, { hx: p.r, hz: p.r, h: p.h });
  }
  if (o.kind === "cube" && o.shape === "bar") Object.assign(box, { hx: 0.0275, hz: 0.014, h: 0.014 });
  // 三角片/五角星是平躺薄片：占桌面按外接半径，厚度只有片身那点
  if (o.kind === "cube" && (o.shape === "tri" || o.shape === "star")) {
    const p = pieceSize(o.shape);
    Object.assign(box, { hx: p.r, hz: p.r, h: p.h });
  }
  if (o.kind === "die") {
    const r = 0.013 + clamp(o.sides ?? 6, 4, 20) * 0.0007;
    Object.assign(box, { hx: r, hz: r, h: r * 2 });
  }
  if (o.kind === "arrow") box.hx = Math.max(0.035, (o.len ?? 0.3) / 2);
  if (o.kind === "slot") {
    const s = slotSize(o);
    Object.assign(box, { hx: s.w / 2, hz: s.d / 2 });
  }
  if (o.kind === "track") {
    const s = trackSize(o);
    Object.assign(box, { hx: s.w / 2, hz: s.d / 2 });
  }
  // 骰盘的外沿随内径涨：碰撞盒要盖住四壁，不然盘里的骰子会当成贴在空处
  if (o.kind === "tray") {
    const s = trayOuter(o);
    Object.assign(box, { hx: s.w / 2, hz: s.d / 2, h: TRAY_H });
  }
  // 屏面比默认宽，屏高也比默认高：改过尺寸的牌屏才挡得住对应手掌宽的牌
  if (o.kind === "shield") {
    const s = o.shield ?? fixShield(undefined);
    Object.assign(box, { hx: s.w / 2, h: s.h });
  }
  if (o.kind === "pile" || o.kind === "box") {
    box.h = Math.max(box.h, (o.pile?.length ?? 0) * 0.0022 + (o.kind === "box" ? 0.004 : 0));
  }
  // 牌形变了，装它的盒口/袋口也同比变，不然宽牌一头捅穿盒壁
  if (o.kind === "card" || o.kind === "pile" || o.kind === "box" || o.kind === "bag") {
    const s = shapeOf(o);
    box.hx *= s.w / CARD_BASE.w;
    box.hz *= s.d / CARD_BASE.d;
  }
  const k = scaleOf(o);
  return { hx: box.hx * k, hz: box.hz * k, h: box.h * k };
}

/** 选中框的自适应轮廓（米，物件本地坐标，未转未缩，原点就是物件基点）。
 *  w/d 是占桌的长宽，r 是圆角半径——r 等于短边一半就是正圆；pts 是多边形顶点，给了就按它贴。 */
export interface Outline {
  w: number;
  d: number;
  r: number;
  pts?: [number, number][];
}

/** 底盘真圆的种类：框收成正圆，别拿"圆角拉满的矩形"糊弄成一颗方糖 */
const ROUND_KINDS: Kind[] = ["token", "disc", "pawn", "timer", "spinner", "hour"];

/** 三角片与五角星底面的顶点：建模（three/pieces.ts 的 cubeGeometry）与选中框共用这一份，才不会各画各的。
 *  只有这两种是多边形，其余形状走圆角矩形 */
export function piecePoints(shape: string, k = 1): [number, number][] {
  if (shape === "tri") {
    return [[-0.026, -0.02], [0.026, -0.02], [0, 0.026]].map(([x, y]) => [x * k, y * k] as [number, number]);
  }
  const R = 0.026 * k;
  const rIn = R * 0.42;
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const ang = Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : rIn;
    pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
  }
  return pts;
}

/** 这个物件的脚到底占了一块什么形状的地：选中框照着它描，不再一律套一个圆或椭圆 */
export function outlineOf(o: GameObject): Outline {
  const b = boxOf(o);
  const k = scaleOf(o);
  let w = b.hx * 2;
  let d = b.hz * 2;
  // 这三样的长宽是用户填的，BOXES 里只有兜底默认值，描框要照真值
  if (o.kind === "board" && o.board) {
    const s = boardSize(o.board);
    w = s.w;
    d = s.d;
  } else if (o.kind === "zone") {
    const z = fixZone(o.zone);
    w = z.w * k;
    d = z.d * k;
  } else if (o.kind === "stat") {
    const s = fixStat(o.stat);
    w = s.w * k;
    d = s.d * k;
  }
  const short = Math.min(w, d);
  if (o.kind === "cube" && (o.shape === "tri" || o.shape === "star")) {
    return { w, d, r: short / 2, pts: piecePoints(o.shape, k) };
  }
  return { w, d, r: ROUND_KINDS.includes(o.kind) ? short / 2 : Math.min(0.0035 * k, short * 0.16) };
}

/** 一张牌在绒布上被斜推出去的实测级摩擦系数：太滑像冰面，太涩像砂纸 */
export interface Material {
  /** 质量（千克）：只用于比谁让路，绝对值照真实物件取 */
  mass: number;
  /** 绒布上的动摩擦系数 */
  mu: number;
  /** 撞围板与桌面的恢复系数：塑料回弹，纸片直接闷住 */
  e: number;
  /** 最多弹几下：牌落地一声闷响，骰子要跳两跳才安分 */
  hops: number;
}

export const MATERIALS: Record<Kind, Material> = {
  card: { mass: 0.0002, mu: 0.44, e: 0.04, hops: 0 },
  pile: { mass: 0.03, mu: 0.4, e: 0.06, hops: 0 },
  box: { mass: 0.12, mu: 0.36, e: 0.18, hops: 1 },
  bag: { mass: 0.05, mu: 0.52, e: 0.08, hops: 0 },
  die: { mass: 0.005, mu: 0.22, e: 0.52, hops: 3 },
  token: { mass: 0.0016, mu: 0.34, e: 0.2, hops: 1 },
  disc: { mass: 0.003, mu: 0.3, e: 0.38, hops: 2 },
  cube: { mass: 0.004, mu: 0.3, e: 0.3, hops: 2 },
  pawn: { mass: 0.006, mu: 0.28, e: 0.34, hops: 2 },
  timer: { mass: 0.03, mu: 0.35, e: 0.16, hops: 1 },
  pointer: { mass: 0.004, mu: 0.3, e: 0.2, hops: 1 },
  arrow: { mass: 0.0012, mu: 0.42, e: 0.1, hops: 0 },
  text: { mass: 0.002, mu: 0.4, e: 0.1, hops: 0 },
  calc: { mass: 0.09, mu: 0.32, e: 0.2, hops: 1 },
  zone: { mass: 0, mu: 1, e: 0, hops: 0 },
  stat: { mass: 0, mu: 1, e: 0, hops: 0 },
  slot: { mass: 0, mu: 1, e: 0, hops: 0 },
  track: { mass: 0, mu: 1, e: 0, hops: 0 },
  // 转盘是一只实心的木盘：推它得费点劲，撞到围板也就一声闷响
  spinner: { mass: 0.12, mu: 0.4, e: 0.12, hops: 0 },
  // 牌屏是块亚克力板：立着不太倒，撞一下会挪窝
  shield: { mass: 0.03, mu: 0.38, e: 0.24, hops: 1 },
  // 沙漏一只玻璃罩加木架：沉，撞出去也就滚半圈
  hour: { mass: 0.09, mu: 0.32, e: 0.1, hops: 0 },
  // 一本书压得住牌：又重又涩，推它跟推一块砖差不多
  book: { mass: 0.2, mu: 0.52, e: 0.04, hops: 0 },
  // 木机箱的唱片机：桌上最沉的小家电，推一下挪半寸，撞到围板一声闷响
  gram: { mass: 0.3, mu: 0.5, e: 0.06, hops: 0 },
  // 随身听轻，但里面是一块电池，比一张牌沉得多，牌撞上它不会被顶开
  mp3: { mass: 0.12, mu: 0.45, e: 0.1, hops: 0 },
  // 一台显示器：桌上最沉的一件，底座又是宽脚，推它纹丝不动，撞上去也闷声不响
  tablet: { mass: 1.2, mu: 0.55, e: 0.03, hops: 0 },
  // 迷你计数器是一小片塑料：比牌还轻，所以它去贴牌边时永远是它让路，不会把牌顶歪
  counter: { mass: 0.0006, mu: 0.4, e: 0.08, hops: 0 },
  // 骰盘是一只实心浅盒：比一枚骰子沉得多，撞上去骰子被弹回盘里而不是顶走盘子
  tray: { mass: 0.14, mu: 0.5, e: 0.1, hops: 0 },
  board: { mass: 0.45, mu: 0.55, e: 0.05, hops: 0 },
};

/** 重力加速度（米/秒²）：整套下坠与滑行都按真实值算 */
export const G = 9.81;

/** 摩擦与弹性是材料属性不变，质量随体积倍数按立方涨 */
export function materialOf(o: GameObject): Material {
  const base = MATERIALS[o.kind] ?? MATERIALS.token;
  const k = scaleOf(o);
  return { mass: base.mass * k * k * k, mu: base.mu, e: base.e, hops: base.hops };
}

/** 按 rot 转过之后在两条轴上的投影半宽：贴围板要看真实占位，不能只看半径 */
export function spanOf(o: GameObject, rot = o.rot || 0): { x: number; z: number } {
  const b = boxOf(o);
  const rad = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { x: b.hx * c + b.hz * s, z: b.hx * s + b.hz * c };
}

/** 围板内沿：让整个投影都留在绒布上才算贴住边，斜放的长条骨牌也因此让得更多 */
export function restInTable(o: GameObject, x: number, z: number): { x: number; z: number } {
  const r = spanOf(o);
  const hw = Math.max(0.02, TABLE.w / 2 - r.x);
  const hd = Math.max(0.02, TABLE.d / 2 - r.z);
  return { x: clamp(x, -hw, hw), z: clamp(z, -hd, hd) };
}

/** 点是否落在物件转过后的碰撞盒里 */
export function inFootprint(o: GameObject, x: number, z: number, ox = o.x, oz = o.z): boolean {
  const b = boxOf(o);
  return inRect(ox, oz, o.rot || 0, b.hx * 2, b.hz * 2, x, z);
}

/**
 * 俯仰角绕的是底面中心：牌一斜，靠自己的这条边就往下扎 hz·sinθ 那么深。
 * 基点抬高同样的量，斜靠的牌才是「站」在桌上而不是插进桌布里。
 */
export function liftFor(o: GameObject, tilt = o.tilt ?? 0): number {
  return boxOf(o).hz * Math.abs(Math.sin((tilt * Math.PI) / 180));
}

/** 斜靠或立起来之后，从基点往上占到多高 */
export function riseFor(o: GameObject, tilt = o.tilt ?? 0): number {
  const box = boxOf(o);
  const rad = (Math.abs(tilt) * Math.PI) / 180;
  return box.h * Math.cos(rad) + box.hz * Math.sin(rad);
}

export function tiltLift(o: GameObject): number {
  return liftFor(o, o.tilt ?? 0);
}

export function tiltRise(o: GameObject): number {
  return riseFor(o, o.tilt ?? 0);
}

/** 底面中心离桌面的高度（不含俯仰抬升）：贴层 + 贴面薄片的悬浮量 */
export function floorY(state: { o: GameObject[] }, o: GameObject): number {
  const decal = DECAL_KINDS.includes(o.kind) ? DECAL_LIFT : 0;
  return surfaceY(state, o.x, o.z) + o.layer * LAYER_H + decal;
}

/** 渲染层真正摆下去的高度：物理与显示共用这一份，斜牌不穿桌全靠它 */
export function baseY(state: { o: GameObject[] }, o: GameObject): number {
  return floorY(state, o) + tiltLift(o);
}

/** 会移动、会被挤开的物件：棋盘与贴面垫不参与，手牌不在桌上，锁定的钉在原位 */
export function movable(o: GameObject): boolean {
  return !o.hand && !o.pin && o.kind !== "board" && !DECAL_KINDS.includes(o.kind);
}

/** 挡路的物件：锁定的也算——它是硬障碍，别人要么绕开要么落到它上面 */
export function blocks(o: GameObject): boolean {
  return !o.hand && o.kind !== "board" && !DECAL_KINDS.includes(o.kind);
}

/**
 * 竖直方向占的是同一段空气吗：层差一档 4mm，各自的多高由碰撞盒和俯仰角决定。
 * 立在旁边的棋子头顶盖过一张平铺的牌，它们就不算挤在一块儿，谁也不用让谁。
 * 竖直区间错不开才去比水平投影，相交时带回最小推开量。
 */
export function clashes(a: GameObject, b: GameObject): { nx: number; nz: number; depth: number } | null {
  const lo1 = a.layer * LAYER_H, hi1 = lo1 + tiltLift(a) + tiltRise(a);
  const lo2 = b.layer * LAYER_H, hi2 = lo2 + tiltLift(b) + tiltRise(b);
  if (lo1 >= hi2 - 0.0005 || lo2 >= hi1 - 0.0005) return null;
  return hitBox(a, a.x, a.z, b, b.x, b.z);
}

/**
 * 水平投影相交判定：两枚按各自 rot 转过的矩形用分离轴定理比。
 * 长条牌、箭头这类细长物件转 90° 后占的地方完全不一样，按半径算会让斜放的积木互相穿过去。
 * 相交时返回 a→b 方向上的最小推开量，正好给挤开当位移用。
 */
export function hitBox(
  a: GameObject,
  ax: number,
  az: number,
  b: GameObject,
  bx: number,
  bz: number,
): { nx: number; nz: number; depth: number } | null {
  const ra = boxOf(a);
  const rb = boxOf(b);
  // 包围半径先兜一层，比得动才进分离轴；这个半径一定不小于真实半对角线
  if (Math.hypot(bx - ax, bz - az) > Math.hypot(ra.hx, ra.hz) + Math.hypot(rb.hx, rb.hz)) return null;
  const ar = ((a.rot || 0) * Math.PI) / 180;
  const br = ((b.rot || 0) * Math.PI) / 180;
  const axes: [number, number][] = [
    [Math.cos(ar), Math.sin(ar)],
    [-Math.sin(ar), Math.cos(ar)],
    [Math.cos(br), Math.sin(br)],
    [-Math.sin(br), Math.cos(br)],
  ];
  let depth = Infinity;
  let nx = 0;
  let nz = 0;
  for (const [ux, uz] of axes) {
    const spread = (box: { hx: number; hz: number }, rad: number) =>
      box.hx * Math.abs(ux * Math.cos(rad) + uz * Math.sin(rad)) + box.hz * Math.abs(uz * Math.cos(rad) - ux * Math.sin(rad));
    const d = (bx - ax) * ux + (bz - az) * uz;
    const over = spread(ra, ar) + spread(rb, br) - Math.abs(d);
    if (over <= 0) return null;
    if (over < depth) {
      depth = over;
      nx = d >= 0 ? ux : -ux;
      nz = d >= 0 ? uz : -uz;
    }
  }
  return { nx, nz, depth: depth + 0.001 };
}

/** 会不会和这个落点撞到：水平投影要重叠，竖直区间也要重叠 */
function overlaps(state: { o: GameObject[] }, a: GameObject, x: number, z: number, b: GameObject, lo: number, hi: number): boolean {
  if (b.id === a.id || !blocks(b)) return false;
  // 斜靠的最低点已经落在地面（基点抬了 lift 就是为这个），占的高是 lift + rise
  const bottom = floorY(state, b);
  if (bottom >= hi - 0.0005 || bottom + tiltLift(b) + tiltRise(b) <= lo + 0.0005) return false;
  return !!hitBox(a, x, z, b, b.x, b.z);
}

/**
 * 解锁后该停在哪一层：从贴桌的 0 层往上找，哪一层被占住就再抬一层。
 * 锁着的物件也算支撑物，所以下面垫着一张悬空的牌时，落下来会停在它上面一层。
 */
export function restLayer(state: { o: GameObject[] }, o: GameObject, x: number, z: number): number {
  return clearLayer(state, { ...o, tilt: undefined, pin: undefined }, x, z, 0);
}

/**
 * 落点该在哪一层：压到同层的牌/圆片/标记/牌堆上就抬到它们上面一层。
 * 锁定的物件不落回去，所以调用方（拖动落点与解锁结算）要自己先排除。
 */
export function autoLayer(state: { o: GameObject[] }, moving: GameObject, x: number, z: number, current: number): number {
  // 棋盘自己就是台面：搬动时保持原来的层，别把叠起来的棋盘拍平
  if (moving.kind === "board") return current;
  return clearLayer(state, moving, x, z, current);
}

/**
 * 落点该在哪一层：压到同层的牌/圆片/标记/牌堆上就抬到它们上面一层。
 * 锁定的物件不落回去，所以调用方（拖动落点与解锁结算）要自己先排除。
 * 一层层空试够不着满盒卡牌的顶面（120 张的盒子高约 0.27m），所以直接按挡路的顶面算层数。
 */
export function clearLayer(state: { o: GameObject[] }, o: GameObject, x: number, z: number, from = 0): number {
  const here = { ...o, x, z };
  const base = surfaceY(state, x, z);
  let layer = Math.max(0, Math.round(from));
  for (let guard = 0; guard < 12 && layer <= LAYER_MAX; guard++) {
    const me = { ...here, layer };
    const lo = base + layer * LAYER_H;
    const hi = lo + tiltLift(me) + tiltRise(me);
    let need = layer;
    for (const b of state.o) {
      if (!overlaps(state, me, x, z, b, lo, hi)) continue;
      const top = floorY(state, b) + tiltLift(b) + tiltRise(b);
      need = Math.max(need + 1, Math.ceil((top - base) / LAYER_H));
    }
    if (need === layer) return layer;
    layer = need;
  }
  return Math.min(layer, LAYER_MAX);
}

/** 吸附容差（米）：中心靠到 1.4cm 以内就整齐对齐，再远手感就像在抢位 */
export const SNAP_TOL = 0.014;

/** 值得对齐的候选坐标：别的物件的中心与边缘，再加桌面中线 */
function snapTargets(state: { o: GameObject[] }, moving: GameObject): { xs: number[]; zs: number[] } {
  const xs = [-TABLE.w / 4, 0, TABLE.w / 4];
  const zs = [-TABLE.d / 4, 0, TABLE.d / 4];
  for (const b of state.o) {
    if (b.id === moving.id || b.hand) continue;
    const r = footprintOf(b);
    xs.push(b.x - r, b.x, b.x + r);
    zs.push(b.z - r, b.z, b.z + r);
  }
  return { xs, zs };
}

/**
 * 拖动吸附：把落点拉到附近物件的中心或边缘上，只吸离得更近的那一根轴时另一轴不动。
 * 预览和提交都走这一份，所以"看起来吸住了"和"落下去吸住了"是同一件事。
 */
export function snapTo(state: { o: GameObject[] }, moving: GameObject, x: number, z: number): { x: number; z: number } {
  if (moving.kind === "board") return { x, z };
  const { xs, zs } = snapTargets(state, moving);
  let bestX = 0;
  let dx = SNAP_TOL + 1;
  for (const t of xs) {
    const d = Math.abs(t - x);
    if (d < dx && d <= SNAP_TOL) { dx = d; bestX = t - x; }
  }
  let bestZ = 0;
  let dz = SNAP_TOL + 1;
  for (const t of zs) {
    const d = Math.abs(t - z);
    if (d < dz && d <= SNAP_TOL) { dz = d; bestZ = t - z; }
  }
  return { x: r3(x + bestX), z: r3(z + bestZ) };
}

/**
 * 挤开：只有竖直区间也重叠的物件才互相让路，刚移动的一方钉在落点，
 * 被压到的沿连线让开，让路后再压到别人就继续传递。
 * 让多少由质量比定：筹码撞到盒子是筹码自己弹开，盒子挪一下能顶开一片。
 * keepShape 是刚性平移（搬棋盘、拖区域垫）：一起搬的东西保持彼此的距离，只让没动的让路。
 * anchored 是坐在锁定棋盘格心里的子：跟锁死的一样是钉子，互相之间不挪，只把旁人顶开。
 * 只在 move 归约里跑，坐标每步收到三位小数，保证各端从同一个动作算出同一份桌面。
 */
export function separate(objects: GameObject[], moved: string[], keepShape = false, anchored?: Set<string>): GameObject[] {
  const movers = new Set(moved);
  const fixed = (o: GameObject) => !movable(o) || anchored?.has(o.id) === true;
  const out = objects.slice();
  let frontier = [...movers];
  for (let pass = 0; pass < 24 && frontier.length; pass++) {
    const next: string[] = [];
    for (const id of frontier) {
      const i = out.findIndex((o) => o.id === id);
      if (i < 0 || fixed(out[i])) continue;
      for (let j = 0; j < out.length; j++) {
        if (j === i) continue;
        const a = out[i];
        const b = out[j];
        if (!blocks(b)) continue;
        if (keepShape && movers.has(b.id)) continue;
        const hit = clashes(a, b);
        if (!hit) continue;
        const ux = hit.nx;
        const uz = hit.nz;
        const gap = hit.depth;
        // 对面是锁着的墙就自己让开；刚移动的一方钉在落点，让没动的承担全部位移
        const aMoved = movers.has(a.id);
        const bMoved = movers.has(b.id);
        const wall = fixed(b);
        const ma = materialOf(a).mass;
        const mb = materialOf(b).mass;
        // 两边都在动（互相挤开的连锁）才谈分摊：按对面质量占自己轻重的比例分，重的少让
        const share = ma + mb > 0 ? mb / (ma + mb) : 0.5;
        const fa = wall ? 1 : aMoved === bMoved ? share : aMoved ? 0 : 1;
        const fb = wall ? 0 : aMoved === bMoved ? 1 - share : bMoved ? 0 : 1;
        const shift = (k: number, factor: number) => {
          if (factor === 0) return;
          const dir = k === i ? -1 : 1;
          const at = restInTable(out[k], out[k].x + ux * gap * factor * dir, out[k].z + uz * gap * factor * dir);
          out[k] = { ...out[k], x: r3(at.x), z: r3(at.z) };
          if (!next.includes(out[k].id)) next.push(out[k].id);
        };
        shift(i, fa);
        shift(j, fb);
      }
    }
    frontier = next;
  }
  return out;
}

