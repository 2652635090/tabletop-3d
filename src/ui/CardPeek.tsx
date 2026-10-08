import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { GameObject } from "@/game/types";
import { cardBackImage, cardFaceImage } from "@/three/textures";
import { cn } from "@/lib/utils";

/** 与 3D 网格同一套取面规则：牌堆扣着时用内置纹样，单张牌扣着时用它自己的卡背 */
function faceOf(o: GameObject): { up: boolean; spec: GameObject["card"]; back: string } {
  // 手里的牌只给主人看，扣着也是摊在自己眼前：细看就该看到牌面，和手牌条一致
  if (o.hand) return { up: true, spec: o.card, back: o.card?.back ?? "classic" };
  const up = o.faceUp !== false;
  if (o.kind === "card") return { up, spec: o.card, back: o.card?.back ?? "classic" };
  return { up, spec: up ? o.pile?.at(-1) : undefined, back: "classic" };
}

/**
 * 长按细看：把牌真正朝上的那一面按屏幕尺寸重画一遍。
 * 画图和桌面上的网格共用同一个绘制函数，所以这里看到的绝不会是另一面。
 */
export function CardPeek({ o, color, onClose }: { o: GameObject; color: string; onClose: () => void }) {
  const [px, setPx] = useState(700);
  useEffect(() => {
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const h = Math.min(window.innerHeight * 0.72, 620);
      setPx(Math.max(420, Math.min(1400, Math.round(h * dpr * 0.72))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const { up, spec, back } = useMemo(() => faceOf(o), [o]);
  // 牌背得跟这张牌实际的形状一致，不然扣着的牌看着被拉长了
  const ratio = o.pile?.at(-1)?.ratio ?? o.card?.ratio;
  const src = up ? cardFaceImage(spec, color, px) : cardBackImage(back, color, o.backImg, px, ratio);
  const title = up ? (spec?.label ?? spec?.rank ?? "这张牌") : "卡背";
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex w-full max-w-[min(92vw,30rem)] items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{title}</div>
          <div className="text-[11px] text-white/60">{up ? "正面" : "背面"} · {o.pile?.length ? `${o.pile.length} 张` : "1 张"}</div>
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-white/70 hover:bg-white/15 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
      <img
        src={src}
        alt={title}
        className={cn("max-h-[72vh] max-w-[92vw] rounded-lg shadow-2xl ring-1 ring-white/20")}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      {up && spec?.text && (
        <p
          className="max-w-[min(92vw,30rem)] rounded-md bg-black/55 px-3 py-2 text-center text-[12px] leading-relaxed text-white/85"
          onClick={(e) => e.stopPropagation()}
        >
          {spec.text}
        </p>
      )}
    </div>
  );
}
