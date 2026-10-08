/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, History, LogIn, RefreshCw, Trash2, X } from "lucide-react";
import type { RomMeta, RomPayload } from "@/game/api";
import type { TableArchive } from "@/game/useTable";
import { romToken } from "@/game/cache";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 存档抽屉：服务器上一份份定档下来的 ROM。
 * 它和「公开大厅」「最近房间」是三件不同的事——存档不会消失，大厅是活房间，最近只是本机记路——
 * 所以各开各的界面，不塞进同一个页签里。
 */
export function ArchiveSheet({ archive, onClose }: {
  archive: TableArchive;
  /** 摆上桌之后要把抽屉收起来，让人直接看新桌子 */
  onClose: () => void;
}) {
  const [roms, setRoms] = useState<RomMeta[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ id: string; rom: RomPayload; cached: boolean } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const wanted = useRef("");

  const reload = useCallback(async () => {
    setBusy(true);
    const list = await archive.list();
    setRoms(list.roms);
    setFromCache(list.cached);
    setAt(Date.now());
    setBusy(false);
  }, [archive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openRom = useCallback(async (id: string) => {
    setBusy(true);
    const out = await archive.open(id);
    setBusy(false);
    // 离线兜底也换了桌面，同样该把抽屉收起来让人看看桌子
    if (out) onClose();
  }, [archive, onClose]);

  const removeRom = useCallback(async (id: string) => {
    setBusy(true);
    const ok = await archive.remove(id);
    setBusy(false);
    if (!ok) return;
    setArmed(null);
    if (detail?.id === id) { setDetail(null); wanted.current = ""; }
    void reload();
  }, [archive, detail, reload]);

  const toggleDetail = useCallback(async (meta: RomMeta) => {
    if (wanted.current === meta.id) {
      wanted.current = "";
      setDetail(null);
      return;
    }
    wanted.current = meta.id;
    setDetail(null);
    setBusy(true);
    const out = await archive.read(meta.id);
    setBusy(false);
    if (out && wanted.current === meta.id) setDetail({ id: meta.id, ...out });
  }, [archive]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div className="panel my-auto flex max-h-[86dvh] w-full max-w-lg flex-col rounded-2xl p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="panel-title">定档在服务器上的桌面</p>
            <h2 className="mt-0.5 font-serif text-xl">我的存档</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon-xs" variant="ghost" aria-label="重新拉取" title="重新拉取" onClick={() => void reload()}>
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="关闭" onClick={onClose}><X className="size-3.5" /></Button>
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          定档下来的桌面存在服务器上：不受空闲清理影响，谁拿着存档号都能摆出一张新桌。
          只有当初定档的这台浏览器能覆盖或删除它——口令没有另存，服务器那边只留着它的摘要。
        </p>

        <div className="scrollbar-thin mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
          {fromCache && (
            <p className="flex items-center gap-1.5 rounded-md border border-border/60 bg-black/25 px-2 py-1.5 text-[11px] text-muted-foreground">
              <CloudOff className="size-3.5 shrink-0" />
              连不上服务器，这份列表与桌况都来自本机缓存。
            </p>
          )}
          {roms.length === 0 && !busy && (
            <p className="rounded-md border border-border/60 bg-black/20 px-2.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
              还没有存档。在右侧「房间」面板里点「存为 ROM」，就能把现在的桌面定档到服务器上，随时再摆回一张新桌。
            </p>
          )}
          {roms.map((r) => (
            <RomRow
              key={r.id}
              rom={r}
              mine={!!romToken(r.id)}
              current={archive.romId === r.id}
              expanded={detail?.id === r.id}
              detail={detail?.id === r.id ? detail : null}
              armed={armed === r.id}
              busy={busy}
              onToggle={() => void toggleDetail(r)}
              onOpen={() => void openRom(r.id)}
              onArm={() => setArmed(r.id)}
              onCancel={() => setArmed(null)}
              onRemove={() => void removeRom(r.id)}
            />
          ))}
        </div>

        {!archive.supported && (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            这个站点还没有开通房间存档功能，上面的内容都来自这台浏览器的缓存。
          </p>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <History className="size-3 shrink-0" />
          {at ? `列表更新于 ${since(at)}` : "正在读取…"} · 定档口令只存在定档这台浏览器里
        </p>
      </div>
    </div>
  );
}

function RomRow({ rom, mine, current, expanded, detail, armed, busy, onToggle, onOpen, onArm, onCancel, onRemove }: {
  rom: RomMeta;
  mine: boolean;
  current: boolean;
  expanded: boolean;
  detail: { rom: RomPayload; cached: boolean } | null;
  armed: boolean;
  busy: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onArm: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={cn("rounded-lg border bg-black/25", current ? "border-primary/60" : "border-border/60")}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-start" aria-expanded={expanded}>
          <span className="flex items-center gap-1.5">
            <code className="font-mono text-sm tracking-[0.15em] text-primary">{rom.id}</code>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{rom.title || "未命名存档"}</span>
            {current && <span className="shrink-0 rounded bg-primary/25 px-1 text-[9px] text-primary">桌上这份</span>}
            {mine && <span className="shrink-0 rounded bg-white/10 px-1 text-[9px] text-white/70">本机可改</span>}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {rom.owner || "匿名"} · {rom.objects} 个物件 · {since(rom.updatedAt)}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="xs" variant="outline" className="gap-1" disabled={busy} onClick={onOpen}>
            <LogIn className="size-3" />摆上桌
          </Button>
          {mine && (armed ? (
            <>
              <Button size="xs" variant="ghost" className="text-destructive" disabled={busy} onClick={onRemove}>确认删除</Button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={onCancel}>取消</Button>
            </>
          ) : (
            <Button size="icon-xs" variant="ghost" aria-label={`删除存档 ${rom.id}`} title="删除存档" className="text-muted-foreground hover:text-destructive" onClick={onArm}>
              <Trash2 className="size-3.5" />
            </Button>
          ))}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {!detail && <p>正在读取桌况…</p>}
          {detail && (
            <>
              <p>
                {detail.cached && <span className="me-1 rounded bg-white/10 px-1 text-[9px] text-white/70">缓存桌况</span>}
                这份存档里当前摆着 {detail.rom.state.o.length} 个物件、{detail.rom.state.players.length} 个座位。
                摆上桌会开出一个新房间，原存档本身不会被动过。
              </p>
              {detail.rom.note && <p className="mt-1 text-foreground/80">备注：{detail.rom.note}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function since(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.round(s / 60)}分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)}小时前`;
  return `${Math.round(s / 86400)}天前`;
}
