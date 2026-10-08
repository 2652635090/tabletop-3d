/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Clock, Copy, Crown, DatabaseBackup, Fingerprint, LogOut, Megaphone, MessageSquare, Minus, Plus, Save, Send, ShieldCheck, Users, Wifi, X } from "lucide-react";
import type { Presence, TableState } from "@/game/types";
import { HAND_ZONE_SUFFIX, chatAction, turnAction } from "@/game/ops";
import { inRange, seatDistance, seatsOf } from "@/game/range";
import { newPlayer } from "@/game/state";
import type { TableArchive, TableManage } from "@/game/useTable";
import { fpShort } from "@/game/fingerprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "./widgets";
import { cn } from "@/lib/utils";

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}秒前`;
  if (s < 3600) return `${Math.round(s / 60)}分前`;
  return `${Math.round(s / 3600)}小时前`;
}

/** 座位表里的名字：自动手牌区叫「某某的手牌」，表头只要前面那截 */
function short(name: string): string {
  return name.replace(HAND_ZONE_SUFFIX, "").slice(0, 4) || "区域";
}

/** 右侧一次只露一块：三页签轮流占满那条竖边 */
const VIEWS = [
  { id: "log", label: "记录", icon: Clock, hint: "动作流水与聊天，只看这一屏" },
  { id: "room", label: "房间", icon: Wifi, hint: "房间码、挂牌、昵称与存档入口" },
  { id: "seat", label: "座位", icon: Users, hint: "谁在席、轮到谁、下一位是谁" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

export function TablePanel({ state, onAction, mode, code, status, presence, busy, onLeave, peers, chatGoto, onChatSeen, archive, manage, gaming, nick, onNick, fp, onOpenArchives, onOpenLobby, onOpenManage, onOpenCache, onClose }: {
  state: TableState;
  onAction: (a: ReturnType<typeof chatAction>) => void;
  mode: "local" | "online";
  code: string | null;
  status: string;
  presence: Presence;
  busy: boolean;
  onLeave: () => void;
  peers: number;
  /** 每 +1 就跳到聊天页签并聚焦输入框（顶部气泡和头部的快捷入口都用它） */
  chatGoto: number;
  onChatSeen: (id: string) => void;
  /** 持久化房间：定档、挂牌与各条抽屉的入口都收在房间面板这一块 */
  archive: TableArchive;
  /** 房主管理：公开私密与逐项权限都住在那条抽屉里 */
  manage: TableManage;
  /** 游戏中：清空桌面这种摆桌子的活收起来，开关本身在「管理」抽屉里 */
  gaming: boolean;
  /** 自己的昵称与这台浏览器的指纹短号 */
  nick: string;
  onNick: (name: string) => void;
  fp: string;
  onOpenArchives: () => void;
  onOpenLobby: () => void;
  onOpenManage: () => void;
  onOpenCache: () => void;
  /** 窄屏抽屉：收起那颗按钮住在页签条右端，不再单独占一行 */
  onClose?: () => void;
}) {
  const [view, setView] = useState<ViewId>("room");
  const [tab, setTab] = useState<"log" | "chat">("log");
  const [draft, setDraft] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [nickDraft, setNickDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** 定档表单：id 非空是覆盖自己的旧档，null 是另存新档 */
  const [romForm, setRomForm] = useState<{ id: string | null } | null>(null);
  const [romTitle, setRomTitle] = useState("");
  const [romNote, setRomNote] = useState("");
  const [savingRom, setSavingRom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => state.log.slice().reverse(), [state.log]);
  const chat = useMemo(() => state.log.filter((l) => l.kind === "chat").slice().reverse(), [state.log]);
  const online = useMemo(() => Object.entries(presence).map(([id, p]) => ({ id, ...p })).sort((a, b) => b.at - a.at), [presence]);
  /** 桌上的座位：有主人的区域垫绕桌心一圈排好，两家隔着几家从这里数 */
  const seats = useMemo(() => seatsOf(state), [state]);
  const current = state.players[state.turn];

  useEffect(() => {
    if (!chatGoto) return;
    setView("log");
    setTab("chat");
    // 面板展开有动画，立刻聚焦会让浏览器横向滚到屏幕外那个位置
    const t = window.setTimeout(() => inputRef.current?.focus(), 160);
    return () => window.clearTimeout(t);
  }, [chatGoto]);

  /** 停在记录页签的聊天上看到的都算读过，顶部红点才会清掉 */
  useEffect(() => {
    if (view !== "log" || tab !== "chat") return;
    onChatSeen(chat[0]?.id ?? "");
  }, [view, tab, chat, onChatSeen]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onAction(chatAction(text.slice(0, 200)));
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="panel flex shrink-0 items-center gap-0.5 rounded-lg p-1" role="tablist" aria-label="房间面板内容">
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            size="xs"
            role="tab"
            aria-selected={view === v.id}
            variant={view === v.id ? "secondary" : "ghost"}
            className="min-w-0 flex-1 gap-1"
            title={v.hint}
            onClick={() => setView(v.id)}
          >
            <v.icon className="size-3.5 shrink-0" />
            {v.label}
          </Button>
        ))}
      </div>

      {view === "room" && (
      <Panel
        title="房间"
        className="flex min-h-0 flex-1 flex-col"
        bodyClassName="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
        actions={onClose && (
          <Button size="icon-xs" variant="ghost" className="shrink-0 -me-1" title="收起这块面板" aria-label="收起面板" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        )}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-serif text-sm text-foreground/95">{state.name}</span>
            <span className={cn("flex items-center gap-1 text-[11px]", mode === "online" ? "text-emerald-300" : "text-muted-foreground")}>
              {mode === "online" ? <><Wifi className="size-3" />{busy ? "同步中" : `已连接 · ${peers}人`}</> : <><Users className="size-3" />本地</>}
            </span>
          </div>
          {code && (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border/70 bg-black/40 px-2 py-1.5 font-mono text-lg tracking-[0.3em] text-primary">{code}</code>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(code).catch(() => undefined);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                }}
              >
                <Copy className="size-3" />
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
          )}
          {mode === "online" && (
            <div className="flex items-center justify-between gap-2">
              <span className="panel-title">挂牌</span>
              <span className="flex items-center gap-1">
                <span className={cn("text-[11px]", manage.room?.pub ? "text-emerald-300" : "text-muted-foreground")}>
                  {manage.room ? (manage.room.pub ? "公开：谁都能从大厅进来" : "私密：只认房间码") : archive.listed ? "公开：谁都能从大厅进来" : "私密：只认房间码"}
                </span>
                <Button size="xs" variant="outline" className="shrink-0 gap-1" onClick={onOpenManage}>
                  <ShieldCheck className="size-3" />{manage.host ? "房主管理" : "我的权限"}
                </Button>
              </span>
            </div>
          )}
          {/* 大厅不只在联网时才给看：本地桌面也想知道此刻谁挂着牌 */}
          {archive.supported && (
            <div className="flex items-center justify-between gap-2">
              <span className="panel-title shrink-0">大厅</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[11px] text-muted-foreground">
                  {mode === "online" ? "公开牌桌与此刻在线的人" : "看看别人的公开牌桌，点一下就坐过去"}
                </span>
                <Button size="xs" variant="outline" className="shrink-0 gap-1" onClick={onOpenLobby}>
                  <Users className="size-3" />公开房
                </Button>
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="panel-title shrink-0">昵称</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Input
                value={nickDraft ?? nick}
                onChange={(e) => setNickDraft(e.target.value)}
                onBlur={() => {
                  if (nickDraft !== null && nickDraft.trim() && nickDraft.trim() !== nick) onNick(nickDraft);
                  setNickDraft(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                maxLength={16}
                placeholder="同桌的人看到的名字"
                className="h-7 min-w-0 flex-1 text-xs"
              />
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/60" title="这台浏览器的指纹短号：昵称会撞车，它不会">
                <Fingerprint className="me-1 inline size-2.5 align-[-1px]" />#{fpShort(fp)}
              </span>
            </span>
          </div>
          {mode === "online" && archive.supported && (
            <div className="space-y-1.5 rounded-md border border-border/60 bg-black/25 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="panel-title">持久化</span>
                <span className="flex items-center gap-1">
                  <Button size="xs" variant="ghost" className="gap-1 text-muted-foreground" onClick={onOpenArchives}>
                    <Archive className="size-3" />存档
                  </Button>
                </span>
              </div>
              {romForm ? (
                <form
                  className="space-y-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (savingRom) return;
                    setSavingRom(true);
                    void archive.save({ id: romForm.id, title: romTitle.trim() || state.name, note: romNote.trim() }).then((out) => {
                      setSavingRom(false);
                      if (out) setRomForm(null);
                    });
                  }}
                >
                  <Input value={romTitle} onChange={(e) => setRomTitle(e.target.value)} placeholder={romForm.id ? `覆盖 ${romForm.id} 的名称` : "存档名称"} maxLength={40} className="h-8 text-xs" />
                  <Input value={romNote} onChange={(e) => setRomNote(e.target.value)} placeholder="备注（可选）" maxLength={160} className="h-8 text-xs" />
                  <div className="flex gap-1.5">
                    <Button type="submit" size="xs" className="flex-1" disabled={savingRom}>{savingRom ? "定档中…" : romForm.id ? "覆盖存档" : "存为 ROM"}</Button>
                    <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setRomForm(null)}>取消</Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      className="flex-1 gap-1"
                      onClick={() => { setRomTitle(""); setRomNote(""); setRomForm({ id: archive.romId }); }}
                    >
                      <Save className="size-3" />{archive.romId ? `更新 ${archive.romId}` : "存为 ROM"}
                    </Button>
                    <Button size="xs" variant={archive.listed ? "secondary" : "outline"} className="flex-1 gap-1" onClick={() => void archive.feature(!archive.listed)}>
                      <Megaphone className="size-3" />{archive.listed ? "已挂牌" : "挂牌大厅"}
                    </Button>
                  </div>
                  {archive.romId && (
                    <Button size="xs" variant="ghost" className="w-full text-muted-foreground" onClick={() => { setRomTitle(""); setRomNote(""); setRomForm({ id: null }); }}>
                      另存成新存档
                    </Button>
                  )}
                </>
              )}
              <p className="text-[10px] leading-snug text-muted-foreground">
                {romForm?.id ?? archive.romId
                  ? "覆盖只把当前桌面写回这份存档，房间本身不受影响。"
                  : "定档后这张桌子就存进服务器，不受空闲清理影响，随时能再摆回一张新桌。"}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-[10px] leading-snug text-muted-foreground">
              {mode === "online" ? "桌况会随手存进这台浏览器，断线与刷新都能离线接着摆。" : "本地桌面的改动会随手存进这台浏览器。"}
            </p>
            <Button size="xs" variant="ghost" className="shrink-0 gap-1 text-muted-foreground" onClick={onOpenCache}>
              <DatabaseBackup className="size-3" />缓存
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{status}</p>
          {mode === "online" && (
            <div className="flex items-start justify-between gap-2">
              <span className="panel-title shrink-0">在线</span>
              <div className="flex min-w-0 flex-wrap justify-end gap-1">
                {online.length === 0 && <span className="text-[11px] text-muted-foreground">等待其他玩家连接…</span>}
                {online.map((p) => (
                  <span key={p.name + p.at} className="flex items-center gap-1 rounded-full border border-border/60 bg-black/30 px-1.5 py-0.5 text-[10px]">
                    <span className="size-1.5 rounded-full" style={{ background: p.color }} />
                    {p.name}
                    {p.fp && <code className="font-mono text-white/45">#{fpShort(p.fp)}</code>}
                    {p.id === manage.room?.owner && <Crown className="size-2.5 text-primary" aria-label="房主" />}
                    {typeof p.rtt === "number" && <span className="tabular-nums text-white/45">{p.rtt}ms</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mode === "online" && (
            <Button size="xs" variant="ghost" onClick={onLeave} className="gap-1 text-muted-foreground">
              <LogOut className="size-3" />离开房间（保留桌面）
            </Button>
          )}
        </div>
      </Panel>
      )}

      {view === "seat" && (
      <Panel title="座位与回合" className="flex min-h-0 flex-1 flex-col" bodyClassName="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
            {state.players.length === 0 && <p className="text-[11px] text-muted-foreground">还没有玩家入座。添加玩家后可以轮流出牌。</p>}
            {state.players.map((p, i) => (
              <div key={p.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1", i === state.turn ? "border-primary/60 bg-primary/10" : "border-transparent")}>
                <span className="size-3 shrink-0 rounded-full ring-1 ring-white/25" style={{ background: p.color }} />
                <button type="button" className="flex-1 truncate text-left text-xs hover:underline" onClick={() => onAction(turnAction(i))} title="设为当前回合">
                  {p.name}
                </button>
                {i === state.turn && <Crown className="size-3.5 shrink-0 text-primary" />}
                <button
                  type="button"
                  aria-label={`移出 ${p.name}`}
                  className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-destructive"
                  onClick={() => onAction({ t: "playerRemove", id: p.id })}
                >
                  <Minus className="size-3.5" />
                </button>
              </div>
            ))}
            {seats.length > 1 && (
              <div className="mt-2 border-t border-border/50 pt-2">
                <p className="panel-title mb-1 text-[10px]">座位距离</p>
                <p className="mb-1 text-[10px] leading-snug text-muted-foreground">
                  绕桌一圈数座位：横着这一行是谁进攻，竖列是被打的那家，格里的数字是数过去几家——<span className="text-primary">亮起</span>的打得着。各家攻防范围在桌上选中那块区域垫调。
                </p>
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="border-collapse text-[10px]">
                    <thead>
                      <tr>
                        <th className="sticky start-0 bg-panel p-1 text-start font-normal text-muted-foreground">家</th>
                        {seats.map((to) => <th key={to.o.id} className="max-w-12 truncate p-1 font-normal text-muted-foreground" title={to.name}>{short(to.name)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {seats.map((from) => (
                        <tr key={from.o.id}>
                          <th className="sticky start-0 max-w-16 truncate bg-panel p-1 text-start font-normal" title={`${from.name} · 攻 ${from.reach} 家 / 守 +${from.guard} 家`}>{short(from.name)}</th>
                          {seats.map((to) => {
                            const d = seatDistance(from, to, seats.length);
                            return (
                              <td
                                key={to.o.id}
                                className={cn("p-1 text-center font-mono", from.o.id === to.o.id ? "text-muted-foreground/40" : inRange(from, to, seats.length) ? "rounded-sm bg-primary/20 text-primary-foreground" : "text-muted-foreground")}
                              >
                                {from.o.id === to.o.id ? "·" : d}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <form
            className="flex shrink-0 gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!playerName.trim() || state.players.length >= 8) return;
              onAction({ t: "playerAdd", player: newPlayer(playerName, state.players.length) });
              setPlayerName("");
            }}
          >
            <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="玩家名字" maxLength={16} className="h-8 min-w-0 flex-1 text-xs" />
            <Button type="submit" size="xs" variant="outline" className="shrink-0" disabled={state.players.length >= 8}><Plus className="size-3" />入座</Button>
          </form>
          <div className="flex shrink-0 gap-1.5">
            <Button size="xs" className="flex-1" disabled={!state.players.length} onClick={() => onAction({ t: "turnNext" })}>下一位</Button>
            {/* 清空桌面写的是 {t:"clear"}，游戏模式里整颗按钮不收起来就是留一个按不动的坑 */}
            {!gaming && (
              <Button size="xs" variant="outline" className="flex-1" onClick={() => onAction({ t: "clear" })}>清空桌面</Button>
            )}
          </div>
          {current && (
            <p className="shrink-0 text-[11px] text-muted-foreground">
              当前回合：<span className="text-foreground/90">{current.name}</span> · 顺时针{state.step === -1 ? "（反向）" : ""}
            </p>
          )}
        </div>
      </Panel>
      )}

      {view === "log" && (
      <Panel
        title="桌面记录"
        className="flex min-h-0 flex-1 flex-col"
        bodyClassName="flex min-h-0 flex-1 flex-col"
        actions={
          <div className="flex gap-1">
            <Button size="xs" variant={tab === "log" ? "secondary" : "ghost"} onClick={() => setTab("log")}>
              <Clock className="size-3" />动作
            </Button>
            <Button size="xs" variant={tab === "chat" ? "secondary" : "ghost"} onClick={() => setTab("chat")}>
              <MessageSquare className="size-3" />聊天
            </Button>
          </div>
        }
      >
        {tab === "log" ? (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pe-1">
            {entries.length === 0 && <p className="text-[11px] text-muted-foreground">还没有动作。拖动棋子、掷骰或抽牌都会记录在这里。</p>}
            {entries.map((l) => (
              <div
                key={l.id}
                className={cn(
                  "log-line flex gap-2 py-1 text-[11px] leading-snug",
                  l.kind === "effect" && "rounded-e-sm border-s-2 border-primary/60 bg-primary/[0.08] ps-1.5",
                  l.kind === "timer" && "text-muted-foreground",
                )}
              >
                <span className="w-11 shrink-0 text-right font-mono text-[10px] text-muted-foreground/70">{ago(l.at)}</span>
                <span className={cn("w-14 shrink-0 truncate", l.kind === "effect" && "text-primary/90")} style={l.kind === "effect" ? undefined : { color: l.color ?? "var(--muted-foreground)" }}>
                  {l.kind === "effect" ? "效果" : l.by}
                </span>
                <span className={cn("flex-1", l.kind === "effect" ? "font-serif text-foreground" : "text-foreground/85")}>{l.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pe-1">
              {chat.length === 0 && <p className="text-[11px] text-muted-foreground">还没有人说话。</p>}
              {chat.map((l) => (
                <div key={l.id} className="log-line py-1 text-[11px]">
                  <span className="me-1.5 font-medium" style={{ color: l.color ?? "var(--muted-foreground)" }}>{l.by}:</span>
                  <span className="text-foreground/85">{l.text}</span>
                </div>
              ))}
            </div>
            <form
              className="mt-2 flex shrink-0 gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <Input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="说点什么" maxLength={200} className="h-8 text-xs" />
              <Button type="submit" size="icon-sm" variant="outline" aria-label="发送"><Send className="size-3.5" /></Button>
            </form>
          </div>
        )}
      </Panel>
      )}
    </div>
  );
}
