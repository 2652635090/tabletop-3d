/**
 * 可选牌组包：牌面文字放在站点静态目录里的 `public/packs/index.json`，启动时读一次。
 *
 * 为什么要有这条路：第三方牌组（别人家的卡牌游戏）的名字与说明文字不该进一个开源仓库，
 * 但沙盒本身不该因此少一副能玩的牌。文件不在就是没有，`loadPacks()` 给空数组，
 * 组件库也就不会多出点了没反应的那一行。
 *
 * 卡背只能用 `game/catalog.ts` 里 `CARD_BACKS` 那几种——卡背是渲染层的能力，
 * 加一种要动四处校验镜像，不是牌包能带来的东西。写了不存在的卡背会被 `fixCard` 收成 `plain`。
 */
import { fixCard } from "./catalog";
import type { CardSpec } from "./types";

export type PackDeck = { id: string; name: string; hint: string; cards: CardSpec[] };

const PACK_URL = "/packs/index.json";
const DECK_MAX = 24;
const NAME_MAX = 20;
const HINT_MAX = 40;
const CARD_MAX = 500;

/** 只认结构、不报错：任何一处不合格就丢掉那一条，剩下的照常上桌 */
export function parsePacks(raw: unknown): PackDeck[] {
  if (!Array.isArray(raw)) return [];
  const out: PackDeck[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;
    if (typeof d.id !== "string" || !d.id || seen.has(d.id)) continue;
    if (typeof d.name !== "string" || !d.name) continue;
    if (!Array.isArray(d.cards)) continue;
    const cards = d.cards.map((c) => fixCard(c as CardSpec)).filter((c): c is CardSpec => !!c).slice(0, CARD_MAX);
    if (!cards.length) continue;
    seen.add(d.id);
    out.push({ id: d.id.slice(0, 24), name: d.name.slice(0, NAME_MAX), hint: typeof d.hint === "string" ? d.hint.slice(0, HINT_MAX) : `${cards.length} 张`, cards });
    if (out.length >= DECK_MAX) break;
  }
  return out;
}

/** 读牌包；404、断网、JSON 坏了都算「没有牌包」，不打扰玩家 */
export async function loadPacks(): Promise<PackDeck[]> {
  try {
    const res = await fetch(PACK_URL, { cache: "no-store" });
    if (!res.ok) return [];
    return parsePacks(await res.json());
  } catch {
    return [];
  }
}
