/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

/** 手牌多了怎么摆：叠放 / 换行缩小 / 两者一起用 */
export type HandScheme = "stack" | "wrap" | "both";

export const HAND_SCHEMES: { id: HandScheme; label: string; title: string }[] = [
  { id: "stack", label: "叠放", title: "单行叠放：牌越多叠得越紧" },
  { id: "wrap", label: "换行", title: "换行缩小：牌与牌不叠，牌多时自动变小、另起一行" },
  { id: "both", label: "全显", title: "两者一起用：换行 + 叠放，一张不落全显示" },
];

export const HAND_SCHEME_KEY = "tabletop3d:handbar";
/** 牌面尺寸档位，从大到小（px） */
export const HAND_TIERS = [
  { w: 72, h: 100 },
  { w: 62, h: 86 },
  { w: 52, h: 72 },
  { w: 44, h: 61 },
  { w: 36, h: 50 },
];
/** 再挤也要露出一点边，全叠死就等于看不见下面的牌 */
export const MAX_OVERLAP = 0.86;
/** 挤到极限时每张牌至少露出的像素：保住这一线，40 张牌也还是一张不落看得见的 */
export const MIN_STEP = 2;
/** 全显方案哪怕牌很少也稍微搭在一起，看着像一手牌 */
const BOTH_LOOSE = 0.25;
/** 用户自己定的手牌外观：叠掉多少（null 表示交给排版自动决定）与牌面大小倍率 */
export interface HandPrefs {
  overlap: number | null;
  size: number;
}
export const HAND_PREFS_KEY = "tabletop3d:handprefs";
export const AUTO_PREFS: HandPrefs = { overlap: null, size: 1 };
export const SIZE_MIN = 0.6;
export const SIZE_MAX = 1.4;

/** 用户设置先收口再上手：脏值一律回落到自动，越界的夹紧 */
export function clampPrefs(raw: unknown): HandPrefs {
  const p = raw && typeof raw === "object" ? (raw as { overlap?: unknown; size?: unknown }) : {};
  const o = typeof p.overlap === "number" && Number.isFinite(p.overlap) ? Math.round(Math.max(0, Math.min(MAX_OVERLAP, p.overlap)) * 100) / 100 : null;
  const s = typeof p.size === "number" && Number.isFinite(p.size) ? Math.max(SIZE_MIN, Math.min(SIZE_MAX, p.size)) : AUTO_PREFS.size;
  return { overlap: o, size: Math.round(s * 100) / 100 };
}

/** 牌面尺寸档位：用户倍率直接乘在每一档上，排版照旧从里挑合适的一档 */
export function handTiers(size: number): { w: number; h: number }[] {
  if (size === 1) return HAND_TIERS;
  return HAND_TIERS.map((t) => ({ w: Math.round(t.w * size), h: Math.round(t.h * size) }));
}
/** 宽度窄到这份上就按这个算，再小也没地方摆 */
export const MIN_AVAIL = 96;
/** 行与行之间留的缝，算高度预算时一起算进去 */
export const ROW_GAP = 3;
/** 高度预算兜底值：拿不到实际视口高度时按这个算 */
export const DEFAULT_BUDGET = 214;
/** 手牌高度上限：再高就不像底条而像面板了 */
const MAX_BUDGET = 248;
/** 底条整体最多占这么多视口高度，改这个要连着改 App.tsx 里的 max-h-[44dvh] */
export const STRIP_VH = 0.44;
/** 底条里牌以外的开销：提示条、选中栏或操作提示、手机上单独一行的控件、内边距与缝隙 */
const STRIP_CHROME = 118;
/** 手牌最多能长多高：从底条上限里扣掉其余部分，小屏至少还放得下一排最小的牌 */
export function handBudget(viewH: number): number {
  return Math.round(Math.min(MAX_BUDGET, Math.max(64, viewH * STRIP_VH - STRIP_CHROME)));
}

/**
 * 选中的牌就地放大：底边钉住往上长。长出来的这一段必须在排版时就留出来，
 * 否则牌头会被底条那道 overflow 裁掉——放大反而看不见牌名。
 */
export const ZOOM_SCALE = 1.12;
export const ZOOM_LIFT = 12;
/** 放大后往上伸出多少：牌高之外还要多留这么几像素，行顶就空出这么宽 */
export function zoomRoom(h: number): number {
  return Math.ceil(h * (ZOOM_SCALE - 1) + ZOOM_LIFT) + 2;
}

/** 一手牌连同放大余量一共吃多高：高度预算按这个算 */
export function handBlock(h: number, rows: number): number {
  return h * rows + ROW_GAP * (rows - 1) + zoomRoom(h);
}

export type HandPlan = { w: number; h: number; overlap: number; rows: number; width: number };

/** 一张牌到下一张牌挪多少像素：UI 排版和自检共用这一个算法，算出来的宽度就是实际宽度 */
export function cardStep(cw: number, overlap: number): number {
  return Math.max(MIN_STEP, Math.min(cw, Math.floor(cw * (1 - overlap))));
}

/** 一行放 kmax 张刚好铺满宽度时要叠掉的比例 */
export function neededOverlap(width: number, cw: number, kmax: number): number {
  if (kmax <= 1) return 0;
  return Math.max(0, 1 - (width - cw) / (cw * (kmax - 1)));
}

/** 一档尺寸加一个叠放比例，一行放得下几张 */
export function cardsPerRow(width: number, cw: number, overlap: number): number {
  const step = cardStep(cw, overlap);
  return Math.max(1, Math.floor((width - cw) / step) + 1);
}

/** 方案默认从哪一档起步：换行方案靠缩尺寸，叠放方案先保住大牌 */
function tierStart(n: number, scheme: HandScheme): number {
  if (scheme === "stack") return n <= 8 ? 0 : n <= 14 ? 1 : 2;
  if (scheme === "wrap") return n <= 6 ? 0 : n <= 10 ? 1 : n <= 16 ? 2 : 3;
  return n <= 12 ? 0 : n <= 20 ? 1 : 2;
}

/** 这个方案最多允许几行：窄屏宁可叠紧也不要堆三行高一屏 */
function rowWants(scheme: HandScheme, width: number): number[] {
  if (scheme === "stack") return [1];
  const want = width < 430 ? 3 : 2;
  return Array.from({ length: want }, (_, i) => want - i);
}

/** 某方案某行数为单位时，能塞进宽度的一档里最大的一档（实在塞不下就用最小档硬挤） */
function tierFor(tiers: { w: number; h: number }[], width: number, n: number, rows: number, scheme: HandScheme, cap: number) {
  const kmax = Math.ceil(Math.max(1, n) / rows);
  const start = Math.min(tierStart(n, scheme), tiers.length - 1);
  return tiers.slice(start).find((t) => neededOverlap(width, t.w, kmax) <= cap) ?? tiers[tiers.length - 1];
}

/**
 * 把这档尺寸摊成实际叠放比例：一行 kmax 张刚好铺满 width，不留小数免得 CSS 和自检对不上。
 * 用户指定了叠放比例就照他的来——但松过铺满宽度就会出框，所以铺满宽度是上限。
 */
function pack(t: { w: number; h: number }, width: number, n: number, rows: number, overlap: number | null): HandPlan {
  const kmax = Math.ceil(Math.max(1, n) / rows);
  const fitStep = Math.max(MIN_STEP, Math.min(t.w, Math.floor((width - t.w) / Math.max(1, kmax - 1))));
  const step = overlap === null ? fitStep : Math.max(MIN_STEP, Math.min(fitStep, Math.floor(t.w * (1 - overlap))));
  return { ...t, rows, width, overlap: Math.max(0, (t.w - step) / t.w) };
}

/**
 * 按张数、可用宽度、方案、高度预算加上用户自己的外观设置挑一档尺寸与叠放比例。
 * 目标是三个都不破：横向不出范围框、纵向不超过预算、每张牌都露出来。
 * 行数是第一个被牺牲的量，所以窄屏优先单行叠放，而不是三行把画面吃掉。
 * 用户定的叠放比例当作选档的上限：松得下就摊开，塞不下才回到自动叠紧；
 * 牌面大小同样是偏好，大到摆不下了就一档档退回去，宁肯小一点也不溢出。
 */
export function handLayout(n: number, avail: number, scheme: HandScheme, budget = DEFAULT_BUDGET, prefs: HandPrefs = AUTO_PREFS): HandPlan {
  const width = Math.max(MIN_AVAIL, avail);
  const tall = Math.max(72, budget);
  const cap = prefs.overlap ?? MAX_OVERLAP;
  const loose = prefs.overlap === null ? BOTH_LOOSE : Math.min(BOTH_LOOSE, prefs.overlap);
  // 全显方案要求哪怕牌很少也搭着放；叠得更紧只会更宽裕，不会放不下
  const settle = (plan: HandPlan) => (scheme === "both" && plan.overlap < loose ? { ...plan, overlap: loose } : plan);
  const search = (tiers: { w: number; h: number }[]): HandPlan | null => {
    for (const rows of rowWants(scheme, width)) {
      for (let i = tiers.indexOf(tierFor(tiers, width, n, rows, scheme, cap)); i < tiers.length; i++) {
        const t = tiers[i];
        if (handBlock(t.h, rows) > tall) continue;
        const plan = pack(t, width, n, rows, prefs.overlap);
        if (n <= cardsPerRow(width, plan.w, plan.overlap) * rows) return settle(plan);
      }
    }
    return null;
  };
  const sizes = [...new Set([prefs.size, 1, SIZE_MIN])].filter((s) => s <= prefs.size + 1e-9).sort((a, b) => b - a);
  for (const s of sizes) {
    const hit = search(handTiers(s));
    if (hit) return hit;
  }
  // 怎么都不合意：连最小的倍率也救不回来，就用单行最小档，宽度靠叠放兜住，高度一定不超预算
  const tiers = handTiers(sizes[sizes.length - 1] ?? prefs.size);
  return settle(pack(tiers[tiers.length - 1], width, n, 1, prefs.overlap));
}

/** 这份摆法是否真的放得下：给自检用，横向不出范围框、纵向不超预算 */
export function handFits(n: number, avail: number, plan: HandPlan, budget = DEFAULT_BUDGET): boolean {
  const width = plan.width || Math.max(MIN_AVAIL, avail);
  return (
    n <= cardsPerRow(width, plan.w, plan.overlap) * plan.rows &&
    plan.w + (Math.ceil(Math.max(1, n) / plan.rows) - 1) * cardStep(plan.w, plan.overlap) <= width &&
    handBlock(plan.h, plan.rows) <= Math.max(72, budget) + 0.5
  );
}
