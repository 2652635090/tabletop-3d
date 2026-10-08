import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, LayoutGrid, Maximize2, Sparkles, Target } from "lucide-react";
import { PALETTE, cardText } from "@/game/catalog";
import { AUTO_PREFS, MAX_OVERLAP, SIZE_MAX, SIZE_MIN, ZOOM_LIFT, ZOOM_SCALE, cardsPerRow, cardStep, clampPrefs, handBudget, HAND_PREFS_KEY, HAND_SCHEME_KEY, HAND_SCHEMES, handLayout, ROW_GAP, zoomRoom, type HandPlan, type HandPrefs, type HandScheme } from "@/game/handbar";
import { subscribeImages } from "@/game/images";
import { playHandAction, playToZoneAction, preferredZoneOf, tableZones } from "@/game/ops";
import type { Action, GameObject, TableState } from "@/game/types";
import { cardCanvasSize, cardFaceCached, sharpFaces } from "@/three/textures";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ZoneChip } from "./widgets";

function loadScheme(): HandScheme {
  try {
    const v = localStorage.getItem(HAND_SCHEME_KEY);
    return HAND_SCHEMES.some((s) => s.id === v) ? (v as HandScheme) : "both";
  } catch {
    return "both";
  }
}

/** 叠放比例与牌面大小是本机偏好，不进共享桌面 */
function loadPrefs(): HandPrefs {
  try {
    return clampPrefs(JSON.parse(localStorage.getItem(HAND_PREFS_KEY) ?? "null"));
  } catch {
    return AUTO_PREFS;
  }
}

/** 自己手里扣着的牌：只在持有者的这条牌栏里可见，桌面上不出现。 */
export function HandBar({ state, me, selected, onSelect, onAction, onInspect, probeDrop, endDrop, toHandHint }: {
  state: TableState;
  me: { id: string; name: string };
  selected: string[];
  onSelect: (ids: string[]) => void;
  onAction: (a: Action | null) => void;
  /** 长按某张牌：细看它当前朝上的那一面 */
  onInspect: (id: string) => void;
  /** 往桌上拖时每帧问一句「指针这个屏幕点会落在桌面哪里」，顺带画出落点预览圈 */
  probeDrop?: (ids: string[], x: number, y: number) => { x: number; z: number } | null;
  /** 拖动结束（松手或取消）：让场景收掉预览圈 */
  endDrop?: () => void;
  /** 桌上的牌正被拖进这条牌栏：亮起来告诉人「松手就收进手里」 */
  toHandHint?: boolean;
}) {
  const [, bump] = useState(0);
  useEffect(() => subscribeImages(() => bump((v) => v + 1)), []);

  // 只画牌：早先的桌面里可能存着被标成 hand 的别的东西，按卡面渲染会当场崩
  const mine = state.o.filter((o) => o.hand && o.owner === me.id && o.kind === "card");
  const mineIds = new Set(mine.map((o) => o.id));
  const chosen = selected.filter((id) => mineIds.has(id));

  const others = new Map<string, number>();
  for (const o of state.o) {
    if (!o.hand || o.owner === me.id || o.kind !== "card") continue;
    const who = state.players.find((p) => p.id === o.owner)?.name ?? "玩家";
    others.set(who, (others.get(who) ?? 0) + 1);
  }

  /** 出牌落点：不选就是自己的首选区域，也可以点台上任意区域 */
  const zones = tableZones(state);
  const home = preferredZoneOf(state, me.id);
  const [target, setTarget] = useState<string | null>(null);
  const zone = zones.find((z) => z.id === target) ?? (target === null ? home : null);
  useEffect(() => {
    if (target && !zones.some((z) => z.id === target)) setTarget(null);
  }, [target, zones]);

  const [scheme, setScheme] = useState<HandScheme>(loadScheme);
  const [prefs, setPrefs] = useState<HandPrefs>(loadPrefs);
  const pick = (v: HandScheme) => {
    setScheme(v);
    try {
      localStorage.setItem(HAND_SCHEME_KEY, v);
    } catch {
      /* 存不下就算了，下次进来用默认值 */
    }
  };
  const tune = (next: Partial<HandPrefs>) => {
    const v = clampPrefs({ ...prefs, ...next });
    setPrefs(v);
    try {
      localStorage.setItem(HAND_PREFS_KEY, JSON.stringify(v));
    } catch {
      /* 存不下就算了，下次进来用默认值 */
    }
  };

  const rowRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const [viewH, setViewH] = useState(() => window.innerHeight);
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    const onResize = () => setViewH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);
  /**
   * 手牌能占多高：底条整体只给 44dvh，扣掉提示条、选中栏和手机上单独一行的控件之后才是牌的。
   * 手机上一度能塞下三行 100px 的牌，那就是"占掉半个屏"的来路。
   */
  const budget = handBudget(viewH);
  const plan = handLayout(mine.length, avail || 320, scheme, budget, prefs);
  // 分行自己数：交给浏览器换行会按"半张牌"的宽度多塞一张，最后一张就压到右边控件上了
  const perRow = plan.rows > 1 ? Math.max(1, cardsPerRow(plan.width, plan.w, plan.overlap)) : mine.length;
  const rows: GameObject[][] = [];
  for (let i = 0; i < mine.length; i += perRow) rows.push(mine.slice(i, i + perRow));
  const step = cardStep(plan.w, plan.overlap);
  /**
   * 卡面按屏幕密度画：手牌条里一张牌最多百来像素宽，源图给到两三倍才经得起选中放大和拖动手势。
   * 像素数取整到 32 一档，不然每次排版微调都会把缓存刷成一片新的。
   * 超清档把上限再抬一档：手牌条是盯得最久的一处，牌放大时最看得出源图够不够。
   */
  const px = Math.min(sharpFaces() ? 1024 : 640, Math.max(176, Math.round((Math.max(plan.w, 44) * (window.devicePixelRatio || 1) * 1.6) / 32) * 32));

  const toggle = (id: string) => {
    if (draggedRef.current) return;
    onSelect(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  };
  const play = (ids: string[]) => {
    if (draggedRef.current) return;
    onSelect([]);
    onAction(playToZoneAction(state, ids, zone?.id ?? null));
  };

  /**
   * 手牌往桌上拖：按住挪开一段距离才算起步，牌跟着指针走，桌面上的预览圈就是它将落的位置。
   * 起步那张牌若已在选中里，就整组一起拖走；松手在桌面外就作废，不改动任何东西。
   */
  const draggedRef = useRef(false);
  const [drag, setDrag] = useState<{ ids: string[]; x: number; y: number; spot: { x: number; z: number } | null } | null>(null);
  const dragIds = useRef<string[] | null>(null);
  useEffect(() => () => { dragIds.current = null; }, []);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || !probeDrop) return;
    const el = (e.target as HTMLElement).closest?.("[data-hand-id]");
    const id = el?.getAttribute("data-hand-id");
    if (!id) return;
    dragIds.current = null;
    draggedRef.current = false;
    const ids = chosen.includes(id) && chosen.length > 1 ? chosen : [id];
    const from = { x: e.clientX, y: e.clientY };
    const at = { x: e.clientX, y: e.clientY };
    let raf = 0;
    const paint = () => {
      raf = 0;
      setDrag({ ids, x: at.x, y: at.y, spot: probeDrop(ids, at.x, at.y) });
    };
    const move = (ev: PointerEvent) => {
      at.x = ev.clientX;
      at.y = ev.clientY;
      if (!dragIds.current) {
        if (Math.abs(ev.clientX - from.x) + Math.abs(ev.clientY - from.y) < 12) return;
        dragIds.current = ids;
        draggedRef.current = true;
      }
      // 预览圈要投影、要跑一遍落点归约，一帧一次就够，别把指针事件全摊给它
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const stop = (ev: PointerEvent, commit: boolean) => {
      window.removeEventListener("pointermove", move);
      if (raf) cancelAnimationFrame(raf);
      const live = dragIds.current;
      dragIds.current = null;
      setDrag(null);
      // 最后这一段换算顺带把预览圈画到了终点，所以每次都紧跟一次收圈：留在桌上就像凭空多一张牌
      const spot = live && commit ? probeDrop(live, ev.clientX, ev.clientY) : null;
      endDrop?.();
      if (!spot || !live) return;
      onSelect([]);
      onAction(playHandAction(live, spot));
    };
    const up = (ev: PointerEvent) => stop(ev, ev.type === "pointerup");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
  };

  if (!mine.length) return null;

  const ghost = drag
    ? createPortal(
        <div className="pointer-events-none fixed z-50" style={{ left: drag.x, top: drag.y, transform: "translate(-50%,-86%)" }}>
          {(() => {
            const o = state.o.find((x) => x.id === drag.ids[0]);
            const w = Math.round(plan.w * 1.35);
            const face = cardCanvasSize(o?.card?.ratio);
            return o ? (
              <img
                src={cardFaceCached(o.card, o.color ?? PALETTE[1], px)}
                alt=""
                width={w}
                height={Math.round((w * face.h) / face.w)}
                className="rounded-md border border-black/50 shadow-2xl"
                style={{ opacity: drag.spot ? 1 : 0.45 }}
              />
            ) : null;
          })()}
          {drag.ids.length > 1 && (
            <span className="absolute -end-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">{drag.ids.length}</span>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn("panel pointer-events-auto flex w-full max-w-full shrink-0 flex-col gap-1.5 rounded-xl px-2 pb-1.5 pt-3.5 sm:flex-row sm:items-end sm:gap-2 sm:px-2.5 sm:pb-2", toHandHint && "ring-2 ring-primary/70")}>
      {/* 顶上留出放大余量（排版时已经从高度预算里扣掉了）：选中的牌往上长，不会被底条裁掉牌头 */}
      <div ref={rowRef} className="flex min-w-0 grow basis-0 flex-col justify-end" style={{ gap: ROW_GAP, paddingTop: zoomRoom(plan.h) }} onPointerDown={startDrag}>
        {rows.map((row, r) => (
          <div key={r} className="flex items-end justify-center gap-0">
            {row.map((o, j) => (
              <HandCard
                key={o.id}
                o={o}
                index={j}
                total={row.length}
                last={j === row.length - 1}
                plan={plan}
                step={step}
                px={px}
                active={chosen.includes(o.id)}
                dragging={drag?.ids.includes(o.id) ?? false}
                onClick={() => toggle(o.id)}
                onPlay={() => play([o.id])}
                onInspect={() => onInspect(o.id)}
              />
            ))}
          </div>
        ))}
      </div>
      {/* 手机上这几个控件单独排一行：挤在牌栏右边会把可用宽度吃到几十像素，牌就只能竖着叠 */}
      <div className="flex shrink-0 flex-wrap items-end gap-x-2 gap-y-1 sm:flex-nowrap sm:gap-2">
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
          <Layers className="size-3.5" />
          {mine.length} 张
        </span>
        <div className="flex shrink-0 flex-col gap-1">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <LayoutGrid className="size-3" />
            摆法
          </span>
          <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 p-0.5">
            {HAND_SCHEMES.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.title}
                onClick={() => pick(s.id)}
                data-active={scheme === s.id}
                className={cn("slot rounded px-1.5 py-0.5 text-[10px]", scheme === s.id && "text-primary-foreground")}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Maximize2 className="size-3" />
            外观
          </span>
          <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5">
            <label className="flex items-center gap-1" title="叠放比例：后面的牌被压住多少，0% 就是摊开">
              <span className="panel-title">叠</span>
              <input
                type="range"
                min={0}
                max={Math.round(MAX_OVERLAP * 100)}
                step={5}
                value={Math.round((prefs.overlap ?? plan.overlap) * 100)}
                onChange={(e) => tune({ overlap: Number(e.target.value) / 100 })}
                className="w-16 accent-primary sm:w-20"
                aria-label="手牌叠放比例"
              />
              <span className="w-9 shrink-0 text-end font-mono text-[10px] text-muted-foreground">
                {prefs.overlap === null ? "自动" : `${Math.round(prefs.overlap * 100)}%`}
              </span>
            </label>
            <label className="flex items-center gap-1" title="牌面大小：在自己这一台机器上生效">
              <span className="panel-title">大</span>
              <input
                type="range"
                min={Math.round(SIZE_MIN * 100)}
                max={Math.round(SIZE_MAX * 100)}
                step={5}
                value={Math.round(prefs.size * 100)}
                onChange={(e) => tune({ size: Number(e.target.value) / 100 })}
                className="w-16 accent-primary sm:w-20"
                aria-label="手牌大小倍率"
              />
              <span className="w-9 shrink-0 text-end font-mono text-[10px] text-muted-foreground">{Math.round(prefs.size * 100)}%</span>
            </label>
            {(prefs.overlap !== null || prefs.size !== 1) && (
              <Button size="xs" variant="ghost" className="shrink-0 gap-0.5 px-1" title="回到自动排版" onClick={() => tune({ overlap: AUTO_PREFS.overlap, size: AUTO_PREFS.size })}>
                <Sparkles className="size-3" />
                自动
              </Button>
            )}
          </div>
        </div>
        {zones.length > 0 && (
          <div className="flex min-w-0 shrink-0 flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Target className="size-3" />
              落点
            </span>
            <div className="scrollbar-thin flex max-h-14 max-w-[46vw] flex-wrap items-center gap-1 overflow-y-auto sm:max-w-[40vw]">
              <ZoneChip label="桌面" active={!zone} onClick={() => setTarget(null)} />
              {zones.map((z) => (
                <ZoneChip
                  key={z.id}
                  label={`${(z.label || "区域").slice(0, 8)}${z.id === home?.id ? " ★" : ""}`}
                  color={z.color}
                  active={zone?.id === z.id}
                  onClick={() => setTarget(z.id)}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex shrink-0 flex-col items-start gap-1">
          <Button
            size="xs"
            variant={chosen.length ? "default" : "outline"}
            disabled={!chosen.length}
            onClick={() => play(chosen)}
          >
            {zone ? `打到「${(zone.label || "区域").slice(0, 8)}」` : "出牌"}
            {chosen.length > 1 ? ` ${chosen.length}` : ""}
          </Button>
          {[...others].map(([who, n]) => (
            <span key={who} className="whitespace-nowrap text-[10px] text-muted-foreground">
              {who} 手里 {n} 张
            </span>
          ))}
        </div>
      </div>
      {ghost}
    </div>
  );
}

function HandCard({ o, index, total, plan, step, last, px, active, dragging, onClick, onPlay, onInspect }: {
  o: GameObject;
  index: number;
  total: number;
  plan: HandPlan;
  step: number;
  last: boolean;
  px: number;
  active: boolean;
  dragging: boolean;
  onClick: () => void;
  onPlay: () => void;
  onInspect: () => void;
}) {
  const spec = o.card;
  const text = cardText(spec);
  const mid = (total - 1) / 2;
  const lean = total > 1 ? (index - mid) / mid : 0;
  /** 按住不动就算「细看」：手牌条里的牌比桌面上更小，更需要点开看 */
  const hold = useRef<number | null>(null);
  const cancelHold = () => {
    if (hold.current !== null) {
      clearTimeout(hold.current);
      hold.current = null;
    }
  };
  const arm = (e: React.PointerEvent) => {
    cancelHold();
    const x = e.clientX;
    const y = e.clientY;
    hold.current = window.setTimeout(() => {
      hold.current = null;
      onInspect();
    }, 430);
    const offMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x) + Math.abs(ev.clientY - y) > 8) cancelHold();
    };
    window.addEventListener("pointermove", offMove, { passive: true });
    window.addEventListener("pointerup", cancelHold, { once: true });
    window.addEventListener("pointercancel", cancelHold, { once: true });
  };
  useEffect(() => cancelHold, []);
  return (
    <button
      type="button"
      data-hand-id={o.id}
      title={text || "自定义卡牌"}
      onPointerDown={arm}
      onClick={onClick}
      onDoubleClick={onPlay}
      className={cn(
        "relative shrink-0 origin-bottom overflow-hidden rounded-md border bg-[#f7f4ec] text-left shadow-md transition",
        active ? "z-20 border-primary ring-2 ring-primary/50" : "border-black/40 hover:z-10 hover:brightness-110",
        dragging && "opacity-35",
      )}
      style={{
        width: plan.w,
        height: plan.h,
        marginRight: last ? 0 : step - plan.w,
        transform: `rotate(${lean * (plan.overlap > 0.5 ? 1 : 2.5)}deg) translateY(${active ? -ZOOM_LIFT : Math.abs(lean) * 3}px) scale(${active ? ZOOM_SCALE : 1})`,
      }}
    >
      {/* 整张卡面照版式画出来：手牌格是固定比例，按 contain 摆正，宽牌也不会被切掉两头 */}
      <img src={cardFaceCached(spec, o.color ?? PALETTE[1], px)} alt="" className="size-full object-contain" draggable={false} />
    </button>
  );
}
