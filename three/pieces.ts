import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOOK_SPREAD, COUNTER_BODY, GRAM_BODY, HOUR_H, HOUR_R, MP3_BODY, SHIELD_BAND, SPIN_R, TABLET_BODY, TABLET_SCREEN, TRACK_MARK_MAX, TRAY_H, TRAY_WALL, boardSize, boardThickness, bookSpread, fixBook, fixCounter, fixGram, fixHour, fixMp3, fixShield, fixSlot, fixSpinner, fixTablet, fixTrack, fixTray, hourLeft, hourRatio, mmss, piecePoints, pieceSize, remainingOf, shapeOf, slotSize, spinAngle, trackOffset, trackSize } from "@/game/catalog";
import type { Outline } from "@/game/catalog";
import { CALC_KEYS, calcResult, formatCalc } from "@/game/calc";
import { hasImage } from "@/game/images";
import { boardTexture, bookTexture, calcKeyAtlasTexture, calcKeyUvs, cardBackTexture, cardFaceTexture, chipEdgeTexture, countBadgeTexture, d4FaceTextures, dieFaceTextures, emptyPileTexture, feltTexture, gramPlateTexture, makePlate, mp3ScreenTexture, padTexture, paintCalc, paintCounter, paintTimer, recordTexture, shieldTexture, slotTexture, spinnerTexture, statTexture, tabletScreenTexture, tableFeltTexture, textPlateTexture, tokenTopTexture, trackTexture, unlockTexture, woodRoughness, woodTexture, xiangqiTopTexture, zoneTexture } from "./textures";

export const CARD = { w: 0.063, h: 0.0024, d: 0.09 };
/** 计时器外壳高度：盘面贴在顶面上 */
export const TIMER_H = 0.009;

const matCache = new Map<string, THREE.Material | THREE.Material[]>();
const geoCache = new Map<string, THREE.BufferGeometry>();

function plastic(color: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.3,
    metalness: 0.04,
    clearcoat: 0.6,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.05,
    ...extra,
  } as THREE.MeshPhysicalMaterialParameters);
}

function geo(key: string, make: () => THREE.BufferGeometry) {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = make();
  geoCache.set(key, g);
  return g;
}

function pawnGeometry(shape: string) {
  const key = `pawn:${shape}`;
  return geo(key, () => {
    const tall = shape === "tall";
    const h = tall ? 0.066 : 0.05;
    const base = tall ? 0.0125 : 0.018;
    const pts: THREE.Vector2[] = [];
    const profile: [number, number][] = tall
      ? [[0, 0], [base, 0], [base, 0.006], [base * 0.72, 0.011], [base * 0.5, h * 0.55], [base * 0.46, h * 0.78], [base * 0.9, h * 0.86], [base * 0.98, h * 0.94], [base * 0.62, h], [0, h]]
      : [[0, 0], [base, 0], [base, 0.005], [base * 0.86, 0.009], [base * 0.55, 0.016], [base * 0.38, 0.026], [base * 0.52, 0.033], [base * 0.86, 0.038], [base * 0.9, 0.043], [base * 0.66, h * 0.9], [base * 0.34, h], [0, h]];
    for (const [r, y] of profile) pts.push(new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(pts, 40);
  });
}

function discGeometry(shape: string) {
  const { r, h } = pieceSize(shape);
  const key = `disc:${shape}`;
  return geo(key, () => {
    // 围棋子是双面凸的透镜：压扁的球，边缘薄中间厚，捏起来才像那玩意儿
    if (shape === "stone") {
      const g = new THREE.SphereGeometry(r, 44, 20);
      g.scale(1, h / (2 * r), 1);
      g.translate(0, h / 2, 0);
      return g;
    }
    // 平凸的五子与带倒角的跳棋人：底面平贴在交叉点上，往上收出一道边
    if (shape === "puck") {
      const pts = [
        new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h * 0.6),
        new THREE.Vector2(r * 0.74, h * 0.9), new THREE.Vector2(r * 0.5, h), new THREE.Vector2(0, h),
      ];
      return new THREE.LatheGeometry(pts, 44);
    }
    if (shape === "man") {
      // 跳棋人是一圈凸缘围着中间的浅台：车出来就带那道槽，不用贴图假装
      const pts = [
        new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h * 0.5),
        new THREE.Vector2(r * 0.94, h * 0.62), new THREE.Vector2(r * 0.94, h * 0.88),
        new THREE.Vector2(r * 0.8, h * 0.96), new THREE.Vector2(r * 0.6, h * 0.86), new THREE.Vector2(0, h * 0.86),
      ];
      return new THREE.LatheGeometry(pts, 44);
    }
    const seg = shape === "piece" ? 56 : shape === "coin" ? 48 : 40;
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(0, h / 2, 0);
    return g;
  });
}

/** 国际象棋的车旋身段：六个角色共用一条轮廓，[半径倍数, 高度倍数]，乘 pieceSize 换成米制 */
const CHESS_BODY: [number, number][] = [
  [0, 0], [1, 0], [1, 0.08], [0.9, 0.14], [0.58, 0.22], [0.44, 0.34],
  [0.48, 0.48], [0.66, 0.58], [0.84, 0.64], [0.82, 0.7], [0.56, 0.74], [0.5, 0.78], [0, 0.78],
];

/** 颈往上那 0.22 个身位是角色的脸：兵顶一颗圆球，车顶四枚垛口，象是法冠，后是王冠，王扛十字 */
function chessHead(shape: string, r: number, h: number, mat: THREE.Material): THREE.Mesh[] {
  const y = 0.78 * h;
  const add = (g: THREE.BufferGeometry, x: number, my: number, z: number, rx?: [number, number, number]) => {
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, my, z);
    if (rx) m.rotation.set(rx[0], rx[1], rx[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  if (shape === "chess-rook") {
    const ring = geo(`ch:ring:${shape}`, () => new THREE.CylinderGeometry(r * 0.62, r * 0.5, 0.13 * h, 32));
    const teeth = geo(`ch:teeth:${shape}`, () => new THREE.BoxGeometry(r * 0.3, 0.11 * h, r * 0.42));
    return [
      add(ring, 0, y + 0.065 * h, 0),
      ...[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2;
        return add(teeth, Math.cos(a) * r * 0.44, y + 0.18 * h, Math.sin(a) * r * 0.44, [0, -a, 0]);
      }),
    ];
  }
  if (shape === "chess-bishop") {
    const mitre = geo(`ch:mitre`, () => new THREE.ConeGeometry(r * 0.5, 0.16 * h, 28));
    const knob = geo(`ch:knob`, () => new THREE.SphereGeometry(r * 0.16, 18, 12));
    return [add(mitre, 0, y + 0.08 * h, 0), add(knob, 0, y + 0.19 * h, 0)];
  }
  if (shape === "chess-queen") {
    const crown = geo(`ch:crown`, () => new THREE.CylinderGeometry(r * 0.66, r * 0.46, 0.1 * h, 32));
    const pearl = geo(`ch:pearl`, () => new THREE.SphereGeometry(r * 0.15, 18, 12));
    const out: THREE.Mesh[] = [add(crown, 0, y + 0.05 * h, 0), add(pearl, 0, y + 0.14 * h, 0)];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      out.push(add(pearl, Math.cos(a) * r * 0.56, y + 0.12 * h, Math.sin(a) * r * 0.56));
    }
    return out;
  }
  if (shape === "chess-king") {
    const crown = geo(`ch:crownq`, () => new THREE.CylinderGeometry(r * 0.6, r * 0.5, 0.06 * h, 32));
    const up = geo(`ch:cross-v`, () => new THREE.BoxGeometry(r * 0.18, 0.15 * h, r * 0.18));
    const arm = geo(`ch:cross-h`, () => new THREE.BoxGeometry(r * 0.44, 0.05 * h, r * 0.18));
    return [add(crown, 0, y + 0.03 * h, 0), add(up, 0, y + 0.13 * h, 0), add(arm, 0, y + 0.16 * h, 0)];
  }
  if (shape === "chess-knight") {
    // 马头只能斜着拉出来：一条侧影轮廓挤出 r·0.62 厚，横向永远不出半径
    const g = geo(`ch:knight:${h}`, () => {
      const s = new THREE.Shape();
      const px = (v: number) => v * r * 0.9;
      const py = (v: number) => y + v * 0.22 * h;
      s.moveTo(px(-0.55), py(0));
      s.lineTo(px(-0.46), py(0.3));
      s.lineTo(px(-0.6), py(0.58));
      s.lineTo(px(-0.34), py(0.82));
      s.lineTo(px(0.04), py(0.9));
      s.lineTo(px(0.42), py(1));
      s.lineTo(px(0.66), py(0.86));
      s.lineTo(px(0.4), py(0.66));
      s.lineTo(px(0.2), py(0.42));
      s.lineTo(px(0.24), py(0.12));
      s.lineTo(px(0.52), py(0));
      s.closePath();
      const e = new THREE.ExtrudeGeometry(s, { depth: r * 0.62, bevelEnabled: false, curveSegments: 8 });
      e.translate(0, 0, -r * 0.31);
      return e;
    });
    return [add(g, 0, 0, 0)];
  }
  const ball = geo(`ch:ball`, () => new THREE.SphereGeometry(r * 0.42, 26, 18));
  return [add(ball, 0, y + 0.1 * h, 0)];
}

/** 一整枚国际象棋子：车旋的身子 + 各角色自己的头。每块都标上物件号，拾取才点得中脑袋 */
function chessFigure(shape: string, mat: THREE.Material, id: string): THREE.Group {
  const { r, h } = pieceSize(shape);
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    geo(`ch:body:${shape}`, () => new THREE.LatheGeometry(CHESS_BODY.map(([rf, yf]) => new THREE.Vector2(rf * r, yf * h)), 44)),
    mat,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.id = id;
  g.add(body);
  for (const m of chessHead(shape, r, h, mat)) {
    m.userData.id = id;
    g.add(m);
  }
  return g;
}

export function isChessShape(shape?: string): boolean {
  return !!shape && shape.startsWith("chess-");
}

function cubeGeometry(shape: string) {
  const key = `cube:${shape}`;
  return geo(key, () => {
    if (shape === "bar") {
      const g = new RoundedBoxGeometry(0.055, 0.014, 0.028, 3, 0.0035);
      g.translate(0, 0.007, 0);
      return g;
    }
    // 三角片与五角星是平躺的薄片标记：在 XY 平面勾出轮廓、挤出厚度，再躺平贴桌
    if (shape === "tri" || shape === "star") {
      const { h: t } = pieceSize(shape);
      const outline = new THREE.Shape();
      // 顶点表与选中框同源（catalog 的 piecePoints），框才描得出尖角
      piecePoints(shape).forEach(([x, y], i) => (i === 0 ? outline.moveTo(x, y) : outline.lineTo(x, y)));
      outline.closePath();
      const g = new THREE.ExtrudeGeometry(outline, { depth: t, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      return g;
    }
    const g = new RoundedBoxGeometry(0.031, 0.031, 0.031, 3, 0.006);
    g.translate(0, 0.0155, 0);
    return g;
  });
}

/** 各面数骰子的外接球半径（米） */
const DIE_RADIUS: Record<number, number> = { 4: 0.024, 6: 0.027, 8: 0.0225, 10: 0.022, 12: 0.021, 20: 0.0215 };

const DIE_REST = new Map<number, number>();

/** 骰子静止时网格底面到物件原点的抬升量：直接量几何，写死的比例迟早会差几毫米 */
export function dieRestY(sides: number): number {
  const hit = DIE_REST.get(sides);
  if (hit !== undefined) return hit;
  const g = dieGeometry(sides);
  g.computeBoundingBox();
  const y = Math.max(0.001, -g.boundingBox!.min.y);
  DIE_REST.set(sides, y);
  return y;
}

/** Three 的多面体是“角朝下”生成的，得先翻成一面朝下才会平稳坐在桌面上 */
function faceDown(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  if (!pos || pos.count < 3) return geometry;
  const a = new THREE.Vector3().fromBufferAttribute(pos, 0);
  const b = new THREE.Vector3().fromBufferAttribute(pos, 1);
  const c = new THREE.Vector3().fromBufferAttribute(pos, 2);
  const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
  const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
  if (normal.dot(centroid) < 0) normal.negate();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, -1, 0)));
  return geometry;
}

function dieGeometry(sides: number) {
  const key = `die:${sides}`;
  return geo(key, () => {
    const r = DIE_RADIUS[sides] ?? DIE_RADIUS[6];
    if (sides === 6) return new RoundedBoxGeometry(r, r, r, 3, 0.005);
    if (sides === 8) return faceDown(new THREE.OctahedronGeometry(r));
    if (sides === 10) return faceDown(d10Geometry(r));
    if (sides === 12) return faceDown(new THREE.DodecahedronGeometry(r));
    if (sides === 20) return faceDown(new THREE.IcosahedronGeometry(r));
    return faceDown(d4Geometry(r));
  });
}

/** 五角双锥（真十面骰的形）：上下两锥共用一个正五棱环，共 10 个三角面。外法线由顶点绕序定：上锥 E_i→顶→E_{i+1}，下锥 E_{i+1}→底→E_i */
function d10Geometry(r: number): THREE.BufferGeometry {
  const v: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    v.push(Math.cos(a), 0, Math.sin(a));
  }
  v.push(0, 1.12, 0, 0, -1.12, 0);
  const idx: number[] = [];
  for (let i = 0; i < 5; i++) {
    const n = (i + 1) % 5;
    idx.push(i, 5, n);
    idx.push(n, 6, i);
  }
  const g = new THREE.PolyhedronGeometry(v, idx, r, 0);
  g.computeVertexNormals();
  return g;
}

/** 正四面体：重写 UV 并按面分组，四个面各贴一张 d4 数字图 */
function d4Geometry(r: number): THREE.BufferGeometry {
  const g = new THREE.TetrahedronGeometry(r);
  const uv = new Float32Array(12 * 2);
  const corners = [0.5, 0.9, 0.09, 0.11, 0.91, 0.11];
  for (let f = 0; f < 4; f++) {
    for (let i = 0; i < 3; i++) {
      uv[(f * 3 + i) * 2] = corners[i * 2];
      uv[(f * 3 + i) * 2 + 1] = corners[i * 2 + 1];
    }
    g.addGroup(f * 3, 3, f);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

function planeGeometry() {
  return geo("plane", () => new THREE.PlaneGeometry(1, 1));
}

function cardGeometry() {
  return geo("card", () => {
    const g = new RoundedBoxGeometry(CARD.w, CARD.h, CARD.d, 2, 0.0018);
    g.translate(0, CARD.h / 2, 0);
    // 让 +y 面使用 uv 顶面贴图：RoundedBoxGeometry 沿用 BoxGeometry uv 布局
    return g;
  });
}

/**
 * 带图的牌按图改形：网格仍是那张标准牌，靠 mesh 缩放成形，省掉一份按比例的几何缓存。
 * 标准比例时系数正好是 1，扑克/桌游那些既有牌一张也不受影响。
 */
function cardFit(o: import("@/game/types").GameObject): [number, number] {
  const s = shapeOf(o);
  return [s.w / CARD.w, s.d / CARD.d];
}

/** 卡牌盒：开口朝上的薄壳，由底板和四面墙拼成 */
const BOX = { w: 0.076, d: 0.098, h: 0.030, t: 0.004 };

function boxPartGeometry(part: "bottom" | "wallX" | "wallZ") {
  return geo(`boxShell:${part}`, () => (part === "bottom"
    ? new THREE.BoxGeometry(BOX.w, BOX.t, BOX.d)
    : part === "wallX"
      ? new THREE.BoxGeometry(BOX.t, BOX.h, BOX.d)
      : new THREE.BoxGeometry(BOX.w, BOX.h, BOX.t)));
}

/** 束口袋：车削出的布袋轮廓 + 收口绳 */
function bagGeometry() {
  return geo("bag", () => {
    const profile: [number, number][] = [
      [0, 0], [0.024, 0], [0.030, 0.007], [0.0315, 0.019], [0.028, 0.031],
      [0.0155, 0.041], [0.0095, 0.046], [0.0135, 0.0515], [0.0105, 0.0565], [0.004, 0.059], [0, 0.0598],
    ];
    return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  });
}

function bagTieGeometry() {
  return geo("bagTie", () => new THREE.TorusGeometry(0.0115, 0.0018, 8, 28));
}

function tokenGeometry() {
  return geo("token", () => {
    const g = new THREE.CylinderGeometry(0.0195, 0.0195, 0.0075, 36);
    g.translate(0, 0.00375, 0);
    return g;
  });
}

/** 计时器：矮圆柱外壳 + 顶面一块会重画的盘面 */
function timerShellGeometry() {
  return geo("timerShell", () => {
    const g = new THREE.CylinderGeometry(0.0265, 0.0305, TIMER_H, 32);
    g.translate(0, TIMER_H / 2, 0);
    return g;
  });
}

function timerFaceGeometry() {
  return geo("timerFace", () => new THREE.CircleGeometry(0.0252, 40));
}

/** 计算器机身：一块扁平塑料壳，顶面放屏幕和按键 */
function calcBodyGeometry() {
  return geo("calcBody", () => {
    const g = new RoundedBoxGeometry(0.082, 0.011, 0.115, 2, 0.0045);
    g.translate(0, 0.0055, 0);
    return g;
  });
}

/** 计算器屏幕面（贴顶面的矩形，用会重画的 plate 当贴图） */
function calcScreenGeometry() {
  return geo("calcScreen", () => new THREE.PlaneGeometry(0.068, 0.024));
}

/** 计算器按键帽 */
function calcKeyGeometry() {
  return geo("calcKey", () => {
    const g = new RoundedBoxGeometry(0.0155, 0.004, 0.014, 2, 0.002);
    g.translate(0, 0.002, 0);
    return g;
  });
}

/** 键帽顶上的字模面：每个键位一份几何（共用一张图集），所有计算器复用 */
function calcKeyFaceGeometry(index: number, total: number) {
  return geo(`calcFace:${index}:${total}`, () => {
    const p = new THREE.PlaneGeometry(0.0146, 0.013);
    (p.attributes.uv.array as Float32Array).set(calcKeyUvs(index, total));
    p.attributes.uv.needsUpdate = true;
    return p;
  });
}

const keyFaceMats = new Map<string, THREE.MeshBasicMaterial>();

function calcKeyFaceMaterial(keys: string[]) {
  const id = keys.join("");
  const hit = keyFaceMats.get(id);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ map: calcKeyAtlasTexture(keys), transparent: true, depthWrite: false });
  keyFaceMats.set(id, m);
  return m;
}

/** 迷你计数器的两颗键帽字模，减号在左 */
export const COUNTER_KEYS = ["−", "+"];
const COUNTER_SCREEN = { w: 0.022, h: 0.0072, z: -0.0032 };
const COUNTER_KEY = { w: 0.008, h: 0.0022, d: 0.0058, x: 0.0055, z: 0.0042 };

/** 迷你计数器：一片薄壳，顶面靠外一侧是读数屏，靠内一侧是两颗 ± 键 */
function counterBodyGeometry() {
  return geo("counterBody", () => {
    const g = new RoundedBoxGeometry(COUNTER_BODY.w, COUNTER_BODY.h, COUNTER_BODY.d, 2, 0.0012);
    g.translate(0, COUNTER_BODY.h / 2, 0);
    return g;
  });
}

function counterScreenGeometry() {
  return geo("counterScreen", () => new THREE.PlaneGeometry(COUNTER_SCREEN.w, COUNTER_SCREEN.h));
}

function counterKeyGeometry() {
  return geo("counterKey", () => {
    const g = new RoundedBoxGeometry(COUNTER_KEY.w, COUNTER_KEY.h, COUNTER_KEY.d, 2, 0.001);
    g.translate(0, COUNTER_KEY.h / 2, 0);
    return g;
  });
}

function counterKeyFaceGeometry(index: number) {
  return geo(`counterFace:${index}`, () => {
    const p = new THREE.PlaneGeometry(COUNTER_KEY.w * 0.9, COUNTER_KEY.d * 0.86);
    (p.attributes.uv.array as Float32Array).set(calcKeyUvs(index, COUNTER_KEYS.length));
    p.attributes.uv.needsUpdate = true;
    return p;
  });
}

/** 指针：底座 + 立杆 + 斜指向 +X 的箭头，地上再画一圈标出精确落点 */
function pointerBaseGeometry() {
  return geo("pointerBase", () => {
    const g = new THREE.CylinderGeometry(0.0125, 0.015, 0.004, 28);
    g.translate(0, 0.002, 0);
    return g;
  });
}

function pointerPostGeometry() {
  return geo("pointerPost", () => {
    const g = new THREE.CylinderGeometry(0.0022, 0.003, 0.048, 12);
    g.translate(0, 0.028, 0);
    return g;
  });
}

function pointerHeadGeometry() {
  return geo("pointerHead", () => {
    const g = new THREE.ConeGeometry(0.0105, 0.032, 18);
    g.rotateZ(-1.1);
    g.translate(0.017, 0.053, 0);
    return g;
  });
}

function pointerDotGeometry() {
  return geo("pointerDot", () => new THREE.RingGeometry(0.019, 0.0225, 32));
}

/** 路径箭头：单位长度箭身（沿 +X）+ 箭头，按 len 拉伸箭身 */
function arrowBodyGeometry() {
  return geo("arrowBody", () => new THREE.BoxGeometry(1, 0.005, 0.015));
}

function arrowHeadGeometry() {
  return geo("arrowHead", () => {
    const g = new THREE.ConeGeometry(0.021, 0.036, 3);
    g.rotateZ(-Math.PI / 2);
    g.translate(0.018, 0, 0);
    return g;
  });
}

function boardGeometry(spec: NonNullable<import("@/game/types").GameObject["board"]>) {
  const s = boardSize(spec);
  const thick = boardThickness(spec);
  const key = `board:${s.w}:${s.d}:${thick}`;
  return geo(key, () => new THREE.BoxGeometry(s.w, thick, s.d));
}

export function buildBoardMaterials(spec: NonNullable<import("@/game/types").GameObject["board"]>, texture: THREE.Texture): THREE.Material[] {
  const key = `boardMats:${spec.layout}:${spec.theme}:${spec.cols}:${spec.rows}`;
  const cached = matCache.get(key);
  if (cached) return cached as THREE.Material[];
  const edge = spec.layout === "mat"
    ? plastic("#1c1a19", { roughness: 0.85, clearcoat: 0.1 })
    : plastic("#7a5334", { roughness: 0.42, clearcoat: 0.4 });
  const top = new THREE.MeshPhysicalMaterial({
    map: texture,
    roughness: spec.layout === "mat" ? 0.78 : 0.62,
    metalness: 0,
    clearcoat: spec.layout === "mat" ? 0.1 : 0.22,
    clearcoatRoughness: 0.5,
  });
  const bottom = plastic("#241a12", { roughness: 0.8, clearcoat: 0 });
  const arr = [edge, edge, top, bottom, edge, edge];
  matCache.set(key, arr);
  return arr;
}

/** 印刷面不吃高光：clearcoat 会把顶灯拉成一片反光，卡面小字就糊了 */
function printMaterial(map: THREE.Texture, roughness: number, envMapIntensity = 0.3): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ map, roughness, metalness: 0, clearcoat: 0, envMapIntensity });
}

export function cardMaterials(card: import("@/game/types").CardSpec | undefined, color: string, faceUp: boolean, backImg?: string, ratio?: number, backName?: string): THREE.Material[] {
  const img = card?.img && hasImage(card.img) ? card.img : "";
  const back = backImg && hasImage(backImg) ? backImg : "";
  const r = ratio ?? card?.ratio;
  const key = `cardMats:${backName ?? card?.back}:${card?.rank}:${card?.suit}:${card?.label}:${color}:${faceUp}:${img}:${back}${card?.borderless ? "|B" : ""}${r ? `|${r}` : ""}`;
  const cached = matCache.get(key);
  if (cached) return cached as THREE.Material[];
  const face = printMaterial(cardFaceTexture(card, color), 0.74);
  const backMat = printMaterial(cardBackTexture(backName ?? card?.back ?? "classic", color, backImg, r), 0.78);
  const side = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.85 });
  const arr = [side, side, faceUp ? face : backMat, faceUp ? backMat : face, side, side];
  matCache.set(key, arr);
  return arr;
}

/**
 * 空牌堆的托盘：一块比牌略大的哑光底，面上虚线框出一张牌摊平的位置。
 * 一整块不透明的底，不搞半透明——透明的东西在牌堆中间排序会翻脸。
 */
function trayMaterials(color: string, aspect: number): THREE.Material[] {
  const key = `trayMats:${color}:${Math.round(aspect * 1000) / 1000}`;
  const cached = matCache.get(key);
  if (cached) return cached as THREE.Material[];
  const top = new THREE.MeshPhysicalMaterial({ map: emptyPileTexture(color, aspect), roughness: 0.86, metalness: 0.02, clearcoat: 0.08, envMapIntensity: 0.16 });
  const side = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.8 });
  const arr = [side, side, top, side, side, side];
  matCache.set(key, arr);
  return arr;
}

/** 换画质档时印刷纹理整批重建，材质缓存必须跟着清空，否则会继续用着已释放的旧纹理 */
export function dropPrintMaterials(): void {
  for (const m of matCache.values()) {
    for (const one of Array.isArray(m) ? m : [m]) one.dispose();
  }
  matCache.clear();
}

function dieMaterials(color: string): THREE.Material[] {
  const key = `dieMats:${color}`;
  const cached = matCache.get(key);
  if (cached) return cached as THREE.Material[];
  const maps = dieFaceTextures(color);
  const arr = maps.map((map) => new THREE.MeshPhysicalMaterial({
    map, color: 0xffffff, roughness: 0.3, metalness: 0.02, clearcoat: 0.5, clearcoatRoughness: 0.32, envMapIntensity: 0.7,
  }));
  matCache.set(key, arr);
  return arr;
}

/** d4 四个面各一张数字图，配合 d4Geometry 的面分组 */
function d4Materials(color: string): THREE.Material[] {
  const key = `d4Mats:${color}`;
  const cached = matCache.get(key);
  if (cached) return cached as THREE.Material[];
  const arr = d4FaceTextures(color).map((map) => new THREE.MeshPhysicalMaterial({
    map, color: 0xffffff, roughness: 0.3, metalness: 0.02, clearcoat: 0.5, clearcoatRoughness: 0.32, envMapIntensity: 0.7, flatShading: true,
  }));
  matCache.set(key, arr);
  return arr;
}

function tokenMaterials(label: string, color: string, count?: number): THREE.Material[] {
  const key = `tokMats:${label}:${color}:${count ?? ""}`;
  const cached = matCache.get(key);
  if (cached) return cached as THREE.Material[];
  const top = printMaterial(tokenTopTexture(label, color, count), 0.58);
  const side = plastic(color, { roughness: 0.5 });
  // CylinderGeometry 材质顺序：[侧面, 顶面, 底面]
  const arr = [side, top, plastic(color, { roughness: 0.75, clearcoat: 0.1 })];
  matCache.set(key, arr);
  return arr;
}

/** 自发光材质：路径箭头和指针落点要在暗桌布上一眼看见 */
function glowMaterial(color: string): THREE.Material {
  const key = `glow:${color}`;
  const hit = matCache.get(key);
  if (hit) return hit as THREE.Material;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.55,
    roughness: 0.45,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  matCache.set(key, m);
  return m;
}

export interface PieceContext {
  scene: THREE.Scene;
}

/**
 * 容器角标：贴在容器右上角的一张小数字牌，写明里面到底有几张。
 * 盒子和袋子里只画得出十几张牌，光看模型数不出来；牌堆摞高了同样数不清。
 * 刻意做得比物件本体小一圈，摆在那里只是给个数，不挡操作。
 */
/**
 * 转盘与计分轨的几何件。
 * 底盘、盘身、指针分开：指针和底盘是一体的，只有盘身会转，所以它是 group.userData.dial 那个子组。
 */
function spinBaseGeometry() {
  return geo("spinBase", () => {
    const g = new THREE.CylinderGeometry(SPIN_R * 1.03, SPIN_R * 1.09, 0.005, 48);
    g.translate(0, 0.0025, 0);
    return g;
  });
}

function spinDialGeometry() {
  return geo("spinDial", () => {
    const g = new THREE.CylinderGeometry(SPIN_R, SPIN_R, 0.0055, 48);
    g.translate(0, 0.00275, 0);
    return g;
  });
}

function spinFaceGeometry() {
  return geo("spinFace", () => new THREE.CircleGeometry(SPIN_R * 0.995, 64));
}

function spinHubGeometry() {
  return geo("spinHub", () => {
    const g = new THREE.CylinderGeometry(0.0088, 0.0104, 0.007, 24);
    g.translate(0, 0.0035, 0);
    return g;
  });
}

/** 指针：底座在原点、尖端朝 -Z（盘面正上方那一格）的扁四棱锥 */
function spinNeedleGeometry() {
  return geo("spinNeedle", () => {
    const g = new THREE.ConeGeometry(0.0062, 0.034, 4);
    g.translate(0, 0.017, 0);
    g.rotateX(-Math.PI / 2);
    g.scale(1, 0.42, 1);
    return g;
  });
}

/** 计分轨上的一枚棋子：矮圆台，顶上按玩家色，压得住刻度也点得中 */
function markGeometry() {
  return geo("trackMark", () => {
    const g = new THREE.CylinderGeometry(0.0105, 0.0125, 0.0085, 24);
    g.translate(0, 0.00425, 0);
    return g;
  });
}

/**
 * 唱片机一套尺寸：机身一格，盘偏心靠左，右后角立柱上挂唱臂，右前两颗钮管音量与起停。
 * 盘面偏心是给唱臂腾地方——盘真摆正了，臂就得架到唱片当中去。
 */
const GRAM = {
  caseH: 0.05,
  platterH: 0.006,
  r: 0.132,
  cx: -0.032,
  cz: 0.002,
  px: 0.142,
  pz: -0.116,
  armY: 0.075,
  park: 0.2,
};
/** 唱针落在唱片外圈那一点、相对枢轴的偏移 */
const GRAM_NEEDLE = (() => {
  const dx = GRAM.px - GRAM.cx;
  const dz = GRAM.pz - GRAM.cz;
  const k = (GRAM.r * 0.88) / Math.hypot(dx, dz);
  return [GRAM.cx + dx * k - GRAM.px, GRAM.cz + dz * k - GRAM.pz] as const;
})();
/** 唱臂落到唱片上的水平角与臂长：都由上面那点算出来，不是随手挑的数 */
const GRAM_CUE = Math.atan2(GRAM_NEEDLE[0], GRAM_NEEDLE[1]);
const GRAM_ARM = Math.hypot(GRAM_NEEDLE[0], GRAM_NEEDLE[1]);
/** 臂尾翘在枢轴之上、针头沉到唱片面上那点俯角 */
const GRAM_TILT = Math.asin(Math.min(0.4, (GRAM.armY - (GRAM.caseH + GRAM.platterH + 0.0024)) / GRAM_ARM));
/** 唱臂与转盘每帧要照着的三个数：33⅓ 转的角速度、落唱片的臂角、停着的臂角 */
export const GRAM_MOTION = { spin: ((33 + 1 / 3) * 2 * Math.PI) / 60, cue: GRAM_CUE, park: GRAM.park, tilt: GRAM_TILT };

/**
 * 随身听一套尺寸：扁壳躺在桌上，顶面中央开一块磁带舱（两卷带并排露在里头），
 * 舱前面一条窄屏写曲名和「本机/全桌」，右端一道线控滚轮。
 * 两卷是按走带转的，跟唱片机那个整盘转的转盘不是一回事。
 */
const MP3 = {
  w: MP3_BODY.w,
  d: MP3_BODY.d,
  h: MP3_BODY.h,
  bayW: 0.08,
  bayD: 0.034,
  bayH: 0.0036,
  bayX: -0.006,
  bayZ: -0.008,
  reelR: 0.0105,
  reelX: 0.0215,
  screenW: 0.064,
  screenH: 0.0105,
};
/** 卷带一圈的秒数：只求看得出带在走，不较真一盒带转几圈 */
export const MP3_MOTION = { spin: (2 * Math.PI) / 2.6 };

function mp3ShellGeometry() {
  return geo("mp3Shell", () => {
    const g = new RoundedBoxGeometry(MP3.w, MP3.h, MP3.d, 3, 0.005);
    g.translate(0, MP3.h / 2, 0);
    return g;
  });
}

function mp3BayGeometry() {
  return geo("mp3Bay", () => new THREE.BoxGeometry(MP3.bayW, MP3.bayH, MP3.bayD));
}

function mp3ReelGeometry() {
  return geo("mp3Reel", () => new THREE.CylinderGeometry(MP3.reelR, MP3.reelR, 0.0032, 20));
}

function mp3SpokeGeometry() {
  return geo("mp3Spoke", () => new THREE.BoxGeometry(MP3.reelR * 1.74, 0.0034, 0.0022));
}

function mp3TapeGeometry() {
  return geo("mp3Tape", () => new THREE.TorusGeometry(MP3.reelR * 1.5, 0.0028, 8, 26));
}

function mp3WheelGeometry() {
  return geo("mp3Wheel", () => new THREE.CylinderGeometry(0.0062, 0.0062, 0.011, 18));
}

function mp3JackGeometry() {
  return geo("mp3Jack", () => new THREE.CylinderGeometry(0.0026, 0.0026, 0.005, 12));
}

function mp3LedGeometry() {
  return geo("mp3Led", () => new THREE.CylinderGeometry(0.0024, 0.0024, 0.0024, 10));
}

function gramCaseGeometry() {
  return geo("gramCase", () => {
    const g = new RoundedBoxGeometry(GRAM_BODY.w, GRAM.caseH, GRAM_BODY.d, 3, 0.005);
    g.translate(0, GRAM.caseH / 2, 0);
    return g;
  });
}

function gramPlatterGeometry() {
  return geo("gramPlatter", () => {
    const g = new THREE.CylinderGeometry(GRAM.r + 0.009, GRAM.r + 0.009, GRAM.platterH, 56);
    g.translate(0, GRAM.platterH / 2, 0);
    return g;
  });
}

function gramVinylGeometry() {
  return geo("gramVinyl", () => {
    const g = new THREE.CylinderGeometry(GRAM.r, GRAM.r, 0.0024, 56);
    g.translate(0, 0.0012, 0);
    return g;
  });
}

function gramFaceGeometry() {
  return geo("gramFace", () => new THREE.CircleGeometry(GRAM.r, 56));
}

function gramSpindleGeometry() {
  return geo("gramSpindle", () => {
    const g = new THREE.CylinderGeometry(0.0026, 0.0034, 0.017, 16);
    g.translate(0, 0.0085, 0);
    return g;
  });
}

function gramPillarGeometry() {
  return geo("gramPillar", () => {
    const g = new THREE.CylinderGeometry(0.009, 0.0115, GRAM.armY - GRAM.caseH, 24);
    g.translate(0, (GRAM.armY - GRAM.caseH) / 2, 0);
    return g;
  });
}

/** 唱臂管：沿 +Z 躺着的细杆，原点在枢轴，尾上带配重 */
function gramTubeGeometry() {
  return geo("gramTube", () => {
    const g = new THREE.CylinderGeometry(0.0025, 0.0025, GRAM_ARM * 1.28, 12);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

function gramHeadGeometry() {
  return geo("gramHead", () => {
    const g = new THREE.BoxGeometry(0.013, 0.011, 0.021);
    g.translate(0, -0.0035, 0);
    return g;
  });
}

/** 唱针：一小段朝下的锥尖，看着像是真压在纹槽上 */
function gramStylusGeometry() {
  return geo("gramStylus", () => {
    const g = new THREE.ConeGeometry(0.0022, 0.0075, 10);
    g.rotateX(Math.PI);
    return g;
  });
}

function gramWeightGeometry() {
  return geo("gramWeight", () => {
    const g = new THREE.CylinderGeometry(0.0088, 0.0088, 0.017, 20);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

function gramKnobGeometry() {
  return geo("gramKnob", () => {
    const g = new THREE.CylinderGeometry(0.0115, 0.0128, 0.011, 28);
    g.translate(0, 0.0055, 0);
    return g;
  });
}

function gramLampGeometry() {
  return geo("gramLamp", () => {
    const g = new THREE.CylinderGeometry(0.0048, 0.0056, 0.006, 18);
    g.translate(0, 0.003, 0);
    return g;
  });
}

/** 底面落在 y=0 的单位立方体：牌屏、书面这类「按尺寸缩放成形」的块都用它，不必每种尺寸存一份几何 */
function unitBoxGeometry() {
  return geo("unitBox", () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    return g;
  });
}

/**
 * 米宝：Carcassonne 那个工人剪影，靠轮廓挤出厚度。
 * 归一化坐标里 x 取 ±1（胳膊最宽处）、y 取 0~1（总高），脑袋另按正圆算，免得被纵向拉长成橄榄。
 */
function meepleGeometry() {
  const { r, h } = pieceSize("meeple");
  return geo(`meeple:${r}x${h}`, () => {
    const hr = r * 0.42;
    const hy = h - hr;
    const pts: THREE.Vector2[] = [];
    const push = (x: number, y: number) => pts.push(new THREE.Vector2(x, y));
    push(0, h * 0.3);
    // 左半边：胯下那道 V、脚、小腿、胯、胳膊尖，一路往上到肩
    push(-r * 0.26, 0);
    push(-r * 0.52, 0);
    push(-r * 0.46, h * 0.16);
    push(-r * 0.58, h * 0.34);
    push(-r * 0.95, h * 0.52);
    push(-r, h * 0.6);
    push(-r * 0.9, h * 0.665);
    push(-r * 0.62, h * 0.68);
    // 脑袋从左上绕过正顶再到右上：整圈留 220°，底下那 140° 让给肩膀
    for (let i = 0; i <= 16; i++) {
      const a = THREE.MathUtils.degToRad(200 - (i * 220) / 16);
      push(Math.cos(a) * hr, hy + Math.sin(a) * hr);
    }
    // 右半边照左边翻回来
    push(r * 0.62, h * 0.68);
    push(r * 0.9, h * 0.665);
    push(r, h * 0.6);
    push(r * 0.95, h * 0.52);
    push(r * 0.58, h * 0.34);
    push(r * 0.46, h * 0.16);
    push(r * 0.52, 0);
    push(r * 0.26, 0);
    const shape = new THREE.Shape(pts);
    const depth = r * 0.6;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.0011,
      bevelSize: 0.0014,
      bevelSegments: 2,
      curveSegments: 8,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  });
}

/** 王冠旗：底盘 + 细杆 + 一面玩家色的小旗 + 杆顶一顶王冠，起始玩家标记 */
function flagFigure(color: string, id: string): THREE.Group {
  const { r, h } = pieceSize("flag");
  const g = new THREE.Group();
  const brass = plastic("#c9a24a", { roughness: 0.34, metalness: 0.62, clearcoat: 0.4 });
  const cloth = plastic(color, { roughness: 0.62, clearcoat: 0.2 });
  const add = (key: string, make: () => THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo(key, make), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.id = id;
    g.add(m);
    return m;
  };
  add(`flag:base:${r}`, () => new THREE.CylinderGeometry(r * 0.92, r * 1.05, h * 0.06, 32), brass, 0, h * 0.03, 0);
  add(`flag:pole:${r}x${h}`, () => new THREE.CylinderGeometry(r * 0.12, r * 0.13, h * 0.845, 14), brass, 0, h * 0.06 + h * 0.4225, 0);
  add(`flag:banner:${r}x${h}`, () => new THREE.BoxGeometry(r * 1.0, h * 0.2, 0.0022), cloth, r * 0.63, h * 0.76, 0);
  add(`flag:crown:${r}x${h}`, () => new THREE.CylinderGeometry(r * 0.34, r * 0.2, h * 0.075, 20), brass, 0, h * 0.905 + h * 0.0375, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    add(`flag:pearl:${r}`, () => new THREE.SphereGeometry(r * 0.1, 14, 10), brass, Math.cos(a) * r * 0.3, h * 0.98, Math.sin(a) * r * 0.3);
  }
  return g;
}

/** 沙漏外壳：上下两片木托加三根立柱，玻璃罩按 HOUR_R/HOUR_H 车出来 */
function hourCapGeometry() {
  return geo("hourCap", () => {
    const g = new THREE.CylinderGeometry(HOUR_R * 1.08, HOUR_R * 1.16, 0.005, 36);
    g.translate(0, 0.0025, 0);
    return g;
  });
}

function hourPostGeometry() {
  return geo("hourPost", () => {
    const g = new THREE.CylinderGeometry(0.0021, 0.0024, HOUR_H - 0.009, 8);
    g.translate(0, (HOUR_H - 0.009) / 2, 0);
    return g;
  });
}

/** 玻璃罩内壁轮廓（米）：从底心一路鼓到最宽、收进细颈、再对称地鼓上去到顶心 */
function hourGlassGeometry() {
  return geo("hourGlass", () => {
    const R = HOUR_R * 0.92;
    const neck = HOUR_H / 2;
    const pts = [
      [0, 0.005], [R * 0.6, 0.0062], [R * 0.88, 0.013], [R, 0.026],
      [R * 0.42, 0.034], [0.0034, neck], [R * 0.42, 0.044], [R, 0.052],
      [R * 0.88, 0.065], [R * 0.6, 0.0718], [0, 0.073],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 40);
  });
}

/** 上瓶的沙：一只尖朝下顶在细颈上的相似锥，整只按比例缩小，所以永远缩在玻璃里 */
function hourSandTopGeometry() {
  const R = HOUR_R * 0.92;
  return geo("hourSandTop", () => {
    // 局部 y=0 就是细颈，沙体往下长；scene 每帧按剩下的比例整体缩放它
    const pts = [new THREE.Vector2(0.0034, 0), new THREE.Vector2(R * 0.58, -0.009), new THREE.Vector2(R, -0.013)];
    return new THREE.LatheGeometry(pts, 36);
  });
}

/** 下瓶的沙：落在瓶底的一座锥形沙堆 */
function hourSandBottomGeometry() {
  const R = HOUR_R * 0.92;
  return geo("hourSandBottom", () => {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(R * 0.92, 0), new THREE.Vector2(R * 0.5, 0.009), new THREE.Vector2(0.002, 0.019)];
    return new THREE.LatheGeometry(pts, 36);
  });
}

function hourFaceGeometry() {
  return geo("hourFace", () => new THREE.CircleGeometry(HOUR_R * 0.82, 32));
}

/** 漏下去的那一线沙：顶在细颈上往下垂，整条由 scene 决定露不露 */
function hourStreamGeometry() {
  return geo("hourStream", () => {
    const h = HOUR_H / 2 - 0.006;
    const g = new THREE.CylinderGeometry(0.0014, 0.001, h, 6);
    g.translate(0, -h / 2, 0);
    return g;
  });
}

/** 一叠牌每张垫高多少：比纸厚略紧，看着才是一叠而不是一摞 */
const PILE_STEP = CARD.h * 0.92;
/** 空牌堆的托盘比牌宽出这一圈，中间那张虚线框正好是一张贴平的牌 */
export const PILE_TRAY = 1.16;

/** 一叠牌摊平时第 i 张的样子：位置与那点歪角。建网格与洗牌动画都照这一条算，中途重建也不会错位 */
export function pileRestPose(i: number): { y: number; rotY: number } {
  return { y: i * PILE_STEP, rotY: (i % 5) * 0.004 - 0.008 };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

/**
 * 洗牌动画摆一帧：两半斜着掰开、错着咬合、最后墩齐。
 * k 从 0 走到 1，走到 1 时每张都正好落回 pileRestPose，所以动画收尾不必再补一笔。
 * 只改 group 里每张牌的局部变换，group 本身交给状态补间，两件事不打架。
 */
export function rifflePile(group: THREE.Group, k: number): void {
  const cards = group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true);
  const n = cards.length;
  if (!n) return;
  const t = clamp01(k);
  const open = smooth(clamp01(t / 0.34));
  const zip = smooth(clamp01((t - 0.3) / 0.42));
  const tap = clamp01((t - 0.74) / 0.26);
  const half = Math.ceil(n / 2);
  cards.forEach((mesh, i) => {
    const rest = pileRestPose(i);
    const side = i < half ? -1 : 1;
    // 还分在手上的那段时间：越靠外的牌抬得越高，掰开的两叠才有弧度
    const apart = open * (1 - zip);
    const within = (i < half ? i : i - half) / Math.max(1, half - 1);
    const weave = Math.sin(Math.PI * zip);
    mesh.position.set(
      side * CARD.w * 0.62 * apart,
      rest.y + apart * (0.004 + within * 0.004) + (1 - tap) * 0.0012,
      (i % 2 ? 1 : -1) * CARD.d * 0.05 * weave,
    );
    mesh.rotation.set(0, rest.rotY + side * 0.05 * apart + (i % 2 ? 1 : -1) * 0.02 * weave, side * -0.16 * apart);
  });
}

function addCountBadge(group: THREE.Group, o: import("@/game/types").GameObject, color: string, at: [number, number, number]) {
  const n = o.pile?.length ?? 0;
  if (!n) return;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: countBadgeTexture(n, color), transparent: true, depthWrite: false }));
  sp.position.set(at[0], at[1], at[2]);
  sp.scale.set(0.03, 0.0127, 1);
  sp.renderOrder = 3;
  sp.userData.id = o.id;
  group.add(sp);
}

/** 为单个物件生成（或复用）可视化网格；返回的 Group 原点在物件底面中心。
 *  hidden 为真时按观看者保密牌面：卡面/顶牌一律换成背面。
 *  tally 是统计垫当场数出来的竖放/横放张数，只有统计垫会用到。 */
export function buildPiece(o: import("@/game/types").GameObject, hidden = false, tally?: { up: number; side: number }): THREE.Group {
  const group = new THREE.Group();
  // 先转水平角再抬俯仰，牌才不会绕着歪掉的轴翻了个面
  group.rotation.order = "YXZ";
  group.userData.id = o.id;
  const color = o.color ?? "#c8443c";

  switch (o.kind) {
    case "board": {
      const spec = o.board!;
      const s = boardSize(spec);
      const thick = boardThickness(spec);
      const mesh = new THREE.Mesh(boardGeometry(spec), buildBoardMaterials(spec, boardTexture(spec, o.mesh !== false)));
      mesh.position.y = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.id = o.id;
      group.add(mesh);
      // 锁住的桌垫谁都点不到，只留角上这颗按钮负责解锁：垫子越大按钮越大
      if (o.lock) {
        const btn = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
          map: unlockTexture(),
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }));
        const r = Math.min(0.15, Math.max(0.06, Math.min(s.w, s.d) * 0.1));
        btn.rotation.x = -Math.PI / 2;
        btn.scale.set(r, r, 1);
        btn.position.set(-s.w / 2 + r, thick / 2 + 0.0022, s.d / 2 - r);
        btn.userData.unlock = o.id;
        group.add(btn);
      }
      break;
    }
    case "zone": {
      const z = o.zone ?? { w: 0.5, d: 0.36 };
      // 垫子画成实心一块，区域垫画成一框虚线；几何与点击范围完全一样
      const map = z.pad
        ? padTexture(o.label ?? "", color, o.priv === true, z.w, z.d, z.img)
        : zoneTexture(o.label ?? "", color, o.priv === true, z.w, z.d);
      const mesh = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      // 贴面薄片：朝上铺开，靠 scene 抬高一点点避免和桌布 z-fighting
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(z.w, z.d, 1);
      mesh.receiveShadow = false;
      mesh.userData.id = o.id;
      group.add(mesh);
      break;
    }
    case "stat": {
      const s = o.stat ?? { w: 0.6, d: 0.42 };
      const mesh = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
        map: statTexture(o.label ?? "", color, tally?.up ?? 0, tally?.side ?? 0, o.lock === true, s.w, s.d),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(s.w, s.d, 1);
      mesh.userData.id = o.id;
      group.add(mesh);
      // 锁上的垫子谁都点不到，只留角上这颗按钮负责解锁
      if (o.lock) {
        const btn = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
          map: unlockTexture(),
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }));
        btn.rotation.x = -Math.PI / 2;
        btn.scale.set(0.05, 0.05, 1);
        btn.position.set(-s.w / 2 + 0.032, 0.0022, s.d / 2 - 0.032);
        btn.userData.unlock = o.id;
        group.add(btn);
      }
      break;
    }
    case "slot": {
      const s = slotSize(o);
      const mesh = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
        map: slotTexture(o.label ?? "", color, fixSlot(o.slot).n, s.w, s.d),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      // 和区域垫一样是一张贴面薄片：牌躺在它上面，格子只是画出来的引导
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(s.w, s.d, 1);
      mesh.receiveShadow = false;
      mesh.userData.id = o.id;
      group.add(mesh);
      break;
    }
    case "spinner": {
      const s = fixSpinner(o.spinner);
      const base = new THREE.Mesh(spinBaseGeometry(), plastic("#2b3038", { roughness: 0.52, clearcoat: 0.3 }));
      base.castShadow = true;
      base.receiveShadow = true;
      base.userData.id = o.id;
      group.add(base);
      // 会转的只有这一块盘身：角度由 scene 每帧按「起转时刻 + 现在」算，网格被重建也不断片
      const dial = new THREE.Group();
      const body = new THREE.Mesh(spinDialGeometry(), plastic(color, { roughness: 0.42, clearcoat: 0.4 }));
      body.castShadow = true;
      body.userData.id = o.id;
      dial.add(body);
      const face = new THREE.Mesh(spinFaceGeometry(), new THREE.MeshBasicMaterial({
        map: spinnerTexture(s.n, color, s.value),
        transparent: true,
      }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.0057;
      face.userData.id = o.id;
      dial.add(face);
      dial.rotation.y = THREE.MathUtils.degToRad(spinAngle(o));
      group.add(dial);
      const hub = new THREE.Mesh(spinHubGeometry(), plastic("#f2efe6", { roughness: 0.36, clearcoat: 0.5 }));
      hub.position.y = 0.0055;
      hub.castShadow = true;
      hub.userData.id = o.id;
      group.add(hub);
      const needle = new THREE.Mesh(spinNeedleGeometry(), plastic("#e04a3f", { roughness: 0.3, clearcoat: 0.6 }));
      needle.position.set(0, 0.0112, -(SPIN_R - 0.032));
      needle.castShadow = true;
      needle.userData.id = o.id;
      group.add(needle);
      group.userData.dial = dial;
      break;
    }
    case "track": {
      const t = fixTrack(o.track);
      const size = trackSize(o);
      const mesh = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
        map: trackTexture(o.label ?? "", color, t.n, size.w, size.d),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(size.w, size.d, 1);
      mesh.receiveShadow = false;
      mesh.userData.id = o.id;
      group.add(mesh);
      // 棋子一次建满再藏起来：加分时只挪位置、开关可见，重建网格就把滑动动画整个抹掉了
      const pucks: { mesh: THREE.Mesh; x: number }[] = [];
      for (let i = 0; i < TRACK_MARK_MAX; i++) {
        const puck = new THREE.Mesh(markGeometry(), plastic("#efe7d6", { roughness: 0.34, clearcoat: 0.45 }));
        puck.castShadow = true;
        puck.visible = false;
        puck.userData.id = o.id;
        group.add(puck);
        pucks.push({ mesh: puck, x: Number.NaN });
      }
      group.userData.marks = { pucks };
      break;
    }
    case "card": {
      const mesh = new THREE.Mesh(cardGeometry(), cardMaterials(o.card, color, !hidden && o.faceUp !== false, o.backImg));
      const [fx, fz] = cardFit(o);
      mesh.scale.set(fx, 1, fz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = o.id;
      group.add(mesh);
      break;
    }
    case "pile": {
      const [fx, fz] = cardFit(o);
      // 空着就得看着是空的：以前零张也画一张扣着的牌，「没牌」和「就一张」完全一样，弃牌堆占哪个位置也没准头
      if (!o.pile?.length) {
        const mesh = new THREE.Mesh(cardGeometry(), trayMaterials(color, (CARD.w * fx) / (CARD.d * fz)));
        mesh.scale.set(fx * PILE_TRAY, 1, fz * PILE_TRAY);
        mesh.position.y = 0.0004;
        mesh.receiveShadow = true;
        mesh.userData.id = o.id;
        group.add(mesh);
        break;
      }
      const n = Math.min(18, o.pile.length);
      const ratio = o.pile?.at(-1)?.ratio;
      const back = cardMaterials(undefined, color, false, o.backImg, ratio, o.pile.at(-1)?.back);
      // 牌面朝下时顶牌也得是牌背：以前给它一张正面空白卡，一整叠扑克看着就成了「全是空白卡」，设了自定义卡背也照样看不见
      const shown = hidden || o.faceUp === false ? back : cardMaterials(o.pile?.at(-1) ?? undefined, color, true, o.backImg);
      for (let i = 0; i < n; i++) {
        const rest = pileRestPose(i);
        const mesh = new THREE.Mesh(cardGeometry(), i === n - 1 ? shown : back);
        mesh.scale.set(fx, 1, fz);
        mesh.position.y = rest.y;
        mesh.rotation.y = rest.rotY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.id = o.id;
        group.add(mesh);
      }
      addCountBadge(group, o, color, [(CARD.w * fx) / 2 + 0.02, n * PILE_STEP + 0.026, -((CARD.d * fz) / 2 + 0.004)]);
      break;
    }
    case "die": {
      const sides = o.sides ?? 6;
      const mat = sides === 6 ? dieMaterials(color)
        : sides === 4 ? d4Materials(color)
          : plastic(color, { roughness: 0.22, clearcoat: 0.85, flatShading: true });
      const mesh = new THREE.Mesh(dieGeometry(sides), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = o.id;
      mesh.position.y = dieRestY(sides);
      group.add(mesh);
      break;
    }
    case "box": {
      const shell = plastic(color, { roughness: 0.5, clearcoat: 0.35 });
      // 盒口跟着牌形撑开：装的是宽牌，壳子还按标准牌大小，牌就一头捅穿盒壁
      const [fx, fz] = cardFit(o);
      const add = (part: "bottom" | "wallX" | "wallZ", x: number, y: number, z: number, sc: [number, number]) => {
        const mesh = new THREE.Mesh(boxPartGeometry(part), shell);
        mesh.position.set(x, y, z);
        mesh.scale.set(sc[0], 1, sc[1]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.id = o.id;
        group.add(mesh);
      };
      add("bottom", 0, BOX.t / 2, 0, [fx, fz]);
      add("wallX", -(BOX.w / 2 - BOX.t / 2) * fx, BOX.h / 2, 0, [1, fz]);
      add("wallX", (BOX.w / 2 - BOX.t / 2) * fx, BOX.h / 2, 0, [1, fz]);
      add("wallZ", 0, BOX.h / 2, -(BOX.d / 2 - BOX.t / 2) * fz, [fx, 1]);
      add("wallZ", 0, BOX.h / 2, (BOX.d / 2 - BOX.t / 2) * fz, [fx, 1]);
      const n = Math.min(12, o.pile?.length ?? 0);
      if (n > 0) {
        const back = cardMaterials(undefined, color, false, o.backImg, o.pile?.at(-1)?.ratio, o.pile?.at(-1)?.back);
        const shown = hidden ? back : cardMaterials(o.faceUp === false ? undefined : o.pile?.at(-1), color, o.faceUp !== false, o.backImg);
        for (let i = 0; i < n; i++) {
          const mesh = new THREE.Mesh(cardGeometry(), i === n - 1 ? shown : back);
          mesh.scale.set(0.95 * fx, 1, 0.95 * fz);
          mesh.position.y = BOX.t + i * (CARD.h * 0.9);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.id = o.id;
          group.add(mesh);
        }
      }
      addCountBadge(group, o, color, [(BOX.w * fx) / 2 + 0.018, BOX.h + 0.022, -((BOX.d * fz) / 2 + 0.004)]);
      break;
    }
    case "bag": {
      const body = new THREE.Mesh(bagGeometry(), plastic(color, { roughness: 0.92, metalness: 0, clearcoat: 0.06 }));
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.id = o.id;
      group.add(body);
      const tie = new THREE.Mesh(bagTieGeometry(), plastic("#3a2c1c", { roughness: 0.8, clearcoat: 0.1 }));
      tie.position.set(0, 0.046, 0);
      tie.rotation.x = Math.PI / 2;
      tie.castShadow = true;
      tie.userData.id = o.id;
      group.add(tie);
      addCountBadge(group, o, color, [0.032, 0.058, -0.026]);
      break;
    }
    case "token": {
      const mesh = new THREE.Mesh(tokenGeometry(), tokenMaterials(o.label ?? "", color, o.count));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = o.id;
      group.add(mesh);
      break;
    }
    case "pawn": {
      const shape = o.shape ?? "pawn";
      const mesh: THREE.Object3D = isChessShape(shape)
        ? chessFigure(shape, plastic(color, { roughness: 0.32, clearcoat: 0.55 }), o.id)
        : shape === "flag"
          ? flagFigure(color, o.id)
          : new THREE.Mesh(shape === "meeple" ? meepleGeometry() : pawnGeometry(shape), plastic(color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = o.id;
      group.add(mesh);
      break;
    }
    case "disc": {
      const shape = o.shape ?? "disc";
      const mats: THREE.Material[] = shape === "coin"
        ? [plastic("#f7f3ea", { roughness: 0.42 }), plastic(color), plastic(color)]
        : [plastic(color), plastic(color), plastic(color)];
      if (shape === "coin") {
        const edgeMat = new THREE.MeshPhysicalMaterial({ map: chipEdgeTexture(color), roughness: 0.4, clearcoat: 0.5 });
        const top = printMaterial(tokenTopTexture(o.label ?? "", color, o.count), 0.56);
        mats[0] = edgeMat;
        mats[1] = top;
      }
      if (shape === "piece") {
        // 象棋子是一枚车出来的木片：侧面和底面都走木色，只有正面贴刻字
        const wood = plastic("#c9a870", { roughness: 0.55, clearcoat: 0.28 });
        mats[0] = wood;
        mats[1] = printMaterial(xiangqiTopTexture(o.label ?? "", color), 0.52);
        mats[2] = wood;
      }
      if (shape === "stone" || shape === "puck") {
        // 围棋子与五子：一面朝天一面贴桌，球面没有侧壁，材质给一份就够
        const gloss = plastic(color, { roughness: shape === "stone" ? 0.18 : 0.26, clearcoat: 0.85, clearcoatRoughness: 0.12 });
        const mesh = new THREE.Mesh(discGeometry(shape), gloss);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.id = o.id;
        group.add(mesh);
        break;
      }
      if (shape === "man") {
        const mesh = new THREE.Mesh(discGeometry(shape), plastic(color, { roughness: 0.36, clearcoat: 0.5 }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.id = o.id;
        group.add(mesh);
        break;
      }
      const mesh = new THREE.Mesh(discGeometry(shape), mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = o.id;
      group.add(mesh);
      break;
    }
    case "cube": {
      const mesh = new THREE.Mesh(cubeGeometry(o.shape ?? "cube"), plastic(color, { roughness: 0.45, clearcoat: 0.3 }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = o.id;
      group.add(mesh);
      break;
    }
    case "timer": {
      const shell = new THREE.Mesh(timerShellGeometry(), plastic(color, { roughness: 0.4, clearcoat: 0.6 }));
      shell.castShadow = true;
      shell.receiveShadow = true;
      shell.userData.id = o.id;
      group.add(shell);
      const plate = makePlate(256);
      const left = remainingOf(o);
      const total = Math.max(1, o.duration || left || 1);
      paintTimer(plate, mmss(left), color, left / total, o.endsAt != null && left <= 0);
      const face = new THREE.Mesh(timerFaceGeometry(), new THREE.MeshBasicMaterial({ map: plate.texture, transparent: true }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = TIMER_H + 0.0006;
      face.userData.id = o.id;
      group.add(face);
      // 盘面每帧跟着时钟重画，交给 scene 的动画循环
      group.userData.plate = { plate, color };
      break;
    }
    case "calc": {
      const body = new THREE.Mesh(calcBodyGeometry(), plastic(color, { roughness: 0.42, clearcoat: 0.5 }));
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.id = o.id;
      group.add(body);
      const plate = makePlate(340, 120);
      const expr = o.calc?.expr ?? "";
      const value = calcResult(expr);
      paintCalc(plate, expr, value === null ? "" : formatCalc(value), color);
      const screen = new THREE.Mesh(calcScreenGeometry(), new THREE.MeshBasicMaterial({ map: plate.texture, transparent: true }));
      screen.rotation.x = -Math.PI / 2;
      screen.position.set(0, 0.0114, -0.040);
      screen.userData.id = o.id;
      screen.renderOrder = 2;
      group.add(screen);
      const dark = plastic("#2b3038", { roughness: 0.55, clearcoat: 0.3 });
      const opMat = plastic("#55606d", { roughness: 0.5, clearcoat: 0.35 });
      const eqMat = plastic(color, { roughness: 0.4, clearcoat: 0.55 });
      const keys = CALC_KEYS.flat();
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const cap = new THREE.Mesh(calcKeyGeometry(), k === "=" ? eqMat : "C⌫()".includes(k) ? opMat : "+−×÷".includes(k) ? opMat : dark);
        cap.position.set(((i % 4) - 1.5) * 0.019, 0.011, -0.008 + Math.floor(i / 4) * 0.014);
        cap.userData.id = o.id;
        cap.userData.calcKey = k;
        cap.castShadow = true;
        group.add(cap);
        // 字模浮在键帽顶上；它也带着 calcKey，不然点字的时候反而选不中键
        const glyph = new THREE.Mesh(calcKeyFaceGeometry(i, keys.length), calcKeyFaceMaterial(keys));
        glyph.rotation.x = -Math.PI / 2;
        glyph.position.set(cap.position.x, 0.0152, cap.position.z);
        glyph.renderOrder = 2;
        glyph.userData.id = o.id;
        glyph.userData.calcKey = k;
        group.add(glyph);
      }
      // 屏幕跟着表达式重画，同样交给 scene 的动画循环
      group.userData.plate = { plate, color };
      break;
    }
    case "counter": {
      const ct = fixCounter(o.counter);
      const shell = new THREE.Mesh(counterBodyGeometry(), plastic(color, { roughness: 0.4, clearcoat: 0.55 }));
      shell.castShadow = true;
      shell.receiveShadow = true;
      shell.userData.id = o.id;
      group.add(shell);
      const plate = makePlate(240, 80);
      paintCounter(plate, ct.v, color);
      const screen = new THREE.Mesh(counterScreenGeometry(), new THREE.MeshBasicMaterial({ map: plate.texture, transparent: true }));
      screen.rotation.x = -Math.PI / 2;
      screen.position.set(0, COUNTER_BODY.h + 0.0006, COUNTER_SCREEN.z);
      screen.renderOrder = 2;
      screen.userData.id = o.id;
      group.add(screen);
      const keyMat = plastic("#2b3038", { roughness: 0.55, clearcoat: 0.3 });
      COUNTER_KEYS.forEach((k, i) => {
        const cap = new THREE.Mesh(counterKeyGeometry(), keyMat);
        cap.position.set(i === 0 ? -COUNTER_KEY.x : COUNTER_KEY.x, COUNTER_BODY.h, COUNTER_KEY.z);
        cap.castShadow = true;
        cap.userData.id = o.id;
        cap.userData.counterKey = k;
        group.add(cap);
        // 字模浮在键帽顶上；它也带着 counterKey，不然点字的时候反而选不中键
        const glyph = new THREE.Mesh(counterKeyFaceGeometry(i), calcKeyFaceMaterial(COUNTER_KEYS));
        glyph.rotation.x = -Math.PI / 2;
        glyph.position.set(cap.position.x, COUNTER_BODY.h + COUNTER_KEY.h + 0.0004, COUNTER_KEY.z);
        glyph.renderOrder = 2;
        glyph.userData.id = o.id;
        glyph.userData.counterKey = k;
        group.add(glyph);
      });
      // 读数跟着按键重画，交给 scene 的动画循环
      group.userData.plate = { plate, color };
      break;
    }
    case "shield": {
      const sp = fixShield(o.shield);
      const footH = 0.0035;
      const wood = plastic("#5c4230", { roughness: 0.58, clearcoat: 0.24 });
      const foot = new THREE.Mesh(unitBoxGeometry(), wood);
      foot.scale.set(sp.w * 1.16, footH, 0.03);
      foot.castShadow = true;
      foot.receiveShadow = true;
      foot.userData.id = o.id;
      group.add(foot);
      // 六面分开给料：+z 是主人那一面，写着名字的布面贴这里；背面是素的，同桌一看屏面就知道挡的是谁
      const front = printMaterial(shieldTexture(o.label ?? "", color, sp.w, sp.h), 0.74, 0.12);
      const back = plastic("#3a3f47", { roughness: 0.72, clearcoat: 0.14 });
      const panel = new THREE.Mesh(unitBoxGeometry(), [wood, wood, wood, wood, front, back]);
      panel.scale.set(sp.w, sp.h, 0.008);
      panel.position.y = footH;
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.userData.id = o.id;
      group.add(panel);
      // 认了主人才有这条带子：牌落在屏前这一窄条里，别人才看不见牌面
      if (o.owner) {
        const band = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
          color: new THREE.Color(color), transparent: true, opacity: 0.085, depthWrite: false, side: THREE.DoubleSide,
        }));
        band.rotation.x = -Math.PI / 2;
        band.scale.set(sp.w, SHIELD_BAND, 1);
        band.position.set(0, 0.0012, SHIELD_BAND / 2);
        band.renderOrder = 1;
        group.add(band);
      }
      break;
    }
    case "tray": {
      const ts = fixTray(o.tray);
      const outerW = ts.w + TRAY_WALL * 2;
      const outerD = ts.d + TRAY_WALL * 2;
      const floorH = 0.004;
      // 盘身一块深色绒布底，四面矮墙围着——骰子丢进来撞在墙上停住，不会滚出盘外
      const body = plastic(color, { roughness: 0.82, clearcoat: 0.08 });
      const felt = plastic("#2c2f36", { roughness: 0.95, clearcoat: 0 });
      const floor = new THREE.Mesh(unitBoxGeometry(), felt);
      floor.scale.set(outerW, floorH, outerD);
      floor.position.y = floorH / 2;
      floor.receiveShadow = true;
      floor.userData.id = o.id;
      group.add(floor);
      // 四道墙压在底板四边外侧围成一圈：长墙沿 x 铺满外沿、短墙沿 z 只填内径，四段首尾相接不重叠
      const wallY = floorH + TRAY_H / 2;
      const hx = ts.w / 2 + TRAY_WALL / 2;
      const hz = ts.d / 2 + TRAY_WALL / 2;
      for (const [px, pz, w, d] of [
        [0, -hz, outerW, TRAY_WALL], [0, hz, outerW, TRAY_WALL],
        [-hx, 0, TRAY_WALL, ts.d], [hx, 0, TRAY_WALL, ts.d],
      ] as const) {
        const wall = new THREE.Mesh(unitBoxGeometry(), body);
        wall.scale.set(w, TRAY_H, d);
        wall.position.set(px, wallY, pz);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData.id = o.id;
        group.add(wall);
      }
      break;
    }
    case "tablet": {
      const tb = fixTablet(o.tablet);
      const { w, d, h } = TABLET_BODY;
      const shell = plastic("#2b2f36", { roughness: 0.44, metalness: 0.3, clearcoat: 0.42 });
      const glass = plastic("#0d1014", { roughness: 0.12, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.06 });
      const backPlate = plastic(color, { roughness: 0.5, metalness: 0.18, clearcoat: 0.3 });
      // 一整块平躺的板子，屏面朝上：底面直接坐在桌布上，没有支架也没有哪一截悬空。
      // 六面分开给料：+y 是屏面那一边黑玻璃，-y 是背面刷这台机子的颜色，同桌一眼分得清正反面。
      const body = new THREE.Mesh(unitBoxGeometry(), [shell, shell, glass, backPlate, shell, shell]);
      body.scale.set(w, h, d);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.id = o.id;
      group.add(body);
      // 屏就贴在顶面正中间，四边留等宽的一圈边框——占位屏与 CSS3D 真播放器共用这一块位置
      const scr = new THREE.Mesh(planeGeometry(), printMaterial(tabletScreenTexture(tb.url, o.label ?? ""), 0.34, 0.42));
      scr.rotation.x = -Math.PI / 2;
      scr.scale.set(TABLET_SCREEN.w, TABLET_SCREEN.h, 1);
      scr.position.set(0, h + 0.0002, 0);
      scr.userData.id = o.id;
      group.add(scr);
      // CSS3D 那层每帧照这块占位屏的世界矩阵摆真播放器，所以把它挂在 group 上交出去
      group.userData.screen = scr;
      break;
    }
    case "hour": {
      const hs = fixHour(o.hour);
      const ratio = hourRatio(o);
      const wood = plastic("#6d4a2c", { roughness: 0.6, clearcoat: 0.22 });
      for (const y of [0, HOUR_H - 0.005]) {
        const cap = new THREE.Mesh(hourCapGeometry(), wood);
        cap.position.y = y;
        cap.castShadow = true;
        cap.receiveShadow = true;
        cap.userData.id = o.id;
        group.add(cap);
      }
      const post = hourPostGeometry();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
        const m = new THREE.Mesh(post, wood);
        m.position.set(Math.cos(a) * HOUR_R * 0.99, 0.0045, Math.sin(a) * HOUR_R * 0.99);
        m.castShadow = true;
        m.userData.id = o.id;
        group.add(m);
      }
      const sand = plastic("#dcc084", { roughness: 0.9, clearcoat: 0 });
      // 上瓶的沙缩向细颈、下瓶的沙从瓶底堆起来，两个比例每帧由 scene 按本地时钟改
      const top = new THREE.Mesh(hourSandTopGeometry(), sand);
      top.position.y = HOUR_H / 2;
      top.scale.setScalar(ratio);
      group.add(top);
      const bottom = new THREE.Mesh(hourSandBottomGeometry(), sand);
      bottom.position.y = 0.0056;
      bottom.scale.setScalar(1 - ratio);
      group.add(bottom);
      const stream = new THREE.Mesh(hourStreamGeometry(), sand);
      stream.position.y = HOUR_H / 2;
      stream.visible = hs.at !== null && hourLeft(o) > 0;
      group.add(stream);
      group.userData.sand = { top, bottom, stream };
      const glass = new THREE.Mesh(hourGlassGeometry(), new THREE.MeshPhysicalMaterial({
        color: 0xeef4f6, transparent: true, opacity: 0.24, roughness: 0.05, metalness: 0,
        clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide, depthWrite: false,
      }));
      glass.renderOrder = 3;
      glass.userData.id = o.id;
      group.add(glass);
      // 顶托上刻一块小表盘：沙漏本身没有屏幕，不写还剩多久就没人知道这一漏是几分钟
      const plate = makePlate(256);
      paintTimer(plate, mmss(hourLeft(o)), color, ratio, hs.at !== null && hourLeft(o) <= 0);
      const face = new THREE.Mesh(hourFaceGeometry(), new THREE.MeshBasicMaterial({ map: plate.texture, transparent: true }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = HOUR_H + 0.0004;
      face.renderOrder = 2;
      face.userData.id = o.id;
      group.add(face);
      group.userData.plate = { plate, color };
      break;
    }
    case "book": {
      const bk = fixBook(o.book);
      const { l, r } = bookSpread(bk);
      const thick = 0.0085 + Math.min(0.006, bk.pages.length * 0.00035);
      const cover = new THREE.Mesh(unitBoxGeometry(), plastic(color, { roughness: 0.62, clearcoat: 0.2 }));
      cover.scale.set(BOOK_SPREAD.w + 0.006, thick, BOOK_SPREAD.d + 0.005);
      cover.castShadow = true;
      cover.receiveShadow = true;
      cover.userData.id = o.id;
      group.add(cover);
      const page = new THREE.Mesh(planeGeometry(), printMaterial(bookTexture(l, r, bk.page, bk.pages.length, o.label ?? "", color), 0.82, 0.16));
      page.rotation.x = -Math.PI / 2;
      page.scale.set(BOOK_SPREAD.w, BOOK_SPREAD.d, 1);
      page.position.y = thick + 0.0004;
      page.receiveShadow = true;
      page.userData.id = o.id;
      group.add(page);
      break;
    }
    case "gram": {
      const gm = fixGram(o.gram);
      const wood = plastic("#4d3524", { roughness: 0.55, clearcoat: 0.35 });
      const chrome = plastic("#d7dae0", { roughness: 0.22, metalness: 0.85, clearcoat: 0.4 });
      const shell = new THREE.Mesh(gramCaseGeometry(), wood);
      shell.castShadow = true;
      shell.receiveShadow = true;
      shell.userData.id = o.id;
      group.add(shell);
      // 转盘、黑胶、标签三层共用一个子组：只有它转，33⅓ 转的动画每帧由 scene 累加
      const platter = new THREE.Group();
      platter.position.set(GRAM.cx, GRAM.caseH, GRAM.cz);
      const deck = new THREE.Mesh(gramPlatterGeometry(), plastic("#b8bcc2", { roughness: 0.3, metalness: 0.7 }));
      deck.castShadow = true;
      deck.receiveShadow = true;
      deck.userData.id = o.id;
      platter.add(deck);
      const vinyl = new THREE.Mesh(gramVinylGeometry(), plastic("#14151a", { roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.1 }));
      vinyl.position.y = GRAM.platterH;
      vinyl.castShadow = true;
      vinyl.userData.id = o.id;
      platter.add(vinyl);
      const record = new THREE.Mesh(gramFaceGeometry(), new THREE.MeshBasicMaterial({ map: recordTexture(gm.name, color), transparent: true }));
      record.rotation.x = -Math.PI / 2;
      record.position.y = GRAM.platterH + 0.0025;
      record.userData.id = o.id;
      platter.add(record);
      group.add(platter);
      const spindle = new THREE.Mesh(gramSpindleGeometry(), chrome);
      spindle.position.set(GRAM.cx, GRAM.caseH + GRAM.platterH, GRAM.cz);
      spindle.castShadow = true;
      spindle.userData.id = o.id;
      group.add(spindle);
      const post = new THREE.Mesh(gramPillarGeometry(), plastic("#2b2f36", { roughness: 0.45, metalness: 0.3 }));
      post.position.set(GRAM.px, GRAM.caseH, GRAM.pz);
      post.castShadow = true;
      post.userData.id = o.id;
      group.add(post);
      // 唱臂：整组绕枢轴摆，放片时压到唱片外圈、停机时回到右侧的臂架。
      // 必须先转水平角再俯仰（YXZ），否则臂甩到侧面时那点下沉会跟着一起歪
      const arm = new THREE.Group();
      arm.rotation.order = "YXZ";
      arm.position.set(GRAM.px, GRAM.armY, GRAM.pz);
      arm.rotation.set(GRAM_TILT, gm.playing ? GRAM_CUE : GRAM.park, 0);
      const tube = new THREE.Mesh(gramTubeGeometry(), chrome);
      tube.position.z = GRAM_ARM * 0.4;
      tube.castShadow = true;
      tube.userData.id = o.id;
      arm.add(tube);
      const weight = new THREE.Mesh(gramWeightGeometry(), plastic("#1d1f24", { roughness: 0.4 }));
      weight.position.z = -GRAM_ARM * 0.3;
      weight.castShadow = true;
      weight.userData.id = o.id;
      arm.add(weight);
      const head = new THREE.Mesh(gramHeadGeometry(), plastic("#25282e", { roughness: 0.4 }));
      head.position.z = GRAM_ARM * 0.94;
      head.castShadow = true;
      head.userData.id = o.id;
      arm.add(head);
      const stylus = new THREE.Mesh(gramStylusGeometry(), chrome);
      stylus.position.set(0, -0.0075, GRAM_ARM * 0.98);
      stylus.userData.id = o.id;
      arm.add(stylus);
      group.add(arm);
      for (const [kx, kz, kr] of [[0.148, 0.086, 0.0115], [0.148, 0.046, 0.0095]] as const) {
        const knob = new THREE.Mesh(gramKnobGeometry(), plastic(color, { roughness: 0.4, clearcoat: 0.5 }));
        knob.position.set(kx, GRAM.caseH, kz);
        knob.scale.setScalar(kr / 0.0115);
        knob.castShadow = true;
        knob.userData.id = o.id;
        group.add(knob);
      }
      // 机头那颗指示灯：亮红=正在放，暗着=停着。隔着整张桌子也看得出身在放没在放
      const lampOff = plastic("#3a3f47", { roughness: 0.4 });
      const lampOn = glowMaterial("#ff6a4a");
      const lamp = new THREE.Mesh(gramLampGeometry(), gm.playing ? lampOn : lampOff);
      lamp.position.set(0.148, GRAM.caseH, 0.122);
      lamp.userData.id = o.id;
      group.add(lamp);
      // 前脸那块铜铭牌：曲名刻在机身上，一眼认得出这台放的是哪张片
      const plate = new THREE.Mesh(planeGeometry(), printMaterial(gramPlateTexture(gm.name), 0.55, 0.5));
      plate.scale.set(0.1, 0.019, 1);
      plate.position.set(-0.06, 0.028, GRAM_BODY.d / 2 + 0.0012);
      plate.userData.id = o.id;
      group.add(plate);
      group.userData.gram = { platter, arm, lamp, mats: [lampOff, lampOn] };
      break;
    }
    case "mp3": {
      const m = fixMp3(o.mp3);
      const chrome = plastic("#d7dae0", { roughness: 0.22, metalness: 0.85, clearcoat: 0.4 });
      const shell = new THREE.Mesh(mp3ShellGeometry(), plastic(color, { roughness: 0.36, clearcoat: 0.65 }));
      shell.castShadow = true;
      shell.receiveShadow = true;
      shell.userData.id = o.id;
      group.add(shell);
      // 磁带舱：嵌在顶面中央的一块浅坑，两卷带就搁在坑里露着
      const bay = new THREE.Mesh(mp3BayGeometry(), plastic("#191b20", { roughness: 0.5 }));
      bay.position.set(MP3.bayX, MP3.h - MP3.bayH / 2 + 0.0005, MP3.bayZ);
      bay.receiveShadow = true;
      bay.userData.id = o.id;
      group.add(bay);
      const reels: THREE.Object3D[] = [];
      for (const dx of [-MP3.reelX, MP3.reelX]) {
        const reel = new THREE.Group();
        reel.position.set(MP3.bayX + dx, MP3.h + 0.0008, MP3.bayZ);
        const hub = new THREE.Mesh(mp3ReelGeometry(), plastic("#e6e8ec", { roughness: 0.4 }));
        hub.userData.id = o.id;
        reel.add(hub);
        for (const turn of [0, Math.PI / 3, -Math.PI / 3]) {
          const spoke = new THREE.Mesh(mp3SpokeGeometry(), plastic("#b9bdc4", { roughness: 0.45 }));
          spoke.rotation.y = turn;
          spoke.userData.id = o.id;
          reel.add(spoke);
        }
        const tape = new THREE.Mesh(mp3TapeGeometry(), plastic("#5a4630", { roughness: 0.62 }));
        tape.rotation.x = Math.PI / 2;
        tape.userData.id = o.id;
        reel.add(tape);
        group.add(reel);
        reels.push(reel);
      }
      // 顶面前缘那条窄屏：曲名和「本机/全桌」一起印着，隔着桌子也看得出这台在归谁听
      const screen = new THREE.Mesh(planeGeometry(), printMaterial(mp3ScreenTexture(m.name, m.shared), 0.42, 0.25));
      screen.rotation.x = -Math.PI / 2;
      screen.scale.set(MP3.screenW, MP3.screenH, 1);
      screen.position.set(MP3.bayX, MP3.h + 0.0006, MP3.d / 2 - 0.0115);
      screen.userData.id = o.id;
      group.add(screen);
      // 右端那道线控滚轮与两个耳机孔：机身上的细节，不参与走带
      const wheel = new THREE.Mesh(mp3WheelGeometry(), chrome);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(MP3.w / 2 - 0.0075, MP3.h * 0.62, MP3.d / 2 - 0.012);
      wheel.castShadow = true;
      wheel.userData.id = o.id;
      group.add(wheel);
      for (const jx of [-0.028, -0.018]) {
        const jack = new THREE.Mesh(mp3JackGeometry(), plastic("#2a2d33", { roughness: 0.4, metalness: 0.4 }));
        jack.rotation.x = Math.PI / 2;
        jack.position.set(MP3.bayX + jx, MP3.h * 0.5, MP3.d / 2 - 0.0005);
        jack.userData.id = o.id;
        group.add(jack);
      }
      const ledOff = plastic("#3a3f47", { roughness: 0.4 });
      const ledOn = glowMaterial("#5ce39a");
      const led = new THREE.Mesh(mp3LedGeometry(), m.shared ? ledOn : ledOff);
      led.position.set(MP3.w / 2 - 0.014, MP3.h + 0.0012, -MP3.d / 2 + 0.009);
      led.userData.id = o.id;
      group.add(led);
      group.userData.walkman = { reels, led, mats: [ledOff, ledOn] };
      break;
    }
    case "pointer": {
      const mat = plastic(color, { roughness: 0.28, clearcoat: 0.8 });
      for (const g of [pointerBaseGeometry(), pointerPostGeometry(), pointerHeadGeometry()]) {
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.id = o.id;
        group.add(mesh);
      }
      const dot = new THREE.Mesh(pointerDotGeometry(), glowMaterial(color));
      dot.rotation.x = -Math.PI / 2;
      dot.position.y = 0.0012;
      dot.userData.id = o.id;
      group.add(dot);
      break;
    }
    case "arrow": {
      const len = Math.max(0.05, Number(o.len) || 0.3);
      const mat = glowMaterial(color);
      const body = new THREE.Mesh(arrowBodyGeometry(), mat);
      body.scale.x = Math.max(0.02, len - 0.03);
      body.position.set(body.scale.x / 2, 0.004, 0);
      body.receiveShadow = true;
      body.userData.id = o.id;
      group.add(body);
      const head = new THREE.Mesh(arrowHeadGeometry(), mat);
      head.position.set(len - 0.018, 0.004, 0);
      head.userData.id = o.id;
      group.add(head);
      break;
    }
    case "text": {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textPlateTexture(o.label ?? "", color), transparent: true, depthWrite: false }));
      sp.position.set(0, 0.072, 0);
      sp.scale.set(0.16, 0.08, 1);
      sp.renderOrder = 3;
      sp.userData.id = o.id;
      group.add(sp);
      break;
    }
    default:
      break;
  }
  return group;
}

export function tableMaterials(): { wood: THREE.MeshPhysicalMaterial; felt: THREE.MeshStandardMaterial } {
  const wood = new THREE.MeshPhysicalMaterial({
    map: woodTexture(),
    roughnessMap: woodRoughness(),
    roughness: 0.5,
    metalness: 0.02,
    clearcoat: 0.45,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0.85,
  });
  const felt = new THREE.MeshStandardMaterial({
    map: tableFeltTexture("#21402f"),
    roughness: 0.93,
    metalness: 0,
  });
  return { wood, felt };
}

/** 选中框外半径：拖动光环、点位环与吃子环这些"格子上的记号"按它等比缩放，保持圆形 */
export const RING_R = 0.033;

/** 框带离脚多远、自身多宽（米）：小牌要细到几乎像描边，两米的桌垫要够粗才看得见 */
function frameMargin(m: number): { g: number; t: number } {
  return {
    g: Math.min(0.012, Math.max(0.0025, m * 0.018)),
    t: Math.min(0.005, Math.max(0.0016, m * 0.01)),
  };
}

/** 圆角矩形走一圈（中心在原点，长 w 深 d，圆角 r） */
function roundedRect(w: number, d: number, r: number): THREE.Shape {
  const x = w / 2;
  const y = d / 2;
  const rr = Math.min(Math.max(r, 0), Math.min(x, y));
  const s = new THREE.Shape();
  s.moveTo(-x + rr, -y);
  s.lineTo(x - rr, -y);
  s.quadraticCurveTo(x, -y, x, -y + rr);
  s.lineTo(x, y - rr);
  s.quadraticCurveTo(x, y, x - rr, y);
  s.lineTo(-x + rr, y);
  s.quadraticCurveTo(-x, y, -x, y - rr);
  s.lineTo(-x, -y + rr);
  s.quadraticCurveTo(-x, -y, -x + rr, -y);
  return s;
}

function polygon(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/** 绕质心把多边形放大到 f 倍：三角片/五角星的描边就这么外扩，尖角不会钝掉 */
function scaledPts(pts: [number, number][], f: number): [number, number][] {
  const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
  const cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f] as [number, number]);
}

/** 框的几何按尺寸归档缓存（1mm 一档）。用户能随意改垫子长宽，缓存必须封顶，否则一路加下去不释放 */
const FRAME_MAX = 96;
const frameCache = new Map<string, THREE.BufferGeometry>();

function frameGeometry(out: Outline): THREE.BufferGeometry {
  const pts = out.pts?.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number]);
  const w = Math.round(out.w * 1000) / 1000;
  const d = Math.round(out.d * 1000) / 1000;
  const r = Math.round(out.r * 1000) / 1000;
  const { g, t } = frameMargin(Math.max(w, d));
  const key = pts ? `p${g}|${t}|${pts.map((p) => p.join(",")).join(";")}` : `r${w}x${d}c${r}|${g}|${t}`;
  const hit = frameCache.get(key);
  if (hit) {
    // 命中也要挪到队尾：正在用的框绝不能被挤出缓存（挤掉等于当场把显示中的几何 dispose 掉）
    frameCache.delete(key);
    frameCache.set(key, hit);
    return hit;
  }
  let geo: THREE.BufferGeometry;
  if (pts) {
    const R = pts.reduce((n, p) => n + Math.hypot(p[0], p[1]), 0) / pts.length;
    const outer = polygon(scaledPts(pts, 1 + (g + t) / R));
    outer.holes.push(polygon(scaledPts(pts, 1 + g / R)));
    geo = new THREE.ShapeGeometry(outer);
  } else if (r >= Math.min(w, d) / 2 - 0.0005 && Math.abs(w - d) < 0.001) {
    geo = new THREE.RingGeometry(w / 2 + g, w / 2 + g + t, 44);
  } else {
    const outer = roundedRect(w + 2 * (g + t), d + 2 * (g + t), r + g + t);
    outer.holes.push(roundedRect(w + 2 * g, d + 2 * g, r + g));
    geo = new THREE.ShapeGeometry(outer, 10);
  }
  if (frameCache.size >= FRAME_MAX) {
    const oldest = frameCache.keys().next().value;
    if (oldest !== undefined) {
      frameCache.get(oldest)?.dispose();
      frameCache.delete(oldest);
    }
  }
  frameCache.set(key, geo);
  return geo;
}

let frameMaterial: THREE.MeshBasicMaterial | null = null;

/** 选中框：照物件自己的脚形描一圈（形状来自 catalog 的 outlineOf），不再一律套圆。
 *  几何建在 XY 平面上，这里躺平贴桌，调用方只管摆位置与按 rot 转 */
export function selectionFrame(out: Outline): THREE.Mesh {
  frameMaterial ??= new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(frameGeometry(out), frameMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 5;
  return mesh;
}

let ghostMaterial: THREE.MeshBasicMaterial | null = null;

/** 锁着的物件脚下投影与手牌落点预览共用：形状与选中框同源，只是淡一档 */
export function landingFrame(out: Outline): THREE.Mesh {
  ghostMaterial ??= new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(frameGeometry(out), ghostMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 4;
  return mesh;
}

/** 别人正在拖的那张牌：按玩家颜色描一圈，材质独立一份，好让淡出与回收跟着这圈走 */
export function peerRing(color: number): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const mesh = new THREE.Mesh(
    geo("ring", () => new THREE.RingGeometry(RING_R * 0.79, RING_R, 40)),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 4;
  return mesh;
}
