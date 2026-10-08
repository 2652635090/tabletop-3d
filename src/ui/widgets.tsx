import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PALETTE } from "@/game/catalog";
import { Button } from "@/components/ui/button";

/**
 * 按住就一直调节的按钮：按下起效，抬手/滑出立刻停。
 * 连续变化由调用方按帧累计（和键盘共用一套），所以这里只报开始与结束，不做重复计时。
 */
export function HoldButton({ onHold, title, children, variant = "outline", className }: {
  onHold: (on: boolean) => void;
  title: string;
  children: ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
}) {
  return (
    <Button
      size="icon-xs"
      variant={variant}
      title={title}
      aria-label={title}
      className={cn("shrink-0 touch-none select-none", className)}
      // 先报开始再抢指针：触摸下 setPointerCapture 可能抛（隐式捕获已经在了），
      // 放在前面会让 onHold(true) 永远跑不到——手机上这几颗按钮就是这么按不动的
      onPointerDown={(e) => {
        e.preventDefault();
        onHold(true);
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* 手指本来就锁在这个元素上，不捕获也不会漏掉抬手 */
        }
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onLostPointerCapture={() => onHold(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </Button>
  );
}

export function Panel({ title, actions, className, bodyClassName, children }: { title?: string; actions?: ReactNode; className?: string; bodyClassName?: string; children: ReactNode }) {
  return (
    <section className={cn("panel rounded-lg", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          <h2 className="panel-title">{title}</h2>
          {actions}
        </header>
      )}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Swatches({ value, onChange, size = "md", className }: { value: string; onChange: (c: string) => void; size?: "sm" | "md"; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="radiogroup" aria-label="颜色">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`颜色 ${c}`}
          onClick={() => onChange(c)}
          data-active={value === c}
          className={cn(
            "shrink-0 rounded-full border transition",
            size === "sm" ? "size-4" : "size-6",
            value === c ? "border-primary ring-2 ring-primary/40" : "border-white/15 hover:border-white/40",
          )}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function Slot({ label, hint, onClick, children, active }: { label: string; hint?: string; onClick: () => void; children?: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ?? label}
      data-active={active ? "true" : "false"}
      className="slot tile rounded-md"
    >
      {children && <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-primary/90">{children}</span>}
      <span className="min-w-0 flex-1">
        <span className="tile-label text-xs leading-snug font-medium text-foreground/90">{label}</span>
        {hint && <span className="tile-hint text-[10px] leading-snug text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="panel-title">{label}</span>
      <span className="font-mono text-foreground/90">{value}</span>
    </div>
  );
}

/**
 * 落点选择的一格：手牌条的「打到哪」和选中栏的「摸到哪」共用这一种样子，
 * 同一个颜色点对着桌上那块区域，选中才染色。
 */
export function ZoneChip({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={cn(
        "slot flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]",
        active && "text-primary-foreground",
      )}
    >
      {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="max-w-[5.5rem] truncate">{label}</span>
    </button>
  );
}
