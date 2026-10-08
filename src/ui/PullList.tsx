/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { useEffect, useMemo, useReducer, useState } from "react";
import { Hand, PackageOpen, Search, X } from "lucide-react";
import { CONTAINER_KINDS, cardText } from "@/game/catalog";
import { imageOf, requestImages, subscribeImages } from "@/game/images";
import { pullCardAction, type DrawPick } from "@/game/ops";
import type { Action, CardSpec, GameObject, TableState } from "@/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 容器叫什么：列表标题用 */
export function containerName(o: GameObject): string {
  if (o.kind === "pile") return "牌堆";
  if (o.kind === "box") return "卡牌盒";
  if (o.kind === "bag") return "袋子";
  return "收纳";
}

/**
 * 收纳容器的全量列表：整叠牌一屏看全，按行精确取出那一张。
 * 摸 1 张只能拿顶牌，这里按下标摘牌，同名的牌也不会拿错。
 */
export function PullList({ state, target, me, drawPick, onAction, onClose }: {
  state: TableState;
  target: GameObject;
  me: { id: string; name: string };
  /** 摸牌落点：这里取出那一张摊到哪儿，和选中栏那一排「摸到」挑的是同一块区域 */
  drawPick: DrawPick;
  onAction: (a: Action | null) => void;
  onClose: () => void;
}) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [q, setQ] = useState("");
  const cards = target.pile ?? [];
  const total = cards.length;
  // 堆里靠后的那张才是顶牌：列表倒着排，下标仍按堆内真实位置走
  const rows = useMemo(() => {
    const key = q.trim().toLowerCase();
    return cards
      .map((spec, index) => ({ index, spec }))
      .reverse()
      .filter((r) => !key || `${cardText(r.spec)} ${r.spec.cat ?? ""} ${r.spec.text ?? ""}`.toLowerCase().includes(key));
  }, [cards, q]);

  // 缩略图可能还没解码，列进请求里，回来后再刷一次
  const keys = useMemo(() => {
    const out: string[] = [];
    for (const r of rows.slice(0, 60)) if (r.spec.img) out.push(r.spec.img);
    return out;
  }, [rows]);
  useEffect(() => {
    requestImages(keys);
    bump();
  }, [keys]);
  useEffect(() => subscribeImages(bump), [bump]);

  if (!CONTAINER_KINDS.includes(target.kind)) return null;

  const take = (index: number, toHand: boolean) => {
    onAction(pullCardAction(state, target.id, index, me.id, toHand, drawPick));
    // 最后一张被拿走，容器也跟着消失了，没东西可列了
    if (total <= 1) onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-[3px]" onClick={onClose} role="dialog" aria-label="全部卡牌">
      <div className="panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col gap-2 rounded-2xl p-3.5" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate font-serif text-base">
              <PackageOpen className="size-4 shrink-0" />
              {containerName(target)} · 共 {total} 张
            </h2>
            <p className="text-[11px] text-muted-foreground">顶牌在最上面。精确取出那一张，放到自己面前的空位上。</p>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="关闭" onClick={onClose}><X className="size-4" /></Button>
        </header>

        <label className="relative block">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按名字或效果筛选…" className="h-8 ps-7 text-xs" aria-label="筛选卡牌" />
        </label>

        <div className="scrollbar-thin min-h-28 flex-1 space-y-1 overflow-y-auto pe-1">
          {rows.length === 0 && (
            <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
              {total ? "没有对得上的牌，换个词试试。" : "这里面还没有牌。"}
            </p>
          )}
          {rows.map((r) => (
            <div key={r.index} className="slot flex items-center gap-2 rounded-md px-2 py-1.5">
              <Thumb spec={r.spec} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-foreground/90">{cardText(r.spec) || r.spec.label || "空白卡"}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{[r.spec.cat, r.spec.text].filter(Boolean).join(" · ") || "没有效果文本"}</span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{total - r.index}</span>
              <Button size="xs" variant="outline" className="shrink-0" title={drawPick === null || drawPick === "hand" ? "摊到容器旁边的空位，所有人都看得见" : "摊进选中栏「摸到」那一排挑中的区域"} onClick={() => take(r.index, false)}>放到桌面</Button>
              <Button size="xs" variant="outline" className="shrink-0 gap-1" onClick={() => take(r.index, true)} title="直接进自己的手牌">
                <Hand className="size-3" />手牌
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Thumb({ spec }: { spec: CardSpec }) {
  const src = spec.img ? imageOf(spec.img)?.src : undefined;
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-white/15 bg-black/40 text-[10px] text-foreground/80")}>
      {src ? <img src={src} alt="" className="size-full object-contain" /> : (spec.art || cardText(spec).slice(0, 2) || "空")}
    </span>
  );
}
