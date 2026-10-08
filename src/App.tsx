import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BellRing, ChevronDown, ChevronUp, Dices, Eye, Gamepad2, Hand, Keyboard, Layers, LogIn, Maximize, MessageSquare, Minimize, MonitorSmartphone, Orbit, Rotate3D, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Users, Wifi, X } from "lucide-react";
import { starter } from "@/game/factory";
import { ARROW_MAX, ARROW_MIN, BOARDS, BOOK_PAGE_MAX, CONTAINER_KINDS, COUNTER_EDGE_NAMES, COUNTER_STEPS, GUARD_MAX, GUARD_MIN, HOUR_MAX, REACH_DEFAULT, REACH_MAX, REACH_MIN, RULE_CAMP_NAMES, SHIELD_H_MAX, SHIELD_H_MIN, SHIELD_MAX, SHIELD_MIN, SLOT_MAX, SLOT_MIN, SPIN_MAX, SPIN_MIN, STAT_MAX, STAT_MIN, TILT_MAX, ZONE_MAX, ZONE_MIN, biliOf, clamp, displayName, faceHidden, fixBook, fixCounter, fixGram, fixHour, fixMp3, fixShield, fixTablet, fixTray, gridable, lockable, lockedOut, gramPos, mmss, mp3Mine, mp3Pos, pinnable, tabletPos } from "@/game/catalog";
import { localTables, takeLocalTable, type LocalTable } from "@/game/cache";
import { setHdImport, setImageSync, setImageTransport, subscribeImages, imageProgress, pushMissingImages, reloadImages, type ImageProgress } from "@/game/images";
import { ringing, silenceAlarm, silenceAllAlarms, tickAlarm, unlockAlarm } from "@/game/alarm";
import { audioBlocked, audioMuted, requestClips, setAudioMuted, stopAudio, subscribeAudio, syncGrams, unlockAudio } from "@/game/audio";
import { dropLocal, localLoop, localPlaying, localPos, localSeek, localSetLoop, localSetVol, localToggle, localVol, mp3View, pruneLocal, pullLocalSongs, retryTrack, songHere, subscribeTransfers, transferOf } from "@/game/mp3";
import { presetImages, takePreset, type PresetMeta } from "@/game/preset";
import { tabletHost } from "@/game/tablet";
import { addCounterAction, arrowLenAction, bookPageAction, bookPagesAction, calcKeyAction, chatAction, counterAttachAction, counterSetAction, counterStepAction, counterStepSetAction, cutAction, dealAction, drawAction, drawIntoAction, drawLandingText, duplicateAction, evenSplitAction, forgetHandZone, gramLoadAction, gramLoopAction, gramNudgeAction, gramVolAction, gatherAction, gramPlayAction, grabAction, gridLockAction, handAction, handZoneAction, handZoneForgotten, handZoneOf, hourFlipAction, hourSetAction, isHandZone, markAction, markClearAction, meshAction, mp3LoopAction, mp3PlayAction, mp3SeekAction, mp3ShareAction, mp3VolAction, nudgeAction, padLockAction, placeAction, pourAction, resetAction, rollAction, rollAllAction, rotResetAction, scaleAction, shieldClaimAction, shieldResizeAction, shuffleAction, slotResizeAction, snapOnAction, spinAction, spinSetAction, splitParts, splitPilesAction, statResizeAction, straightenAllAction, spreadAction, tabletClearAction, tabletMuteAction, tabletNudgeAction, tabletPageAction, tabletPlayAction, tabletReloadAction, takeHandZoneAction, tidyAction, timerPauseAction, timerResetAction, timerRunAction, trayResizeAction, zonePrivAction, zonePrefAction, zoneRangeAction, zoneResizeAction, type DrawPick } from "@/game/ops";
import { checkedKing, governed, judge, pointsOf, type MovePoint } from "@/game/rules";
import { GAME_SHUT_HINT } from "@/game/perm";
import { useTable } from "@/game/useTable";
import { BRIGHT_DEFAULT, BRIGHT_MAX, BRIGHT_MIN, COARSE_POINTER, QUALITY_LABEL, QUALITY_LEVELS, loadView, saveView, type ViewPrefs } from "@/game/view";
import type { Action, GameObject, LogEntry, Move, TableState } from "@/game/types";
import { ChatIsland } from "./ui/ChatIsland";
import { Tabletop, type TabletopEvents, type ViewName } from "@/three/scene";
import { Button } from "@/components/ui/button";
import { ArchiveSheet } from "./ui/ArchiveSheet";
import { CacheSheet } from "./ui/CacheSheet";
import { CardPanel } from "./ui/CardPanel";
import { CardPeek } from "./ui/CardPeek";
import { TabletPanel } from "./ui/TabletPanel";
import { HandBar } from "./ui/HandBar";
import { LobbySheet } from "./ui/LobbySheet";
import { ManageSheet } from "./ui/ManageSheet";
import { Palette } from "./ui/Palette";
import { PresetSheet } from "./ui/PresetSheet";
import { PullList } from "./ui/PullList";
import { SelectionBar, type AdjustCtl, type PointCtl } from "./ui/SelectionBar";
import { TablePanel } from "./ui/TablePanel";
import { HelpSheet, RoomDialog, StartScreen } from "./ui/StartScreen";
import { cn } from "@/lib/utils";

const VIEWS: { id: ViewName; label: string }[] = [
  { id: "default", label: "斜视" },
  { id: "top", label: "俯视" },
  { id: "seat", label: "坐位" },
];

const QUALITY_HINT: Record<ViewPrefs["quality"], string> = {
  ultra: "超清：屏幕像素全开，导入的图塞得下单图额度就一字节不改地存，放不下才按原分辨率重压；卡面画布也按原图分辨率重画，一整桌大图最吃显存",
  high: "高清：卡面与小字最锐，导入的图仍会压进卡面额度",
  balanced: "折中档：像素密度降一点，手机跑得住",
  light: "省资源：关掉阴影，按屏幕宽度出图",
};
/** 手机先跑均衡：显存和带宽吃不下满清晰度。桌面/大屏默认「高」，卡面和小字一次就画到位 */
const MOBILE_BOOT = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
/**
 * 安卓 App 的壳（Capacitor 的 WebView 在 UA 末尾追加了这个标记）。
 * 壳里本来就没有浏览器上下那两条工具条，网页全屏与锁横屏这两颗按下去只会失败，所以干脆不给看到。
 */
const IN_SHELL = /tabletop-app/.test(navigator.userAgent);

/** 按住 Q/E 与 R/F 时的角速度（度/秒）：水平转得快，俯仰要慢才好摆斜靠 */
const YAW_RATE = 150;
const PITCH_RATE = 60;
/** 一按就松、连一帧都没攒够时的最小刻度：不然手机上轻点像按钮坏了 */
const TAP_YAW = 15;
const TAP_PITCH = 5;

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<Tabletop | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), []);
  /** 画面偏好：画质档 + 灯光亮度 + 本机游戏模式，都跟着这台浏览器走 */
  const [prefs, setPrefs] = useState<ViewPrefs>(() => loadView({ quality: MOBILE_BOOT ? "balanced" : "high" }));
  const table = useTable(notify, prefs.game);

  const [selected, setSelected] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string | null } | null>(null);
  const [help, setHelp] = useState(false);
  const [room, setRoom] = useState<"create" | "join" | null>(null);
  /** 抽屉各管一件事：服务器上的存档、此刻挂牌的活房间、房主管理、这台浏览器的缓存、本机桌面预设 */
  const [drawer, setDrawer] = useState<"roms" | "lobby" | "manage" | "cache" | "presets" | null>(null);
  const [recent, setRecent] = useState<LocalTable[]>([]);
  const [brush, setBrush] = useState("#c8443c");
  const [screen, setScreen] = useState(false);
  // 手机上一条侧栏就占掉大半屏，默认都收起来，打开一条时另一条自动让位
  const [panels, setPanels] = useState(() => (window.innerWidth >= 1024 ? { left: true, right: true } : { left: false, right: false }));
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [cardMgr, setCardMgr] = useState<string | null>(null);
  /** 右键「查看全部」打开的收纳列表 */
  const [pull, setPull] = useState<string | null>(null);
  /** 长按细看的那张牌：桌面上的牌与手牌共用一个大图浮层 */
  const [inspect, setInspect] = useState<string | null>(null);
  /** 放大观看的那块平板屏：浮在桌面上，里面就是那个站点自己的页面 */
  const [watch, setWatch] = useState<string | null>(null);
  /** 上手摸屏的那台平板：只有它，屏面内的点击才归页面而不是桌子 */
  const [touch, setTouch] = useState<string | null>(null);
  /**
   * 摸牌的落点：挑中的那块区域。存在这一层而不是选中栏里，因为没选中东西时
   * 选中栏整个卸掉，值放那儿一取消选中就丢；双击、长按菜单、收纳列表共用这同一份。
   */
  const [drawPick, setDrawPick] = useState<DrawPick>(null);
  useEffect(() => {
    // 挑中的区域被人拿走了就退回默认落点，别让下一次摸牌把按钮钉在一块已经不存在的区域上
    if (drawPick !== null && drawPick !== "hand" && !table.state.o.some((o) => o.id === drawPick && o.kind === "zone")) setDrawPick(null);
  }, [drawPick, table.state]);
  /** 正在响的计时器 id：静音只发生在这一台机器上 */
  const [alarm, setAlarm] = useState<string[]>([]);
  const alarmKey = useRef("");
  /** 每 +1，右侧面板就翻到聊天页签并聚焦输入框 */
  const [chatGoto, setChatGoto] = useState(0);
  // 开局就在记录里的那些聊天算已经看过，不然一进房就顶着一串未读
  const [chatSeen, setChatSeen] = useState(() => {
    const log = table.state.log;
    for (let i = log.length - 1; i >= 0; i--) if (log[i].kind === "chat") return log[i].id;
    return "";
  });
  const headerRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /** 手牌条那一块屏幕：桌上的牌拖进来就是收进手里，所以场景要问得出「这个点在不在牌栏上」 */
  const handRef = useRef<HTMLDivElement>(null);
  const [dragHand, setDragHand] = useState(false);
  /** 窄屏：右侧面板改从底部滑出的抽屉，避免和顶栏、手牌条抢同一条竖边 */
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1024);
  /** 矮屏（手机横屏）：竖屏那套两行顶栏会吃掉太多高度，横屏退回单行 */
  const [short, setShort] = useState(() => window.innerHeight < 520);
  /** 网页全屏状态：跟着 fullscreenchange 走，退出时顺手解除横屏锁定 */
  const [full, setFull] = useState(false);
  const wasWide = useRef(window.innerWidth >= 1024);

  const state = table.state;
  const stateRef = useRef<TableState>(state);
  stateRef.current = state;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  /**
   * 此刻真正在线的客户端 id：区域锁与牌面保密都靠它判断主人还在不在席。
   * 本地牌桌没有在线概念，给 undefined 让锁回到「只看归属」的老行为。
   */
  const present = useMemo(() => (table.mode === "online" ? new Set(Object.keys(table.presence)) : undefined), [table.mode, table.presence]);
  const presentRef = useRef(present);
  presentRef.current = present;
  const rollQueue = useRef<{ id: string; spread: number }[]>([]);

  const dispatch = useCallback((action: Action | null, opts?: { retry?: boolean }) => {
    if (!action) return;
    // 手牌区是自己要删掉的：就地记账，别等下一轮 effect 又自动补一块回来
    if (action.t === "remove" && table.code) {
      const gone = new Set(action.ids);
      if (stateRef.current.o.some((o) => gone.has(o.id) && isHandZone(o))) forgetHandZone(table.code);
    }
    table.dispatch(action, opts);
  }, [table]);

  const chats = useMemo(() => state.log.filter((l) => l.kind === "chat"), [state.log]);
  /** 未读：从「上次看过的那条」往后数；开局前已存在的聊天记录不算未读 */
  const unread = (() => {
    const i = chats.findIndex((c) => c.id === chatSeen);
    return i < 0 ? chats.length : chats.length - 1 - i;
  })();
  const openChat = useCallback(() => {
    setPanels((p) => (window.innerWidth >= 1024 ? { ...p, right: true } : { left: false, right: true }));
    setChatGoto((n) => n + 1);
  }, []);
  const markChatSeen = useCallback((id: string) => setChatSeen((x) => (x === id ? x : id)), []);
  const ownChat = useCallback((l: LogEntry) => l.by === table.me.name, [table.me.name]);

  /** spread=1 甩开投掷，spread=0 原地弹跳 */
  const doRoll = useCallback((ids: string[], spread = 1) => {
    const r = rollAction(stateRef.current.o, ids);
    if (!r) return;
    rollQueue.current.push(...r.ids.map((id) => ({ id, spread })));
    table.dispatch(r.action);
  }, [table]);

  const rollEverything = useCallback(() => {
    const r = rollAllAction(stateRef.current.o);
    if (!r) {
      setToast({ id: Date.now(), text: "桌面上还没有骰子" });
      return;
    }
    rollQueue.current.push(...r.ids.map((id) => ({ id, spread: 1 })));
    table.dispatch(r.action);
  }, [table]);

  const togglePanel = useCallback((side: "left" | "right") => {
    setPanels((p) => {
      const open = !p[side];
      if (!open || window.innerWidth >= 1024) return { ...p, [side]: open };
      return side === "left" ? { left: true, right: false } : { left: false, right: true };
    });
  }, []);

  /* ——— 3D 场景 ——— */

  const handlers = useRef<TabletopEvents>({
    onSelect: () => undefined,
    onCommit: () => undefined,
    onDropIn: () => undefined,
    onDragLive: () => undefined,
    onDragZone: () => undefined,
    onToHand: () => undefined,
    onDouble: () => undefined,
    onContext: () => undefined,
    onCalcKey: () => undefined,
    onCounterKey: () => undefined,
    onUnlock: () => undefined,
    onInspect: () => undefined,
    onBlank: () => undefined,
  });

  handlers.current.onSelect = (ids) => {
    setSelected(ids);
    setMenu(null);
  };

  // 点一下空白：选中的东西放开，左右两侧菜单也一起收回，桌面立刻让出来
  handlers.current.onBlank = () => {
    setSelected([]);
    setMenu(null);
    setPanels((p) => (p.left || p.right ? { left: false, right: false } : p));
  };

  handlers.current.onCommit = (moves: Move[], rigid: boolean) => dispatch({ t: "move", m: moves, rigid });

  handlers.current.onDragLive = (moves) => table.sendDrag(moves);

  // 拖动途中指针进了牌栏：亮起来，松手就是收牌
  handlers.current.onDragZone = (zone) => setDragHand(zone === "hand");

  handlers.current.onToHand = (ids) => dispatch(handAction(ids, table.me.id));

  // 松手时盒口正亮着：这几张不是摊在盒盖上，是丢进那个盒
  handlers.current.onDropIn = (ids, cid) => {
    const a = gatherAction(stateRef.current.o, cid, ids);
    if (a) dispatch(a);
  };

  handlers.current.onCalcKey = (id, key) => {
    const o = stateRef.current.o.find((x) => x.id === id);
    if (o) dispatch(calcKeyAction(o, key));
  };

  // 迷你计数器顶上的 ± 键帽：减号在左，加号在右
  handlers.current.onCounterKey = (id, key) => {
    const o = stateRef.current.o.find((x) => x.id === id);
    if (!o) return;
    const a = counterStepAction(o, key === "−" || key === "-" ? -1 : 1);
    if (a) dispatch(a);
  };

  handlers.current.onUnlock = (id) => {
    const o = stateRef.current.o.find((x) => x.id === id);
    if (o) dispatch(padLockAction(o, false));
  };

  handlers.current.onDouble = (id) => {
    const o = stateRef.current.o.find((x) => x.id === id);
    if (!o) return;
    setSelected([id]);
    if (o.kind === "die") doRoll([id], 0);
    else if (o.kind === "spinner") dispatch(spinAction(o));
    else if (o.kind === "bag" || o.kind === "pile" || o.kind === "box") dispatch(drawIntoAction(stateRef.current, id, 1, table.me.id, drawPick, o.kind === "bag"));
    else if (o.kind === "card") dispatch({ t: "flip", ids: [id] });
    else if (o.kind === "timer") dispatch(o.endsAt != null ? timerPauseAction(o) : timerRunAction(o));
    else if (o.kind === "token") dispatch({ t: "count", id, delta: 1 });
    // 双击迷你计数器就是按一下加号：点不中那么小的键帽时还有一条路
    else if (o.kind === "counter") {
      const a = counterStepAction(o, 1);
      if (a) dispatch(a);
    }
    else if (o.kind === "pawn") dispatch({ t: "layer", ids: [id], delta: 1 });
    // 双击沙漏就是翻面：躺着翻过来起算，漏着按回去停住
    else if (o.kind === "hour") dispatch(hourFlipAction(o));
    // 双击书页往后翻，翻到最后一页再点就回到第一页，连着看不会被卡在末尾
    else if (o.kind === "book") {
      const b = fixBook(o.book);
      dispatch(bookPageAction(o, b.page >= b.pages.length - 1 ? -(b.pages.length - 1) : 1));
    }
    // 双击唱片机就是放/停：这一下本身就是手势，浏览器要的那一声「用户点过」也跟着满足了
    else if (o.kind === "gram") {
      unlockAudio();
      dispatch(gramPlayAction(o, !fixGram(o.gram).playing));
    }
    // 双击随身听：没共享出去时按的是本机这一档（别人听不着），共享出去了才走桌面那一份
    else if (o.kind === "mp3") {
      const m = fixMp3(o.mp3);
      if (!m.clip || !songHere(m.clip)) return;
      unlockAudio();
      if (m.shared) dispatch(mp3PlayAction(o, !m.playing));
      else localToggle(o);
    }
    // 双击平板：B 站那种地址按放/停（这一下本身就是手势，被浏览器拦住的自动播在这儿能救回来）；
    // 普通网页没有走带可拧，双击就是「上手摸这块屏」——镜头凑到屏前，里面的链接按钮归那个站点
    else if (o.kind === "tablet") {
      const tp = fixTablet(o.tablet);
      if (biliOf(tp.url)) dispatch(tabletPlayAction(o, !tp.playing));
      else if (tp.url) setTouch(o.id);
    }
    // 双击卡槽带就是「整理」：把带子上的牌按原先后重排一遍
    else if (o.kind === "slot") {
      const a = tidyAction(stateRef.current, o);
      if (a) dispatch(a);
    }
  };

  handlers.current.onContext = (id, at) => {
    if (id) setSelected([id]);
    setMenu({ ...at, id });
  };

  // 长按：只把那张牌端到眼前看，不改状态也不影响别人
  handlers.current.onInspect = (id) => {
    const o = stateRef.current.o.find((x) => x.id === id);
    if (!o) return;
    setSelected([id]);
    setInspect(id);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const tabletop = new Tabletop({
      onSelect: (ids, additive) => handlers.current.onSelect(ids, additive),
      onCommit: (moves, rigid) => handlers.current.onCommit(moves, rigid),
      onDropIn: (ids, cid) => handlers.current.onDropIn(ids, cid),
      onDragLive: (moves) => handlers.current.onDragLive(moves),
      onDragZone: (zone) => handlers.current.onDragZone(zone),
      onToHand: (ids) => handlers.current.onToHand(ids),
      onDouble: (id) => handlers.current.onDouble(id),
      onContext: (id, at) => handlers.current.onContext(id, at),
      onCalcKey: (id, key) => handlers.current.onCalcKey(id, key),
      onCounterKey: (id, key) => handlers.current.onCounterKey(id, key),
      onUnlock: (id) => handlers.current.onUnlock(id),
      onInspect: (id) => handlers.current.onInspect(id),
      onBlank: () => handlers.current.onBlank(),
    });
    tableRef.current = tabletop;
    tabletop.mount(host);
    tabletop.sync(stateRef.current);
    // 开发期探针：浏览器里检查相机/灯具/卡面渲染状态用
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tabletop = tabletop;
    return () => {
      tabletop.unmount();
      tableRef.current = null;
      if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__tabletop;
    };
  }, []);

  useEffect(() => {
    const tabletop = tableRef.current;
    if (!tabletop) return;
    tabletop.sync(state);
    const queued = rollQueue.current;
    rollQueue.current = [];
    for (const { id, spread } of queued) tabletop.roll(id, spread);
  }, [state]);

  useEffect(() => {
    for (const id of table.rollSignal.ids) tableRef.current?.roll(id);
  }, [table.rollSignal]);

  /** 别人拖动途中的位置只画预览圈，不进状态：走订阅直接喂给场景，省掉一轮渲染 */
  useEffect(() => table.onPeerDrag((mark) => tableRef.current?.peerDrag(mark)), [table.onPeerDrag]);

  /**
   * 我选中了哪几件也要说给别人听——不然别人只看得见「东西在动」，看不见「是谁正按着它」。
   * 只跟着 selected 走、每 1.8 秒补一发心跳，不跟 state：
   * 选中不动的东西没有重发位置的意义，还要给拖动帧留出服务端每人 20 帧/秒的额度。
   */
  useEffect(() => {
    const beat = () => {
      const st = stateRef.current;
      table.sendDrag(
        selected
          .map((id) => st.o.find((o) => o.id === id))
          .filter((o) => !!o && !o.hand)
          .slice(0, 24)
          .map((o) => ({ id: o!.id, x: o!.x, z: o!.z, rot: o!.rot })),
        "pick",
      );
    };
    // 清空选中的那一发也必须发：收到空帧才知道该把小图标松手收掉
    beat();
    if (!selected.length) return;
    const id = window.setInterval(beat, 1800);
    return () => window.clearInterval(id);
  }, [selected, table.sendDrag]);

  // 联网时卡面图片走房间服务共享，本地牌桌只用内存缓存
  useEffect(() => {
    setImageTransport(table.mode === "online" ? table.images : null);
  }, [table.mode, table.images]);

  // 服务器确实没有的那几张，转向同桌求一轮：谁本机存着谁往服务器补传
  useEffect(() => {
    setImageSync(table.askImages);
    return () => setImageSync(null);
  }, [table.askImages]);

  /** 像素一到手就重读进度：底部小白条兼任「资源加载了多少」 */
  const [pixTick, setPixTick] = useState(0);
  useEffect(() => subscribeImages(() => setPixTick((n) => n + 1)), []);
  const pix = useMemo(() => imageProgress(), [pixTick, state]);

  /* ———— 唱片机：字节下载、本机缓存与全局同步的播放 ———— */

  // 音频模块自己要说话（下好了、取不到、被浏览器挡了），这里只借一次重渲染把话翻到界面上
  const [, setAudTick] = useState(0);
  useEffect(() => subscribeAudio(() => setAudTick((n) => n + 1)), []);
  /** 随身听的取歌进度也要说话：转圈、递到第几段、拿没拿到，都借这一次重渲染翻到界面上 */
  const [, setTrTick] = useState(0);
  useEffect(() => subscribeTransfers(() => setTrTick((n) => n + 1)), []);
  // 桌况一变就照着共享状态对表：该下片的下片，该放该停去拽，进度由各端自己按墙钟推
  useEffect(() => {
    requestClips(state.o);
    pullLocalSongs(state.o);
    pruneLocal(state.o);
    syncGrams(state.o, mp3View);
  }, [state]);
  // 浏览器要人的手势才肯出声：跟响铃同一个路子，第一次按下就把嗓子放开
  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio);
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);
  // 离桌就按停：不该在开场页背后还放着一首歌
  useEffect(() => {
    if (!started) stopAudio();
  }, [started]);

  useEffect(() => {
    tableRef.current?.setSelection(selected);
  }, [selected, state]);

  /**
   * 上手摸屏：把「哪一块屏归页面点」交给渲染层，它顺手把镜头凑到屏前。
   * 只有本机视角跟着变，桌面状态一个字都不写——页面是人家的，跨源读不到里面点了什么。
   */
  useEffect(() => {
    tableRef.current?.setTouchScreen(touch);
  }, [touch, state]);

  /**
   * 放大观看浮层自己就是一个播放器：开着的那一块屏桌上别再挂第二份。
   * 两份一起解码手机上顶不住，而且同一片的声音会走两路；关掉浮层时桌上那份按起播秒重新挂回来。
   */
  useEffect(() => {
    tableRef.current?.setWatchScreen(watch);
  }, [watch, state]);

  /** 平板被挪走、页面被关掉、不再选中，或浮层已经盖上来：指针立刻还给桌子，别留一只看不见的手按在屏上 */
  useEffect(() => {
    if (!touch) return;
    const o = state.o.find((x) => x.id === touch);
    const live = !!o && o.kind === "tablet" && !o.hand && !!fixTablet(o.tablet).url
      && selected.includes(touch) && !watch;
    if (!live) setTouch(null);
  }, [touch, state, selected, watch]);

  /** 场景问「这个屏幕点是不是牌栏」时只能靠 DOM 量，因为牌栏归 React 摆 */
  useEffect(() => {
    const tabletop = tableRef.current;
    if (!tabletop) return;
    tabletop.setDropZone((x, y) => {
      const el = handRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.height < 4) return null;
      // 上沿再让出 24 像素：手往下拖总会多越过一点，贴着边判定就成了「明明拖到牌栏了却放不下」
      return x >= r.left && x <= r.right && y >= r.top - 24 && y <= r.bottom ? "hand" : null;
    });
    return () => tabletop.setDropZone(null);
  }, []);

  /** 手牌往桌上拖：把指针换算成桌面落点并画出预览圈，圈画在哪就把牌打到哪 */
  const probeDrop = useCallback((ids: string[], x: number, y: number) => {
    const tabletop = tableRef.current;
    if (!tabletop || !ids.length) return null;
    return tabletop.previewHandDrop(ids[0], x, y);
  }, []);
  const endHandDrop = useCallback(() => tableRef.current?.clearHandDrop(), []);

  // 牌面保密与区域锁都按观看者算：换人就清掉签名，让受影响的网格重建
  useEffect(() => {
    tableRef.current?.setViewer(table.me.id);
  }, [table.me.id]);

  // 在席名单也喂给场景：主人离席后那块区域不再把别人锁在外面
  useEffect(() => {
    tableRef.current?.setPeers(present);
  }, [present]);

  // 区域被别人开启隐私模式后，选中里那些锁住的物件要自动退出来
  useEffect(() => {
    setSelected((cur) => {
      if (!cur.length) return cur;
      const next = cur.filter((id) => {
        const o = state.o.find((x) => x.id === id);
        return o ? !lockedOut(o, state, table.me.id, present) : false;
      });
      return next.length === cur.length ? cur : next;
    });
  }, [state, table.me.id, present]);

  useEffect(() => {
    tableRef.current?.setQuality(prefs.quality);
    tableRef.current?.setBright(prefs.bright);
    tableRef.current?.setOrbit(prefs.orbit);
    tableRef.current?.setPinchRotate(prefs.pinchRotate);
    // 只有超清档不压缩导入：画质档是本机偏好，但传上来的像素同桌都要跟着下载
    setHdImport(prefs.quality === "ultra");
    saveView(prefs);
  }, [prefs]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  /** 开场页要列出这台浏览器记着的房间：它露出来那次统计一遍就够 */
  useEffect(() => {
    if (started) return;
    setRecent(localTables().filter((t) => t.room));
  }, [started]);

  /** 从缓存里把某张桌子摆回本机：这是离线兜底，改动不会同步给别人 */
  const openCached = useCallback((table0: LocalTable) => {
    const hit = takeLocalTable(table0.key);
    if (!hit) {
      notify("这份快照当时太大，只留下了名字");
      return false;
    }
    table.startLocal(hit);
    setSelected([]);
    setStarted(true);
    tableRef.current?.view("default");
    return true;
  }, [notify, table]);

  /**
   * 把本机预设摆上桌面：联网房主要先把这套资源补传上去，别人那边才拉得到图。
   * 补传失败也照样载入——桌面会先长出空心轮廓，谁手上有图谁就该答话。
   */
  const loadPreset = useCallback((meta: PresetMeta) => {
    const hit = takePreset(meta.id);
    if (!hit) {
      notify("这份预设没存下桌面本体");
      return;
    }
    setDrawer(null);
    setSelected([]);
    const put = () => {
      dispatch({ t: "presetLoad", o: hit.o, name: hit.name });
      notify(`载入了桌面预设「${hit.name}」`);
    };
    const keys = presetImages(meta.id);
    if (table.mode !== "online" || !keys.length) {
      put();
      return;
    }
    void pushMissingImages(keys).then(
      (sent) => {
        put();
        if (sent) notify(`载入预设：替全桌补传了 ${sent} 张资源`);
      },
      // 补传问路都问不通，就别卡在传图上：桌子照摆，缺的图交给求源与重载去补
      () => put(),
    );
  }, [dispatch, notify, table.mode]);

  /** 重载资源：把「这张图没了」的判定一起丢掉，重新问本机缓存、服务器与同桌 */
  const reloadPix = useCallback(() => {
    const n = reloadImages();
    notify(n ? `重新加载 ${n} 张资源` : "这张桌面上没有自传资源");
  }, [notify]);

  useEffect(() => {
    const sync = () => {
      const wide = window.innerWidth >= 1024;
      setNarrow(!wide);
      setShort(window.innerHeight < 520);
      // 只在真的跨过窄屏那一刻才收抽屉：进全屏也会改高度，别把用户开着的面板顺手关掉
      if (wasWide.current === wide) return;
      wasWide.current = wide;
      if (!wide) setPanels({ left: false, right: false });
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  /* ——— 全屏 ——— */

  /**
   * 网页全屏：手机把浏览器上下那两条工具条让给牌桌。
   * landscape=true 时再锁一次横屏——这条只有 Firefox/Android Chrome 一类浏览器允许，iOS 一律拒绝。
   */
  const goFull = useCallback(async (landscape: boolean) => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (!(doc.fullscreenElement ?? doc.webkitFullscreenElement)) {
      try {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else {
          notify("这个浏览器不允许网页自己全屏：安卓在浏览器菜单里勾「添加到主屏幕」后从图标打开，iOS 同样加主屏幕后用 Safari 打开才有全屏");
          return;
        }
      } catch {
        notify("全屏被拦下了：这个页面可能不在安全上下文里，或浏览器菜单里禁了全屏");
        return;
      }
    }
    if (!landscape) return;
    // lib.dom 还没收录 lock，运行时只有安卓的几家浏览器真的有
    const orient = window.screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
    if (typeof orient.lock !== "function") {
      notify("已经全屏了，但这台设备不允许网页锁横屏——打开系统的自动旋转再横过来就行");
      return;
    }
    try {
      await orient.lock("landscape");
    } catch {
      notify("横屏锁定被系统拒绝（iOS 的浏览器一律不允许，安卓部分浏览器要先装成主屏幕应用）");
    }
  }, [notify]);

  const leaveFull = useCallback(() => {
    const doc = document as Document & { webkitExitFullscreen?: () => void };
    try {
      window.screen.orientation?.unlock?.();
    } catch {
      /* 不支持 lock 的设备也没有 unlock，忽略 */
    }
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => undefined);
    else doc.webkitExitFullscreen?.();
  }, []);

  useEffect(() => {
    const read = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const on = !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
      setFull(on);
      if (!on) {
        try {
          window.screen.orientation?.unlock?.();
        } catch {
          /* 同上 */
        }
      }
    };
    read();
    document.addEventListener("fullscreenchange", read);
    document.addEventListener("webkitfullscreenchange", read);
    return () => {
      document.removeEventListener("fullscreenchange", read);
      document.removeEventListener("webkitfullscreenchange", read);
    };
  }, []);

  /* ——— 布局量尺 ——— */

  // 侧栏按顶栏和底条的实测高度留位：写死偏移会让最后一行永远藏在底条后面
  useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty("--header-h", `${Math.round(headerRef.current?.getBoundingClientRect().height ?? 0)}px`);
      root.style.setProperty("--strip-h", `${Math.round(stripRef.current?.getBoundingClientRect().height ?? 0) + 12}px`);
      // 手机键盘弹起时 dvh 不动，只能量可视视口：底部抽屉靠这两个变量躲开键盘
      const visible = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--vp-h", `${Math.round(visible)}px`);
      root.style.setProperty("--kb-h", `${Math.max(0, Math.round(window.innerHeight - visible))}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    if (stripRef.current) ro.observe(stripRef.current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, []);

  /* ——— 归零响铃 ——— */

  // 计时器归零后一直滴滴，直到这台机器上有人按掉；浏览器要求先有用户手势才允许出声
  useEffect(() => {
    const onTick = () => {
      const ids = ringing(stateRef.current.o).map((o) => o.id);
      const key = ids.join(",");
      if (key !== alarmKey.current) {
        alarmKey.current = key;
        setAlarm(ids);
      }
      if (ids.length) tickAlarm(stateRef.current.o);
    };
    onTick();
    const timer = window.setInterval(onTick, 220);
    window.addEventListener("pointerdown", unlockAlarm);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlockAlarm);
    };
  }, []);

  /* ——— 联机自动手牌区 ——— */

  /** 这次进房见过自己手牌区没有：见过又没了就是被删了，顺手记一笔别再自动补回来 */
  const hadHandZone = useRef(new Set<string>());
  // 联网进来先给自己圈一块私有的手牌区，别人既选不中也看不见里面的牌面
  useEffect(() => {
    if (table.mode !== "online" || !table.code) return;
    const key = table.code.toUpperCase();
    if (handZoneOf(state, table.me.id)) {
      hadHandZone.current.add(key);
      return;
    }
    if (hadHandZone.current.delete(key)) forgetHandZone(table.code);
    if (handZoneForgotten(table.code)) return;
    const timer = window.setTimeout(() => {
      const s = stateRef.current;
      // 上一轮留下的孤儿手牌区先认领回来：客户端 id 每次重开都会换，直接新建会越攒越多
      dispatch(takeHandZoneAction(s, table.me, presentRef.current) ?? handZoneAction(s, table.me));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dispatch, state, table.code, table.me, table.mode]);

  /* ——— 角度调节：键盘 Q/E/R/F 与移动端迷你 dock 共用一套按住逻辑 ——— */

  /** 一次按住期间的累计角度：松手才提交一条动作，免得把撤销记录刷爆 */
  const poseRef = useRef<{ ids: string[]; base: Map<string, { rot: number; tilt: number }>; yaw: number; pitch: number; hint: { yaw: number; pitch: number } } | null>(null);
  const holdsRef = useRef(new Map<string, { yaw: number; pitch: number }>());
  const poseRaf = useRef(0);
  const poseAt = useRef(0);

  const endPose = useCallback((commit: boolean) => {
    const p = poseRef.current;
    poseRef.current = null;
    let yaw = Math.round(p?.yaw ?? 0);
    let pitch = Math.round((p?.pitch ?? 0) * 10) / 10;
    // 按住没满一帧就抬手：累计还是 0，退成一步最小刻度，让每一次按压都有反馈
    if (p && commit && !yaw && !pitch) {
      yaw = Math.sign(p.hint.yaw) * TAP_YAW;
      pitch = Math.sign(p.hint.pitch) * TAP_PITCH;
    }
    if (p && commit && (yaw || pitch)) dispatch({ t: "rot", ids: p.ids, delta: yaw, pitch });
    tableRef.current?.clearPose();
  }, [dispatch]);

  const poseFrame = useCallback((now: number) => {
    poseRaf.current = 0;
    const p = poseRef.current;
    if (!p) return;
    const dt = poseAt.current ? Math.min(0.05, (now - poseAt.current) / 1000) : 0.016;
    poseAt.current = now;
    if (!holdsRef.current.size) {
      endPose(true);
      return;
    }
    let vy = 0;
    let vp = 0;
    for (const h of holdsRef.current.values()) {
      vy += h.yaw;
      vp += h.pitch;
    }
    p.yaw += vy * dt;
    p.pitch = clamp(p.pitch + vp * dt, -TILT_MAX, TILT_MAX);
    tableRef.current?.previewPose(p.ids.map((id) => {
      const b = p.base.get(id) ?? { rot: 0, tilt: 0 };
      return { id, rot: b.rot + p.yaw, tilt: b.tilt + p.pitch };
    }));
    poseRaf.current = requestAnimationFrame(poseFrame);
  }, [endPose]);

  /** 可调的选中物件：别人锁着的、棋盘与手牌都不算 */
  const adjustable = useCallback(() => {
    const table0 = stateRef.current;
    return selectedRef.current
      .map((id) => table0.o.find((o) => o.id === id))
      .filter((o): o is GameObject => !!o && !lockedOut(o, table0, table.me.id, presentRef.current) && o.kind !== "board" && !o.hand);
  }, [table.me.id]);

  const adjust = useMemo<AdjustCtl>(() => ({
    hold(src, yaw, pitch, on) {
      if (!on) {
        holdsRef.current.delete(src);
        // 松手就地结算，不等下一帧：后台标签里 rAF 可能根本不跑，姿态会悬在这里
        if (!holdsRef.current.size) endPose(true);
        return;
      }
      const chosen = adjustable();
      if (!chosen.length) return;
      if (!poseRef.current) {
        poseRef.current = {
          ids: chosen.map((o) => o.id),
          base: new Map(chosen.map((o) => [o.id, { rot: o.rot, tilt: o.tilt ?? 0 }])),
          yaw: 0,
          pitch: 0,
          hint: { yaw: 0, pitch: 0 },
        };
        poseAt.current = 0;
      }
      const rate = { yaw: yaw * YAW_RATE, pitch: pitch * PITCH_RATE };
      poseRef.current.hint = rate;
      holdsRef.current.set(src, rate);
      if (!poseRaf.current) poseRaf.current = requestAnimationFrame(poseFrame);
    },
    step(yaw, pitch) {
      const chosen = adjustable();
      if (!chosen.length || (!yaw && !pitch)) return;
      dispatch({ t: "rot", ids: chosen.map((o) => o.id), delta: yaw, pitch });
    },
    lock(on) {
      const chosen = adjustable().filter(pinnable);
      if (chosen.length) dispatch({ t: "pin", ids: chosen.map((o) => o.id), on });
    },
    lift(delta) {
      const chosen = adjustable().filter(pinnable);
      if (chosen.length && delta) dispatch({ t: "layer", ids: chosen.map((o) => o.id), delta, pin: true });
    },
  }), [adjustable, dispatch, poseFrame]);

  // 松开键盘或切走窗口都算松手：把按住期间的角度一次性提交
  useEffect(() => {
    const release = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "q" || k === "e" || k === "r" || k === "f") holdsRef.current.delete(`k-${k}`);
    };
    const releaseAll = () => holdsRef.current.clear();
    /**
     * 抬手兜底：手指滑出按钮、被系统手势打断时，按钮自己的 pointerup 可能根本不派发，
     * 按住状态就悬在那里。捕获阶段听 window，比按钮的冒泡处理更早也无所谓——两边都是幂等的。
     */
    const releaseDock = () => {
      let hit = false;
      for (const key of [...holdsRef.current.keys()]) {
        if (key.startsWith("dock-")) {
          holdsRef.current.delete(key);
          hit = true;
        }
      }
      if (hit && !holdsRef.current.size) endPose(true);
    };
    window.addEventListener("keyup", release);
    window.addEventListener("blur", releaseAll);
    window.addEventListener("pointerup", releaseDock, true);
    window.addEventListener("pointercancel", releaseDock, true);
    return () => {
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", releaseAll);
      window.removeEventListener("pointerup", releaseDock, true);
      window.removeEventListener("pointercancel", releaseDock, true);
      holdsRef.current.clear();
      if (poseRaf.current) cancelAnimationFrame(poseRaf.current);
      poseRaf.current = 0;
      endPose(false);
    };
  }, [endPose]);

  /* ——— 键盘 ——— */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") {
        setMenu(null);
        setHelp(false);
        setDrawer(null);
        setCardMgr(null);
        setPull(null);
        setInspect(null);
        setWatch(null);
        setTouch(null);
        setSelected([]);
        return;
      }
      // 进屏状态下键盘归那个页面：这边一颗快捷键都不该再接手，免得按下去动了桌子
      if (!started || cardMgr || pull || drawer || inspect || watch || touch) return;
      const table0 = stateRef.current;
      const ids = selectedRef.current.filter((id) => {
        const o = table0.o.find((x) => x.id === id);
        return o ? !lockedOut(o, table0, table.me.id, presentRef.current) : false;
      });
      const meta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const fine = e.shiftKey ? 0.35 : 1;
      if (meta && key === "z") {
        e.preventDefault();
        table.undo();
      } else if (meta && key === "d") {
        e.preventDefault();
        // 复制是摆桌子的活，游戏模式里按它不该没动静：dispatch 只兜住它认得出的那几类
        if (table.gaming) notify(GAME_SHUT_HINT);
        else dispatch(duplicateAction(stateRef.current.o, ids));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (!ids.length) return;
        // 键盘这条捷径绕过了选中栏那颗收起来的按钮，所以它自己也得看一道闸
        if (table.gaming) notify(GAME_SHUT_HINT);
        else dispatch({ t: "remove", ids });
      } else if (key === "q" || key === "e") {
        // 无极转体：按住就一直转，松手才落定；按住 Shift 转得更慢更好对齐
        if (ids.length && !e.repeat) adjust.hold(`k-${key}`, (key === "e" ? 1 : -1) * fine, 0, true);
      } else if (key === "r" || key === "f") {
        // 选中了物件就让 R/F 管俯仰；空着手按 R 还是掷全部骰子
        if (ids.length) {
          if (!e.repeat) adjust.hold(`k-${key}`, 0, (key === "f" ? 1 : -1) * fine, true);
        } else if (key === "r") rollEverything();
      } else if (key === "t") {
        if (ids.length) dispatch({ t: "flip", ids });
      } else if (key === "z") {
        // 转角归零：按住过 Q/E 才会发现角度回不去，这里给一条退路
        if (ids.length) dispatch(rotResetAction(ids));
      } else if (key === "l") {
        const picked = ids.map((id) => stateRef.current.o.find((o) => o.id === id)).filter((o): o is GameObject => !!o);
        adjust.lock(!picked.some((o) => o.pin));
      } else if (key === "h") {
        // 只在选中卡牌时生效：拿进手牌 / 打回桌面
        const cards = stateRef.current.o.filter((o) => ids.includes(o.id) && o.kind === "card");
        if (cards.length) dispatch(handAction(cards.map((o) => o.id), cards.every((o) => o.hand) ? null : table.me.id));
      } else if (key === "c") {
        dispatch(chatAction("轮到我了"));
      } else if (key === "g") {
        dispatch({ t: "turnNext" });
      } else if (e.key === "1" || e.key === "2" || e.key === "3") {
        tableRef.current?.view(VIEWS[Number(e.key) - 1].id);
      } else if (key === "n" || key === "m") {
        // 轮换落点：N 下一处、M 上一处，亮着的那一格就是回车要走去的地方
        const c = pointRef.current;
        if (c?.list.length) c.cycle(key === "n" ? 1 : -1);
      } else if (e.key === "Enter") {
        // 焦点还停在按钮上时让按钮自己响，否则刚点过「下一处」再按回车会白走一步
        const c = pointRef.current;
        if (c?.list.length && el?.tagName !== "BUTTON") { e.preventDefault(); c.place(c.list[c.cursor]); }
      } else if (e.key.startsWith("Arrow")) {
        // 按住 Shift + 方向键：把选中的物件一格一格挪 1cm，对齐卡牌边缘和格子边界用
        if (!e.shiftKey || !ids.length) return;
        e.preventDefault();
        const step = 0.01;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dz = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (dx || dz) dispatch(nudgeAction(stateRef.current.o, ids, dx, dz));
      } else if (e.key === "?") {
        setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adjust, cardMgr, dispatch, drawer, inspect, pull, rollEverything, started, table, watch]);

  /* ——— 开局与房间 ——— */

  const applyStarter = useCallback((kind: string) => {
    const cur = stateRef.current;
    const next = starter(kind, cur.name || "牌桌");
    if (table.mode === "online") {
      const board = next.o.find((o) => o.kind === "board") ?? null;
      const curBoard = cur.o.find((o) => o.kind === "board") ?? null;
      const pieces = next.o.filter((o) => o.kind !== "board");
      const note = `换上了${kindLabel(kind)}开局`;
      // clear 只收走非棋盘的物件，所以清完再算棋盘那一支还在不在
      if (cur.o.some((o) => o.kind !== "board")) table.dispatch({ t: "clear" });
      if (board && !curBoard) {
        // 桌上原本没棋盘：新棋盘跟棋子一起走「新增物件」，成员没开「更换棋盘」也能摆出整套开局
        table.dispatch({ t: "addMany", o: [board, ...pieces], note });
      } else {
        if (board !== curBoard) table.dispatch({ t: "boardSet", board });
        if (pieces.length) table.dispatch({ t: "addMany", o: pieces, note });
      }
    } else {
      table.startLocal(next);
    }
    setSelected([]);
    setStarted(true);
    tableRef.current?.view("default");
  }, [table]);

  const createRoom = useCallback(async () => {
    const ok = await table.createRoom(stateRef.current);
    if (ok) {
      setRoom(null);
      setStarted(true);
    }
    return ok;
  }, [table]);

  const joinRoom = useCallback(async (code: string) => {
    const ok = await table.joinRoom(code);
    if (ok) {
      setRoom(null);
      setStarted(true);
      setSelected([]);
    }
    return ok;
  }, [table]);

  const chosen = useMemo(
    () => selected.map((id) => state.o.find((o) => o.id === id)).filter((o): o is GameObject => !!o && !lockedOut(o, state, table.me.id, present)),
    [selected, state, table.me.id, present],
  );
  /** 点位游标：跟着当前选中的那一枚走，换一枚就从头数 */
  const [ptCursor, setPtCursor] = useState(0);
  /**
   * 行棋点位：只选中一枚、且这盘挂得出规矩时才算得出来。
   * 渲染层点亮的圈、选中栏那行字、长按菜单与键盘 N/M 转的游标，用的都是这一份——
   * 点位本身就是格心，所以亮在哪一格，走过去（点、拖、回车）都落在同一格、吃的是同一枚。
   */
  const pointCtl = useMemo<PointCtl | null>(() => {
    const one = chosen.length === 1 ? chosen[0] : null;
    if (!one || !governed(state, one)) return null;
    const list = pointsOf(state, one);
    const cur = Math.min(ptCursor, Math.max(0, list.length - 1));
    return {
      id: one.id,
      list,
      cursor: cur,
      cycle: (step: number) => setPtCursor(() => (list.length ? (((cur + step) % list.length) + list.length) % list.length : 0)),
      place: (pt: MovePoint) => {
        setPtCursor(0);
        dispatch(placeAction(stateRef.current, one, pt));
      },
    };
  }, [chosen, state, dispatch, ptCursor]);
  /** 换了一枚子就退回第一处落点：接着上一枚的序号往下数没有意义 */
  useEffect(() => setPtCursor(0), [pointCtl?.id]);
  const pointRef = useRef<PointCtl | null>(null);
  pointRef.current = pointCtl;
  useEffect(() => {
    if (pointCtl?.list.length) tableRef.current?.setPoints(pointCtl.id, pointCtl.list, pointCtl.cursor);
    else tableRef.current?.clearPoints();
  }, [pointCtl]);
  /**
   * 象棋裁判：局面每变一次判一次，王脚下的红环、牌栏上那句横幅、选中栏的应将指引都从这一份里拿。
   * 判一次就把结果递给 checkedKing，别为了要坐标再判第二遍。
   */
  const judgement = useMemo(() => judge(state), [state]);
  const checkHint = useMemo(() => {
    if (!judgement) return null;
    const names = RULE_CAMP_NAMES.xiangqi;
    if (judgement.over) {
      const { camp, how } = judgement.over;
      return `${names[camp]}已被${how === "绝杀" ? "将死" : "困死（逼和）"}，${names[camp === 0 ? 1 : 0]}胜`;
    }
    if (judgement.camp < 0) return null;
    const savers = judgement.savers.flatMap((id) => state.o.find((o) => o.id === id)?.label ?? []);
    return `${names[judgement.camp]}被将军：还有 ${judgement.cells.length} 处可解${savers.length ? `（能将：${savers.join("、")}）` : ""}`;
  }, [judgement, state.o]);
  useEffect(() => {
    tableRef.current?.setChecked(checkedKing(state, judgement));
  }, [state, judgement]);
  const dieCount = useMemo(() => state.o.filter((o) => o.kind === "die").length, [state.o]);
  const cardTarget = useMemo(
    // 卡牌管理整块面板都是改卡面改卡背，游戏模式一开就等于把它收了：开着的面板也当场合上
    () => (cardMgr && !table.gaming
      ? state.o.find((o) => o.id === cardMgr && (CONTAINER_KINDS.includes(o.kind) || o.kind === "card") && !faceHidden(o, state, table.me.id, present)) ?? null
      : null),
    [cardMgr, state, table.gaming, table.me.id, present],
  );
  /** 全量列表精确取出：只看收纳容器，别人隐私区里的不算 */
  const pullTarget = useMemo(
    () => (pull
      ? state.o.find((o) => o.id === pull && CONTAINER_KINDS.includes(o.kind) && !faceHidden(o, state, table.me.id, present)) ?? null
      : null),
    [pull, state, table.me.id, present],
  );
  /** 长按细看的那张牌：手被别人锁住或牌面保密时不弹，看到的就是自己本来能看到的 */
  const inspectCard = useMemo(() => {
    if (!inspect) return null;
    const o = state.o.find((x) => x.id === inspect);
    if (!o || lockedOut(o, state, table.me.id, present) || faceHidden(o, state, table.me.id, present)) return null;
    // 单张牌和「顶上还有牌」的容器都能细看，空白牌堆没什么可看
    if (!o.card && !(o.pile?.length ?? 0)) return null;
    return o;
  }, [inspect, state, table.me.id, present]);

  /** 放大观看的那块屏：物件被删掉、锁住或撤了才收；片子换没换由面板自己盯着那份走带参数 */
  const watchPad = useMemo(() => {
    if (!watch) return null;
    const o = state.o.find((x) => x.id === watch);
    if (!o || o.kind !== "tablet" || lockedOut(o, state, table.me.id, present)) return null;
    return o;
  }, [watch, state, table.me.id, present]);

  /** 窄屏竖屏：顶栏拆两行，第二行那条 minidock 横向滑动装下全部工具 */
  const dockRows = narrow && !short;
  /** 手机上这条 dock 只留图标：字太挤，一屏放不下几颗键 */
  const dk = dockRows ? "icon-xs" : "xs";

  const logoGroup = (
    <div className="panel pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1 sm:gap-2 sm:px-2.5 sm:py-1.5">
      <Gamepad2 className="hidden size-4 shrink-0 text-primary lg:block" />
      <input
        aria-label="牌桌名称"
        className="w-16 min-w-0 bg-transparent font-serif text-xs outline-none focus:w-24 sm:w-28 sm:text-sm sm:focus:w-40 lg:w-40"
        value={nameDraft ?? state.name}
        maxLength={24}
        readOnly={table.gaming}
        title={table.gaming ? GAME_SHUT_HINT : "这块桌子的名字"}
        onChange={(e) => setNameDraft(e.target.value)}
        onBlur={() => {
          if (nameDraft !== null && nameDraft.trim() !== state.name) dispatch({ t: "rename", name: nameDraft });
          setNameDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className={cn("flex shrink-0 items-center gap-1 text-[11px]", table.mode === "online" ? "text-emerald-300" : "text-muted-foreground")}>
        {table.mode === "online" ? <><Wifi className="size-3" />{table.code}</> : <><Hand className="size-3" />本地</>}
      </span>
    </div>
  );

  /**
   * 两个视角手势开关：收进工具条时在里面，折成小按钮以后照样留在外面——
   * 它们决定「这一下拖的是画面还是镜头」，藏起来等于让人摸黑摆牌。
   * 互斥：转视角只有一个人当，开一个就把另一个弹回关，两个都关是纯平移 + 只缩放。
   */
  const toggleGesture = (key: "orbit" | "pinchRotate") =>
    setPrefs((p) => {
      const on = !p[key];
      return { ...p, orbit: on ? key === "orbit" : false, pinchRotate: on ? key === "pinchRotate" : false };
    });
  const gestureToggles = (
    <>
      <Button
        size={dk}
        variant={prefs.orbit ? "secondary" : "ghost"}
        className="shrink-0 gap-1"
        title={
          prefs.orbit
            ? "视角旋转已开启：在空白处拖动就是转视角，再点一下切回平移（两个都关时就是挪画面）"
            : "点这里开启视角旋转：之后在空白处拖动就是转视角（现在是平移画面）。开了这颗，旁边那颗「双指转」会自动关掉——转视角只由一颗开关负责"
        }
        onClick={() => toggleGesture("orbit")}
      >
        <Orbit className="size-3.5" />
        <span className="hidden xl:inline">{prefs.orbit ? "转视角" : "平移"}</span>
      </Button>
      <Button
        size={dk}
        variant={prefs.pinchRotate ? "secondary" : "ghost"}
        className="shrink-0 gap-1"
        title={
          prefs.pinchRotate
            ? "双指转视角已开启（最初的手感）：捏合缩放、两指同时拖动转视角；再点一下收回到只缩放"
            : "点这里恢复最初的手感：两指同时拖动转视角，捏合照旧缩放。开了这颗，旁边那颗「转视角」会自动关掉——转视角只由一颗开关负责，两指那一下也不会顺手把桌子甩歪"
        }
        onClick={() => toggleGesture("pinchRotate")}
      >
        <Rotate3D className="size-3.5" />
        <span className="hidden xl:inline">{prefs.pinchRotate ? "双指转" : "只缩放"}</span>
      </Button>
    </>
  );

  const toolDock = (
    <div
      className={cn(
        "panel scrollbar-thin pointer-events-auto flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-xl px-1 py-1",
        dockRows ? "w-full shrink-0" : "shrink",
      )}
      aria-label={dockRows ? "顶部工具条（左右滑动看全）" : "顶部工具条"}
      title="左右滑动可以看完每一条工具"
    >
      <Button size={dk} variant="ghost" className="shrink-0 gap-1" title="把这条工具条收成一颗小按钮：竖屏能多让出一整行桌面" onClick={() => setPrefs((p) => ({ ...p, dock: false }))}>
        <ChevronUp className="size-3.5" />
        <span className="hidden xl:inline">收起工具条</span>
      </Button>
      {dockRows && <span className="shrink-0 px-1 text-[10px] leading-none text-muted-foreground">滑动→</span>}
      {VIEWS.map((v, i) => (
        <Button key={v.id} size={dk} variant="ghost" className="gap-1 shrink-0" title={`${v.label}视角（${i + 1}）`} onClick={() => tableRef.current?.view(v.id)}>
          <Eye className="size-3.5" />
          <span className="hidden xl:inline">{v.label}</span>
        </Button>
      ))}
      {gestureToggles}
      <Button size={dk} variant="ghost" className="shrink-0 gap-1" title="掷全部骰子（R）" onClick={rollEverything} disabled={!dieCount}>
        <Dices className="size-3.5" />
        {dieCount > 0 && <span className="text-[10px] tabular-nums xl:inline">{dieCount}</span>}
      </Button>
      <Button size={dk} variant="ghost" className="shrink-0 gap-1" title="撤销（Ctrl+Z）" onClick={() => table.undo()} disabled={!table.canUndo}>
        <RotateCcw className="size-3.5" />
        <span className="hidden xl:inline">撤销</span>
      </Button>
      {table.mode === "online" && (
        <Button
          size={dk}
          variant={drawer === "manage" ? "secondary" : "ghost"}
          className="shrink-0 gap-1"
          title={table.manage.host ? "房主管理面板：公开私密与逐项权限" : "房间权限：房主开放了我能做什么"}
          onClick={() => setDrawer("manage")}
        >
          <ShieldCheck className="size-3.5" />
          <span className="hidden xl:inline">{table.manage.host ? "管理" : "权限"}</span>
        </Button>
      )}
      {/* 游戏模式进行中要在顶栏留一块牌子：收起那么多按钮以后，人得看得见是谁锁的、从哪退回去 */}
      {table.gaming && (
        <Button
          size={dk}
          variant="secondary"
          className="shrink-0 gap-1 border border-primary/45 text-primary"
          title="游戏模式进行中：改名换色、删除与卡面这些已经收起来。点这里退回编辑"
          onClick={() => setDrawer("manage")}
        >
          <Gamepad2 className="size-3.5" />
          <span className="hidden xl:inline">游戏中</span>
        </Button>
      )}
      <Button size={dk} variant={screen ? "secondary" : "ghost"} className="shrink-0 gap-1" title="画质与灯光亮度" onClick={() => setScreen((v) => !v)}>
        <Sparkles className="size-3.5" />
        <span className="hidden xl:inline">{QUALITY_LABEL[prefs.quality]}</span>
      </Button>
      {!IN_SHELL && (
        <>
          <Button
            size={dk}
            variant={full ? "secondary" : "ghost"}
            className="shrink-0 gap-1"
            title={full ? "退出全屏（也可以按 Esc）" : "网页全屏：把浏览器上下那两条工具条让给牌桌"}
            onClick={() => (full ? leaveFull() : void goFull(false))}
          >
            {full ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
            <span className="hidden xl:inline">{full ? "退出全屏" : "全屏"}</span>
          </Button>
          <Button
            size={dk}
            variant="ghost"
            className="shrink-0 gap-1"
            title="全屏并锁成横屏：横过来能多出一整截摆牌的地方"
            onClick={() => void goFull(true)}
          >
            <MonitorSmartphone className="size-3.5" />
            <span className="hidden xl:inline">横屏全屏</span>
          </Button>
        </>
      )}
      <Button size={dk} variant="ghost" className="shrink-0" title="操作说明" onClick={() => setHelp(true)}>
        <Keyboard className="size-3.5" />
      </Button>
    </div>
  );

  /**
   * 工具条收起来之后就剩这一条：一颗点开整条的小按钮，外加那两个视角手势开关。
   * 顶栏本身是 pointer-events-none（空白处要能穿透到 3D 场景），所以这一条自己带上
   * pointer-events-auto——上一次「收起来就打不开」就是漏了它，按钮整条按不动。
   */
  const dockChip = (
    <div className="panel pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-xl px-1 py-1" aria-label="顶部工具条（已收起）">
      <Button
        size={dk}
        variant="ghost"
        className="shrink-0 gap-1"
        title={`展开顶部工具条：三个视角、掷骰、撤销、权限、画质${IN_SHELL ? "" : "、全屏"}、说明都在这一条里`}
        onClick={() => setPrefs((p) => ({ ...p, dock: true }))}
      >
        <SlidersHorizontal className="size-3.5" />
        <span className="hidden xl:inline">工具</span>
      </Button>
      {gestureToggles}
    </div>
  );

  const rightGroup = (
    <>
      {table.mode === "online" && (
        <span
          className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-white/70"
          title={table.link() === "realtime" ? "实时通道：本机到房间的往返延迟" : "实时通道没连上，暂时走轮询"}
        >
          <span className="hidden lg:inline">{table.link() === "realtime" ? "实时" : "轮询"} </span>
          {table.lag == null ? "—" : `${table.lag}ms`}
        </span>
      )}
      <Button size="xs" variant="ghost" className="relative shrink-0 gap-1" title="打开聊天" onClick={openChat}>
        <MessageSquare className="size-3.5" />
        <span className="hidden lg:inline">聊天</span>
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 min-w-3.5 rounded-full bg-primary px-0.5 text-center text-[9px] leading-4 text-primary-foreground tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      <Button size="xs" variant={panels.left ? "secondary" : "outline"} className="gap-1" onClick={() => togglePanel("left")}>
        <Layers className="size-3.5" />
        <span className="hidden lg:inline">组件</span>
      </Button>
      <Button size="xs" variant={panels.right ? "secondary" : "outline"} className="gap-1" onClick={() => togglePanel("right")}>
        <Users className="size-3.5" />
        <span className="hidden lg:inline">房间</span>
        {table.mode === "online" && <span className="rounded bg-primary/25 px-1 text-[10px] text-primary">{table.peers}</span>}
      </Button>
    </>
  );

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
      onContextMenu={COARSE_POINTER ? (e) => e.preventDefault() : undefined}
    >
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_38%,rgba(0,0,0,.55)_100%)]" />

      <header ref={headerRef} className={cn("pointer-events-none absolute inset-x-0 top-0 z-20 flex gap-1 p-1 pt-[max(0.25rem,env(safe-area-inset-top))] sm:gap-1.5 sm:p-1.5 sm:px-3 sm:pb-3 sm:pt-[max(0.75rem,env(safe-area-inset-top))]", dockRows ? "flex-col" : "flex-nowrap items-center")}>
        <div className={cn("flex min-w-0 items-center gap-1 sm:gap-1.5", dockRows ? "w-full" : "flex-1")}>
          {logoGroup}
          {!dockRows && (prefs.dock ? toolDock : dockChip)}
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1">
            {dockRows && !prefs.dock && dockChip}
            {rightGroup}
          </div>
        </div>
        {dockRows && prefs.dock && toolDock}
      </header>

      <aside
        className={cn(
          "absolute left-0 z-20 transition-transform duration-200",
          // 手机上这块抽屉薄一点：牌桌才是主角，组件库只是路过按两下
          narrow ? "w-[14.5rem] max-w-[70vw] p-1" : "w-[19rem] max-w-[80vw] p-3",
          !panels.left && "-translate-x-[110%]",
        )}
        style={{ top: "var(--header-h)", bottom: "var(--strip-h)" }}
      >
        <div className="h-full min-h-0 overflow-hidden pe-1">
          <Palette color={brush} setColor={setBrush} me={table.me} onAction={dispatch} onStarter={applyStarter} onNotify={notify} compact={short} gaming={table.gaming} />
        </div>
      </aside>

      <aside
        className={cn(
          "z-20 transition-transform duration-200",
          narrow ? "fixed inset-x-0 bottom-0 z-30 px-1" : "absolute right-0 w-[19rem] max-w-[80vw] p-1.5 sm:w-[20rem] sm:p-3",
          !panels.right && (narrow ? "translate-y-[140%]" : "translate-x-[110%]"),
        )}
        style={narrow
          // 顶到键盘上方，高度按可见视口算：抽屉别钻到键盘底下，也不和顶栏、手牌条抢同一条竖边
          // 一次只露出一块，所以竖屏压到薄薄一条、横屏反而能开高
          ? { bottom: "calc(var(--kb-h) + max(0.25rem, env(safe-area-inset-bottom)))", height: `min(${short ? "72" : "44"}dvh, calc(var(--vp-h) - var(--header-h) - 0.5rem))` }
          : { top: "var(--header-h)", bottom: "var(--strip-h)" }}
        inert={!panels.right}
      >
        <div className={cn("flex h-full min-h-0 flex-col", narrow && "panel gap-1 rounded-t-xl pt-1")}>
          {narrow && <span className="mx-auto h-1 w-10 shrink-0 rounded-full bg-white/25" aria-hidden />}
          <div className={cn("min-h-0", narrow ? "flex-1 px-0.5" : "h-full ps-1")}>
            <TablePanel
              onClose={narrow ? () => setPanels((p) => ({ ...p, right: false })) : undefined}
              state={state}
              onAction={dispatch}
              mode={table.mode}
              code={table.code}
              status={table.status}
              presence={table.presence}
              busy={table.busy}
              peers={table.peers}
              onLeave={table.leaveRoom}
              chatGoto={chatGoto}
              onChatSeen={markChatSeen}
              archive={table.archive}
              manage={table.manage}
              gaming={table.gaming}
              nick={table.me.name}
              onNick={table.setName}
              fp={table.who.fp}
              onOpenArchives={() => setDrawer("roms")}
              onOpenLobby={() => setDrawer("lobby")}
              onOpenManage={() => setDrawer("manage")}
              onOpenCache={() => setDrawer("cache")}
            />
          </div>
        </div>
      </aside>

      {screen && (
        <div
          className="panel pointer-events-auto absolute left-1/2 z-30 w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl px-3 py-2.5 shadow-xl"
          style={{ top: "calc(var(--header-h) + 0.375rem)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="panel-title">画面</p>
            <Button size="icon-xs" variant="ghost" aria-label="关闭画面设置" onClick={() => setScreen(false)}><X className="size-3.5" /></Button>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="panel-title w-8 shrink-0">画质</span>
            {QUALITY_LEVELS.map((q) => (
              <Button
                key={q}
                size="xs"
                variant={prefs.quality === q ? "secondary" : "outline"}
                className="flex-1"
                title={QUALITY_HINT[q]}
                onClick={() => setPrefs((p) => ({ ...p, quality: q }))}
              >
                {QUALITY_LABEL[q]}
              </Button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1.5">
            <span className="panel-title w-8 shrink-0">灯光</span>
            <Sun className="size-3 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={BRIGHT_MIN}
              max={BRIGHT_MAX}
              step={0.02}
              value={prefs.bright}
              onChange={(e) => setPrefs((p) => ({ ...p, bright: Number(e.target.value) }))}
              className="flex-1 accent-primary"
              aria-label="灯光亮度"
            />
            <span className="w-10 shrink-0 text-end font-mono text-[10px] text-muted-foreground">{Math.round(prefs.bright * 100)}%</span>
          </label>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            嫌吊灯刺眼就往左拖，最暗 {Math.round(BRIGHT_MIN * 100)}%，想亮堂就往右。{QUALITY_HINT[prefs.quality]}。亮度只在这台浏览器上生效，不会传给同桌的人。
          </p>
          <Button size="xs" variant="ghost" className="mt-1 text-muted-foreground" onClick={() => setPrefs((p) => ({ ...p, bright: BRIGHT_DEFAULT }))}>
            回到默认亮度
          </Button>
        </div>
      )}

      {alarm.length > 0 && (
        <div
          className="panel pointer-events-auto absolute left-1/2 z-30 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-xl border-primary/50 px-2.5 py-2 text-xs shadow-xl"
          style={{ top: "calc(var(--header-h) + 0.375rem)" }}
          role="alert"
        >
          <BellRing className="size-4 shrink-0 animate-pulse text-primary" />
          <span className="min-w-0 break-words">{alarmText(state.o, alarm)}</span>
          <Button size="xs" className="shrink-0" onClick={() => { silenceAllAlarms(stateRef.current.o); setAlarm([]); }}>停止响铃</Button>
          <Button
            size="xs"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              // 沙漏没有暂停：让它停下只能把沙子翻回去
              for (const o of ringing(stateRef.current.o)) dispatch(o.kind === "hour" ? hourFlipAction(o) : timerPauseAction(o));
            }}
          >
            {alarm.length > 0 && alarm.every((id) => state.o.find((o) => o.id === id)?.kind === "hour") ? "按回沙漏" : "暂停计时"}
          </Button>
        </div>
      )}

      <ChatIsland
        chat={chats}
        mine={ownChat}
        onOpen={openChat}
        top={alarm.length ? "calc(var(--header-h) + 3.4rem)" : "calc(var(--header-h) + 0.375rem)"}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:p-1.5 sm:px-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div ref={stripRef} className={cn("scrollbar-thin pointer-events-auto flex w-full max-w-full flex-col items-center gap-1 overflow-y-auto overscroll-contain sm:gap-1.5", short ? "max-h-[50dvh]" : "max-h-[36dvh]")}>
          {toast && <div className="panel shrink-0 rounded-lg px-3 py-1.5 text-xs text-foreground/90">{toast.text}</div>}
          {/* 被将军就一直说在哪：几家能解、哪几枚子动得了，绝杀与逼和也报在这同一条上 */}
          {checkHint && (
            <div className="panel shrink-0 rounded-lg border border-destructive/60 px-3 py-1 text-[11px] font-medium text-foreground" style={{ background: "color-mix(in oklab, var(--destructive) 22%, transparent)" }}>
              {checkHint}
            </div>
          )}
          {/* 桌上的牌正被拖到这条牌栏上：明说一句「松手就收进手里」，比只亮一圈边框好懂 */}
          {dragHand && (
            <div className="panel shrink-0 rounded-lg border border-primary/60 px-3 py-1 text-[11px] font-medium text-primary-foreground" style={{ background: "color-mix(in oklab, var(--primary) 22%, transparent)" }}>
              松手：把牌收进手里
            </div>
          )}
          <div ref={handRef} className="flex w-full max-w-full shrink-0 justify-center">
            <HandBar
              state={state}
              me={table.me}
              selected={selected}
              onSelect={setSelected}
              onAction={dispatch}
              onInspect={(id) => handlers.current.onInspect(id)}
              probeDrop={probeDrop}
              endDrop={endHandDrop}
              toHandHint={dragHand}
            />
          </div>
          {/* 资源没到齐就一直说着一句「还欠几张」：选了东西、展开了提示条都照样看得见 */}
          <ResourcePill pix={pix} onReload={reloadPix} />
          {chosen.length > 0 ? (
            <SelectionBar state={state} selected={selected} color={brush} setColor={setBrush} me={table.me} present={present} onAction={dispatch} onRoll={doRoll} onManage={(id) => setCardMgr(id)} onPullList={(id) => setPull(id)} onAskTrack={table.askTrack} onWatch={(id) => setWatch(id)} touch={touch} onTouch={setTouch} adjust={adjust} pointCtl={pointCtl} drawPick={drawPick} onDrawPick={setDrawPick} narrow={narrow} short={short} gaming={table.gaming} />
          ) : prefs.hint ? (
            <div className="panel pointer-events-auto flex shrink-0 flex-wrap items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] text-muted-foreground sm:px-2.5 sm:py-2">
              <Button size="icon-xs" variant="ghost" aria-label="收起提示条" title="收起成一小条，不挡桌面" className="shrink-0 text-muted-foreground" onClick={() => setPrefs((p) => ({ ...p, hint: false }))}>
                <ChevronDown className="size-3.5" />
              </Button>
              <span className="me-1 hidden sm:inline">左键拖动摆放 · {prefs.orbit ? "空白处拖动即转视角" : "中键或 Alt+左键转视角"} · 右键菜单 · 空白处长按再拖即框选</span>
              <span className="me-1 sm:hidden">拖动物件摆放 · {prefs.pinchRotate ? "双指捏合缩放、两指同时拖动转视角" : "双指捏合只缩放"} · {prefs.orbit ? "空白处拖动即转视角" : "顶栏「转视角」点了才转"} · 长按半秒再拖即框选</span>
              <Button size="xs" variant="outline" className="shrink-0 gap-1" title="把现在这张桌子存成本机预设，随时摆回来" onClick={() => setDrawer("presets")}>
                <Layers className="size-3.5" />桌面预设
              </Button>
              {table.mode === "local" ? (
                <>
                  <Button size="xs" variant="outline" className="gap-1" onClick={() => setRoom("create")}>
                    <Wifi className="size-3.5" />创建联网房间
                  </Button>
                  <Button size="xs" variant="outline" className="gap-1" onClick={() => setRoom("join")}>
                    <LogIn className="size-3.5" />加入房间
                  </Button>
                  <Button size="xs" variant="outline" className="gap-1" title="不记得房间码就去大厅挑一桌公开牌桌" onClick={() => setDrawer("lobby")}>
                    <Users className="size-3.5" />大厅
                  </Button>
                </>
              ) : (
                <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-emerald-200">
                  房间 {table.code} · {table.peers} 人在线
                </span>
              )}
            </div>
          ) : (
            /* 收成一小条：留得住「在不在房间里」和联机入口，但几乎不占桌面 */
            <div className="panel pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-full px-1 py-0.5 text-[10px] text-muted-foreground">
              <Button size="icon-xs" variant="ghost" aria-label="展开提示条" title="展开操作提示与联机入口" className="shrink-0 text-muted-foreground" onClick={() => setPrefs((p) => ({ ...p, hint: true }))}>
                <ChevronUp className="size-3.5" />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label="桌面预设" title="把这张桌子存成预设 / 载入预设" className="shrink-0 text-muted-foreground" onClick={() => setDrawer("presets")}>
                <Layers className="size-3.5" />
              </Button>
              {table.mode === "local" ? (
                <>
                  <Button size="icon-xs" variant="ghost" aria-label="加入房间" title="加入房间" className="shrink-0 text-muted-foreground" onClick={() => setRoom("join")}>
                    <LogIn className="size-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="总站大厅" title="看公开牌桌" className="shrink-0 text-muted-foreground" onClick={() => setDrawer("lobby")}>
                    <Users className="size-3.5" />
                  </Button>
                  <span className="pe-1">本地桌面</span>
                </>
              ) : (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-px text-emerald-200">
                  {table.code} · {table.peers} 人
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {cardTarget && (
        <CardPanel
          key={cardTarget.id}
          state={state}
          target={cardTarget}
          me={table.me}
          onAction={dispatch}
          onNotify={notify}
          onClose={() => setCardMgr(null)}
        />
      )}

      {pullTarget && (
        <PullList
          key={pullTarget.id}
          state={state}
          target={pullTarget}
          me={table.me}
          drawPick={drawPick}
          onAction={dispatch}
          onClose={() => setPull(null)}
        />
      )}

      {inspectCard && (
        <CardPeek
          o={inspectCard}
          color={inspectCard.color ?? "#c8443c"}
          onClose={() => setInspect(null)}
        />
      )}

      {watchPad && (
        <TabletPanel o={watchPad} onClose={() => setWatch(null)} />
      )}

      {menu && (
        <ContextMenu
          at={menu}
          all={state.o}
          players={state.players}
          chosen={chosen}
          pointCtl={pointCtl}
          drawPick={drawPick}
          me={table.me}
          present={present}
          gaming={table.gaming}
          onAction={dispatch}
          onRoll={doRoll}
          onManage={(id) => setCardMgr(id)}
          onPullList={(id) => setPull(id)}
          onAskTrack={table.askTrack}
          onWatch={(id) => { setWatch(id); setMenu(null); }}
          touch={touch}
          onTouch={(id) => { setTouch(id); setMenu(null); }}
          onInspect={(id) => setInspect(id)}
          onFocus={(id) => tableRef.current?.focus(id)}
          onClose={() => setMenu(null)}
        />
      )}

      {help && <HelpSheet onClose={() => setHelp(false)} />}
      {room && (
        <RoomDialog
          mode={room}
          nick={table.me.name}
          onNick={table.setName}
          busy={table.busy}
          onClose={() => setRoom(null)}
          onCreate={createRoom}
          onJoin={joinRoom}
          onLobby={() => {
            setRoom(null);
            setDrawer("lobby");
          }}
        />
      )}
      {!started && (
        <StartScreen
          nick={table.me.name}
          onNick={table.setName}
          onEmpty={() => applyStarter("empty")}
          onCreate={() => setRoom("create")}
          onJoin={() => setRoom("join")}
          onLobby={() => setDrawer("lobby")}
          recent={recent.map((t) => ({ code: t.room ?? "", name: t.name, version: t.version, at: t.at })).filter((t) => t.code)}
          onRecent={(code) => void joinRoom(code)}
        />
      )}

      {drawer === "roms" && <ArchiveSheet archive={table.archive} onClose={() => setDrawer(null)} />}
      {drawer === "manage" && (
        <ManageSheet
          manage={table.manage}
          presence={table.presence}
          me={table.me}
          code={table.code}
          listed={table.archive.listed}
          localGame={prefs.game}
          onLocalGame={(v) => setPrefs((p) => ({ ...p, game: v }))}
          onClose={() => setDrawer(null)}
          onOpenLobby={() => setDrawer("lobby")}
          onOpenArchives={() => setDrawer("roms")}
          onLeave={table.leaveRoom}
        />
      )}
      {drawer === "lobby" && (
        <LobbySheet
          archive={table.archive}
          online={table.online}
          mode={table.mode}
          code={table.code}
          onRefresh={table.refreshOnline}
          onClose={() => setDrawer(null)}
          onLeave={() => {
            table.leaveRoom();
            setDrawer(null);
          }}
          onJoin={async (code) => {
            const ok = await joinRoom(code);
            if (ok) setDrawer(null);
            return ok;
          }}
        />
      )}
      {drawer === "cache" && <CacheSheet onClose={() => setDrawer(null)} onOpen={openCached} />}
      {drawer === "presets" && (
        <PresetSheet
          state={state}
          online={table.mode === "online"}
          host={table.manage.host}
          gaming={table.gaming}
          onClose={() => setDrawer(null)}
          onLoad={loadPreset}
        />
      )}
    </div>
  );
}

/** 响铃横幅上那行字：把归零的计时器名字念出来 */
function alarmText(all: GameObject[], ids: string[]): string {
  const hit = ids.map((id) => all.find((o) => o.id === id));
  // 沙漏漏完和计时器归零是两回事：说错了话，人就去找那个根本不存在的暂停键
  const onlyHour = hit.length > 0 && hit.every((o) => o?.kind === "hour");
  return `${onlyHour ? "沙漏漏完了" : "计时器归零"}：${hit.map((o) => o?.label || (o?.kind === "hour" ? "沙漏" : "计时器")).join("、")}`;
}

/**
 * 底部小白条兼任资源进度：桌面上还欠几张自传图就说几张，一条细进度加一个重载按钮。
 * 到齐之后整条消失——本地牌桌、以及图全在手上的时候，它一个字都不占。
 */
function ResourcePill({ pix, onReload }: { pix: ImageProgress; onReload: () => void }) {
  if (pix.total === 0 || pix.ready >= pix.total) return null;
  const pct = Math.round((pix.ready / pix.total) * 100);
  return (
    <span className="panel pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px]">
      <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-white/15" aria-hidden>
        <span className="block h-full rounded-full bg-sky-300/80 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </span>
      <span
        className="shrink-0 text-sky-200"
        title={`这张桌子要用 ${pix.total} 张自上传资源，已到手 ${pix.ready} 张${pix.failed ? `，另有 ${pix.failed} 张暂时问不到：按重载资源再问一遍本机、服务器与同桌` : ""}`}
      >
        资源 {pix.ready}/{pix.total}
        {pix.pending > 0 && " 加载中"}
        {pix.failed > 0 && ` · ${pix.failed} 张缺`}
      </span>
      <Button size="icon-xs" variant="ghost" aria-label="重载资源" title="重载资源：重问本机缓存、服务器与同桌" className="shrink-0 text-muted-foreground" onClick={onReload}>
        <RotateCcw className="size-3" />
      </Button>
    </span>
  );
}

function kindLabel(kind: string): string {
  if (kind === "cards") return "扑克 54 张";
  if (kind === "werewolf") return "狼人杀";
  if (kind === "tide") return "潮汐";
  if (kind === "rpg") return "跑团战棋";
  if (kind === "monopoly") return "环形竞速";
  if (kind === "empty") return "空桌面";
  return BOARDS.find((b) => b.id === kind)?.name ?? "新棋盘";
}

interface MenuProps {
  at: { x: number; y: number; id: string | null };
  all: GameObject[];
  /** 摸牌的弹出方向按座位算，所以菜单也要能看到有谁 */
  players: { id: string }[];
  chosen: GameObject[];
  /** 行棋点位：窄屏那条选中栏收起来了，长按菜单得留一条同样的落子路 */
  pointCtl: PointCtl | null;
  /** 摸牌落点：菜单那一行的说法要和选中栏挑中的那一格一致 */
  drawPick: DrawPick;
  me: { id: string; name: string; color: string };
  /** 在线客户端：主人不在区的隐私区不再保密，菜单才敢给出卡牌管理入口 */
  present?: Set<string>;
  /** 游戏中：这一桌把「摆桌子」那一套收起来了，菜单里就不留点了会被退回的那几行 */
  gaming: boolean;
  onAction: (a: Action | null, opts?: { retry?: boolean }) => void;
  onRoll: (ids: string[], spread?: number) => void;
  onManage: (id: string) => void;
  onPullList: (id: string) => void;
  /** 随身听那首歌的字节只在同学机器之间递，所以要能点名朝某一台张口 */
  onAskTrack: (to: string, key: string) => void;
  /** 长按菜单里也要能把平板的屏放大到桌面上来看 */
  onWatch: (id: string) => void;
  /** 上手摸屏：null 就是指针还给桌子 */
  touch: string | null;
  onTouch: (id: string | null) => void;
  onInspect: (id: string) => void;
  onFocus: (id: string) => void;
  onClose: () => void;
}

/** 长按菜单里的一行：`tone` 为 danger 的行归到最下面「危险」那一档 */
type MenuRow = { label: string; run: () => void; tone?: "danger" };

function ContextMenu({ at, all, players, chosen, pointCtl, drawPick, me, present, gaming, onAction, onRoll, onManage, onPullList, onAskTrack, onWatch, touch, onTouch, onInspect, onFocus, onClose }: MenuProps) {
  if (!at.id) return null;
  const ids = chosen.map((o) => o.id);
  const one = chosen.length === 1 ? chosen[0] : null;
  const ctx = { o: all, players };
  const names = one ? displayName(one) : `这 ${chosen.length} 件`;
  // 收拢目标：选中的那一叠优先；桌面上只有一叠时才代劳，否则不该把牌塞进随便挑的牌堆
  const onlyPile = all.filter((o) => CONTAINER_KINDS.includes(o.kind));
  const container = chosen.find((o) => CONTAINER_KINDS.includes(o.kind)) ?? (onlyPile.length === 1 ? onlyPile[0] : null);
  const cards = chosen.filter((o) => o.card);
  const inHand = chosen.some((o) => o.hand);
  /** 这一份筛选与选中栏那条 dock 同源：别人锁着的、棋盘与手牌都不给位姿行，归约器收得下才摆按钮 */
  const reachable = (o: GameObject) => !lockedOut(o, ctx, me.id, present);
  const scalable = chosen.filter((o) => !o.hand && o.kind !== "board" && reachable(o)).map((o) => o.id);
  /** 别人区域里的牌：菜单里也不能出现任何会暴露牌面的入口 */
  const hidden = !!one && one.kind !== "zone" && faceHidden(one, { o: all }, me.id, present);
  const myZone = one?.kind === "zone" && one.owner === me.id ? one : null;
  const loose = chosen.filter((o) => o.kind === "card" && o.card && !o.hand && !faceHidden(o, { o: all }, me.id, present)).map((o) => o.id);
  const tilted = chosen.filter((o) => !o.hand && o.kind !== "board" && reachable(o) && (((o.rot % 360) + 360) % 360 !== 0 || !!o.tilt)).map((o) => o.id);
  /** 层数与高度：贴面的区域垫、统计垫、卡槽带、计分轨本来钉在桌面上，棋盘也不算，给了就是颗按不动的按钮 */
  const liftable = chosen.filter((o) => pinnable(o) && reachable(o)).map((o) => o.id);

  /** 三段：这一件（这一种物件自己的动作）/ 摆放（通用位姿）/ 危险（会少掉东西） */
  const rows: MenuRow[] = [];
  const place: MenuRow[] = [];
  const risk: MenuRow[] = [];
  if (one?.kind === "die") rows.push({ label: `原地掷 d${one.sides ?? 6}`, run: () => onRoll(ids, 0) });

  if (one?.kind === "die") rows.push({ label: "甩开掷", run: () => onRoll(ids, 1) });
  // 行棋点位：窄屏那条选中栏是收起来的，长按菜单这一份就是手机上的落子入口。
  // 转的游标和盘上亮着的圈是同一个，所以菜单里数的「第 3 处」就是最大的那一圈。
  const step = pointCtl && one && pointCtl.id === one.id && pointCtl.list.length ? pointCtl : null;
  if (step) {
    const cur = step.list[step.cursor];
    rows.push({ label: `换一处落点（第 ${step.cursor + 1} / ${step.list.length} 处）`, run: () => step.cycle(1) });
    rows.push({ label: cur.take ? "落这一格（吃掉它）" : "落这一格", run: () => { step.place(cur); onClose(); } });
  }
  // 容器这一套与选中栏展开的「卡牌」段同源同词：窄屏收起的那一片，长按该补得回来
  if (one && CONTAINER_KINDS.includes(one.kind)) {
    const src = one;
    const n = src.pile?.length ?? 0;
    rows.push({ label: `${src.kind === "bag" ? "盲摸" : "摸"} 1 张 → ${drawLandingText(ctx, me.id, drawPick)}`, run: () => onAction(drawIntoAction(ctx, src.id, 1, me.id, drawPick, src.kind === "bag")) });
    if (n) {
      if (src.kind === "pile") rows.push({ label: "洗牌", run: () => onAction(shuffleAction(all, src.id)) });
      rows.push({ label: "摊到桌面（1 张）", run: () => onAction(src.kind === "bag" ? grabAction(ctx, src.id, 1) : drawAction(ctx, src.id, 1)) });
      if (src.kind === "pile" && n >= 2) rows.push({ label: `切牌（顶上 ${Math.ceil(n / 2)} 张整叠扣到底下）`, run: () => onAction(cutAction(all, src.id)) });
      if (src.kind === "pile") {
        for (const parts of splitParts(n, players.length)) rows.push({ label: `均分 ${parts} 叠`, run: () => onAction(evenSplitAction(all, src.id, parts)) });
      }
      rows.push({ label: `按座位发牌（每人 3 张，共 ${Math.max(1, Math.min(8, players.length || 2))} 家）`, run: () => onAction(dealAction(all, ctx, src.id, 3)) });
      rows.push({ label: src.faceUp === false ? "顶牌朝上" : "顶牌朝下", run: () => onAction({ t: "turnCards", ids: [src.id], up: src.faceUp === false }) });
    }
    // 桌面上真有散牌才摆这一行，空桌点它什么也不会发生
    const strays = all.filter((o) => o.kind === "card" && o.card && !o.hand && !faceHidden(o, ctx, me.id, present)).length;
    if (strays) rows.push({ label: `收拢全场散牌（${strays} 张）`, run: () => onAction(gatherAction(all, src.id)) });
  }
  if (one && CONTAINER_KINDS.includes(one.kind) && one.pile?.length && !hidden) rows.push({ label: `查看全部（${one.pile.length} 张）`, run: () => onPullList(one.id) });
  if (one && (CONTAINER_KINDS.includes(one.kind) || one.kind === "card") && !hidden && !gaming) rows.push({ label: "卡牌管理", run: () => onManage(one.id) });
  // 整堆倒进别的容器：弃牌堆「翻面倒回牌库」是牌桌上最常做的动作之一
  if (one && CONTAINER_KINDS.includes(one.kind) && one.pile?.length && !hidden) {
    const src = one;
    for (const t of all.filter((x) => x.id !== src.id && CONTAINER_KINDS.includes(x.kind)).slice(0, 3)) {
      const name = t.label || (t.kind === "bag" ? "袋子" : t.kind === "box" ? "卡牌盒" : "牌堆");
      rows.push({ label: `倒进${name}（${src.pile?.length ?? 0} 张）`, run: () => onAction(pourAction(all, src.id, t.id)) });
      rows.push({ label: `翻面倒进${name}`, run: () => onAction(pourAction(all, src.id, t.id, true)) });
    }
  }
  if (myZone) {
    rows.push({ label: myZone.priv ? "关闭隐私模式" : "开启隐私模式", run: () => onAction(zonePrivAction(myZone, !myZone.priv)) });
    rows.push({ label: myZone.pref ? "取消首选落牌区" : "设为首选落牌区", run: () => onAction(zonePrefAction(myZone, !myZone.pref)) });
  }
  if (one?.kind === "zone" && one.zone) {
    const mine = one.owner === me.id;
    const z = one.zone;
    // 尺寸四行与选中栏那两颗步进器同一个口径：已经拉到顶到底就不摆这一行
    if (z.w < ZONE_MAX - 0.001) rows.push({ label: `${names}加宽（现 ${Math.round(z.w * 100)}cm）`, run: () => onAction(zoneResizeAction(one, 0.06, 0)) });
    if (z.w > ZONE_MIN + 0.001) rows.push({ label: `${names}变窄（现 ${Math.round(z.w * 100)}cm）`, run: () => onAction(zoneResizeAction(one, -0.06, 0)) });
    if (z.d < ZONE_MAX - 0.001) rows.push({ label: `${names}加深（现 ${Math.round(z.d * 100)}cm）`, run: () => onAction(zoneResizeAction(one, 0, 0.06)) });
    if (z.d > ZONE_MIN + 0.001) rows.push({ label: `${names}变浅（现 ${Math.round(z.d * 100)}cm）`, run: () => onAction(zoneResizeAction(one, 0, -0.06)) });
    rows.push({ label: "摊齐本区", run: () => onAction(tidyAction(ctx, one)) });
    if (mine) {
      // 拿走这一行归到菜单末尾的「危险」段，与别的物件同一处，不在这里重复摆一颗
      // 座位攻防：攻防范围是座位规则，一块实心垫子不掺和这事；到顶到底也不摆这一行
      if (!z.pad) {
        const reach = z.reach ?? REACH_DEFAULT;
        const guard = z.guard ?? GUARD_MIN;
        if (reach < REACH_MAX) rows.push({ label: `进攻范围加一家（现 ${reach}）`, run: () => onAction(zoneRangeAction(one, "reach", 1)) });
        if (reach > REACH_MIN) rows.push({ label: `进攻范围减一家（现 ${reach}）`, run: () => onAction(zoneRangeAction(one, "reach", -1)) });
        if (guard < GUARD_MAX) rows.push({ label: `防御范围加一家（现 +${guard}）`, run: () => onAction(zoneRangeAction(one, "guard", 1)) });
        if (guard > GUARD_MIN) rows.push({ label: `防御范围减一家（现 +${guard}）`, run: () => onAction(zoneRangeAction(one, "guard", -1)) });
      }
    }
  }
  if (one?.kind === "stat" && one.stat) {
    const s = one.stat;
    if (s.w < STAT_MAX - 0.001) rows.push({ label: `${names}加宽（现 ${Math.round(s.w * 100)}cm）`, run: () => onAction(statResizeAction(one, 0.06, 0)) });
    if (s.w > STAT_MIN + 0.001) rows.push({ label: `${names}变窄（现 ${Math.round(s.w * 100)}cm）`, run: () => onAction(statResizeAction(one, -0.06, 0)) });
    if (s.d < STAT_MAX - 0.001) rows.push({ label: `${names}加深（现 ${Math.round(s.d * 100)}cm）`, run: () => onAction(statResizeAction(one, 0, 0.06)) });
    if (s.d > STAT_MIN + 0.001) rows.push({ label: `${names}变浅（现 ${Math.round(s.d * 100)}cm）`, run: () => onAction(statResizeAction(one, 0, -0.06)) });
  }
  // 迷你计数器：读数、步进与吸附的那条边；归约器收得下才摆这一行，到边界就不摆
  if (one?.kind === "counter" && reachable(one)) {
    const ct = fixCounter(one.counter);
    const down = counterStepAction(one, -1);
    const up = counterStepAction(one, 1);
    if (down) rows.push({ label: `减 ${ct.step}（现 ${ct.v}）`, run: () => onAction(down) });
    if (up) rows.push({ label: `加 ${ct.step}（现 ${ct.v}）`, run: () => onAction(up) });
    if (!gaming) {
      for (const s of COUNTER_STEPS) {
        const a = counterStepSetAction(one, s);
        if (a) rows.push({ label: `步进改成 ${s}（每按一下走这么多）`, run: () => onAction(a) });
      }
    }
    if (ct.host) {
      for (let i = 0; i < 4; i++) {
        const a = counterAttachAction(one, ct.host, i as 0 | 1 | 2 | 3);
        if (a) rows.push({ label: `换到这张牌的${COUNTER_EDGE_NAMES[i]}边（拖到别的牌上抢不走）`, run: () => onAction(a) });
      }
      rows.push({ label: "脱附：从这张牌上取下来，才能拖去别的牌", run: () => onAction(counterAttachAction(one, null)) });
    }
  }
  // 棋盘的三档网格开关在长按菜单里也要有一套：选中栏那一片在窄屏是收起来的
  if (one && gridable(one)) {
    rows.push({ label: one.snap === false ? "开落点吸附" : "关落点吸附（可骑缝摆）", run: () => onAction(snapOnAction(one, one.snap === false)) });
    rows.push({ label: one.grid ? "关掉网格锁定" : "开网格锁定（一手一子）", run: () => onAction(gridLockAction(one, !one.grid)) });
    rows.push({ label: one.mesh === false ? "画出网格线" : "藏起网格线", run: () => onAction(meshAction(one, one.mesh === false)) });
    // 摆回开局只认得出预设的盘才有：认不出的盘不出现这一行，免得点了什么也不发生
    const born = resetAction(one);
    if (born && !gaming) rows.push({ label: "摆回开局（收掉盘上现有子）", run: () => onAction(born) });
  }
  // 垫子与棋盘都能锁：锁上以后谁都点不动，只留角上那颗解锁按钮
  if (one && lockable(one)) {
    const what = one.kind === "board" ? (one.board?.layout === "mat" ? "桌垫" : "棋盘") : "统计垫";
    rows.push({ label: `${one.lock ? "解锁" : "锁定"}${what}`, run: () => onAction(padLockAction(one, !one.lock)) });
  }
  if (one?.kind === "slot") {
    // 加减格数改的是这条卡槽带的规格，游戏模式里收起来；到顶到底那一行直接不摆
    const n = one.slot?.n ?? 3;
    if (!gaming) {
      if (n < SLOT_MAX) rows.push({ label: `卡槽多一格（现 ${n} 格）`, run: () => onAction(slotResizeAction(one, 1)) });
      if (n > SLOT_MIN) rows.push({ label: `卡槽少一格（现 ${n} 格）`, run: () => onAction(slotResizeAction(one, -1)) });
    }
    rows.push({ label: "摊齐卡槽", run: () => onAction(tidyAction(ctx, one)) });
  }
  if (one?.kind === "spinner") {
    const sp = one.spinner;
    const spun = sp?.value === undefined ? "" : `（当前第 ${(sp.value ?? 0) + 1} 格）`;
    rows.push({ label: `拨一下转盘${spun}`, run: () => onAction(spinAction(one)) });
    if (!gaming) {
      if ((sp?.n ?? 0) < SPIN_MAX) rows.push({ label: `转盘多一格（现 ${sp?.n ?? 0} 等分）`, run: () => onAction(spinSetAction(one, 1)) });
      if ((sp?.n ?? 0) > SPIN_MIN) rows.push({ label: `转盘少一格（现 ${sp?.n ?? 0} 等分）`, run: () => onAction(spinSetAction(one, -1)) });
    }
  }
  if (one?.kind === "track") {
    const marks = one.track?.marks ?? [];
    const mine = marks.find((m) => m.by === me.id);
    rows.push({ label: mine ? `${mine.name || "你"} 加一分` : "我上场（放到起点）", run: () => onAction(markAction(one, me.id, mine ? 1 : 0, me.name, me.color)) });
    if (mine) rows.push({ label: "我的棋子退一分", run: () => onAction(markAction(one, me.id, -1)) });
    if (marks.length > 0) rows.push({ label: "计分轨全员归零", run: () => onAction(markClearAction(one)) });
  }
  if (one?.kind === "timer") rows.push({ label: one.endsAt != null ? "暂停计时" : "开始计时", run: () => onAction(one.endsAt != null ? timerPauseAction(one) : timerRunAction(one)) });
  if ((one?.kind === "timer" || one?.kind === "hour") && ringing(all, Date.now()).some((o) => o.id === one.id)) rows.push({ label: "停止响铃", run: () => silenceAlarm(one) });
  if (one?.kind === "timer") rows.push({ label: "重置计时", run: () => onAction(timerResetAction(one)) });
  // 沙漏只有「翻过来漏」「按回去停」两态：长按菜单给同一套，窄屏收起的选中栏才不挡路
  if (one?.kind === "hour") {
    const h = fixHour(one.hour);
    rows.push({ label: h.at === null ? `翻过来漏 ${h.mins} 分钟` : "按回去停住", run: () => onAction(hourFlipAction(one)) });
    if (h.mins < HOUR_MAX) rows.push({ label: `一漏加到 ${h.mins + 1} 分钟`, run: () => onAction(hourSetAction(one, 1)) });
    if (h.mins > 1) rows.push({ label: `一漏减到 ${h.mins - 1} 分钟`, run: () => onAction(hourSetAction(one, -1)) });
  }
  if (one?.kind === "shield") {
    const sd = fixShield(one.shield);
    // 一档 2cm，与选中栏那两颗步进器同一档；顶到底就不摆这一行
    if (sd.w < SHIELD_MAX - 0.001) rows.push({ label: `屏面加宽（现 ${Math.round(sd.w * 100)}cm）`, run: () => onAction(shieldResizeAction(one, 0.02)) });
    if (sd.w > SHIELD_MIN + 0.001) rows.push({ label: `屏面变窄（现 ${Math.round(sd.w * 100)}cm）`, run: () => onAction(shieldResizeAction(one, -0.02)) });
    if (sd.h < SHIELD_H_MAX - 0.001) rows.push({ label: `屏面抬高（现 ${Math.round(sd.h * 100)}cm）`, run: () => onAction(shieldResizeAction(one, 0, 0.02)) });
    if (sd.h > SHIELD_H_MIN + 0.001) rows.push({ label: `屏面压低（现 ${Math.round(sd.h * 100)}cm）`, run: () => onAction(shieldResizeAction(one, 0, -0.02)) });
    if (one.owner === me.id) rows.push({ label: "放开这块屏的归属", run: () => onAction(shieldClaimAction(one, null)) });
    else if (!one.owner && !gaming) rows.push({ label: "认领这块屏", run: () => onAction(shieldClaimAction(one, me.id)) });
  }
  if (one?.kind === "tray") {
    const td = fixTray(one.tray);
    // 一档 4cm，与选中栏那两颗步进器同一档；到顶到底就不摆这一行（构造器返回 null 即边界）
    for (const [dw, dd, label] of [
      [0.04, 0, "加宽"], [-0.04, 0, "变窄"], [0, 0.04, "加深"], [0, -0.04, "变浅"],
    ] as const) {
      const a = trayResizeAction(one, dw, dd);
      if (a) rows.push({ label: `盘腔${label}（现 ${Math.round(td.w * 100)}×${Math.round(td.d * 100)}cm）`, run: () => onAction(a) });
    }
  }
  if (one?.kind === "book") {
    const b = fixBook(one.book);
    if (b.page > 0) rows.push({ label: `上一页（第 ${b.page} 页）`, run: () => onAction(bookPageAction(one, -1)) });
    if (b.page < b.pages.length - 1) rows.push({ label: `下一页（第 ${b.page + 2} 页）`, run: () => onAction(bookPageAction(one, 1)) });
    if (b.pages.length < BOOK_PAGE_MAX && !gaming) rows.push({ label: "末尾添一页", run: () => onAction(bookPagesAction(one, 1)) });
    if (b.pages.length > 1 && !gaming) rows.push({ label: "撕掉最后一页", run: () => onAction(bookPagesAction(one, -1)) });
  }
  // 唱片机：长按给全套，选中栏收起时这几行也够把一首歌放停。空机没什么可放的，就不摆一排死按钮
  if (one?.kind === "gram") {
    const gm = fixGram(one.gram);
    if (gm.clip) {
      rows.push({ label: gm.playing ? `按住（${mmss(gramPos(gm))} / ${mmss(gm.dur)}）` : `放起来（停在 ${mmss(gm.pos)}）`, run: () => onAction(gramPlayAction(one, !gm.playing)) });
      if (gm.dur > 0) {
        rows.push({ label: "往回挪十秒", run: () => onAction(gramNudgeAction(one, -10)) });
        rows.push({ label: "往前挪十秒", run: () => onAction(gramNudgeAction(one, 10)) });
      }
      if (gm.vol > 0) rows.push({ label: `音量小一格（现在 ${Math.round(gm.vol * 100)}%）`, run: () => onAction(gramVolAction(one, -0.1)) });
      if (gm.vol < 1) rows.push({ label: `音量大一格（现在 ${Math.round(gm.vol * 100)}%）`, run: () => onAction(gramVolAction(one, 0.1)) });
      rows.push({ label: gm.loop ? "关掉循环，唱完就停" : "上循环：唱完接着唱", run: () => onAction(gramLoopAction(one, !gm.loop)) });
      // 换片（含抽出唱片）是开桌前准备好的活，游戏模式里只留放停与音量
      if (!gaming) risk.push({ label: "抽出唱片", tone: "danger", run: () => onAction(gramLoadAction(one, null)) });
      if (gm.playing && audioBlocked()) rows.push({ label: "放行声音（浏览器还拦着）", run: unlockAudio });
    }
    rows.push({ label: audioMuted() ? "取消本机静音" : "只关本机这一台的声音", run: () => setAudioMuted(!audioMuted()) });
  }
  // 随身听：机器是桌上的，歌还在各人自己电脑里。所以没字节时只给「要歌」，有字节才给走带那一排
  if (one?.kind === "mp3") {
    const wm = fixMp3(one.mp3);
    const clip = wm.clip;
    const here = !!clip && songHere(clip);
    const mine = mp3Mine(wm, me.id);
    if (clip && !here) {
      if (!mine) rows.push({ label: "取这首歌（他那台电脑一段一段递过来，不经服务器）", run: () => { unlockAudio(); onAskTrack(wm.by || "", clip); } });
      if (transferOf(clip)?.failed) rows.push({ label: "上一轮没递完：再要一次", run: () => retryTrack(clip) });
      rows.push({ label: audioMuted() ? "取消本机静音" : "只关本机这一台的声音", run: () => setAudioMuted(!audioMuted()) });
    }
    if (clip && here && !wm.shared) {
      const at = localPos(one);
      rows.push({ label: localPlaying(one) ? `本机按住（${mmss(at)} / ${mmss(wm.dur)}）` : `本机放起来（停在 ${mmss(at)}，只有你听得见）`, run: () => { unlockAudio(); localToggle(one); } });
      if (wm.dur > 0) {
        rows.push({ label: "本机往回挪十秒", run: () => localSeek(one, Math.max(0, at - 10)) });
        rows.push({ label: "本机往前挪十秒", run: () => localSeek(one, Math.min(wm.dur, at + 10)) });
      }
      if (localVol(one) > 0) rows.push({ label: `本机音量小一格（现在 ${Math.round(localVol(one) * 100)}%）`, run: () => localSetVol(one, localVol(one) - 0.1) });
      if (localVol(one) < 1) rows.push({ label: `本机音量大一格（现在 ${Math.round(localVol(one) * 100)}%）`, run: () => localSetVol(one, localVol(one) + 0.1) });
      rows.push({ label: localLoop(one) ? "本机关掉循环，放完就停" : "本机循环：放完接着放", run: () => localSetLoop(one, !localLoop(one)) });
      if (mine && !gaming) rows.push({ label: "共享给全桌一起听", run: () => { dropLocal(one.id); onAction(mp3ShareAction(one, true, localPos(one))); } });
      if (wm.playing && audioBlocked()) rows.push({ label: "放行声音（浏览器还拦着）", run: unlockAudio });
      rows.push({ label: audioMuted() ? "取消本机静音" : "只关本机这一台的声音", run: () => setAudioMuted(!audioMuted()) });
    }
    if (clip && here && wm.shared) {
      const at = mp3Pos(wm);
      rows.push({ label: wm.playing ? `按住（${mmss(at)} / ${mmss(wm.dur)}）` : `放起来（停在 ${mmss(wm.pos)}）`, run: () => { unlockAudio(); onAction(mp3PlayAction(one, !wm.playing)); } });
      if (wm.dur > 0) {
        rows.push({ label: "往回挪十秒", run: () => onAction(mp3SeekAction(one, Math.max(0, at - 10))) });
        rows.push({ label: "往前挪十秒", run: () => onAction(mp3SeekAction(one, Math.min(wm.dur, at + 10))) });
      }
      if (wm.vol > 0) rows.push({ label: `全桌音量小一格（现在 ${Math.round(wm.vol * 100)}%）`, run: () => onAction(mp3VolAction(one, -0.1)) });
      if (wm.vol < 1) rows.push({ label: `全桌音量大一格（现在 ${Math.round(wm.vol * 100)}%）`, run: () => onAction(mp3VolAction(one, 0.1)) });
      rows.push({ label: wm.loop ? "关掉循环，放完就停" : "上循环：放完接着放", run: () => onAction(mp3LoopAction(one, !wm.loop)) });
      if (mine && !gaming) rows.push({ label: "收回自己听（全桌当场停住）", run: () => { dropLocal(one.id); onAction(mp3ShareAction(one, false)); } });
      if (wm.playing && audioBlocked()) rows.push({ label: "放行声音（浏览器还拦着）", run: unlockAudio });
      rows.push({ label: audioMuted() ? "取消本机静音" : "只关本机这一台的声音", run: () => setAudioMuted(!audioMuted()) });
    }
  }
  // 平板：只有 B 站那种地址拧得动走带，普通网页就摆放大与重新载入；门控跟选中栏同一个口径
  if (one?.kind === "tablet") {
    const tp = fixTablet(one.tablet);
    const bili = biliOf(tp.url);
    if (bili) {
      const here = tabletPos(tp);
      rows.push({ label: tp.playing ? `按住（${mmss(here)}）` : `放起来（停在 ${mmss(tp.pos)}）`, run: () => onAction(tabletPlayAction(one, !tp.playing)) });
      const back = tabletNudgeAction(one, -10);
      if (back) rows.push({ label: "往回挪十秒", run: () => onAction(back) });
      const fwd = tabletNudgeAction(one, 10);
      if (fwd) rows.push({ label: "往前挪十秒", run: () => onAction(fwd) });
      const prev = tabletPageAction(one, -1);
      if (prev) rows.push({ label: `上一集（现在第 ${tp.page} 集）`, run: () => onAction(prev) });
      const next = tabletPageAction(one, 1);
      if (next) rows.push({ label: `下一集（现在第 ${tp.page} 集）`, run: () => onAction(next) });
      rows.push({ label: tp.mute ? "取消静音：全桌都听见" : "静音：全桌一起安静", run: () => onAction(tabletMuteAction(one, !tp.mute)) });
      rows.push({ label: "放大观看（把这块屏捞到桌面上来看大点）", run: () => onWatch(one.id) });
    } else if (tp.url) {
      rows.push({ label: `放大观看（${tabletHost(tp.url)}）`, run: () => onWatch(one.id) });
      rows.push({ label: "重新载入这一页（里面的站点跳走了、或是压根不让人嵌，就靠这一下扳回来）", run: () => { const a = tabletReloadAction(one); if (a) onAction(a); } });
    }
    // 上手与放大是两条路：一个把指针交给桌上这块屏，一个把屏捞成浮层。有页面才摆得出来
    if (tp.url) rows.push(touch === one.id
      ? { label: "手离开屏幕（指针还给桌子，转视角与挪东西照旧）", run: () => onTouch(null) }
      : { label: "上手摸这块屏（镜头凑到屏前，里面的链接按钮随你点）", run: () => onTouch(one.id) });
    if (tp.url && !gaming) risk.push({ label: "关掉这页", tone: "danger", run: () => onAction(tabletClearAction(one)) });
    // 空机就一行都不摆：填地址的活归选中栏那一栏，跟随身听空机时同一个做法
  }
  if (one?.kind === "arrow") {
    const len = one.len ?? 0.3;
    // 长短与选中栏那两个按钮一个口径（一档 10cm），顶到底就不摆
    if (len < ARROW_MAX - 0.001) rows.push({ label: `箭头加长（现 ${Math.round(len * 100)}cm）`, run: () => onAction(arrowLenAction(one, 0.1)) });
    if (len > ARROW_MIN + 0.001) rows.push({ label: `箭头缩短（现 ${Math.round(len * 100)}cm）`, run: () => onAction(arrowLenAction(one, -0.1)) });
  }
  // 翻面：归约里的 flip 只认牌与带 pile 的容器，容器的朝向在上面用「顶牌朝上/下」说清楚了
  if (cards.length && !inHand) rows.push({ label: cards.length > 1 ? `翻面（${cards.length} 张）` : "翻面", run: () => onAction({ t: "flip", ids: cards.map((o) => o.id) }) });
  if (one && (one.card || one.pile?.length) && !hidden) rows.push({ label: "细看这一面", run: () => onInspect(one.id) });
  if (cards.length) {
    rows.push({
      label: inHand ? `打出手牌（${cards.length} 张）` : `拿进手牌（${cards.length} 张）`,
      run: () => onAction(handAction(cards.map((o) => o.id), inHand ? null : me.id)),
    });
  }
  if (loose.length && container) rows.push({ label: `收进${container.kind === "bag" ? "袋子" : container.kind === "box" ? "卡牌盒" : "牌堆"}（${loose.length} 张）`, run: () => onAction(gatherAction(all, container.id, loose)) });
  if (loose.length > 1) rows.push({ label: `按牌面分堆（${loose.length} 张）`, run: () => onAction(splitPilesAction(all, loose)) });

  // ——— 摆放：与选中栏那颗「转角 / 俯仰 / 高度 / 体积」同一份筛选口径 ———
  if (one) place.push({ label: "聚焦视角", run: () => onFocus(one.id) });
  if (tilted.length) place.push({ label: tilted.length === 1 ? "转角归零" : `转角归零（${tilted.length} 个）`, run: () => onAction(rotResetAction(tilted)) });
  // 这颗管的是整张桌子，跟选中谁无关：没一件歪着时构造器返回 null，这一行也就不出现
  const straighten = straightenAllAction(all);
  if (straighten && straighten.t === "rotReset" && straighten.ids.length > tilted.length) {
    place.push({ label: `桌面全部摆正（${straighten.ids.length} 件）`, run: () => onAction(straighten) });
  }
  if (scalable.length) {
    place.push({ label: "放大一档", run: () => onAction(scaleAction(scalable, 1.2)) });
    place.push({ label: "缩小一档", run: () => onAction(scaleAction(scalable, 1 / 1.2)) });
  }
  // 复制出来的是新物件，游戏模式里不让添，这一行也就没必要摆
  if (!gaming && scalable.length) place.push({ label: "复制一份", run: () => onAction(duplicateAction(all, scalable)) });
  if (chosen.length > 1) place.push({ label: "散开排列", run: () => onAction(spreadAction(all, ids)) });
  if (liftable.length) {
    place.push({ label: liftable.length > 1 ? `上层（${liftable.length} 件）` : "上层", run: () => onAction({ t: "layer", ids: liftable, delta: 1 }) });
    place.push({ label: liftable.length > 1 ? `下层（${liftable.length} 件）` : "下层", run: () => onAction({ t: "layer", ids: liftable, delta: -1 }) });
  }
  if (!gaming) risk.push({ label: ids.length > 1 ? `拿走这 ${ids.length} 件` : `拿走${names}`, tone: "danger", run: () => onAction({ t: "remove", ids }) });

  const total = rows.length + place.length + risk.length;
  // 长到一眼数不完才分段：两三行的时候小标题只是噪音
  const titled = total > 8 && (place.length > 0 || risk.length > 0);
  // 顶到底按实测的底条高度让位：只按视口算的话，最后几行正好压在选中栏后面
  const stripH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--strip-h")) || 0;
  const rowsH = Math.min(total, 18) * 30;
  const menuTop = Math.max(8, Math.min(at.y, window.innerHeight - stripH - rowsH - 40));
  // 高度也跟着底条让位：只按 72dvh 封顶的话，菜单下沿会盖进选中栏里，最后一行永远扫不到
  const menuH = Math.max(140, window.innerHeight - stripH - menuTop - 12);
  const groups = titled
    ? [
        { title: "这一件", items: rows },
        { title: "摆放", items: place },
        { title: "危险", items: risk },
      ].filter((g) => g.items.length)
    : [{ title: "", items: [...rows, ...place, ...risk] }];

  return (
    <div
      className="panel scrollbar-thin absolute z-40 w-44 overflow-y-auto rounded-lg p-1 shadow-xl"
      style={{ left: Math.max(8, Math.min(at.x, window.innerWidth - 200)), top: menuTop, maxHeight: menuH }}
      onPointerDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {groups.map((g) => (
        <div key={g.title || "all"}>
          {g.title && <span className="panel-title ms-1 block pt-1 leading-none text-muted-foreground/85">{g.title}</span>}
          {g.items.map((r) => (
            <button
              key={r.label}
              type="button"
              role="menuitem"
              className={cn("w-full rounded px-2 py-1.5 text-left text-xs hover:bg-primary/15", r.tone === "danger" && "text-destructive hover:bg-destructive/15")}
              onClick={() => {
                r.run();
                onClose();
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
