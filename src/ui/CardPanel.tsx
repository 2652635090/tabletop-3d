/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardCopy, ImagePlus, Trash2, X } from "lucide-react";
import { CARD_BACK_NAMES, CARD_BACKS, CARD_LABEL_MAX, CARD_TEXT_MAX, CONTAINER_KINDS, blankDeck, cardText } from "@/game/catalog";
import { MAX_PILE } from "@/game/state";
import { fileToCardData, imageOf, requestImages, saveCardImage, saveImage, subscribeImages } from "@/game/images";
import { appendCardsAction, backSetAction, blankCard, cardSetAction, effectAction, pileSetAction } from "@/game/ops";
import type { Action, CardSpec, GameObject, TableState } from "@/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** 一行卡牌：容器里的按堆内下标改，桌面上的散牌和手牌按物件改 */
interface Row {
  key: string;
  index: number;
  spec: CardSpec;
  object?: GameObject;
}

/** 内置卡背的名字来自 catalog，这里只保留一个别名 */
const BACK_NAMES = CARD_BACK_NAMES;

/** 卡牌管理：预览卡面、上传正反面、改名与效果、整叠增删排序 */
export function CardPanel({ state, target, me, onAction, onNotify, onClose }: {
  state: TableState;
  target: GameObject;
  me: { id: string; name: string };
  onAction: (a: Action | null) => void;
  onNotify: (text: string) => void;
  onClose: () => void;
}) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const frontFile = useRef<HTMLInputElement>(null);
  const bulkFile = useRef<HTMLInputElement>(null);
  const backFile = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");

  const isPile = CONTAINER_KINDS.includes(target.kind) && Array.isArray(target.pile);
  const hand = !isPile && target.hand ? state.o.filter((o) => o.hand && o.owner === me.id && o.card) : [];
  const single = target.kind === "card" && target.card && !target.hand ? [target] : [];
  const cards = target.pile ?? [];

  // 堆里靠后的牌是顶牌，列表按"顶牌在上"展示
  const rows: Row[] = isPile
    ? cards.map((spec, index) => ({ key: `${target.id}:${index}`, index, spec })).sort((a, b) => b.index - a.index)
    : [...hand, ...single].map((o, index) => ({ key: o.id, index, spec: o.card as CardSpec, object: o }));

  const [activeKey, setActiveKey] = useState(rows[0]?.key ?? "");
  const active = rows.find((r) => r.key === activeKey) ?? rows[0];

  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    setLabel(active?.spec.label ?? "");
    setText(active?.spec.text ?? "");
  }, [active?.key, active?.spec.label, active?.spec.text]);

  // 预览要用的图片可能还没解码，列进请求里，回来后再刷新一次
  const keys = useMemo(() => {
    const out: string[] = [];
    for (const r of rows.slice(0, 24)) if (r.spec.img) out.push(r.spec.img);
    if (target.backImg) out.push(target.backImg);
    return out;
  }, [rows, target.backImg]);
  useEffect(() => {
    requestImages(keys);
    bump();
  }, [keys]);
  useEffect(() => subscribeImages(bump), [bump]);

  const commitList = (next: CardSpec[], note: string) => {
    onAction(pileSetAction(target.id, next, note));
  };

  /** 改写一张牌：容器走整叠替换，散牌/手牌走单张改写 */
  const writeCard = (row: Row, spec: CardSpec, note?: string) => {
    if (isPile) {
      const next = cards.slice();
      next[row.index] = spec;
      commitList(next, note ?? `编辑了卡牌「${cardText(spec) || spec.label || "空白卡"}」`);
    } else if (row.object) {
      onAction(cardSetAction(row.object.id, spec));
    }
  };

  const move = (row: Row, delta: number) => {
    if (!isPile) return;
    const to = row.index + delta;
    if (to < 0 || to >= cards.length) return;
    const next = cards.slice();
    [next[row.index], next[to]] = [next[to], next[row.index]];
    commitList(next, `调整了「${cardText(row.spec) || row.spec.label || "卡牌"}」的位置`);
  };

  const drop = (row: Row) => {
    if (isPile) {
      const next = cards.slice();
      next.splice(row.index, 1);
      commitList(next, `从${target.kind === "bag" ? "袋子" : target.kind === "box" ? "卡牌盒" : "牌堆"}移除了 1 张`);
      if (activeKey === row.key) setActiveKey("");
    } else if (row.object) {
      onAction({ t: "remove", ids: [row.object.id] });
      setActiveKey("");
    }
  };

  const uploadFront = async (file: File, row: Row) => {
    const up = await saveCardImage(file);
    if (!up) {
      onNotify("这张图压不进卡面额度，换小一点的图试试");
      return;
    }
    writeCard(row, { ...row.spec, img: up.key, ratio: up.ratio }, `换上了「${cardText(row.spec) || row.spec.label || "卡牌"}」的卡面`);
  };

  const uploadBulk = async (list: FileList) => {
    // 一叠牌不再有玩家可见的容量上限：选多少张就导多少张，只留一道防脏数据的硬闸
    const room = Math.max(0, MAX_PILE - cards.length);
    const picked = [...list].slice(0, room);
    if (!picked.length || !isPile) {
      if (list.length) onNotify(`这一叠已经到 ${MAX_PILE} 张的上限了`);
      return;
    }
    const specs: CardSpec[] = [];
    let rejected = 0;
    // 几百张图一张张压，主线程全占着：每处理完一张就报一次进度，别让人以为卡死了
    setBusy(`导入中 0/${picked.length}`);
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      try {
        const up = await saveCardImage(file);
        if (!up) {
          rejected += 1;
          continue;
        }
        specs.push({ back: "plain", img: up.key, ratio: up.ratio, label: file.name.replace(/\.[^.]+$/, "").slice(0, CARD_LABEL_MAX) || "自定义卡" });
      } catch {
        rejected += 1;
      }
      setBusy(`导入中 ${i + 1}/${picked.length}${rejected ? `，跳过 ${rejected}` : ""}`);
    }
    setBusy("");
    if (specs.length) onAction(appendCardsAction(target, specs, `向${nameOf(target)}加入了 ${specs.length} 张卡`));
    const cut = list.length - picked.length;
    onNotify(specs.length
      ? `加入了 ${specs.length} 张卡${rejected ? `，${rejected} 张太大已跳过` : ""}${cut > 0 ? `，还有 ${cut} 张没处放` : ""}`
      : "这些图片都太大，换小一点的再试");
  };

  const uploadBack = async (file: File) => {
    setBusy("卡背处理中…");
    const data = await fileToCardData(file);
    setBusy("");
    if (!data) {
      onNotify("这张图压不进卡背额度，换小一点的图试试");
      return;
    }
    onAction(backSetAction([target.id], await saveImage(data)));
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-[3px]" onClick={onClose} role="dialog" aria-label="卡牌管理">
      <div className="panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col gap-3 rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-lg">卡牌管理 · {nameOf(target)}</h2>
            <p className="text-[11px] text-muted-foreground">
              {isPile ? `共 ${cards.length} 张，顶牌在最上面` : target.hand ? "正在编辑自己的手牌" : "正在编辑这张桌面上的牌"}
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="关闭" onClick={onClose}><X className="size-4" /></Button>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              <Button size="xs" variant="outline" onClick={() => bulkFile.current?.click()} disabled={!isPile || !!busy} title={isPile ? `一次选中几百张也行，这一叠还能装 ${Math.max(0, MAX_PILE - cards.length)} 张` : "只有容器能批量加入"}>
                <ImagePlus className="size-3" />批量上传
              </Button>
              <Button size="xs" variant="outline" disabled={!isPile || cards.length >= MAX_PILE} onClick={() => commitList([...cards, blankCard(cards.length + 1)], "加入了 1 张空白卡")}>
                加空白卡
              </Button>
              <Button size="xs" variant="outline" disabled={!isPile} onClick={() => commitList([...cards, ...blankDeck(6, "空白")].slice(0, MAX_PILE), "加入了 6 张空白卡")}>
                加 6 张
              </Button>
              <Button size="xs" variant="outline" disabled={!active?.spec.text} onClick={() => { navigator.clipboard?.writeText(active?.spec.text ?? "").catch(() => undefined); onNotify("已复制这张牌的效果文本"); }}>
                <ClipboardCopy className="size-3" />复制效果
              </Button>
            </div>
            <input ref={bulkFile} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void uploadBulk(e.target.files); e.target.value = ""; }} />
            <input ref={frontFile} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && active) void uploadFront(f, active).catch(() => onNotify("上传失败，再试一次")); }} />
            <input ref={backFile} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadBack(f).catch(() => onNotify("卡背上传失败，再试一次")); }} />

            <div className="scrollbar-thin min-h-32 flex-1 space-y-1 overflow-y-auto pe-1">
              {rows.length === 0 && <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">这里面还没有牌。批量上传或加空白卡开始。</p>}
              {rows.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setActiveKey(r.key)}
                  data-active={active?.key === r.key ? "true" : "false"}
                  className={cn("slot flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left", active?.key === r.key ? "border-primary/60 bg-primary/10" : "")}
                >
                  <Thumb spec={r.spec} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground/90">{cardText(r.spec) || r.spec.label || "空白卡"}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {[r.spec.cat, r.spec.text].filter(Boolean).join(" · ") || "没有效果文本"}
                    </span>
                  </span>
                  {isPile && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{cards.length - r.index}</span>}
                </button>
              ))}
            </div>
            {busy && <p className="text-[11px] text-muted-foreground">{busy}</p>}
          </div>

          <div className="scrollbar-thin min-h-0 space-y-2.5 overflow-y-auto pe-1">
            <div className="flex gap-3">
              <div className="w-28 shrink-0 space-y-1.5">
                <Thumb spec={active?.spec} large />
                <Button size="xs" variant="outline" className="w-full gap-1" disabled={!active} onClick={() => frontFile.current?.click()}>
                  <ImagePlus className="size-3" />正面图
                </Button>
                {active?.spec?.img && (
                  <Button
                    size="xs"
                    variant={active.spec.borderless ? "default" : "outline"}
                    className="w-full"
                    title="无边框：这张卡面图铺满整张牌，不留一圈白边和描边"
                    onClick={() => writeCard(active, { ...active.spec, borderless: !active.spec.borderless })}
                  >
                    {active.spec.borderless ? "改回带白边框" : "改为无边框"}
                  </Button>
                )}
                {active?.spec?.img && (
                  <Button size="xs" variant="ghost" className="w-full" onClick={() => writeCard(active, { ...active.spec, img: undefined })}>
                    清除正面图
                  </Button>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="panel-title">卡背图案</div>
                <div className="flex flex-wrap items-center gap-1">
                  {CARD_BACKS.map((b) => (
                    <Button
                      key={b}
                      size="xs"
                      variant={target.backImg ? "ghost" : (active?.spec.back ?? "classic") === b ? "default" : "outline"}
                      onClick={() => {
                        // 一次动作统一整叠（或这张牌）的纹样，顺手清掉自定义图
                        const id = isPile ? target.id : active?.object?.id ?? target.id;
                        onAction(backSetAction([id], null, b));
                      }}
                    >
                      {BACK_NAMES[b] ?? b}
                    </Button>
                  ))}
                  <Button size="xs" variant={target.backImg ? "default" : "outline"} className="gap-1" onClick={() => backFile.current?.click()} disabled={!!busy}>
                    <ImagePlus className="size-3" />{busy ? "处理中" : "自定义"}
                  </Button>
                  {target.backImg && <Button size="xs" variant="ghost" onClick={() => onAction(backSetAction([target.id], null))}>恢复内置</Button>}
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {target.backImg ? "这个物件的牌面背面用自定义图片。" : isPile ? "内置卡背一次统一整叠牌。" : "内置卡背样式作用于这张牌。"}
                </p>
              </div>
            </div>

            <label className="block space-y-1">
              <span className="panel-title">卡牌名称</span>
              <Input value={label} maxLength={CARD_LABEL_MAX} placeholder="例如：治疗药水" onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="panel-title">效果 / 描述</span>
              <Textarea value={text} maxLength={CARD_TEXT_MAX} rows={4} placeholder="翻开时会写进桌面记录" onChange={(e) => setText(e.target.value)} />
            </label>

            <div className="flex flex-wrap gap-1.5">
              <Button size="xs" className="gap-1" disabled={!active || (!!label.trim() && !!text.trim() && label === active.spec.label && text === active.spec.text)} onClick={() => active && writeCard(active, { ...active.spec, label: label.trim().slice(0, CARD_LABEL_MAX) || undefined, text: text.trim().slice(0, CARD_TEXT_MAX) || undefined })}>
                保存这张牌
              </Button>
              <Button size="xs" variant="outline" disabled={!active} onClick={() => active && onAction(effectAction(isPile ? target.id : active.object?.id ?? target.id, isPile ? active.index : undefined))}>
                记录一次效果
              </Button>
            </div>

            {active && isPile && (
              <div className="flex gap-1.5">
                <Button size="xs" variant="outline" className="gap-1" onClick={() => move(active, 1)} disabled={active.index >= cards.length - 1}><ArrowUp className="size-3" />上移</Button>
                <Button size="xs" variant="outline" className="gap-1" onClick={() => move(active, -1)} disabled={active.index <= 0}><ArrowDown className="size-3" />下移</Button>
                <Button size="xs" variant="destructive" className="ms-auto gap-1" onClick={() => drop(active)}><Trash2 className="size-3" />移除</Button>
              </div>
            )}
            {active && !isPile && (
              <Button size="xs" variant="destructive" className="gap-1" onClick={() => drop(active)}><Trash2 className="size-3" />拿走这张牌</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function nameOf(o: GameObject): string {
  if (o.kind === "pile") return "牌堆";
  if (o.kind === "box") return "卡牌盒";
  if (o.kind === "bag") return "袋子";
  if (o.hand) return "我的手牌";
  return cardText(o.card) || o.card?.label || "卡牌";
}

/** 卡面缩略图：有图用解码后的 dataURL，没图就按内置版式画出徽记、名字与效果 */
function Thumb({ spec, large }: { spec?: CardSpec; large?: boolean }) {
  const src = spec?.img ? imageOf(spec.img)?.src : undefined;
  return (
    <span
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-sm border border-white/15 bg-black/40 text-center",
        large ? "w-full bg-[#f7f4ec] p-1" : "size-8",
      )}
      style={large ? { aspectRatio: spec?.ratio ? String(spec.ratio) : "5 / 7" } : undefined}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-contain" />
      ) : (
        <>
          {large && spec?.art && (
            <span className="font-serif text-2xl leading-none" style={{ color: spec.color ?? "#4a4133" }}>{spec.art}</span>
          )}
          <span className={cn("px-0.5", large ? "font-serif text-sm text-foreground/90" : "text-[10px] text-foreground/80")}>
            {cardText(spec) || spec?.label || (large ? "空白卡" : "空白")}
          </span>
          {large && spec?.cat && <span className="text-[10px] text-muted-foreground">{spec.cat}</span>}
          {large && spec?.text && <span className="line-clamp-4 text-[10px] leading-snug text-muted-foreground">{spec.text}</span>}
        </>
      )}
    </span>
  );
}
