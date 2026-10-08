/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen, LogIn, Megaphone, RefreshCw, Users, Wifi, X } from "lucide-react";
import type { ListedRoom } from "@/game/api";
import type { LobbyUser } from "@/game/types";
import { fpShort } from "@/game/fingerprint";
import type { TableArchive } from "@/game/useTable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 名单是「此刻」的快照：打开时立刻拉一次，之后每 6 秒跟着刷，关掉就停 */
const REFRESH_MS = 6000;

/**
 * 总站大厅：两页名单——此刻挂着牌的活房间，以及这台服务器上在线的人。
 * 和「我的存档」不是一回事——这里每一条都是活着的东西，人走空就会被清掉，所以只谈入座，不谈删除。
 */
export function LobbySheet({ archive, online, mode, code, onRefresh, onClose, onLeave, onJoin }: {
  archive: TableArchive;
  online: LobbyUser[];
  mode: "local" | "online";
  code: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onLeave: () => void;
  onJoin: (code: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"rooms" | "people">("rooms");
  const [rooms, setRooms] = useState<ListedRoom[]>([]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const pull = useCallback(async () => {
    setBusy(true);
    onRefresh();
    setRooms(await archive.lobby());
    setBusy(false);
    setTried(true);
  }, [archive, onRefresh]);
  // 拉名单这件事每 6 秒一次：走 ref 才不会被调用方的身份变化反复重启定时器
  const pullRef = useRef(pull);
  pullRef.current = pull;

  useEffect(() => {
    void pullRef.current();
    const id = window.setInterval(() => void pullRef.current(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const join = useCallback(async (target: string) => {
    setBusy(true);
    const ok = await onJoin(target);
    setBusy(false);
    if (ok) onClose();
  }, [busy, onJoin, onClose]);

  /** 在线名单按房间聚在一起：同一桌的人挨着排，才知道谁在等谁 */
  const people = useMemo(() => {
    const sorted = online.slice().sort((a, b) => (a.room ?? "").localeCompare(b.room ?? "") || b.at - a.at);
    return sorted;
  }, [online]);
  const idle = useMemo(() => people.filter((p) => !p.room).length, [people]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div className="panel my-auto flex max-h-[86dvh] w-full max-w-lg flex-col rounded-2xl p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="panel-title">此刻的活房间与在线的人</p>
            <h2 className="mt-0.5 font-serif text-xl">总站大厅</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon-xs" variant="ghost" aria-label="重新拉取" title="重新拉取" onClick={() => void pull()}>
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="关闭" onClick={onClose}><X className="size-3.5" /></Button>
          </div>
        </div>

        <div className="mt-2.5 flex gap-1" role="tablist" aria-label="大厅名单">
          <Button size="xs" variant={tab === "rooms" ? "secondary" : "ghost"} role="tab" aria-selected={tab === "rooms"} onClick={() => setTab("rooms")}>
            <DoorOpen className="size-3" />公开牌桌 {rooms.length || ""}
          </Button>
          <Button size="xs" variant={tab === "people" ? "secondary" : "ghost"} role="tab" aria-selected={tab === "people"} onClick={() => { setTab("people"); onRefresh(); }}>
            <Users className="size-3" />总站在线 {online.length || ""}
          </Button>
        </div>

        <div className="scrollbar-thin mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
          {tab === "rooms" ? (
            <>
              {rooms.length === 0 && tried && !busy && (
                <p className="rounded-md border border-border/60 bg-black/20 px-2.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
                  现在没有挂牌的牌桌。自己的房间可以在「房间」面板里设成公开，挂出来让陌生人进来。
                </p>
              )}
              {rooms.map((r) => (
                <div key={r.code} className="rounded-lg border border-border/60 bg-black/25 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm tracking-[0.2em] text-primary">{r.code}</code>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{r.name}</span>
                    <Button
                      size="xs"
                      variant="outline"
                      className="shrink-0 gap-1"
                      disabled={busy || r.code === code}
                      onClick={() => void join(r.code)}
                    >
                      <LogIn className="size-3" />{r.code === code ? "已在座" : "入座"}
                    </Button>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Users className="size-3" />{r.peers} 人在座</span>
                    {r.host && <span>· 房主 {r.host}</span>}
                    <span>· {r.objects} 个物件 · {since(r.updatedAt)}</span>
                    {r.romId && <span className="rounded bg-white/10 px-1 py-px">来自存档 {r.romId}</span>}
                  </p>
                </div>
              ))}
            </>
          ) : (
            <>
              {people.length === 0 && (
                <p className="rounded-md border border-border/60 bg-black/20 px-2.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
                  总站此刻没人在线。这个服务器只记昵称与指纹短号，谁在哪个房间看得见，别的一概不上来。
                </p>
              )}
              {people.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-black/25 px-2.5 py-1.5 text-xs">
                  <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/25" style={{ background: p.color }} />
                  <span className="min-w-0 flex-1 truncate">{p.name || "匿名"}</span>
                  <code className="shrink-0 font-mono text-[10px] text-white/45">#{fpShort(p.fp)}</code>
                  {p.room ? (
                    <>
                      <code className="shrink-0 font-mono text-[10px] tracking-[0.15em] text-primary/90">{p.room}</code>
                      <Button size="xs" variant="ghost" className="shrink-0" disabled={busy || p.room === code} onClick={() => void join(p.room!)}>
                        {p.room === code ? "同桌" : "过去"}
                      </Button>
                    </>
                  ) : (
                    <span className="shrink-0 text-[10px] text-muted-foreground">本地桌面</span>
                  )}
                </div>
              ))}
              {people.length > 0 && (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  共 {people.length} 台浏览器在线，其中 {idle} 台还坐在本地桌面上。「过去」是拿房间码直接进那一桌，公开房不用先问谁。
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] text-muted-foreground">
            <Megaphone className="size-3 shrink-0" />
            {mode === "local"
              ? "你在本地桌面上：挑一桌公开牌网点「入座」就直接坐过去"
              : archive.listed ? "当前房间已经挂在大厅里" : "当前房间没有挂牌，别人搜不到它"}
          </p>
          {mode === "online" && (
            <Button size="xs" variant="ghost" className="shrink-0 gap-1 text-muted-foreground" onClick={onLeave}>
              <Wifi className="size-3" />回本地桌面
            </Button>
          )}
        </div>
      </div>
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
