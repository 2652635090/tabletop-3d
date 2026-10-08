import type { GameObject } from "./types";
import {
  G,
  LAYER_H,
  LAYER_MAX,
  anchoredIds,
  autoLayer,
  blocks,
  boxOf,
  clashes,
  clamp,
  floorY,
  footprintOf,
  hitBox,
  inFootprint,
  materialOf,
  movable,
  restInTable,
  separate,
  spanOf,
  surfaceY,
  tiltLift,
  tiltRise,
} from "./catalog";

/**
 * 桌面物理：把「落在哪一层」从一层层空试升级成有支撑、有质量、有惯性的解算。
 * 归约、拖动预览与松手滑行共用这一份，所以甩出去的轨迹就是它最终停下的地方。
 * 全程定步长、纯函数、坐标收三位小数，各端从同一个动作算出同一张桌子。
 */

/** 托得住多少投影才算站得住：低于三成就当它落不下去，会往悬空那侧滑 */
export const SUPPORT_MIN = 0.3;

/** 两个台面高这么多以内算同一个接触面：牌厚 2.4mm，所以这点差以内才谈得上「平铺在一起」 */
const CONTACT = 0.0012;

/** 滑行的定步长与时长上限：1.6 秒还停不住的东西不存在 */
const DT = 1 / 120;
const STEPS = 200;
/** 比这还慢就当停了（1.8 厘米/秒） */
const STOP_V = 0.018;
/** 一次甩动最多连带几个物件一起滑：连锁甩飞是看点，无底洞不是 */
const MAX_SLIDERS = 6;
/** 释放速度的下限：低于这个只是把手松开，不该有惯性 */
export const FLING_MIN_V = 0.22;
/** 上限：再快就不是甩牌，是砸桌 */
export const FLING_MAX_V = 3.4;

function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function normRot(deg: number): number {
  return Math.round(((deg % 360) + 360) % 360);
}

/** 顶面离桌多高：落点要找的就是这个面 */
function topOf(list: GameObject[], b: GameObject): number {
  return floorY({ o: list }, b) + tiltLift(b) + tiltRise(b);
}

/** 底面按 4×5 打格：够分辨「压住一角」和「稳稳压住」，一次落位也不用几十万次相交 */
const SAMPLES: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 5; j++) pts.push([(i + 0.5) / 4 - 0.5, (j + 0.5) / 5 - 0.5]);
  }
  return pts;
})();

/** 把格点转到桌面坐标：与 inRect 的旋转约定一致（局部点绕 rot 转正） */
function sampleAt(o: GameObject, x: number, z: number): { px: number; pz: number }[] {
  const b = boxOf(o);
  const rad = ((o.rot || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return SAMPLES.map(([u, v]) => {
    const lx = u * b.hx * 2;
    const lz = v * b.hz * 2;
    return { px: x + lx * c - lz * s, pz: z + lx * s + lz * c };
  });
}

/** 投影挨得上的物件：先按包围盒粗筛再进分离轴，远处的台面与这块地方无关 */
function candidates(list: GameObject[], o: GameObject, x: number, z: number): { b: GameObject; top: number }[] {
  const mine = spanOf(o);
  const out: { b: GameObject; top: number }[] = [];
  for (const b of list) {
    if (b.id === o.id || !blocks(b)) continue;
    const span = spanOf(b);
    if (Math.abs(b.x - x) > span.x + mine.x + 0.01) continue;
    if (Math.abs(b.z - z) > span.z + mine.z + 0.01) continue;
    if (!hitBox(o, x, z, b, b.x, b.z)) continue;
    out.push({ b, top: topOf(list, b) });
  }
  return out;
}

interface Rest {
  /** 找到了站得住的面 */
  valid: boolean;
  layer: number;
  /** 被托住的投影占比 */
  ratio: number;
  /** 支撑面的中心：托不住时就朝它的反方向滑 */
  cx: number;
  cz: number;
}

/** 台面高度换算层数：向上取整，宁可留一丝缝也不陷进别人身体里 */
function layerOf(plane: number, base: number): number {
  return clamp(Math.ceil((plane - base) / LAYER_H - 0.0005), 0, LAYER_MAX);
}

/**
 * 这个位置能被托住吗：候选台面从低往高排，取第一个「托得住三成以上投影、
 * 且没有更高的东西杵在自己投影里」的面。都站不住就把最接近的那个面和支撑中心报出来。
 */
function restOn(list: GameObject[], o: GameObject, x: number, z: number): Rest {
  const base = surfaceY({ o: list }, x, z);
  const near = candidates(list, o, x, z);
  const walls = near.filter((n) => n.top > base + CONTACT);
  const none: Rest = {
    valid: false,
    layer: 0,
    ratio: 0,
    // 谁挡路就往谁的反方向滑；什么都没挡，那本来就是贴桌的位置
    cx: walls.length ? walls.reduce((s, n) => s + n.b.x, 0) / walls.length : x,
    cz: walls.length ? walls.reduce((s, n) => s + n.b.z, 0) / walls.length : z,
  };
  if (!near.length) return { ...none, valid: true, ratio: 1 };
  if (!walls.length) return { ...none, valid: true, layer: 0, ratio: 1 };

  const planes = [...new Set(near.map((n) => Math.round(n.top * 1e5) / 1e5))].sort((a, b) => a - b);
  let best = none;
  for (const plane of planes) {
    if (plane <= base + CONTACT) continue;
    // 比这个面更高的东西杵在投影里，牌平着穿不过去，这个面直接作废
    if (near.some((n) => n.top > plane + CONTACT)) continue;
    const sup = near.filter((n) => Math.abs(n.top - plane) <= CONTACT);
    if (!sup.length) continue;
    const pts = sampleAt(o, x, z);
    let covered = 0;
    let cx = 0;
    let cz = 0;
    for (const p of pts) {
      const hits = sup.filter((n) => inFootprint(n.b, p.px, p.pz));
      if (!hits.length) continue;
      covered += 1;
      for (const n of hits) {
        cx += n.b.x / hits.length;
        cz += n.b.z / hits.length;
      }
    }
    const ratio = covered / pts.length;
    const rest: Rest = { valid: ratio >= SUPPORT_MIN, layer: layerOf(plane, base), ratio, cx: covered ? cx / covered : x, cz: covered ? cz / covered : z };
    if (rest.valid) return rest;
    if (rest.ratio > best.ratio) best = rest;
  }
  return best;
}

/** 托不住就往悬空那侧挪：支撑中心指向自己中心，正是重心偏出去的方向 */
function slideOff(o: GameObject, x: number, z: number, cx: number, cz: number): { x: number; z: number } {
  let dx = x - cx;
  let dz = z - cz;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    dx = 1;
    dz = 0;
  } else {
    dx /= len;
    dz /= len;
  }
  const reach = Math.max(0.014, footprintOf(o) * 0.7);
  return restInTable(o, x + dx * reach, z + dz * reach);
}

/**
 * 落点结算：找得到托得住的面就停下，托不住就往悬空那侧滑开重试。
 * 棋盘自己就是台面不参与；一路滑不出个面就交给 clearLayer 兜底，宁可叠高不许穿模。
 */
export function restDrop(list: GameObject[], o: GameObject, x: number, z: number, from = 0): { x: number; z: number; layer: number } {
  if (o.kind === "board") return { x: r3(x), z: r3(z), layer: clamp(o.layer, 0, LAYER_MAX) };
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 10; pass++) {
    const at = restInTable(o, px, pz);
    px = at.x;
    pz = at.z;
    const r = restOn(list, o, px, pz);
    if (r.valid) return { x: r3(px), z: r3(pz), layer: r.layer };
    const next = slideOff(o, px, pz, r.cx, r.cz);
    if (Math.abs(next.x - px) < 0.0005 && Math.abs(next.z - pz) < 0.0005) break;
    px = next.x;
    pz = next.z;
  }
  const at = restInTable(o, x, z);
  return { x: r3(at.x), z: r3(at.z), layer: clamp(autoLayer({ o: list }, o, at.x, at.z, from), 0, LAYER_MAX) };
}

/** 支撑面变过的地方：被挪走或被抽掉的物件在这里留下了坑 */
export interface Anchor {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

export function anchorOf(o: GameObject, x = o.x, z = o.z): Anchor {
  const span = spanOf(o);
  return { x, z, hx: span.x, hz: span.z };
}

/**
 * 塌落：抽掉垫板、挪走牌堆之后，原本坐在它上面的东西照着同一套落点算法重新落一遍。
 * 只往下不往上——邻居被拖到自己头顶是它自己的事，旁人绝不踩着它爬一层，
 * 否则两张叠在一起的牌每点一次就互相顶高一档，几下就飞起来了。
 * 只查锚点附近那些没锁高、又不贴桌的，两遍传不住就到此为止——手工钉过的高度是用户的决定。
 */
export function collapse(objects: GameObject[], anchors: Anchor[]): { o: GameObject[]; fell: string[] } {
  if (!anchors.length) return { o: objects, fell: [] };
  const out = objects.slice();
  const fell: string[] = [];
  for (let round = 0; round < 2; round++) {
    let changed = false;
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      if (!o.layer || !movable(o)) continue;
      const span = spanOf(o);
      if (!anchors.some((a) => Math.abs(a.x - o.x) <= a.hx + span.x && Math.abs(a.z - o.z) <= a.hz + span.z)) continue;
      const r = restDrop(out, o, o.x, o.z, 0);
      if (r.layer > o.layer) continue;
      if (r.layer === o.layer && Math.abs(r.x - o.x) < 0.0005 && Math.abs(r.z - o.z) < 0.0005) continue;
      out[i] = { ...o, x: r.x, z: r.z, layer: r.layer };
      if (!fell.includes(o.id)) fell.push(o.id);
      changed = true;
    }
    if (!changed) break;
  }
  return { o: out, fell };
}

/** 水平投影压在一起：同一叠的判定只看投影，谁高谁低由层数说 */
function stackedOn(a: GameObject, b: GameObject): boolean {
  return blocks(a) && blocks(b) && !!hitBox(a, a.x, a.z, b, b.x, b.z);
}

/**
 * 压实：一叠互相压住的物件得从脚下的台面连排到底，底下不许留空层。
 * 放上去的那张牌按「面高÷层高」向上取整，牌比层薄，整叠就会凭空悬起一档；
 * 下次重算再往上顶一档——两张牌反复选中就是沿着这条缝一路飞升。
 */
function compact(objects: GameObject[], ids: string[]): GameObject[] {
  const out = objects.slice();
  const packed = new Set<string>();
  for (const seed of ids) {
    if (packed.has(seed)) continue;
    const cluster: GameObject[] = [out.find((o) => o.id === seed)].filter(Boolean) as GameObject[];
    for (let pass = 0; pass < cluster.length && cluster.length <= 64; pass++) {
      for (const o of out) {
        if (o.id === cluster[pass].id || cluster.includes(o) || !stackedOn(cluster[pass], o)) continue;
        cluster.push(o);
      }
    }
    for (const o of cluster) packed.add(o.id);
    // 簇里有任何锁高的物件：那一叠的高度是用户手工定的，不压实
    if (cluster.length < 2 || cluster.some((o) => o.pin)) continue;
    const bottom = cluster.reduce((s, o) => (o.layer < s.layer ? o : s));
    // 把同伴全撤走，问它自己该坐在哪一层——差多少就是整叠悬空了多少
    const others = new Set(cluster.map((o) => o.id));
    const free = restDrop(out.filter((o) => !others.has(o.id)), bottom, bottom.x, bottom.z, 0);
    const shift = bottom.layer - free.layer;
    if (shift <= 0) continue;
    for (const o of cluster) {
      const i = out.findIndex((x) => x.id === o.id);
      out[i] = { ...o, layer: clamp(o.layer - shift, 0, LAYER_MAX) };
    }
  }
  return out;
}

/**
 * 落位解算：按质量挤开 → 失去支撑的塌下来 → 再挤一次收口 → 整叠压实不留悬空层。
 * 拖动预览与归约都走这里，所以「预览里看到别的东西被顶开」就是「提交后真的被顶开」。
 * keepShape 给刚性平移用：一整组一起挪的东西彼此不让路，只有旁观的物件让。
 * 坐在锁定棋盘格心里的子每轮重新认一遍：塌下来正好落回格上的，下一轮就谁也推不动它了。
 */
export function resolvePlacement(objects: GameObject[], moved: string[], anchors: Anchor[] = [], keepShape = false): { o: GameObject[]; fell: string[] } {
  const squeezed = separate(objects, moved, keepShape, anchoredIds(objects));
  const { o, fell } = collapse(squeezed, anchors);
  const settled = fell.length ? separate(o, [...new Set([...moved, ...fell])], keepShape, anchoredIds(o)) : o;
  return { o: compact(settled, [...new Set([...moved, ...fell])]), fell };
}

/** 滑行中的每一步位置：本端照着它回放，落点与提交结果分毫不差 */
export interface SlideStep {
  x: number;
  z: number;
  rot: number;
  t: number;
}

export interface FlingResult {
  /** 该提交进 move 动作的落点，含被撞开的那几件 */
  moves: { id: string; x: number; z: number; rot: number; layer: number }[];
  path: Map<string, SlideStep[]>;
}

interface Slider {
  o: GameObject;
  x: number;
  z: number;
  rot: number;
  layer: number;
  vx: number;
  vz: number;
  spin: number;
  path: SlideStep[];
}

/** 绒布上的库仑摩擦：减速度就是 μg，与快慢无关，所以甩得越远停得越远是平方关系 */
function decel(mu: number): number {
  return mu * G;
}

/** 这一帧场上都有谁：已经开滑的只用实时坐标那一份，免得同一张牌被算两次 */
function around(still: GameObject[], sliders: Slider[], self: Slider): GameObject[] {
  const out: GameObject[] = [];
  const live = new Set(sliders.map((s) => s.o.id));
  for (const o of still) {
    if (!live.has(o.id)) out.push(o);
  }
  for (const s of sliders) {
    if (s === self) continue;
    out.push({ ...s.o, x: s.x, z: s.z, rot: s.rot, layer: s.layer });
  }
  return out;
}

/**
 * 甩出去的一滑：定步长积分，摩擦减速、撞围板按恢复系数反弹、撞上别的东西按冲量传动量。
 * 被撞的那件只要能动就接手余速接着滑（最多带出 6 件），最后每件再各自找一次落点。
 */
export function fling(objects: GameObject[], id: string, v: { vx: number; vz: number }, start?: { x: number; z: number; layer: number }): FlingResult {
  const moves: FlingResult["moves"] = [];
  const path = new Map<string, SlideStep[]>();
  const root = objects.find((o) => o.id === id);
  if (!root || !movable(root)) return { moves, path };
  const speed = Math.hypot(v.vx, v.vz);
  if (!Number.isFinite(speed) || speed < FLING_MIN_V) return { moves, path };
  const cap = speed > FLING_MAX_V ? FLING_MAX_V / speed : 1;
  const sliders: Slider[] = [
    {
      o: root,
      x: start?.x ?? root.x,
      z: start?.z ?? root.z,
      rot: root.rot || 0,
      layer: start?.layer ?? root.layer,
      vx: v.vx * cap,
      vz: v.vz * cap,
      spin: 0,
      path: [],
    },
  ];
  const still = objects.filter((o) => o.id !== id);

  for (let step = 0; step < STEPS; step++) {
    const t = step * DT + DT;
    let moving = 0;
    for (const s of sliders) {
      if (Math.hypot(s.vx, s.vz) < STOP_V && Math.abs(s.spin) < 2) continue;
      moving += 1;
      const m = materialOf(s.o);
      const sp = Math.hypot(s.vx, s.vz);
      const drop = Math.min(sp, decel(m.mu) * DT);
      if (sp > 0) {
        const k = (sp - drop) / sp;
        s.vx *= k;
        s.vz *= k;
      }
      s.spin *= Math.exp(-DT * (3 + 9 * m.mu));
      s.x += s.vx * DT;
      s.z += s.vz * DT;
      s.rot += s.spin * DT;

      // 围板：按真实投影贴住内沿，反弹只带走恢复系数那份速度
      const edge = restInTable(s.o, s.x, s.z);
      if (edge.x !== s.x) {
        s.x = edge.x;
        s.vx = -s.vx * m.e;
        s.spin *= -0.5;
      }
      if (edge.z !== s.z) {
        s.z = edge.z;
        s.vz = -s.vz * m.e;
        s.spin *= -0.5;
      }

      for (const body of around(still, sliders, s)) {
        if (body.id === s.o.id || !blocks(body)) continue;
        const me: GameObject = { ...s.o, x: s.x, z: s.z, rot: s.rot, layer: s.layer };
        const hit = clashes(me, body);
        if (!hit) continue;
        const hard = !movable(body);
        const ma = m.mass;
        const mb = materialOf(body).mass;
        if (hard && mb <= 0) continue;
        const e = (m.e + materialOf(body).e) / 2;
        // 只有正对着撞上去才反弹：擦着滑过去的不该被弹飞
        const along = -(s.vx * hit.nx + s.vz * hit.nz);
        // 折合质量算冲量，撞钉住的物件相当于对面无穷重
        const mu = hard ? ma : (ma * mb) / (ma + mb);
        if (along > 0) {
          const j = mu * along * (1 + e);
          s.vx -= (j / ma) * hit.nx;
          s.vz -= (j / ma) * hit.nz;
          const tangent = (s.vx * -hit.nz + s.vz * hit.nx) * 26;
          if (!hard) {
            const other = sliders.find((x) => x !== s && x.o.id === body.id);
            if (other) {
              other.vx += (j / mb) * hit.nx;
              other.vz += (j / mb) * hit.nz;
              other.spin += tangent;
            } else if (sliders.length < MAX_SLIDERS + 1) {
              sliders.push({
                o: body,
                x: body.x,
                z: body.z,
                rot: body.rot || 0,
                layer: body.layer,
                vx: (j / mb) * hit.nx,
                vz: (j / mb) * hit.nz,
                spin: tangent,
                path: [{ x: r3(body.x), z: r3(body.z), rot: body.rot || 0, t }],
              });
            }
          }
        }
        // 位置上也立刻分开，否则下一帧还卡在对方身体里
        const back = hard ? hit.depth : hit.depth * (mb / (ma + mb));
        s.x -= hit.nx * back;
        s.z -= hit.nz * back;
        const wall = restInTable(s.o, s.x, s.z);
        s.x = wall.x;
        s.z = wall.z;
      }
      s.path.push({ x: r3(s.x), z: r3(s.z), rot: s.rot, t });
    }
    if (!moving) break;
  }

  const settled = objects.slice();
  for (const s of sliders) {
    const i = settled.findIndex((o) => o.id === s.o.id);
    if (i < 0) continue;
    const o = settled[i];
    const rot = normRot(s.rot);
    const rest = restDrop(settled, { ...o, rot }, s.x, s.z, 0);
    if (rest.x === o.x && rest.z === o.z && rest.layer === o.layer && rot === normRot(o.rot || 0)) continue;
    settled[i] = { ...o, x: rest.x, z: rest.z, layer: rest.layer, rot };
    moves.push({ id: o.id, x: rest.x, z: rest.z, rot, layer: rest.layer });
    if (s.path.length) path.set(o.id, s.path);
  }
  return { moves, path };
}
