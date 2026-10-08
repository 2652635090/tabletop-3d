/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

/**
 * 浏览器指纹：给每台浏览器一个「机型味」的身份标签。
 *
 * 只在本地把浏览器暴露的信号散列成 8 位十六进制，离开这台机器的永远只有那 8 个字符
 * （外加用户自己写的昵称）——原始的 UA、屏幕、显卡串一律不上服务端。
 * 同一浏览器刷新后还是同一个号，所以「刚才那个 4F2A9C 就是现在这个 4F2A9C」。
 */
const KEY = "tabletop3d:fp";

export interface Fingerprint {
  /** 8 位十六进制，稳定标识这台浏览器 */
  id: string;
  /** 给人看的那一行：浏览器 / 系统 / 分辨率 / 核数 / 内存 */
  label: string;
  /** 指纹里各信号的散列，面板上分行展示 */
  parts: { name: string; value: string }[];
}

function fnv(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hex(value: number, width = 8): string {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, "0");
}

/** 一块离屏画布画几行带渐变与重叠的文字，把字体栈/抗锯齿/合成器的差异散列进去 */
function canvasHash(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 60;
    const ctx = c.getContext("2d");
    if (!ctx) return "0";
    const grad = ctx.createLinearGradient(0, 0, 240, 60);
    grad.addColorStop(0, "#c8443c");
    grad.addColorStop(1, "#3c74c8");
    ctx.fillStyle = grad;
    ctx.textBaseline = "alphabetic";
    ctx.font = '16px "Times New Roman", serif';
    ctx.fillText("桌游 π 骰子 ① 语言", 3, 20);
    ctx.font = 'italic 13px "Arial Black", sans-serif';
    ctx.fillText("the quick brown fox ⇒ 42", 6, 38);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(30,160,90,.75)";
    ctx.fillRect(12, 42, 120, 12);
    return hex(fnv(c.toDataURL()));
  } catch {
    return "0";
  }
}

function gpuLabel(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") ?? c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "无 WebGL";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const raw = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    return raw.replace(/\(.*?\)/g, "").trim().slice(0, 32) || "隐藏";
  } catch {
    return "隐藏";
  }
}

function browserOf(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/MicroMessenger/.test(ua)) return "微信";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "未知浏览器";
}

function systemOf(ua: string, platform: string): string {
  if (/Windows NT 10/.test(ua)) return "Windows";
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && "ontouchend" in window)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return platform || "未知系统";
}

let cached: Fingerprint | null = null;

export function fingerprint(): Fingerprint {
  if (cached) return cached;
  const ua = navigator.userAgent;
  const platform = (navigator as Navigator & { platform?: string }).platform ?? "";
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  })();
  const langs = (navigator.languages ?? [navigator.language ?? ""]).join(",");
  const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth ?? 24}`;
  const touch = String(navigator.maxTouchPoints ?? 0);
  const cores = String(navigator.hardwareConcurrency ?? 0);
  const mem = String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0);
  // 一次装一个随机盐：同型号浏览器的指纹也不会在大厅里撞成一堆
  const salt = (() => {
    try {
      localStorage.setItem(KEY + ":salt", localStorage.getItem(KEY + ":salt") ?? Math.random().toString(36).slice(2, 10));
      return localStorage.getItem(KEY + ":salt") ?? "s";
    } catch {
      return Math.random().toString(36).slice(2, 10);
    }
  })();
  const canvas = canvasHash();
  const gpu = gpuLabel();
  const seed = [ua, platform, tz, langs, screen, touch, cores, mem, canvas, gpu, salt].join("|");
  const id = hex(fnv(seed));
  const parts = [
    { name: "浏览器", value: browserOf(ua) },
    { name: "系统", value: systemOf(ua, platform) },
    { name: "屏幕", value: `${window.screen.width}×${window.screen.height}` },
    { name: "色深/触点", value: `${window.screen.colorDepth ?? 24}bit · ${touch}` },
    { name: "核数/内存", value: `${cores || "?"} 核 · ${mem || "?"} GB` },
    { name: "时区/语言", value: `${tz} · ${langs.split(",")[0] ?? "-"}` },
    { name: "显卡", value: gpu },
    { name: "画布散列", value: canvas },
  ];
  cached = {
    id,
    label: `${browserOf(ua)} · ${systemOf(ua, platform)} · ${window.screen.width}×${window.screen.height} · ${cores || "?"}核 · ${id.slice(0, 4)}`,
    parts,
  };
  return cached;
}

/** 指纹短号：在线列表里挂在昵称后面，昵称撞车时也认得出是谁 */
export function fpShort(id = fingerprint().id): string {
  return id.slice(-4);
}

const SYLLABLES = ["赤", "青", "墨", "星", "霜", "焰", "岚", "潮", "弦", "翎", "砚", "穹"];
const NOUNS = ["骰子", "扑克", "筹码", "棋钟", "桌布", "牌堆", "指针", "方城"];

/** 没填昵称时按指纹随机起一个：同一台机器每次进来都是同一个名字，别人认得出你 */
export function nickFromFingerprint(id = fingerprint().id): string {
  const n = fnv(id);
  return `${SYLLABLES[n % SYLLABLES.length]}${NOUNS[(n >> 4) % NOUNS.length]}-${hex(fnv(id, 0x5bd1e995), 4).replace(/^0+/, "") || "1"}`;
}

/** 这台浏览器上一次用的昵称；没记住就按现算的指纹给一个 */
export function storedNick(): string {
  let hit: string | null = null;
  try { hit = localStorage.getItem("tabletop3d:name"); } catch { hit = null; }
  const clean = (hit ?? "").trim().slice(0, 16);
  return clean || nickFromFingerprint();
}

export function rememberNick(name: string): void {
  try { localStorage.setItem("tabletop3d:name", name); } catch { /* 隐私模式忽略 */ }
}
