/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

/**
 * 平板浏览器的这条路：把用户粘贴的一串字认成一条地址，再把 B 站那一种地址拼成官方外链播放器的地址。
 *
 * 为什么是「重装而不是遥控」：内嵌的页面是跨源的，我们读不到它那层文档里的 currentTime，
 * 也发不进去 seek 指令。所以每次要挪进度只能换一个带 t= 的地址重新挂一次，
 * 各端拿到同一份 pos/at 就各自重装到同一秒——桌面状态里始终只有一条地址和几个数，
 * 一个视频字节都不过服务器（跟唱片机的音频仓库是两回事，那边是自己存的字节）。
 */
import { BILI_VIDEO, BV_ID, TABLET_PAGE_MAX, biliOf, isWebUrl } from "./catalog";
import type { TabletSpec } from "./types";

/** B 站官方外链播放器的地址：只有这一个来源，不猜别的域名 */
export const BILI_EMBED = "https://player.bilibili.com/player.html";

/** 分 P 的收口：脏值一律回到第 1 集，上限照数据层那一档 */
export function tabletPage(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, TABLET_PAGE_MAX);
}

/** 从整条链接里认分 P：`?p=3`、`/p/3`、`#p=3` 都算，认不出就是第 1 集 */
function pageFromText(text: string): number {
  const hit = /[?#/]p[=/](\d+)/i.exec(text);
  return hit ? tabletPage(Number(hit[1])) : 1;
}

/** 没写协议的地址：只补 https://，剩下交给 isWebUrl 判形状 */
function schemeless(v: string): string | null {
  if (/^[\w-]+([.][\w-]+)+([/?#]\S*)?$/i.test(v)) return `https://${v}`;
  return null;
}

/**
 * 认地址：B 站片页折成规范的那一条（外链播放器的起播秒、分 P、静音只有它那一套能用），
 * 别的 http/https 原样收下，裸 BV 号补成片页，没写协议的主机名补 https://。
 * 一律不发请求——只认字。认不出返回 null，按钮就该自己收起来。
 */
export function tabletAddr(text: unknown): { url: string; page: number } | null {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return null;
  if (BV_ID.test(raw)) return { url: BILI_VIDEO + raw, page: 1 };
  const guess = isWebUrl(raw) ? raw : schemeless(raw);
  if (!guess || !isWebUrl(guess)) return null;
  const bv = biliOf(guess);
  if (bv) return { url: BILI_VIDEO + bv, page: pageFromText(guess) };
  return { url: guess, page: 1 };
}

/** 屏上那行小字：地址的主机名，取不到就把整条摊上去（空机由调用方挡掉） */
export function tabletHost(url: string): string {
  const hit = /^https?:\/\/([^/?#]+)/i.exec(url);
  return hit ? hit[1].replace(/^www\./i, "") : url;
}

/**
 * 拼嵌入地址。`t` 只在装载这一刻有效（起播秒），`autoplay` 是 0/1，`muted` 决定这一台出不出声，
 * `danmaku` 关掉就不挂弹幕层——那一层是播放器自己每帧重画的一张满屏画布，手机上最贵的一笔就在这里。
 * 参数一律走 URLSearchParams：片号已经被 BV_ID 夹死，数字是自己算出来的，这里只是不留拼接口子。
 */
export function tabletSrc(
  bv: string,
  page: number,
  startAt: number,
  mute: boolean,
  autoplay: boolean,
  danmaku = true,
): string {
  const q = new URLSearchParams();
  q.set("bvid", bv);
  q.set("p", String(tabletPage(page)));
  q.set("autoplay", autoplay ? "1" : "0");
  q.set("muted", mute ? "1" : "0");
  if (!danmaku) q.set("danmaku", "0");
  // 起播秒：播放器只认整数秒，0 秒不用写，写了也不影响
  const sec = Math.floor(startAt);
  if (sec > 0) q.set("t", String(sec));
  return `${BILI_EMBED}?${q.toString()}`;
}

/**
 * 这一屏挂哪张页面：B 站那一种走官方外链播放器（走带参数全在这里生效），
 * 别的地址把桌上那一条原样交给 iframe——起播秒、分 P、静音对它们都不成立。
 */
export function tabletFrame(t: TabletSpec, at: number, danmaku = true): string {
  const bv = biliOf(t.url);
  if (bv) return tabletSrc(bv, t.page, at, t.mute, t.playing, danmaku);
  return t.url;
}

/**
 * 屏面按多少像素画，分四档（宽，一律 16:9）：从低到高。
 * 原来是照 1280×720 一档到底——手机上一块平躺的平板在屏上才占两三百像素，
 * 却拿一整张 720p 的页面去填，那一页自己的排版、播放器界面和弹幕画布全按 1280 宽算，每帧重新采样一遍。
 */
export const TABLET_PX_TIERS = [480, 640, 960, 1280];
/** 够得着某一档要占多少屏上设备像素（与 TABLET_PX_TIERS 一一对应，最后一档封顶用不到门槛） */
const TIER_UP = [220, 380, 620, 1040];
/** 换档要跨过门槛这么一截才换：蹭着边界来回换最贵——每换一档，iframe 里那一页要重排一次 */
const TIER_EDGE = 1.25;

/** 这一档多高（16:9）：机身那块屏的世界尺寸由它反过来定，所以宽高一换档就得一起换 */
export function tabletScreenPx(px: number): number {
  return Math.round((px * 9) / 16);
}

/**
 * 这块屏该按多少像素画、要不要干脆藏起来：`devWidth` 是它在屏幕上实际占的设备像素宽，
 * `currentPx` 传上一次真正挂上去的那一档（没挂就 0）。
 * 占不到 220 设备像素就不挂了——那个尺寸看不清画面，机身那张黑玻璃占位画顶上，
 * 但只是隐藏不是卸载，声音照放。
 */
export function tabletScreenPlan(devWidth: number, currentPx = 0): { px: number; show: boolean } {
  const w = Number.isFinite(devWidth) ? Math.max(0, devWidth) : 0;
  let idx = -1;
  for (let i = 0; i < TIER_UP.length; i++) if (w >= TIER_UP[i]) idx = i;
  const prev = currentPx > 0 ? TABLET_PX_TIERS.indexOf(currentPx) : -1;
  if (prev >= 0 && idx !== prev) {
    // 升档要越过目标档的门槛一截，降档要跌破当前档的门槛一截，否则维持现状
    if (idx > prev && w < TIER_UP[idx] * TIER_EDGE) idx = prev;
    if (idx < prev && w >= TIER_UP[prev] / TIER_EDGE) idx = prev;
  }
  return { px: idx < 0 ? TABLET_PX_TIERS[0] : TABLET_PX_TIERS[idx], show: idx >= 0 };
}

