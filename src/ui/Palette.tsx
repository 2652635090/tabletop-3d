import { useEffect, useRef, useState } from "react";
import { Boxes, BookOpen, Calculator, CircleDot, Compass, Copy, Dices, Disc3, FileArchive, Frame, Gauge, Gamepad2, Hash, Headphones, Hourglass, ImagePlus, Lock, Magnet, Maximize, MonitorPlay, Moon, MousePointer2, Package, RectangleHorizontal, Ruler, Shapes, Shield, Sparkles, Tablet, Tally1, Timer, Type, Waves, ArrowRight, Utensils } from "lucide-react";
import { BOARDS, PALETTE_TABS, PIECE_SETS, SHAPES, SHIELD_BAND, TIMER_MIN, ZONE_MAX, COPY_MAX, COPY_MIN, boardHint, clamp, fixCopies, mmss, blankDeck } from "@/game/catalog";
import type { PaletteTab } from "@/game/catalog";
import { DECKS, poker54 } from "@/game/decks";
import { loadPacks, type PackDeck } from "@/game/packs";
import { CLIP_MAX_BYTES } from "@/game/audio";
import { PLAYER_COLORS, addArrowAction, addBagAction, addBookAction, addBoxAction, addCalcAction, addCounterAction, addDieAction, addGramAction, addHourAction, addMatAction, addMp3Action, addPadAction, addPileAction, addPieceAction, addPointerAction, addShieldAction, addSlotAction, addSpinnerAction, addStatMatAction, addTabletAction, addTextAction, addTimerAction, addTokenAction, addTrayAction, addTrackAction, addCardAction, addZoneAction, boardPresetAction, chatAction, customCardsAction } from "@/game/ops";
import { CALC_KEYS, calcPress, evalCalc, formatCalc } from "@/game/calc";
import { fileToMat, saveCardImage } from "@/game/images";
import { readZipImages } from "@/game/unzip";
import { MAX_OBJECTS, MAX_PILE } from "@/game/state";
import type { Action, CardSpec } from "@/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Slot, Swatches } from "./widgets";
import { cn } from "@/lib/utils";

const TIMER_PRESETS = [30, 60, 180, 300, 600];
const ARROW_PRESETS: { label: string; hint: string; len: number }[] = [
  { label: "短箭头", hint: "一步 20cm", len: 0.2 },
  { label: "中箭头", hint: "三步 50cm", len: 0.5 },
  { label: "长箭头", hint: "整条路径 1m", len: 1 },
];

/** 牌屏预设：w 沿屏面铺开，h 是屏立起来的高度，单位米 */
const SHIELD_PRESETS: { label: string; hint: string; w: number; h: number }[] = [
  { label: "手牌屏", hint: "挡自己一手牌", w: 0.24, h: 0.15 },
  { label: "宽屏", hint: "摊一排也挡得住", w: 0.4, h: 0.16 },
  { label: "高屏", hint: "坐得远也遮得住", w: 0.28, h: 0.24 },
];

/** 沙漏预设：一漏几分钟，摆下来静止，翻面才起算 */
const HOUR_PRESETS = [1, 3, 5];

/** 区域垫预设：长宽单位米，覆盖常见的手牌区/公共牌区 */
const ZONE_PRESETS: { label: string; hint: string; w: number; d: number }[] = [
  { label: "手牌区", hint: "一排放自己手里", w: 0.5, d: 0.14 },
  { label: "出牌区", hint: "弃牌/打出的一张", w: 0.24, d: 0.16 },
  { label: "公共牌区", hint: "桌面中央明牌", w: 0.5, d: 0.36 },
  { label: "隐藏区", hint: "扣牌给自己看，开隐私模式", w: 0.36, d: 0.28 },
  { label: "仪表面板", hint: "放计时器与标记", w: 0.7, d: 0.44 },
  { label: "大区域", hint: "圈住半张桌子", w: 1.1, d: 0.7 },
];

/** 垫子预设：实心的那块布面，尺寸和区域垫一个口径 */
const PAD_PRESETS: { label: string; hint: string; w: number; d: number }[] = [
  { label: "个人垫", hint: "自己面前一块", w: 0.4, d: 0.28 },
  { label: "出牌垫", hint: "一次打一张", w: 0.24, d: 0.18 },
  { label: "长条垫", hint: "摊一整排牌", w: 0.7, d: 0.2 },
];

/** 统计垫预设：只数垫子范围内的牌是竖着还是横着，不圈归属也不保密 */
const STAT_PRESETS: { label: string; hint: string; w: number; d: number }[] = [
  { label: "排版统计", hint: "看一排放了几张竖的", w: 0.6, d: 0.42 },
  { label: "单张判定位", hint: "一次只放一张", w: 0.24, d: 0.18 },
  { label: "大统计区", hint: "铺开一整片牌", w: 1, d: 0.7 },
];

/** 卡槽带预设：一格正好放一张牌，拖过去自动对齐，用来排手牌与场面 */
const SLOT_PRESETS: { label: string; hint: string; n: number }[] = [
  { label: "三格", hint: "排一行小组", n: 3 },
  { label: "五格", hint: "一手牌的量", n: 5 },
  { label: "八格", hint: "摊开一整排", n: 8 },
];

/** 转盘预设：等分份数，放好后选中还能一格一格加减 */
const SPIN_PRESETS: { n: number; hint: string }[] = [
  { n: 6, hint: "一半骰子的量" },
  { n: 8, hint: "最常见的八分" },
  { n: 12, hint: "刻得细一点" },
];

/** 计分轨预设：刻度格数，一格记一分 */
const TRACK_PRESETS: { n: number; hint: string }[] = [
  { n: 20, hint: "一局到 20 分" },
  { n: 40, hint: "长一点的局" },
  { n: 80, hint: "整场累计" },
];

/** 页签的名单与叫法只在 catalog 那张表里定一次，这里只给每页配一颗图标 */
const TAB_ICON: Record<PaletteTab, typeof Shapes> = {
  piece: Shapes,
  die: Dices,
  card: RectangleHorizontal,
  mark: Hash,
  site: Frame,
  music: Disc3,
  tool: Calculator,
};

const TABS = PALETTE_TABS.map((t) => ({ ...t, icon: TAB_ICON[t.id] }));

type TabId = PaletteTab;

export function Palette({ color, setColor, me, onAction, onStarter, onNotify, gaming, compact }: {
  color: string;
  setColor: (c: string) => void;
  me: { id: string; name: string };
  onAction: (action: Action) => void;
  onStarter: (kind: string) => void;
  onNotify: (text: string) => void;
  /** 游戏中：整桌开局（清空 + 换棋盘 + 摆预设）收起来，只留往桌上添零件那一侧 */
  gaming: boolean;
  /** 矮屏（手机横屏）：标题行、分类行、颜色块三处一起收进一条横滑工具栏，把高度让给组件格子 */
  compact?: boolean;
}) {
  const [tab, setTab] = useState<TabId>("piece");
  /** 可选牌组包：`public/packs/index.json` 在就有这几行，不在就一行都不摆 */
  const [packs, setPacks] = useState<PackDeck[]>([]);
  useEffect(() => {
    let alive = true;
    loadPacks().then((loaded) => {
      if (alive) setPacks(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);
  /** 一次只露一块：零件库与整桌开局不再上下叠着互相挤 */
  const [mode, setMode] = useState<"comp" | "open">("comp");
  /** 紧凑档下颜色收成一颗点，按一下才摊开一排色板 */
  const [ink, setInk] = useState(false);
  const [tokenLabel, setTokenLabel] = useState("标记");
  const [timerMinutes, setTimerMinutes] = useState(1);
  const [note, setNote] = useState("提示");
  const files = useRef<HTMLInputElement>(null);
  const matFile = useRef<HTMLInputElement>(null);
  const padFile = useRef<HTMLInputElement>(null);
  const zipFile = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<"loose" | "pile">("loose");
  /** 无边框导入：图片铺满整张牌，不再留一圈白边和描边。开关只管这一次导入，之后单张还能改 */
  const [noBorder, setNoBorder] = useState(false);
  /** 每张份数：一张图收进来就铺成这么多个同样的物件（像素只上传一次，N 份共用同一个卡面 key） */
  const [copies, setCopies] = useState(1);
  /** 每次提交都换一个 key，框里的数字一定被换成归一化后的那个——填 0、填得跟原来一样时不会留着乱数 */
  const [copiesRev, setCopiesRev] = useState(0);
  const [uploading, setUploading] = useState("");
  const [zipping, setZipping] = useState("");
  const [matBusy, setMatBusy] = useState(false);
  const [matLong, setMatLong] = useState(1.3);
  const [padBusy, setPadBusy] = useState(false);
  const [padLong, setPadLong] = useState(0.6);

  /** 份数收口：归一化之后换一次 key，让框里显示的永远是真会用的那个数 */
  function commitCopies(raw: string) {
    setCopies(fixCopies(raw));
    setCopiesRev((r) => r + 1);
  }

  /** 图片垫子：长边按滑条定，另一边按原图比例跟着缩，不然宽图会拉成一块四不像 */
  const onPadFile = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setPadBusy(true);
    try {
      const mat = await fileToMat(file);
      if (mat) {
        const long = clamp(padLong, 0.3, ZONE_MAX);
        const short = long * Math.min(mat.w, mat.h) / Math.max(mat.w, mat.h);
        onAction(addPadAction(color, mat.w >= mat.h ? long : short, mat.w >= mat.h ? short : long, me.id, mat.key));
        onNotify("图片垫子放下了：选中它可以换一张图，或者撤掉图回到纯色");
      } else {
        onNotify("这张图太大还是压不下，换一张试试");
      }
    } catch {
      onNotify("垫子导入失败，换一张图再试");
    }
    setPadBusy(false);
    if (padFile.current) padFile.current.value = "";
  };

  const onMatFile = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setMatBusy(true);
    try {
      const mat = await fileToMat(file);
      if (mat) {
        onAction(addMatAction(mat.key, mat.w, mat.h, matLong));
        onNotify("大图桌垫已铺上：选中它可以锁定，锁上后谁都拖不走，只能点垫角那颗解锁按钮");
      } else {
        onNotify("这张图太大还是压不下，换一张试试");
      }
    } catch {
      onNotify("桌垫导入失败，换一张图再试");
    }
    setMatBusy(false);
    if (matFile.current) matFile.current.value = "";
  };

  const pickFiles = (mode: "loose" | "pile") => {
    setTarget(mode);
    files.current?.click();
  };

  const onFiles = async (list: FileList | null) => {
    // 上限只看牌堆容量，不看界面：选几百张就该收几百张
    const all = [...(list ?? [])];
    const looseMode = target === "loose";
    const limit = looseMode ? MAX_OBJECTS : MAX_PILE;
    // 份数按当前这条路的容量夹住：散牌一桌就这么多物件，填再大也只是铺满桌面，不静默丢牌
    const per = clamp(copies, COPY_MIN, limit);
    // 每张份数先把能收的图片数压下来：总张数装不下的部分别先解码，省得跑完几十秒才说装不下
    const room = Math.floor(limit / per);
    const picked = all.slice(0, room);
    const cut = Math.max(0, all.length - picked.length);
    if (!picked.length) return;
    const specs: CardSpec[] = [];
    let rejected = 0;
    // 一张张解码重压是主线程上的慢活，几百张要跑几十秒：每完成一张报一次进度
    setUploading(`导入中 0/${picked.length}${per > 1 ? `，每张 ${per} 份` : ""}`);
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      try {
        const up = await saveCardImage(file);
        if (!up) {
          rejected += 1;
          continue;
        }
        // 一份图只解码上传一次，N 份共用同一个图 key：字节不会重复占地方
        const spec: CardSpec = { back: "plain", img: up.key, ratio: up.ratio, label: file.name.replace(/\.[^.]+$/, "").slice(0, 20) || "自定义卡", ...(noBorder ? { borderless: true } : {}) };
        for (let k = 0; k < per; k++) specs.push({ ...spec });
      } catch {
        rejected += 1;
      }
      setUploading(`导入中 ${i + 1}/${picked.length}${rejected ? `，跳过 ${rejected}` : ""}`);
    }
    setUploading("");
    if (files.current) files.current.value = "";
    const action = target === "pile" && specs.length > 1 ? addPileAction(specs, color) : customCardsAction(specs, color);
    if (action) {
      onAction(action);
      const extra = [rejected ? `${rejected} 张太大已跳过` : "", cut ? `${looseMode ? `桌面只放得下 ${MAX_OBJECTS} 个物件，` : `一叠最多 ${MAX_PILE} 张，`}每张 ${per} 份，超出 ${cut} 幅图未放` : ""].filter(Boolean).join("，");
      const mode = noBorder ? "无边框" : "带白边";
      const each = per > 1 ? `每张 ${per} 份` : mode;
      onNotify(extra ? `放下了 ${specs.length} 张卡面（${each}，${mode}），${extra}` : `放下了 ${specs.length} 张自定义卡牌（${each}，${mode}）`);
    } else {
      onNotify("这些图片太大，换小一点的再试");
    }
  };

  /** 一个压缩包 = 一个牌堆：包里的图片按名字自然序排好，整叠放到桌面上 */
  const onZipFile = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file || zipping) return;
    setZipping("正在解包…");
    const specs: CardSpec[] = [];
    let skipped = 0;
    try {
      const items = await readZipImages(file);
      const per = clamp(copies, COPY_MIN, MAX_PILE);
      const room = Math.floor(MAX_PILE / per);
      if (items.length > room) skipped += items.length - room;
      let done = 0;
      for (const item of items.slice(0, room)) {
        setZipping(`导入中 ${done + 1}/${Math.min(items.length, room)}${per > 1 ? `，每张 ${per} 份` : ""}`);
        done += 1;
        try {
          const blob = await item.blob();
          const up = blob ? await saveCardImage(blob) : null;
          if (!up) {
            skipped += 1;
            continue;
          }
          const spec: CardSpec = { back: "plain", img: up.key, ratio: up.ratio, label: item.name.replace(/\.[^.]+$/, "").slice(0, 20) || "自定义卡", ...(noBorder ? { borderless: true } : {}) };
          for (let k = 0; k < per; k++) specs.push({ ...spec });
        } catch {
          skipped += 1;
        }
      }
      const action = specs.length > 1 ? addPileAction(specs, color) : customCardsAction(specs, color);
      if (action) {
        onAction(action);
        onNotify(`${specs.length} 张卡面收成一叠（每张 ${per} 份${noBorder ? "，无边框，牌形随图" : ""}）${skipped ? `，另有 ${skipped} 张不是图片、太大或装不下已跳过` : ""}`);
      } else {
        onNotify(skipped ? "包里的图片都太大，压不进卡面" : "这个压缩包里没有找到图片");
      }
    } catch (error) {
      onNotify(error instanceof Error ? `压缩包打不开：${error.message}` : "压缩包打不开，换一个再试");
    }
    setZipping("");
    if (zipFile.current) zipFile.current.value = "";
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      {/* 一条小开关，两侧内容各占一块：想看零件就不必同时扛着开局清单 */}
      {/* 矮屏再把分类与颜色并进同一条横滑工具栏：三行并成一行，格子区能多出一整截 */}
      <div
        className={cn("panel flex shrink-0 items-center gap-1 rounded-lg p-1", compact && "gap-0.5 overflow-x-auto")}
        role={compact ? "toolbar" : "tablist"}
        aria-label="左侧面板内容"
      >
        <Button
          size="xs"
          role={compact ? undefined : "tab"}
          aria-selected={compact ? undefined : mode === "comp"}
          aria-pressed={compact ? mode === "comp" : undefined}
          variant={mode === "comp" ? "secondary" : "ghost"}
          className={cn("min-w-0 flex-1", compact && "flex-none px-2")}
          title="只看零件：棋子、骰子、卡牌、标记、场地、影音、工具"
          onClick={() => setMode("comp")}
        >
          组件
        </Button>
        {gaming ? (
          <span className="min-w-0 flex-1 truncate text-center text-[10px] leading-5 text-muted-foreground">开局：游戏模式里收起</span>
        ) : (
          <Button
            size="xs"
            role={compact ? undefined : "tab"}
            aria-selected={compact ? undefined : mode === "open"}
            aria-pressed={compact ? mode === "open" : undefined}
            variant={mode === "open" ? "secondary" : "ghost"}
            className={cn("min-w-0 flex-1", compact && "flex-none px-2")}
            title="只看整桌起手：一副牌、一局棋开局怎么摆"
            onClick={() => setMode("open")}
          >
            开局
          </Button>
        )}
        {compact && mode === "comp" && (
          <>
            <span className="h-4 w-px shrink-0 bg-border/60" aria-hidden />
            {TABS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="icon-xs"
                variant={tab === t.id ? "secondary" : "ghost"}
                title={`${t.label}零件`}
                aria-label={`${t.label}零件`}
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className="shrink-0"
              >
                <t.icon className="size-3.5" />
              </Button>
            ))}
            <span className="h-4 w-px shrink-0 bg-border/60" aria-hidden />
            <button
              type="button"
              aria-label="新物件颜色"
              title="新物件颜色"
              aria-expanded={ink}
              onClick={() => setInk((v) => !v)}
              className={cn("size-5 shrink-0 rounded-full border transition", ink ? "border-primary ring-2 ring-primary/40" : "border-white/20")}
              style={{ background: color }}
            />
          </>
        )}
      </div>

      {mode === "open" && !gaming && (
        <Panel title={compact ? undefined : "开局"} className={cn("flex min-h-0 flex-1 flex-col", compact && "overflow-hidden")} bodyClassName={cn("scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto pe-1", compact && "space-y-2 p-1.5")}>
          <div className="space-y-1.5">
            <div className="panel-title">整桌起手</div>
            <div className="grid grid-cols-1 gap-1.5">
              <Slot label="空桌面" hint="只有一张桌布" onClick={() => onStarter("empty")}><Gamepad2 className="size-4" /></Slot>
              <Slot label="扑克 54 张" hint="四门花色 + 大小王" onClick={() => onStarter("cards")}><RectangleHorizontal className="size-4" /></Slot>
              <Slot label="狼人杀" hint="18 张角色 + 夜晚计时" onClick={() => onStarter("werewolf")}><Moon className="size-4" /></Slot>
              <Slot label="跑团战棋" hint="网格 + 多面骰" onClick={() => onStarter("rpg")}><Dices className="size-4" /></Slot>
              <Slot label="环形竞速" hint="40 格 + 棋子 + 筹码" onClick={() => onStarter("monopoly")}><Boxes className="size-4" /></Slot>
              <Slot label="中国象棋" hint="9×10 交叉线 + 32 子开局，拖到异色子上就吃掉" onClick={() => onStarter("xiangqi")}><CircleDot className="size-4" /></Slot>
              <Slot label="潮汐" hint="44 张：潮道摊好 4 张，发 10 张一人，选中牌会算最高分" onClick={() => onStarter("tide")}><Waves className="size-4" /></Slot>
            </div>
          </div>
          <div className="space-y-1.5 border-t border-border/40 pt-2">
            <div className="panel-title flex items-center gap-1"><Compass className="size-3" />棋盘开局</div>
            <p className="text-[10px] leading-snug text-muted-foreground">放上一张盘并把子摆到起手位置；只想换盘面上的格子就点「纯桌布」。</p>
            <div className="grid grid-cols-1 gap-1.5">
              {BOARDS.filter((b) => b.id !== "none").map((b) => (
                <Slot key={b.id} label={b.name} hint={boardHint(b)} onClick={() => onStarter(b.id)}>
                  <Compass className="size-4" />
                </Slot>
              ))}
              <Slot label="纯桌布" hint="移除棋盘" onClick={() => onStarter("empty")}><Sparkles className="size-4" /></Slot>
            </div>
          </div>
        </Panel>
      )}

      {mode === "comp" && (
      <Panel title={compact ? undefined : "组件库"} className={cn("flex flex-1 flex-col overflow-hidden", compact ? "min-h-0" : "min-h-[13rem] lg:min-h-[22rem]")} bodyClassName={cn("flex min-h-0 flex-1 flex-col gap-2", compact && "gap-1.5 p-1.5")}>
        {/* 手机上只留 7 个小图标，一行排完；宽起来才把分类名字补上。矮屏已经把它们收进顶部工具栏了 */}
        {!compact && (
        <div className="grid shrink-0 grid-cols-7 gap-0.5 lg:grid-cols-4 lg:gap-1" role="tablist" aria-label="组件分类">
          {TABS.map((t) => (
            <Button
              key={t.id}
              type="button"
              size="xs"
              variant={tab === t.id ? "secondary" : "ghost"}
              role="tab"
              aria-selected={tab === t.id}
              title={`${t.label}零件`}
              onClick={() => setTab(t.id)}
              className="h-auto min-w-0 justify-center gap-0.5 whitespace-normal px-0.5 py-1.5 lg:gap-1 lg:px-1"
            >
              <t.icon className="size-3.5 shrink-0" />
              <span className="hidden lg:inline">{t.label}</span>
            </Button>
          ))}
        </div>
        )}

        {/* 颜色收成一颗点：按下才摊开这一排，选完自动收起，不常年占着两行 */}
        {(!compact || ink) && (
        <div className={cn("shrink-0 rounded-md border border-border/60 bg-black/20", compact ? "px-2 py-1.5" : "p-2")}>
          {!compact && <div className="panel-title mb-1.5">新物件颜色</div>}
          <div className={cn("min-w-0", compact && "scrollbar-thin overflow-x-auto")}>
            <Swatches value={color} onChange={(c) => { setColor(c); if (compact) setInk(false); }} size="sm" className={compact ? "flex-nowrap" : undefined} />
          </div>
        </div>
        )}

        <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pe-1">
          {tab === "piece" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-1.5">
                {SHAPES.map((s) => (
                  <Slot key={s.id} label={s.name} hint={s.hint} onClick={() => onAction(addPieceAction(s.id, color))}>
                    <Shapes className="size-4" />
                  </Slot>
                ))}
              </div>

              <div className="space-y-2 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><CircleDot className="size-3" />每套棋的专属棋子</div>
                <p className="text-[10px] leading-snug text-muted-foreground">点一下就放一枚那种子，颜色自带。丢到开了网格锁定的盘上会自己坐进格心；要一整盘开局用上方那颗「开局」。</p>
                {PIECE_SETS.map((set) => (
                  <div key={set.id} className="space-y-1 border-t border-border/40 pt-1.5 first:border-0 first:pt-0">
                    <div className="text-[11px] font-medium text-foreground/90">{set.name}</div>
                    <div className="text-[10px] leading-snug text-muted-foreground">{set.hint}</div>
                    <div className="space-y-1">
                      {set.sides.map((side) => (
                        <div key={side.name} className="flex items-start gap-1.5">
                          <span className="w-8 shrink-0 pt-2 text-[10px] leading-8 text-muted-foreground">{side.name}</span>
                          <div className="grid min-w-0 flex-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.max(side.items.length, 4)}, minmax(0, 1fr))` }}>
                            {side.items.map((it) => (
                              <Button
                                key={it.label ?? it.shape}
                                size="xs"
                                variant="outline"
                                className="h-8 min-w-0 px-0 text-[15px] leading-none"
                                style={{ color: side.color }}
                                title={`放一枚${side.name}的${it.name}`}
                                onClick={() => {
                                  onAction(addPieceAction(it.shape, side.color, it.label));
                                  onNotify(`放下了${side.name}的「${it.name}」：拖到锁定棋盘上会自动坐到格心`);
                                }}
                              >
                                {side.items.length === 1 ? "●" : it.label ?? it.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "die" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-1.5">
                {[4, 6, 8, 10, 12, 20].map((sides) => (
                  <Slot key={sides} label={`d${sides}`} hint={`随机 ${sides} 面`} onClick={() => onAction(addDieAction(sides, color))}>
                    <Dices className="size-4" />
                  </Slot>
                ))}
                <Slot label="双 d6" hint="一次放两颗" onClick={() => { onAction(addDieAction(6, color)); onAction(addDieAction(6, color)); }}>
                  <Sparkles className="size-4" />
                </Slot>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Frame className="size-3" />骰盘</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot label="骰盘" hint="四壁浅盘接骰子" onClick={() => {
                    onAction(addTrayAction(color));
                    onNotify("放下了一只骰盘：把骰子丢进盘里再掷，它们撞在盘壁上不会滚出盘外；端起盘子，盘里的骰子跟着一起走");
                  }}>
                    <Frame className="size-4" />
                  </Slot>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  骰子在盘里掷，弹跳被四壁收住，不会撒到整张桌；选中盘子能改盘腔的长宽。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Disc3 className="size-3" />转盘</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {SPIN_PRESETS.map((s) => (
                    <Slot
                      key={s.n}
                      label={`${s.n} 格转盘`}
                      hint={s.hint}
                      onClick={() => {
                        onAction(addSpinnerAction(color, s.n));
                        onNotify("放下了转盘：双击它就拨一下，指针停在哪一格全桌都看得见");
                      }}
                    >
                      <Disc3 className="size-4" />
                    </Slot>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  和掷骰一样，落点由拨动的那个人算好写进动作，别人只是重放同一段减速动画，所以联网时人人看到的都是同一格。
                  选中它可以「拨一下」，也可以一格一格加减扇区数；盘面会把停住的那一格亮起来。
                </p>
              </div>
            </div>
          )}
          {tab === "card" && (
            <div className="space-y-3">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                图片只上传一次，桌上存的是它的哈希。开着「无边框导入」时牌形跟着图的比例走，整张图原样铺在牌上，不会被切掉一头。
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                <input ref={files} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
                <input ref={zipFile} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden" onChange={(e) => void onZipFile(e.target.files)} />
                <Slot label="上传卡面" hint={uploading || "图片摊成散牌，一次几百张也行"} onClick={() => pickFiles("loose")}>
                  <ImagePlus className="size-4" />
                </Slot>
                <Slot label="上传成堆" hint={uploading || "多张图收成一叠，一次几百张也行"} onClick={() => pickFiles("pile")}>
                  <ImagePlus className="size-4" />
                </Slot>
                <Slot label="压缩包导入" hint={zipping || "zip 里的图片整叠收下，一张不限"} onClick={() => zipFile.current?.click()}>
                  <FileArchive className="size-4" />
                </Slot>
                <Slot
                  label={noBorder ? "无边框导入：开" : "无边框导入：关"}
                  hint="整张牌就是这张图，不留白边和描边；事后还能逐张改"
                  active={noBorder}
                  onClick={() => setNoBorder((v) => !v)}
                >
                  <Maximize className="size-4" />
                </Slot>
                <div className="tile rounded-md border border-border/60 bg-black/20" title={`一张图铺成几张同样的牌，${COPY_MIN}—${COPY_MAX} 随便填，桌面装不下会自动少导。`}>
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-primary/90"><Copy className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="tile-label min-w-0 flex-1 text-xs leading-snug font-medium text-foreground/90">每张份数 {copies > 1 ? `×${copies}` : ""}</span>
                      <Input
                        key={`${copies}-${copiesRev}`}
                        type="number"
                        min={COPY_MIN}
                        max={COPY_MAX}
                        step={1}
                        inputMode="numeric"
                        defaultValue={copies}
                        aria-label="每张份数"
                        className="h-7 w-20 shrink-0 font-mono text-xs"
                        onBlur={(e) => commitCopies(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          commitCopies(e.currentTarget.value);
                          e.currentTarget.blur();
                        }}
                      />
                    </span>
                    <span className="tile-hint text-[10px] leading-snug text-muted-foreground">
                      {COPY_MIN}—{COPY_MAX} 随便填
                    </span>
                  </span>
                </div>
                {DECKS.map((d) => (
                  <Slot key={d.id} label={d.name} hint={d.hint} onClick={() => onAction(addPileAction(d.make(), color))}>
                    <RectangleHorizontal className="size-4" />
                  </Slot>
                ))}
                {packs.map((p) => (
                  <Slot key={p.id} label={p.name} hint={p.hint} onClick={() => onAction(addPileAction(p.cards, color))}>
                    <RectangleHorizontal className="size-4" />
                  </Slot>
                ))}
                <Slot label="空白 10 张" hint="自定内容" onClick={() => onAction(addPileAction(blankDeck(10, "空白"), color))}>
                  <RectangleHorizontal className="size-4" />
                </Slot>
                <Slot
                  label="空牌堆"
                  hint="虚线框托盘，标出弃牌堆摆哪；丢牌进去变牌堆"
                  onClick={() => onAction(addPileAction([], color))}
                >
                  <Frame className="size-4" />
                </Slot>
                <Slot label="单张空白卡" onClick={() => onAction(addCardAction({ back: "plain", label: tokenLabel || "空白卡" }, color))}>
                  <Type className="size-4" />
                </Slot>
                <Slot label="单张黑桃 A" onClick={() => onAction(addCardAction({ back: "classic", rank: "A", suit: "s" }, color))}>
                  <Type className="size-4" />
                </Slot>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Package className="size-3" />盒与袋</div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  同一叠牌换个容器：盒按顺序摸，顶牌就是下一张；袋彻底随机，摸的人看不见里面装着什么。
                  摸、洗、摊到桌面、切牌、均分、按座位发牌这些动作两边都有。
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot label="空卡牌盒" hint="装牌后从盒顶摸" onClick={() => onAction(addBoxAction([], color))}>
                    <Package className="size-4" />
                  </Slot>
                  <Slot label="整盒扑克" hint="54 张装进盒" onClick={() => onAction(addBoxAction(poker54(), color))}>
                    <Package className="size-4" />
                  </Slot>
                  <Slot label="空袋子" hint="抽牌完全随机" onClick={() => onAction(addBagAction([], color))}>
                    <Utensils className="size-4" />
                  </Slot>
                  <Slot label="遭遇袋 6 张" hint="盲抽任务卡" onClick={() => onAction(addBagAction(blankDeck(6, "遭遇"), color))}>
                    <Utensils className="size-4" />
                  </Slot>
                </div>
              </div>
            </div>
          )}
          {tab === "mark" && (
            <div className="space-y-3">
              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Hash className="size-3" />计数标记</div>
                <label className="block space-y-1">
                  <span className="panel-title">标记文字</span>
                  <Input value={tokenLabel} maxLength={6} onChange={(e) => setTokenLabel(e.target.value)} placeholder="血 / 金币 / 先攻" />
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot label="计数标记" hint="用上方文字，能加减" onClick={() => onAction(addTokenAction(tokenLabel || "标记", color))}><Hash className="size-4" /></Slot>
                  <Slot label="计分片 100" onClick={() => onAction(addTokenAction("分", color))}><Hash className="size-4" /></Slot>
                  {["先攻", "血量", "金币", "行动"].map((label) => (
                    <Slot key={label} label={label} onClick={() => onAction(addTokenAction(label, PLAYER_COLORS[(label.length + label.charCodeAt(0)) % PLAYER_COLORS.length]))}>
                      <Hash className="size-4" />
                    </Slot>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  计数标记是一枚会数数的筹码：面上写着名字，选中它就能加减，各自数各自的。
                  只想摆一块纯写字的牌用下面那组「文字」，要全桌共用一条刻度用「计分轨」。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Gauge className="size-3" />计分轨</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {TRACK_PRESETS.map((t) => (
                    <Slot
                      key={t.n}
                      label={`${t.n} 格`}
                      hint={t.hint}
                      onClick={() => {
                        onAction(addTrackAction(color, t.n));
                        onNotify("放下了计分轨：选中它点「我上场」，之后每加一分棋子就往右走一格");
                      }}
                    >
                      <Gauge className="size-4" />
                    </Slot>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  计分轨是一把摆在全桌中间的尺：每个人一枚棋子扣在同一排刻度上，领先的是谁一眼就看出来，
                  不必各自捏着一堆筹码再互相问分。加减分、把人摘下来都在这条轨上完成。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  和每人一枚的计数标记不同：标记各数各的，计分轨是全桌共用的同一条，所以只有它能直接比出高低。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><MousePointer2 className="size-3" />指针</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot label="指针" hint="立起的手形指示器" onClick={() => onAction(addPointerAction(color))}>
                    <MousePointer2 className="size-4" />
                  </Slot>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  一只立在桌面上的手，用来指着「现在说到这儿、轮到这儿」。选中它可以转向、挪位置，谁都能看见它指着哪。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Type className="size-3" />文字</div>
                <label className="block space-y-1">
                  <span className="panel-title">文字内容</span>
                  <Input value={note} maxLength={24} onChange={(e) => setNote(e.target.value)} placeholder="例如：你的回合" />
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot label="文字牌" hint={`内容：${note || "提示"}`} onClick={() => onAction(addTextAction(note || "提示", color))}>
                    <Type className="size-4" />
                  </Slot>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  一块写死的字牌，不会数数：给桌面贴个标题、标个方向，或者写上「此处弃牌」都算它。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><ArrowRight className="size-3" />路径箭头</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {ARROW_PRESETS.map((a) => (
                    <Slot key={a.len} label={a.label} hint={a.hint} onClick={() => onAction(addArrowAction(color, a.len))}>
                      <ArrowRight className="size-4" />
                    </Slot>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">箭头朝本地 +X 方向铺开，选中后用旋转按钮转向。</p>
              </div>
            </div>
          )}
          {tab === "music" && (
            <div className="space-y-3">
              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Disc3 className="size-3" />唱片机</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot
                    label="唱片机"
                    hint="木壳转盘，全桌同一首歌"
                    onClick={() => {
                      onAction(addGramAction(color));
                      onNotify("放下了唱片机：选中它，展开「唱片机」那一栏就能上传音频；双击机器是放与停");
                    }}
                  >
                    <Disc3 className="size-4" />
                  </Slot>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  摆下来是一台空机，谁把音频传上去它就有的放。格式随你：mp3、ogg、wav、m4a 都按原样存下这
                  {Math.round(CLIP_MAX_BYTES / 1048576)}MB 的字节，不转码也不剪，能不能放交给这台浏览器自己试。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  放、停、第几秒、音量、循环都是桌上共享的一份状态：一个人按下播放，全桌一起响，进度由各台自己照着表推，
                  不是一秒一次的往桌上回写，所以人多了也不卡。想只让自己安静，选中栏最下面那颗是本机静音，不动别人的耳朵。
                  上传或取回失败，界面会把服务器那句原话说给你听（比如这首太大、这台浏览器放不动、这个站点没有存唱片的地方）。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Headphones className="size-3" />随身听</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot
                    label="随身听"
                    hint="先只自己听，共享才全桌"
                    onClick={() => {
                      onAction(addMp3Action(color, me.id));
                      onNotify("放下了随身听：选中它，展开「随身听」那一栏，从自己电脑里挑一首歌刻进去。默认只有你听得见，共享出去才全桌一起听");
                    }}
                  >
                    <Headphones className="size-4" />
                  </Slot>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  跟唱片机不一样：这首歌的字节始终留在刻它的那个人电脑上，服务器不存它。所以摆下来先只有他自己听得到，
                  走带（放与停、第几秒、音量、循环）也全在那台机器本地，一个字段都不写上桌。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  想跟人一起听就按「共享给全桌一起听」：进度这才变成桌上共享的一份，同桌那台机器会向他一段一段求这首歌，
                  求到了就各自放着。双击机器是放与停，窄屏时长按菜单里也有同样这几行。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Tablet className="size-3" />平板浏览器</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot
                    label="平板浏览器"
                    hint="贴一条网址，全桌看同一页"
                    onClick={() => {
                      onAction(addTabletAction(color));
                      onNotify("放下了平板浏览器：选中它，展开「平板浏览器」那一栏，把网址或 B 站的 BV 号贴进去就载入；页面由每台机器自己去看，服务器只传那一条地址");
                    }}
                  >
                    <Tablet className="size-4" />
                  </Slot>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  摆下来是一台空机：贴上去的只是一条地址（http/https 都认，B 站的 BV 号与整条链接也认），
                  画面、字幕、弹幕都由这台浏览器自己去找站点要，服务器一份页面字节都不存、不转。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  贴 B 站的地址时另外多出一整套走带：放、停、第几秒、第几集、静音是桌上共享的一份状态，一个人按下去全桌一起动，
                  各端按同一时刻自己推现在的位置，不是一秒一次往桌上回写。贴别的网址就只同步「这条地址」本身。
                  选中栏里还能「放大观看」——那块屏会浮到桌面上来，站点自己的控件都能用。
                  要直接在桌上这块屏里点东西就按「上手摸这块屏」（双击屏面也是它）：镜头凑到屏前，屏面那一片矩形里的点击与滚轮归那个站点，边框以外照旧是桌子，按「手离开屏幕」收回。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  两处做不到，先说清楚：跨源的屏不告诉我们它读到哪儿了，所以上手之后在屏里点了链接、拖了进度，桌上不会跟着变，同桌也看不见你翻到了哪一页，
                  要扳回桌上那一条地址就按「重新载入」；不少站点不许别人把它嵌进窗口里，那块屏会一直白着，这种就用「新标签打开」。
                </p>
              </div>
            </div>
          )}
          {tab === "site" && (
            <div className="space-y-3">
              {/* 底面是开桌前定的：换棋盘、铺桌垫在归约里都算 boardSet，游戏模式一概不收。这一组跟着收起，别让一排按不动的格子留在页面上 */}
              {gaming ? (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  棋盘与桌垫是开桌前定的底面，游戏模式里已经收起；要换盘先在「管理」里退出游戏模式。
                </p>
              ) : (
              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Compass className="size-3" />棋盘与桌垫</div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  一张桌子只有一张底面：这里点哪张就换上哪张，格子或交叉线立刻给棋子当吸附点。
                  只换盘面、不摆子——一整盘的起手位置归上方那颗「开局」管。
                </p>
                <div className="pt-0.5 text-[11px] font-medium text-foreground/90">棋类盘</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {BOARDS.filter((b) => b.grid).map((b) => (
                    <Slot
                      key={b.id}
                      label={b.name}
                      hint={boardHint(b)}
                      onClick={() => {
                        onAction(boardPresetAction(b.id));
                        onNotify(`换上了${b.name}：选中它可以开关网格、锁定盘面`);
                      }}
                    >
                      <Compass className="size-4" />
                    </Slot>
                  ))}
                </div>
                <div className="pt-0.5 text-[11px] font-medium text-foreground/90">跑格与战棋</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {BOARDS.filter((b) => !b.grid && b.id !== "none").map((b) => (
                    <Slot
                      key={b.id}
                      label={b.name}
                      hint={boardHint(b)}
                      onClick={() => {
                        onAction(boardPresetAction(b.id));
                        onNotify(`换上了${b.name}：选中它可以开关网格、锁定盘面`);
                      }}
                    >
                      <Compass className="size-4" />
                    </Slot>
                  ))}
                  <Slot label="撤掉棋盘" hint="回到纯桌布，桌面上已有的东西都留着" onClick={() => onAction(boardPresetAction(null))}>
                    <Sparkles className="size-4" />
                  </Slot>
                </div>
                <div className="pt-0.5 text-[11px] font-medium text-foreground/90">大图桌垫</div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  一般压到合适尺寸再铺；画质切到「超清」时塞得下就原样存，清晰度换存储。
                </p>
                <input ref={matFile} type="file" accept="image/*" className="hidden" onChange={(e) => void onMatFile(e.target.files)} />
                <Slot label={matBusy ? "处理中…" : "导入图片当桌垫"} hint="多大都能传，太大会压小" onClick={() => matFile.current?.click()}>
                  <ImagePlus className="size-4" />
                </Slot>
                <label className="block space-y-1">
                  <span className="panel-title">桌垫尺寸 {(matLong * 100).toFixed(0)}cm</span>
                  <input
                    type="range"
                    min={0.4}
                    max={2.2}
                    step={0.1}
                    value={matLong}
                    onChange={(e) => setMatLong(Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label="桌垫尺寸"
                  />
                </label>
              </div>
              )}

              <div className="grid grid-cols-1 gap-1.5">
                {ZONE_PRESETS.map((z) => (
                  <Slot
                    key={z.label}
                    label={z.label}
                    hint={`${z.hint} · ${Math.round(z.w * 100)}×${Math.round(z.d * 100)}cm`}
                    onClick={() => {
                      onAction(addZoneAction(color, z.w, z.d, me.id));
                      onNotify("放下了区域垫，选中它可以开启隐私模式");
                    }}
                  >
                    <Frame className="size-4" />
                  </Slot>
                ))}
              </div>
              <div className="space-y-1 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><RectangleHorizontal className="size-3" />垫子</div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  垫子和区域垫管的是同一件事——圈住一片地方，手牌可以点名打上来——但它画成实心的一块布面，
                  不是一框虚线。颜色用上方那排色点，选哪个就是哪个色。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  也能把自己喜欢的图当垫面：先点「导入图片当垫子」，选中垫子后随时能换一张或者撤掉回到纯色。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {PAD_PRESETS.map((z) => (
                  <Slot
                    key={z.label}
                    label={z.label}
                    hint={`${z.hint} · ${Math.round(z.w * 100)}×${Math.round(z.d * 100)}cm`}
                    onClick={() => {
                      onAction(addPadAction(color, z.w, z.d, me.id));
                      onNotify("放下了垫子，从手里点一张牌可以选择打到它上面");
                    }}
                  >
                    <RectangleHorizontal className="size-4" />
                  </Slot>
                ))}
              </div>
              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title">图片垫子</div>
                <input ref={padFile} type="file" accept="image/*" className="hidden" onChange={(e) => void onPadFile(e.target.files)} />
                <Slot label={padBusy ? "处理中…" : "导入图片当垫子"} hint="按原图比例铺一块垫面，大小由下面的滑条定" onClick={() => padFile.current?.click()}>
                  <ImagePlus className="size-4" />
                </Slot>
                <label className="block space-y-1">
                  <span className="panel-title">垫子长边 {(padLong * 100).toFixed(0)}cm</span>
                  <input
                    type="range"
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    value={padLong}
                    onChange={(e) => setPadLong(Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label="垫子长边"
                  />
                </label>
              </div>
              <div className="space-y-1 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Ruler className="size-3" />统计垫</div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  统计垫与区域垫是两样东西：它不圈归属、不做保密，只管数垫子范围内的牌——
                  长边立着算「竖放」，横躺算「横放」，两个数字直接印在垫面上，随时更新。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  大小可以一直调，摆好位置后点「锁定」：锁定后它不再能被选中，谁也搬不走，
                  只能点垫子角上那颗小小的解锁按钮才能重新挪动。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {STAT_PRESETS.map((z) => (
                  <Slot
                    key={z.label}
                    label={z.label}
                    hint={`${z.hint} · ${Math.round(z.w * 100)}×${Math.round(z.d * 100)}cm`}
                    onClick={() => {
                      onAction(addStatMatAction(color, z.w, z.d));
                      onNotify("放下了统计垫，把牌摆上去就开始数竖放与横放");
                    }}
                  >
                    <Ruler className="size-4" />
                  </Slot>
                ))}
              </div>
              <div className="space-y-1 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Magnet className="size-3" />卡槽带</div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  卡槽带是一条压出格子的桌垫：牌拖到它上面就自动吸进最近的空槽，朝向跟着带子转，
                  一次拖几张就顺着排几张——乱牌往上一丢就是整整齐齐的一排。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  拖动带子会带着槽里的牌一起走；选中它可以加减格数，或者点「摊齐」把牌按原来的先后重排一遍。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {SLOT_PRESETS.map((z) => (
                  <Slot
                    key={z.label}
                    label={z.label}
                    hint={z.hint}
                    onClick={() => {
                      onAction(addSlotAction(color, z.n));
                      onNotify("放下了卡槽带，把牌拖上去就会自动对齐");
                    }}
                  >
                    <Magnet className="size-4" />
                  </Slot>
                ))}
              </div>
              <div className="space-y-1 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Lock className="size-3" />隐私模式</div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  区域垫是桌面上的一块范围，圈住的东西算“在区域内”。选中区域后用操作条开启隐私模式：
                  开着时只有你能动区域内的东西，别人连牌面也看不到。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  关闭隐私模式后别人可以正常移动、翻面、摸牌，但只要你还是区域创建者，牌面依旧只对你可见；
                  把牌拿出区域就恢复正常。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  拖动区域垫会带着圈里的东西一起走；牌面保密是按观看者各自渲染的，不会写进共享桌面。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  摸牌默认一律进手牌。想摊到某块区域上，选中那块区域点「设为首选」，摸牌与打手牌才会落到这里，落点按区域大小排格子，看到哪张就落在哪。
                  不想要自动生成的手牌区，选中它按删除就行，删掉后这一间房不会再自动补回来。
                </p>
              </div>
              <div className="space-y-1 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Shield className="size-3" />牌屏</div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  牌屏是立在面前的一块挡板：摆它的人自动成为主人，屏前那一窄条（{Math.round(SHIELD_BAND * 100)}cm 深，只在主人这一侧）里的牌从此只对主人亮着，
                  别人看过去只看见屏背面印的名字。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  和区域垫的隐私模式是两样东西：牌屏挡的是「眼前这一条」，谁坐这一侧就自然挡谁，不用圈范围也不用开开关；
                  区域垫圈住的是一整块桌面，还能顺手不让别人碰。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  选中屏可以拉长、抬高，或者点「放开归属」当一块纯挡板用——不认主人的屏谁也不挡。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {SHIELD_PRESETS.map((z) => (
                  <Slot
                    key={z.label}
                    label={z.label}
                    hint={`${z.hint} · ${Math.round(z.w * 100)}×${Math.round(z.h * 100)}cm`}
                    onClick={() => {
                      onAction(addShieldAction(color, me.id, z.w, z.h));
                      onNotify("放下了牌屏，把牌摆到屏前那一窄条里就只有你看得见");
                    }}
                  >
                    <Shield className="size-4" />
                  </Slot>
                ))}
              </div>
            </div>
          )}
          {tab === "tool" && (
            <div className="space-y-3">
              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Timer className="size-3" />计时器</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {TIMER_PRESETS.map((s) => (
                    <Slot key={s} label={mmss(s)} hint="放到桌面" onClick={() => onAction(addTimerAction(s, color))}>
                      <Timer className="size-4" />
                    </Slot>
                  ))}
                </div>
                <label className="block space-y-1">
                  <span className="panel-title">自定义 {mmss(clamp(timerMinutes, 1, 60) * 60)}</span>
                  <input
                    type="range"
                    min={TIMER_MIN}
                    max={60}
                    step={1}
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label="计时器分钟数"
                  />
                </label>
                <Button size="xs" variant="outline" className="w-full gap-1" onClick={() => onAction(addTimerAction(timerMinutes * 60, color))}>
                  <Timer className="size-3" />放下 {mmss(timerMinutes * 60)} 计时器
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">可以同时放多个，双击桌面上的计时器就开始或暂停。</p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Hourglass className="size-3" />沙漏</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {HOUR_PRESETS.map((m) => (
                    <Slot
                      key={m}
                      label={`${m} 分钟`}
                      hint="摆下来不漏"
                      onClick={() => {
                        onAction(addHourAction(color, m));
                        onNotify("放下了沙漏，双击它就把沙子翻过来开始漏");
                      }}
                    >
                      <Hourglass className="size-4" />
                    </Slot>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  沙漏和计时器是两样东西：它没有按钮也没有暂停，翻过来就漏、按回去就停，一漏完就响铃提醒下一个人。
                  所以它适合「一轮就这么长」的回合时限，不适合倒计时还剩多少秒那种精确读秒。
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  沙漏立着摆，翻面会让沙子重新装满，所以漏到一半按回去、再翻过来就是完整的一漏。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><BookOpen className="size-3" />规则书</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <Slot
                    label="房规小书"
                    hint="自带房规/计分/备忘三页"
                    onClick={() => {
                      onAction(addBookAction(color));
                      onNotify("放下了规则书，双击翻页，选中它可以改字和加减页");
                    }}
                  >
                    <BookOpen className="size-4" />
                  </Slot>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  规则书是摊在桌上的一本小册子，纸面就把当前这一页印在书页上，同桌的人看的是同一页。
                  双击它往后翻一页，选中它可以改这一页的字、加减页数——房规、计分公式、备忘各占一页，
                  免得把话写在便利贴上然后被风吹走。
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title flex items-center gap-1"><Tally1 className="size-3" />迷你计数器</div>
                <Slot
                  label="迷你计数器"
                  hint="拖到卡牌边上就归那张牌，别的牌抢不走"
                  onClick={() => {
                    onAction(addCounterAction(color));
                    onNotify("放下了迷你计数器，拖到卡牌边上就吸住归那张牌，跟着牌走");
                  }}
                >
                  <Tally1 className="size-4" />
                </Slot>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  一小片带 ± 键的读数牌，读数可以是负数。把它拖到任意一张卡牌边上，它就吸上去并归了那张牌，
                  之后那张牌挪到哪儿它跟到哪儿，<b>拖到别的牌上也不会被抢走</b>；要换归属先按脱附，或直接拖到空处散下来，读数留着不清零。
                  双击它等于按一下加号；选中它可以改步进（每按一下走几）、填读数、换一条边或脱附。
                </p>
              </div>

              <div className="rounded-md border border-border/60 bg-black/20 p-2">
                <div className="panel-title mb-1.5">计算器</div>
                <Button size="xs" variant="outline" className="mb-1.5 w-full gap-1" onClick={() => onAction(addCalcAction(color))}>
                  <Calculator className="size-3" />在桌面放一台实体计算器
                </Button>
                <p className="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">实体那台全桌可见，点它的按键或者选中后用下面的键盘按，结果同步给所有人。</p>
                <CalcPanel
                  onToken={(value) => onAction(addTokenAction("算", color, value))}
                  onSend={(value) => onAction(chatAction(`算了一下：${value}`))}
                />
              </div>
            </div>
          )}
        </div>
      </Panel>
      )}
    </div>
  );
}

function CalcPanel({ onToken, onSend }: { onToken: (value: number) => void; onSend: (value: number) => void }) {
  const [expr, setExpr] = useState("");
  const result = evalCalc(expr);

  const tap = (key: string) => setExpr((e) => calcPress(e, key));

  const shown = expr || "0";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 rounded-md border border-border/60 bg-black/35 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground/90">{shown}</span>
        {result !== null && expr !== formatCalc(result) && (
          <span className="shrink-0 font-mono text-sm text-primary">{formatCalc(result)}</span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {CALC_KEYS.flat().map((k) => (
          <Button key={k} size="xs" variant={k === "=" ? "default" : "outline"} className="h-7 font-mono" onClick={() => tap(k)}>
            {k}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Button size="xs" variant="outline" disabled={result === null} onClick={() => onToken(Math.round(result ?? 0))}>
          结果做标记
        </Button>
        <Button size="xs" variant="outline" disabled={result === null} onClick={() => onSend(Math.round(result ?? 0))}>
          结果发聊天
        </Button>
      </div>
    </div>
  );
}
