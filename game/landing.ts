/**
 * 落点的唯一算法：格子吸附 → 按真实投影贴住围板 → 找支撑面（托不住就滑开）→ 挤开别人 → 带塌上层。
 * 拖动预览和松手提交都走这一份，归约里的 move 用的是同一套 restDrop/resolvePlacement，
 * 所以「看到的位置」就是「落下的位置」。rigid（搬棋盘、拖区域垫）只贴边，不吸附也不挤开。
 * 放在 game 层是因为它只吃状态、不碰渲染：规则校验能直接打它。
 */
import { COUNTER_SNAP_TOL, counterSpot, gridSpot, hostAt, nearestEdge, preyAt, restInTable, slotAt, slotNear, snap, snapTo } from "./catalog";
import { anchorOf, resolvePlacement, restDrop, type Anchor } from "./physics";
import type { GameObject, Move, TableState } from "./types";

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** 锁定的物件不参与结算：它钉在自己那一层，摆到哪停到哪。 */
export function resolveDrop(state: TableState, raw: { id: string; x: number; z: number }[], rigid = false): Move[] {
  const moves: Move[] = [];
  const anchors: Anchor[] = [];
  const carrying = new Set(raw.map((r) => r.id));
  const used = new Set<string>();
  // 每块锁定盘的占格情况一次算好反复用：一次搬几枚就从离手最近的那格往外排
  const taken = new Map<string, Set<number>>();
  // 这一拖要被踩掉的敌子：先当死人从场上撤下来，落点才不会被它挤开、也不会骑到它头上分层
  const eaten = new Set<string>();
  for (const r of raw) {
    const o = state.o.find((x) => x.id === r.id);
    if (!o) continue;
    const g = rigid ? { x: r.x, z: r.z, cell: null } : snap(state, r.x, r.z);
    const s = rigid || g.cell !== null || raw.length > 1 ? g : snapTo(state, o, g.x, g.z);
    anchors.push(anchorOf(o));
    // 棋盘自己的两档吸附盖过通用磁吸：锁定盘格心说了算、被占的格散到最近空位，只开吸附的盘吸到格心就停
    const onGrid = rigid ? null : gridSpot(state, o, s.x, s.z, carrying, taken, eaten);
    const landed = restInTable(o, onGrid?.x ?? s.x, onGrid?.z ?? s.z);
    const slot = slotFit(state, o, landed.x, landed.z, rigid, carrying, used);
    if (slot) used.add(slot.key);
    const stick = slot ? null : counterFit(state, o, landed.x, landed.z, rigid, carrying);
    const at = slot ? restInTable(o, slot.x, slot.z) : stick ? restInTable(o, stick.x, stick.z) : landed;
    const field = eaten.size ? state.o.filter((x) => !eaten.has(x.id)) : state.o;
    // 吸上牌边的计数器不再走物理下坠：一挤开就离开那条边了，吸附本身就是它的落点
    const drop = rigid || o.pin || stick ? { x: at.x, z: at.z, layer: o.layer } : restDrop(field, o, at.x, at.z, 0);
    moves.push({
      id: o.id,
      x: round3(drop.x),
      z: round3(drop.z),
      layer: drop.layer,
      rot: slot ? slot.rot : stick?.rot,
      host: stick ? stick.host : undefined,
      edge: stick?.edge,
    });
  }
  // 吸在卡牌边上的计数器：宿主这一拖也一起被带走，就按宿主的新位置重贴一次边。
  // 不补这一步，卡牌被格心或卡槽吸走之后，计数器就会留在半格之外。
  const landedById = new Map(moves.map((m) => [m.id, m]));
  for (const m of moves) {
    if (m.host !== undefined) continue;
    const o = state.o.find((x) => x.id === m.id);
    if (!o || o.kind !== "counter" || !o.counter?.host) continue;
    const hm = landedById.get(o.counter.host);
    const host = state.o.find((x) => x.id === o.counter!.host);
    if (!hm || !host || host.hand) continue;
    const at = counterSpot({ ...host, x: hm.x, z: hm.z, rot: hm.rot ?? host.rot }, o.counter.edge ?? 0);
    m.x = at.x;
    m.z = at.z;
    m.rot = at.rot;
    m.host = host.id;
    m.edge = o.counter.edge ?? 0;
  }
  const field = eaten.size ? state.o.filter((o) => !eaten.has(o.id)) : state.o;
  if (rigid) {
    // 刚性平移：不吸附、不重新找落点，但围观的物件照样得让路，只是组内彼此保持距离
    const shifted = field.map((o) => {
      const m = moves.find((x) => x.id === o.id);
      return m ? { ...o, x: m.x, z: m.z, rot: m.rot ?? o.rot, layer: m.layer ?? o.layer } : o;
    });
    return withBystanders(state, moves, resolvePlacement(shifted, moves.map((m) => m.id), anchors, true).o, carrying);
  }
  const shifted = field.map((o) => {
    const m = moves.find((x) => x.id === o.id);
    // 带上 rot 再去挤：牌还没转就按转了的宽度算，会跟邻格互相推歪
    return m ? { ...o, x: m.x, z: m.z, rot: m.rot ?? o.rot, layer: m.layer ?? o.layer } : o;
  });
  return withBystanders(state, moves, resolvePlacement(shifted, moves.map((m) => m.id), anchors).o, carrying);
}

/**
 * 这批落点会吃掉谁：预览画红圈、松手提交、归约删子都问这一份。
 * 传的是各自算好的落点坐标，所以三处对的是同一格、圈住的就是要没的。
 */
export function capturesOf(
  state: { o: GameObject[] },
  moves: { id: string; x: number; z: number }[],
): { by: string; prey: GameObject }[] {
  const carrying = new Set(moves.map((m) => m.id));
  const claimed = new Set<string>();
  const out: { by: string; prey: GameObject }[] = [];
  for (const m of moves) {
    const o = state.o.find((x) => x.id === m.id);
    if (!o) continue;
    const prey = preyAt(state, o, m.x, m.z, carrying, claimed);
    if (prey) out.push({ by: o.id, prey });
  }
  return out;
}

/** 落点解算的收口：先给搬的那几件，再补上被挤开／压实改动的旁人。 */
function withBystanders(state: TableState, moves: Move[], settled: GameObject[], carrying: Set<string>): Move[] {
  const byId = new Map(settled.map((o) => [o.id, o]));
  const out: Move[] = [];
  for (const m of moves) {
    const o = byId.get(m.id);
    if (o) out.push({ ...m, x: round3(o.x), z: round3(o.z), layer: o.layer });
  }
  // 旁人必须一起提交：只报搬的那件，归约就会在旧层序上重算，
  // 把刚压好的那一叠当成穿模，一巴掌把顶上的牌扇到半米外。
  for (const o of settled) {
    if (carrying.has(o.id)) continue;
    const was = state.o.find((x) => x.id === o.id);
    if (!was || (Math.abs(o.x - was.x) < 0.0005 && Math.abs(o.z - was.z) < 0.0005 && o.layer === was.layer && o.rot === was.rot)) continue;
    out.push({ id: o.id, x: round3(o.x), z: round3(o.z), layer: o.layer });
  }
  return out;
}

/**
 * 卡槽带的吸附：牌落在带子上就吸进最近的空槽，朝向跟着带子走。
 * 一次搬几张就占几格，从离手最近的那格往外排——拖一把乱牌过去就是「整理」。
 */
function slotFit(
  state: TableState,
  o: GameObject,
  x: number,
  z: number,
  rigid: boolean,
  carrying: Set<string>,
  used: Set<string>,
): { x: number; z: number; rot: number; key: string } | null {
  if (rigid || o.kind !== "card" || !o.card || o.pin) return null;
  const strip = slotAt(state, x, z, carrying);
  if (!strip) return null;
  const hit = slotNear(state, strip, x, z, carrying, used);
  return hit ? { x: hit.x, z: hit.z, rot: hit.rot, key: `${strip.id}:${hit.i}` } : null;
}

/**
 * 迷你计数器的吸附：落点靠近哪张牌的哪条边就吸上去，朝向跟着那条边躺。
 * **吸附即归属**：一旦吸上某张牌，这一片就只认那张牌——拖到别的牌上也贴回自己宿主最近的那条边，
 * 换主只能先按「脱附」。只有拖到空桌上才散下来（host: null），整片留在原地。
 * 宿主自己也被一起拖着走时不算换主，那一种由 resolveDrop 末尾的跟随重贴，
 * 免得牌一动计数器就掉在原地，或在中途被旁边那张牌抄走。
 */
function counterFit(
  state: TableState,
  o: GameObject,
  x: number,
  z: number,
  rigid: boolean,
  carrying: Set<string>,
): { x: number; z: number; rot?: number; host: string | null; edge?: 0 | 1 | 2 | 3 } | null {
  if (rigid || o.kind !== "counter" || o.pin) return null;
  const mine = o.counter?.host;
  if (mine) {
    // 宿主就在这一批里一起走：位置交给末尾的跟随重贴，这里换主就是被抢
    if (carrying.has(mine)) return null;
    const host = state.o.find((c) => c.id === mine);
    // 宿主进了手牌或已经不在这张桌上：归属失效，就地脱附
    if (!host || host.hand || host.kind !== "card") return { x, z, host: null };
    if (!hostAt(state, x, z, carrying)) return { x, z, host: null };
    const edge = nearestEdge(host, x, z);
    return { ...counterSpot(host, edge), host: mine, edge };
  }
  const host = hostAt(state, x, z, carrying);
  if (!host) return null;
  const edge = nearestEdge(host, x, z);
  const at = counterSpot(host, edge);
  if (Math.hypot(at.x - x, at.z - z) > COUNTER_SNAP_TOL) return null;
  return { ...at, host: host.id, edge };
}
