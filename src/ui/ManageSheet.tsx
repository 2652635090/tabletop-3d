import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Archive, Check, Crown, DoorOpen, ShieldAlert, ShieldCheck, UserMinus, X } from "lucide-react";
import { PERM_GROUPS, PERM_KEYS, ALL_OPEN, ALL_SHUT, MEMBER_DEFAULT, allowed, permLabel, type PermKey, type Perms } from "@/game/perm";
import { fpShort } from "@/game/fingerprint";
import type { Presence } from "@/game/types";
import type { TableManage } from "@/game/useTable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 三档预设：一把全开、退回正常游玩、全部收回 */
const PRESETS: { label: string; hint: string; perms: Perms }[] = [
  { label: "全部开放", hint: "除分配权限外成员能做一切（含挂牌与存档）", perms: ALL_OPEN },
  { label: "只留游玩", hint: "能摆牌能掷骰，动不了牌桌设置和房间管理", perms: MEMBER_DEFAULT },
  { label: "全部收回", hint: "成员只能看，桌上的一切都等房主动手", perms: ALL_SHUT },
];

/**
 * 房主管理面板：房间状况、游戏模式、在座成员、公开私密、以及 23 项功能权限逐条分配。
 *
 * 这些开关写的都是服务端那份房间记录，口令只存在开房那台浏览器上，
 * 所以成员打开同一个面板只会看到「我拿到哪些权限」，改不动任何东西。
 */
export function ManageSheet({ manage, presence, me, code, listed, localGame, onLocalGame, onClose, onOpenLobby, onOpenArchives, onLeave }: {
  manage: TableManage;
  presence: Presence;
  me: { id: string; name: string; color: string };
  code: string | null;
  listed: boolean;
  /** 本机那一档游戏模式：存在这台浏览器的偏好里，没联网也能开 */
  localGame: boolean;
  onLocalGame(next: boolean): void;
  onClose: () => void;
  onOpenLobby: () => void;
  onOpenArchives: () => void;
  onLeave: () => void;
}) {
  const room = manage.room;
  const host = manage.host;
  const [draft, setDraft] = useState<Perms>({});
  const [busy, setBusy] = useState(false);
  const [gmBusy, setGmBusy] = useState(false);

  // 换房间、或服务端那份权限表真的变了，才丢掉本地草稿。
  // 不能按 room.perms 的引用比：每一次同步都会解析出一个新对象，那样刚勾上就被清空。
  const permsKey = useMemo(() => JSON.stringify(room?.perms ?? null), [room?.perms]);
  useEffect(() => {
    setDraft({});
  }, [code, permsKey]);

  const value = useCallback((key: PermKey) => draft[key] ?? allowed(room?.perms, key), [draft, room?.perms]);
  const dirty = useMemo(() => PERM_KEYS.some((k) => draft[k] !== undefined && draft[k] !== allowed(room?.perms, k)), [draft, room?.perms]);
  const open = useMemo(() => PERM_KEYS.filter((k) => value(k)).length, [value]);

  const committed = room ? PERM_KEYS.reduce<Perms>((out, k) => ({ ...out, [k]: value(k) }), {}) : null;

  const seats = useMemo(
    () => Object.entries(presence)
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => (a.id === room?.owner ? -1 : b.id === room?.owner ? 1 : b.at - a.at)),
    [presence, room?.owner],
  );
  const mine = useMemo(() => PERM_KEYS.filter((k) => manage.granted(k)), [manage]);

  const applyPreset = (perms: Perms) => {
    const next: Perms = {};
    for (const k of PERM_KEYS) next[k] = allowed(perms, k);
    setDraft(next);
  };

  const save = async () => {
    if (!committed || busy) return;
    setBusy(true);
    const ok = await manage.setPerms(committed);
    setBusy(false);
    if (ok) setDraft({});
  };

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[3px]" onClick={onClose}>
      <div className="panel my-auto flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-2xl p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="panel-title flex items-center gap-1.5">
              {host ? <><ShieldCheck className="size-3.5 text-primary" />房主管理</> : <><ShieldAlert className="size-3.5" />房间权限</>}
            </p>
            <h2 className="mt-0.5 font-serif text-xl">
              {code ? <>房间 <code className="font-mono tracking-[0.2em] text-primary">{code}</code></> : "本地牌桌"}
            </h2>
          </div>
          <Button size="icon-xs" variant="ghost" aria-label="关闭" onClick={onClose}><X className="size-3.5" /></Button>
        </div>

        <div className="scrollbar-thin mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pe-1">
          {!manage.available && (
            <p className="rounded-lg border border-border/60 bg-black/25 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              这个站点还没有房间权限这一层（服务端没实现这套协议），所以现在人人自由、谁都能改。开房与房间设置在本机照样好用，只是服务器不会替你把关。
            </p>
          )}

          <section className="rounded-lg border border-border/60 bg-black/25 p-2.5">
            <p className="panel-title">房间状况</p>
            <div className="mt-1.5 grid gap-1.5 text-[11px] sm:grid-cols-2">
              <Row label="房主">
                <span className="flex items-center gap-1">
                  <Crown className="size-3 text-primary" />
                  {room?.ownerName || "未记名"}
                  {room?.ownerFp && <code className="font-mono text-white/45">#{fpShort(room.ownerFp)}</code>}
                </span>
              </Row>
              <Row label="在座">{seats.length} 人</Row>
              <Row label="公开私密">
                {host && manage.available ? (
                  <span className="flex items-center gap-1">
                    <Button size="xs" variant={room?.pub ? "secondary" : "outline"} onClick={() => void manage.setPub(true)}>公开</Button>
                    <Button size="xs" variant={room?.pub ? "outline" : "secondary"} onClick={() => void manage.setPub(false)}>私密</Button>
                  </span>
                ) : (
                  <span>{room ? (room.pub ? "公开：挂在大厅" : "私密：只认房间码") : listed ? "公开：挂在大厅" : "私密：只认房间码"}</span>
                )}
              </Row>
              <Row label="大厅挂牌">{listed ? "已挂出，陌生人搜得到" : "未挂牌，只发房间码"}</Row>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              公开房会出现在「大厅」的活房间列表里，谁都能直接入座；私密房不进列表，只有拿到房间码的人进得来。
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="xs" variant="outline" className="gap-1" onClick={onOpenLobby}><DoorOpen className="size-3" />看大厅</Button>
              <Button size="xs" variant="outline" className="gap-1" onClick={onOpenArchives}><Archive className="size-3" />存档</Button>
              <Button size="xs" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => { onClose(); onLeave(); }}>离开房间</Button>
            </div>
          </section>

          <section className="rounded-lg border border-border/60 bg-black/25 p-2.5">
            <p className="panel-title">游戏模式</p>
            <div className="mt-1.5 grid gap-1.5 text-[11px] sm:grid-cols-2">
              <Row label="全桌">
                {host && manage.available ? (
                  <Button
                    size="xs"
                    variant={room?.gm ? "secondary" : "outline"}
                    disabled={gmBusy}
                    title={room?.gm ? "退出游戏模式：桌面上的东西又能改能删" : "开起来：全桌把编辑与删除那一排收掉，只留下正常游玩"}
                    onClick={() => { setGmBusy(true); void manage.setGameMode(!room?.gm).finally(() => setGmBusy(false)); }}
                  >
                    {room?.gm ? "退出游戏模式" : "进入游戏模式"}
                  </Button>
                ) : (
                  <span className="min-w-0 break-words">
                    {room?.gm
                      ? "房主已开启：全桌的编辑与删除都收起了"
                      : !manage.available
                        ? // 服务端没有房间元信息这一层就没地方记这个开关，说清楚别让人以为按不出来是坏了
                          "这个站点没有房间权限这一层，全桌那一档开不了：要防误删先用下面的「只锁这台」"
                        : code
                          ? "房主还没开：这一桌仍在编辑状态"
                          : "开一间联网房间才有全桌这一档"}
                  </span>
                )}
              </Row>
              <Row label="只锁这台">
                <Button
                  size="xs"
                  variant={localGame ? "secondary" : "outline"}
                  title={localGame ? "解开这一台的锁定，编辑与删除回来" : "只锁自己这一台：本地试牌怕误删就开着，同桌看不见这一档"}
                  onClick={() => onLocalGame(!localGame)}
                >
                  {localGame ? "已锁住自己" : "锁住自己这台"}
                </Button>
              </Row>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              游戏模式收起的是「摆桌子」那一套：拿走与删除、改名换色、卡面卡背与效果、清空桌面、换棋盘与开局预设。摸牌打牌、掷骰、计分、计时、翻面、挪动摆放照旧，从组件库添个骰子计时器这些辅助物件也照旧。
              全桌那一档写进服务端，房主一键开关，同桌每个人立刻一起生效；「只锁这台」是本机偏好，没联网也能用。两道任一开着就算在游戏中，房主也一样——要改东西先退出来。
            </p>
          </section>

          <section className="rounded-lg border border-border/60 bg-black/25 p-2.5">
            <p className="panel-title">在座的这台机器</p>
            <div className="mt-1.5 space-y-1">
              {seats.length === 0 && <p className="text-[11px] text-muted-foreground">还没有人在线，等下一次心跳。</p>}
              {seats.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/25" style={{ background: s.color ?? "#888" }} />
                  <span className="min-w-0 flex-1 truncate">{s.name || "匿名"}</span>
                  {s.fp && <code className="shrink-0 font-mono text-[10px] text-white/45">#{fpShort(s.fp)}</code>}
                  {typeof s.rtt === "number" && <span className="shrink-0 text-[10px] tabular-nums text-white/45">{s.rtt}ms</span>}
                  {s.id === room?.owner && <span className="shrink-0 rounded bg-primary/20 px-1 text-[10px] text-primary">房主</span>}
                  {s.id === me.id && <span className="shrink-0 rounded bg-white/10 px-1 text-[10px] text-white/70">我</span>}
                  {host && manage.available && s.id !== room?.owner && s.id !== me.id && (
                    <Button size="xs" variant="ghost" className="shrink-0 gap-1 text-muted-foreground hover:text-destructive" onClick={() => void manage.kick(s.id)}>
                      <UserMinus className="size-3" />移出
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              每行末尾那四位是浏览器指纹短号：昵称是自己填的、会撞车，短号才认得出这台机器。移出后这个人凭同一个短号也再进不来。
            </p>
          </section>

          {host ? (
            <section className="rounded-lg border border-border/60 bg-black/25 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="panel-title">功能权限分配</p>
                <span className="text-[10px] text-muted-foreground">已开放 {open} / {PERM_KEYS.length} 项</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button key={p.label} size="xs" variant="outline" className="gap-1" title={p.hint} onClick={() => applyPreset(p.perms)}>
                    {p.label}
                  </Button>
                ))}
                {dirty && (
                  <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setDraft({})}>放弃改动</Button>
                )}
              </div>
              <div className="mt-2 space-y-2.5">
                {PERM_GROUPS.map((g) => (
                  <div key={g.title}>
                    <p className="text-[11px] font-medium text-foreground/90">{g.title}</p>
                    <p className="text-[10px] text-muted-foreground">{g.hint}</p>
                    <div className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-2">
                      {g.items.map((item) => {
                        const on = value(item.key);
                        return (
                          <label key={item.key} className="flex cursor-pointer items-start gap-1.5 rounded-md px-1 py-0.5 hover:bg-white/5" title={item.hint}>
                            <input
                              type="checkbox"
                              className="mt-0.5 size-3.5 shrink-0 accent-primary"
                              checked={on}
                              disabled={item.key === "kick"}
                              onChange={(e) => setDraft((cur) => ({ ...cur, [item.key]: e.target.checked }))}
                            />
                            <span className="min-w-0">
                              <span className={cn("block break-words text-[11px] leading-snug", on ? "text-foreground/90" : "text-muted-foreground")}>{item.label}</span>
                              <span className="block break-words text-[10px] leading-snug text-muted-foreground/80">{item.hint}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                「移出成员」永远只有房主能做——能分配权限就等于能改一切，所以这一项不下放。收回权限只影响之后的操作，成员已经摆好的东西不会自动退回。
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <Button size="sm" className="flex-1 gap-1" disabled={!dirty || busy} onClick={() => void save()}>
                  <Check className="size-3.5" />{busy ? "提交中…" : dirty ? "提交给这间房" : "已是最新"}
                </Button>
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-border/60 bg-black/25 p-2.5">
              <p className="panel-title">我拿到的权限</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {mine.length === 0 && <span className="text-[11px] text-muted-foreground">房主把桌上的一切都收回了，只能看着。</span>}
                {mine.map((k) => (
                  <span key={k} className="rounded-full border border-border/60 bg-black/30 px-1.5 py-0.5 text-[10px] text-foreground/85">{permLabel(k)}</span>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                收回了 {PERM_KEYS.length - mine.length} 项。被收回的操作这里点得动也会被服务端整件退回——想放开就喊房主改这个面板。
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="panel-title shrink-0">{label}</span>
      <span className="min-w-0 text-end text-foreground/90">{children}</span>
    </div>
  );
}
