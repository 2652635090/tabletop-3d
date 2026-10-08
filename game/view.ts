/**
 * 画面偏好：灯光亮度与画质档，跟着这台浏览器走。
 * 和 game/handbar.ts 的排版偏好同一套路子——读的时候一律收口一遍，写失败就当作没写。
 */
const KEY = "tabletop3d:view";
/** 存储键名给缓存查看器读一眼，好把「本机偏好」这一条的体积报出来 */
export const VIEW_KEY = KEY;

/** 灯光倍率：1 是内置灯原本有多亮，嫌亮往下拖，全黑桌氛围拖到 0.3 */
export const BRIGHT_MIN = 0.25;
export const BRIGHT_MAX = 1.8;
/** 吊灯一开就过曝，默认压到八成：这是这轮需求里「灯光太亮」的直接答复 */
export const BRIGHT_DEFAULT = 0.78;

export type QualityLevel = "ultra" | "high" | "balanced" | "light";
export const QUALITY_LEVELS: QualityLevel[] = ["ultra", "high", "balanced", "light"];
export const QUALITY_LABEL: Record<QualityLevel, string> = { ultra: "超清", high: "高", balanced: "均衡", light: "流畅" };

/**
 * 这台设备是不是手指头直接点在屏上：平板那一层的取舍按这个走（桌上那块屏和放大观看浮层同一个口径）。
 * 摸不到 window 就当不是——用例是在 node 里跑的，模块顶层碰一次 window 会带走整轮结果。
 */
export const COARSE_POINTER = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

export interface ViewPrefs {
  bright: number;
  quality: QualityLevel;
  /** 底部那条操作提示开着还是收成小白条：跟画质亮度一样属于本机界面偏好 */
  hint: boolean;
  /** 顶栏「视角旋转」：开着空手拖动转视角，关着平移画面。与「双指转」互斥，两个都关就是纯平移 */
  orbit: boolean;
  /** 顶栏「双指转视角」（原来的手感）：开着时两指同时拖动绕桌子转，捏合照旧只管缩放。与「转视角」互斥 */
  pinchRotate: boolean;
  /** 顶部那条工具条摊开还是收成一颗小按钮：手机上收掉能多出一整行桌面 */
  dock: boolean;
  /**
   * 只锁自己这一台的编辑与删除：没开房也能用，试牌时怕误删就开着。
   * 房主那一键是全桌的，走房间记录；这一条是本机偏好，两边任一开着都算在游戏中。
   */
  game: boolean;
}

export function clampBright(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(BRIGHT_MAX, Math.max(BRIGHT_MIN, Math.round(n * 100) / 100)) : BRIGHT_DEFAULT;
}

function clampQuality(v: unknown): QualityLevel {
  return QUALITY_LEVELS.includes(v as QualityLevel) ? (v as QualityLevel) : "high";
}

export function loadView(fallback?: Partial<ViewPrefs>): ViewPrefs {
  let raw: Partial<ViewPrefs> = {};
  try {
    const text = localStorage.getItem(KEY);
    raw = text ? (JSON.parse(text) as Partial<ViewPrefs>) : {};
  } catch {
    raw = {};
  }
  // 两个手势模式互斥，旧存档里可能两个都开着：留单指那颗，两指回到只缩放
  const orbit = raw.orbit === true;
  return {
    bright: clampBright(raw.bright ?? fallback?.bright ?? BRIGHT_DEFAULT),
    quality: raw.quality === undefined ? (fallback?.quality ?? "high") : clampQuality(raw.quality),
    hint: raw.hint !== false,
    orbit,
    pinchRotate: raw.pinchRotate === true && !orbit,
    dock: raw.dock !== false,
    game: raw.game === true,
  };
}

export function saveView(prefs: ViewPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ bright: clampBright(prefs.bright), quality: clampQuality(prefs.quality), hint: prefs.hint !== false, orbit: prefs.orbit === true, pinchRotate: prefs.pinchRotate === true, dock: prefs.dock !== false, game: prefs.game === true }));
  } catch {
    /* 隐私模式：偏好留在这次会话里就够了 */
  }
}
