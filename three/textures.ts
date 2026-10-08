/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import * as THREE from "three";
import { SUIT_GLYPH, BOOK_SPREAD, CARD_RATIO_MAX, CARD_RATIO_MIN, HEX_W, LINES_BORDER, TRACK_PITCH, boardSize, hexPos, suitColor } from "@/game/catalog";
import { hasImage, imageOf } from "@/game/images";
import { tabletHost } from "@/game/tablet";
import type { BoardSpec, CardSpec, GameObject } from "@/game/types";

const cache = new Map<string, THREE.Texture>();

/** 打印类贴图的各向异性：由场景在创建渲染器时告知实际上限 */
let aniso = 8;
export function setTextureAnisotropy(value: number): void {
  aniso = Math.max(4, Math.min(16, Math.round(value) || 8));
}

/**
 * 印刷品的放大倍数：卡面、骰子、标记、标牌这些「字越少越要看清」的贴图按这个倍数加密画布。
 * 版式仍按原始尺寸绘制（ctx 上做了整体缩放），所以只改一个数就能整体变清晰或变省。
 * 倍数只进到带 @倍数 的缓存键里，换档时把那批贴图丢掉重建，桌面木纹之类的大图不受影响。
 */
let printScale = 1.5;
export function printScaleOf(): number {
  return printScale;
}

/** 换档后是否真的变了：调用方据此决定要不要重建场景里的贴图 */
export function setPrintScale(next: number): boolean {
  const v = Math.max(1, Math.min(3, next));
  if (Math.abs(v - printScale) < 0.01) return false;
  printScale = v;
  for (const t of calcKeyCache.values()) t.dispose();
  calcKeyCache.clear();
  for (const [id, t] of [...cache]) {
    if (!id.includes("@")) continue;
    cache.delete(id);
    t.dispose();
  }
  return true;
}

/**
 * 高清档的门槛：画布倍率到 3 才算「超清」，此时才把导入原图的像素真接下来画。
 * 低档维持原样，免得一整桌大图把显存吃穿——放大到屏幕用不上的像素纯属浪费。
 */
const SHARP_MIN_SCALE = 3;
/** 一张卡面画布的绝对上限：超过这个倍数收益已经看不出来，代价却是几兆显存 */
const FACE_SCALE_CAP = 4;

/** 当前是否处于「按原图分辨率出画布」的超清档 */
export function sharpFaces(): boolean {
  return printScale >= SHARP_MIN_SCALE;
}

/** 卡面画布的倍率：超清档下跟着原图走，小图不硬撑（放大只会更糊），大图最多给到上限 */
function faceScale(custom: string, size: { w: number; h: number }): number {
  const el = custom ? imageOf(custom) : undefined;
  if (!el?.naturalWidth || !sharpFaces()) return printScale;
  const want = Math.max(el.naturalWidth / size.w, el.naturalHeight / size.h);
  return Math.round(Math.min(FACE_SCALE_CAP, Math.max(printScale, want)) * 2) / 2;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  // 缩小一张大图时按高质量重采样，默认的 low 会把卡面细节抹平
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function tex(key: string, w: number, h: number, draw: Draw, opts: { srgb?: boolean; repeat?: [number, number]; scale?: number } = {}): THREE.Texture {
  const sc = opts.scale ?? 1;
  const id = `${key}|${w}x${h}|${opts.repeat?.join(",") ?? ""}${sc !== 1 ? `@${sc}` : ""}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const [c, ctx] = canvas(Math.max(1, Math.round(w * sc)), Math.max(1, Math.round(h * sc)));
  if (sc !== 1) ctx.setTransform(sc, 0, 0, sc, 0, 0);
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.needsUpdate = true;
  cache.set(id, t);
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, alpha: number) {
  for (let i = 0; i < amount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 2.2;
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 木纹桌面 */
export function woodTexture(): THREE.Texture {
  return tex("wood", 1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#6b4a2f";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 190; i++) {
      const y = Math.random() * h;
      const amp = 6 + Math.random() * 22;
      const light = Math.random();
      ctx.strokeStyle = light > 0.62 ? `rgba(160,116,74,${0.05 + Math.random() * 0.12})` : `rgba(52,32,18,${0.05 + Math.random() * 0.14})`;
      ctx.lineWidth = 0.8 + Math.random() * 3.4;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const yy = y + Math.sin((x / w) * Math.PI * (1 + Math.random()) + i) * amp * 0.35;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (let k = 0; k < 7; k++) {
      const cy = Math.random() * h;
      ctx.strokeStyle = "rgba(38,22,12,0.5)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      for (let x = 0; x <= w; x += 10) ctx.lineTo(x, cy + Math.sin(x * 0.02 + k) * 5);
      ctx.stroke();
    }
    noise(ctx, w, h, 2600, 0.035);
  }, { repeat: [2, 1.4] });
}

export function woodRoughness(): THREE.Texture {
  return tex("woodR", 512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 5200, 0.12);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(200,200,200,${0.05 + Math.random() * 0.1})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (Math.random() - 0.5) * 20);
      ctx.stroke();
    }
  }, { srgb: false, repeat: [2, 1.4] });
}

/** 桌布呢面 */
export function feltTexture(color = "#1f4d3a"): THREE.Texture {
  return tex(`felt:${color}`, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},0.045)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
  }, { repeat: [6, 4] });
}

/**
 * 桌面绒布：整块不平铺，中间被灯打亮、四角压暗，边缘再走一圈缝线。
 * 之前是纯色噪声平铺六遍，看着就是一张贴图；有明暗和缝线才像一张桌子。
 */
export function tableFeltTexture(color = "#21402f"): THREE.Texture {
  return tex(`felt:table:${color}`, 1024, 700, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},0.05)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.7, 1.7);
    }
    const light = ctx.createRadialGradient(w / 2, h * 0.44, h * 0.08, w / 2, h * 0.5, h * 1.05);
    light.addColorStop(0, "rgba(255,248,225,0.16)");
    light.addColorStop(0.5, "rgba(255,244,215,0.045)");
    light.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);
    // 离边 2.4% 处一圈缝线：压深一点底衬，再叠一段段亮线
    const m = Math.round(w * 0.024);
    const r = Math.round(w * 0.012);
    ctx.lineCap = "round";
    const stitch: { style: string; width: number; offset: number }[] = [
      { style: "rgba(0,0,0,0.42)", width: 3.4, offset: 0 },
      { style: "rgba(226,212,178,0.6)", width: 1.7, offset: 4 },
    ];
    for (const s of stitch) {
      ctx.strokeStyle = s.style;
      ctx.lineWidth = s.width;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = s.offset;
      roundRectPath(ctx, m, m, w - m * 2, h - m * 2, r);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const BOARD_THEMES: Record<string, { base: string; a: string; b: string; line: string; edge: string; text: string }> = {
  checker: { base: "#2c2a26", a: "#e6dcc3", b: "#5d4632", line: "#1b1712", edge: "#7a5334", text: "#e6dcc3" },
  wood: { base: "#c9974f", a: "#c9974f", b: "#b8863f", line: "#241a10", edge: "#8a5a25", text: "#3b2a16" },
  sand: { base: "#b9a37a", a: "#c3ae86", b: "#a99268", line: "#6d5a3c", edge: "#6b4a2f", text: "#4a3a22" },
  ring: { base: "#173a2d", a: "#1d4a38", b: "#123328", line: "#e8e2cf", edge: "#7a5334", text: "#f2efe6" },
  candy: { base: "#20304a", a: "#d94f4f", b: "#2f8f6f", line: "#f2efe6", edge: "#7a5334", text: "#ffffff" },
  felt: { base: "#1f4d3a", a: "#1f4d3a", b: "#1a4232", line: "#0f2a20", edge: "#7a5334", text: "#e8f2ea" },
  slate: { base: "#3d4750", a: "#4a5560", b: "#3f4a54", line: "#242b31", edge: "#7a5334", text: "#e8eef2" },
  xiangqi: { base: "#dcbb84", a: "#dcbb84", b: "#d2b079", line: "#3d2a16", edge: "#8a5a25", text: "#4a2f1b" },
};

/** 一条直线：交叉线棋盘的每一根线都要单独起笔，包一下省得各处重复 beginPath */
function seg(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * 木纹：几道深浅相间的横向长纹。交叉线盘只有一整块底色，不描纹路就是一张橘色色卡。
 * 用定死的伪随机数，同一块盘每次画出来一模一样。
 */
function woodGrain(ctx: CanvasRenderingContext2D, w: number, h: number, dark: string) {
  let s = 0x9e3779b9;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bands = Math.max(7, Math.round(h / 26));
  ctx.save();
  ctx.strokeStyle = dark;
  for (let i = 0; i < bands; i++) {
    const y0 = ((i + rnd() * 0.7) * h) / bands;
    ctx.globalAlpha = 0.05 + rnd() * 0.07;
    ctx.lineWidth = (h / bands) * (0.22 + rnd() * 0.5);
    ctx.beginPath();
    const step = Math.max(8, w / 28);
    for (let x = 0; x <= w; x += step) {
      const y = y0 + Math.sin((x / w) * 6.283 * 1.7 + i * 1.3) * (h / bands) * 0.26;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 象棋盘的专属装饰：九宫的两条斜线、炮位与兵位的十字花，还有河口的楚河漢界。
 * 只吃「第 i 条线在哪」这两个函数，所以线阵怎么缩放都和它对得上。
 */
function xiangqiMarks(
  ctx: CanvasRenderingContext2D,
  th: { line: string; text: string },
  lx: (i: number) => number,
  ly: (j: number) => number,
): void {
  const cell = lx(1) - lx(0);
  ctx.strokeStyle = th.line;
  ctx.lineWidth = Math.max(1.2, cell * 0.03);
  for (const [near, far] of [[0, 2], [7, 9]] as const) {
    seg(ctx, lx(3), ly(near), lx(5), ly(far));
    seg(ctx, lx(5), ly(near), lx(3), ly(far));
  }
  const gap = cell * 0.16;
  const arm = cell * 0.27;
  const flower = (i: number, j: number) => {
    const x = lx(i);
    const y = ly(j);
    ctx.beginPath();
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      // 边线上的兵只有朝内的一侧画得出花
      if (dx < 0 && i === 0) continue;
      if (dx > 0 && i === 8) continue;
      ctx.moveTo(x + dx * gap, y + dy * (gap + arm));
      ctx.lineTo(x + dx * gap, y + dy * gap);
      ctx.lineTo(x + dx * (gap + arm), y + dy * gap);
    }
    ctx.stroke();
  };
  for (const i of [1, 7]) { flower(i, 2); flower(i, 7); }
  for (const i of [0, 2, 4, 6, 8]) { flower(i, 3); flower(i, 6); }
  const mid = (ly(4) + ly(5)) / 2;
  const size = Math.round((ly(5) - ly(4)) * 0.7);
  ctx.fillStyle = th.text;
  ctx.font = `700 ${size}px ui-serif, KaiTi, STKaiti, "Songti SC", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("楚", lx(1.55), mid);
  ctx.fillText("河", lx(2.6), mid);
  ctx.fillText("漢", lx(5.4), mid);
  ctx.fillText("界", lx(6.45), mid);
  ctx.textBaseline = "alphabetic";
}

/** 这个资源 key 是要用但还没到手：该画空心轮廓，而不是假装它是一张印好的空白牌 */
function pendingOf(img: string | undefined, custom: string): boolean {
  return !!img && !custom;
}

/**
 * 缺资源的占位画法：一圈虚线轮廓加一行小字，中间是空的。
 * 之所以不能沿用普通版式——一张没图的自上传牌会画成「空白卡」，看上去就像桌面本来那样，
 * 谁都不会想到它只是在等资源。轮廓一眼就知道是空的。
 */
function outline(ctx: CanvasRenderingContext2D, w: number, h: number, label: string) {
  ctx.fillStyle = "rgba(20,20,24,0.42)";
  ctx.fillRect(0, 0, w, h);
  const inset = Math.max(5, Math.round(Math.min(w, h) * 0.045));
  const dash = Math.max(7, Math.round(Math.min(w, h) * 0.055));
  ctx.save();
  ctx.setLineDash([dash, Math.round(dash * 0.66)]);
  ctx.strokeStyle = "rgba(255,255,255,0.62)";
  ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.016));
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.globalAlpha = 0.26;
  ctx.beginPath();
  ctx.moveTo(inset, inset);
  ctx.lineTo(w - inset, h - inset);
  ctx.moveTo(w - inset, inset);
  ctx.lineTo(inset, h - inset);
  ctx.stroke();
  ctx.restore();
  const box = Math.min(w, h) - inset * 2;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.textAlign = "center";
  ctx.font = `600 ${Math.round(Math.max(9, Math.min(box * 0.16, 30)))}px ${CJK}`;
  ctx.fillText(label, w / 2, h / 2 + box * 0.05);
}

export function boardTexture(spec: BoardSpec, mesh = true): THREE.Texture {
  const size = boardSize(spec);
  const long = Math.max(size.w, size.d);
  const res = Math.min(2048, Math.max(512, Math.round(long * 900 / 64) * 64));
  const w = Math.round(res * (size.w / long));
  const h = Math.round(res * (size.d / long));
  if (spec.layout === "mat") {
    // 键里必须带上「图到没到」：桌垫的图是后到的，键不变就会一直端着这张占位贴图不放
    const ready = spec.img && hasImage(spec.img) ? spec.img : "";
    return tex(`board:mat:${ready}${pendingOf(spec.img, ready) ? "?" : ""}`, w, h, (ctx) => {
      ctx.fillStyle = "#2b2b2e";
      ctx.fillRect(0, 0, w, h);
      const el = ready ? imageOf(ready) : undefined;
      if (el) {
        const scale = Math.max(w / el.naturalWidth, h / el.naturalHeight);
        const dw = el.naturalWidth * scale;
        const dh = el.naturalHeight * scale;
        ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else if (pendingOf(spec.img, ready)) {
        outline(ctx, w, h, "资源载入中");
      } else {
        ctx.fillStyle = "#4a4a52";
        ctx.fillRect(0, 0, w, h);
        outline(ctx, w, h, "尚未选图");
      }
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = Math.max(2, w * 0.008);
      ctx.strokeRect(0, 0, w, h);
    });
  }
  const th = BOARD_THEMES[spec.theme] ?? BOARD_THEMES.checker;
  // 网格线一关就是一块素面：格心还在（吸附、锁定照旧生效），只是眼睛看不见参考线
  if (!mesh) {
    return tex(`board:bare:${spec.layout}:${spec.cols}:${spec.rows}:${spec.cell}:${spec.theme}`, w, h, (ctx) => {
      ctx.fillStyle = th.base;
      ctx.fillRect(0, 0, w, h);
      if (spec.layout === "lines") woodGrain(ctx, w, h, th.edge);
      ctx.strokeStyle = th.edge;
      ctx.lineWidth = Math.max(2, w * 0.012);
      ctx.strokeRect(0, 0, w, h);
      noise(ctx, w, h, Math.round(w * h / 900), 0.03);
    });
  }
  return tex(`board:${spec.layout}:${spec.cols}:${spec.rows}:${spec.cell}:${spec.theme}`, w, h, (ctx) => {
    ctx.fillStyle = th.base;
    ctx.fillRect(0, 0, w, h);
    if (spec.layout === "grid") {
      const cw = w / spec.cols;
      const ch = h / spec.rows;
      for (let r = 0; r < spec.rows; r++) {
        for (let c = 0; c < spec.cols; c++) {
          const dark = (r + c) % 2 === 1;
          if (spec.theme === "sand" || spec.theme === "felt") {
            ctx.fillStyle = dark ? th.b : th.a;
            ctx.fillRect(c * cw, r * ch, cw, ch);
            continue;
          }
          ctx.fillStyle = dark ? th.b : th.a;
          ctx.fillRect(c * cw, r * ch, cw, ch);
        }
      }
      ctx.strokeStyle = th.line;
      ctx.lineWidth = Math.max(1, w * 0.0022);
      for (let i = 0; i <= spec.cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cw, 0);
        ctx.lineTo(i * cw, h);
        ctx.stroke();
      }
      for (let i = 0; i <= spec.rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * ch);
        ctx.lineTo(w, i * ch);
        ctx.stroke();
      }
      // 格坐标：国际象棋按谱走子要靠 a—h / 1—8，战棋报点「C3 进攻」也靠它。
      // 字样得压在自己那一格的底色上，所以黑白格反着取色，不然浅色格上等于写了白字
      if (spec.theme === "checker" || spec.theme === "sand") {
        const ink = (c: number, r: number) => (spec.theme === "checker" ? ((c + r) % 2 === 1 ? th.a : th.b) : th.line);
        ctx.font = `600 ${Math.round(ch * 0.26)}px ui-serif, Georgia, serif`;
        ctx.textAlign = "center";
        for (let c = 0; c < spec.cols; c++) {
          ctx.fillStyle = ink(c, spec.rows - 1);
          ctx.fillText("abcdefghij"[c], (c + 0.5) * cw, h - ch * 0.12);
        }
        for (let r = 0; r < spec.rows; r++) {
          ctx.fillStyle = ink(0, r);
          ctx.fillText(String(spec.rows - r), cw * 0.42, (r + 0.66) * ch);
        }
      }
    } else if (spec.layout === "lines") {
      // 画线和吸附共用 LINES_BORDER：一格几个像素、第 i 条线在哪，两边同一套算法，
      // 各算一套的话棋子会压在线上而不是坐在交点上
      const per = w / (spec.cols - 1 + LINES_BORDER * 2);
      const perY = h / (spec.rows - 1 + LINES_BORDER * 2);
      const lx = (i: number) => per * (LINES_BORDER + i);
      const ly = (j: number) => perY * (LINES_BORDER + j);
      const xq = spec.theme === "xiangqi" && spec.cols === 9 && spec.rows === 10;
      woodGrain(ctx, w, h, th.edge);
      ctx.strokeStyle = th.line;
      ctx.lineWidth = Math.max(1.2, per * 0.03);
      for (let i = 0; i < spec.cols; i++) {
        if (xq && i > 0 && i < spec.cols - 1) {
          // 除了两条边线，中间七条竖线到河口就断，河才通得过去
          seg(ctx, lx(i), ly(0), lx(i), ly(4));
          seg(ctx, lx(i), ly(5), lx(i), ly(spec.rows - 1));
        } else seg(ctx, lx(i), ly(0), lx(i), ly(spec.rows - 1));
      }
      for (let j = 0; j < spec.rows; j++) seg(ctx, lx(0), ly(j), lx(spec.cols - 1), ly(j));
      // 最外圈压粗一道：棋盘的边线天生就该比里面的线重，不然整盘看着像张灰网
      ctx.lineWidth = Math.max(1.6, per * 0.055);
      ctx.strokeRect(lx(0), ly(0), lx(spec.cols - 1) - lx(0), ly(spec.rows - 1) - ly(0));
      ctx.lineWidth = Math.max(1.2, per * 0.03);
      if (xq) xiangqiMarks(ctx, th, lx, ly);
      ctx.fillStyle = th.line;
      // 象棋盘没有星位，中间那颗点会正好糊在河口上
      const stars = xq ? [] : spec.cols === 19 ? [3, 9, 15] : spec.cols === 15 ? [3, 7, 11] : [Math.floor(spec.cols / 2)];
      for (const a of stars) for (const b of stars) {
        ctx.beginPath();
        ctx.arc(lx(a), ly(b), Math.max(2, per * 0.09), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (spec.layout === "ring") {
      // 环形跑道：外圈一格一格的赛道 + 中间一整块空地（骰子、牌堆都往这里丢）
      const per = spec.cols * 4 - 4;
      const cw = w / spec.cols;
      const ch = h / spec.rows;
      ctx.fillStyle = th.b;
      ctx.fillRect(0, 0, w, h);
      // 内沿正好让开一格，赛道就是一圈单格宽；留 1.6 格会把最外排的格子吃掉半格
      ctx.fillStyle = th.a;
      ctx.fillRect(cw, ch, w - cw * 2, h - ch * 2);
      ctx.strokeStyle = th.line;
      ctx.lineWidth = Math.max(1, w * 0.002);
      const cellRect = (i: number) => {
        const side = Math.floor(i / (spec.cols - 1));
        const o = i % (spec.cols - 1);
        if (side === 0) return [o * cw, 0, cw, ch];
        if (side === 1) return [w - cw, o * ch, cw, ch];
        if (side === 2) return [w - (o + 1) * cw, h - ch, cw, ch];
        return [0, h - (o + 1) * ch, cw, ch];
      };
      for (let i = 0; i < per; i++) {
        const [x, y, cw2, ch2] = cellRect(i);
        // 第 0 格是起点，涂亮一格并写上字，跑一圈回来眼睛找得到
        ctx.fillStyle = i === 0 ? "rgba(255,235,140,0.5)" : i % 2 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.12)";
        ctx.fillRect(x, y, cw2, ch2);
        ctx.strokeRect(x, y, cw2, ch2);
        ctx.save();
        ctx.translate(x + cw2 / 2, y + ch2 / 2);
        ctx.rotate(sideRot(i, spec, 0));
        ctx.fillStyle = th.text;
        ctx.textAlign = "center";
        ctx.font = i === 0
          ? `700 ${Math.round(cw * 0.2)}px ui-sans-serif, system-ui, sans-serif`
          : `${Math.round(cw * 0.24)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(i === 0 ? "起点" : String(i + 1), 0, cw * 0.08);
        ctx.restore();
      }
      ctx.strokeStyle = th.line;
      ctx.lineWidth = Math.max(1.5, w * 0.0035);
      ctx.strokeRect(cw, ch, w - cw * 2, h - ch * 2);
    } else {
      // hex：尖顶蜂窝。六边形网格不是二分图，所以按 axial 坐标三色的轮转上色才不撞色
      const px = res / long;
      const R = spec.cell * px;
      const tints = [th.a, th.b, shade(th.a, 0.09)];
      ctx.strokeStyle = th.line;
      ctx.lineWidth = Math.max(1, w * 0.0018);
      for (let row = 0; row < spec.rows; row++) {
        for (let col = 0; col < spec.cols; col++) {
          const at = hexPos(spec, col, row);
          const cx = w / 2 + at.x * px;
          const cy = h / 2 + at.z * px;
          const q = col - (row - (row & 1)) / 2;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = ((60 * k - 90) * Math.PI) / 180;
            const vx = cx + R * Math.cos(a);
            const vy = cy + R * Math.sin(a);
            if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
          }
          ctx.closePath();
          ctx.fillStyle = tints[((q - row) % 3 + 3) % 3];
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = th.edge;
    ctx.lineWidth = Math.max(2, w * 0.012);
    ctx.strokeRect(0, 0, w, h);
    noise(ctx, w, h, Math.round(w * h / 900), 0.03);
  });
}

function sideRot(i: number, spec: BoardSpec, _o: number): number {
  const side = Math.floor(i / (spec.cols - 1)) % 4;
  return [0, Math.PI / 2, Math.PI, -Math.PI / 2][side];
}

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.26, 0.26], [0.74, 0.74]],
  3: [[0.24, 0.24], [0.5, 0.5], [0.76, 0.76]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.28, 0.22], [0.28, 0.5], [0.28, 0.78], [0.72, 0.22], [0.72, 0.5], [0.72, 0.78]],
};

/** 六个面，顺序与 BoxGeometry 材质索引一致：+x -x +y -y +z -z（对面之和为 7） */
export const DIE_FACE_VALUES = [3, 4, 1, 6, 2, 5];

export function dieNormal(value: number): THREE.Vector3 {
  const i = DIE_FACE_VALUES.indexOf(value);
  const n = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)][i < 0 ? 2 : i];
  return n.clone();
}

export function dieFaceTextures(color: string): THREE.Texture[] {
  return DIE_FACE_VALUES.map((v) => tex(`die:${v}:${color}`, 256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, shade(color, 0.22));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.24));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = v > 3 ? "#f7f3ea" : "#1d1a17";
    for (const [px, py] of PIP_LAYOUT[v] ?? []) {
      ctx.beginPath();
      ctx.arc(px * w, py * h, w * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { scale: printScale }));
}

/** d4 的四个面各一张数字图，读数以朝下一面的数字为准 */
export function d4FaceTextures(color: string): THREE.Texture[] {
  return [1, 2, 3, 4].map((v) => tex(`d4:${v}:${color}`, 256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(color, 0.26));
    g.addColorStop(1, shade(color, -0.2));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.04);
    ctx.lineTo(w * 0.98, h * 0.96);
    ctx.lineTo(w * 0.02, h * 0.96);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#f7f3ea";
    ctx.font = `700 74px ui-serif, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText(String(v), w / 2, h * 0.82);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.font = `600 40px ui-serif, Georgia, serif`;
    ctx.fillText(String(v), w / 2, h * 0.3);
  }, { scale: printScale }));
}

/** 卡面用的中文字体栈：Windows/安卓/苹果各给一个，免得退化成方框 */
const CJK = `ui-sans-serif, system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;

/** 按行断字排版，超出 maxLines 的行收成省略号：卡面只有 314 像素高，写不下就不写 */
function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number, align: CanvasTextAlign) {
  ctx.textAlign = align;
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (line && ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > shown.length) {
    let tail = shown[shown.length - 1];
    while (tail.length > 1 && ctx.measureText(`${tail}…`).width > maxW) tail = tail.slice(0, -1);
    shown[shown.length - 1] = `${tail}…`;
  }
  shown.forEach((s, i) => ctx.fillText(s, x, y + i * lh));
  return shown.length;
}

/** 左上角与右下角的点数角标：扑克这类游戏牌都靠它认牌 */
function cornerPip(ctx: CanvasRenderingContext2D, rank: string, suit: NonNullable<CardSpec["suit"]> | undefined, ink: string, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.font = `700 32px ${CJK}`;
  ctx.fillText(rank, 16, 40);
  if (suit) {
    ctx.font = `26px ${CJK}`;
    ctx.fillText(SUIT_GLYPH[suit], 16, 70);
  }
  ctx.translate(w - 16, h - 16);
  ctx.rotate(Math.PI);
  ctx.textAlign = "left";
  ctx.font = `700 32px ${CJK}`;
  ctx.fillText(rank, 0, 24);
  if (suit) {
    ctx.font = `26px ${CJK}`;
    ctx.fillText(SUIT_GLYPH[suit], 0, 54);
  }
  ctx.restore();
}

/**
 * 一道横过整张牌的正弦浪：《潮汐》的招牌纹样，卡面卡背都用它。
 * 取色与线宽由调用方设好，这里只管铺满宽度（两头各多画一个周期，缩放到边缘不断）。
 */
function waveBand(ctx: CanvasRenderingContext2D, w: number, y: number, amp: number, wl: number) {
  ctx.beginPath();
  for (let x = -wl; x < w + wl; x += wl) {
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + wl * 0.25, y - amp, x + wl * 0.5, y);
    ctx.quadraticCurveTo(x + wl * 0.75, y + amp, x + wl, y);
  }
  ctx.stroke();
}

/** 潮汐牌的角标：单字花色在上、数字在下，右下角转 180° 再来一遍。潮珠没有数字，只印那个字 */
function tideCorner(ctx: CanvasRenderingContext2D, glyph: string, rank: string, ink: string, w: number, h: number) {
  const draw = (x: number, y: number) => {
    ctx.font = `600 22px ${CJK}`;
    ctx.fillText(glyph, x, y);
    if (rank) {
      ctx.font = `700 30px ${CJK}`;
      ctx.fillText(rank, x, y + 30);
    }
  };
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  draw(14, 34);
  ctx.translate(w - 14, h - 14);
  ctx.rotate(Math.PI);
  draw(0, 20);
  ctx.restore();
}

/** 卡面画布的逻辑尺寸：所有版式都按这套坐标画，实际像素由 printScale 决定 */
export const CARD_FACE_W = 220;
export const CARD_FACE_H = 314;

/**
 * 画布形状跟着牌形走：带图的牌按图的比例出画布，图才不会被拉扁或被裁掉一块。
 * 面积按标准牌守恒（220x314），所以横过来的牌只是转了个方向，像素总量不暴涨。
 */
export function cardCanvasSize(ratio?: number): { w: number; h: number } {
  const r = typeof ratio === "number" && Number.isFinite(ratio)
    ? Math.min(CARD_RATIO_MAX, Math.max(CARD_RATIO_MIN, ratio))
    : CARD_FACE_W / CARD_FACE_H;
  const w = Math.round(Math.sqrt(CARD_FACE_W * CARD_FACE_H * r));
  return { w, h: Math.round(w / r) };
}

export function cardFaceTexture(card: CardSpec | undefined, color: string): THREE.Texture {
  const custom = card?.img && hasImage(card.img) ? card.img : "";
  const size = cardCanvasSize(card?.ratio);
  const key = `face:${card?.back}:${card?.rank}:${card?.suit}:${card?.label}:${card?.cat}:${card?.art}:${card?.text ?? ""}:${color}:${custom}${pendingOf(card?.img, custom) ? "?" : ""}${card?.borderless ? "B" : ""}`;
  return tex(key, size.w, size.h, cardFaceDraw(card, color, custom), { scale: faceScale(custom, size) });
}

/** 高清细看用的 PNG：同一套版式按 px 宽度画一遍，不进纹理缓存 */
export function cardFaceImage(card: CardSpec | undefined, color: string, px = 660): string {
  return cardImage(cardFaceDraw(card, color, card?.img && hasImage(card.img) ? card.img : ""), px, cardCanvasSize(card?.ratio));
}

function cardImage(draw: Draw, px: number, size = { w: CARD_FACE_W, h: CARD_FACE_H }): string {
  const [c, ctx] = canvas(px, Math.round((px * size.h) / size.w));
  const sc = px / size.w;
  ctx.setTransform(sc, 0, 0, sc, 0, 0);
  draw(ctx, size.w, size.h);
  return c.toDataURL("image/png");
}

/**
 * 手牌条那种「一屏几十张牌各自要一张卡面」的场合：同一张牌面只画一次，之后取缓存。
 * 版式与桌面网格共用 cardFaceDraw，所以手里看到的和桌上看到的必然是同一张牌。
 */
const faceCache = new Map<string, string>();
const FACE_CACHE_MAX = 160;

export function cardFaceCached(card: CardSpec | undefined, color: string, px: number): string {
  const ready = card?.img && hasImage(card.img) ? card.img : "";
  const size = cardCanvasSize(card?.ratio);
  const sig = `${card?.back}|${card?.rank}|${card?.suit}|${card?.label}|${card?.cat}|${card?.art}|${card?.text ?? ""}|${color}|${ready ? card?.img : ""}${pendingOf(card?.img, ready) ? "?" : ""}${card?.borderless ? "B" : ""}@${size.w}x${size.h}/${px}`;
  const hit = faceCache.get(sig);
  if (hit) return hit;
  const out = cardImage(cardFaceDraw(card, color, ready), px, size);
  // 一手牌翻来覆去就是那几十张面，攒满了才丢最旧的一张，免得长局把内存吃掉
  if (faceCache.size > FACE_CACHE_MAX) faceCache.delete(faceCache.keys().next().value ?? "");
  faceCache.set(sig, out);
  return out;
}

/** 卡背同理：整叠牌共用一张背，画一次就够 */
const backCache = new Map<string, string>();

export function cardBackCached(back: string, color: string, img: string | undefined, px: number, ratio?: number): string {
  const ready = img && hasImage(img) ? img : "";
  const size = cardCanvasSize(ratio);
  const sig = `${back}|${color}|${ready ? img : ""}${pendingOf(img, ready) ? "?" : ""}@${size.w}x${size.h}/${px}`;
  const hit = backCache.get(sig);
  if (hit) return hit;
  const out = cardImage(cardBackDraw(back, color, ready, pendingOf(img, ready)), px, size);
  if (backCache.size > 60) backCache.delete(backCache.keys().next().value ?? "");
  backCache.set(sig, out);
  return out;
}

function cardFaceDraw(card: CardSpec | undefined, color: string, custom: string): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#f7f4ec";
    ctx.fillRect(0, 0, w, h);
    if (custom) {
      const el = imageOf(custom)!;
      // 无边框：图铺满整张牌，一圈白边和描边都不留，画出来就是这张图本身
      const box = card?.borderless ? { x: 0, y: 0, w, h } : { x: 9, y: 9, w: w - 18, h: h - 18 };
      // 按比例整张放下，不再裁：以前按 cover 铺，图一非标准比例就把牌的头尾切掉一块
      const scale = Math.min(box.w / el.naturalWidth, box.h / el.naturalHeight);
      const dw = el.naturalWidth * scale;
      const dh = el.naturalHeight * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      ctx.drawImage(el, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
      ctx.restore();
      if (card?.borderless) return;
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      return;
    }
    // 自带卡面还没到手：只留空心轮廓，别画成一张印好的空白牌骗人
    if (pendingOf(card?.img, custom)) {
      outline(ctx, w, h, "卡面载入中");
      return;
    }
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    const accent = card?.color ? shade(card.color, -0.3) : shade(color, -0.4);
    const ink = card?.suit ? suitColor(card.suit) : "#2a2418";

    // 〇·潮：《潮汐》—— 奶白纸、一道花色潮色底、中央大数字，靠颜色和数字两条腿认牌
    if (card?.back === "tide") {
      const c = card.color || color;
      const glyph = card.art || "";
      const num = card.rank || "";
      const name = card.cat || card.label || "";
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(7, h * 0.58, w - 14, h * 0.42 - 7);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.4;
      ctx.globalAlpha = 0.42;
      for (let i = 0; i < 3; i++) waveBand(ctx, w, h * 0.66 + i * 22, 5, 34);
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      if (num) {
        ctx.fillStyle = c;
        ctx.font = `700 ${num.length > 1 ? 92 : 116}px ${CJK}`;
        ctx.fillText(num, w / 2, h * 0.44);
      } else {
        // 潮珠：没有数字，画一枚带高光的珠子当牌面
        const r = Math.min(w, h) * 0.17;
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.34, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = c;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.34, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(w / 2 - r * 0.28, h * 0.34 - r * 0.3, r * 0.42, Math.PI * 0.75, Math.PI * 1.45);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(28,24,16,0.72)";
      ctx.font = `600 24px ${CJK}`;
      ctx.fillText(name, w / 2, h * 0.53);
      tideCorner(ctx, glyph, num, c, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      return;
    }

    // 一：纯花色牌（扑克）——角标 + 正中一个大 pip，不抢版面
    if (card?.rank && !card.label) {
      const suit = card.suit ?? "s";
      cornerPip(ctx, card.rank, card.suit, ink, w, h);
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.font = `128px ${CJK}`;
      ctx.fillText(SUIT_GLYPH[suit], w / 2, h / 2 + 44);
      ctx.font = `500 15px ${CJK}`;
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillText(card.cat ?? "", w / 2, h - 20);
      return;
    }

    // 二：有点数又有牌名（带效果文字的游戏牌）——角标留在左上，中间给牌名与效果
    if (card?.rank && card.label) {
      cornerPip(ctx, card.rank, card.suit, ink, w, h);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.13;
      ctx.fillRect(58, 92, w - 58, 76);
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.textAlign = "center";
      ctx.font = `700 62px ${CJK}`;
      ctx.fillText(card.art ?? card.label.slice(0, 1), w / 2 + 20, 152);
      ctx.fillStyle = "#241d12";
      ctx.font = `700 30px ${CJK}`;
      ctx.fillText(card.label, w / 2, 200);
      ctx.font = `500 13px ${CJK}`;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillText(card.cat ?? "", w / 2, 220);
      if (card.text) {
        ctx.strokeStyle = "rgba(0,0,0,0.16)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, 230);
        ctx.lineTo(w - 20, 230);
        ctx.stroke();
        ctx.fillStyle = "rgba(24,20,12,0.72)";
        ctx.font = `400 15px ${CJK}`;
        paragraph(ctx, card.text, 20, 250, w - 40, 20, 4, "left");
      }
      return;
    }

    // 三：角色牌与大小王——顶栏写类别，正中一个大字徽记，下面是名字与规则
    const band = card?.cat ? 46 : 0;
    if (band) {
      ctx.fillStyle = accent;
      ctx.fillRect(6, 6, w - 12, band);
      ctx.fillStyle = "rgba(255,253,245,0.94)";
      ctx.font = `600 20px ${CJK}`;
      ctx.textAlign = "left";
      ctx.fillText(card?.cat ?? "", 16, 36);
    }
    ctx.textAlign = "center";
    const glyph = card?.art || (card?.label ?? "").slice(0, 1);
    if (glyph) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.arc(w / 2, band + 84, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = `700 78px ${CJK}`;
      ctx.fillText(glyph, w / 2, band + 112);
    }
    ctx.fillStyle = "#241d12";
    ctx.font = `700 30px ${CJK}`;
    ctx.fillText(card?.label || "空白卡", w / 2, band + 162);
    if (card?.text) {
      ctx.strokeStyle = "rgba(0,0,0,0.16)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, band + 178);
      ctx.lineTo(w - 20, band + 178);
      ctx.stroke();
      ctx.fillStyle = "rgba(24,20,12,0.74)";
      ctx.font = `400 15px ${CJK}`;
      paragraph(ctx, card.text, 20, band + 198, w - 40, 20, 5, "left");
    }
    if (!card?.label && !card?.text) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.font = `500 18px ${CJK}`;
      ctx.fillText(card?.img ? "卡面载入中…" : "空白卡", w / 2, h - 30);
    }
  };
}

export function cardBackTexture(back: string, color: string, img?: string, ratio?: number): THREE.Texture {
  const custom = img && hasImage(img) ? img : "";
  const size = cardCanvasSize(ratio);
  return tex(`back:${back}:${color}:${custom}${pendingOf(img, custom) ? "?" : ""}`, size.w, size.h, cardBackDraw(back, color, custom, pendingOf(img, custom)), { scale: printScale });
}

/** 高清细看用的卡背 PNG：与桌面上那张牌背出自同一份画法 */
export function cardBackImage(back: string, color: string, img?: string, px = 660, ratio?: number): string {
  const custom = img && hasImage(img) ? img : "";
  return cardImage(cardBackDraw(back, color, custom, pendingOf(img, custom)), px, cardCanvasSize(ratio));
}

function cardBackDraw(back: string, color: string, custom: string, pending = false): Draw {
  return (ctx, w, h) => {
    if (pending) {
      ctx.fillStyle = shade(color, -0.35);
      ctx.fillRect(0, 0, w, h);
      outline(ctx, w, h, "卡背载入中");
      return;
    }
    if (custom) {
      const el = imageOf(custom)!;
      // 老桌面上还有没记比例的牌背，按比例摆正就会露角，先铺一层背色再放图
      ctx.fillStyle = shade(color, -0.35);
      ctx.fillRect(0, 0, w, h);
      // 按比例摆正，缺的角留底色：牌形已经跟着图走了，再裁一次就是把图的两头切掉
      const scale = Math.min(w / el.naturalWidth, h / el.naturalHeight);
      const dw = el.naturalWidth * scale;
      const dh = el.naturalHeight * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 4;
      ctx.strokeRect(9, 9, w - 18, h - 18);
      return;
    }
    ctx.fillStyle = shade(color, -0.35);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 4;
    ctx.strokeRect(9, 9, w - 18, h - 18);
    if (back === "plain") {
      ctx.fillStyle = shade(color, 0.1);
      ctx.fillRect(20, 20, w - 40, h - 40);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(16, 16, w - 32, h - 32);
    ctx.clip();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    if (back === "poker") {
      // 扑克：细密经纬格，白边双框
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      for (let i = -h; i < w + h; i += 11) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i + h, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.strokeRect(20, 20, w - 40, h - 40);
      ctx.strokeRect(27, 27, w - 54, h - 54);
    } else if (back === "wolf") {
      // 狼人杀：一层层人字纹，像毛皮
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      for (let y = 10; y < h + 20; y += 18) {
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 22) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + 11, y + 9);
          ctx.lineTo(x + 22, y);
        }
        ctx.stroke();
      }
    } else if (back === "tarot") {
      // 塔罗：金线回纹框 + 满天的星，中心一颗四芒大星，深紫底配金
      ctx.strokeStyle = "rgba(240,214,140,0.42)";
      for (let k = 0; k < 2; k++) ctx.strokeRect(24 + k * 8, 24 + k * 8, w - 48 - k * 16, h - 48 - k * 16);
      const star = (cx: number, cy: number, rOut: number, rIn: number) => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4 - Math.PI / 2;
          const rr = i % 2 === 0 ? rOut : rIn;
          const px = cx + Math.cos(ang) * rr;
          const py = cy + Math.sin(ang) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      };
      ctx.fillStyle = "rgba(240,214,140,0.6)";
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39996;
        const rr = 0.4 * Math.min(w, h) * Math.sqrt((i + 1) / 14);
        star(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr * 1.35, 4.5, 1.6);
      }
      ctx.fillStyle = "rgba(248,226,150,0.95)";
      star(w / 2, h / 2, h * 0.12, h * 0.04);
    } else if (back === "tide") {
      // 潮汐：整张背铺平行的浪，中间一枚浅色圆牌印上「潮汐」二字
      ctx.strokeStyle = "rgba(255,255,255,0.26)";
      ctx.lineWidth = 2;
      for (let i = 0; i < Math.ceil(h / 20) + 1; i++) waveBand(ctx, w, 18 + i * 20, 5, 32);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.fillStyle = "rgba(252,248,238,0.94)";
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.17 + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = shade(color, -0.5);
      ctx.font = `700 ${Math.round(Math.min(w, h) * 0.1)}px ${CJK}`;
      ctx.textAlign = "center";
      ctx.fillText("潮汐", 0, Math.round(Math.min(w, h) * 0.036));
      ctx.restore();
    } else {
      const step = back === "weave" ? 14 : 22;
      ctx.strokeStyle = back === "weave" ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.36)";
      for (let i = -h; i < w + h; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h, h);
        ctx.stroke();
        if (back !== "weave") {
          ctx.beginPath();
          ctx.moveTo(i + h, 0);
          ctx.lineTo(i, h);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    // 塔罗与潮汐在各自的分支里已经画过中心徽记，不再叠那枚通用圆牌
    if (back === "tarot" || back === "tide") return;
    ctx.fillStyle = "rgba(255,253,245,0.86)";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(color, -0.4);
    ctx.font = `700 32px ${CJK}`;
    ctx.textAlign = "center";
    ctx.fillText({ poker: "♠", wolf: "月" }[back] ?? "T", w / 2, h / 2 + 12);
  };
}

export function tokenTopTexture(label: string, color: string, count?: number): THREE.Texture {
  return tex(`tok:${label}:${color}:${count ?? ""}`, 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, shade(color, 0.3));
    g.addColorStop(1, shade(color, -0.16));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    if (count !== undefined) {
      ctx.font = `700 ${count > 999 ? 74 : 104}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(String(count), w / 2, h / 2 + 34);
    } else {
      ctx.font = `600 ${label.length > 4 ? 56 : 88}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(label.slice(0, 6) || "★", w / 2, h / 2 + 30);
    }
  }, { scale: printScale });
}

/** 圆柱侧面环形花纹（筹码条纹） */
export function chipEdgeTexture(color: string): THREE.Texture {
  return tex(`edge:${color}`, 256, 32, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f7f3ea";
    for (let i = 0; i < 6; i++) ctx.fillRect((i * w) / 6 + 6, 0, w / 18, h);
  }, { scale: printScale });
}

/** 象棋子：浅色木片 + 双圈刻线 + 本色的字。红黑两方全靠 color 决定字与圈的颜色 */
export function xiangqiTopTexture(label: string, color: string): THREE.Texture {
  return tex(`xq:${label}:${color}`, 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.05, w / 2, h / 2, w * 0.58);
    g.addColorStop(0, "#f7ead0");
    g.addColorStop(0.72, "#e3c694");
    g.addColorStop(1, "#c9a870");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 外圈是车出来的木边，往里才是刻字的双环
    ctx.strokeStyle = "rgba(92,62,28,0.5)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.452, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.365, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.318, 0, Math.PI * 2);
    ctx.stroke();
    if (label) {
      const size = label.length > 1 ? 72 : 108;
      ctx.font = `700 ${size}px ui-serif, KaiTi, STKaiti, "Songti SC", serif`;
      ctx.textAlign = "center";
      // 一道浅投影当刻痕的受光边，字就像凿进木片里
      ctx.fillStyle = "rgba(255,246,225,0.55)";
      ctx.fillText(label.slice(0, 2), w / 2 + 2, h / 2 + size * 0.36 + 2);
      ctx.fillStyle = color;
      ctx.fillText(label.slice(0, 2), w / 2, h / 2 + size * 0.36);
    }
  }, { scale: printScale });
}

export function labelSpriteTexture(text: string, color: string): THREE.Texture {
  return tex(`sprite:${text}:${color}`, 256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    roundRect(ctx, 8, 20, w - 16, h - 40, 26);
    ctx.fillStyle = "rgba(16,18,22,0.86)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `700 62px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, h / 2 + 22);
  }, { scale: printScale });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 会随时间重画的盘面：每个物件自己一张画布，不能进按 key 复用的纹理缓存 */
export interface Plate {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  /** 绘制用的逻辑宽高：画布本身按 printScale 加密过， painter 一律按这两个数画 */
  w: number;
  h: number;
}

export function makePlate(w: number, h = w): Plate {
  const [c, ctx] = canvas(Math.max(1, Math.round(w * printScale)), Math.max(1, Math.round(h * printScale)));
  ctx.setTransform(printScale, 0, 0, printScale, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = aniso;
  return { canvas: c, ctx, texture, w, h };
}

const calcKeyCache = new Map<string, THREE.Texture>();
const CALC_KEY_COLS = 4;

/**
 * 计算器按键字模图集：所有键画在一张透明贴图上，20 个键帽共用它。
 * 键帽本身是塑料材质，字只画一层暗描边 + 亮字，深浅键帽都读得清。
 */
export function calcKeyAtlasTexture(keys: string[]): THREE.Texture {
  const id = `${keys.join("")}@${printScale}`;
  const hit = calcKeyCache.get(id);
  if (hit) return hit;
  const rows = Math.ceil(keys.length / CALC_KEY_COLS);
  const cell = 96;
  const [c, ctx] = canvas(Math.round(CALC_KEY_COLS * cell * printScale), Math.round(rows * cell * printScale));
  ctx.setTransform(printScale, 0, 0, printScale, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  keys.forEach((k, i) => {
    const x = (i % CALC_KEY_COLS) * cell + cell / 2;
    const y = Math.floor(i / CALC_KEY_COLS) * cell + cell / 2;
    const size = k.length > 1 ? cell * 0.42 : cell * 0.58;
    ctx.font = `600 ${size}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(k, x, y);
    ctx.fillStyle = "#f4f7fa";
    ctx.fillText(k, x, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  calcKeyCache.set(id, t);
  return t;
}

/**
 * 第 index 个键在图集里那一格的 uv，八个分量按 PlaneGeometry 的四个顶点排：
 * 左上、右上、左下、右下。贴图 flipY 开着，所以画布顶行对应 v=1。
 */
export function calcKeyUvs(index: number, total: number): number[] {
  const rows = Math.ceil(total / CALC_KEY_COLS);
  const u0 = (index % CALC_KEY_COLS) / CALC_KEY_COLS;
  const u1 = u0 + 1 / CALC_KEY_COLS;
  const vTop = 1 - Math.floor(index / CALC_KEY_COLS) / rows;
  const vBottom = vTop - 1 / rows;
  return [u0, vTop, u1, vTop, u0, vBottom, u1, vBottom];
}

/** 计算器液晶屏：上排小字是表达式，下排大字是结果，算不出就只留表达式 */
export function paintCalc(p: Plate, expr: string, result: string, color: string) {
  const w = p.w;
  const h = p.h;
  const ctx = p.ctx;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#12201c");
  g.addColorStop(1, "#0a1512");
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 10);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(150,236,201,0.62)";
  ctx.font = `600 ${Math.round(h * 0.26)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(expr.slice(-16), w - 12, Math.round(h * 0.33));
  ctx.fillStyle = "#b9f5d6";
  ctx.shadowColor = `${color}88`;
  ctx.shadowBlur = h * 0.12;
  ctx.font = `700 ${Math.round(h * 0.46)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText((result || "0").slice(-12), w - 12, Math.round(h * 0.9));
  ctx.shadowBlur = 0;
}

/** 迷你计数器的读数屏：只画一个数，负号在左边；字多了就降字号，别把负号挤出去 */
export function paintCounter(p: Plate, v: number, color: string) {
  const w = p.w;
  const h = p.h;
  const ctx = p.ctx;
  ctx.clearRect(0, 0, w, h);
  roundRectPath(ctx, 1, 1, w - 2, h - 2, 6);
  ctx.fillStyle = "#0d1116";
  ctx.fill();
  ctx.strokeStyle = `${color}66`;
  ctx.lineWidth = 2;
  ctx.stroke();
  const text = String(v);
  const size = Math.round(h * (text.length > 4 ? 0.6 : text.length > 2 ? 0.74 : 0.86));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = v < 0 ? "#ffb4a8" : "#eaf2f8";
  ctx.shadowColor = `${color}77`;
  ctx.shadowBlur = h * 0.16;
  ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(text, w / 2, h / 2 + 1);
  ctx.shadowBlur = 0;
}

/** 计时器盘面：中间剩余时间，外圈进度弧，走完翻红 */
export function paintTimer(p: Plate, text: string, color: string, fraction: number, over: boolean) {
  const s = p.w;
  const ctx = p.ctx;
  ctx.clearRect(0, 0, s, s);
  const g = ctx.createRadialGradient(s / 2, s * 0.38, s * 0.05, s / 2, s / 2, s / 2);
  g.addColorStop(0, "#1c2027");
  g.addColorStop(1, "#0b0d11");
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 14, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, fraction)));
  ctx.strokeStyle = over ? "#e0554a" : color;
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.fillStyle = over ? "#ffc9c3" : "#f5f1e6";
  ctx.font = `700 ${text.length > 5 ? 52 : 64}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.fillText(text, s / 2, s / 2 + 22);
}

/** 文字标记：自动缩字号并折行，最多三行 */
export function textPlateTexture(text: string, color: string): THREE.Texture {
  return tex(`plate:${text}:${color}`, 512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    roundRect(ctx, 12, 34, w - 24, h - 68, 26);
    ctx.fillStyle = "rgba(13,15,19,0.9)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#f7f5ef";
    ctx.textAlign = "center";
    let size = 72;
    let lines = [text];
    for (; size >= 34; size -= 8) {
      ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
      lines = breakLines(ctx, text, w - 56, 3);
      if (lines.length <= 3) break;
    }
    ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
    const top = h / 2 - ((lines.length - 1) * size * 1.08) / 2 + size * 0.34;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * size * 1.08));
  }, { scale: printScale });
}

function breakLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      out.push(line);
      line = ch;
      if (out.length === maxLines) break;
    } else line += ch;
  }
  if (out.length < maxLines && line) out.push(line);
  return out.length ? out : [""];
}

/** 区域垫：很淡的一层色纱 + 细虚线边框 + 左上角小标签；隐私模式加一层锁格纹 */
export function zoneTexture(label: string, color: string, priv: boolean, w: number, d: number): THREE.Texture {
  const long = Math.max(w, d);
  const res = Math.min(1024, Math.max(256, Math.round((long * 900) / 32) * 32));
  const cw = Math.max(64, Math.round(res * (w / long)));
  const ch = Math.max(64, Math.round(res * (d / long)));
  return tex(`zone:${label}:${color}:${priv ? 1 : 0}:${cw}x${ch}`, cw, ch, (ctx) => {
    ctx.clearRect(0, 0, cw, ch);
    const pad = Math.max(4, cw * 0.02);
    // 区域是「这一块地方」，不是挡视线的板子：垫面只上一层极淡的纱，牌摊在上面照样看得清
    ctx.fillStyle = priv ? "rgba(18,20,26,0.3)" : "rgba(255,255,255,0.05)";
    roundRect(ctx, pad, pad, cw - pad * 2, ch - pad * 2, Math.min(cw, ch) * 0.06);
    ctx.fill();
    ctx.setLineDash([cw * 0.03, cw * 0.022]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = priv ? 0.85 : 0.62;
    ctx.lineWidth = Math.max(1.5, cw * 0.005);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    if (priv) {
      // 锁住的区域铺一层斜纹，缩略视角下也能一眼认出
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, pad, pad, cw - pad * 2, ch - pad * 2, Math.min(cw, ch) * 0.06);
      ctx.clip();
      ctx.strokeStyle = `${color}33`;
      ctx.lineWidth = Math.max(1, cw * 0.004);
      for (let i = -ch; i < cw + ch; i += Math.max(10, cw * 0.05)) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + ch, ch);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 标签按桌面上的真实大小算（约 4cm 高），垫子再大也不会顶出一块盖住半张桌的字
    const pxPerM = res / long;
    const fs = Math.max(11, Math.round(Math.min(0.04 * pxPerM, ch * 0.17, cw * 0.13)));
    ctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "left";
    const full = priv ? `${label || "区域"} · 隐私` : label || "区域";
    const maxW = cw - pad * 3 - fs * 0.9;
    let n = full.length;
    let tag = full;
    while (n > 1 && ctx.measureText(tag).width > maxW) {
      n -= 1;
      tag = `${full.slice(0, n)}…`;
    }
    const bx = pad * 1.5;
    const by = pad * 1.5;
    const pw = Math.min(cw - pad * 2, ctx.measureText(tag).width + fs * 0.9);
    const ph = fs * 1.42;
    roundRect(ctx, bx, by, pw, ph, ph * 0.34);
    ctx.fillStyle = "rgba(10,12,16,0.6)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, fs * 0.055);
    ctx.stroke();
    ctx.fillStyle = "#f7f5ef";
    ctx.fillText(tag, bx + fs * 0.45, by + ph * 0.71);
  });
}

/**
 * 垫子：实心的一块垫面。纯色时是这一档颜色加一点布面明暗，贴图时按 cover 铺满。
 * 它和区域垫共用几何（圈得住东西、能当出牌落点），只是看着是一块东西而不是一框线。
 */
export function padTexture(label: string, color: string, priv: boolean, w: number, d: number, img?: string): THREE.Texture {
  const long = Math.max(w, d);
  const res = Math.min(1024, Math.max(256, Math.round((long * 900) / 32) * 32));
  const cw = Math.max(64, Math.round(res * (w / long)));
  const ch = Math.max(64, Math.round(res * (d / long)));
  // 图是后到的：键里带上「到没到」，不然会一直端着这张纯色垫面不放
  const ready = img && hasImage(img) ? img : "";
  return tex(`pad:${label}:${color}:${priv ? 1 : 0}:${ready}${pendingOf(img, ready) ? "?" : ""}:${cw}x${ch}`, cw, ch, (ctx) => {
    const pad = Math.max(3, cw * 0.012);
    const rad = Math.min(cw, ch) * 0.07;
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    roundRect(ctx, pad, pad, cw - pad * 2, ch - pad * 2, rad);
    ctx.clip();
    const el = ready ? imageOf(ready) : undefined;
    if (el) {
      const scale = Math.max(cw / el.naturalWidth, ch / el.naturalHeight);
      const dw = el.naturalWidth * scale;
      const dh = el.naturalHeight * scale;
      ctx.drawImage(el, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, cw, ch);
      // 布面感：上边提亮、下边压暗，纯色垫子才不像一块色块
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "rgba(255,255,255,0.12)");
      g.addColorStop(0.55, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(0,0,0,0.2)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      if (pendingOf(img, ready)) outline(ctx, cw, ch, "资源载入中");
    }
    ctx.restore();
    // 内圈虚线：像垫子的压边，也让贴图垫子看清边界
    ctx.setLineDash([cw * 0.02, cw * 0.014]);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = Math.max(1, cw * 0.0035);
    roundRect(ctx, pad * 2.4, pad * 2.4, cw - pad * 4.8, ch - pad * 4.8, rad * 0.7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = Math.max(1, cw * 0.004);
    roundRect(ctx, pad, pad, cw - pad * 2, ch - pad * 2, rad);
    ctx.stroke();
    const fs = Math.max(11, Math.round(Math.min((res / long) * 0.035, ch * 0.15, cw * 0.12)));
    const tag = `${label || "垫子"}${priv ? " · 隐私" : ""}`;
    ctx.font = `700 ${fs}px ${CJK}`;
    const pw = Math.min(cw - pad * 2, ctx.measureText(tag).width + fs * 0.9);
    const ph = fs * 1.42;
    roundRect(ctx, pad * 1.8, pad * 1.8, pw, ph, ph * 0.34);
    ctx.fillStyle = "rgba(10,12,16,0.62)";
    ctx.fill();
    ctx.fillStyle = "#f7f5ef";
    ctx.fillText(tag, pad * 1.8 + fs * 0.45, pad * 1.8 + ph * 0.71);
  });
}

/**
 * 空牌堆的托盘面：一整块哑光底，中间一圈虚线框出「一张牌摊平」的位置。
 * 空堆从前画成一张扣着的牌，「没牌」和「就一张」看着一模一样，弃牌堆该摆在哪也没了准头。
 */
export function emptyPileTexture(color: string, aspect: number): THREE.Texture {
  const w = 256;
  const h = Math.max(64, Math.round(w / (aspect > 0 ? aspect : 0.7)));
  return tex(`pileEmpty:${color}:${w}x${h}`, w, h, (ctx) => {
    ctx.fillStyle = "rgba(15,18,24,0.93)";
    ctx.fillRect(0, 0, w, h);
    // 沿边一条本色细线：这一托是谁家的，跟牌堆一个色
    ctx.lineWidth = Math.max(2, w * 0.018);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    // 托盘比牌大 16%，所以这一圈虚线正好就是一张牌摊平的大小
    const mx = w * 0.069;
    const mz = h * 0.069;
    ctx.setLineDash([w * 0.055, w * 0.042]);
    ctx.lineWidth = Math.max(1.6, w * 0.013);
    ctx.globalAlpha = 0.78;
    roundRect(ctx, mx, mz, w - mx * 2, h - mz * 2, w * 0.05);
    ctx.stroke();
    ctx.setLineDash([]);
    // 中间刻一行小字：空着也一眼看得懂，不像没画出来
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#f2efe6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.round(w * 0.112)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText("空牌堆", w / 2, h / 2);
  });
}

/**
 * 容器角标：盒子和袋子里只画十几张牌，真实张数全靠这一张小数字牌说清楚。
 * 张数是个会一路爬的整数，所以这份缓存单独封顶，不能挤进公共纹理缓存里长存。
 */
const badgeCache = new Map<string, THREE.Texture>();
const BADGE_CACHE_MAX = 64;

export function countBadgeTexture(n: number, color: string): THREE.Texture {
  const text = n > 99 ? "99+" : `${n}`;
  const key = `badge:${text}:${color}`;
  const hit = badgeCache.get(key);
  if (hit) return hit;
  const { ctx, texture, w, h } = makePlate(128, 54);
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 3, 3, w - 6, h - 6, (h - 6) * 0.44);
  ctx.fillStyle = "rgba(10,12,16,0.86)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = "#f7f5ef";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${text.length > 2 ? 26 : 32}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(text, w / 2, h / 2 + 1);
  if (badgeCache.size >= BADGE_CACHE_MAX) {
    const oldest = badgeCache.keys().next().value as string | undefined;
    if (oldest) {
      badgeCache.get(oldest)?.dispose();
      badgeCache.delete(oldest);
    }
  }
  badgeCache.set(key, texture);
  return texture;
}

/**
 * 卡槽带：一条压出格子的桌垫，每格是一张牌的大小。
 * 牌拖近会自动对齐进格子，所以格子要一眼看得清边界，又不能比牌还抢眼。
 */
export function slotTexture(label: string, color: string, n: number, w: number, d: number): THREE.Texture {
  const long = Math.max(w, d);
  const res = Math.min(1024, Math.max(256, Math.round((long * 900) / 32) * 32));
  const cw = Math.max(96, Math.round(res * (w / long)));
  const ch = Math.max(96, Math.round(res * (d / long)));
  return tex(`slot:${label}:${color}:${n}:${cw}x${ch}`, cw, ch, (ctx) => {
    ctx.clearRect(0, 0, cw, ch);
    const pxPerM = res / long;
    const pad = Math.max(3, cw * 0.008);
    // 带子本体：比桌布深一档的哑光条，边缘压一道缝线似的双线
    ctx.fillStyle = "rgba(14,16,22,0.34)";
    roundRect(ctx, pad, pad, cw - pad * 2, ch - pad * 2, ch * 0.16);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1.5, cw * 0.0035);
    ctx.stroke();
    // 一格 = 一张牌的大小（6.3cm × 9cm），居中排开
    const cellW = 0.064 * pxPerM;
    const cellH = Math.min(ch - pad * 2, 0.092 * pxPerM);
    const cy = ch / 2;
    ctx.setLineDash([cellW * 0.16, cellW * 0.12]);
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    for (let i = 0; i < n; i++) {
      const cx = ((i + 0.5) / n) * (cw - pad * 2) + pad - cellW / 2;
      roundRect(ctx, cx, cy - cellH / 2, cellW, cellH, cellW * 0.14);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (!label) return;
    // 名字压在格子下方那条空档里，小字、不挡牌
    const fs = Math.max(10, Math.min(0.026 * pxPerM, (ch - cellH) * 0.7, cw / Math.max(1, n) * 0.5));
    if (fs < 11) return;
    ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const room = cw - pad * 3;
    let tag = label;
    while (tag.length > 1 && ctx.measureText(tag).width > room) tag = `${tag.slice(0, -1)}…`;
    ctx.fillStyle = "rgba(8,10,14,0.5)";
    roundRect(ctx, pad * 1.5, cy + cellH / 2 + fs * 0.14, ctx.measureText(tag).width + fs * 0.7, fs * 1.35, fs * 0.42);
    ctx.fill();
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(tag, pad * 1.5 + fs * 0.35, cy + cellH / 2 + fs * 0.14 + fs * 0.68);
  });
}

/**
 * 统计垫：一块看得见厚度的垫面，中间直接写出「竖几张、横几张」。
 * 计数由归约外的几何判定算出来，各端算的是同一个数，所以这里只管画。
 */
export function statTexture(label: string, color: string, up: number, side: number, lock: boolean, w: number, d: number): THREE.Texture {
  const long = Math.max(w, d);
  const res = Math.min(1024, Math.max(256, Math.round((long * 900) / 32) * 32));
  const cw = Math.max(96, Math.round(res * (w / long)));
  const ch = Math.max(96, Math.round(res * (d / long)));
  return tex(`stat:${label}:${color}:${up}:${side}:${lock ? 1 : 0}:${cw}x${ch}`, cw, ch, (ctx) => {
    ctx.clearRect(0, 0, cw, ch);
    const pad = Math.max(3, cw * 0.016);
    // 垫面比区域垫实在：它是一块摆在那里的垫子，不是虚线框
    ctx.fillStyle = `${color}33`;
    roundRect(ctx, pad, pad, cw - pad * 2, ch - pad * 2, Math.min(cw, ch) * 0.1);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, cw * 0.011);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = Math.max(1, cw * 0.004);
    roundRect(ctx, pad * 2.2, pad * 2.2, cw - pad * 4.4, ch - pad * 4.4, Math.min(cw, ch) * 0.08);
    ctx.stroke();

    const name = (label || "统计垫").slice(0, 12);
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(Math.min(cw, ch) * 0.11)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(8,10,14,0.6)";
    const tw = ctx.measureText(name).width;
    roundRect(ctx, pad * 3, pad * 3, tw + pad * 3, Math.min(cw, ch) * 0.16, 5);
    ctx.fill();
    ctx.fillStyle = "#f7f5ef";
    ctx.fillText(name, pad * 4.5, pad * 3 + Math.min(cw, ch) * 0.118);
    if (lock) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(8,10,14,0.6)";
      ctx.font = `700 ${Math.round(Math.min(cw, ch) * 0.09)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText("已锁定", cw - pad * 3, pad * 3 + Math.min(cw, ch) * 0.1);
    }

    // 两枚计数牌：竖放和横放各占一半，字大到斜视角也数得清
    const cellW = (cw - pad * 8) / 2;
    const cellH = Math.min(ch * 0.42, cw * 0.3);
    const cy = ch - pad * 4 - cellH;
    const cell = (x: number, glyph: string, word: string, n: number, tint: string) => {
      ctx.fillStyle = "rgba(8,10,14,0.62)";
      roundRect(ctx, x, cy, cellW, cellH, Math.min(cellW, cellH) * 0.16);
      ctx.fill();
      ctx.strokeStyle = tint;
      ctx.lineWidth = Math.max(1.5, cw * 0.005);
      ctx.stroke();
      ctx.textAlign = "center";
      const cx = x + cellW / 2;
      ctx.fillStyle = tint;
      ctx.font = `700 ${Math.round(cellH * 0.3)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(`${glyph} ${word}`, cx, cy + cellH * 0.34);
      ctx.fillStyle = n ? "#f7f5ef" : "rgba(247,245,239,0.4)";
      ctx.font = `700 ${Math.round(cellH * 0.44)}px ui-serif, Georgia, serif`;
      ctx.fillText(String(n), cx, cy + cellH * 0.83);
    };
    cell(pad * 4, "↑", "竖放", up, "#8fd0ff");
    cell(pad * 4 + cellW + pad * 4, "→", "横放", side, "#ffcf8a");
  });
}

/**
 * 转盘的盘面：只画盘，不画指针。
 * 指针钉死在底盘上、盘身自己转，所以第 i 格要按「从正上方顺时针」排——
 * 这个正上方就是目录里 spinAngle 把那一格送到的地方，两边错一个方向结果就会指反。
 */
export function spinnerTexture(n: number, color: string, value?: number): THREE.Texture {
  const res = 640;
  return tex(`spinner:${n}:${color}:${value ?? ""}`, res, res, (ctx) => {
    const c = res / 2;
    const R = c * 0.985;
    const per = 360 / n;
    // 盘心到顶点的角度：画布角度 = 时钟角 - 90
    const ang = (a: number) => ((a - 90) * Math.PI) / 180;
    const at = (a: number, r: number) => [c + r * Math.sin((a * Math.PI) / 180), c - r * Math.cos((a * Math.PI) / 180)] as const;
    ctx.clearRect(0, 0, res, res);
    const g = ctx.createRadialGradient(c, c, R * 0.1, c, c, R);
    g.addColorStop(0, shade(color, 0.26));
    g.addColorStop(1, shade(color, -0.1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R * 0.94, ang(i * per), ang((i + 1) * per));
      ctx.closePath();
      // 赢家那一格整块点亮：万一方向算拧了，这里也会当场露馅
      ctx.fillStyle = i === value ? "rgba(255,247,224,0.86)" : i % 2 ? "rgba(12,14,18,0.16)" : "rgba(255,255,255,0.13)";
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(10,12,16,0.5)";
    ctx.lineWidth = Math.max(1.5, res * 0.0035);
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i * per, R * 0.94);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    // 数字：格子越窄字越小，最外圈留一条刻度带
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fs = Math.min(R * 0.3, (2 * Math.PI * R * 0.62) / n * 0.62);
    ctx.font = `700 ${Math.round(fs)}px ui-sans-serif, system-ui, sans-serif`;
    for (let i = 0; i < n; i++) {
      const [x, y] = at((i + 0.5) * per, R * 0.62);
      ctx.fillStyle = i === value ? "#1b1712" : "rgba(252,250,244,0.92)";
      ctx.fillText(String(i + 1), x, y);
    }
    ctx.strokeStyle = "rgba(8,10,14,0.62)";
    ctx.lineWidth = Math.max(3, res * 0.022);
    ctx.beginPath();
    ctx.arc(c, c, R * 0.965, 0, Math.PI * 2);
    ctx.stroke();
    // 中心轴盖：指针的转轴压在这里，留一块实心才不显空
    ctx.fillStyle = "rgba(10,12,16,0.5)";
    ctx.beginPath();
    ctx.arc(c, c, R * 0.17, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * 计分轨的尺面：只画刻度、数字和名字，棋子是立在它上面的立体物件，不在这里画。
 * 远侧一条带放刻度与数字，中线留给棋子走，近侧留给名字——三层各占一处，棋子才不会压住读数。
 */
export function trackTexture(label: string, color: string, n: number, w: number, d: number): THREE.Texture {
  const long = Math.max(w, d);
  const res = Math.min(2048, Math.max(256, Math.round((long * 900) / 32) * 32));
  const cw = Math.max(96, Math.round(res * (w / long)));
  const ch = Math.max(96, Math.round(res * (d / long)));
  return tex(`track:${label}:${color}:${n}:${cw}x${ch}`, cw, ch, (ctx) => {
    ctx.clearRect(0, 0, cw, ch);
    const px = res / long;
    const pad = Math.max(2, ch * 0.06);
    // 尺身：深色哑光条，两侧压一道本色细边，跟桌布区分得开
    ctx.fillStyle = "rgba(14,16,22,0.5)";
    roundRect(ctx, pad, pad, cw - pad * 2, ch - pad * 2, ch * 0.2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1.5, ch * 0.045);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 三条带子各占一段高度（按 ch 计）：0.08–0.18 刻度，0.2 上下数字，中间留给棋子，近侧留给名字
    const fs = Math.min(ch * 0.16, TRACK_PITCH * px * 0.66);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.round(fs)}px ui-sans-serif, system-ui, sans-serif`;
    const tickTop = ch * 0.08;
    for (let i = 0; i < n; i++) {
      const x = cw / 2 + ((i - (n - 1) / 2) * TRACK_PITCH) * px;
      // 每五格一条长线一个数字，数到八十格也不用一格一格数
      const major = i % 5 === 0;
      ctx.strokeStyle = major ? "rgba(240,238,230,0.72)" : "rgba(240,238,230,0.3)";
      ctx.lineWidth = Math.max(1, ch * (major ? 0.028 : 0.018));
      ctx.beginPath();
      ctx.moveTo(x, tickTop);
      ctx.lineTo(x, tickTop + ch * (major ? 0.1 : 0.05));
      ctx.stroke();
      if (!major) continue;
      ctx.fillStyle = "rgba(247,245,239,0.82)";
      ctx.fillText(String(i + 1), x, ch * 0.28);
    }
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(ch * 0.2)}px ui-sans-serif, system-ui, sans-serif`;
    const tag = (label || "计分轨").slice(0, 12);
    ctx.fillStyle = "rgba(8,10,14,0.5)";
    roundRect(ctx, pad * 1.8, ch * 0.68, ctx.measureText(tag).width + ch * 0.14, ch * 0.26, ch * 0.08);
    ctx.fill();
    ctx.fillStyle = "rgba(247,245,239,0.86)";
    ctx.fillText(tag, pad * 1.8 + ch * 0.07, ch * 0.81);
  });
}

/**
 * 牌屏朝向主人那一面的屏面：斜纹布面 + 一条顶栏刻着主人名字。
 * 背面是素的，所以同桌一看屏面就知道这块屏挡的是谁——这一面才是主人那一侧。
 */
export function shieldTexture(label: string, color: string, w: number, h: number): THREE.Texture {
  const long = Math.max(w, h);
  const res = Math.min(1024, Math.max(256, Math.round((long * 900) / 32) * 32));
  const cw = Math.max(96, Math.round(res * (w / long)));
  const ch = Math.max(96, Math.round(res * (h / long)));
  return tex(`shield:${label}:${color}:${cw}x${ch}`, cw, ch, (ctx) => {
    ctx.clearRect(0, 0, cw, ch);
    // 布面底色：从中间向上下压两道暗边，像蒙在木框上的一块布
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, shade(color, -0.34));
    g.addColorStop(0.45, shade(color, -0.06));
    g.addColorStop(1, shade(color, -0.42));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    // 斜纹：一组平行浅线，间隔按屏宽走，缩放后仍是布而不是塑料
    ctx.strokeStyle = "rgba(255,252,244,0.07)";
    ctx.lineWidth = Math.max(1, cw * 0.006);
    for (let x = -ch; x < cw; x += Math.max(6, cw * 0.035)) {
      ctx.beginPath();
      ctx.moveTo(x, ch);
      ctx.lineTo(x + ch, 0);
      ctx.stroke();
    }
    // 内框：一条本色的边，把屏面和桌布隔开
    ctx.strokeStyle = "rgba(247,245,239,0.3)";
    ctx.lineWidth = Math.max(2, ch * 0.035);
    roundRect(ctx, cw * 0.035, ch * 0.06, cw * 0.93, ch * 0.88, ch * 0.06);
    ctx.stroke();
    // 顶栏：主人名字刻在这里，没有归属的屏就写「牌屏」
    const tag = (label || "牌屏").slice(0, 12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fs = Math.min(ch * 0.2, (cw * 0.86) / Math.max(2, tag.length));
    ctx.font = `700 ${Math.round(fs)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(8,10,14,0.5)";
    roundRect(ctx, cw * 0.5 - ctx.measureText(tag).width / 2 - ch * 0.07, ch * 0.1, ctx.measureText(tag).width + ch * 0.14, ch * 0.26, ch * 0.08);
    ctx.fill();
    ctx.fillStyle = "rgba(250,247,238,0.92)";
    ctx.fillText(tag, cw / 2, ch * 0.23);
  }, { srgb: true });
}

/**
 * 摊开的规则书：左右两页各排一栏字，中缝压一道书脊影。
 * 页码写在右下角，翻到哪一眼看得见；字太多就截断，本子上写不下就不该写。
 */
export function bookTexture(l: string, r: string, page: number, total: number, label: string, color: string): THREE.Texture {
  const res = 1024;
  const cw = res;
  const ch = Math.round(res * (BOOK_SPREAD.d / BOOK_SPREAD.w));
  return tex(`book:${page}:${total}:${label}:${color}:${l.length}:${r.length}:${l}:${r}`, cw, ch, (ctx) => {
    ctx.clearRect(0, 0, cw, ch);
    // 纸板封面：露在书页外圈的四周
    ctx.fillStyle = shade(color, -0.3);
    roundRect(ctx, 0, 0, cw, ch, ch * 0.035);
    ctx.fill();
    // 两页纸：中间留一条缝当书脊
    const gap = cw * 0.022;
    const pad = cw * 0.026;
    const pageW = (cw - pad * 2 - gap) / 2;
    for (const [i, text] of [[0, l], [1, r]] as const) {
      const x0 = pad + i * (pageW + gap);
      ctx.fillStyle = "#f4efe2";
      roundRect(ctx, x0, pad, pageW, ch - pad * 2, ch * 0.02);
      ctx.fill();
      // 靠书脊那侧压一道阴影，纸才像是弯下去的
      const near = i === 0 ? 1 : 0;
      const sg = ctx.createLinearGradient(x0, 0, x0 + pageW, 0);
      sg.addColorStop(near, "rgba(60,48,32,0.24)");
      sg.addColorStop(near === 1 ? 0.2 : 0.8, "rgba(60,48,32,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(x0, pad, pageW, ch - pad * 2);
      // 正文：行高按页宽定，420 字排得下大半页
      ctx.fillStyle = "#2a2521";
      ctx.textBaseline = "top";
      const fs = ch * 0.062;
      ctx.font = `500 ${Math.round(fs)}px ui-sans-serif, system-ui, sans-serif`;
      const lh = fs * 1.42;
      const top = pad + ch * 0.06;
      const maxLines = Math.max(1, Math.floor((ch - pad * 2 - ch * 0.12) / lh));
      wrapInto(ctx, String(text ?? ""), x0 + pageW * 0.07, top, pageW * 0.86, lh, maxLines);
      // 页码：右页写当前页，左页写前一页（第一页摊开时左边是封里，不写）
      const no = i === 0 ? page : page + 1;
      if (no >= 1 && no <= total) {
        ctx.textAlign = i === 0 ? "left" : "right";
        ctx.font = `600 ${Math.round(fs * 0.8)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = "rgba(42,37,33,0.55)";
        ctx.fillText(String(no), i === 0 ? x0 + pageW * 0.07 : x0 + pageW * 0.93, ch - pad - lh * 0.8);
      }
    }
    // 中缝与封面边：书脊压在最中间
    ctx.fillStyle = "rgba(20,16,12,0.42)";
    ctx.fillRect(cw / 2 - gap / 2, pad * 0.6, gap, ch - pad * 1.2);
    // 顶栏一行小字：这本书叫什么
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(ch * 0.05)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(250,247,238,0.82)";
    ctx.fillText((label || "规则书").slice(0, 16), cw / 2, ch * 0.028);
  }, { srgb: true });
}

/** 按像素宽度折行，遇到换行符强制断行；超出 maxLines 就丢掉后面的（纸上写不下了） */
function wrapInto(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  ctx.textAlign = "left";
  const out: string[] = [];
  for (const hard of String(text).split("\n")) {
    let line = "";
    for (const ch of hard) {
      if (line && ctx.measureText(line + ch).width > maxW) {
        out.push(line);
        line = ch;
      } else line += ch;
    }
    out.push(line);
  }
  out.slice(0, maxLines).forEach((s, i) => ctx.fillText(s, x, y + i * lh));
}

/** 统计垫角上的解锁按钮：锁着才出现，整块垫子对鼠标是隐身的，只有这颗点得中 */
export function unlockTexture(): THREE.Texture {
  return tex("statUnlock", 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,12,16,0.88)";
    ctx.fill();
    ctx.strokeStyle = "#ffcf8a";
    ctx.lineWidth = w * 0.05;
    ctx.stroke();
    // 锁体 + 锁环：全部用线画，任何缩放都不会糊成一团
    ctx.strokeStyle = "#f7f5ef";
    ctx.lineWidth = w * 0.07;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.44, w * 0.15, Math.PI, 0);
    ctx.stroke();
    roundRect(ctx, w * 0.31, h * 0.44, w * 0.38, h * 0.28, w * 0.05);
    ctx.fillStyle = "#f7f5ef";
    ctx.fill();
  }, { scale: printScale });
}

/**
 * 别人正在操作的物件头顶那颗小手套章：深色圆底 + 玩家色的圈 + 白色手掌。
 * 手形全用粗线描（指头是圆头线段），缩到几十像素也不糊。
 */
export function handBadgeTexture(color: string): THREE.Texture {
  return tex(`hand|${color}`, 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,12,16,0.82)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = w * 0.06;
    ctx.stroke();
    ctx.fillStyle = "#f7f5ef";
    ctx.strokeStyle = "#f7f5ef";
    ctx.lineCap = "round";
    const finger = (x1: number, y1: number, x2: number, y2: number, wide: number) => {
      ctx.lineWidth = w * wide;
      ctx.beginPath();
      ctx.moveTo(w * x1, h * y1);
      ctx.lineTo(w * x2, h * y2);
      ctx.stroke();
    };
    finger(0.4, 0.62, 0.385, 0.34, 0.085);
    finger(0.49, 0.62, 0.49, 0.3, 0.085);
    finger(0.58, 0.62, 0.6, 0.345, 0.085);
    finger(0.655, 0.63, 0.69, 0.43, 0.075);
    finger(0.37, 0.68, 0.25, 0.56, 0.085);
    roundRect(ctx, w * 0.32, h * 0.55, w * 0.37, h * 0.25, w * 0.1);
    ctx.fill();
    roundRect(ctx, w * 0.39, h * 0.74, w * 0.23, h * 0.15, w * 0.06);
    ctx.fill();
  }, { scale: printScale });
}

/**
 * 唱片正面：一圈圈纹槽围着中间那张标签，标签上写曲名。
 * 曲名一改就得重画，所以这条要进 objectSignature。
 */
export function recordTexture(name: string, color: string): THREE.Texture {
  const res = 768;
  return tex(`record:${name}:${color}`, res, res, (ctx) => {
    const c = res / 2;
    const R = c * 0.99;
    ctx.clearRect(0, 0, res, res);
    const g = ctx.createRadialGradient(c, c * 0.9, R * 0.1, c, c, R);
    g.addColorStop(0, "#2b2c33");
    g.addColorStop(0.55, "#16171b");
    g.addColorStop(1, "#0a0b0e");
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // 纹槽：密同心圈，隔一段来一道粗的当音轨分界
    for (let r = R * 0.44; r < R * 0.965; r += R * 0.008) {
      const band = Math.round((r - R * 0.44) / (R * 0.008)) % 9 === 0;
      ctx.strokeStyle = band ? "rgba(226,232,242,0.11)" : "rgba(226,232,242,0.055)";
      ctx.lineWidth = band ? 2.2 : 1.1;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 两道斜过盘面的反光：黑胶不动也看得出是亮的
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R * 0.965, 0, Math.PI * 2);
    ctx.clip();
    const shine = ctx.createLinearGradient(c - R, c - R, c + R, c + R);
    shine.addColorStop(0.32, "rgba(255,255,255,0)");
    shine.addColorStop(0.44, "rgba(255,255,255,0.085)");
    shine.addColorStop(0.5, "rgba(255,255,255,0)");
    shine.addColorStop(0.66, "rgba(255,255,255,0.06)");
    shine.addColorStop(0.74, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, res, res);
    ctx.restore();
    // 标签：玩家色的那张圆纸，外圈压一道暗边
    const lr = R * 0.36;
    ctx.beginPath();
    ctx.arc(c, c, lr, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, 0.06);
    ctx.fill();
    ctx.strokeStyle = "rgba(8,9,12,0.4)";
    ctx.lineWidth = res * 0.006;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, lr * 0.965, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = res * 0.003;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(18,16,14,0.7)";
    ctx.font = `700 ${Math.round(res * 0.03)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText("33⅓ RPM", c, c - lr * 0.6);
    ctx.fillStyle = "#141311";
    ctx.font = `700 ${Math.round(lr * 0.24)}px ui-sans-serif, system-ui, sans-serif`;
    // 自己折行而不用 wrapInto：那家伙会把对齐拧成左对齐，标签上的字要居中
    const title = (name || "空机").trim();
    const lines: string[] = [];
    let rest = title;
    while (rest && lines.length < 2) {
      let cut = 0;
      while (cut < rest.length && ctx.measureText(rest.slice(0, cut + 1)).width <= lr * 1.6) cut += 1;
      if (!cut) cut = Math.min(rest.length, 1);
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
    const y0 = c - lr * 0.04 - ((lines.length - 1) * lr * 0.13);
    lines.forEach((s, i) => ctx.fillText(s, c, y0 + i * lr * 0.26));
    // 主轴孔：真唱片这里是个洞，透出下面的主轴
    ctx.beginPath();
    ctx.arc(c, c, res * 0.011, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(6,7,9,0.85)";
    ctx.fill();
  });
}

/** 机头正面那块铭牌：铜底刻曲名，一眼看得出自家这台放的是哪张 */
export function gramPlateTexture(name: string): THREE.Texture {
  const w = 512;
  const h = 96;
  return tex(`gramPlate:${name}`, w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#d8b978");
    g.addColorStop(0.5, "#b8934f");
    g.addColorStop(1, "#8d6a34");
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, w, h, h * 0.16);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,28,10,0.5)";
    ctx.lineWidth = 4;
    roundRect(ctx, 6, 6, w - 12, h - 12, h * 0.12);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,250,235,0.4)";
    ctx.font = `700 ${Math.round(h * 0.42)}px ui-serif, Georgia, serif`;
    ctx.fillText(name || "GRAMOPHONE", w / 2 + 2, h / 2 + 2);
    ctx.fillStyle = "#3a2a10";
    ctx.fillText(name || "GRAMOPHONE", w / 2, h / 2);
  }, { scale: printScale });
}

/**
 * 随身听前脸那窄窄一条液晶屏：字是绿的、底是黑的，右边那一格写着这台此刻归谁——
 * 「本机」就是只有摆它的人这台电脑在响，「全桌」才是共享出去的那一份。
 */
export function mp3ScreenTexture(name: string, shared: boolean): THREE.Texture {
  const w = 512;
  const h = 84;
  return tex(`mp3Screen:${shared ? "s" : "p"}:${name}`, w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0d1512");
    g.addColorStop(1, "#050807");
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, w, h, h * 0.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(150,255,205,0.22)";
    ctx.lineWidth = 3;
    roundRect(ctx, 5, 5, w - 10, h - 10, h * 0.16);
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(h * 0.4)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillStyle = "#7ff0b4";
    ctx.textAlign = "left";
    const tag = shared ? "全桌" : "本机";
    const room = w - 24 - ctx.measureText(tag).width - 18;
    const label = name || "没有歌";
    ctx.fillText(label.length > 9 ? `${label.slice(0, 8)}…` : label, 16, h / 2, room);
    ctx.textAlign = "right";
    ctx.fillStyle = shared ? "#7ff0b4" : "rgba(127,240,180,0.5)";
    ctx.fillText(tag, w - 16, h / 2);
  }, { scale: printScale });
}

/**
 * 平板的屏面占位画：真页面是浏览器里贴在同一个位置的一块 DOM iframe，
 * WebGL 这块板只在「还没填地址」和「页面正在装载」的那一小会儿露出来。
 */
export function tabletScreenTexture(url: string, label: string): THREE.Texture {
  const w = 1280;
  const h = 720;
  return tex(`tablet:${url}:${label}`, w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0c1218");
    g.addColorStop(1, "#04070a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 中心那一点冷光是玻璃屏的反光，关掉页面时它也还在
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.34, 0, w * 0.5, h * 0.34, w * 0.62);
    glow.addColorStop(0, "rgba(80,190,220,0.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (!url) {
      // 空屏：一个描出来的地址栏，加一句「往哪儿填地址」
      ctx.strokeStyle = "rgba(150,220,240,0.34)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.42, 96, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2 - 96, h * 0.42);
      ctx.lineTo(w / 2 + 96, h * 0.42);
      ctx.moveTo(w / 2, h * 0.42 - 96);
      ctx.bezierCurveTo(w / 2 + 52, h * 0.42 - 52, w / 2 + 52, h * 0.42 + 52, w / 2, h * 0.42 + 96);
      ctx.bezierCurveTo(w / 2 - 52, h * 0.42 + 52, w / 2 - 52, h * 0.42 - 52, w / 2, h * 0.42 - 96);
      ctx.stroke();
      ctx.fillStyle = "rgba(236,246,250,0.72)";
      ctx.font = `700 56px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.fillText("没填地址", w / 2, h * 0.66);
      ctx.fillStyle = "rgba(236,246,250,0.4)";
      ctx.font = `400 40px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.fillText("选中它，把一个网址或哔哩哔哩的 BV 号贴进来", w / 2, h * 0.755);
      return;
    }
    // 已经认了地址：等页面挂载的那一两秒里让屏上有点东西读
    ctx.fillStyle = "rgba(150,220,240,0.5)";
    ctx.font = `700 40px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText(tabletHost(url), w / 2, h * 0.4, w * 0.82);
    ctx.fillStyle = "rgba(236,246,250,0.8)";
    ctx.font = `700 66px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText(label || "平板浏览器", w / 2, h * 0.53, w * 0.82);
    ctx.fillStyle = "rgba(236,246,250,0.34)";
    ctx.font = `400 38px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText("页面载入中…", w / 2, h * 0.66);
  }, { scale: printScale });
}

export function shade(hex: string, amt: number): string {
  const c = hex.replace("#", "");
  const n = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const num = parseInt(n.slice(0, 6) || "888888", 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((num >> 16) & 255) * (1 + amt));
  const g = clamp(((num >> 8) & 255) * (1 + amt));
  const b = clamp((num & 255) * (1 + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function objectSignature(o: GameObject, hidden = false): string {
  const faceOf = (c?: CardSpec) => (c?.img ? `${c.img}${hasImage(c.img) ? "" : "?"}` : "");
  const backOf = (k?: string) => (k ? `${k}${hasImage(k) ? "" : "?"}` : "");
  const brOf = (c?: CardSpec) => `${c?.borderless ? "B" : ""}${c?.ratio ?? ""}`;
  // 刻意不含 layer/pin/tilt：改高度不该重建网格，不然补间和下坠动画一帧都放不出来
  return [
    o.kind, o.shape, o.color, o.sides, o.value,
    o.board ? `${o.board.layout}${o.board.cols}x${o.board.rows}${o.board.cell}${o.board.theme}${o.board.img ?? ""}${o.board.img && !hasImage(o.board.img) ? "?" : ""}${o.mesh === false ? "N" : ""}` : "",
    o.faceUp === false ? "d" : "u", o.label, o.count, o.len, o.duration, o.endsAt ?? "", backOf(o.backImg),
    o.zone ? `${o.zone.w}x${o.zone.d}${o.zone.pad ? "P" : ""}${backOf(o.zone.img)}` : "", o.priv ? "p" : "",
    o.stat ? `${o.stat.w}x${o.stat.d}` : "", o.lock ? "L" : "",
    o.slot ? `${o.slot.n}` : "",
    // 转盘只看格数与落点（盘面高亮那一格要重画）；起转时刻不进签名，动画是按本地时钟现算的
    o.spinner ? `${o.spinner.n}:${o.spinner.value ?? ""}` : "",
    o.track ? `${o.track.n}` : "",
    // 牌屏看屏面尺寸与主人（屏面写着名字）；沙漏只看档位，沙子高度是每帧按本地时钟现算的
    o.shield ? `${o.shield.w}x${o.shield.h}:${o.owner ?? ""}` : "",
    o.hour ? `${o.hour.mins}` : "",
    // 规则书每一页的字都印在纸上，改一个字就得重画
    o.book ? `${o.book.page}/${o.book.pages.join("\u0001")}` : "",
    // 唱片只看片名与换没换碟：起停不进签名，那样一按播放整个机身就重建、唱臂的摆动动画会被抹平
    o.gram ? `${o.gram.clip ?? ""}|${o.gram.name}` : "",
    // 随身听看刻的哪首歌、曲名和共没共享（屏上那两个字要跟着换）；走带同样不进签名
    o.mp3 ? `${o.mp3.clip ?? ""}|${o.mp3.name}|${o.mp3.shared ? "S" : "P"}` : "",
    // 平板只看开了哪一页（空屏那块占位画要换掉）；放不放、播到第几秒归 CSS3D 那层自己盯，不必重建机身
    o.tablet ? `${o.tablet.url}` : "",
    hidden ? "h" : "",
    o.card ? `${o.card.back}|${o.card.rank}|${o.card.suit}|${o.card.label}|${o.card.cat ?? ""}|${o.card.art ?? ""}|${o.card.text ?? ""}|${o.card.color ?? ""}|${faceOf(o.card)}${brOf(o.card)}` : "",
    // 牌堆只看顶那一张，字段要和上面散牌那条一模一样：漏个 suit 就会让 9♣ 洗成 9♦ 时签名不变、画面不重画
    o.pile ? `${o.pile.length}:${o.pile.at(-1)?.back ?? ""}|${o.pile.at(-1)?.rank ?? ""}|${o.pile.at(-1)?.suit ?? ""}|${o.pile.at(-1)?.label ?? ""}|${o.pile.at(-1)?.cat ?? ""}|${o.pile.at(-1)?.art ?? ""}|${o.pile.at(-1)?.text ?? ""}|${o.pile.at(-1)?.color ?? ""}|${faceOf(o.pile.at(-1))}${brOf(o.pile.at(-1))}` : "",
  ].join("~");
}
