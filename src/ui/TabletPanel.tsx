/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { useMemo } from "react";
import { ExternalLink, X } from "lucide-react";
import { biliOf, fixTablet, mmss, tabletPos } from "@/game/catalog";
import { COARSE_POINTER } from "@/game/view";
import { tabletFrame, tabletHost } from "@/game/tablet";
import type { GameObject } from "@/game/types";
import { Button } from "@/components/ui/button";

/**
 * 放大观看：把这块屏从 3D 里捞出来浮在桌面上，里面就是那块页面自己的控件。
 *
 * B 站那一种页面上有它自己的进度条、弹幕、全屏，别的站点有它们自己那一套，桌上那套走带按钮才归我们——
 * 跨源读不到它也写不进它，所以这边一按，那块屏只能换个 t= 重新挂一次。
 */
export function TabletPanel({ o, onClose }: { o: GameObject; onClose: () => void }) {
  const t = fixTablet(o.tablet);
  const bili = biliOf(t.url);
  /**
   * 走带参数一变就把页面整个重装：pos/at 是桌面上那一份，浏览途中的每一帧都不变，
   * 所以只有换页、切集、起停、静音、跳段、重新载入这几下才会重挂。
   * 触屏不挂弹幕层，和桌上那块屏同一个口径；这里开着的时候桌上那一份由渲染层收掉，同一时刻只有一份在解码。
   */
  const key = `${t.url}|${t.page}|${t.playing}|${t.pos}|${t.at}|${t.mute}|${t.rev}`;
  const src = useMemo(() => {
    const spec = fixTablet(o.tablet);
    if (!spec.url) return "";
    return tabletFrame(spec, spec.playing ? tabletPos(spec) : spec.pos, !COARSE_POINTER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const head = o.label || (t.url ? tabletHost(t.url) : "平板浏览器");
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/75 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex w-full max-w-[min(96vw,72rem)] items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{head}</div>
          <div className="truncate text-[11px] text-white/60">
            {t.url
              ? bili
                ? `${tabletHost(t.url)} · 第 ${t.page} 集 · ${t.playing ? `放映中 ${mmss(tabletPos(t))}` : `停在 ${mmss(t.pos)}`} · ${t.mute ? "全桌静音" : "全桌出声"}`
                : t.url
              : "这块屏空着，没挂页面"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {t.url && (
            <a
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-white/70 hover:bg-white/15 hover:text-white"
              title="这个站点不许被嵌进来（或者你想用满整屏）：开一个新标签直接去看，全桌的读数不受影响"
            >
              <ExternalLink className="size-3.5" />新标签打开
            </a>
          )}
          <Button size="icon-xs" variant="ghost" aria-label="关闭" className="shrink-0 text-white/70 hover:bg-white/15 hover:text-white" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {src ? (
        <iframe
          key={key}
          src={src}
          title={head}
          className="aspect-video w-full max-w-[min(96vw,calc((100vh-11rem)*16/9))] rounded-lg border-0 bg-black shadow-2xl ring-1 ring-white/20"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="flex aspect-video w-full max-w-[min(96vw,calc((100vh-11rem)*16/9))] items-center justify-center rounded-lg bg-black/60 px-6 text-center text-sm text-white/70 ring-1 ring-white/15">
          屏上还没有页面：关掉这里，选中那台平板，在「平板浏览器」那一栏贴一条网址或 BV 号进来。
        </div>
      )}

      <p className="max-w-[min(96vw,44rem)] text-center text-[11px] leading-relaxed text-white/60" onClick={(e) => e.stopPropagation()}>
        这块屏里点开的链接、拖到的进度，只有你自己这台机器看得见——页面是别家的，我们读不到它真实停在哪，桌上的读数不会跟着走。
        要对齐全桌就回到选中栏，用「挪」「拨到」或换一条地址{bili ? "；片子上有声音却听不见就先点一下播放，浏览器要先听到这一下才肯出声" : "。"}
        一片空白多半是那个站点不肯被嵌进来（不少银行、内网和大站都这么设），用上面的「新标签打开」。
      </p>
    </div>
  );
}
