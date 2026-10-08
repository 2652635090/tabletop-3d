/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

/**
 * 行棋规矩：把「这枚子现在走得进哪几格」算成一份点位清单，供渲染层点亮、供 UI 轮换落子，
 * 并兼任裁判——送将、照面、长连这些走完就犯规的落点，从这里判出来，归约照着它退回原位。
 * 一律按格算账，坐的是哪一格由 catalog 的 seatOf 说一不二，所以点位和拖动吸附、踩子即吃同源：
 * 点亮的那一格踩过去，跟手拖过去落在同一处、吃的是同一枚。
 *
 * 点位清单是「合法走法」：先按步法铺出伪合法落点，再拿自家王试一遍，走完还在火力下的不点亮。
 * 所以被将军时点亮的那几处，正是解将的步。王没坐在格上（沙盒里删了、拖出去了）就无从试起，步法说了算。
 */
import type { BoardSpec, GameObject } from "./types";
import { boardRule, campSide, campsOf, cellFor, enemyOf, gridCell, RULE_CAMPS, RULE_CAMP_NAMES, rulesOn, seatOf, XIANGQI_GLYPHS } from "./catalog";

export interface MovePoint {
  cell: number;
  /** 格心的世界坐标：拿去喂 resolveDrop 就是一个落点 */
  x: number;
  z: number;
  /** 这一点上站着异色子：踩过去就是吃子，跟拖动时脚底下那圈红是同一件事 */
  take: boolean;
}

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG1 = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAG2 = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
/** 日字的八步，外加各自的蹩腿点：先横后竖还是先竖后横，堵的就是那一脚 */
const HORSE = [
  [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1],
  [2, 1, 1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [-2, -1, -1, 0],
];
/** 五子棋的「七连珠」：横竖斜任一方向连到这么多子就算长连禁手，六连照旧算好棋 */
export const GOMOKU_LONG = 7;
const RUNS = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** 角色按 XIANGQI_GLYPHS 的字序对位：元帥=0、仕士=1、相象=2、馬=3、俥車=4、炮砲=5、兵卒=6 */
const ROLES = { king: 0, advisor: 1, elephant: 2, horse: 3, chariot: 4, cannon: 5, pawn: 6 };

function roleId(o: GameObject): number {
  const label = o.label ?? "";
  for (const g of XIANGQI_GLYPHS) {
    const i = g.glyphs.indexOf(label);
    if (i >= 0) return i;
  }
  return -1;
}

/** 全盘占格表 + 这盘的两家涂色：往后试走只在这份表上抬子落子，不重复铺表 */
interface Ctx {
  b: GameObject;
  spec: BoardSpec;
  camps: [string, string] | null;
  seats: Map<number, GameObject[]>;
}

function ctxOf(state: { o: GameObject[] }, b: GameObject): Ctx | null {
  const spec = b.board;
  if (!spec || !rulesOn(b)) return null;
  const seats = new Map<number, GameObject[]>();
  for (const x of state.o) {
    const cell = seatOf(x, b, spec);
    if (cell === null) continue;
    const list = seats.get(cell);
    if (list) list.push(x);
    else seats.set(cell, [x]);
  }
  return { b, spec, camps: campsOf(b), seats };
}

/** 把子从格上抬起来 / 搁下去：试走只动这两下，比铺一张新表便宜得多 */
function lift(ctx: Ctx, o: GameObject, cell: number) {
  const list = ctx.seats.get(cell);
  if (!list) return;
  const i = list.findIndex((x) => x.id === o.id);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) ctx.seats.delete(cell);
}

function drop(ctx: Ctx, o: GameObject, cell: number) {
  const list = ctx.seats.get(cell);
  if (list) list.push(o);
  else ctx.seats.set(cell, [o]);
}

/** 这一格站着哪家的子（没有子回 -1，挤了几枚也照第一家算）：长连数子用 */
function campAt(ctx: Ctx, cell: number): number {
  const list = ctx.seats.get(cell);
  if (!list || !list.length) return -1;
  return campSide(list[0], ctx.camps);
}

/** 能当棋子行棋的：认得出角色、涂色归某一家、不是骰子 */
function movable(o: GameObject, camps: [string, string] | null, camp: number): boolean {
  return o.kind !== "die" && roleId(o) >= 0 && campSide(o, camps) === camp;
}

/** 这家的王坐哪一格：没坐上格就回 -1，裁判遇到缺王的乱局一律不设闸 */
function kingCell(ctx: Ctx, camp: number): number {
  for (const [cell, list] of ctx.seats) {
    for (const x of list) if (movable(x, ctx.camps, camp) && roleId(x) === ROLES.king) return cell;
  }
  return -1;
}

/** 两王同列、中间空着：白脸将。照面两家通吃，谁走出来的算谁犯规 */
function faceCol(ctx: Ctx): number {
  const a = kingCell(ctx, 0);
  const b = kingCell(ctx, 1);
  if (a < 0 || b < 0) return -1;
  const ca = cellFor(ctx.spec, a);
  const cb = cellFor(ctx.spec, b);
  if (!ca || !cb || ca.col !== cb.col) return -1;
  const lo = Math.min(ca.row, cb.row);
  const hi = Math.max(ca.row, cb.row);
  for (let row = lo + 1; row < hi; row++) {
    if ((ctx.seats.get(row * ctx.spec.cols + ca.col)?.length ?? 0) > 0) return -1;
  }
  return ca.col;
}

/** 这一格被 by 家的火力盖住了吗：把 by 家每枚子的伪合法走法摊开，看有没有一步正落在这格上 */
function hits(ctx: Ctx, by: number, cell: number): boolean {
  for (const [from, list] of ctx.seats) {
    for (const x of list) {
      if (!movable(x, ctx.camps, by)) continue;
      if (walk(ctx, x, roleId(x), by, from).some((p) => p.cell === cell)) return true;
    }
  }
  return false;
}

/** 走完这一步，camp 家还露不露：露了就给个说法，归约照着退回原位 */
function exposedBy(ctx: Ctx, camp: number): string | null {
  const mine = kingCell(ctx, camp);
  if (mine >= 0 && hits(ctx, camp === 0 ? 1 : 0, mine)) return "走完这一格自家王还在对方火力下";
  if (faceCol(ctx) >= 0) return "走完这一格将帅照了面";
  return null;
}

/** 这一步落下去连成几颗：黑棋长连禁手数的是这个，六颗封顶回 6 及以下 */
function longRun(ctx: Ctx, cell: number, camp: number): number {
  const at = cellFor(ctx.spec, cell);
  if (!at) return 1;
  let best = 1;
  for (const [dc, dr] of RUNS) {
    let n = 1;
    for (const step of [1, -1]) {
      for (let col = at.col + step * dc, row = at.row + step * dr; col >= 0 && row >= 0 && col < ctx.spec.cols && row < ctx.spec.rows; col += step * dc, row += step * dr) {
        if (campAt(ctx, row * ctx.spec.cols + col) !== camp) break;
        n++;
      }
    }
    if (n > best) best = n;
  }
  return best;
}

/**
 * 这枚子眼下走得进的格：不是子、没坐在锁定格心上、这盘没挂规矩、角色认不出，都是空清单。
 * 顺序按格号排好（从远排到近排），轮换点位时才不会跳来跳去。
 * 已经把自家王露在外面的落点会从清单里剔掉——点亮的一定走得合法。
 */
export function pointsOf(state: { o: GameObject[] }, o: GameObject): MovePoint[] {
  const seated = gridCell(state, o);
  if (!seated) return [];
  const ctx = ctxOf(state, seated.board);
  if (!ctx) return [];
  const role = roleId(o);
  const camp = campSide(o, ctx.camps);
  if (role < 0 || camp < 0 || o.kind === "die") return [];
  return legalPoints(ctx, o, seated.cell, camp).sort((x, y) => x.cell - y.cell);
}

/** 一枚子的合法落点：先按步法铺开，再逐格试一遍会不会露将。被将军时留下的正好是那些解将的步 */
function legalPoints(ctx: Ctx, o: GameObject, cell: number, camp: number): MovePoint[] {
  const pseudo = walk(ctx, o, roleId(o), camp, cell);
  // 自家王没坐在格上（沙盒里删了、拖出去了）：谈不上露不露，步法说了算
  if (kingCell(ctx, camp) < 0) return pseudo;
  lift(ctx, o, cell);
  const legal: MovePoint[] = [];
  for (const p of pseudo) {
    drop(ctx, o, p.cell);
    /** 吃子先当已经吃掉：被踩住的那枚还留在格上，挡王行的线就永远看不见，照面也就拦不住 */
    const victim = p.take ? foeAt(ctx, o, p.cell) : null;
    if (victim) lift(ctx, victim, p.cell);
    const bad = exposedBy(ctx, camp) !== null;
    if (victim) drop(ctx, victim, p.cell);
    lift(ctx, o, p.cell);
    if (!bad) legal.push(p);
  }
  drop(ctx, o, cell);
  return legal;
}

/**
 * 这一格上唯一的那枚异色子（按 id 排除行棋者自己）：挤了几枚说不清吃谁，跟压上去不吃同一口径。
 * 试走时行棋者已经搁在这格上，所以自己得先摘出去，才看得见被自己踩住的那枚猎物。
 */
function foeAt(ctx: Ctx, mover: GameObject, cell: number): GameObject | null {
  const hit = ctx.seats.get(cell);
  if (!hit) return null;
  const others = hit.filter((x) => x.id !== mover.id);
  return others.length === 1 && enemyOf(mover, others[0], ctx.camps) ? others[0] : null;
}

/** 步法本身：只管这枚子怎么走、路上挡不挡、踩得住谁，不看王。伪合法走法全从这里出 */
function walk(ctx: Ctx, o: GameObject, role: number, camp: number, from: number): MovePoint[] {
  const { b, spec, seats } = ctx;
  const here = cellFor(spec, from);
  if (!here) return [];
  const cellOf = (col: number, row: number) =>
    col < 0 || row < 0 || col >= spec.cols || row >= spec.rows ? -1 : row * spec.cols + col;
  /** 这一格站着谁能吃：口径见 foeAt */
  const prey = (cell: number) => foeAt(ctx, o, cell);
  const out: MovePoint[] = [];
  const seen = new Set<number>();
  /** 落这一格：空格记下并回 true（直线接着走）；吃掉的记下回 false；自家的、来路不通的回 false */
  const land = (col: number, row: number) => {
    const cell = cellOf(col, row);
    if (cell < 0 || seen.has(cell)) return false;
    const foe = prey(cell);
    if (!foe && seats.has(cell)) return false;
    const at = cellFor(spec, cell);
    if (!at) return false;
    seen.add(cell);
    out.push({ cell, x: b.x + at.x, z: b.z + at.z, take: !!foe });
    return !foe;
  };
  /** 直线推进：撞见第一枚子就停，撞见的是敌人顺手吃掉 */
  const roll = (dc: number, dr: number) => {
    for (let col = here.col + dc, row = here.row + dr; cellOf(col, row) >= 0; col += dc, row += dr) {
      if (!land(col, row)) break;
    }
  };
  /** 炮吃子要隔一道山：山前的空格照走，翻过山以后撞上的第一枚子才打得掉，隔几格都算 */
  const bomb = (dc: number, dr: number) => {
    let screen = false;
    for (let col = here.col + dc, row = here.row + dr; cellOf(col, row) >= 0; col += dc, row += dr) {
      const cell = cellOf(col, row);
      if (!screen) {
        if (seats.has(cell)) screen = true;
        else land(col, row);
        continue;
      }
      if (!seats.has(cell)) continue;
      if (prey(cell)) land(col, row);
      break;
    }
  };
  // 红黑各守半边：九宫在自己那侧的最后三排，相不能过河，兵过了河才许左右
  const palaceRows = camp === 0 ? [spec.rows - 3, spec.rows - 1] : [0, 2];
  const inPalace = (col: number, row: number) =>
    Math.abs(col - (spec.cols - 1) / 2) <= 1 && row >= palaceRows[0] && row <= palaceRows[1];
  // 河在正中间那一行与下一行之间（十行盘：第四与第五行之间），所以半边就是行号对 4.5 取整
  const inBank = (row: number) => (camp === 0 ? row >= (spec.rows - 1) / 2 : row <= (spec.rows - 1) / 2);
  const crossed = camp === 0 ? here.row < (spec.rows - 1) / 2 : here.row > (spec.rows - 1) / 2;
  const forward = camp === 0 ? -1 : 1;

  switch (role) {
    case ROLES.chariot:
      for (const [dc, dr] of ORTHO) roll(dc, dr);
      break;
    case ROLES.cannon:
      for (const [dc, dr] of ORTHO) bomb(dc, dr);
      break;
    case ROLES.horse:
      for (const [dc, dr, lc, lr] of HORSE) {
        const leg = cellOf(here.col + lc, here.row + lr);
        if (leg < 0 || seats.has(leg)) continue;
        land(here.col + dc, here.row + dr);
      }
      break;
    case ROLES.elephant:
      for (const [dc, dr] of DIAG2) {
        const eye = cellOf(here.col + dc / 2, here.row + dr / 2);
        if (eye < 0 || seats.has(eye)) continue;
        const row = here.row + dr;
        if (!inBank(row)) continue;
        land(here.col + dc, row);
      }
      break;
    case ROLES.king:
      for (const [dc, dr] of ORTHO) {
        if (inPalace(here.col + dc, here.row + dr)) land(here.col + dc, here.row + dr);
      }
      break;
    case ROLES.advisor:
      for (const [dc, dr] of DIAG1) {
        if (inPalace(here.col + dc, here.row + dr)) land(here.col + dc, here.row + dr);
      }
      break;
    default:
      land(here.col, here.row + forward);
      if (crossed) {
        land(here.col + 1, here.row);
        land(here.col - 1, here.row);
      }
      break;
  }
  return out.sort((x, y) => x.cell - y.cell);
}

/**
 * 归约的闸门：这一步落下去犯不犯规，犯规就退回原位，回的那句话直接进日志。
 * 盘子自己被人搬走、格子锁松开、骰子随手一掷都不管——那时候格心全变了，拦人纯属冤枉。
 * 摆得乱七八糟的局面照样走得脱：子离盘、王被删都判不着，直接删子也从来没人拦。
 */
export function bannedLanding(before: { o: GameObject[] }, after: { o: GameObject[] }, o: GameObject): string | null {
  const seated = gridCell(after, o);
  if (!seated) return null;
  const b = seated.board;
  const rule = boardRule(b);
  if (!rule) return null;
  const was = before.o.find((x) => x.id === b.id);
  if (!was || was.x !== b.x || was.z !== b.z || was.rot !== b.rot || was.grid !== b.grid) return null;
  const ctx = ctxOf(after, b);
  if (!ctx) return null;
  const camp = campSide(o, ctx.camps);
  if (camp < 0) return null;
  if (rule === "gomoku") {
    // 长连禁手只限黑棋：白棋连成一片照样算它赢，别替人家规矩
    if (camp !== 0) return null;
    const n = longRun(ctx, seated.cell, camp);
    return n >= GOMOKU_LONG ? `黑棋走成 ${n} 连，${GOMOKU_LONG} 连及以上是长连禁手` : null;
  }
  // 被踩住的那枚此刻还赖在表上：先抬掉再判，不然它替王挡了一道，照面就看不见了
  const victim = foeAt(ctx, o, seated.cell);
  if (victim) lift(ctx, victim, seated.cell);
  const why = exposedBy(ctx, camp);
  if (victim) drop(ctx, victim, seated.cell);
  return why;
}

/** 这一枚认得出角色吗（选中栏要说「这子不认得」还是「没子可走」）：刻字改过就是真认不出 */
export function roled(o: GameObject): boolean {
  return roleId(o) >= 0 && campSide(o, RULE_CAMPS.xiangqi ?? null) >= 0 && o.kind !== "die";
}

/**
 * 这枚子归不归眼前这套规矩管：坐得正、盘挂了规矩、角色认得出，三者齐了才算。
 * 归管却一个点位都没有，那是真走不动了，界面要说一声；不归管就一句都不提，别拿「走不动」去糊弄一张牌。
 */
export function governed(state: { o: GameObject[] }, o: GameObject): boolean {
  const seated = gridCell(state, o);
  if (!seated) return false;
  const spec = seated.board.board;
  return !!spec && rulesOn(seated.board) && roled(o);
}

/**
 * 试走会往占格表上删删加加，Map 的迭代顺序跟着变就没个尽头，所以先快照一份再挨个试：
 * 每枚子试完都照原样放回去，快照跟当下这张表说的是同一件事。
 */
function seatedList(ctx: Ctx): { cell: number; piece: GameObject }[] {
  const out: { cell: number; piece: GameObject }[] = [];
  for (const [cell, list] of ctx.seats) for (const x of [...list]) out.push({ cell, piece: x });
  return out;
}

/** 还有得走吗：找到第一枚能动子就收工，别把全盘试完 */
function hasMove(ctx: Ctx, camp: number): boolean {
  for (const s of seatedList(ctx)) {
    if (!movable(s.piece, ctx.camps, camp)) continue;
    if (legalPoints(ctx, s.piece, s.cell, camp).length > 0) return true;
  }
  return false;
}

/** 被将的一家还有哪些落点可走、分别是哪枚子走得到的：应将指引就报这两份 */
function escapes(ctx: Ctx, camp: number): { cells: number[]; savers: string[] } {
  const cells = new Set<number>();
  const savers: string[] = [];
  for (const s of seatedList(ctx)) {
    if (!movable(s.piece, ctx.camps, camp)) continue;
    const list = legalPoints(ctx, s.piece, s.cell, camp);
    if (!list.length) continue;
    savers.push(s.piece.id);
    for (const p of list) cells.add(p.cell);
  }
  return { cells: [...cells].sort((a, b) => a - b), savers };
}

export interface Judgement {
  /** 裁判的那块盘 */
  b: GameObject;
  /** 被将军的一家，没人被将是 -1 */
  camp: number;
  /** 被将的一家还有哪些落点可走（空集就是绝杀）；没人被将时是空表 */
  cells: number[];
  /** 走得到那些落点的子（哪些棋子能解将）；没人被将时是空表 */
  savers: string[];
  /** 分出胜负了：这一家输了，怎么输的 */
  over: { camp: number; how: "绝杀" | "逼和" } | null;
}

/**
 * 象棋裁判：没人被将就只查一家能不能困死（逼和），被将了就数它还有几步解将，一步没有就是绝杀。
 * 缺一家的王就不判——沙盒里把王删了、还在格外面坐着，都谈不上胜负。
 */
export function judge(state: { o: GameObject[] }): Judgement | null {
  for (const b of state.o) {
    if (b.kind !== "board" || boardRule(b) !== "xiangqi") continue;
    const ctx = ctxOf(state, b);
    if (!ctx || kingCell(ctx, 0) < 0 || kingCell(ctx, 1) < 0) continue;
    const checked = exposedBy(ctx, 0) !== null ? 0 : exposedBy(ctx, 1) !== null ? 1 : -1;
    if (checked < 0) {
      for (const camp of [0, 1]) {
        if (!hasMove(ctx, camp)) return { b, camp: -1, cells: [], savers: [], over: { camp, how: "逼和" } };
      }
      return { b, camp: -1, cells: [], savers: [], over: null };
    }
    const { cells, savers } = escapes(ctx, checked);
    return { b, camp: checked, cells, savers, over: cells.length ? null : { camp: checked, how: "绝杀" } };
  }
  return null;
}

/** 胜负播报：没人被将没分出胜负就回 null，归约照着往日志里塞一句系统话 */
export function verdict(state: { o: GameObject[] }): string | null {
  const over = judge(state)?.over;
  if (!over) return null;
  const names = RULE_CAMP_NAMES.xiangqi;
  const loser = names[over.camp];
  const winner = names[over.camp === 0 ? 1 : 0];
  return over.how === "绝杀" ? `${loser}已被将死，${winner}胜` : `${loser}无子可动（逼和），${winner}胜`;
}

/** 被将军的一家（没有回 -1）：横幅、脚底红环都问这个 */
export function checkedCamp(state: { o: GameObject[] }): number {
  const j = judge(state);
  if (!j || j.over) return -1;
  return j.camp;
}

/** 被将的王坐哪（连带那一枚本身）：给渲染层那圈红环用，坐标是世界坐标。外面已经判过就把结果递进来，别判第二遍 */
export function checkedKing(state: { o: GameObject[] }, judged: Judgement | null = judge(state)): { o: GameObject; x: number; z: number } | null {
  const j = judged;
  if (!j || j.camp < 0) return null;
  const ctx = ctxOf(state, j.b);
  if (!ctx) return null;
  const cell = kingCell(ctx, j.camp);
  if (cell < 0) return null;
  const o = (ctx.seats.get(cell) ?? []).find((x) => roleId(x) === ROLES.king && campSide(x, ctx.camps) === j.camp);
  const at = cellFor(ctx.spec, cell);
  return o && at ? { o, x: j.b.x + at.x, z: j.b.z + at.z } : null;
}
