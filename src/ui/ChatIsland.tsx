import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@/game/types";

/** 气泡停留时长与淡出动画时长 */
const HOLD = 4200;
const FADE = 380;

/**
 * 灵动岛式聊天气泡：只占顶部一小条，不挡视线。
 * 点开它才会打开聊天面板并聚焦输入框；旧消息（首次挂载之前的）不弹。
 */
export function ChatIsland({ chat, mine, onOpen, top }: {
  chat: LogEntry[];
  mine: (l: LogEntry) => boolean;
  onOpen: () => void;
  top: string;
}) {
  const [shown, setShown] = useState<LogEntry | null>(null);
  const [on, setOn] = useState(false);
  const lastId = useRef<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const last = chat[chat.length - 1];
    // 首次挂载：把历史里最后一条记下但不弹
    if (lastId.current === null) {
      lastId.current = last?.id ?? "";
      return;
    }
    if (!last || last.id === lastId.current) return;
    lastId.current = last.id;
    if (mine(last)) return;
    for (const t of timers.current) window.clearTimeout(t);
    setShown(last);
    setOn(false);
    // 先以透明状态挂上去，下一帧再淡入，不然出现的瞬间没有过渡
    timers.current = [
      window.setTimeout(() => setOn(true), 30),
      window.setTimeout(() => setOn(false), HOLD),
      window.setTimeout(() => setShown(null), HOLD + FADE),
    ];
  }, [chat, mine]);

  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t); }, []);

  if (!shown) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2" style={{ top }}>
      <button
        type="button"
        onClick={onOpen}
        className="panel pointer-events-auto flex max-w-[78vw] items-center gap-1.5 rounded-full border-border/70 px-2.5 py-1 text-[11px] shadow-lg transition-opacity duration-300"
        style={{ opacity: on ? 1 : 0 }}
        title="打开聊天"
      >
        <span className="size-1.5 shrink-0 rounded-full ring-1 ring-white/25" style={{ background: shown.color ?? "var(--primary)" }} />
        <span className="shrink-0 font-medium" style={{ color: shown.color ?? undefined }}>{shown.by}</span>
        <span className="truncate text-foreground/85">{shown.text}</span>
      </button>
    </div>
  );
}
