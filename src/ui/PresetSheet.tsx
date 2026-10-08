import { useCallback, useEffect, useState } from "react";
import { Boxes, Download, Save, Trash2, X } from "lucide-react";
import { listPresets, removePreset, savePreset, type PresetMeta } from "@/game/preset";
import { GAME_SHUT_HINT } from "@/game/perm";
import type { TableState } from "@/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 桌面预设抽屉：把现在这张桌子留在本机，之后随时摆回来。
 * 预设只存在这台浏览器里，不上服务器——它记的是「桌面的样子」，联网房里由房主载入给全桌看。
 */
export function PresetSheet({ state, online, host, gaming, onClose, onLoad }: {
  state: TableState;
  /** 当前是否在联网房里：房主在这里载入预设才会替全桌摆桌 */
  online: boolean;
  host: boolean;
  /** 游戏中：载入会把整桌摆回去，这动作游戏模式收着，这里跟着收，别留一颗点了被退回的按钮 */
  gaming: boolean;
  onClose: () => void;
  onLoad: (preset: PresetMeta) => void;
}) {
  const [list, setList] = useState<PresetMeta[]>(() => listPresets());
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState<string | null>(null);

  const reload = useCallback(() => setList(listPresets()), []);
  useEffect(reload, [reload]);

  const save = () => {
    const hit = savePreset(state, name);
    if (!hit) {
      setNote("这张桌子太大，预设存不下（物件与图片太多）");
      return;
    }
    setNote(`已存下「${hit.name}」`);
    setName("");
    reload();
  };

  const drop = (meta: PresetMeta) => {
    removePreset(meta.id);
    setArmed(null);
    setNote(`已删掉「${meta.name}」`);
    reload();
  };

  const canLoad = !gaming && (!online || host);
  const loadWhy = gaming ? GAME_SHUT_HINT : canLoad ? "把这张桌子摆回来" : "只有房主能载入预设";

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div className="panel my-auto flex max-h-[86dvh] w-full max-w-lg flex-col rounded-2xl p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="panel-title">只存在这台浏览器里</p>
            <h2 className="mt-0.5 font-serif text-xl">桌面预设</h2>
          </div>
          <Button size="icon-xs" variant="ghost" aria-label="关闭" onClick={onClose}><X className="size-3.5" /></Button>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          预设记下桌面上的全部物件与自上传资源的清单：载入时整桌摆回这个样子，座位、回合与记录都不动。
          {gaming && " 游戏模式进行中不能重摆整桌，载入已经收起来。"}
          {!gaming && online && !host && " 联网房里只有房主能载入预设。"}
        </p>

        <div className="mt-3 flex items-center gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={state.name?.trim() || "预设名称"}
            maxLength={40}
            className="h-8 min-w-0 flex-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
          <Button size="xs" variant="outline" className="shrink-0 gap-1" onClick={save}>
            <Save className="size-3" />存为预设
          </Button>
        </div>
        {note && <p className="mt-1.5 text-[10px] text-muted-foreground">{note}</p>}

        <div className="scrollbar-thin mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
          {list.length === 0 && (
            <p className="flex items-center gap-1.5 py-6 text-[11px] text-muted-foreground">
              <Boxes className="size-3.5" />还没有存过预设：摆好一张桌子，再按上面的「存为预设」。
            </p>
          )}
          {list.map((meta) => (
            <div key={meta.id} className={cn("rounded-lg border border-border/60 bg-black/25 px-2.5 py-2", armed === meta.id && "border-destructive/40")}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{meta.name}</span>
                <Button size="xs" variant="outline" className="shrink-0 gap-1" disabled={!canLoad} title={loadWhy} onClick={() => onLoad(meta)}>
                  <Download className="size-3" />载入
                </Button>
                {armed === meta.id ? (
                  <>
                    <Button size="xs" variant="ghost" className="shrink-0 text-destructive" title="第二次按下才真的删" onClick={() => drop(meta)}>确认删除</Button>
                    <Button size="xs" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => setArmed(null)}>取消</Button>
                  </>
                ) : (
                  <Button size="icon-xs" variant="ghost" aria-label={`删掉 ${meta.name}`} title="删掉这条预设" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setArmed(meta.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {meta.objects} 个物件 · {meta.images ? `${meta.images} 张自传资源` : "无自传资源"} · {since(meta.at)}
              </p>
              {armed === meta.id && (
                <p className="mt-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">
                  服务器上并没有第二份「{meta.name}」：删了就只能重新摆一张桌子再存。
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
          载入了别人没见过的资源会显示成空心轮廓，由这台机器补传并通知同桌；等一等或按一下底部小白条上的「重载资源」就能出图。
        </p>
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
