import { useCallback, useEffect, useState } from "react";
import { Disc3, Eraser, Image as ImageIcon, RefreshCw, Trash2, Wifi, X } from "lucide-react";
import { formatBytes, inventory, localBytes, type CacheGroup, type CacheRow } from "@/game/inventory";
import { localTables, type LocalTable } from "@/game/cache";
import { clearPixelCache, pixelCacheStats, type PixelCacheStats } from "@/game/images";
import { clearClipCache, clipCacheStats, type ClipCacheStats } from "@/game/audio";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 本机缓存查看器：这台浏览器替用户记着了什么，一条条列出来，看得懂也删得掉。
 * 每一次删除都要先按「确认」——离线摆到一半的桌子、没联网就开不了的存档副本，
 * 丢了是补不回来的，所以确认那一格会把后果原话念出来。
 */
export function CacheSheet({ onClose, onOpen }: {
  onClose: () => void;
  /** 把某条快照的桌面摆回本机（离线状态，改动不会同步给别人）；返回是否摆得出来 */
  onOpen: (table: LocalTable) => boolean;
}) {
  const [tables, setTables] = useState<LocalTable[]>([]);
  const [groups, setGroups] = useState<CacheGroup[]>([]);
  const [pixels, setPixels] = useState<PixelCacheStats>({ count: 0, ok: false });
  const [clips, setClips] = useState<ClipCacheStats>({ count: 0, ok: false });
  const [bytes, setBytes] = useState(0);
  const [busy, setBusy] = useState(false);
  /** 哪一格正在等确认：行用行号，整组用 `组号:*`，像素和全清各占一个 */
  const [armed, setArmed] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const reload = useCallback(() => {
    setTables(localTables());
    setGroups(inventory());
    setBytes(localBytes());
    setBusy(true);
    void Promise.all([pixelCacheStats(), clipCacheStats()]).then(([pix, clip]) => {
      setPixels(pix);
      setClips(clip);
      setBusy(false);
    });
  }, []);

  useEffect(reload, [reload]);

  const open = (table: LocalTable) => {
    if (onOpen(table)) onClose();
  };

  /** 删完立刻重新数一遍，并把这一行/这一组的后果说一句，让人知道刚才是不是真删掉了 */
  const run = (label: string, action: () => void) => {
    action();
    setArmed(null);
    setNote(`已清掉${label}`);
    reload();
  };

  const erasePixels = () => {
    setBusy(true);
    void clearPixelCache().then(() => {
      setArmed(null);
      setNote("已清空卡面像素");
      reload();
    });
  };

  /** 唱片字节存在另一个库里：清掉只是要重新下一遍，服务器上的曲子一条不动 */
  const eraseClips = () => {
    setBusy(true);
    void clearClipCache().then(() => {
      setArmed(null);
      setNote("已清空本机唱片");
      reload();
    });
  };

  const wipeEverything = () => {
    for (const g of groups) g.wipe?.run();
    setArmed(null);
    setNote("这台浏览器记着的桌况、预设、口令与偏好都清了；卡面像素要另外按上面那颗");
    reload();
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[3px]"
      onClick={() => { setArmed(null); onClose(); }}
    >
      <div className="panel my-auto flex max-h-[86dvh] w-full max-w-lg flex-col rounded-2xl p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="panel-title">只存在这台浏览器里</p>
            <h2 className="mt-0.5 font-serif text-xl">本机缓存</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon-xs" variant="ghost" aria-label="重新统计" title="重新统计" onClick={reload}>
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="关闭" onClick={onClose}><X className="size-3.5" /></Button>
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          这里只谈本机：清掉的桌况与副本随时能从服务器再要回来，服务器上的数据一条都不会少。
          只有离线自己摆的桌子、桌面预设和口令是这份独一份的，删之前看一眼确认那一格说的话。
        </p>

        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="rounded bg-white/10 px-1.5 py-0.5 tabular-nums">共占约 {formatBytes(bytes)}</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 tabular-nums">{groups.reduce((n, g) => n + g.rows.length, 0)} 条记录</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 tabular-nums">
            <ImageIcon className="me-0.5 inline size-2.5" />
            {pixels.ok ? `${pixels.count} 张卡面像素` : "像素统计不可用"}
          </span>
          {armed !== "pixels" ? (
            <Button size="xs" variant="ghost" className="ms-auto shrink-0 gap-1 text-muted-foreground" disabled={busy || !pixels.count} onClick={() => setArmed("pixels")}>
              <Eraser className="size-3" />清空像素
            </Button>
          ) : (
            <span className="ms-auto flex shrink-0 items-center gap-1">
              <Button size="xs" variant="ghost" className="text-destructive" onClick={erasePixels}>确认清空</Button>
              <Button size="xs" variant="ghost" onClick={() => setArmed(null)}>取消</Button>
            </span>
          )}
        </div>
        {armed === "pixels" && <Warn>清空以后卡面图片要重新从服务器或同桌拉一遍：下次摸到那些牌会慢半拍，图片本身一张都不会丢。</Warn>}

        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="rounded bg-white/10 px-1.5 py-0.5 tabular-nums">
            <Disc3 className="me-0.5 inline size-2.5" />
            {clips.ok ? `${clips.count} 首本机唱片` : "唱片统计不可用"}
          </span>
          <span className="min-w-0 truncate">唱片机上放过的曲子会留最近 24 首在本机，重进房间不用再下一遍</span>
          {armed !== "clips" ? (
            <Button size="xs" variant="ghost" className="ms-auto shrink-0 gap-1 text-muted-foreground" disabled={busy || !clips.count} onClick={() => setArmed("clips")}>
              <Eraser className="size-3" />清空唱片
            </Button>
          ) : (
            <span className="ms-auto flex shrink-0 items-center gap-1">
              <Button size="xs" variant="ghost" className="text-destructive" onClick={eraseClips}>确认清空</Button>
              <Button size="xs" variant="ghost" onClick={() => setArmed(null)}>取消</Button>
            </span>
          )}
        </div>
        {armed === "clips" && <Warn>清掉的只是这台机器上下好的那份副本，下次再放那首歌会重新下一遍；服务器上的曲子一首都不会少。</Warn>}

        <div className="scrollbar-thin mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pe-1">
          {groups.length === 0 && <p className="text-[11px] text-muted-foreground">这台浏览器还没替谁记着什么东西。</p>}
          {groups.map((g) => (
            <section key={g.id}>
              <div className="flex items-baseline gap-2">
                <h3 className="font-serif text-sm text-foreground/90">{g.title}</h3>
                <span className="text-[10px] tabular-nums text-muted-foreground">{g.rows.length} 条 · {formatBytes(g.bytes)}</span>
                {g.wipe && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className={cn("ms-auto shrink-0 text-[10px] text-muted-foreground", armed === `${g.id}:*` && "hidden")}
                    onClick={() => setArmed(`${g.id}:*`)}
                  >
                    {g.wipe.label}
                  </Button>
                )}
              </div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{g.hint}</p>
              {armed === `${g.id}:*` && g.wipe && (
                <div className="mt-1.5">
                  <Warn>{g.wipe.warn}</Warn>
                  <div className="mt-1 flex items-center gap-1">
                    <Button size="xs" variant="ghost" className="text-destructive" onClick={() => run(`「${g.title}」这一类`, g.wipe!.run)}>确认{g.wipe.label}</Button>
                    <Button size="xs" variant="ghost" onClick={() => setArmed(null)}>取消</Button>
                  </div>
                </div>
              )}
              <div className="mt-1.5 space-y-1.5">
                {g.rows.map((row) => {
                  /** 桌况那组额外给一颗「摆出来」：行的数据在 inventory 里，能摆的那份本体在这儿 */
                  const table = g.id === "tables" ? tables.find((t) => `table:${t.key}` === row.id) : undefined;
                  return (
                    <Row
                      key={row.id}
                      row={row}
                      armed={armed === row.id}
                      busy={busy}
                      onArm={() => setArmed(row.id)}
                      onCancel={() => setArmed(null)}
                      onRemove={() => run(`「${row.label}」`, row.drop)}
                      room={table?.online ? table.room : null}
                      action={table && (
                        <Button
                          size="xs"
                          variant="outline"
                          className="shrink-0"
                          disabled={busy || !table.hasState}
                          title={table.hasState ? "在这台机器上摆出来" : "这份快照只留下了名字"}
                          onClick={() => open(table)}
                        >
                          摆出来
                        </Button>
                      )}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 text-[10px] text-muted-foreground">{note || "删任何一条都要按两下：先点开，再确认。"}</span>
          {armed !== "all" ? (
            <Button size="xs" variant="ghost" className="shrink-0 text-destructive/80" onClick={() => setArmed("all")}>清掉这台浏览器的全部记录</Button>
          ) : (
            <span className="flex shrink-0 items-center gap-1">
              <Button size="xs" variant="ghost" className="text-destructive" onClick={wipeEverything}>确认全清</Button>
              <Button size="xs" variant="ghost" onClick={() => setArmed(null)}>取消</Button>
            </span>
          )}
        </div>
        {armed === "all" && <Warn>桌况快照、桌面预设、存档缓存、口令、本机偏好与身份记录一次全清。离线摆到一半的桌子和自己存的预设补不回来，房主口令忘了也当不了那个家的主——想清楚了再按。</Warn>}
      </div>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">
      {children}
    </p>
  );
}

function Row({ row, armed, busy, room, action, onArm, onCancel, onRemove }: {
  row: CacheRow;
  armed: boolean;
  busy: boolean;
  /** 联网快照的房间码：离线桌给 null */
  room: string | null;
  /** 这一行额外的动作（桌况那组的「摆出来」） */
  action: React.ReactNode;
  onArm: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={cn("rounded-lg border border-border/60 bg-black/25 px-2.5 py-2", armed && "border-destructive/40")}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{row.label}</span>
        {room && <code className="shrink-0 font-mono text-[11px] tracking-[0.15em] text-primary">{room}</code>}
        {room && <span className="shrink-0 rounded bg-emerald-400/15 px-1 text-[9px] text-emerald-200"><Wifi className="me-0.5 inline size-2.5" />上次在线</span>}
        {action}
        {armed ? (
          <>
            <Button size="xs" variant="ghost" className="shrink-0 text-destructive" disabled={busy} onClick={onRemove}>确认删除</Button>
            <Button size="xs" variant="ghost" className="shrink-0" disabled={busy} onClick={onCancel}>取消</Button>
          </>
        ) : (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`删掉 ${row.label}`}
            title="删掉这一条（要按两下）"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onArm}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        {row.meta}
        {row.bytes > 0 && ` · ${formatBytes(row.bytes)}`}
      </p>
      {armed && <Warn>{row.warn}</Warn>}
    </div>
  );
}
