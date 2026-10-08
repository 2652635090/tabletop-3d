import { useRef, useState, type ReactNode } from "react";
import { BookOpen, Calculator, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsDown, ChevronsUp, Copy, CornerDownRight, Dices, Disc3, Download, Eject, EyeOff, FlipVertical2, Gauge, Group, Hand, Headphones, Hourglass, ImagePlus, Layers, LayoutGrid, Library, List, Lock, Magnet, Maximize2, MonitorPlay, Pause, Pin, PinOff, Play, Plus, Minus, Radio, RefreshCw, Repeat, RotateCcw, RotateCw, Ruler, Scissors, Send, Share2, Shield, Shuffle, Star, Trash2, Unlock, Upload, Volume2, VolumeX, Waves, ZoomIn, ZoomOut } from "lucide-react";
import { ARROW_MAX, ARROW_MIN, BOOK_CHARS, BOOK_PAGE_MAX, CONTAINER_KINDS, CARD_BACKS, CARD_BACK_NAMES, COUNTER_EDGE_NAMES, COUNTER_STEPS, GUARD_MAX, GUARD_MIN, HOUR_MAX, HOUR_MIN, REACH_DEFAULT, REACH_MAX, REACH_MIN, SCALE_MAX, SCALE_MIN, SHAPES, SHIELD_BAND, SHIELD_H_MAX, SHIELD_H_MIN, SHIELD_MAX, SHIELD_MIN, SLOT_MAX, SLOT_MIN, SPIN_MAX, SPIN_MIN, STAT_MAX, STAT_MIN, TRACK_MARK_MAX, TRACK_MAX, TRACK_MIN, TABLET_ADDR_MAX, TABLET_PAGE_MAX, TABLET_POS_MAX, XIANGQI_GLYPHS, ZONE_MAX, ZONE_MIN, GRAM_NAME_MAX, MP3_NAME_MAX, biliOf, boardSize, diceInTray, displayName, fixCounter, fixMp3, mp3Mine, mp3Pos, fixTablet, tabletPos, faceHidden, fixBook, fixGram, fixHour, fixShield, fixSpinner, fixTrack, fixTray, gramPos, gridable, hourDone, hourLeft, inZone, isMat, lockedOut, mmss, pinnable, presetOf, remainingOf, slotCards, statCards, takesCapture, trackMark } from "@/game/catalog";
import { CALC_KEYS, evalCalc, formatCalc } from "@/game/calc";
import { fileToCardData, fileToMat, saveImage } from "@/game/images";
import { CLIP_MAX_BYTES, audioBlocked, audioMuted, clipMissing, retryClip, saveClip, setAudioMuted, unlockAudio } from "@/game/audio";
import { dropLocal, localLoop, localPos, localPlaying, localSeek, localSetLoop, localSetVol, localToggle, localVol, retryTrack, songHere, transferOf } from "@/game/mp3";
import { pickTrack } from "@/game/track";
import { tabletAddr, tabletHost } from "@/game/tablet";
import { GAME_SHUT_HINT } from "@/game/perm";
import { describeTide, groupText, isTideCards, tideScore } from "@/game/tide";
import { arrowLenAction, backSetAction, bookPageAction, bookPagesAction, bookWriteAction, calcKeyAction, counterAttachAction, counterSetAction, counterStepAction, counterStepSetAction, cutAction, dealAction, drawAction, drawIntoAction, drawLandingText, drawTargetOf, duplicateAction, evenSplitAction, gatherAction, gramLoadAction, gramLoopAction, gramNudgeAction, gramPlayAction, gramRenameAction, gramSeekAction, gramVolAction, grabAction, gridLockAction, handAction, hourFlipAction, hourSetAction, markAction, markClearAction, meshAction, mp3LoadAction, mp3LoopAction, mp3PlayAction, mp3RenameAction, mp3SeekAction, mp3ShareAction, mp3VolAction, padImageAction, padLockAction, preferredZoneOf, resetAction, rotResetAction, scaleAction, shieldClaimAction, shieldResizeAction, shuffleAction, slotResizeAction, snapOnAction, splitParts, spinAction, spinSetAction, splitPilesAction, statResizeAction, straightenAllAction, spreadAction, tabletClearAction, tabletLoadAction, tabletMuteAction, tabletNudgeAction, tabletPageAction, tabletPlayAction, tabletReloadAction, tabletSeekAction, tidyAction, timerPauseAction, timerResetAction, timerRunAction, timerShiftAction, trackSetAction, trayResizeAction, tableZones, type DrawPick, zonePrefAction, zonePrivAction, zoneRangeAction, zoneResizeAction } from "@/game/ops";
import type { Action, CardSpec, GameObject, TableState } from "@/game/types";
import type { MovePoint } from "@/game/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { HoldButton, Swatches, ZoneChip } from "./widgets";

/**
 * 行棋点位：由 App 算好的一份「这一子眼下走得进哪几格」，渲染层点亮的圈、键盘 N/M、
 * 长按菜单转的都是同一个游标，所以这里只管摆出来，不再另算一份。
 */
export interface PointCtl {
  id: string;
  list: MovePoint[];
  cursor: number;
  cycle(step: number): void;
  place(pt: MovePoint): void;
}

/** 迷你 dock 要的角度与高度控制：按住连续调、松手一次性提交，键盘与触屏共用这一套 */
export interface AdjustCtl {
  /** yaw/pitch 是 -1~1 的方向量，具体角速度由接线方定，这里只管方向 */
  hold(src: string, yaw: number, pitch: number, on: boolean): void;
  /** 点一下转固定角度 */
  step(yaw: number, pitch: number): void;
  lock(on: boolean): void;
  lift(delta: number): void;
}

export function SelectionBar({ state, selected, color, setColor, me, present, gaming, onAction, onRoll, onManage, onPullList, onAskTrack, onWatch, touch, onTouch, adjust, pointCtl, drawPick, onDrawPick, narrow, short }: {
  state: TableState;
  selected: string[];
  color: string;
  setColor: (c: string) => void;
  me: { id: string; name: string; color: string };
  /** 在线客户端：不在名单里的玩家留下的隐私区不再锁人 */
  present?: Set<string>;
  /** 游戏中：改名换色、卡面卡背、规格增减这些「摆桌子」的入口全收起来，只剩正常游玩那一套 */
  gaming: boolean;
  onAction: (a: Action | null, opts?: { retry?: boolean }) => void;
  onRoll: (ids: string[], spread?: number) => void;
  onManage: (id: string) => void;
  onPullList: (id: string) => void;
  /** 向同桌那台随身听的主人求一首歌：字节由他那台机器递过来，服务器不存这份 */
  onAskTrack: (to: string, key: string) => void;
  /** 把这台平板的屏浮到桌面上来看：屏里就是那个站点自己的页面 */
  onWatch: (id: string) => void;
  /** 上手摸屏的那台平板，null 表示指针全归桌子 */
  touch: string | null;
  onTouch: (id: string | null) => void;
  adjust: AdjustCtl;
  /** 行棋点位：只给选中一枚、且这盘认得出它那枚子角色的时候 */
  pointCtl: PointCtl | null;
  /**
   * 摸牌落点：选中这一栏只是把它摆出来给人挑，值本身存在上层——
   * 没选中东西时这一整条会卸掉，值存在这里一取消选中就没了。
   */
  drawPick: DrawPick;
  onDrawPick: (p: DrawPick) => void;
  narrow: boolean;
  /** 矮屏（手机横屏）：展开区再压一档，别让菜单吃掉本来就不高的一屏 */
  short: boolean;
}) {
  const objects = state.o;
  const chosen = selected.map((id) => objects.find((o) => o.id === id)).filter((o): o is GameObject => !!o && !lockedOut(o, state, me.id, present));
  // 手机默认只留一行 dock：桌面是拿来摆东西的，不该被菜单吃掉半屏
  const [open, setOpen] = useState(() => !narrow);
  const backFile = useRef<HTMLInputElement>(null);
  const [backBusy, setBackBusy] = useState("");
  const clipFile = useRef<HTMLInputElement>(null);
  /** 随身听：本机那一档的读数和往机器上刻歌的那一下 */
  const songFile = useRef<HTMLInputElement>(null);
  const [songBusy, setSongBusy] = useState("");
  const [songErr, setSongErr] = useState("");
  const [mscrub, setMscrub] = useState<number | null>(null);
  const [pscrub, setPscrub] = useState<number | null>(null);
  const padFile = useRef<HTMLInputElement>(null);
  const [padBusy, setPadBusy] = useState("");
  const [padErr, setPadErr] = useState("");
  /** 上传唱片没有 toast 可报（这层没有通知回调），失败那句话就单独写在按钮下面 */
  const [clipBusy, setClipBusy] = useState("");
  const [clipErr, setClipErr] = useState("");
  /** 地址那一栏：网址、BV 号、整条链接都先落在这儿，认得出地址才往桌上写 */
  const addrBox = useRef<HTMLInputElement>(null);
  const [addrErr, setAddrErr] = useState("");
  /** 「拨到」那一栏：读的是秒数。跨源播放器报不出时长，所以只给一个框，不给滑条 */
  const seekBox = useRef<HTMLInputElement>(null);
  /** 拖滑条时先按手上的读数显示，松手才写进桌上：一路刷动作会把全桌的读数带得抖 */
  const [scrub, setScrub] = useState<number | null>(null);
  if (!chosen.length) return null;
  const ids = chosen.map((o) => o.id);
  const kinds = new Set(chosen.map((o) => o.kind));
  const one = chosen.length === 1 ? chosen[0] : null;
  /** 选中这一件叫什么：拿走那一行的按钮名、长按菜单里的「××加宽」都用它，不再各写一份 */
  const names = one ? displayName(one) : "物件";
  const container = one && CONTAINER_KINDS.includes(one.kind) ? one : null;
  const zone = one && one.kind === "zone" ? one : null;
  const stat = one && one.kind === "stat" ? one : null;
  const mat = one && isMat(one) ? one : null;
  const matSize = mat?.board ? boardSize(mat.board) : null;
  const strip = one && one.kind === "slot" ? one : null;
  const dial = one && one.kind === "spinner" ? one : null;
  const rail = one && one.kind === "track" ? one : null;
  /** 转盘与计分轨的规格先归一次：字段可能压根没写，后面的读数才敢直接用 */
  const spin = dial ? fixSpinner(dial.spinner) : null;
  const track = rail ? fixTrack(rail.track) : null;
  const mine = rail ? trackMark(rail, me.id) : undefined;
  /** 轨上还缺棋子的人：自己一定排在最前，其次才是入座的别人；满 10 枚就不再请人上场 */
  const offTrack = (() => {
    if (!track || track.marks.length >= TRACK_MARK_MAX) return [];
    const aboard = new Set(track.marks.map((m) => m.by));
    const seats = [{ id: me.id, name: me.name || "我", color: me.color }, ...state.players.filter((p) => p.id !== me.id)];
    return seats.filter((p) => !aboard.has(p.id));
  })();
  /** 别人区域里的牌：牌面保密，卡牌管理也不能开 */
  const concealed = !!one && faceHidden(one, state, me.id, present);
  /** 牌屏、沙漏、规则书：三样新配件各自先归一次规格，读数才敢直接用 */
  const screen = one && one.kind === "shield" ? one : null;
  const sd = screen ? fixShield(screen.shield) : null;
  const tray = one && one.kind === "tray" ? one : null;
  const td = tray ? fixTray(tray.tray) : null;
  const glass = one && one.kind === "hour" ? one : null;
  const hs = glass ? fixHour(glass.hour) : null;
  const tome = one && one.kind === "book" ? one : null;
  const bk = tome ? fixBook(tome.book) : null;
  /** 唱片机：这台机器放的是哪张片、唱到第几秒，全桌读的是同一份状态 */
  const deck = one && one.kind === "gram" ? one : null;
  const dg = deck ? fixGram(deck.gram) : null;
  /** 平板浏览器：屏上只写着一条地址与走带参数，页面由各端自己挂上去 */
  const tv = one && one.kind === "tablet" ? one : null;
  const tb = tv ? fixTablet(tv.tablet) : null;
  /** 这条地址是不是 B 站的片子：只有它才带得动那一排走带按钮 */
  const bili = tb ? biliOf(tb.url) : "";
  const now = Date.now();
  /**
   * 改名字那几个输入框：游戏模式里退回只读，看得见当前叫什么、就是改不动。
   * 摆成可编辑再靠 dispatch 那道闸退回，等于留一排按了没动静的框。
   */
  const nameProps: { readOnly?: boolean; title?: string } = gaming ? { readOnly: true, title: GAME_SHUT_HINT } : {};
  const head = dg ? Math.round((scrub ?? gramPos(dg, now)) * 10) / 10 : 0;
  /** 平板此刻该播到第几秒：各端按同一份参数自己推，没人往桌上回写进度 */
  const tvHead = tb ? Math.round(tabletPos(tb, now) * 10) / 10 : 0;
  /** 机上那张片子的 key：单拎一个常量出来，回调里才留得住「不是 null」这件事 */
  const tune = dg?.clip ?? null;
  /**
   * 随身听：机器摆在桌上是公共的，歌却先只在它主人自己那台电脑上——
   * 没共享出去时这一档的走带全在本机（mp3.ts 那份私人状态），共享之后才换成桌上这一份。
   */
  const walkman = one && one.kind === "mp3" ? one : null;
  const pm = walkman ? fixMp3(walkman.mp3) : null;
  /** 本机存着这首歌的字节吗：没有就放不动，得向主人求一份过来 */
  const tuneIn = !!pm?.clip && songHere(pm.clip);
  /** 摆这台机器的人才有换歌、共享与收回那几下（旧数据没记主人，就谁都能上手） */
  const hoster = !!pm && mp3Mine(pm, me.id);
  const songOwner = !pm?.by || pm.by === me.id ? "" : state.players.find((p) => p.id === pm.by)?.name || "同桌那位";
  /** 私人那一档与共享那一档各读各的数：同一时刻只有一档在管这台机器 */
  const pHead = walkman && pm && !pm.shared ? Math.round((pscrub ?? localPos(walkman, now)) * 10) / 10 : 0;
  const mHead = walkman && pm?.shared ? Math.round((mscrub ?? mp3Pos(pm, now)) * 10) / 10 : 0;
  const fetching = pm?.clip ? transferOf(pm.clip) : null;
  /**
   * 随身听在 dock 上的那一颗：空机、缺字节、私人、共享各有各的主操作，
   * 跟唱片机同一个位置同一套脾气——收起展开区时也能一键放停。
   */
  const pmRow = !walkman || !pm
    ? null
    : !pm.clip
      ? {
          label: hoster ? "空机，刻首歌" : "空机，等主人刻歌",
          title: hoster ? "展开「随身听」那一栏，从自己电脑里挑一首歌刻进来" : "歌刻在摆它的人自己电脑上，展开那一栏看得见这台机器现在什么状态",
          run: () => { setOpen(true); },
        }
      : !tuneIn
        ? {
            label: "取这首歌",
            title: songOwner ? `向${songOwner}那台机器要这首歌：一段一段递过来，服务器那边没存过它` : "本机缓存里没这首歌了，展开那一栏看看怎么办",
            run: () => { if (songOwner) { unlockAudio(); onAskTrack(songBy, songCode); } else setOpen(true); },
          }
        : pm.shared
          ? {
              label: pm.playing ? `全桌 ${mmss(mHead)} / ${mmss(pm.dur)}` : `全桌停在 ${mmss(mHead)}`,
              title: pm.playing ? "按住：位置记下来，全桌一起停" : "放起来：全桌一起听这一台机器",
              run: () => { unlockAudio(); onAction(mp3PlayAction(walkman, !pm.playing)); },
            }
          : {
              label: localPlaying(walkman) ? `本机 ${mmss(pHead)} / ${mmss(pm.dur)}` : `本机停在 ${mmss(pHead)}`,
              title: localPlaying(walkman) ? "按住：只有这台电脑听得到的这一台停下" : "放起来：这一档只在这台电脑上响，同桌都听不着",
              run: () => { unlockAudio(); localToggle(walkman); },
            };
  /** 点击回调里读不到上面那串 && 的收窄，所以先把歌的代码与主人固定成两个非空值 */
  const songCode = pm?.clip ?? "";
  const songBy = pm?.by ?? "";
  /** 屏背面印的就是主人的名字；没主人的屏不挡人，所以也没有名字可印 */
  const screenOwner = !screen?.owner ? "" : screen.owner === me.id ? me.name || "我" : state.players.find((p) => p.id === screen.owner)?.name ?? "";
  const diceIds = ids.filter((o) => objects.find((x) => x.id === o)?.kind === "die");
  const allDice = objects.filter((o) => o.kind === "die");
  const firstPile = objects.find((o) => o.kind === "pile");
  const inHand = chosen.some((o) => o.hand);
  /** 摸牌落点：只有显式标记过的首选区才拦截，否则一律收进手牌 */
  const home = preferredZoneOf(state, me.id);
  /** 落点候选：桌上所有区域都在名单里，和手牌条「打到哪」那一排同一批 */
  const zones = tableZones(state);
  /** 这一把真正落在哪儿：高亮的那一格与按钮上的说法都读它，两套口径不会分叉 */
  const landing = drawTargetOf(state, me.id, drawPick);
  const landingText = drawLandingText(state, me.id, drawPick);
  /** 能改体积的选中项：手里的牌与棋盘都不算——归约里的 scale 明确跳过棋盘，摆出来就是颗按不动的按钮 */
  const pickable = ids.filter((id) => {
    const o = objects.find((x) => x.id === id);
    return !!o && !o.hand && o.kind !== "board";
  });
  /** 复制也只绕开棋盘：整组就选了一张盘时 duplicateAction 返回 null，那颗按钮摆出来就是按不动的 */
  const duplicable = chosen.some((o) => o.kind !== "board");
  /** 能钉住高度的物件才出现锁定与高度控件：棋盘和贴面区域垫本来就钉在桌面上 */
  const stackable = chosen.filter(pinnable);
  const locked = stackable.length > 0 && stackable.every((o) => o.pin);
  const cards = ids.filter((id) => objects.find((o) => o.id === id)?.card);
  /** 选中里的桌面散牌：分堆与「收进这一叠」都只针对它们 */
  const loose = chosen.filter((o) => o.kind === "card" && o.card && !o.hand).map((o) => o.id);
  /** 有卡背可言的选中项：单张牌、牌堆、盒、袋 */
  const backed = chosen.filter((o) => o.card || Array.isArray(o.pile)).map((o) => o.id);
  const turnable = ids.filter((id) => {
    const o = objects.find((x) => x.id === id);
    // 与按住转那颗同一个口径：手里的牌与棋盘转不动，归零按钮也就不能算进它们头上
    return !!o && !o.hand && o.kind !== "board" && (((o.rot % 360) + 360) % 360 !== 0 || !!o.tilt);
  });
  const pileTargets = chosen.filter((o) => CONTAINER_KINDS.includes(o.kind)).map((o) => o.id);
  /**
   * 潮汐算分的取材范围：选中的牌、选中区域里摊着的牌，以及翻开了的公共叠。
   * 扣着的潮库不参与——那一叠的牌序连主人都不知道，算出来那个"最高分"是假的。
   */
  const tideSpecs: (CardSpec | undefined)[] = [];
  for (const o of chosen) {
    if (faceHidden(o, state, me.id, present)) continue;
    if (o.card) tideSpecs.push(o.card);
    else if (Array.isArray(o.pile) && o.faceUp === true) tideSpecs.push(...o.pile);
    else if (o.kind === "zone") {
      for (const c of objects) {
        if (c.card && !c.hand && inZone(o, c.x, c.z) && !faceHidden(c, state, me.id, present)) tideSpecs.push(c.card);
      }
    }
  }
  /** 少于 3 张不可能成组，就不摆这一行；算分是纯函数，一次选中算一遍，不往桌上写任何东西 */
  const tide = tideSpecs.length >= 3 && isTideCards(tideSpecs) ? tideScore(tideSpecs) : null;

  /** 批量卡背：一张图压一次，然后一次性写给选中的每一处 */
  const applyBackImage = async (file: File) => {
    setBackBusy("处理中");
    const data = await fileToCardData(file);
    if (!data) {
      setBackBusy("");
      return;
    }
    onAction(backSetAction(backed, await saveImage(data)));
    setBackBusy("");
  };

  /** 刻一张唱片：原字节交上去，什么格式都行；失败那句服务器说的话单独摆出来，别把按钮卡成按不动 */
  const uploadClip = async (list: FileList | null) => {
    const file = list?.[0];
    if (clipFile.current) clipFile.current.value = "";
    if (!file) return;
    setClipErr("");
    setClipBusy(`上传中 ${Math.round(file.size / 1048576)}MB`);
    try {
      const up = await saveClip(file);
      if (deck) onAction(gramLoadAction(deck, up.key, up.name, up.dur));
    } catch (error) {
      setClipErr(error instanceof Error ? error.message : "这首曲子没刻上唱片，再试一次");
    }
    setClipBusy("");
  };

  /** 换垫面图：只换皮不改垫子的位置和大小，尺寸想调还得用下面那两档宽深 */
  const swapPadImage = async (list: FileList | null) => {
    const file = list?.[0];
    if (padFile.current) padFile.current.value = "";
    if (!file || !zone) return;
    setPadErr("");
    setPadBusy("处理中");
    try {
      const mat = await fileToMat(file);
      if (!mat) setPadErr("这张图太大还是压不下，换一张试试");
      else {
        const a = padImageAction(zone, mat.key);
        if (a) onAction(a);
      }
    } catch {
      setPadErr("垫面没换上，再试一次");
    }
    setPadBusy("");
  };

  /** 松手才将读数写进桌上，别人那端跟着跳一次就够 */
  const commitScrub = () => {
    if (scrub === null || !deck || !dg) return;
    onAction(gramSeekAction(deck, scrub));
    setScrub(null);
  };

  /** 贴上地址：认得出网址或 BV 号才往桌上写，换页照老规矩从第 0 秒起播 */
  const applyAddr = () => {
    const box = addrBox.current;
    if (!tv || !box) return;
    const text = box.value;
    if (!tabletAddr(text)) {
      setAddrErr(text.trim() ? "认不出这条地址：贴网址（带 http/https），或哔哩哔哩的 BV 号与整条链接" : "先填一条地址，再按贴上");
      return;
    }
    setAddrErr("");
    box.value = "";
    onAction(tabletLoadAction(tv, text));
  };

  /**
   * 「拨到」那一栏认两种写法：纯秒数（4230）和冒号分段（1:10:30、70:5）。
   * 跨源播放器读不到时长，给不了滑条，就只能靠人把秒数说清楚。
   */
  const applySeek = () => {
    const box = seekBox.current;
    if (!tv || !box) return;
    const parts = box.value.trim().split(":");
    const sec = parts.every((p) => /^\d+$/.test(p.trim()))
      ? parts.reduce((acc, p) => acc * 60 + Number(p.trim()), 0)
      : Number.NaN;
    if (!Number.isFinite(sec)) return;
    onAction(tabletSeekAction(tv, sec));
  };

  /** 刻一首本机的歌：字节只落这台电脑的缓存，桌上只记 key、曲名与时长 */
  const loadSong = async (list: FileList | null) => {
    const file = list?.[0];
    if (songFile.current) songFile.current.value = "";
    if (!file || !walkman) return;
    setSongErr("");
    setSongBusy(`读取中 ${Math.round(file.size / 1048576)}MB`);
    try {
      const up = await pickTrack(file);
      onAction(mp3LoadAction(walkman, up.key, up.name, up.dur));
    } catch (error) {
      setSongErr(error instanceof Error ? error.message : "这首歌没刻上机器，再试一次");
    }
    setSongBusy("");
  };

  /** 共享出去那一份松手才写桌上；本机这一份连桌上都不碰 */
  const commitShared = () => {
    if (mscrub === null || !walkman || !pm?.shared) return;
    onAction(mp3SeekAction(walkman, mscrub));
    setMscrub(null);
  };
  const commitLocal = () => {
    if (pscrub === null || !walkman) return;
    localSeek(walkman, pscrub);
    setPscrub(null);
  };

  const resize = (factor: number) => onAction(scaleAction(pickable, factor));  /** 默认拿牌：按挑好的落点走（没挑就进手牌或自己的首选区）；摊到桌面另有 spread */
  const take = (o: GameObject, n: number) => drawIntoAction(state, o.id, n, me.id, drawPick, o.kind === "bag");
  const spread = (o: GameObject, n: number) => (o.kind === "bag" ? grabAction(state, o.id, n, me.id) : drawAction(state, o.id, n, me.id));
  const sizeOf = (o: GameObject) => (typeof o.scale === "number" ? o.scale : 1);
  const sizeLabel = chosen.length === 1 ? `${Math.round(sizeOf(one!) * 100)}%` : "体积";
  const yawOf = (o: GameObject) => Math.round(((o.rot % 360) + 360) % 360);

  /** 摆位那一组：桌面跟着主操作排一行，手机单独占一行，两处渲染同一份 */
  const adjustGroup = stackable.length > 0 && (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        size="xs"
        variant={locked ? "default" : "outline"}
        className="shrink-0 gap-1"
        title={locked ? "解锁：斜靠的会先平躺，再按物理落回桌面（L）" : "钉住当前高度，拖动不再落回也不被挤开（L）"}
        onClick={() => adjust.lock(!locked)}
      >
        {locked ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {!narrow && <span>{locked ? "解锁落下" : "锁定高度"}</span>}
      </Button>

      <Stepper label="高度" title="每档 4mm；抬高会顺手钉住高度" readout={one ? `第 ${one.layer} 层` : "层数"} compact={narrow} onMinus={() => adjust.lift(-1)} onPlus={() => adjust.lift(1)} />

      <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
        {!narrow && <span className="panel-title px-0.5">转角</span>}
        {/* 手机上是手指按：24px 的键帽太考验准头，命中区放到 32px */}
        <HoldButton title="反向转：按住不放一直转（键盘 Q）" className={narrow ? "size-8" : undefined} onHold={(on) => adjust.hold("dock-yaw-", -1, 0, on)}>
          <RotateCcw className="size-3.5" />
        </HoldButton>
        <span className="min-w-9 text-center font-mono text-[10px]">{one ? `${yawOf(one)}°` : "Q / E"}</span>
        <HoldButton title="正向转：按住不放一直转（键盘 E）" className={narrow ? "size-8" : undefined} onHold={(on) => adjust.hold("dock-yaw+", 1, 0, on)}>
          <RotateCw className="size-3.5" />
        </HoldButton>
        <Button size="xs" variant="ghost" className="shrink-0" title="转角与俯仰一起退回 0°（Z）" disabled={!turnable.length} onClick={() => onAction(rotResetAction(turnable))}>
          归零
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="斜靠会顺手钉住高度：别人会撞上它，也能搭在它上面">
        {!narrow && <span className="panel-title px-0.5">俯仰</span>}
        <HoldButton title="压低：按住不放一直翻（键盘 R），斜靠会自动锁定" className={narrow ? "size-8" : undefined} onHold={(on) => adjust.hold("dock-pitch-", 0, -1, on)}>
          <ChevronDown className="size-3.5" />
        </HoldButton>
        <span className="min-w-8 text-center font-mono text-[10px]">{one ? `${Math.round(one.tilt ?? 0)}°` : "R / F"}</span>
        <HoldButton title="抬起：按住不放一直翻（键盘 F）" className={narrow ? "size-8" : undefined} onHold={(on) => adjust.hold("dock-pitch+", 0, 1, on)}>
          <ChevronUp className="size-3.5" />
        </HoldButton>
      </div>
    </div>
  );

  return (
    <div className="panel pointer-events-auto w-full max-w-full rounded-xl px-2 py-1.5">
      {/* ——— 常驻迷你 dock：标题 + 主操作 + 高度锁定/摆位，一行的事 ——— */}
      <div className="flex items-center gap-1.5">
        {/* 手机上这一条装不下：中间这些跟着横滑，右边的展开和拿走钉住不滑走，不必左右翻找 */}
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <span className="panel-title max-w-32 shrink-0 leading-snug break-words">{concealed ? "牌面保密中" : titleOf(one, chosen.length)}</span>

          {diceIds.length > 0 && (
            <Button size="xs" className="shrink-0 gap-1" title="甩开掷：抛出去落到附近（展开「骰子」那一栏还有原地掷）" onClick={() => onRoll(diceIds)}>
              <Dices className="size-3.5" />甩开掷
            </Button>
          )}
          {container && (
            <Button size="xs" className="shrink-0 gap-1" disabled={!container.pile?.length} title={`摸出来的牌${landingText}${zones.length ? "（旁边那一排「摸到」可以挑落点）" : ""}`} onClick={() => onAction(take(container, 1))}>
              <Library className="size-3.5" />{container.kind === "bag" ? "盲摸 1 张" : "摸 1 张"}
            </Button>
          )}
          {/* 落点这一排钉在 dock 上：收起展开区也点得中——摸到哪是每把都要确认的事，不该锁在折叠菜单里 */}
          {container && zones.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1 py-0.5">
              <span className="panel-title shrink-0">摸到</span>
              <ZoneChip label="手牌" active={"hand" in landing} onClick={() => onDrawPick(drawPick === "hand" ? null : "hand")} />
              {zones.map((z) => (
                <ZoneChip
                  key={z.id}
                  label={`${(z.label || "区域").slice(0, 8)}${z.id === home?.id ? " ★" : ""}`}
                  color={z.color}
                  active={"zone" in landing && landing.zone.id === z.id}
                  onClick={() => onDrawPick(drawPick === z.id ? null : z.id)}
                />
              ))}
            </span>
          )}
          {!container && kinds.has("card") && inHand && (
            <Button size="xs" className="shrink-0 gap-1" onClick={() => onAction(handAction(cards, null))}>
              <FlipVertical2 className="size-3.5" />打出手牌
            </Button>
          )}
          {!container && kinds.has("card") && !inHand && (
            <Button size="xs" className="shrink-0 gap-1" onClick={() => onAction({ t: "flip", ids: cards })}>
              <FlipVertical2 className="size-3.5" />翻面
            </Button>
          )}
          {zone && zone.owner === me.id && (
            <Button size="xs" variant={zone.priv ? "default" : "outline"} className="shrink-0 gap-1" onClick={() => onAction(zonePrivAction(zone, !zone.priv))}>
              {zone.priv ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
              {zone.priv ? "隐私开" : "隐私关"}
            </Button>
          )}
          {stat && (
            <Button size="xs" className="shrink-0 gap-1" title="锁定后这块垫子不可选中，牌面统计显示在垫子上" onClick={() => onAction(padLockAction(stat, !stat.lock))}>
              {stat.lock ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
              竖 {statCards(state, stat).up} / 横 {statCards(state, stat).side}
            </Button>
          )}
          {mat && (
            <Button size="xs" className="shrink-0 gap-1" title="锁定后这张桌垫点不中，只能点它角上的解锁按钮" onClick={() => onAction(padLockAction(mat, !mat.lock))}>
              {mat.lock ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
              {mat.lock ? "解锁桌垫" : "锁定桌垫"}
            </Button>
          )}
          {strip && (
            <Button size="xs" className="shrink-0 gap-1" title="把带子上的牌按原先后摊齐" onClick={() => onAction(tidyAction(state, strip))}>
              <List className="size-3.5" />
              占 {slotCards(state, strip).length} / {strip.slot?.n ?? 3} 格
            </Button>
          )}
          {dial && spin && (
            <Button size="xs" className="shrink-0 gap-1" title="随机停一格，也可以直接双击转盘" onClick={() => onAction(spinAction(dial))}>
              <Disc3 className="size-3.5" />
              {spin.value === undefined ? "拨一下" : `第 ${spin.value + 1} 格`}
            </Button>
          )}
          {rail && track && (
            <Button
              size="xs"
              className="shrink-0 gap-1"
              title={mine ? "你的棋子往右走一格" : "把你的棋子放到起点那一格"}
              onClick={() => onAction(markAction(rail, me.id, mine ? 1 : 0, me.name, me.color))}
            >
              <Gauge className="size-3.5" />
              {mine ? `${(mine.name || me.name).slice(0, 6)} 第 ${mine.at + 1}` : "我上场"}
            </Button>
          )}
          {one?.kind === "timer" && (
            <Button size="xs" className="shrink-0 gap-1" onClick={() => onAction(one.endsAt != null ? timerPauseAction(one) : timerRunAction(one))}>
              {one.endsAt != null ? <Pause className="size-3" /> : <Play className="size-3" />}
              {mmss(remainingOf(one))}
            </Button>
          )}
          {one?.kind === "token" && (
            <Button size="xs" className="shrink-0" onClick={() => onAction({ t: "count", id: one.id, delta: 1 })}>
              计数 {one.count ?? 0}
            </Button>
          )}
          {one?.kind === "counter" && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
              <Button
                size="xs"
                variant="ghost"
                className="min-w-6 px-1"
                title={`减 ${fixCounter(one.counter).step}（读数已经到底了就不再出这个动作）`}
                disabled={!counterStepAction(one, -1)}
                onClick={() => { const a = counterStepAction(one, -1); if (a) onAction(a); }}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="min-w-6 text-center font-mono text-xs">{fixCounter(one.counter).v}</span>
              <Button
                size="xs"
                variant="ghost"
                className="min-w-6 px-1"
                title={`加 ${fixCounter(one.counter).step}`}
                disabled={!counterStepAction(one, 1)}
                onClick={() => { const a = counterStepAction(one, 1); if (a) onAction(a); }}
              >
                <Plus className="size-3.5" />
              </Button>
            </span>
          )}

          {glass && hs && (
            <Button
              size="xs"
              className="shrink-0 gap-1"
              title={hs.at === null ? "翻过来就开始漏（双击沙漏也行）" : hourDone(glass) ? "这一漏漏到底了，按回去把沙子翻上来重新装满" : "按回去就停住；再翻过来是一整漏，不会留半漏在中间"}
              onClick={() => onAction(hourFlipAction(glass))}
            >
              <Hourglass className="size-3" />
              {hs.at === null ? `翻过来 ${mmss(hs.mins * 60)}` : hourDone(glass) ? "按回去重来" : `${mmss(hourLeft(glass))} 按回去`}
            </Button>
          )}

          {deck && dg && (
            <Button
              size="xs"
              className="shrink-0 gap-1"
              title={dg.clip ? (dg.playing ? "按住：下次从这一秒接着唱（双击机器也行）" : "接着唱：从停下的这一秒起") : "展开「唱片机」这一栏上传音频"}
              onClick={() => (dg.clip ? onAction(gramPlayAction(deck, !dg.playing)) : setOpen(true))}
            >
              {dg.playing ? <Pause className="size-3" /> : <Play className="size-3" />}
              {!dg.clip ? "空机，放张片" : dg.playing ? `${mmss(head)} / ${mmss(dg.dur)}` : `停在 ${mmss(head)}`}
            </Button>
          )}

          {tv && tb && (
            <Button
              size="xs"
              className="shrink-0 gap-1"
              title={!tb.url
                ? "展开「平板浏览器」这一栏，贴一条网址或 BV 号进来"
                : biliOf(tb.url)
                  ? (tb.playing ? "按住：这一秒记下来，全桌一起停住" : "放起来：全桌一起从这一秒看")
                  : touch === tv.id
                    ? "手离开屏幕：指针还给桌子，转视角与挪东西照旧"
                    : "上手摸这块屏：普通网页没有走带可言，能点的那部分都在屏里"}
              onClick={() => (!tb.url
                ? setOpen(true)
                : biliOf(tb.url)
                  ? onAction(tabletPlayAction(tv, !tb.playing))
                  : onTouch(touch === tv.id ? null : tv.id))}
            >
              {!tb.url || !biliOf(tb.url) ? (touch === tv.id ? <Hand className="size-3" /> : <MonitorPlay className="size-3" />) : tb.playing ? <Pause className="size-3" /> : <Play className="size-3" />}
              {!tb.url ? "空屏，填地址" : biliOf(tb.url) ? (tb.playing ? `放映中 ${mmss(tvHead)}` : `停在 ${mmss(tvHead)}`) : touch === tv.id ? "屏归你点，按这里收回" : `上手摸：${tabletHost(tb.url)}`}
            </Button>
          )}

          {walkman && pmRow && (
            <Button size="xs" className="shrink-0 gap-1" title={pmRow.title} onClick={pmRow.run}>
              {pm?.clip && tuneIn ? ((pm.shared ? pm.playing : localPlaying(walkman)) ? <Pause className="size-3" /> : <Play className="size-3" />) : pm?.clip ? <Download className="size-3" /> : <Headphones className="size-3" />}
              {pmRow.label}
            </Button>
          )}

          {screen && !screen.owner && (
            <Button size="xs" variant="outline" className="shrink-0 gap-1" title="认领这块屏：屏前那一窄条里的牌从此只有你看得见" onClick={() => onAction(shieldClaimAction(screen, me.id))}>
              <Shield className="size-3" />我来认领
            </Button>
          )}
          {screen && screen.owner === me.id && (
            <Button size="xs" className="shrink-0 gap-1" title="放开归属：这块屏就只是一块挡板，谁也不挡" onClick={() => onAction(shieldClaimAction(screen, null))}>
              <Shield className="size-3" />放开归属
            </Button>
          )}
          {screen && screen.owner && screen.owner !== me.id && (
            <span className="panel-title inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 text-[10px]" title={`这块屏由${screenOwner || "别人"}认领，屏前 ${Math.round(SHIELD_BAND * 100)}cm 那一窄条里的牌只对他可见`}>
              <EyeOff className="size-3" />{screenOwner ? `${screenOwner.slice(0, 6)} 的屏` : "别人的屏"}
            </span>
          )}

          {tome && bk && (
            <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
              <BookOpen className="size-3 text-muted-foreground" />
              <Button size="icon-xs" variant="ghost" title="上一页" disabled={bk.page <= 0} onClick={() => onAction(bookPageAction(tome, -1))}>
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="min-w-11 text-center font-mono text-[10px]">第 {bk.page + 1}/{bk.pages.length} 页</span>
              <Button size="icon-xs" variant="ghost" title="下一页（双击书面也翻页）" disabled={bk.page >= bk.pages.length - 1} onClick={() => onAction(bookPageAction(tome, 1))}>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}

          {tide && (
            <span
              className="panel-title inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={`${tideSpecs.length} 张牌：${describeTide(tide)}。这一行只算给你看，不动桌面——展开「潮汐」那一栏有每一组怎么拆的`}
            >
              <Waves className="size-3" />{tide.tooMany ? "牌太多，展开看" : `最高 ${tide.total} 分`}
            </span>
          )}

          {!narrow && stackable.length > 0 && <span className="h-5 shrink-0 border-s border-border/60" aria-hidden />}
          {!narrow && adjustGroup}
        </div>

        {/* 钉在这一条最右：手机上行宽不够时中间滑走，这两个也不跟着走，一眼就在、一按就中 */}
        <div className="flex shrink-0 items-center gap-1 border-s border-border/60 ps-1.5">
          <Button size="icon-xs" variant="ghost" title={open ? "收起多余操作" : "展开更多操作"} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronsDown className="size-3.5" /> : <ChevronsUp className="size-3.5" />}
          </Button>
          {!gaming && (
            <Button size="icon-xs" variant="destructive" title={ids.length > 1 ? `拿走这 ${ids.length} 件` : `拿走${names}`} onClick={() => onAction({ t: "remove", ids })}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* 手机把摆位那一组单独放一行：这一行本来就最宽，挤在同一行只能横滑，分行之后两头都看得见 */}
      {narrow && adjustGroup && (
        <div className="scrollbar-none mt-1 flex items-center gap-1.5 overflow-x-auto">{adjustGroup}</div>
      )}

      {/* ——— 展开区：按类别分组，窄屏两列起步，宽屏一行铺得下 ——— */}
      {open && (
        <div
          className={cn(
            "mt-1.5 flex flex-wrap items-start gap-x-2 gap-y-1.5 border-t border-border/50 pt-1.5",
            // 窄屏给展开区一个硬高度上限，超出就在里面滚：菜单不再顶到屏幕另一头
            narrow && cn("scrollbar-thin min-h-0 overflow-y-auto overscroll-contain pe-1", short ? "max-h-[38dvh]" : "max-h-[min(26dvh,11rem)]"),
          )}
        >
          {concealed && (
            <span className="panel-title inline-flex items-center gap-1 text-muted-foreground"><EyeOff className="size-3" />牌面已保密</span>
          )}

          {(container || cards.length > 0) && (
            <Section label="卡牌">
              {one && (CONTAINER_KINDS.includes(one.kind) || one.kind === "card") && !concealed && !gaming && (
                <Button size="xs" variant="outline" className="gap-1" onClick={() => onManage(one.id)}>
                  <Library className="size-3.5" />卡牌管理
                </Button>
              )}
              {container && (
                <>
                  {container.pile?.length ? (
                    <>
                      <Button size="xs" variant="outline" className="gap-1" title="逐张对照，精确取出那一张" onClick={() => onPullList(container.id)}>
                        <List className="size-3.5" />全部列表（{container.pile.length}）
                      </Button>
                      <Button size="xs" variant="outline" title={`摸出来的牌${landingText}`} onClick={() => onAction(take(container, 5))}>
                        {container.kind === "bag" ? "盲摸 5 张" : "摸 5 张"}
                      </Button>
                      <Button size="xs" variant="outline" className="gap-1" title="摊在容器旁边，所有人都看得见牌面朝上的一面" onClick={() => onAction(spread(container, 1))}>
                        <Layers className="size-3.5" />摊到桌面
                      </Button>
                      <Button size="xs" variant="outline" className="gap-1" onClick={() => onAction(shuffleAction(objects, container.id))}>
                        <Shuffle className="size-3.5" />洗牌
                      </Button>
                      {container.kind === "pile" && container.pile.length >= 2 && (
                        <Button size="xs" variant="outline" className="gap-1" title={`从中间断开：顶上这 ${Math.ceil(container.pile.length / 2)} 张整叠扣到底下，一张牌也不增减`} onClick={() => onAction(cutAction(objects, container.id))}>
                          <Scissors className="size-3.5" />切牌
                        </Button>
                      )}
                      <Button size="xs" variant="outline" className="gap-1" onClick={() => onAction(dealAction(objects, state, container.id, 3))}>
                        <Send className="size-3.5" />按座位发牌
                      </Button>
                      {container.kind === "pile" &&
                        splitParts(container.pile.length, state.players.length).map((parts) => (
                          <Button key={parts} size="xs" variant="outline" className="gap-1" title={`摊成 ${parts} 叠，各叠最多差一张，源堆留在原位`} onClick={() => onAction(evenSplitAction(objects, container.id, parts))}>
                            <LayoutGrid className="size-3.5" />均分 {parts} 叠
                          </Button>
                        ))}
                    </>
                  ) : (
                    // 空堆按这些动作一律不动桌面，摆一排灰按钮只会让人以为坏了；改说一句话，指两条真走得通的路
                    <span className="panel-title inline-flex items-center gap-1 text-muted-foreground">
                      <span className="inline-block size-2 rounded-[2px] border border-dashed" style={{ borderColor: container.color }} />
                      空的：把牌拖进托盘，或按下面「收拢全场散牌」
                    </span>
                  )}
                  <Button size="xs" variant="outline" className="gap-1" onClick={() => onAction(gatherAction(objects, container.id))}>
                    <Group className="size-3.5" />收拢全场散牌
                  </Button>
                  <Button size="xs" variant="outline" className="gap-1" onClick={() => onAction({ t: "turnCards", ids: [container.id], up: container.faceUp === false })}>
                    {container.faceUp === false ? "顶牌朝上" : "顶牌朝下"}
                  </Button>
                </>
              )}
              {kinds.has("card") && (
                inHand ? (
                  <Button size="xs" variant="outline" className="gap-1" onClick={() => onAction(handAction(cards, null))}>
                    <FlipVertical2 className="size-3.5" />打出手牌
                  </Button>
                ) : (
                  <Button size="xs" variant="outline" className="gap-1" onClick={() => onAction(handAction(cards, me.id))}>
                    <Hand className="size-3.5" />拿进手牌
                  </Button>
                )
              )}
              {pileTargets.length === 1 && loose.length > 0 && (
                <Button
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  title={`把选中的 ${loose.length} 张散牌收进这一叠`}
                  onClick={() => onAction(gatherAction(objects, pileTargets[0], loose))}
                >
                  <Group className="size-3.5" />收进选中容器（{loose.length} 张）
                </Button>
              )}
              {!container && firstPile && kinds.has("card") && (
                <Button size="xs" variant="outline" className="gap-1" onClick={() => onAction(gatherAction(objects, firstPile.id))}>
                  <Group className="size-3.5" />收进牌堆
                </Button>
              )}
              {loose.length >= 2 && (
                <Button
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  title="按牌面分堆：同名的合成一叠，扑克按花色分叠"
                  onClick={() => onAction(splitPilesAction(objects, loose))}
                >
                  <Layers className="size-3.5" />按牌面分堆（{loose.length} 张）
                </Button>
              )}
              {kinds.has("card") && !inHand && (
                <Button size="xs" variant="outline" className="gap-1" title="翻面（T）" onClick={() => onAction({ t: "flip", ids: cards })}>
                  <FlipVertical2 className="size-3.5" />翻面
                </Button>
              )}
            </Section>
          )}

          {tide && (
            <Section label={`潮汐 · 这 ${tideSpecs.length} 张怎么拆`}>
              {tide.tooMany ? (
                <span className="panel-title inline-flex min-w-0 items-start gap-1 text-muted-foreground">
                  <Waves className="size-3 shrink-0" />{describeTide(tide)}
                </span>
              ) : (
                <>
                  <span className="panel-title inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5">最高 {tide.total} 分</span>
                  {tide.groups.map((g, i) => (
                    <span key={i} className="panel-title inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-muted-foreground">
                      <span className="inline-block size-2 rounded-[2px] border border-dashed" style={{ borderColor: g.cards[0]?.color }} />
                      {groupText(g)}
                    </span>
                  ))}
                  {tide.loose > 0 && (
                    <span className="panel-title inline-flex items-center gap-1 text-muted-foreground">散 {tide.loose} 张不计分</span>
                  )}
                  {tide.truncated && (
                    <span className="panel-title inline-flex items-center gap-1 text-muted-foreground">牌太多，这个拆法未必最优</span>
                  )}
                </>
              )}
            </Section>
          )}

          {backed.length > 0 && !gaming && (
            <Section label={backed.length > 1 ? `卡背 · 选中的 ${backed.length} 处` : "卡背"}>
              {CARD_BACKS.map((b) => (
                <Button key={b} size="xs" variant="outline" title={`统一换成${CARD_BACK_NAMES[b] ?? b}纹样`} onClick={() => onAction(backSetAction(backed, null, b))}>
                  {CARD_BACK_NAMES[b] ?? b}
                </Button>
              ))}
              <Button size="xs" variant="outline" className="gap-1" disabled={!!backBusy} onClick={() => backFile.current?.click()}>
                <ImagePlus className="size-3" />{backBusy || "自定义图"}
              </Button>
              <input
                ref={backFile}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void applyBackImage(f);
                }}
              />
              <Button size="xs" variant="outline" title="清掉自定义图片，各回各的内置纹样" onClick={() => onAction(backSetAction(backed, null))}>
                恢复内置
              </Button>
            </Section>
          )}

          {zone && (
            <Section label={names}>
              {zone.owner === me.id ? (
                <>
                  <Button size="xs" variant={zone.pref ? "default" : "outline"} className="gap-1" title="摸牌与打手牌默认落到这里" onClick={() => onAction(zonePrefAction(zone, !zone.pref))}>
                    <Star className="size-3.5" />
                    {zone.pref ? "首选落牌区" : "设为首选"}
                  </Button>
                  {/* 攻防范围是座位规则，一块实心垫子不掺和这事，别让它占着两格 */}
                  {!zone.zone?.pad && (
                    <>
                      {/* 座位攻防：绕桌一圈数座位，攻是数到第几家打得着，守是别人数到你时多算几家 */}
                      <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="进攻范围：绕桌数到第几家以内打得着。空手 1 家只够左右邻座，武器与 -1 马都算在这档位上">
                        <span className="panel-title px-0.5">攻</span>
                        <Button size="xs" variant="ghost" title="进攻范围减一家" disabled={(zone.zone?.reach ?? REACH_DEFAULT) <= REACH_MIN} onClick={() => onAction(zoneRangeAction(zone, "reach", -1))}>
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="min-w-9 text-center font-mono text-[10px]">{zone.zone?.reach ?? REACH_DEFAULT} 家</span>
                        <Button size="xs" variant="ghost" title="进攻范围加一家" disabled={(zone.zone?.reach ?? REACH_DEFAULT) >= REACH_MAX} onClick={() => onAction(zoneRangeAction(zone, "reach", 1))}>
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="防御范围：别人数到你时多算几家，+1 马那一档；自己打别人不吃这个数">
                        <span className="panel-title px-0.5">守</span>
                        <Button size="xs" variant="ghost" title="防御范围减一家" disabled={(zone.zone?.guard ?? GUARD_MIN) <= GUARD_MIN} onClick={() => onAction(zoneRangeAction(zone, "guard", -1))}>
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="min-w-9 text-center font-mono text-[10px]">+{zone.zone?.guard ?? GUARD_MIN} 家</span>
                        <Button size="xs" variant="ghost" title="防御范围加一家" disabled={(zone.zone?.guard ?? GUARD_MIN) >= GUARD_MAX} onClick={() => onAction(zoneRangeAction(zone, "guard", 1))}>
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <span className="panel-title inline-flex items-center gap-1 text-muted-foreground">
                  <Lock className="size-3" />
                  {present && zone.owner && !present.has(zone.owner) ? "主人已离线" : present && zone.zone?.pad ? "他人垫子" : "他人区域"}
                </span>
              )}
              <Button size="xs" variant="outline" className="gap-1" title="把区域里摊着的牌按格子重排一遍" onClick={() => onAction(tidyAction(state, zone))}>
                <List className="size-3.5" />摊齐本区
              </Button>
              {/* 垫面图：换一张或撤掉回到纯色。位置与大小原样不动，只换垫面那层皮。换皮是摆桌子的活，游戏模式里收起来 */}
              {zone.zone?.pad && zone.owner === me.id && !gaming && (
                <>
                  <input ref={padFile} type="file" accept="image/*" className="hidden" onChange={(e) => void swapPadImage(e.target.files)} />
                  <Button size="xs" variant="outline" className="gap-1" disabled={!!padBusy} title="挑一张图铺在垫面上，按 cover 裁满" onClick={() => padFile.current?.click()}>
                    <ImagePlus className="size-3.5" />
                    {padBusy || (zone.zone.img ? "换垫面图" : "导入图片当垫面")}
                  </Button>
                  {!!zone.zone.img && (
                    <Button size="xs" variant="outline" className="gap-1" title="撤掉垫面图，回到纯色垫子" onClick={() => { const a = padImageAction(zone, ""); if (a) onAction(a); }}>
                      <RotateCcw className="size-3.5" />撤掉垫面图
                    </Button>
                  )}
                  {padErr && <span className="w-full text-[10px] leading-snug text-destructive">{padErr}</span>}
                </>
              )}
              {/* 长宽各一档一档调：只有等比缩放的话，永远拉不出一条狭长的落牌带 */}
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">宽</span>
                <Button size="xs" variant="ghost" title="区域变窄" disabled={!!zone.zone && zone.zone.w <= ZONE_MIN + 0.001} onClick={() => onAction(zoneResizeAction(zone, -0.06, 0))}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{zone.zone ? `${Math.round(zone.zone.w * 100)}cm` : "区域"}</span>
                <Button size="xs" variant="ghost" title="区域变宽" disabled={!!zone.zone && zone.zone.w >= ZONE_MAX - 0.001} onClick={() => onAction(zoneResizeAction(zone, 0.06, 0))}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">深</span>
                <Button size="xs" variant="ghost" title="区域变浅" disabled={!!zone.zone && zone.zone.d <= ZONE_MIN + 0.001} onClick={() => onAction(zoneResizeAction(zone, 0, -0.06))}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{zone.zone ? `${Math.round(zone.zone.d * 100)}cm` : "区域"}</span>
                <Button size="xs" variant="ghost" title="区域变深" disabled={!!zone.zone && zone.zone.d >= ZONE_MAX - 0.001} onClick={() => onAction(zoneResizeAction(zone, 0, 0.06))}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <label className="flex items-center gap-1">
                <span className="panel-title">区域名</span>
                <Input
                  key={zone.id}
                  defaultValue={zone.label ?? ""}
                  maxLength={12}
                  className="h-7 w-24 text-xs"
                  aria-label="区域名称"
                  {...nameProps}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== (zone.label ?? "")) onAction({ t: "label", id: zone.id, label: v });
                  }}
                />
              </label>
            </Section>
          )}

          {stat && (
            <Section label="统计垫">
              <span className="panel-title inline-flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                竖放 {statCards(state, stat).up} · 横放 {statCards(state, stat).side}
              </span>
              <Button size="xs" variant="outline" className="gap-1" title="锁定后无法选中，只能点垫子角上的解锁按钮" onClick={() => onAction(padLockAction(stat, true))}>
                <Lock className="size-3.5" />锁定
              </Button>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">宽</span>
                <Button size="xs" variant="ghost" title="垫子变窄" disabled={!!stat.stat && stat.stat.w <= STAT_MIN + 0.001} onClick={() => onAction(statResizeAction(stat, -0.06, 0))}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{stat.stat ? `${Math.round(stat.stat.w * 100)}cm` : "统计垫"}</span>
                <Button size="xs" variant="ghost" title="垫子变宽" disabled={!!stat.stat && stat.stat.w >= STAT_MAX - 0.001} onClick={() => onAction(statResizeAction(stat, 0.06, 0))}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">深</span>
                <Button size="xs" variant="ghost" title="垫子变浅" disabled={!!stat.stat && stat.stat.d <= STAT_MIN + 0.001} onClick={() => onAction(statResizeAction(stat, 0, -0.06))}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{stat.stat ? `${Math.round(stat.stat.d * 100)}cm` : "统计垫"}</span>
                <Button size="xs" variant="ghost" title="垫子变深" disabled={!!stat.stat && stat.stat.d >= STAT_MAX - 0.001} onClick={() => onAction(statResizeAction(stat, 0, 0.06))}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <label className="flex items-center gap-1">
                <span className="panel-title">垫名</span>
                <Input
                  key={stat.id}
                  defaultValue={stat.label ?? ""}
                  maxLength={12}
                  className="h-7 w-24 text-xs"
                  aria-label="统计垫名称"
                  {...nameProps}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== (stat.label ?? "")) onAction({ t: "label", id: stat.id, label: v });
                  }}
                />
              </label>
            </Section>
          )}

          {mat && (
            <Section label="桌垫">
              <span className="panel-title inline-flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                {matSize && `${Math.round(matSize.w * 100)} × ${Math.round(matSize.d * 100)}cm`}
              </span>
              <Button size="xs" variant="outline" className="gap-1" title="锁定后这张垫子谁都点不中，只能点它角上的解锁按钮" onClick={() => onAction(padLockAction(mat, true))}>
                <Lock className="size-3.5" />锁定
              </Button>
            </Section>
          )}

          {strip && (
            <Section label="卡槽带">
              <span className="panel-title inline-flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                占了 {slotCards(state, strip).length} / {(strip.slot?.n ?? 3)} 格
              </span>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                {/* 格数是这条带子的规格，游戏模式里只报数不给改 */}
                {!gaming && (
                  <Button size="xs" variant="ghost" title="少一格" disabled={!!strip.slot && strip.slot.n <= SLOT_MIN} onClick={() => onAction(slotResizeAction(strip, -1))}>
                    <Minus className="size-3.5" />
                  </Button>
                )}
                <span className="min-w-10 text-center font-mono text-[10px]">{strip.slot?.n ?? 3} 格</span>
                {!gaming && (
                  <Button size="xs" variant="ghost" title="多一格" disabled={!!strip.slot && strip.slot.n >= SLOT_MAX} onClick={() => onAction(slotResizeAction(strip, 1))}>
                    <Plus className="size-3.5" />
                  </Button>
                )}
              </div>
              <Button size="xs" variant="outline" className="gap-1" title="把带子上的牌按原来的先后重排一遍" onClick={() => onAction(tidyAction(state, strip))}>
                <List className="size-3.5" />摊齐
              </Button>
              <label className="flex items-center gap-1">
                <span className="panel-title">带名</span>
                <Input
                  key={strip.id}
                  defaultValue={strip.label ?? ""}
                  maxLength={12}
                  className="h-7 w-24 text-xs"
                  aria-label="卡槽带名称"
                  {...nameProps}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== (strip.label ?? "")) onAction({ t: "label", id: strip.id, label: v });
                  }}
                />
              </label>
            </Section>
          )}

          {dial && spin && (
            <Section label="转盘">
              <Button size="xs" variant="outline" className="gap-1" title="随机停一格：落点由你算好，别人只看同一段减速动画（双击转盘也行）" onClick={() => onAction(spinAction(dial))}>
                <Disc3 className="size-3.5" />拨一下
              </Button>
              <span className="panel-title inline-flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                {spin.value === undefined ? "还没拨过" : `指针停在第 ${spin.value + 1} 格`}
              </span>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">格数</span>
                {!gaming && (
                  <Button size="xs" variant="ghost" title="少一格" disabled={spin.n <= SPIN_MIN} onClick={() => onAction(spinSetAction(dial, -1))}>
                    <Minus className="size-3.5" />
                  </Button>
                )}
                <span className="min-w-10 text-center font-mono text-[10px]">{spin.n} 等分</span>
                {!gaming && (
                  <Button size="xs" variant="ghost" title="多一格" disabled={spin.n >= SPIN_MAX} onClick={() => onAction(spinSetAction(dial, 1))}>
                    <Plus className="size-3.5" />
                  </Button>
                )}
              </div>
            </Section>
          )}

          {rail && track && (
            <Section label="计分轨">
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">格数</span>
                {!gaming && (
                  <Button size="xs" variant="ghost" title="少一格" disabled={track.n <= TRACK_MIN} onClick={() => onAction(trackSetAction(rail, -1))}>
                    <Minus className="size-3.5" />
                  </Button>
                )}
                <span className="min-w-10 text-center font-mono text-[10px]">{track.n} 格</span>
                {!gaming && (
                  <Button size="xs" variant="ghost" title="多一格" disabled={track.n >= TRACK_MAX} onClick={() => onAction(trackSetAction(rail, 1))}>
                    <Plus className="size-3.5" />
                  </Button>
                )}
              </div>
              {track.marks.length === 0 && (
                <span className="panel-title text-[10px] text-muted-foreground">还没有人上场：点「我上场」就把棋子摆在起点那一格</span>
              )}
              {track.marks.map((m) => (
                <div key={m.by} className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                  <span className="size-2 shrink-0 rounded-full border border-black/50" style={{ background: m.color ?? "#efe7d6" }} aria-hidden />
                  <span className="max-w-16 truncate text-[10px] leading-none">{m.name || "某人"}</span>
                  <Button size="xs" variant="ghost" title="退一分" disabled={m.at <= 0} onClick={() => onAction(markAction(rail, m.by, -1))}>
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="min-w-7 text-center font-mono text-[10px]">{m.at + 1}</span>
                  <Button size="xs" variant="ghost" title="加一分" disabled={m.at >= track.n - 1} onClick={() => onAction(markAction(rail, m.by, 1))}>
                    <Plus className="size-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" title="收走这枚棋子" onClick={() => onAction(markClearAction(rail, m.by))}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
              {offTrack.map((p) => (
                <Button
                  key={p.id}
                  size="xs"
                  variant={p.id === me.id ? "default" : "outline"}
                  className="gap-1"
                  title={`把${p.id === me.id ? "你的" : `${p.name}的`}棋子放到起点`}
                  onClick={() => onAction(markAction(rail, p.id, 0, p.name, p.color))}
                >
                  <Gauge className="size-3.5" />
                  {p.id === me.id ? "我上场" : `让 ${p.name.slice(0, 6)} 上场`}
                </Button>
              ))}
              <Button size="xs" variant="outline" className="gap-1" disabled={!track.marks.some((m) => m.at !== 0)} title="所有人的棋子退回起点" onClick={() => onAction(markClearAction(rail))}>
                <RotateCcw className="size-3.5" />全员归零
              </Button>
              <label className="flex items-center gap-1">
                <span className="panel-title">轨名</span>
                <Input
                  key={rail.id}
                  defaultValue={rail.label ?? ""}
                  maxLength={12}
                  className="h-7 w-24 text-xs"
                  aria-label="计分轨名称"
                  {...nameProps}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== (rail.label ?? "")) onAction({ t: "label", id: rail.id, label: v });
                  }}
                />
              </label>
            </Section>
          )}

          {screen && sd && (
            <Section label="牌屏">
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">屏宽</span>
                <Button size="xs" variant="ghost" title="窄一档 2cm：只挡一张牌" disabled={sd.w <= SHIELD_MIN + 0.001} onClick={() => onAction(shieldResizeAction(screen, -0.02))}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{Math.round(sd.w * 100)}cm</span>
                <Button size="xs" variant="ghost" title="宽一档 2cm：摊一排也盖得住" disabled={sd.w >= SHIELD_MAX - 0.001} onClick={() => onAction(shieldResizeAction(screen, 0.02))}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">屏高</span>
                <Button size="xs" variant="ghost" title="矮一档 2cm" disabled={sd.h <= SHIELD_H_MIN + 0.001} onClick={() => onAction(shieldResizeAction(screen, 0, -0.02))}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{Math.round(sd.h * 100)}cm</span>
                <Button size="xs" variant="ghost" title="高一档 2cm：坐得远也遮得住" disabled={sd.h >= SHIELD_H_MAX - 0.001} onClick={() => onAction(shieldResizeAction(screen, 0, 0.02))}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <label className="flex items-center gap-1">
                <span className="panel-title">屏名</span>
                <Input
                  key={screen.id}
                  defaultValue={screen.label ?? ""}
                  maxLength={8}
                  className="h-7 w-24 text-xs"
                  aria-label="牌屏背面印的名字"
                  {...nameProps}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (screen.label ?? "")) onAction({ t: "label", id: screen.id, label: v });
                  }}
                />
              </label>
              <span className="text-[10px] leading-snug text-muted-foreground">
                只有屏前 {Math.round(SHIELD_BAND * 100)}cm 那一窄条（主人这一侧）算躲在屏后，条外的牌照旧给全桌看。
                改屏名就是改屏背面印的字，别人一眼知道这块屏是谁的。
              </span>
            </Section>
          )}

          {tray && td && (
            <Section label="骰盘">
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">盘宽</span>
                <Button size="xs" variant="ghost" title="窄一档 4cm" disabled={!trayResizeAction(tray, -0.04, 0)} onClick={() => { const a = trayResizeAction(tray, -0.04, 0); if (a) onAction(a); }}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{Math.round(td.w * 100)}cm</span>
                <Button size="xs" variant="ghost" title="宽一档 4cm" disabled={!trayResizeAction(tray, 0.04, 0)} onClick={() => { const a = trayResizeAction(tray, 0.04, 0); if (a) onAction(a); }}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">盘深</span>
                <Button size="xs" variant="ghost" title="浅一档 4cm" disabled={!trayResizeAction(tray, 0, -0.04)} onClick={() => { const a = trayResizeAction(tray, 0, -0.04); if (a) onAction(a); }}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{Math.round(td.d * 100)}cm</span>
                <Button size="xs" variant="ghost" title="深一档 4cm" disabled={!trayResizeAction(tray, 0, 0.04)} onClick={() => { const a = trayResizeAction(tray, 0, 0.04); if (a) onAction(a); }}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <span className="text-[10px] leading-snug text-muted-foreground">
                盘腔 {Math.round(td.w * 100)}×{Math.round(td.d * 100)}cm。骰子在盘里掷，撞在矮壁上不会滚出盘外；端起盘子，盘里的骰子跟着一起走。
              </span>
              {(() => {
                const inTray = diceInTray(state, tray);
                return (
                  <Button size="xs" variant="outline" className="shrink-0 gap-1" disabled={!inTray.length} title={inTray.length ? `把盘里这 ${inTray.length} 枚骰子一起重掷` : "盘里还没有骰子，先丢几枚进来"} onClick={() => onRoll(inTray)}>
                    <Dices className="size-3.5" />摇一摇（{inTray.length} 枚）
                  </Button>
                );
              })()}
            </Section>
          )}

          {glass && hs && (
            <Section label="沙漏">
              <Button
                size="xs"
                variant="outline"
                className="gap-1"
                title={hs.at === null ? "翻过来就起算（双击沙漏也行）" : "按回去停住：沙子重新装满，再翻过来是完整的一漏"}
                onClick={() => onAction(hourFlipAction(glass))}
              >
                <FlipVertical2 className="size-3.5" />
                {hs.at === null ? "翻过来起算" : hourDone(glass) ? "漏完了，按回去" : "按回去停住"}
              </Button>
              <span className="panel-title inline-flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                {hs.at === null ? `${mmss(hs.mins * 60)} 静止中` : hourDone(glass) ? "沙子漏完了" : `还剩 ${mmss(hourLeft(glass))}`}
              </span>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="换档位就把沙子重新装满，不会留半漏在中间">
                <span className="panel-title px-0.5">一漏</span>
                <Button size="xs" variant="ghost" title="少一分钟" disabled={hs.mins <= HOUR_MIN} onClick={() => onAction(hourSetAction(glass, -1))}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{hs.mins} 分钟</span>
                <Button size="xs" variant="ghost" title="多一分钟" disabled={hs.mins >= HOUR_MAX} onClick={() => onAction(hourSetAction(glass, 1))}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <span className="text-[10px] leading-snug text-muted-foreground">
                沙漏只有「翻过来漏」和「按回去停」两态，没有暂停一半的说法；要精确读秒、随时停顿，用桌面那个计时器。
                漏到底会响铃提醒下一个人，按回去就重新装满。
              </span>
            </Section>
          )}

          {tome && bk && (
            <Section label="规则书">
              <Button size="xs" variant="outline" className="gap-1" disabled={bk.page <= 0} title="上一页" onClick={() => onAction(bookPageAction(tome, -1))}>
                <ChevronLeft className="size-3.5" />上一页
              </Button>
              <span className="panel-title inline-flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                第 {bk.page + 1}/{bk.pages.length} 页
              </span>
              <Button size="xs" variant="outline" className="gap-1" disabled={bk.page >= bk.pages.length - 1} title="下一页（双击书面也翻页）" onClick={() => onAction(bookPageAction(tome, 1))}>
                下一页<ChevronRight className="size-3.5" />
              </Button>
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <span className="panel-title px-0.5">页数</span>
                {!gaming && (
                  <Button size="xs" variant="ghost" title="撕掉最后一页" disabled={bk.pages.length <= 1} onClick={() => onAction(bookPagesAction(tome, -1))}>
                    <Minus className="size-3.5" />
                  </Button>
                )}
                <span className="min-w-10 text-center font-mono text-[10px]">{bk.pages.length} 页</span>
                {!gaming && (
                  <Button size="xs" variant="ghost" title="再添一页" disabled={bk.pages.length >= BOOK_PAGE_MAX} onClick={() => onAction(bookPagesAction(tome, 1))}>
                    <Plus className="size-3.5" />
                  </Button>
                )}
              </div>
              {!gaming && (
              <label className="flex min-w-0 flex-col gap-1">
                <span className="panel-title">改写第 {bk.page + 1} 页（{BOOK_CHARS} 字以内）</span>
                <Textarea
                  key={`${tome.id}:${bk.page}`}
                  defaultValue={bk.pages[bk.page] ?? ""}
                  maxLength={BOOK_CHARS}
                  rows={3}
                  className="min-w-40 shrink-0 resize-none px-2 py-1 text-xs leading-snug"
                  aria-label="本页内容"
                  placeholder="第一行建议当页名，比如「房规」"
                  onBlur={(e) => {
                    const text = e.target.value;
                    if (text === (bk.pages[bk.page] ?? "")) return;
                    onAction(bookWriteAction(tome, bk.pages.map((p, i) => (i === bk.page ? text : p)), bk.page));
                  }}
                />
              </label>
              )}
              <span className="text-[10px] leading-snug text-muted-foreground">
                书页上印的就是这一页的字，全桌翻到同一页；改完点别处就写进书面。加减页只动最后那一张，正翻着的那页尽量留在原地。
              </span>
            </Section>
          )}

          {deck && dg && (
            <Section label="唱片机">
              <input ref={clipFile} type="file" accept="audio/*" className="hidden" onChange={(e) => void uploadClip(e.target.files)} />
              {/* 上片与抽片都是开桌前的活，游戏模式里这台机器只留给放停与音量 */}
              {!gaming && (
                <Button
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  disabled={!!clipBusy}
                  title={`挑一首曲子刻成唱片：mp3、ogg、wav、m4a 都照原样存，${Math.round(CLIP_MAX_BYTES / 1048576)}MB 以内`}
                  onClick={() => clipFile.current?.click()}
                >
                  <Upload className="size-3.5" />
                  {clipBusy || (dg.clip ? "换一张唱片" : "上传音频")}
                </Button>
              )}
              {clipErr && <span className="w-full text-[10px] leading-snug text-destructive">{clipErr}</span>}
              {dg.clip && (
                <Button size="xs" variant="outline" className="gap-1" title={dg.playing ? "按住：位置记下来，下次接着唱" : "接着唱：从记下的这一秒起"} onClick={() => onAction(gramPlayAction(deck, !dg.playing))}>
                  {dg.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {dg.playing ? "按住" : "放起来"}
                </Button>
              )}
              {dg.clip && !gaming && (
                <Button size="xs" variant="outline" className="gap-1" title="抽出唱片：机器就空了，别人那台机器上的曲子也一起停" onClick={() => { onAction(gramLoadAction(deck, null)); setScrub(null); }}>
                  <Eject className="size-3.5" />抽出唱片
                </Button>
              )}
              {dg.clip && dg.dur > 0 && (
                <div className="flex w-full min-w-0 items-center gap-1.5">
                  <span className="panel-title shrink-0 font-mono text-[10px]">{mmss(head)}</span>
                  <input
                    key={deck.id}
                    type="range"
                    min={0}
                    max={Math.round(dg.dur * 10) / 10}
                    step={0.1}
                    value={Math.min(scrub ?? head, dg.dur)}
                    onChange={(e) => setScrub(Number(e.target.value))}
                    onPointerUp={commitScrub}
                    onBlur={commitScrub}
                    className="min-w-0 flex-1 accent-primary"
                    aria-label="唱片进度"
                  />
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{mmss(dg.dur)}</span>
                </div>
              )}
              {dg.clip && dg.dur > 0 && (
                <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="挪十秒：拖滑条嫌粗的时候用">
                  <span className="panel-title px-0.5">挪</span>
                  <Button size="xs" variant="ghost" title="倒退十秒" onClick={() => onAction(gramNudgeAction(deck, -10))}>
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <Button size="xs" variant="ghost" title="快进十秒" onClick={() => onAction(gramNudgeAction(deck, 10))}>
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
              {dg.clip && (
                <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="这台机器对着全桌的音量，人人都听得见这一个值">
                  <span className="panel-title flex items-center gap-0.5 px-0.5"><Volume2 className="size-3" />音量</span>
                  <Button size="xs" variant="ghost" title="小一格" disabled={dg.vol <= 0} onClick={() => onAction(gramVolAction(deck, -0.1))}>
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="min-w-10 text-center font-mono text-[10px]">{Math.round(dg.vol * 100)}%</span>
                  <Button size="xs" variant="ghost" title="大一格" disabled={dg.vol >= 1} onClick={() => onAction(gramVolAction(deck, 0.1))}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              )}
              {dg.clip && (
                <Button size="xs" variant={dg.loop ? "default" : "outline"} className="gap-1" title="开着就唱完一圈落回外圈接着唱，关着就唱到结尾停下" onClick={() => onAction(gramLoopAction(deck, !dg.loop))}>
                  <Repeat className="size-3.5" />{dg.loop ? "循环中" : "唱完就停"}
                </Button>
              )}
              {dg.clip && !gaming && (
                <label className="flex min-w-40 flex-1 items-center gap-1">
                  <span className="panel-title shrink-0">铭牌</span>
                  <Input
                    key={`${deck.id}:${tune}`}
                    defaultValue={dg.name}
                    maxLength={GRAM_NAME_MAX}
                    className="min-w-0 flex-1 px-2 py-0.5 text-xs"
                    aria-label="曲名"
                    placeholder="这张片子叫什么"
                    onBlur={(e) => onAction(gramRenameAction(deck, e.target.value))}
                  />
                </label>
              )}
              {tune && clipMissing(tune) && (
                <Button size="xs" variant="outline" className="gap-1" title="这张唱片在这台机器上没取到，再去拿一次" onClick={() => retryClip(tune)}>
                  <RefreshCw className="size-3.5" />再取一次
                </Button>
              )}
              {dg.playing && audioBlocked() && (
                <Button size="xs" className="gap-1" title="浏览器要先听到这一下才肯出声" onClick={unlockAudio}>
                  <Volume2 className="size-3.5" />放行声音
                </Button>
              )}
              <Button
                size="xs"
                variant="outline"
                className="gap-1"
                title="只关这台机器的嗓子，桌上那个音量钮是所有人共享的"
                onClick={() => setAudioMuted(!audioMuted())}
              >
                {audioMuted() ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                {audioMuted() ? "本机静音中" : "本机出声"}
              </Button>
              <span className="w-full text-[10px] leading-snug text-muted-foreground">
                放什么、停在哪、第几秒都是桌上共享的一份状态：谁按的都是同一台机器，进度由各台自己按墙钟推，不往桌上回写。
                曲子原样存字节，什么格式都交给这台浏览器自己放；换片一律从头起。
              </span>
            </Section>
          )}

          {walkman && pm && (
            <Section label="随身听">
              <input ref={songFile} type="file" accept="audio/*" className="hidden" onChange={(e) => void loadSong(e.target.files)} />
              {/* 刻歌与换歌、共享与收回都是开桌前的活；游戏模式里这台机器只留给放停与音量 */}
              {hoster && !gaming && (
                <Button
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  disabled={!!songBusy}
                  title={`从你自己电脑里挑一首歌刻进机器：${Math.round(CLIP_MAX_BYTES / 1048576)}MB 以内，字节只留在这台电脑上，不上传服务器`}
                  onClick={() => songFile.current?.click()}
                >
                  <Upload className="size-3.5" />
                  {songBusy || (pm.clip ? "换一首歌" : "刻一首本机的歌")}
                </Button>
              )}
              {songErr && <span className="w-full text-[10px] leading-snug text-destructive">{songErr}</span>}
              {!pm.clip && (
                <span className="w-full text-[10px] leading-snug text-muted-foreground">
                  {hoster
                    ? "这台机器还空着：点上面那一下，从自己电脑里挑一首歌刻进去，就先只在你自己这儿响。"
                    : `歌在${songOwner || "摆它的人"}自己电脑上，等他刻一首上来、再共享给全桌。`}
                </span>
              )}
              {pm.clip && !tuneIn && (
                <div className="flex w-full flex-wrap items-center gap-1">
                  <span className="w-full text-[10px] leading-snug text-muted-foreground">
                    {songOwner
                      ? `这首歌的字节还在${songOwner}的电脑上：跟他要一份才放得动，服务器那边没存过它。`
                      : "本机缓存里已经没有这首歌了，请摆它的人重新刻一首。"}
                  </span>
                  {songOwner && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1"
                      title="向他那台机器求这首歌：一段一段递过来，递完就各自放着"
                      onClick={() => { unlockAudio(); onAskTrack(songBy, songCode); }}
                    >
                      <Download className="size-3.5" />
                      {fetching && !fetching.failed && fetching.total ? `取歌中 ${fetching.got}/${fetching.total} 段` : fetching && !fetching.failed ? "取歌中" : "取这首歌"}
                    </Button>
                  )}
                  {songOwner && fetching?.failed && (
                    <Button size="xs" variant="outline" className="gap-1" title="上一轮没取齐：再朝他那台机器求一次" onClick={() => retryTrack(songCode)}>
                      <RefreshCw className="size-3.5" />再取一次
                    </Button>
                  )}
                </div>
              )}
              {pm.clip && tuneIn && !pm.shared && (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    className="gap-1"
                    title={localPlaying(walkman) ? "按住本机这一台：位置记着，下次接着放" : "放起来：只有这台电脑听得到"}
                    onClick={() => { unlockAudio(); localToggle(walkman); }}
                  >
                    {localPlaying(walkman) ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    {localPlaying(walkman) ? "按住" : "放起来"}
                  </Button>
                  {pm.dur > 0 && (
                    <div className="flex w-full min-w-0 items-center gap-1.5">
                      <span className="panel-title shrink-0 font-mono text-[10px]">{mmss(pHead)}</span>
                      <input
                        key={`${walkman.id}:p`}
                        type="range"
                        min={0}
                        max={Math.round(pm.dur * 10) / 10}
                        step={0.1}
                        value={Math.min(pHead, pm.dur)}
                        onChange={(e) => setPscrub(Number(e.target.value))}
                        onPointerUp={commitLocal}
                        onBlur={commitLocal}
                        className="min-w-0 flex-1 accent-primary"
                        aria-label="本机进度"
                      />
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{mmss(pm.dur)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="本机音量：只关这台电脑的嗓子，别人听不着">
                    <span className="panel-title flex items-center gap-0.5 px-0.5"><Volume2 className="size-3" />本机</span>
                    <Button size="xs" variant="ghost" title="小一格" disabled={localVol(walkman) <= 0} onClick={() => localSetVol(walkman, localVol(walkman) - 0.1)}>
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="min-w-10 text-center font-mono text-[10px]">{Math.round(localVol(walkman) * 100)}%</span>
                    <Button size="xs" variant="ghost" title="大一格" disabled={localVol(walkman) >= 1} onClick={() => localSetVol(walkman, localVol(walkman) + 0.1)}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  <Button size="xs" variant={localLoop(walkman) ? "default" : "outline"} className="gap-1" title="本机这一档放完要不要接着放" onClick={() => localSetLoop(walkman, !localLoop(walkman))}>
                    <Repeat className="size-3.5" />{localLoop(walkman) ? "本机循环中" : "本机放完就停"}
                  </Button>
                  {hoster && !gaming && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1"
                      title="共享出去：进度写上桌面，全桌一起按同一台机器；他们那台机器会向你求这首歌"
                      onClick={() => { dropLocal(walkman.id); onAction(mp3ShareAction(walkman, true, localPos(walkman))); }}
                    >
                      <Share2 className="size-3.5" />共享给全桌一起听
                    </Button>
                  )}
                </>
              )}
              {pm.clip && pm.shared && (
                <>
                  <Button size="xs" variant="outline" className="gap-1" title={pm.playing ? "按住：位置记下来，下次接着放" : "接着放：从记下的这一秒起"} onClick={() => { unlockAudio(); onAction(mp3PlayAction(walkman, !pm.playing)); }}>
                    {pm.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    {pm.playing ? "按住" : "放起来"}
                  </Button>
                  {hoster && !gaming && (
                    <Button size="xs" variant="outline" className="gap-1" title="收回私人：全桌当场停住，这台机器又只归你自己听" onClick={() => { onAction(mp3ShareAction(walkman, false)); dropLocal(walkman.id); }}>
                      <Radio className="size-3.5" />收回自己听
                    </Button>
                  )}
                  {pm.dur > 0 && tuneIn && (
                    <div className="flex w-full min-w-0 items-center gap-1.5">
                      <span className="panel-title shrink-0 font-mono text-[10px]">{mmss(mHead)}</span>
                      <input
                        key={`${walkman.id}:m`}
                        type="range"
                        min={0}
                        max={Math.round(pm.dur * 10) / 10}
                        step={0.1}
                        value={Math.min(mHead, pm.dur)}
                        onChange={(e) => setMscrub(Number(e.target.value))}
                        onPointerUp={commitShared}
                        onBlur={commitShared}
                        className="min-w-0 flex-1 accent-primary"
                        aria-label="共享进度"
                      />
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{mmss(pm.dur)}</span>
                    </div>
                  )}
                  {tuneIn && (
                    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="这一桌人一起听，所以这个音量是公用的">
                      <span className="panel-title flex items-center gap-0.5 px-0.5"><Volume2 className="size-3" />全桌</span>
                      <Button size="xs" variant="ghost" title="小一格" disabled={pm.vol <= 0} onClick={() => onAction(mp3VolAction(walkman, -0.1))}>
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="min-w-10 text-center font-mono text-[10px]">{Math.round(pm.vol * 100)}%</span>
                      <Button size="xs" variant="ghost" title="大一格" disabled={pm.vol >= 1} onClick={() => onAction(mp3VolAction(walkman, 0.1))}>
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  )}
                  {tuneIn && (
                    <Button size="xs" variant={pm.loop ? "default" : "outline"} className="gap-1" title="开着就放到头接着放，关着就放到结尾停下" onClick={() => onAction(mp3LoopAction(walkman, !pm.loop))}>
                      <Repeat className="size-3.5" />{pm.loop ? "循环中" : "放完就停"}
                    </Button>
                  )}
                </>
              )}
              {pm.clip && tuneIn && hoster && !gaming && (
                <label className="flex min-w-40 flex-1 items-center gap-1">
                  <span className="panel-title shrink-0">铭牌</span>
                  <Input
                    key={`${walkman.id}:${pm.clip}`}
                    defaultValue={pm.name}
                    maxLength={MP3_NAME_MAX}
                    className="min-w-0 flex-1 px-2 py-0.5 text-xs"
                    aria-label="曲名"
                    placeholder="这首歌叫什么"
                    onBlur={(e) => onAction(mp3RenameAction(walkman, e.target.value))}
                  />
                </label>
              )}
              {pm.clip && tuneIn && hoster && !gaming && (
                <Button size="xs" variant="outline" className="gap-1" title="抽出这首歌：机器就空了，本机那份缓存还留着，下次还能刻上来" onClick={() => { onAction(mp3LoadAction(walkman, null)); dropLocal(walkman.id); setPscrub(null); setMscrub(null); }}>
                  <Eject className="size-3.5" />抽出这首歌
                </Button>
              )}
              <span className="w-full text-[10px] leading-snug text-muted-foreground">
                默认这台机器只在你自己电脑上响：走带参数一个都不写上桌面，别人那端只看得见「歌在谁那儿」。
                共享出去之后进度才算全桌那一份，而那首歌的字节是他那台电脑一段一段递过来的，服务器从头到尾没存过。
              </span>
            </Section>
          )}

          {tv && tb && (
            <Section label="平板浏览器">
              {/* 贴地址与关页面是摆桌子的活，游戏模式里这台机器只留给走带、重载与放大观看 */}
              {!gaming && (
                <div className="flex min-w-44 flex-1 items-center gap-1">
                  <Input
                    key={`${tv.id}:addr`}
                    ref={addrBox}
                    defaultValue=""
                    maxLength={TABLET_ADDR_MAX}
                    placeholder={tb.url ? "换个页面：贴网址，或 BV 号与整条 B 站链接" : "贴一条网址（http/https），或 B 站链接"}
                    className="h-7 min-w-0 flex-1 px-2 py-0.5 text-xs"
                    aria-label="网址"
                    onKeyDown={(e) => { if (e.key === "Enter") applyAddr(); }}
                  />
                  <Button size="xs" variant="outline" className="shrink-0 gap-1" title="认得出地址就贴上：是片子就立刻从第 0 秒起播，是网页就直接挂上屏，全桌跟着换" onClick={applyAddr}>
                    <MonitorPlay className="size-3.5" />{tb.url ? "换这一页" : "贴上"}
                  </Button>
                </div>
              )}
              {addrErr && <span className="w-full text-[10px] leading-snug text-destructive">{addrErr}</span>}
              {tb.url && (
                <span className="panel-title inline-flex max-w-full shrink-0 items-center gap-1 overflow-hidden text-ellipsis rounded-md border border-border/60 bg-black/25 px-1.5 py-0.5 font-mono text-[10px]" title={`这块屏现在挂着 ${tb.url}${bili ? `，第 ${tb.page} 集` : ""}；页面由每台浏览器自己找那个站点去取，服务器一个字节都不存`}>
                  {tabletHost(tb.url)}{bili ? ` · 第 ${tb.page} 集` : ""}
                </span>
              )}
              {bili && (
                <Button size="xs" variant="outline" className="gap-1" title={tb.playing ? "按住：位置记下来，下次从这一秒接着看" : "接着看：从记下的这一秒起"} onClick={() => onAction(tabletPlayAction(tv, !tb.playing))}>
                  {tb.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {tb.playing ? "按住" : "放起来"}
                </Button>
              )}
              {bili && (
                <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title="挪十秒：这边读不到那页播到第几秒，所以挪一下就把播放器重装到新的秒数上">
                  <span className="panel-title px-0.5">挪</span>
                  <Button size="xs" variant="ghost" title="倒退十秒" disabled={!tabletNudgeAction(tv, -10)} onClick={() => onAction(tabletNudgeAction(tv, -10))}>
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <Button size="xs" variant="ghost" title="快进十秒" disabled={!tabletNudgeAction(tv, 10)} onClick={() => onAction(tabletNudgeAction(tv, 10))}>
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
              {bili && (
                <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title={`分 P：这一部第几集，切集一律从第 0 秒起（最多 ${TABLET_PAGE_MAX} 集）`}>
                  <span className="panel-title px-0.5">第</span>
                  <Button size="xs" variant="ghost" title="上一集" disabled={!tabletPageAction(tv, -1)} onClick={() => onAction(tabletPageAction(tv, -1))}>
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="min-w-6 text-center font-mono text-[10px]">{tb.page}</span>
                  <Button size="xs" variant="ghost" title="下一集" disabled={!tabletPageAction(tv, 1)} onClick={() => onAction(tabletPageAction(tv, 1))}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              )}
              {bili && (
                <div className="flex items-center gap-1">
                  <span className="panel-title shrink-0">拨到</span>
                  <Input
                    ref={seekBox}
                    type="text"
                    inputMode="numeric"
                    defaultValue=""
                    maxLength={9}
                    placeholder="秒，或 1:23"
                    className="h-7 w-24 px-2 py-0.5 text-xs"
                    aria-label="拨到第几秒"
                    onKeyDown={(e) => { if (e.key === "Enter") applySeek(); }}
                  />
                  <Button size="xs" variant="outline" title={`跳到那一秒（当前 ${mmss(tvHead)}，最多 ${mmss(TABLET_POS_MAX)}）`} onClick={applySeek}>
                    跳
                  </Button>
                </div>
              )}
              {bili && (
                <Button size="xs" variant={tb.mute ? "default" : "outline"} className="gap-1" title="静音是全桌的：这块屏只有一条嗓子，按下去所有人都安静" onClick={() => onAction(tabletMuteAction(tv, !tb.mute))}>
                  {tb.mute ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                  {tb.mute ? "全桌静音中" : "全桌出声"}
                </Button>
              )}
              {tb.url && (
                <Button size="xs" variant="outline" className="gap-1" title="重新载入：地址一个字都没变也再挂一次——页面上点进去了、回不来了，就用这个退回桌上那一条" onClick={() => onAction(tabletReloadAction(tv))}>
                  <RefreshCw className="size-3.5" />重新载入
                </Button>
              )}
              {tb.url && (
                <Button size="xs" variant={touch === tv.id ? "default" : "outline"} className="gap-1"
                  title={touch === tv.id
                    ? "手离开屏幕：指针还给桌子，转视角、挪东西照旧。这一步只管你这台机器，别人那边一点不动"
                    : "上手摸这块屏：镜头凑到屏前，屏里的链接、按钮、进度条都归那个站点自己的页面。你点进去的东西同桌看不见——全桌同步的只有那一条地址与走带"}
                  onClick={() => onTouch(touch === tv.id ? null : tv.id)}>
                  <Hand className="size-3.5" />
                  {touch === tv.id ? "手离开屏幕" : "上手摸这块屏"}
                </Button>
              )}
              {tb.url && (
                <Button size="xs" variant="outline" className="gap-1" title="放大观看：把这块屏浮到桌面上来，页面自己的控件都能用（进度仍以桌上这一份为准）" onClick={() => onWatch(tv.id)}>
                  <Maximize2 className="size-3.5" />放大观看
                </Button>
              )}
              {!gaming && (
                <label className="flex min-w-40 flex-1 items-center gap-1">
                  <span className="panel-title shrink-0">屏名</span>
                  <Input
                    key={`${tv.id}:label`}
                    defaultValue={tv.label ?? ""}
                    maxLength={40}
                    className="min-w-0 flex-1 px-2 py-0.5 text-xs"
                    aria-label="屏名"
                    placeholder="这块屏叫什么"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (tv.label ?? "")) onAction({ t: "label", id: tv.id, label: v });
                    }}
                  />
                </label>
              )}
              {tb.url && !gaming && (
                <Button size="xs" variant="outline" className="gap-1" title="关掉页面：屏黑下去，进度一并抹平" onClick={() => { onAction(tabletClearAction(tv)); setAddrErr(""); }}>
                  <Eject className="size-3.5" />关掉这页
                </Button>
              )}
              <span className="w-full text-[10px] leading-snug text-muted-foreground">
                贴上去的只是一条地址：页面、字幕、弹幕都由这台浏览器自己找那个站点去取，服务器的字节一个都不碰，也只认 http/https 这一种地址。
                全桌同步的是「贴上来的这一条」与片子上那套走带（放、停、第几秒、第几集、静音、重新载入）；各端按同一时刻自己推现在的位置，不是一秒一次往桌上回写。
                想真的点屏里的东西就按「上手摸这块屏」：镜头凑到屏前，屏面那一片矩形里的点击与滚轮归那个站点，边框以外照旧是桌子；按「手离开屏幕」收回，Esc 也收回（鼠标已经落进页面里时 Esc 归那个页面，就用按钮收）。
                两处读不到：在屏里点开的链接、拖到的进度只有这台机器看得见，桌上不会跟着变——退回桌上那一条就按「重新载入」，对齐片子用「挪」或「拨到」；
                不少站点（银行、内网、大站的首页）不肯被嵌进来，那种页面只能是一片空白，到「放大观看」里用「新标签打开」。
              </span>
            </Section>
          )}

          {pointCtl && one && pointCtl.id === one.id && (
            <Section label="行棋点位">
              {pointCtl.list.length ? (
                <>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                      <Button size="icon-xs" variant="ghost" title="上一处落点（M）" onClick={() => pointCtl.cycle(-1)}>
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <span className="min-w-11 text-center font-mono text-[10px]">第 {pointCtl.cursor + 1} / {pointCtl.list.length}</span>
                      <Button size="icon-xs" variant="ghost" title="下一处落点（N）" onClick={() => pointCtl.cycle(1)}>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                    <Button size="xs" variant="outline" className="gap-1" title="走到亮着的那一格（回车）" onClick={() => pointCtl.place(pointCtl.list[pointCtl.cursor])}>
                      <CornerDownRight className="size-3.5" />{pointCtl.list[pointCtl.cursor]?.take ? "落这一格吃子" : "落这一格"}
                    </Button>
                  </div>
                  <span className="text-[10px] leading-snug text-muted-foreground">
                    盘上亮着的圈就是这一子走得进的格：绿圈是空位，红圈踩过去吃掉那枚。按 N/M 换一格（最大最亮的那圈就是当前这一处），回车、按「落这一格」，或者直接点亮着的格子都行。拖动照样能自由摆位。
                  </span>
                </>
              ) : (
                <span className="text-[10px] leading-snug text-muted-foreground">
                  这一子眼下没有走得进的格：路全被堵死了。照常拖动它还是摆得动，这一步不想走就先换一枚。
                </span>
              )}
            </Section>
          )}

          {(diceIds.length > 0 || allDice.length > 0) && (
            <Section label="骰子">
              {diceIds.length > 0 && (
                <Button size="xs" variant="outline" title="原地掷：不抛出去，就在这一格里滚出点数" onClick={() => onRoll(diceIds, 0)}>
                  原地掷
                </Button>
              )}
              {diceIds.length > 0 && (
                <Button size="xs" variant="outline" className="gap-1" title="甩开掷：抛出去，落到附近" onClick={() => onRoll(diceIds)}>
                  <Dices className="size-3.5" />甩开掷
                </Button>
              )}
              {allDice.length > 0 && (
                <Button size="xs" variant="outline" className="gap-1" title={`桌上共 ${allDice.length} 枚，一起掷`} onClick={() => onRoll(allDice.map((o) => o.id))}>
                  <Dices className="size-3.5" />掷全部骰子（{allDice.length} 枚）
                </Button>
              )}
            </Section>
          )}

          {one?.kind === "token" && (
            <Section label="计数">
              <div className="flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1">
                <Button size="xs" variant="ghost" onClick={() => onAction({ t: "count", id: one.id, delta: -1 })}>−1</Button>
                <span className="min-w-9 text-center font-mono text-xs">{one.count ?? 0}</span>
                <Button size="xs" variant="ghost" onClick={() => onAction({ t: "count", id: one.id, delta: 1 })}>+1</Button>
                <Button size="xs" variant="ghost" onClick={() => onAction({ t: "count", id: one.id, delta: 10 })}>+10</Button>
              </div>
            </Section>
          )}

          {one?.kind === "counter" && (() => {
            const ct = fixCounter(one.counter);
            const down = counterStepAction(one, -1);
            const up = counterStepAction(one, 1);
            return (
              <Section label="迷你计数器">
                <div className="flex flex-wrap items-center gap-1">
                  <div className="flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1">
                    {/* 到边界就收掉这颗键：读数已经 −9999 还摆一个按了没动静的减号，等于死按钮 */}
                    <Button size="xs" variant="ghost" className="min-w-9 px-1 font-mono" title={down ? `减 ${ct.step}` : `已经到底（${ct.v}），减不动了`} disabled={!down} onClick={() => { if (down) onAction(down); }}>
                      −{ct.step}
                    </Button>
                    <span className="min-w-9 text-center font-mono text-xs">{ct.v}</span>
                    <Button size="xs" variant="ghost" className="min-w-9 px-1 font-mono" title={up ? `加 ${ct.step}` : `已经到顶（${ct.v}），加不动了`} disabled={!up} onClick={() => { if (up) onAction(up); }}>
                      +{ct.step}
                    </Button>
                  </div>
                  <Input
                    key={one.id}
                    type="number"
                    defaultValue={ct.v}
                    className="h-7 w-20 font-mono text-xs"
                    aria-label="计数器读数"
                    {...nameProps}
                    onBlur={(e) => {
                      const a = counterSetAction(one, Number(e.target.value));
                      if (a) onAction(a);
                      else e.target.value = String(ct.v);
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">步进</span>
                  {gaming ? (
                    <span className="text-[10px] leading-snug text-muted-foreground">
                      现在是每按一下走 {ct.step}。{GAME_SHUT_HINT}
                    </span>
                  ) : (
                    <>
                      {COUNTER_STEPS.map((s) => {
                        const a = counterStepSetAction(one, s);
                        return (
                          <Button key={s} size="xs" variant={ct.step === s ? "secondary" : "outline"} className="min-w-7 px-1" disabled={!a} onClick={() => { if (a) onAction(a); }}>
                            {s}
                          </Button>
                        );
                      })}
                      <span className="text-[10px] leading-snug text-muted-foreground">每按一下走这么多，读数可以是负数</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {ct.host ? (
                    <>
                      <span className="text-[10px] text-muted-foreground">吸在宿主的</span>
                      {COUNTER_EDGE_NAMES.map((name, i) => {
                        const a = counterAttachAction(one, ct.host!, i as 0 | 1 | 2 | 3);
                        return (
                          <Button key={i} size="xs" variant={(ct.edge ?? 0) === i ? "secondary" : "outline"} className="min-w-8 px-1" disabled={!a} onClick={() => { if (a) onAction(a); }}>
                            {name}边
                          </Button>
                        );
                      })}
                      <Button size="xs" variant="outline" className="gap-1" title="脱附：留在原地不动，读数与步进都留着" onClick={() => { const a = counterAttachAction(one, null); if (a) onAction(a); }}>
                        <Eject className="size-3.5" />脱附
                      </Button>
                      <span className="text-[10px] leading-snug text-muted-foreground">
                        它已经归这张牌了：拖到别的牌上也会贴回来，抢不走。要换归属先按脱附，再拖到新牌边上。
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] leading-snug text-muted-foreground">
                      现在散在桌上：把它拖到任意一张卡牌边上就会吸上去，吸上就归那张牌——那张牌挪到哪儿它跟到哪儿，别的牌抢不走；拖到空处才散回来。
                    </span>
                  )}
                </div>
              </Section>
            );
          })()}

          {one?.kind === "board" && gridable(one) && (
            <Section label="棋盘网格">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* 三个开关是一层层往上加的：看得见线 → 落点吸进格 → 一手只许一子 */}
                <Button
                  size="xs"
                  variant={one.mesh !== false ? "secondary" : "outline"}
                  className="gap-1"
                  title={one.mesh === false ? "重新画出格线与星位" : "藏掉盘面的格线：格心还在，吸附与锁定照旧生效，只是眼睛看不见线"}
                  onClick={() => { const a = meshAction(one, one.mesh === false); if (a) onAction(a); }}
                >
                  <LayoutGrid className="size-3.5" />
                  {one.mesh === false ? "网格线已藏" : "网格线可见"}
                </Button>
                <span className="text-[10px] leading-snug text-muted-foreground">
                  {one.mesh === false ? "线藏了，盘上照样吸格、照样一格一子" : "关掉只影响外观，不影响落点"}
                </span>
                <Button
                  size="xs"
                  variant={one.snap !== false ? "secondary" : "outline"}
                  className="gap-1"
                  title={one.snap === false ? "打开吸附：落点吸进最近的格心／交叉点，但不查占用——两枚子能同格，也可以摞起来" : "关掉吸附：棋子想摆哪儿摆哪儿，可以歪在格缝上（网格锁定开着就还得吸）"}
                  onClick={() => { const a = snapOnAction(one, one.snap === false); if (a) onAction(a); }}
                >
                  <Magnet className="size-3.5" />
                  {one.snap === false ? "落点不吸格子" : "落点吸进格子"}
                </Button>
                <span className="text-[10px] leading-snug text-muted-foreground">
                  {one.grid ? "一手一子已开着，落点必然进格；要松一档就把锁定关掉" : one.snap === false ? "关了就随便摆：牌、子都能骑在格缝上" : "关掉它才能把子歪着摆在格缝里"}
                </span>
                <Button
                  size="xs"
                  variant={one.grid ? "secondary" : "outline"}
                  className="gap-1"
                  title={one.grid ? "关掉锁定：棋子想摆哪儿摆哪儿，可以摞可以挤" : "打开锁定：盘上的子只许坐在格心／交叉点上，抢同一格就散到最近的空格"}
                  onClick={() => { const a = gridLockAction(one, !one.grid); if (a) onAction(a); }}
                >
                  {one.grid ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  {one.grid ? "格子已锁，一手一子" : "格子未锁，随便摆"}
                </Button>
                <span className="text-[10px] leading-snug text-muted-foreground">
                  {one.grid ? "落点自动吸进最近的空格，被占了就往外散开" : "打开时会把盘上现有的子一次摆进格子里"}
                </span>
                {/* 整盘上锁是给下棋用的：锁住以后这张盘点不中拖不走，盘上的子照常落格 */}
                <Button
                  size="xs"
                  variant={one.lock ? "secondary" : "outline"}
                  className="gap-1"
                  title="锁定后这张棋盘谁都点不中、拖不走，只能按盘角那颗按钮解锁；棋子照常能下上去"
                  onClick={() => { const a = padLockAction(one, !one.lock); if (a) onAction(a); }}
                >
                  {one.lock ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                  {one.lock ? "解锁整盘" : "锁定整盘"}
                </Button>
                <span className="text-[10px] leading-snug text-muted-foreground">
                  {one.lock ? "整盘已锁：只能点盘角那颗按钮解锁" : "锁的是这张盘本身，子照样下"}
                </span>
              </div>
            </Section>
          )}

          {one?.kind === "board" && (takesCapture(one) || (!gaming && !!resetAction(one))) && (
            <Section label="这一盘">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* 开局摆回是预设盘才有的事：认不出哪张预设的盘没有开局可摆，按钮就不出现 */}
                {(() => {
                  const a = gaming ? null : resetAction(one);
                  return a && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1"
                      title="收掉盘上现有的子，按这套棋的开局重新摆满——摆在中场、被吃掉的都各归各位"
                      onClick={() => onAction(a)}
                    >
                      <RotateCcw className="size-3.5" />
                      摆回开局
                    </Button>
                  );
                })()}
                {takesCapture(one) && (
                  <span className="text-[10px] leading-snug text-muted-foreground">
                    {one.grid
                      ? "踩子即吃：拖到异色子那一格，它脚上亮起红圈就是吃掉它，不会把谁挤开"
                      : "开着「格子已锁」才吃得住子：现在锁没开，落点会自己找空格"}
                  </span>
                )}
                {!takesCapture(one) && <span className="text-[10px] leading-snug text-muted-foreground">这一盘一手一子，抢同一格就散到最近的空格</span>}
              </div>
            </Section>
          )}

          {/* 刻字写的是 {t:"label"} 与 {t:"color"}，游戏模式里整块收走，不留一排改不动的方格 */}
          {one?.kind === "disc" && !gaming && (one.shape === "piece" || one.shape === "coin") && (
            <Section label="棋子刻字">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Input
                    key={one.id}
                    defaultValue={one.label ?? ""}
                    maxLength={2}
                    className="h-7 w-16 text-center text-base"
                    aria-label="棋子上的字"
                    onBlur={(e) => {
                      const v = e.target.value.trim().slice(0, 2);
                      if (v !== (one.label ?? "")) onAction({ t: "label", id: one.id, label: v });
                    }}
                  />
                  <span className="text-[10px] leading-snug text-muted-foreground">留空就是素面棋子；点下面的字会连本色一起换过去</span>
                </div>
                {XIANGQI_GLYPHS.map((g, gi) => (
                  <div key={g.color} className="grid grid-cols-7 gap-0.5">
                    {g.glyphs.map((ch) => (
                      <Button
                        key={ch}
                        size="xs"
                        variant="ghost"
                        className="h-7 min-w-0 px-0 text-[13px] leading-none"
                        style={{ color: g.color }}
                        title={`刻成${gi === 0 ? "红方" : "黑方"}的 ${ch}`}
                        onClick={() => {
                          onAction({ t: "label", id: one.id, label: ch });
                          onAction({ t: "color", id: one.id, color: g.color });
                          setColor(g.color);
                        }}
                      >
                        {ch}
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {one?.kind === "timer" && (
            <Section label="计时">
              <div className="flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1">
                <Button size="xs" variant="ghost" className="gap-1" onClick={() => onAction(one.endsAt != null ? timerPauseAction(one) : timerRunAction(one))}>
                  {one.endsAt != null ? <Pause className="size-3" /> : <Play className="size-3" />}
                  {one.endsAt != null ? "暂停" : "开始"}
                </Button>
                <span className="min-w-11 text-center font-mono text-xs">{mmss(remainingOf(one))}</span>
                <Button size="xs" variant="ghost" onClick={() => onAction(timerShiftAction(one, -60))}>−1分</Button>
                <Button size="xs" variant="ghost" onClick={() => onAction(timerShiftAction(one, 60))}>+1分</Button>
                <Button size="xs" variant="ghost" className="gap-1" onClick={() => onAction(timerResetAction(one))}>
                  <RotateCcw className="size-3" />重置
                </Button>
              </div>
            </Section>
          )}

          {one?.kind === "arrow" && (
            <Section label="箭头">
              <div className="flex items-center gap-1 rounded-md border border-border/60 bg-black/25 px-1">
                <Button size="xs" variant="ghost" title="短一档 10cm" disabled={(one.len ?? 0.3) <= ARROW_MIN + 0.001} onClick={() => onAction(arrowLenAction(one, -0.1))}>缩短</Button>
                <span className="min-w-10 text-center font-mono text-[10px]">{Math.round((one.len ?? 0.3) * 100)}cm</span>
                <Button size="xs" variant="ghost" title="长一档 10cm" disabled={(one.len ?? 0.3) >= ARROW_MAX - 0.001} onClick={() => onAction(arrowLenAction(one, 0.1))}>加长</Button>
              </div>
            </Section>
          )}

          {one?.kind === "calc" && (
            <Section label="计算器">
              <div className="grid grid-cols-5 gap-0.5 rounded-md border border-border/60 bg-black/25 p-1">
                {CALC_KEYS.flat().map((k) => (
                  <Button
                    key={k}
                    size="xs"
                    variant={k === "=" ? "default" : "ghost"}
                    className="min-w-7 px-1 font-mono"
                    onClick={() => onAction(calcKeyAction(one, k))}
                  >
                    {k}
                  </Button>
                ))}
              </div>
            </Section>
          )}

          {one?.kind === "text" && (
            <Section label="文字">
              <Input
                key={one.id}
                defaultValue={one.label ?? ""}
                maxLength={24}
                className="h-7 w-28 text-xs"
                aria-label="文字标记内容"
                {...nameProps}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== (one.label ?? "")) onAction({ t: "label", id: one.id, label: v });
                }}
              />
            </Section>
          )}

          {/* ——— 以下三段是通用的：不管选中的是哪一件，长得一样、排得一样 ——— */}
          <Section label="摆位">
            {/* 复制是摆桌子的活：走的是 addMany，游戏模式挡不住它，只能在入口上收掉 */}
            {!gaming && duplicable && (
              <Button size="xs" variant="outline" className="gap-1" title="复制（Ctrl+D）" onClick={() => onAction(duplicateAction(objects, ids))}>
                <Copy className="size-3.5" />复制
              </Button>
            )}
            {/* 转角与俯仰只有钉得住高度那批物件吃这一套：棋盘与手里的牌按了不动，就不摆出来 */}
            {stackable.length > 0 && (
              <>
                <Button size="xs" variant="outline" className="gap-1" title="顺时针转 45°" onClick={() => adjust.step(45, 0)}>
                  <RotateCw className="size-3.5" />转 45°
                </Button>
                <Button size="xs" variant="outline" className="gap-1" title="逆时针转 45°" onClick={() => adjust.step(-45, 0)}>
                  <RotateCcw className="size-3.5" />转 45°
                </Button>
                <Button size="xs" variant="outline" className="gap-1" title="压低 15°（会顺手钉住高度）" onClick={() => adjust.step(0, -15)}>
                  <ChevronDown className="size-3.5" />俯仰
                </Button>
                <Button size="xs" variant="outline" className="gap-1" title="抬起 15°（会顺手钉住高度）" onClick={() => adjust.step(0, 15)}>
                  <ChevronUp className="size-3.5" />俯仰
                </Button>
              </>
            )}
            {pickable.length > 0 && (
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5">
                <Button size="xs" variant="ghost" title="缩小体积" disabled={!pickable.some((id) => sizeOf(objects.find((o) => o.id === id)!) > SCALE_MIN + 0.001)} onClick={() => resize(1 / 1.2)}>
                  <ZoomOut className="size-3.5" />
                </Button>
                <span className="min-w-9 text-center font-mono text-[10px]">{sizeLabel}</span>
                <Button size="xs" variant="ghost" title="放大体积" disabled={!pickable.some((id) => sizeOf(objects.find((o) => o.id === id)!) < SCALE_MAX - 0.001)} onClick={() => resize(1.2)}>
                  <ZoomIn className="size-3.5" />
                </Button>
              </div>
            )}
            {chosen.length > 1 && <Button size="xs" variant="outline" onClick={() => onAction(spreadAction(objects, ids))}>散开</Button>}
            {/* 摆正管的是整张桌子，跟选中谁没关系：没一件歪着的时候构造器返回 null，这颗按钮就不出现 */}
            {(() => {
              const a = straightenAllAction(objects);
              return a && (
                <Button size="xs" variant="outline" className="gap-1" title="把桌上每一件歪着的物件（棋盘除外）的转角与俯仰都退回 0°" onClick={() => onAction(a)}>
                  <Ruler className="size-3.5" />全部摆正
                </Button>
              );
            })()}
          </Section>

          {/* 换色写的是 {t:"color"}，游戏模式里这一整行不给摆 */}
          {!gaming && (
            <Section label="颜色">
              <Swatches
                value={color}
                size="sm"
                onChange={(c) => {
                  setColor(c);
                  for (const id of ids) onAction({ t: "color", id, color: c });
                }}
              />
            </Section>
          )}

          {/* 拿走只有这一处：以前只有区域垫在自家段里留了一颗删除，别的种类连个带字的入口都没有 */}
          {!gaming && (
            <Section label="拿走">
              <Button size="xs" variant="outline" className="gap-1 text-destructive" title={ids.length > 1 ? `把选中的 ${ids.length} 件都拿下去` : `把这件${names}拿下去`} onClick={() => onAction({ t: "remove", ids })}>
                <Trash2 className="size-3.5" />{ids.length > 1 ? `拿走这 ${ids.length} 件` : `拿走${names}`}
              </Button>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

/** 展开区的一组：小标题在上，控件自己在下面换行 */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1")}>
      <span className="panel-title ms-0.5 leading-none text-muted-foreground/85">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

/** 加减一档的迷你步进器：dock 上高度用；窄屏只留按钮和读数 */
function Stepper({ label, title, readout, compact, onMinus, onPlus }: {
  label: string;
  title: string;
  readout: string;
  compact?: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-black/25 px-0.5" title={title}>
      {!compact && <span className="panel-title px-0.5">{label}</span>}
      <Button size="icon-xs" variant="ghost" title={`${label}降低`} aria-label={`${label}降低`} onClick={onMinus}>
        <Minus className="size-3.5" />
      </Button>
      <span className="min-w-11 text-center font-mono text-[10px]">{readout}</span>
      <Button size="icon-xs" variant="ghost" title={`${label}升高`} aria-label={`${label}升高`} onClick={onPlus}>
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * 选中栏标题：一律「物件名 + 这一件当前的读数」。
 * 名字来自 catalog 的 displayName（区域/垫子/图片垫子、棋盘/桌垫各叫各的），这里只补读数。
 */
function titleOf(one: GameObject | null, count: number): string {
  if (!one) return `已选中 ${count} 个`;
  if (count > 1) return `已选中 ${count} 个物件`;
  const name = displayName(one);
  switch (one.kind) {
    case "card":
      return one.card?.rank ? `${name} ${one.card.rank}${{ s: "♠", h: "♥", d: "♦", c: "♣" }[one.card.suit ?? "s"]}` : `${name}「${one.card?.label ?? ""}」`;
    case "pile":
    case "box":
    case "bag":
      return `${name} · ${one.pile?.length ?? 0} 张`;
    case "token":
      return `${name}「${one.label ?? ""}」`;
    case "timer":
      return `${name} ${mmss(remainingOf(one))}`;
    case "calc": {
      const expr = one.calc?.expr ?? "";
      const v = evalCalc(expr);
      return `${name} ${expr || "0"}${v === null || formatCalc(v) === expr ? "" : ` = ${formatCalc(v)}`}`;
    }
    case "arrow":
      return `${name} ${Math.round((one.len ?? 0.3) * 100)}cm`;
    case "text":
      return `${name}「${one.label ?? ""}」`;
    case "zone":
      return `${name}「${one.label || name}」${one.priv ? " · 隐私" : ""}`;
    case "stat":
    case "slot": {
      const n = one.kind === "slot" ? ` · ${one.slot?.n ?? 3} 格` : "";
      return `${name}「${one.label || name}」${n}`;
    }
    case "spinner": {
      const s = fixSpinner(one.spinner);
      return `${name}「${one.label || name}」· ${s.n} 格 · ${s.value === undefined ? "还没拨" : `第 ${s.value + 1} 格`}`;
    }
    case "track": {
      const t = fixTrack(one.track);
      return `${name}「${one.label || name}」· ${t.n} 格 · ${t.marks.length} 人`;
    }
    case "board": {
      if (isMat(one)) return `${name}${one.lock ? " · 已锁" : ""}`;
      const preset = presetOf(one);
      return `${name}「${preset?.name ?? "空格盘"}」${one.lock ? " · 整盘已锁" : ""}`;
    }
    case "shield": {
      const sp = fixShield(one.shield);
      return `${name} ${Math.round(sp.w * 100)}×${Math.round(sp.h * 100)}cm${one.owner ? ` · ${one.label || name} 的屏` : " · 无主挡板"}`;
    }
    case "hour": {
      const h = fixHour(one.hour);
      return `${name} ${h.mins} 分钟 · ${h.at === null ? "静止中" : hourDone(one) ? "漏完了" : `还剩 ${mmss(hourLeft(one))}`}`;
    }
    case "book": {
      const b = fixBook(one.book);
      return `${name} ${b.pages.length} 页 · 第 ${b.page + 1} 页`;
    }
    case "gram": {
      const g = fixGram(one.gram);
      return g.clip ? `${name}「${g.name || "无名片子"}」· ${g.playing ? `唱到 ${mmss(gramPos(g))}` : "停着"}` : `${name} · 空机`;
    }
    case "mp3": {
      const m = fixMp3(one.mp3);
      if (!m.clip) return `${name} · 空机`;
      return `${name}「${m.name || "没名字的曲子"}」· ${m.shared ? `全桌${m.playing ? "在放" : "停着"}` : "只在本机"}`;
    }
    case "counter": {
      const c = fixCounter(one.counter);
      return `${name} ${c.v} · 步进 ${c.step} · ${c.host ? `吸在${COUNTER_EDGE_NAMES[c.edge ?? 0]}边` : "散在桌上"}`;
    }
    default:
      return name;
  }
}
