import { makeBoard, starter } from "../../game/factory";
import { apply, describe, MAX_OBJECTS, MAX_PILE } from "../../game/state";
import { api, readRom, readRomSave } from "../../game/api";
import { readDrag } from "../../game/rt";
import { compareZipNames, readZipImages } from "../../game/unzip";
import { deflateRawSync } from "node:zlib";
import { ringing, silenceAlarm, silenceAllAlarms } from "../../game/alarm";
import { ARROW_MAX, clamp, COPY_MAX, COPY_MIN, fixCopies, ARROW_MIN, CARD_ART_MAX, CARD_BASE, CARD_BACKS, CARD_CAT_MAX, CARD_LABEL_MAX, CARD_RATIO_MAX, CARD_RATIO_MIN, CARD_TEXT_MAX, CONTAINER_KINDS, DECAL_LIFT, DECAL_KINDS, FELT_Y, G, LINES_BORDER, LAYER_H, LAYER_MAX, SCALE_MAX, SCALE_MIN, SLOT_MAX, SLOT_MIN, SPIN_MAX, SPIN_MIN, SPIN_MS, SPIN_TURNS, STAT_MAX, STAT_MIN, TABLE, TILT_MAX, TIMER_MAX, TRACK_MARK_MAX, TRACK_MAX, TRACK_MIN, XIANGQI_GLYPHS, ZONE_MAX, ZONE_MIN, autoLayer, baseY, boardSize, boardThickness, boxOf, cardLie, cardShape, cardText, faceHidden, fixCard, fixSpinner, fixTrack, footprintOf, fixZone, hexPos, inTable, inZone, liftFor, lockedOut, materialOf, mmss, pinnable, presetOf, remainingOf, restInTable, restLayer, separate, shapeOf, slotAt, slotCards, slotNear, slotSpot, snap, snapTo, spanOf, spinAngle, spinAngleAt, statCards, surfaceY, takesCapture, trackMark, trackOffset, trackSize, zoneOf, BOARDS, CHESS_COLORS, CHESS_ROLES, GO_COLORS, GRID_EPS, PIECE_SETS, PIECE_SIZE, anchoredIds, cellCount, cellFor, gridHug, gridable, kindOfShape, onBoard, piecePoints, pieceSize, snapOn, SHIELD_BAND, SHIELD_MAX, SHIELD_H_MIN, HOUR_MAX, BOOK_CHARS, BOOK_PAGE_MAX, FLIPPABLE, fixShield, fixHour, fixBook, hourLeft, hourRatio, hourDone, boardRule, rulesOn, seatOf, enemyOf, gridCell, RULE_CAMPS, RULE_CAMP_NAMES, campsOf, campSide, GUARD_MAX, GUARD_MIN, REACH_DEFAULT, REACH_MAX, REACH_MIN, AUDIO_KEY, GRAM_DUR_MAX, GRAM_NAME_MAX, GRAM_VOL_DEFAULT, MP3_DUR_MAX, MP3_NAME_MAX, MP3_VOL_DEFAULT, fixGram, fixMp3, gramPos, gramLeft, mp3Pos, mp3Left, mp3Mine, sameCardsReordered, KIND_TAB, PALETTE_TABS, displayName, COUNTER_EDGE_NAMES, COUNTER_STEP_MAX, COUNTER_STEP_MIN, COUNTER_STEPS, COUNTER_V_MAX, COUNTER_V_MIN, fixCounter, counterSpot, hostAt, nearestEdge, countersOn, TRAY_MIN, TRAY_MAX, TRAY_WALL, TRAY_H, fixTray, trayOuter, inTray, diceInTray, trayAt, BV_ID, BILI_VIDEO, TABLET_ADDR_MAX, TABLET_PAGE_MAX, TABLET_POS_MAX, TABLET_REV_MAX, biliOf, fixTablet, isWebUrl, tabletPos, TABLET_SCREEN, outlineOf, SHAPES } from "../../game/catalog";
import { inRange, seatDistance, seatGap, seatsOf } from "../../game/range";
import { GOMOKU_LONG, bannedLanding, checkedCamp, checkedKing, governed, judge, pointsOf, roled, verdict } from "../../game/rules";
import { fling, resolvePlacement, restDrop } from "../../game/physics";
import { actionPerm, changePerm, touchedPerms, GAME_SHUT_HINT, gameShut } from "../../game/perm";
import { resolveDrop, capturesOf } from "../../game/landing";
import { DECKS, poker54, tideDeck, tarotMajor, werewolfDeck } from "../../game/decks";
import { parsePacks } from "../../game/packs";
import { TIDE_CALC_MAX, describeTide, isTideCards, tideCardOf, tideScore } from "../../game/tide";
import type { Action, CardSpec, CounterSpec, GameObject, GramSpec, Kind, Mp3Spec, TableState, ZoneSpec } from "../../game/types";
import {
  addArrowAction, addBagAction, addBoxAction, addCalcAction, addCardAction, addMatAction, addPileAction, addPointerAction, addStatMatAction, addTextAction, addTimerAction, addZoneAction,
  backSetAction, calcKeyAction, cardSetAction, customCardsAction, cutAction, dealAction, drawAction, drawIntoAction, drawLandingText, drawTargetOf, drawToHandAction, ejectSpots, effectAction, gatherAction, grabAction, handAction,
  handZoneAction, handZoneOf, padLockAction, pileSetAction, playHandAction, pourAction, pullCardAction, playToZoneAction, rollAllAction, scaleAction, shuffleAction, slotResizeAction, statResizeAction, tableZones, resetAction,
  addSlotAction, addSpinnerAction, addTrackAction, preferredZoneOf, stashDrawAction, tidyAction, zonePrefAction, zoneSpots, forgetHandZone, handZoneForgotten, isHandZone, rotResetAction, splitPilesAction, takeHandZoneAction,
  markAction, markClearAction, spinAction, spinSetAction, trackSetAction, addPieceAction, gridLockAction, snapOnAction, meshAction,
  timerPauseAction, timerResetAction, timerRunAction, timerShiftAction, zonePrivAction, zoneRangeAction, zoneResizeAction,
  shieldClaimAction, shieldResizeAction, hourFlipAction, hourSetAction, bookPageAction, bookPagesAction, bookWriteAction, placeAction,
  addGramAction, gramLoadAction, gramRenameAction, gramPlayAction, gramSeekAction, gramNudgeAction, gramVolAction, gramLoopAction,
  addMp3Action, mp3LoadAction, mp3ShareAction, mp3RenameAction, mp3PlayAction, mp3SeekAction, mp3VolAction, mp3LoopAction,
  evenSplitAction, EVEN_MAX_PILES, addPadAction, padImageAction, addBookAction, addShieldAction, boardPresetAction, duplicateAction,
  addCounterAction, counterStepAction, counterSetAction, counterStepSetAction, counterAttachAction,
  addTrayAction, trayResizeAction, nudgeAction, straightenAllAction, rollAction,
  addTabletAction, tabletLoadAction, tabletClearAction, tabletPlayAction, tabletSeekAction, tabletNudgeAction, tabletPageAction, tabletMuteAction, tabletReloadAction,
} from "../../game/ops";
import { tabletAddr, tabletFrame, tabletHost, tabletPage, tabletSrc, TABLET_PX_TIERS, tabletScreenPlan, tabletScreenPx } from "../../game/tablet";
import { AUTO_PREFS, cardStep, clampPrefs, DEFAULT_BUDGET, handBlock, handBudget, HAND_TIERS, handFits, handLayout, handTiers, MAX_OVERLAP, SIZE_MAX, SIZE_MIN, STRIP_VH, ZOOM_LIFT, ZOOM_SCALE, zoomRoom, type HandPrefs, type HandScheme } from "../../game/handbar";
import { calcPress, evalCalc, fixCalcExpr } from "../../game/calc";
import { imageKeysOf, imageProgress, reloadImages, requestImages } from "../../game/images";
import {
  cacheLocalTable, cacheRomPayload, cacheRoms, cachedRoms, cachedRomPayload, cacheRoom, cachedRoom,
  cachedRomIds, dropRomPayload, forgetRomList, forgetRomToken, forgetRoom, localTables, rememberRomToken,
  rememberRoomToken, roomTokenIds, romToken, romTokenIds, storedTables, takeLocalTable, wipeRoomCache,
} from "../../game/cache";
import { HAND_ZONE_MEMORY_KEY, forgottenHandZones, unforgetHandZone } from "../../game/ops";
import { listPresets, savePreset, wipePresets } from "../../game/preset";
import { formatBytes, inventory, localBytes } from "../../game/inventory";
import type { RomMeta } from "../../game/api";
const out: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const base = starter("cards", "测试牌桌");
check("开局牌堆数量", base.o.length === 4, `${base.o.length} 个物件`);
const piles = base.o.filter((o) => o.kind === "pile");
const deck = piles.slice().sort((x, y) => (y.pile?.length ?? 0) - (x.pile?.length ?? 0))[0];
const deckSize = deck.pile?.length ?? 0;
check("主牌堆有一半以上的牌", deckSize > 20 && deckSize <= 54, `${deckSize} 张`);

// 掷骰：点数来自动作，任何端重放都得到同一个结果
const die = starter("rpg", "x").o.find((o) => o.kind === "die")!;
const withDice = apply(apply(base, { t: "add", o: { ...die, id: "d-1" } }, "甲"), { t: "add", o: { ...die, id: "d-2", sides: 20 } }, "甲");
const rolled = rollAllAction(withDice.o);
check("掷全部骰子生成动作", !!rolled);
const a = apply(withDice, rolled!.action, "甲");
const b = apply(withDice, rolled!.action, "乙");
check("两端重放结果一致", JSON.stringify(a.o) === JSON.stringify(b.o));
const dice = a.o.filter((o) => o.kind === "die");
check("骰子按各自面数出点", dice.length === 2 && dice.every((o) => (o.value ?? 0) >= 1 && (o.value ?? 0) <= (o.sides ?? 6)), dice.map((o) => `d${o.sides}=${o.value}`).join(" "));

// 摸牌 + 收拢：牌堆总数守恒
const drew = drawAction(a, deck.id, 5, "甲");
const afterDraw = apply(a, drew!, "甲");
const loose = afterDraw.o.filter((o) => o.kind === "card").length;
check("摸 5 张出现散牌", loose === 5, `散牌 ${loose}`);
check("散牌收拢后牌堆复原", (apply(afterDraw, gatherAction(afterDraw.o, deck.id)!, "甲").o.find((o) => o.id === deck.id)?.pile?.length ?? 0) === deckSize);

// 洗牌：内容不变、顺序改变，且同步后两端一致
const shuffled = shuffleAction(afterDraw.o, deck.id)!;
const s1 = apply(afterDraw, shuffled, "甲");
const s2 = apply(afterDraw, shuffled, "乙");
check("洗牌结果两端一致", JSON.stringify(s1.o) === JSON.stringify(s2.o));
// 属性顺序会因来源不同而变（工厂写的与 fixCard 重建的），比较前先按 key 排一遍
const canon = (list: CardSpec[]) => list
  .map((c) => JSON.stringify(Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)))))
  .sort();
const same = canon(s1.o.find((o) => o.id === deck.id)?.pile ?? []);
const before = canon(afterDraw.o.find((o) => o.id === deck.id)?.pile ?? []);
check("洗牌不增不减牌", JSON.stringify(same) === JSON.stringify(before), `${same.length} vs ${before.length}`);

// 洗牌要真的乱序：不是只在画面上看不出来，归约后的顺序本身就得变
const orderOf = (st: TableState) => (st.o.find((o) => o.id === deck.id)?.pile ?? [])
  .map((c) => `${c.rank ?? ""}${c.suit ?? ""}|${c.label ?? ""}|${c.img ?? ""}`).join("~");
check("洗牌确实换掉了整叠顺序", orderOf(s1) !== orderOf(afterDraw));
let lastTop = "";
let topKinds = 0;
for (let i = 0; i < 200; i++) {
  const t = orderOf(apply(afterDraw, shuffleAction(afterDraw.o, deck.id)!, "甲")).split("~")[0];
  if (t !== lastTop) { topKinds++; lastTop = t; }
}
check("反复洗牌的顶牌散得开", topKinds >= 10, `200 次洗出 ${topKinds} 种顶牌`);

// 发牌：按座位平均扣放，牌堆相应减少
const seated = apply(afterDraw, { t: "playerAdd", player: { id: "p1", name: "甲", color: "#c8443c" } }, "甲");
const seated2 = apply(seated, { t: "playerAdd", player: { id: "p2", name: "乙", color: "#3d7fbf" } }, "甲");
const dealt = dealAction(seated2.o, seated2, deck.id, 3)!;
const beforeDeal = seated2.o.find((o) => o.id === deck.id)?.pile?.length ?? 0;
const beforeLoose = seated2.o.filter((o) => o.kind === "card").length;
const afterDeal = apply(seated2, dealt, "甲");
const dealPile = afterDeal.o.find((o) => o.id === deck.id)?.pile?.length ?? 0;
check("2 人 × 3 张发牌", afterDeal.o.filter((o) => o.kind === "card").length - beforeLoose === 6, `新增 ${afterDeal.o.filter((o) => o.kind === "card").length - beforeLoose} 张`);
check("发牌后牌堆少 6 张", beforeDeal - dealPile === 6, `${beforeDeal} → ${dealPile}`);
check("发牌全部朝下", afterDeal.o.filter((o) => o.kind === "card").slice(beforeLoose).every((o) => o.faceUp === false));

// 越界与上限：不会写出 NaN 或超量物件
const wild = apply(afterDeal, { t: "move", m: [{ id: deck.id, x: Number.MAX_VALUE, z: -Number.MAX_VALUE, layer: 9999 }] }, "甲");
const movedDeck = wild.o.find((o) => o.id === deck.id)!;
check(
  "越界落点被夹回桌面",
  Number.isFinite(movedDeck.x) && Number.isFinite(movedDeck.z) && Math.abs(movedDeck.x) <= 1.2 && Math.abs(movedDeck.z) <= 0.8 && movedDeck.layer === LAYER_MAX,
  `${movedDeck.x},${movedDeck.z},L${movedDeck.layer}`,
);
const junk = apply(afterDeal, { t: "move", m: [{ id: deck.id, x: Number.NaN, z: Number.NaN }] }, "甲");
const junkDeck = junk.o.find((o) => o.id === deck.id)!;
check("NaN 落点保持原位", junkDeck.x === deck.x && junkDeck.z === deck.z, `${junkDeck.x},${junkDeck.z}`);
const neg = apply(afterDeal, { t: "count", id: afterDeal.o.find((o) => o.kind === "token")!.id, delta: -9999 }, "甲");
check("计数不会为负", (neg.o.find((o) => o.kind === "token")!.count ?? -1) === 0);

// 日志：每条动作都留下可回放的一致记录
check("日志记录动作", afterDeal.log.length > 3 && afterDeal.log.every((l) => typeof l.text === "string" && l.text.length > 0), `${afterDeal.log.length} 条`);

// 自定义卡面：桌面状态里只带 key，摸牌/收拢都不丢图
const uploaded = customCardsAction([
  { back: "plain", img: "ik1aaaaaa", label: "我的卡 1" },
  { back: "plain", img: "ik2bbbbbb", label: "我的卡 2" },
], "#c8443c")!;
const withCustom = apply(base, uploaded, "甲");
const customs = withCustom.o.filter((o) => o.card?.img);
check("上传两张卡各带一个 key", customs.length === 2 && customs.every((o) => /^[a-z0-9]{6,24}$/.test(o.card!.img!)), customs.map((o) => o.card!.img).join(","));
check("卡面 key 不会被写进别处", JSON.stringify(withCustom).length < JSON.stringify(base).length + 900);

const twin = addPileAction([
  { back: "plain", label: "同名卡", img: "ik1aaaaaa" },
  { back: "plain", label: "同名卡", img: "ik2bbbbbb" },
], "#3d7fbf");
const twinState = apply(base, twin, "甲");
const twinPile = twinState.o.filter((o) => o.kind === "pile").at(-1)!;
check("新建的双子牌堆只有 2 张", twinPile.pile?.length === 2, `${twinPile.pile?.length} 张`);
const tookTwin = apply(twinState, drawAction(twinState, twinPile.id, 1, "甲")!, "甲");
const drawnTwin = tookTwin.o.find((o) => o.kind === "card")!;
check("摸牌摸到的是顶部那张图", drawnTwin?.card?.img === "ik2bbbbbb", drawnTwin?.card?.img ?? "无");
check("牌堆顶部保留另一张图", tookTwin.o.find((o) => o.id === twinPile.id)?.pile?.at(-1)?.img === "ik1aaaaaa");
const gatheredTwin = apply(tookTwin, gatherAction(tookTwin.o, twinPile.id)!, "甲");
const restacked = gatheredTwin.o.find((o) => o.id === twinPile.id)?.pile ?? [];
check("收拢后两张图都在牌堆", restacked.length === 2 && restacked.some((c) => c.img === "ik1aaaaaa") && restacked.some((c) => c.img === "ik2bbbbbb"), `${restacked.length} 张`);

const smuggled = api.sanitize({
  ...base,
  o: [{ id: "c-x", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: "data:image/png;base64,AAAA" } }],
});
check("脏 key 在本地也被丢掉", smuggled.o[0].card?.img === undefined, JSON.stringify(smuggled.o[0].card));
const kept = api.sanitize({ ...base, o: [{ id: "c-y", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: "ik1aaaaaa" } }] });
check("合法 key 被保留", kept.o[0].card?.img === "ik1aaaaaa");

// ——— 手牌 / 容器 / 体积 / 桌垫 ———
const handState = apply(withCustom, handAction(customs.map((o) => o.id), "me-1"), "甲");
const inHand = handState.o.filter((o) => o.hand);
check("两张牌进入手牌", inHand.length === 2 && inHand.every((o) => o.owner === "me-1"));
check("手牌仍是 kind=card 且带原图", inHand.length === 2 && inHand.every((o) => o.kind === "card" && !!o.card?.img));
check("手牌不在桌面散牌里", handState.o.filter((o) => o.kind === "card" && !o.hand).length === 0);
const played = apply(handState, playHandAction(inHand.map((o) => o.id)), "甲");
const back = played.o.filter((o) => o.kind === "card");
check("打出手牌回到桌面且不再带 owner", back.length === 2 && back.every((o) => !o.hand && o.owner === undefined));
check("打出的牌落在本侧桌沿", back.every((o) => o.z > 0.4), back.map((o) => o.z).join(","));
check("打出后互不重叠", Math.abs(back[0].x - back[1].x) > 0.02, `${back[0].x} vs ${back[1].x}`);
const otherHand = apply(handState, handAction(inHand.slice(0, 1).map((o) => o.id), "me-2"), "乙");
check("换归属后仍在手里且只有一张改主", otherHand.o.filter((o) => o.hand).length === 2 && otherHand.o.filter((o) => o.owner === "me-2").length === 1);
// 整把拖进牌栏时可能混着骰子：只有牌进得了手，其余留在原处，别变成桌面上没有、牌栏里也画不出的东西
const mixed = { ...base, o: [
  { id: "m-card", kind: "card", x: 0.1, z: 0.1, rot: 0, layer: 0, card: { back: "plain", label: "混牌" } },
  { id: "m-die", kind: "die", x: 0.2, z: 0.2, rot: 0, layer: 0 },
] } as TableState;
const grabbed = apply(mixed, handAction(["m-card", "m-die"], "me-1"), "甲");
check("混着骰子收进手时只有牌到手", grabbed.o.filter((o) => o.hand).length === 1 && grabbed.o.find((o) => o.id === "m-die")?.hand === undefined);
check("没收进手的骰子留在原处", (() => { const d = grabbed.o.find((o) => o.id === "m-die")!; return d.x === 0.2 && d.z === 0.2; })());
check("到手的那张牌照样打得出", apply(grabbed, playHandAction(["m-card"]), "甲").o.find((o) => o.id === "m-card")?.hand === undefined);

const boxed = apply(base, addBoxAction([
  { back: "plain", label: "盒牌 1" },
  { back: "plain", label: "盒牌 2" },
  { back: "plain", label: "盒牌 3" },
], "#3d5c46"), "甲");
const box = boxed.o.filter((o) => o.kind === "box").at(-1)!;
check("卡牌盒带 3 张", !!box && box.pile?.length === 3, `${box?.pile?.length} 张`);
const fromBox = apply(boxed, drawAction(boxed, box.id, 1, "甲")!, "甲");
check("从盒里摸 1 张成散牌", fromBox.o.some((o) => o.kind === "card" && o.card?.label === "盒牌 3"));
check("盒里剩 2 张", (fromBox.o.find((o) => o.id === box.id)?.pile ?? []).length === 2);
const toHand = apply(boxed, drawToHandAction(boxed.o, box.id, 2, "me-1")!, "甲");
check("摸进手牌不进桌面", toHand.o.filter((o) => o.hand && o.owner === "me-1").length === 2 && !toHand.o.some((o) => o.kind === "card" && !o.hand));

const bagged = apply(base, addBagAction(Array.from({ length: 8 }, (_, i) => ({ back: "plain", label: `球${i}` })), "#8a5cc4"), "甲");
const bag = bagged.o.filter((o) => o.kind === "bag").at(-1)!;
check("袋子里装了 8 张", !!bag && bag.pile?.length === 8);
const pulled = apply(bagged, grabAction(bagged, bag.id, 3)!, "甲");
check("盲摸 3 张后袋子剩 5", (pulled.o.find((o) => o.id === bag.id)?.pile ?? []).length === 5 && pulled.o.filter((o) => o.kind === "card").length === 3);
const g1 = apply(bagged, grabAction(bagged, bag.id, 3)!, "甲");
const g2 = apply(bagged, grabAction(bagged, bag.id, 3)!, "乙");
check("盲摸走随机顺序", JSON.stringify(g1.o.filter((o) => o.kind === "card").map((o) => o.card?.label)) !== JSON.stringify(g2.o.filter((o) => o.kind === "card").map((o) => o.card?.label)) || "偶然相同");
const fewBag = apply(base, addBagAction(Array.from({ length: 4 }, (_, i) => ({ back: "plain", label: `剩${i}` })), "#8a5cc4"), "甲");
const few = fewBag.o.filter((o) => o.kind === "bag").at(-1)!;
const nearlyEmpty = apply(fewBag, grabAction(fewBag, few.id, 3)!, "甲");
check("袋里只剩四张也要摸够三张", (nearlyEmpty.o.find((o) => o.id === few.id)?.pile ?? []).length === 1 && nearlyEmpty.o.filter((o) => o.kind === "card").length === 3);
const fewHand = apply(fewBag, drawToHandAction(fewBag.o, few.id, 3, "me-1", true)!, "甲");
check("盲摸进手牌同样摸够数", fewHand.o.filter((o) => o.hand && o.owner === "me-1").length === 3);

const scaled = apply(boxed, scaleAction([box.id], 1.5), "甲");
check("盒子体积放大 1.5 倍", Math.abs((scaled.o.find((o) => o.id === box.id)?.scale ?? 1) - 1.5) < 1e-6);
let huge = scaled;
for (let i = 0; i < 20; i++) huge = apply(huge, scaleAction([box.id], 1.5), "甲");
check("体积不会超过上限", (huge.o.find((o) => o.id === box.id)?.scale ?? 0) <= SCALE_MAX + 1e-9);
let tiny = scaled;
for (let i = 0; i < 30; i++) tiny = apply(tiny, scaleAction([box.id], 1 / 1.5), "甲");
check("体积不会低于下限", (tiny.o.find((o) => o.id === box.id)?.scale ?? 9) >= SCALE_MIN - 1e-9);
const boardId = base.o.find((o) => o.kind === "board")?.id;
const boardScaled = boardId ? apply(base, scaleAction([boardId], 2), "甲") : base;
check("棋盘不吃体积缩放", !boardScaled.o.find((o) => o.id === boardId)?.scale);

const matted = apply(base, addMatAction("ik3ccccc", 1600, 900, 1.6), "甲");
const mat = matted.o.find((o) => o.kind === "board")!;
check("大图桌垫替换了棋盘", mat.board?.layout === "mat" && mat.board?.img === "ik3ccccc", JSON.stringify(mat.board));
check("桌垫按长边铺且保持比例", (() => {
  const s = boardSize(mat.board!);
  return Math.abs(Math.max(s.w, s.d) - 1.6) < 0.03 && Math.abs(s.w / s.d - 1600 / 900) < 0.06;
})(), JSON.stringify(boardSize(mat.board!)));
const matSmuggle = api.sanitize({ ...base, o: [{ id: "b-x", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "image", img: "data:image/png;base64,AAAA" } }] });
check("桌垫里的 dataURL 会被剥掉", matSmuggle.o[0].board?.img === undefined);
const matKeep = api.sanitize({ ...base, o: [{ id: "b-y", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "image", img: "ik3ccccc" } }] });
check("合法桌垫 key 保留", matKeep.o[0].board?.img === "ik3ccccc");
const dirtyScale = api.sanitize({ ...base, o: [{ id: "t-x", kind: "token", x: 0, z: 0, rot: 0, layer: 0, scale: 99, owner: "x".repeat(40), hand: "yes" as unknown as boolean }] });
check("越界体积被夹住，超长归属/假 hand 被清掉", dirtyScale.o[0].scale === 4 && dirtyScale.o[0].owner === undefined && dirtyScale.o[0].hand === undefined, JSON.stringify(dirtyScale.o[0]));

// ——— 计时器 / 指针 / 路径箭头 / 文字标记 ———
const T0 = 1_700_000_000_000;
const timerState = apply(base, addTimerAction(120, "#c8443c"), "甲");
const timer = timerState.o.find((o) => o.kind === "timer")!;
check("计时器放下时是暂停状态", timer.duration === 120 && timer.left === 120 && timer.endsAt == null);
const started = apply(timerState, timerRunAction(timer, T0)!, "甲");
const running = started.o.find((o) => o.id === timer.id)!;
check("启动写入绝对结束时刻", running.endsAt === T0 + 120_000, String(running.endsAt));
check("两端重放同一个计时器动作", JSON.stringify(apply(timerState, timerRunAction(timer, T0)!, "乙").o) === JSON.stringify(started.o));
check("剩余按本地时钟算", remainingOf(running, T0 + 40_000) === 80 && mmss(80) === "1:20");
const paused = apply(started, timerPauseAction(running, T0 + 40_000)!, "甲");
const held = paused.o.find((o) => o.id === timer.id)!;
check("暂停后回到静止剩余", held.endsAt == null && held.left === 80, `${held.left}/${held.endsAt}`);
const shifted = apply(paused, timerShiftAction(held, -60)!, "甲");
check("减一分钟剩 20 秒", (shifted.o.find((o) => o.id === timer.id)?.left ?? -1) === 20);
const reset = apply(shifted, timerResetAction(held)!, "甲");
check("重置回到总时长", (reset.o.find((o) => o.id === timer.id)?.left ?? 0) === 120);
check("桌面可以同时有多个计时器", apply(started, addTimerAction(30, "#3d7fbf"), "甲").o.filter((o) => o.kind === "timer").length === 2);
const wildTimer = apply(timerState, { t: "timer", id: timer.id, duration: 99999, left: -50, endsAt: 3 }, "甲").o.find((o) => o.id === timer.id)!;
check("非法计时数值被夹住", wildTimer.duration === TIMER_MAX && wildTimer.left === 0 && wildTimer.endsAt === 3, `${wildTimer.duration}/${wildTimer.left}/${wildTimer.endsAt}`);
const timerSan = api.sanitize({
  ...base,
  o: [
    { id: "t-1", kind: "timer", x: 0, z: 0, rot: 0, layer: 0, duration: 1e9, left: -3, endsAt: 12345 },
    { id: "t-2", kind: "token", x: 0, z: 0, rot: 0, layer: 0, duration: 60, endsAt: 999 },
  ],
});
check("计时器脏数值在同步时也被收口", timerSan.o[0].duration === TIMER_MAX && timerSan.o[0].left === 0 && timerSan.o[0].endsAt === 12345);
check("非计时器不带时间字段", timerSan.o[1].duration === undefined && timerSan.o[1].endsAt === undefined);

const aux = apply(apply(apply(base, addPointerAction("#3d7fbf"), "甲"), addArrowAction("#3f9d63", 0.5), "甲"), addTextAction("文字".repeat(30), "#d9a026"), "甲");
check("指针/箭头/文字都能放到桌面", ["pointer", "arrow", "text"].every((k) => aux.o.some((o) => o.kind === k)));
const arrow = aux.o.find((o) => o.kind === "arrow")!;
check("箭头按给定长度铺开", arrow.len === 0.5, String(arrow.len));
check("箭头长度有上下限", apply(aux, { t: "arrow", id: arrow.id, len: 99 }, "甲").o.find((o) => o.id === arrow.id)!.len === ARROW_MAX
  && apply(aux, { t: "arrow", id: arrow.id, len: 0.001 }, "甲").o.find((o) => o.id === arrow.id)!.len === ARROW_MIN);
const note = aux.o.find((o) => o.kind === "text")!;
check("文字标记长度受限", (note.label ?? "").length === 40, `${note.label?.length} 字`);
check("文字标记可以改名", apply(aux, { t: "label", id: note.id, label: "改过了" }, "甲").o.find((o) => o.id === note.id)?.label === "改过了");
const arrowSan = api.sanitize({ ...base, o: [{ id: "a-1", kind: "arrow", x: 0, z: 0, rot: 0, layer: 0, len: 40 }] });
check("箭头长度同步时被夹住", arrowSan.o[0].len === ARROW_MAX);

// ——— 卡牌管理：整叠改写、效果文本、自定义卡背 ———
const managed = apply(base, pileSetAction(deck.id, [
  { back: "plain", label: "陷阱", text: "跳过一回合" },
  { back: "weave", label: "没有文本的卡" },
  { back: "plain", label: "治疗药水", text: "恢复 2 点生命" },
], "整理了牌堆"), "甲");
const topOf = managed.o.find((o) => o.id === deck.id)?.pile ?? [];
check("整叠替换写入 3 张", topOf.length === 3 && topOf.at(-1)?.label === "治疗药水", `${topOf.length} 张`);
const drewDown = apply(managed, drawAction(managed, deck.id, 1, "甲")!, "甲");
const drawnDown = drewDown.o.filter((o) => o.kind === "card" && !o.hand).at(-1)!;
check("扣放的牌堆摸出来不带效果行", !drewDown.log.some((l) => l.kind === "effect"));
check("摸出的牌带着效果文本", drawnDown.card?.text === "恢复 2 点生命");
const revealed = apply(drewDown, { t: "flip", ids: [drawnDown.id] }, "甲");
check("翻开卡牌会记录效果", revealed.log.at(-1)?.kind === "effect" && (revealed.log.at(-1)?.text ?? "").includes("恢复 2 点生命"), revealed.log.at(-1)?.text);
const faceUpPile = apply(managed, { t: "turnCards", ids: [deck.id], up: true }, "甲");
const drewUp = apply(faceUpPile, drawAction(faceUpPile, deck.id, 1, "甲")!, "甲");
check("顶牌朝上时摸牌直接记效果", drewUp.log.some((l) => l.kind === "effect" && l.text.includes("恢复 2 点生命")), drewUp.log.at(-1)?.text);
check("整理后删牌只剩 1 张", (apply(managed, pileSetAction(deck.id, [topOf[1]], "精简了牌堆"), "甲").o.find((o) => o.id === deck.id)?.pile ?? []).length === 1);
const logged = apply(managed, effectAction(deck.id, 1), "甲");
check("没有文本的牌记录占位", logged.log.at(-1)?.kind === "effect" && (logged.log.at(-1)?.text ?? "").includes("还没写效果"), logged.log.at(-1)?.text);
const backed = apply(managed, backSetAction([deck.id], "ik1aaaaaa")!, "甲");
check("自定义卡背写在物件上", backed.o.find((o) => o.id === deck.id)?.backImg === "ik1aaaaaa");
const drewBacked = apply(backed, drawAction(backed, deck.id, 1, "甲")!, "甲");
check("摸出的牌继承卡背", drewBacked.o.filter((o) => o.kind === "card" && !o.hand).at(-1)?.backImg === "ik1aaaaaa");
check("可以恢复内置卡背", apply(backed, backSetAction([deck.id], null)!, "甲").o.find((o) => o.id === deck.id)?.backImg === undefined);
// 批量卡背：一次选中「一张散牌 + 一整叠」，两处都要吃到，而且整叠里每张的内置样式一起换
const withLoose = apply(managed, addCardAction({ back: "plain", label: "散牌甲" }, "#c8443c"), "甲");
const looseBatch = withLoose.o.filter((o) => o.kind === "card").at(-1)!;
const batchBack = apply(withLoose, backSetAction([deck.id, looseBatch.id], "ik2aaaaaa")!, "甲");
check("批量卡背一次写给选中的每一处", batchBack.o.find((o) => o.id === deck.id)?.backImg === "ik2aaaaaa"
  && batchBack.o.find((o) => o.id === looseBatch.id)?.backImg === "ik2aaaaaa");
const styleBack = apply(batchBack, backSetAction([deck.id], null, "wolf")!, "甲");
check("内置卡背统一整叠每一张", (styleBack.o.find((o) => o.id === deck.id)?.pile ?? []).every((c) => c.back === "wolf"));
check("没变化时不重复刷日志", apply(styleBack, backSetAction([deck.id], null, "wolf")!, "甲").log.length === styleBack.log.length);
const backSan = api.sanitize({ ...base, o: [{ id: "p-9", kind: "pile", x: 0, z: 0, rot: 0, layer: 0, backImg: "data:image/png;base64,AA", pile: [] }] });
check("脏卡背 key 被丢掉", backSan.o[0].backImg === undefined);
// ——— 无边框卡面：只在真有卡面图时留着，脏类型一律不认 ———
const bare = fixCard({ back: "plain", img: "ik1aaaaaa", borderless: true })!;
check("带图的牌留着无边框", bare.borderless === true && bare.img === "ik1aaaaaa", JSON.stringify(bare));
check("没有卡面图时无边框被丢掉", fixCard({ back: "plain", borderless: true })?.borderless === undefined);
check("脏无边框值不认", fixCard({ back: "plain", img: "ik1aaaaaa", borderless: "yes" as never })?.borderless === undefined);
check("脏图 key 连带把无边框一起丢掉", fixCard({ back: "plain", img: "data:image/png;base64,AA", borderless: true })?.borderless === undefined);
const blPile = apply(managed, pileSetAction(deck.id, [{ back: "plain", img: "ik1aaaaaa", borderless: true, label: "无边框牌" }], "试无边框"), "甲");
check("整叠改写把无边框带进牌堆", (blPile.o.find((o) => o.id === deck.id)?.pile ?? []).at(-1)?.borderless === true);
const blSan = api.sanitize({ ...base, o: [{ id: "c-bl", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: "ik1aaaaaa", borderless: true } }] });
check("sanitize 不吞掉合法无边框标记", blSan.o[0].card?.borderless === true, JSON.stringify(blSan.o[0].card));
const blSanDirty = api.sanitize({ ...base, o: [{ id: "c-bl2", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", borderless: 1 } }] });
check("sanitize 吞掉脏无边框标记", blSanDirty.o[0].card?.borderless === undefined);

// ——— 牌形随图：比例只跟卡面图走，等面积成形，占桌与盒口跟着变 ———
const wideCard = fixCard({ back: "plain", img: "ik1aaaaaa", ratio: 1.6 })!;
check("带图的牌留着比例", wideCard.ratio === 1.6, JSON.stringify(wideCard));
check("没有卡面图时比例一并丢掉", fixCard({ back: "plain", ratio: 1.6 })?.ratio === undefined);
check("脏比例不认", fixCard({ back: "plain", img: "ik1aaaaaa", ratio: "1.6" as never })?.ratio === undefined
  && fixCard({ back: "plain", img: "ik1aaaaaa", ratio: NaN })?.ratio === undefined);
check("超界比例夹到横幅/书签两端，离谱的脏值直接不当比例看", fixCard({ back: "plain", img: "ik1aaaaaa", ratio: 12 })?.ratio === CARD_RATIO_MAX
  && fixCard({ back: "plain", img: "ik1aaaaaa", ratio: 0.06 })?.ratio === CARD_RATIO_MIN
  && fixCard({ back: "plain", img: "ik1aaaaaa", ratio: 300 })?.ratio === undefined,
JSON.stringify(fixCard({ back: "plain", img: "ik1aaaaaa", ratio: 300 })));
check("标准比例就是原来的 63x90 牌", Math.abs(cardShape().w - CARD_BASE.w) < 1e-9 && Math.abs(cardShape().d - CARD_BASE.d) < 1e-9,
  `${cardShape().w}x${cardShape().d}`);
const square = cardShape(1);
check("正方形牌与标准牌等面积", Math.abs(square.w * square.d - CARD_BASE.w * CARD_BASE.d) < 1e-6 && Math.abs(square.w - square.d) < 1e-6,
  `${square.w}x${square.d}`);
const skinny = cardShape(CARD_RATIO_MIN);
check("夹到极端比例时边长仍在限内", skinny.w >= 0.034 - 1e-9 && skinny.d <= 0.112 + 1e-9, `${skinny.w}x${skinny.d}`);
const wideObj: GameObject = { id: "c-wide", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: "ik1aaaaaa", ratio: 2 } };
const plainObj: GameObject = { id: "c-plain", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain" } };
check("宽牌占桌更宽，标准牌系数为 1", footprintOf(wideObj) > footprintOf(plainObj)
  && Math.abs(footprintOf(plainObj) / 0.038 - 1) < 1e-9, `${footprintOf(wideObj)}/${footprintOf(plainObj)}`);
const wideBox: GameObject = { id: "b-wide", kind: "box", x: 0, z: 0, rot: 0, layer: 0, pile: [{ back: "plain", img: "ik1aaaaaa", ratio: 2 }] };
check("盒口按顶牌牌形撑开", boxOf(wideBox).hx > boxOf({ ...wideBox, pile: [{ back: "plain" }] }).hx, JSON.stringify(boxOf(wideBox)));
check("牌堆看的是顶牌比例", shapeOf(wideBox).w > CARD_BASE.w && shapeOf({ ...wideBox, pile: [] }).w === CARD_BASE.w);
const ratioSan = api.sanitize({ ...base, o: [{ id: "c-r1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: "ik1aaaaaa", ratio: 0.9 } }] });
check("sanitize 不吞掉合法比例", ratioSan.o[0].card?.ratio === 0.9, JSON.stringify(ratioSan.o[0].card));
const ratioSanDirty = api.sanitize({ ...base, o: [{ id: "c-r2", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: "ik1aaaaaa", ratio: 12 } }, { id: "c-r3", kind: "card", x: 0.2, z: 0, rot: 0, layer: 0, card: { back: "plain", img: "ik1aaaaaa", ratio: 99 } }] });
check("sanitize 把超界比例夹回可用区间", ratioSanDirty.o[0].card?.ratio === CARD_RATIO_MAX, JSON.stringify(ratioSanDirty.o[0].card));
check("sanitize 把不成牌的脏比例整个丢掉", ratioSanDirty.o[1].card?.ratio === undefined, JSON.stringify(ratioSanDirty.o[1].card));
const ratioPile = apply(managed, pileSetAction(deck.id, [{ back: "plain", img: "ik1aaaaaa", ratio: 1.4, borderless: true, label: "宽牌" }], "试牌形"), "甲");
check("整叠改写把比例带进牌堆", (ratioPile.o.find((o) => o.id === deck.id)?.pile ?? []).at(-1)?.ratio === 1.4);


const looseCardState = apply(base, addCardAction({ back: "plain", label: "散牌", text: "抽一张" }, "#c8443c"), "甲");
const looseCard = looseCardState.o.filter((o) => o.kind === "card").at(-1)!;
check("单张改写生效", apply(looseCardState, cardSetAction(looseCard.id, { back: "plain", label: "新名字", text: "改过的效果" }), "甲").o.find((o) => o.id === looseCard.id)?.card?.text === "改过的效果");
const overstuffed = apply(looseCardState, cardSetAction(looseCard.id, { back: "classic", label: "名".repeat(50), text: "效".repeat(500) }), "甲").o.find((o) => o.id === looseCard.id)!.card!;
check("改写时长字段被截断", overstuffed.label?.length === 20 && overstuffed.text?.length === CARD_TEXT_MAX, `${overstuffed.label?.length}/${overstuffed.text?.length}`);
const flippedDown = apply(looseCardState, { t: "flip", ids: [looseCard.id] }, "甲");
check("翻到背面不产生效果行", !flippedDown.log.some((l) => l.kind === "effect"));

// ——— 区域垫：几何归属、隐私锁与按观看者的牌面保密 ———
const zoned = apply(base, addZoneAction("#c8443c", 0.8, 0.5, "甲"), "甲");
const zone = zoned.o.find((o) => o.kind === "zone")!;
check("区域垫可以放上桌面", zone.owner === "甲" && zone.zone?.w === 0.8 && zone.zone?.d === 0.5, JSON.stringify(zone.zone));
check("区域尺寸上下限都夹住", apply(zoned, { t: "add", o: { id: "z-9", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, zone: { w: 99, d: 0.01 } } }, "甲")
  .o.find((o) => o.id === "z-9")!.zone!.w === ZONE_MAX);
check("fixZone 兜住脏数据", fixZone({ w: NaN, d: -5 }).d === ZONE_MIN && fixZone(undefined).w === 0.5);
check("隐私开关写入并记日志", (() => {
  const on = apply(zoned, zonePrivAction(zone, true)!, "甲");
  const o = on.o.find((x) => x.id === zone.id)!;
  return o.priv === true && !!on.log.at(-1)?.text.includes("隐私模式");
})());
check("关隐私只清掉标记", apply(apply(zoned, zonePrivAction(zone, true)!, "甲"), zonePrivAction(zone, false)!, "甲").o.find((o) => o.id === zone.id)?.priv === undefined);
check("隐私动作不认非区域物件", zonePrivAction({ ...base.o[0], id: "nope", kind: "card" }, true) === null
  && apply(zoned, { t: "zone", id: base.o[0].id, priv: true }, "甲").o.find((o) => o.id === base.o[0].id)?.priv === undefined);
const grown = apply(zoned, zoneResizeAction(zone, 0.06)!, "甲").o.find((o) => o.id === zone.id)!;
check("区域缩放同时改两边", grown.zone?.w === 0.86 && grown.zone?.d === 0.56, JSON.stringify(grown.zone));
check("顶到上限后只放还能长的边", (() => {
  const maxed = zoneResizeAction({ ...zone, zone: { w: ZONE_MAX, d: 0.5 } }, 0.06)!;
  return maxed.t === "zone" && maxed.w === ZONE_MAX && maxed.d === 0.56
    && zoneResizeAction({ ...zone, zone: { w: ZONE_MAX, d: ZONE_MAX } }, 0.06) === null;
})());
const rotated = { ...zone, x: 0, z: 0, rot: 90, zone: { w: 0.6, d: 0.2 } };
check("区域归属跟着旋转走", inZone(rotated, 0, 0.25) && !inZone(rotated, 0.25, 0));
const zoneA = { id: "z-a", kind: "zone" as const, x: 0, z: 0, rot: 0, layer: 0, owner: "甲", zone: { w: 1.2, d: 1.2 } };
const zoneB = { id: "z-b", kind: "zone" as const, x: 0, z: 0, rot: 0, layer: 0, owner: "甲", zone: { w: 0.4, d: 0.4 } };
const inner = { id: "c-in", kind: "card" as const, x: 0.05, z: 0.05, rot: 0, layer: 0, card: { back: "plain", label: "区域里的牌" } };
const nested = { ...base, o: [zoneA, zoneB, inner] };
check("重叠区域取最小的那个", zoneOf(nested, inner)?.id === "z-b" && zoneOf(nested, zoneA) === undefined);

const privNested = { ...nested, o: [{ ...zoneB, priv: true }, zoneA, inner] };
const privZone = privNested.o.find((o) => o.id === "z-b")!;
check("隐私区域的牌：创建者能碰、别人不能", !lockedOut(inner, privNested, "甲") && lockedOut(inner, privNested, "乙"));
check("隐私区域自己也锁住", lockedOut(privZone, privNested, "乙") && !lockedOut(privZone, privNested, "甲"));
check("非隐私区域别人照样能操作", !lockedOut(inner, nested, "乙") && !lockedOut(zoneB, nested, "乙"));
check("本地单人模式不受锁影响", !lockedOut(inner, privNested, "") && !lockedOut(zoneB, privNested, ""));
check("没上锁的棋盘谁都点得中", !lockedOut({ id: "b", kind: "board", x: 0, z: 0, rot: 0, layer: 0 }, privNested, "乙"));
const outside = { ...inner, x: 0.9, z: 0.9 };
check("不在任何区域里的牌对谁都不保密", !faceHidden(outside, privNested, "乙"));
const hiddenPile = { id: "p-h", kind: "pile" as const, x: 0.05, z: 0.05, rot: 0, layer: 0, pile: [inner.card] };
check("牌堆袋子在区域里同样保密", faceHidden(hiddenPile, { ...nested, o: [zoneA, hiddenPile] }, "乙")
  && !faceHidden(hiddenPile, { ...nested, o: [zoneA, hiddenPile] }, "甲"));
check("保密与隐私开关无关，只看区域归属", faceHidden(inner, nested, "乙") && faceHidden(inner, privNested, "乙"));
check("非牌类物件不涉密", !faceHidden({ id: "d", kind: "die", x: 0.05, z: 0.05, rot: 0, layer: 0, sides: 6 }, nested, "乙"));
const carriedOut = apply(nested, { t: "move", m: [{ id: inner.id, x: 0.9, z: 0.9, layer: 0 }] }, "乙");
const stillInside = carriedOut.o.find((o) => o.id === zoneB.id)!;
check("拿出区域后牌面恢复可见", faceHidden(inner, nested, "乙") && !faceHidden(carriedOut.o.find((o) => o.id === inner.id)!, carriedOut, "乙"));
check("区域垫不会因为牌被拿走而消失", stillInside.kind === "zone" && !!stillInside.zone);
const zoneSan = api.sanitize({ ...base, o: [{ id: "z-1", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, zone: { w: 99, d: 0.01 }, priv: "yes" }, { id: "c-1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, zone: { w: 3, d: 3 }, priv: true }] });
check("同步时区域字段只认区域垫", zoneSan.o[0].zone?.w === ZONE_MAX && zoneSan.o[0].zone?.d === ZONE_MIN && zoneSan.o[0].priv === undefined
  && zoneSan.o[1].zone === undefined && zoneSan.o[1].priv === undefined);

// ——— 垫子：和区域垫共用几何与落牌规则，只是画成实心一块，垫面还能贴一张图 ———
const padded = apply(base, addPadAction("#3d7fbf", 0.4, 0.28, "甲"), "甲");
const padMat = padded.o.find((o) => o.kind === "zone")!;
check("垫子可以放上桌面", padMat.zone?.pad === true && padMat.label === "垫子" && padMat.owner === "甲", JSON.stringify(padMat.zone));
check("纯色垫子不带图，不像 key 的图由 fixZone 吞掉", padMat.zone?.img === undefined && fixZone({ w: 0.4, d: 0.3, pad: true, img: "../etc" }).img === undefined);
const pastedTable = apply(padded, padImageAction(padMat, "padimg01")!, "甲");
const pasted = pastedTable.o.find((o) => o.id === padMat.id)!;
check("垫面图写进状态", pasted.zone?.img === "padimg01" && pasted.zone?.pad === true);
const grownTable = apply(pastedTable, zoneResizeAction(pasted, 0.06)!, "甲");
const padGrown = grownTable.o.find((o) => o.id === padMat.id)!;
check("调垫子大小不会弄丢垫面图与垫子标记", padGrown.zone?.img === "padimg01" && padGrown.zone?.pad === true && padGrown.zone?.w === 0.46, JSON.stringify(padGrown.zone));
check("撤掉垫面图回到纯色", apply(grownTable, padImageAction(padGrown, "")!, "甲").o.find((o) => o.id === padMat.id)!.zone?.img === undefined);
check("垫面动作不认普通区域垫与非区域物件", padImageAction(zone, "padimg01") === null
  && padImageAction({ ...base.o[0], id: "nope2", kind: "card" }, "padimg01") === null);
check("换同一张图不算改动", padImageAction(pasted, "padimg01") === null);
check("垫子也是打牌落点", tableZones(padded).some((z) => z.id === padMat.id) && (() => {
  const a = playToZoneAction(padded, [looseCard.id], padMat.id);
  return !!a && a.t === "hand" && a.owner === null && a.spots.every((s: { x: number; z: number }) => inZone(padMat, s.x, s.z));
})());
const padSan = api.sanitize({ ...base, o: [
  { id: "z-p", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, zone: { w: 0.4, d: 0.3, pad: true, img: "padimg01" } },
  { id: "z-r", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, zone: { w: 0.4, d: 0.3, pad: "yes", img: "not a key!!" } as unknown as ZoneSpec },
  { id: "k-9", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain" }, zone: { w: 0.4, d: 0.3, pad: true, img: "padimg01" } as ZoneSpec },
] });
check("同步时垫子标记与垫面图只认区域垫", padSan.o[0].zone?.pad === true && padSan.o[0].zone?.img === "padimg01"
  && padSan.o[1].zone?.pad === undefined && padSan.o[1].zone?.img === undefined
  && padSan.o[2].zone === undefined, JSON.stringify(padSan.o.map((o) => o.zone)));
check("存档归约保住垫子的图", (() => {
  const tidy = api.sanitize({ ...base, o: [{ id: "z-t", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, zone: { w: 99, d: 0.3, pad: true, img: "padimg01" } }] });
  return tidy.o[0].zone?.pad === true && tidy.o[0].zone?.img === "padimg01" && tidy.o[0].zone?.w === ZONE_MAX;
})());

// ——— 物理碰撞：move 与打出都会把挤在一起的物件推开，各端推出同一份桌面 ———
const mkCard = (id: string, x: number, z: number, layer = 0) => ({ id, kind: "card" as const, x, z, rot: 0, layer, card: { back: "plain" as const, label: id } });
const twin2 = { ...base, o: [mkCard("k-1", 0.3, 0.2), mkCard("k-2", 0.3, 0.2)] };
const bumpMove = { t: "move" as const, m: [{ id: "k-1", x: 0.3, z: 0.2, layer: 0 }] };
const bumped = apply(twin2, bumpMove, "甲");
const ka = bumped.o.find((o) => o.id === "k-1")!;
const kb = bumped.o.find((o) => o.id === "k-2")!;
// 挤开用的是真实碰撞盒：两张牌沿最短的那条边错开半个牌宽就互不压着了
check("两张重合的牌被推开", Math.hypot(ka.x - kb.x, ka.z - kb.z) + 0.002 >= 2 * boxOf(ka).hx, `${ka.x},${ka.z} / ${kb.x},${kb.z}`);
check("落点那张钉在落点上", ka.x === 0.3 && ka.z === 0.2, `${ka.x},${ka.z}`);
check("两端推开结果完全一致", JSON.stringify(apply(twin2, bumpMove, "乙").o) === JSON.stringify(bumped.o));
const layered = { ...base, o: [mkCard("u-1", 0, 0, 0), mkCard("u-2", 0, 0, 1)] };
const stackedStay = apply(layered, { t: "move", m: [{ id: "u-1", x: 0, z: 0, layer: 0 }] }, "甲");
check("不同层允许叠放", stackedStay.o.every((o) => o.x === 0 && o.z === 0));
const nearEdge = { ...base, o: [mkCard("e-1", 1.05, 0), mkCard("e-2", 1.16, 0)] };
const shoved = apply(nearEdge, { t: "move", m: [{ id: "e-1", x: 1.13, z: 0, layer: 0 }] }, "甲");
const pushed = shoved.o.find((o) => o.id === "e-2")!;
check("往外挤时被桌沿挡住而不是飞出去", pushed.x > 1.16 && pushed.x <= TABLE.w / 2 - 0.03 && inTable(pushed.x, pushed.z).x === pushed.x, `${pushed.x}`);
const onZone = { ...base, o: [{ id: "z-c", kind: "zone" as const, x: 0, z: 0, rot: 0, layer: 0, zone: { w: 0.6, d: 0.4 } }, mkCard("c-c", 0, 0)] };
const glided = apply(onZone, { t: "move", m: [{ id: "c-c", x: 0.02, z: 0.02, layer: 0 }] }, "甲");
check("区域垫不挡牌也不被挤开", glided.o.find((o) => o.id === "c-c")!.x === 0.02 && glided.o.find((o) => o.id === "z-c")!.x === 0);
check("棋盘永远站在原地", apply(base, { t: "move", m: [{ id: deck.id, x: 0, z: 0, layer: 0 }] }, "甲").o.find((o) => o.kind === "board")?.x === base.o.find((o) => o.kind === "board")?.x);
const twoCards = { ...base, o: [mkCard("h-1", -0.6, 0.4), mkCard("h-2", 0.3, 0.3)] };
const holdingOne = apply(twoCards, handAction(["h-1"], "p1"), "甲");
const droppedOn = apply(holdingOne, playHandAction(["h-1"], { x: 0.3, z: 0.3 }), "甲");
const p1card = droppedOn.o.find((o) => o.id === "h-1")!;
const p2card = droppedOn.o.find((o) => o.id === "h-2")!;
check("打出的牌不压在别的牌上", !p1card.hand && p1card.faceUp === true && Math.hypot(p1card.x - p2card.x, p1card.z - p2card.z) + 0.002 >= 2 * boxOf(p1card).hx, `${p1card.x},${p1card.z}`);

// ——— 联机自动手牌区 + 打牌可选区域 ———
const roomState = { ...base, players: [{ id: "p1", name: "甲", color: "#c8443c" }] };
const seatA = { id: "p1", name: "甲", color: "#c8443c" };
const firstSeat = handZoneAction(roomState, seatA);
check("进房自动圈出自己的手牌区", !!firstSeat);
const withA = apply(roomState, firstSeat!, "甲");
const handA = withA.o.find((o) => o.kind === "zone" && o.owner === "p1")!;
check("手牌区带隐私并按人命名", handA.priv === true && (handA.label ?? "").endsWith("的手牌"), handA.label);
check("已有手牌区不会重复生成", handZoneAction(withA, seatA) === null && handZoneOf(withA, "p1")?.id === handA.id);
const secondSeat = handZoneAction(withA, { id: "p2", name: "乙", color: "#3d7fbf" })!;
const withB = apply(withA, secondSeat, "乙");
const handB = withB.o.find((o) => o.kind === "zone" && o.owner === "p2")!;
check("第二个人拿到不同的座位", Math.abs(handB.x - handA.x) >= 0.12 || Math.abs(handB.z - handA.z) >= 0.12, `${handA.x},${handA.z} / ${handB.x},${handB.z}`);
check("别人的手牌区我动不了", lockedOut(handA, withB, "p2") && !lockedOut(handA, withB, "p1"));
const seatSan = api.sanitize(withA);
check("手牌区同步后保留归属与隐私", seatSan.o.find((o) => o.id === handA.id)?.owner === "p1" && seatSan.o.find((o) => o.id === handA.id)?.priv === true);
check("本地单人不受手牌区锁影响", !lockedOut(handA, withB, ""));

const zoned2 = apply(base, addZoneAction("#3f9d63", 0.5, 0.36, "p1"), "甲");
const target = zoned2.o.find((o) => o.kind === "zone")!;
const withLoose2 = apply(zoned2, addCardAction({ back: "plain", label: "要打出的牌" }, "#c8443c"), "甲");
const looseCard2 = withLoose2.o.filter((o) => o.kind === "card").at(-1)!;
const holding2 = apply(withLoose2, handAction([looseCard2.id], "p1"), "甲");
const toZone = playToZoneAction(holding2, [looseCard2.id], target.id)!;
check("选中的区域给出显式落点格子", toZone.t === "hand" && toZone.spots?.length === 1 && Math.abs(toZone.spots[0].x - target.x) < 0.002 && Math.abs(toZone.spots[0].z - target.z) < 0.002, JSON.stringify(toZone.spots));
const landed2 = apply(holding2, toZone, "甲");
const landedCard = landed2.o.find((o) => o.id === looseCard2.id)!;
check("打出的牌落在选中的区域里", !landedCard.hand && landedCard.faceUp === true && zoneOf(landed2, landedCard)?.id === target.id, `${landedCard.x},${landedCard.z}`);
check("承诺的落点就是最终落点", Math.abs(landedCard.x - toZone.spots![0].x) < 0.0006 && Math.abs(landedCard.z - toZone.spots![0].z) < 0.0006, `${landedCard.x},${landedCard.z} vs ${JSON.stringify(toZone.spots)}`);
check("不选区域时打回默认落点", playToZoneAction(holding2, [looseCard2.id], null)?.at?.z === TABLE.d / 2 - 0.14);
check("一张牌都没选时不出动作", playToZoneAction(holding2, [], target.id) === null);
check("tableZones 只数区域垫", tableZones(landed2).length === 1 && tableZones(landed2).every((z) => z.kind === "zone"));

// ——— 一次打多张：格点排开，谁也不许被挪位（显示与落点一致） ———
const bigZoneState = apply(base, addZoneAction("#3f9d63", 0.9, 0.6, "p1"), "甲");
const bigZone = bigZoneState.o.find((o) => o.kind === "zone")!;
let five = bigZoneState;
for (let i = 0; i < 5; i++) five = apply(five, addCardAction({ back: "plain", label: "连打" }, "#c8443c"), "甲");
const fiveIds = five.o.filter((o) => o.kind === "card").slice(-5).map((o) => o.id);
const heldFive = apply(five, handAction(fiveIds, "p1"), "甲");
const spots = zoneSpots(bigZone, 5);
check("五张牌排出五个格点", spots.length === 5 && new Set(spots.map((s) => `${s.x},${s.z}`)).size === 5, JSON.stringify(spots));
check("格点都落在区域框内", spots.every((s) => inZone(bigZone, s.x, s.z)));
const multiAction = playToZoneAction(heldFive, fiveIds, bigZone.id)!;
const multiLanded = apply(heldFive, multiAction, "甲");
const landedFive = fiveIds.map((id) => multiLanded.o.find((o) => o.id === id)!);
check("打出去的位置和承诺的格点一一对应", landedFive.every((o, i) => Math.abs(o.x - spots[i].x) < 0.0006 && Math.abs(o.z - spots[i].z) < 0.0006), landedFive.map((o) => `${o.x},${o.z}`).join(" "));
check("互不重叠", landedFive.every((a, i) => landedFive.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) >= footprintOf(a) + footprintOf(b) - 0.002)));

// ——— 首选落牌区：只有显式标记过的那一块才拦落点 ———
const prefState = apply(withA, zonePrefAction(handA, true), "甲");
check("设了首选会写进区域", prefState.o.find((o) => o.id === handA.id)?.pref === true);
check("标记过的区域才是落牌区", preferredZoneOf(prefState, "p1")?.id === handA.id);
check("没标记的区域不拦落点", preferredZoneOf(withA, "p1") === undefined && preferredZoneOf(withB, "p2") === undefined);
check("别人看不到我的首选归属", preferredZoneOf(prefState, "p2")?.id !== handA.id);
const ownSecond = apply(prefState, addZoneAction("#d8a13a", 0.6, 0.4, "p1"), "甲");
const secondOwn = ownSecond.o.find((o) => o.id !== handA.id && o.kind === "zone" && o.owner === "p1")!;
const prefMoved = apply(ownSecond, zonePrefAction(secondOwn, true), "甲");
check("换首选会把旧的那块清掉", prefMoved.o.find((o) => o.id === secondOwn.id)?.pref === true && prefMoved.o.find((o) => o.id === handA.id)?.pref === undefined);
check("同一时间只有一块首选", preferredZoneOf(prefMoved, "p1")?.id === secondOwn.id);
const noPref = apply(prefState, zonePrefAction(handA, false), "甲");
check("取消首选后落点退回手牌", noPref.o.find((o) => o.id === handA.id)?.pref === undefined && preferredZoneOf(noPref, "p1") === undefined);
check("区域同步后首选不丢", api.sanitize(prefState).o.find((o) => o.id === handA.id)?.pref === true);

// ——— 拿牌落点：默认一律进手牌，标记过首选才摊进区域 ———
const deckState = apply(withA, addPileAction(Array.from({ length: 6 }, (_, i) => ({ back: "plain", label: `牌${i + 1}` })), "#c8443c"), "甲");
const drawDeck = deckState.o.filter((o) => CONTAINER_KINDS.includes(o.kind)).at(-1)!;
const toHandAct = stashDrawAction(deckState, drawDeck.id, 2, "p1")!;
const drewHand = apply(deckState, toHandAct, "甲");
const heldNow = (t: TableState) => t.o.filter((o) => o.hand && o.owner === "p1").length;
check("有自动手牌区也照样摸进手牌", toHandAct.t === "draw" && heldNow(drewHand) === heldNow(deckState) + 2, `${heldNow(drewHand)} 张在手`);
const bagTable = apply(drewHand, addBagAction(Array.from({ length: 4 }, (_, i) => ({ back: "plain", label: `袋${i + 1}` })), "#c8443c"), "甲");
const drawBag = bagTable.o.filter((o) => o.kind === "bag").at(-1)!;
const blindHand = stashDrawAction(bagTable, drawBag.id, 3, "p1", true)!;
check("盲摸也是直接进手牌", drawBag.pile?.length === 4 && blindHand.to?.length === 3 && heldNow(apply(bagTable, blindHand, "甲")) === heldNow(bagTable) + 3, `动作里 ${blindHand.to?.length} 张`);
const prefDeck = apply(deckState, zonePrefAction(handA, true), "甲");
const toMine = stashDrawAction(prefDeck, drawDeck.id, 2, "p1")!;
const drewToZone = apply(prefDeck, toMine, "甲");
const drawn = drewToZone.o.filter((o) => o.kind === "card" && !o.hand).slice(-2);
check("标记首选后摸的牌落在区域里", toMine.t === "draw" && drawn.length === 2 && drawn.every((c) => zoneOf(drewToZone, c)?.id === handA.id), drawn.map((c) => `${c.x},${c.z}`).join(" "));
check("落在区域里的牌对自己朝上", drawn.every((c) => c.faceUp === true && !c.hand));
check("区域里的牌对别人保密", drawn.every((c) => faceHidden(c, { ...drewToZone, players: [{ id: "p2", name: "乙", color: "#3d7fbf" }] }, "p2")));
const noZone = { ...deckState, o: deckState.o.filter((o) => o.kind !== "zone") };
const noId = stashDrawAction(noZone, drawDeck.id, 2, "");
const onTable = (t: TableState) => t.o.filter((o) => o.kind === "card" && !o.hand).length;
check("连身份都没有时摊到容器旁边", !!noId && noId.t === "draw" && onTable(apply(noZone, noId, "甲")) === onTable(noZone) + 2);

// ——— 摸牌挑落点：显式点一块区域，和「手牌打到指定区域」共用同一套格点 ———
const pickDeck = apply(withA, addPileAction(Array.from({ length: 6 }, (_, i) => ({ back: "plain", label: `挑${i + 1}` })), "#c8443c"), "甲");
const pickPile = pickDeck.o.filter((o) => CONTAINER_KINDS.includes(o.kind)).at(-1)!;
const twoZRaw = apply(apply(pickDeck, addZoneAction("#3f9d63", 0.9, 0.6, "p1"), "甲"), addZoneAction("#d8a13a", 0.6, 0.4, "p2"), "甲");
// 自动手牌区也是一块 zone，zoneOf 认的是「盖住它的最小那块」。把它挪到左侧空处，
// 免得两块区域叠在一起时断言测的其实是归属规则而不是落点
const twoZ = { ...twoZRaw, o: twoZRaw.o.map((o) => (o.kind === "zone" && o.owner === "p1" && o.id !== handA.id ? { ...o, x: -0.7, z: -0.3 } : o)) };
const mineZ = twoZ.o.find((o) => o.kind === "zone" && o.owner === "p1" && o.id !== handA.id)!;
const foeZ = twoZ.o.find((o) => o.kind === "zone" && o.owner === "p2")!;
const pickSpots = zoneSpots(mineZ, 2);
const pickAct = drawIntoAction(twoZ, pickPile.id, 2, "p1", mineZ.id)!;
const pickTo = pickAct.t === "draw" ? pickAct.to : [];
const pickLanded = apply(twoZ, pickAct, "甲");
const pickCards = pickTo.map((c) => pickLanded.o.find((x) => x.id === c.id)!);
check("挑中区域时按区域的格点排牌", pickTo.length === 2 && pickTo.every((c, i) => Math.abs(c.x - pickSpots[i].x) < 0.0006 && Math.abs(c.z - pickSpots[i].z) < 0.0006), JSON.stringify(pickSpots));
check("摸出来的两张都落在挑中的那块区域里", pickCards.length === 2 && pickCards.every((c) => zoneOf(pickLanded, c)?.id === mineZ.id), pickCards.map((c) => `${c.x},${c.z}`).join(" "));
check("摊进区域的牌不在手里、对自己朝上", pickCards.every((c) => !c.hand && c.faceUp === true));
check("没标记首选也照样摊进挑中的区域", heldNow(pickLanded) === heldNow(twoZ) && onTable(pickLanded) === onTable(twoZ) + 2);
check("挑别人的区域也认（和打牌落点同一个口径）", (() => {
  const into = drawIntoAction(twoZ, pickPile.id, 1, "p1", foeZ.id)!;
  const to = into.t === "draw" ? into.to : [];
  const landed = to.map((c) => apply(twoZ, into, "甲").o.find((x) => x.id === c.id)!);
  return to.length === 1 && landed.every((c) => zoneOf(apply(twoZ, into, "甲"), c)?.id === foeZ.id);
})());
const pickPref = apply(twoZ, zonePrefAction(handA, true), "甲");
const forceHand = drawIntoAction(pickPref, pickPile.id, 2, "p1", "hand")!;
check("点名要手牌时连标记过的首选区都不拦", heldNow(apply(pickPref, forceHand, "甲")) === heldNow(pickPref) + 2);
const asDefault = drawIntoAction(pickPref, pickPile.id, 2, "p1", null)!;
const defaultLanded = apply(pickPref, asDefault, "甲");
check("不挑落点时走的还是默认那一条（首选区优先）", (asDefault.t === "draw" ? asDefault.to : []).map((c) => defaultLanded.o.find((x) => x.id === c.id)!).every((c) => zoneOf(defaultLanded, c)?.id === handA.id));
const gone = { ...twoZ, o: twoZ.o.filter((o) => o.id !== mineZ.id) };
const fell = drawIntoAction(gone, pickPile.id, 2, "p1", mineZ.id)!;
check("挑的那块区域被人拿走了就退回默认落点", heldNow(apply(gone, fell, "甲")) === heldNow(gone) + 2);
const pickDrained = apply(twoZ, drawIntoAction(twoZ, pickPile.id, 6, "p1", mineZ.id)!, "甲");
check("堆空了就不出这个动作", drawIntoAction(pickDrained, pickPile.id, 1, "p1", mineZ.id) === null);
const many = drawIntoAction(twoZ, pickPile.id, 5, "p1", mineZ.id)!;
const manyLanded = apply(twoZ, many, "甲");
const manyCards = (many.t === "draw" ? many.to : []).map((c) => manyLanded.o.find((x) => x.id === c.id)!);
check("一次摸五张在区域里排开不重叠", manyCards.length === 5 && manyCards.every((a, i) => manyCards.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) >= footprintOf(a) + footprintOf(b) - 0.002)), manyCards.map((c) => `${c.x},${c.z}`).join(" "));
check("摸牌挑落点吃的还是 cards 这道权限", actionPerm(drawIntoAction(twoZ, pickPile.id, 1, "p1", mineZ.id)!) === "cards");
const pickPull = pullCardAction(twoZ, pickPile.id, 0, "p1", false, mineZ.id)!;
const pickPullTo = pickPull.t === "pull" ? pickPull.to : null;
check("精确取出那一张也认挑中的区域", !!pickPullTo && zoneOf(apply(twoZ, pickPull, "甲"), apply(twoZ, pickPull, "甲").o.find((x) => x.id === pickPullTo!.id)!)?.id === mineZ.id);
check("说法与落点出自同一份：挑中的区域", drawLandingText(twoZ, "p1", mineZ.id).startsWith("摊进「"));
check("说法与落点出自同一份：点名手牌", drawLandingText(pickPref, "p1", "hand") === "直接进手牌" && "hand" in drawTargetOf(pickPref, "p1", "hand"));
check("说法与落点出自同一份：没身份摊侧面", drawLandingText(twoZ, "", "hand") === "摊在容器旁边，所有人都看得见" && "side" in drawTargetOf(twoZ, "", "hand"));
check("落点判定与动作指向同一块区域", "zone" in drawTargetOf(twoZ, "p1", mineZ.id) && (drawTargetOf(twoZ, "p1", mineZ.id) as { zone: GameObject }).zone.id === mineZ.id);

// ——— 手牌条摆法：任何张数、宽度与高度预算都不许溢出 ———
const widths = [120, 150, 240, 320, 360, 420, 520, 760, 900, 1280, 1920];
const budgets = [64, 96, 130, 165, 214, 248];
let overflow = "";
for (const scheme of ["stack", "wrap", "both"] as const) {
  for (const w of widths) {
    for (const b of budgets) {
      for (let n = 1; n <= 40; n++) {
        const plan = handLayout(n, w, scheme, b);
        if (!handFits(n, w, plan, b)) overflow += ` ${scheme}/${w}px/${b}高/${n}张`;
        if (plan.overlap < 0 || plan.overlap >= 1) overflow += ` ${scheme}/比例${plan.overlap}`;
        const step = cardStep(plan.w, plan.overlap);
        if (step < 2) overflow += ` ${scheme}/${w}px/${n}张露${step}px`;
        if (plan.h * plan.rows + 3 * (plan.rows - 1) > Math.max(72, b) + 0.5) overflow += ` ${scheme}/${w}px/${b}高/${n}张超高${plan.h * plan.rows}`;
      }
    }
  }
}
check("手牌摆法在十一种宽度 × 六种高度预算 × 1-40 张下都不溢出", overflow === "" || overflow.length < 200, `溢出:${overflow.slice(0, 200)}`);
// 选中的牌往上行：放大的那一段必须还在高度预算里，不然牌头就被底条裁掉
let clipped = "";
for (const scheme of ["stack", "wrap", "both"] as const) {
  for (const w of widths) {
    for (const b of budgets) {
      for (let n = 1; n <= 40; n++) {
        const plan = handLayout(n, w, scheme, b);
        const rise = plan.h * (ZOOM_SCALE - 1) + ZOOM_LIFT;
        if (Math.max(72, b) - (plan.h * plan.rows + 3 * (plan.rows - 1)) < rise) clipped += ` ${scheme}/${w}px/${b}高/${n}张/牌高${plan.h}`;
      }
    }
  }
}
check("选中的牌放大后牌头不被底条裁掉", clipped === "" || clipped.length < 200, `裁头:${clipped.slice(0, 200)}`);
check("放大余量随牌高一起算", zoomRoom(100) >= 100 * (ZOOM_SCALE - 1) + ZOOM_LIFT && handBlock(100, 2) === 100 * 2 + 3 + zoomRoom(100));
check("牌越多叠得越紧", handLayout(4, 760, "stack").overlap < handLayout(16, 760, "stack").overlap);
check("叠放方案只有一行", handLayout(30, 760, "stack").rows === 1);
check("换行方案不叠牌但会变小", (() => {
  const a = handLayout(18, 760, "wrap");
  return a.overlap === 0 && a.w < handLayout(3, 760, "wrap").w && a.rows > 1;
})());
check("全显方案又换行又叠放", (() => {
  const b = handLayout(18, 760, "both");
  return b.rows > 1 && b.overlap > 0;
})());
check("给得起高度就换三行", handLayout(24, 320, "both").rows === 3);
check("高度不够先牺牲行：宁可叠紧也不长一屏", (() => {
  const tight = handLayout(24, 320, "both", 120);
  return (
    tight.rows < handLayout(24, 320, "both").rows &&
    tight.h * tight.rows + 3 * (tight.rows - 1) <= 120 &&
    handFits(24, 320, tight, 120)
  );
})());
check("手机竖屏预算放得下一排最小的牌", handBudget(560) >= HAND_TIERS[HAND_TIERS.length - 1].h);
check("预算再小也不超底条上限", [400, 560, 740, 900].every((h) => handBudget(h) <= h * STRIP_VH));

// ——— 手牌外观自己调：叠放比例与牌面大小都要照样不溢出 ———
const PREF_MATRIX: HandPrefs[] = [
  { overlap: null, size: 1 },
  { overlap: 0, size: 1 },
  { overlap: 0.3, size: 1 },
  { overlap: 0.6, size: 1 },
  { overlap: MAX_OVERLAP, size: 1 },
  { overlap: null, size: 0.6 },
  { overlap: null, size: 1.4 },
  { overlap: 0.45, size: 1.2 },
  { overlap: 0.15, size: 0.8 },
];
let prefsBad = "";
for (const scheme of ["stack", "wrap", "both"] as const) {
  for (const prefs of PREF_MATRIX) {
    for (const w of widths) {
      for (const b of budgets) {
        for (let n = 1; n <= 40; n++) {
          const plan = handLayout(n, w, scheme, b, prefs);
          if (!handFits(n, w, plan, b)) prefsBad += ` ${scheme}/${prefs.overlap}/${prefs.size}/${w}px/${b}高/${n}张`;
          if (plan.overlap < 0 || plan.overlap >= 1) prefsBad += ` ${scheme}/比例${plan.overlap}`;
        }
      }
    }
  }
}
check("九种外观设置下也全都不溢出", prefsBad === "" || prefsBad.length < 200, `溢出:${prefsBad.slice(0, 200)}`);
check("定了叠放比例就照这个叠", handLayout(4, 760, "stack", DEFAULT_BUDGET, { overlap: 0.5, size: 1 }).overlap === 0.5);
check("设成 0% 就完全摊开", handLayout(4, 760, "stack", DEFAULT_BUDGET, { overlap: 0, size: 1 }).overlap === 0);
check("自动时按铺满宽度来摆", handLayout(4, 760, "stack").overlap === 0);
check("比例塞不下就让步：先缩小牌再叠紧", (() => {
  const loose = handLayout(30, 320, "stack", DEFAULT_BUDGET, { overlap: 0.1, size: 1 });
  const auto = handLayout(30, 320, "stack", DEFAULT_BUDGET, AUTO_PREFS);
  return loose.overlap > 0.1 && loose.w <= auto.w && handFits(30, 320, loose, DEFAULT_BUDGET);
})());
check("牌面大小倍率直接改档位", (() => {
  const big = handLayout(6, 760, "stack", 248, { overlap: null, size: 1.4 });
  const small = handLayout(6, 760, "stack", 248, { overlap: null, size: 0.6 });
  const auto = handLayout(6, 760, "stack", 248);
  return big.w === Math.round(HAND_TIERS[0].w * 1.4) && small.w < auto.w && big.h * big.rows <= 248;
})());
check("尺寸档位一起放大", handTiers(1) === HAND_TIERS && handTiers(1.2)[0].h === Math.round(HAND_TIERS[0].h * 1.2));
check("脏设置收口：越界夹紧、非法回自动", (() => {
  const a = clampPrefs({ overlap: 5, size: 99 });
  const b = clampPrefs({ overlap: -1, size: 0.1 });
  const c = clampPrefs("nope");
  return a.overlap === MAX_OVERLAP && a.size === SIZE_MAX && b.overlap === 0 && b.size === SIZE_MIN && c.overlap === null && c.size === 1;
})());
check("null 与脏值都回自动", clampPrefs({ overlap: null, size: Number.NaN }).overlap === null && clampPrefs({ overlap: null, size: Number.NaN }).size === 1);

// ——— 归零响铃：本机静音，重开计时后照常再响 ———
const now0 = Date.now();
const rang = { id: "t-1", kind: "timer" as const, x: 0, z: 0, rot: 0, layer: 0, label: "倒计时", endsAt: now0 - 1000 };
const stillRunning = { ...rang, id: "t-2", endsAt: now0 + 60000 };
const notYet = { ...rang, id: "t-3", endsAt: now0 + 5000 };
const alarmState = { ...base, o: [rang, stillRunning, notYet] };
check("归零且还在跑的计时器会响", ringing(alarmState.o, now0).map((o) => o.id).join(",") === "t-1", ringing(alarmState.o, now0).map((o) => o.id).join(","));
check("没到点/没在跑的都不响", ringing([{ ...base.o[0], id: "t-4", kind: "timer" as const, endsAt: undefined, left: 5 }], now0).length === 0);
silenceAlarm(rang);
check("静音之后不再响", ringing(alarmState.o, now0).length === 0);
check("静音不写共享桌面", alarmState.o.find((o) => o.id === "t-1")?.endsAt === now0 - 1000);
check("重新开始计时会重新武装", (() => {
  const again = { ...rang, endsAt: now0 + 60000 };
  const done = { ...again, endsAt: now0 - 500 };
  return ringing([done], now0).length === 1;
})());
check("silenceAllAlarms 一次按掉全部", (() => {
  const group = [{ ...rang, id: "t-5", endsAt: now0 - 20 }, { ...rang, id: "t-6", endsAt: now0 - 30 }, stillRunning];
  silenceAllAlarms(group, now0);
  return ringing(group, now0).length === 0;
})());

// ——— 3D 计算器：表达式状态机与求值，面板和摆件共用 ———
check("求值按运算优先级", evalCalc("2+3×4") === 14 && evalCalc("(2+3)×4") === 20);
check("除零与残缺表达式算不出", evalCalc("1÷0") === null && evalCalc("2+") === null && evalCalc("(1") === null);
check("减号用 U+2212 也算得对", evalCalc("9−4") === 5);
check("负数与小数", evalCalc("-1.5+3") === 1.5);
check("calcPress 追加/退格/清空", calcPress("", "7") === "7" && calcPress("7", "⌫") === "" && calcPress("7+1", "C") === "");
check("calcPress 限长 40", calcPress("1".repeat(39), "2").length === 40);
check("等号把表达式收敛成结果", calcPress("7+8", "=") === "15" && calcPress("1÷3", "=") === String(Math.round((1 / 3) * 10000) / 10000));
check("等号遇到残缺表达式保持原样", calcPress("2+", "=") === "2+");
check("fixCalcExpr 剔掉非法字符", fixCalcExpr("a2+3×4;b") === "2+3×4" && fixCalcExpr(123) === "");
const calcAdded = apply(base, addCalcAction("#c8443c"), "甲");
const calcObj = calcAdded.o.find((o) => o.kind === "calc")!;
check("放一个计算器上桌", !!calcObj && calcObj.calc?.expr === "" && footprintOf(calcObj) > 0.03);
check("非法按键不出动作", calcKeyAction(calcObj, "x") === null && calcKeyAction(calcObj, "9") !== null);
check("空表达式按清空不出动作", calcKeyAction(calcObj, "C") === null);
const sevenThen = apply(calcAdded, calcKeyAction(calcObj, "7")!, "甲");
const sevenObj = sevenThen.o.find((o) => o.id === calcObj.id)!;
check("归约按按键推进表达式", sevenObj.calc?.expr === "7");
let calcS = sevenThen;
for (const k of ["+", "8", "="]) calcS = apply(calcS, calcKeyAction(calcS.o.find((o) => o.id === calcObj.id)!, k)!, "甲");
check("连按算出 15", calcS.o.find((o) => o.id === calcObj.id)?.calc?.expr === "15");
check("等号写进桌面记录", calcS.log.some((l) => l.text.includes("15")));
check("计算器同步后保留表达式", api.sanitize(calcS).o.find((o) => o.id === calcObj.id)?.calc?.expr === "15");
const bogus = api.sanitize({ ...base, o: [{ ...calcObj, calc: { expr: "9÷9<script>" } }] });
check("同步收口脏表达式", bogus.o.find((o) => o.id === calcObj.id)?.calc?.expr === "9÷9", bogus.o.find((o) => o.id === calcObj.id)?.calc?.expr);
check("非计算器物件不带表达式", api.sanitize({ ...base, o: [{ ...base.o[0], kind: "token" as const, calc: { expr: "1" } }] }).o.find((o) => o.id === base.o[0].id)?.calc === undefined);

// ——— 贴面高度：区域垫这类薄片不能陷进桌布 ———
const bareY = surfaceY({ o: [] });
check("裸桌面的立足点就在桌布上", bareY === FELT_Y, String(bareY));
check("区域垫浮在桌布之上", bareY + DECAL_LIFT > FELT_Y, `${bareY + DECAL_LIFT} > ${FELT_Y}`);
check("指针光点浮在桌布之上", bareY + 0.0012 > FELT_Y);
const race = starter("rpg", "跑团");
const raceBoard = race.o.find((o) => o.kind === "board");
check("开局棋盘确实存在", !!raceBoard, race.o.map((o) => o.kind).join(","));
if (raceBoard?.board) {
  const top = surfaceY(race, raceBoard.x, raceBoard.z);
  check("棋盘上的立足点按棋盘厚抬高", top === raceBoard.layer * 0.004 + boardThickness(raceBoard.board) && top > FELT_Y, String(top));
  check("棋盘上的区域垫不会被棋盘吃掉", top + DECAL_LIFT > top);
}

// ——— 自带牌堆：条数、字段上限与开局布置 ———
const count = (list: CardSpec[]) => list.length;
const wolf = werewolfDeck();
check("扑克 54 张", count(poker54()) === 54, `${count(poker54())} 张`);
check("狼人杀 18 张角色", count(wolf) === 18, `${count(wolf)} 张`);

const poker = poker54();
const bySuit = new Map<string, number>();
for (const c of poker) if (c.suit) bySuit.set(c.suit, (bySuit.get(c.suit) ?? 0) + 1);
check("四门花色各 13 张", [...bySuit.values()].every((n) => n === 13) && bySuit.size === 4, [...bySuit].map(([s, n]) => `${s}=${n}`).join(" "));
const pips = poker.filter((c) => c.rank).map((c) => `${c.rank}${c.suit}`);
check("52 张点数牌互不重复", new Set(pips).size === pips.length, `去重后 ${new Set(pips).size} / ${pips.length}`);
check("大小王各一张", poker.filter((c) => c.cat === "JOKER").map((c) => c.label).join(",") === "小王,大王");
const badBack = [...poker, ...wolf].filter((c) => !CARD_BACKS.includes(c.back ?? "classic"));
check("卡背都在内置样式里", badBack.length === 0, badBack.map((c) => c.back).join(","));
const oversized = [...poker, ...wolf].filter(
  (c) => (c.label?.length ?? 0) > CARD_LABEL_MAX || (c.text?.length ?? 0) > CARD_TEXT_MAX || (c.cat?.length ?? 0) > CARD_CAT_MAX || (c.art?.length ?? 0) > CARD_ART_MAX,
);
check("没有条目超出字段上限", oversized.length === 0, oversized.map((c) => c.label ?? c.art ?? "?").join(","));
check("带点数的牌读作点数加花色", cardText({ back: "poker", rank: "A", suit: "s" }) === "A♠", cardText({ back: "poker", rank: "A", suit: "s" }));
check("有点数又有牌名的牌两样都报出来", cardText({ back: "poker", rank: "K", suit: "s", label: "跳过" }) === "K♠ 跳过", cardText({ back: "poker", rank: "K", suit: "s", label: "跳过" }));

const overCat = api.sanitize({ ...base, o: [{ ...base.o[0], card: { back: "wolf", label: "狼", cat: "一".repeat(40), art: "狼狼人" }, pile: undefined }] } as TableState).o[0].card;
check("同步收口截断超长类别", (overCat?.cat ?? "").length === CARD_CAT_MAX, `${overCat?.cat?.length} 字`);
check("同步收口保留徽记", overCat?.art === "狼狼人", overCat?.art ?? "无");

const wolfTable = starter("werewolf", "狼人杀局");
check("狼人杀开局带角色堆", (wolfTable.o.find((o) => o.kind === "pile")?.pile?.length ?? 0) === 18, `一堆 ${wolfTable.o.find((o) => o.kind === "pile")?.pile?.length} 张`);
check("狼人杀开局有夜晚计时", wolfTable.o.some((o) => o.kind === "timer" && o.label === "夜晚"));
check("狼人杀整桌同步得出去", JSON.stringify(api.sanitize(wolfTable)).length < 200000, `${JSON.stringify(api.sanitize(wolfTable)).length} 字节`);

/* ——— 高度锁定与俯仰角：锁着不动，解锁才落回 ——— */
const stackTable: TableState = {
  ...base,
  o: [
    { id: "s-1", kind: "card", x: 0.3, z: 0.3, rot: 0, layer: 0, card: { back: "plain", label: "垫底" } },
    { id: "s-2", kind: "card", x: 0.3, z: 0.3, rot: 0, layer: 1, card: { back: "plain", label: "第二层" } },
    { id: "s-3", kind: "token", x: 0.3, z: 0.3, rot: 0, layer: 7, label: "悬空标记" },
  ],
};
const spot = (id: string) => stackTable.o.find((o) => o.id === id)!;
check("落点找空层会爬过叠牌", restLayer(stackTable, spot("s-3"), 0.3, 0.3) === 2, `L${restLayer(stackTable, spot("s-3"), 0.3, 0.3)}`);
check("换个空位就直接贴桌", restLayer(stackTable, spot("s-3"), -0.25, 0.15) === 0);
check("贴面与手牌物件不参与锁定", pinnable(spot("s-1")) && !pinnable({ id: "z", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, zone: { w: 0.5, d: 0.5 } }) && !pinnable({ id: "h", kind: "card", x: 0, z: 0, rot: 0, layer: 0, hand: true }));

const lifted = apply(stackTable, { t: "layer", ids: ["s-3"], delta: 1, pin: true }, "甲");
const floaty = lifted.o.find((o) => o.id === "s-3")!;
check("抬层顺手钉住高度", floaty.layer === 8 && floaty.pin === true, `L${floaty.layer} pin=${String(floaty.pin)}`);

const dragged = apply(lifted, { t: "move", m: [{ id: "s-3", x: -0.2, z: 0.1 }] }, "甲");
const hovering = dragged.o.find((o) => o.id === "s-3")!;
check("锁着拖动不掉层", hovering.layer === 8 && hovering.x === -0.2 && hovering.pin === true, `L${hovering.layer} x${hovering.x}`);

const released = apply(dragged, { t: "pin", ids: ["s-3"], on: false }, "甲");
const fallen = released.o.find((o) => o.id === "s-3")!;
check("解锁后落回贴桌", fallen.layer === 0 && fallen.pin === undefined, `L${fallen.layer} pin=${String(fallen.pin)}`);
check("解锁会写一条日志", released.log[released.log.length - 1]?.text.includes("落回"), released.log[released.log.length - 1]?.text ?? "无");

const pinnedDeck = apply(stackTable, { t: "pin", ids: ["s-1"], on: true }, "甲");
const ontoPinned = apply(pinnedDeck, { t: "move", m: [{ id: "s-2", x: 0.32, z: 0.3, layer: 0 }] }, "甲");
const guard = ontoPinned.o.find((o) => o.id === "s-1")!;
const intruder = ontoPinned.o.find((o) => o.id === "s-2")!;
check("锁定的物件不当路让开", guard.x === 0.3 && guard.z === 0.3, `${guard.x},${guard.z}`);
// 锁着的就是堵路的墙：后到的要么绕开要么落在它头顶，不再叠在它身上
check("后来者被锁定的物件挤开", intruder.x > 0.32 && Math.hypot(intruder.x - guard.x, intruder.z - guard.z) + 0.002 >= 2 * boxOf(guard).hx, `${intruder.x}`);

const turned = apply(stackTable, { t: "rot", ids: ["s-1"], delta: 350 }, "甲");
const turnedAgain = apply(turned, { t: "rot", ids: ["s-1"], delta: 20, pitch: 5 }, "甲");
const spun = turnedAgain.o.find((o) => o.id === "s-1")!;
check("转角累加并归一到 0-359", spun.rot === 10, `${spun.rot}°`);
check("俯仰角按增量累加", spun.tilt === 5, `${spun.tilt}°`);
check("调俯仰角顺手钉住高度", spun.pin === true, `pin=${String(spun.pin)}`);
check("只转平面角不会钉住", turned.o.find((o) => o.id === "s-1")?.pin === undefined);
const overspun = apply(stackTable, { t: "rot", ids: ["s-1"], delta: 0, pitch: 500 }, "甲").o.find((o) => o.id === "s-1")!;
check("俯仰角压在 ±80 以内", overspun.tilt === TILT_MAX, `${overspun.tilt}°`);
const laid = apply(turnedAgain, { t: "pin", ids: ["s-1"], on: false }, "甲").o.find((o) => o.id === "s-1")!;
check("解锁会把牌拍平", laid.tilt === undefined && laid.pin === undefined, `${String(laid.tilt)}`);
// 斜靠的牌绕底面中心立起来，靠桌那条边要抬高同样的量才不插进桌布
const lean = boxOf(spun).hz * Math.sin((spun.tilt ?? 0) * Math.PI / 180);
check("斜靠的基点按俯仰角抬高", Math.abs(liftFor(spun) - lean) < 1e-9 && lean > 0.003, `${lean.toFixed(4)}`);
check("抬高后离桌面的高度含俯仰", Math.abs(baseY(stackTable, spun) - (surfaceY(stackTable, spun.x, spun.z) + spun.layer * LAYER_H + lean)) < 1e-9);
// 立在旁边的长条各让一半宽度就错得开，转 90° 后水平投影本来就不重叠
const bars: TableState = {
  ...base,
  o: [
    { id: "b-1", kind: "cube", shape: "bar", x: 0, z: 0, rot: 0, layer: 0 },
    { id: "b-2", kind: "cube", shape: "bar", x: 0.05, z: 0, rot: 90, layer: 0 },
  ],
};
const nudged = apply(bars, { t: "move", m: [{ id: "b-1", x: -0.01, z: 0, layer: 0 }] }, "甲");
check("转 90 度的长条互不挤靠", nudged.o.every((o) => o.x === (o.id === "b-1" ? -0.01 : 0.05)), `${nudged.o.map((o) => o.x).join("/")}`);
// 斜靠会把占高撑到几十毫米，落点得爬到它的头顶才不穿模
const leaning: TableState = {
  ...base,
  o: [{ id: "l-1", kind: "card", x: 0.3, z: 0.3, rot: 0, layer: 0, tilt: 60, pin: true, card: { back: "plain" } }],
};
check("平铺的牌只把落点顶起一层", restLayer({ ...base, o: [{ id: "f-1", kind: "card", x: 0.3, z: 0.3, rot: 0, layer: 0, card: { back: "plain" } }] }, { id: "f-2", kind: "card", x: 0.3, z: 0.3, rot: 0, layer: 0, card: { back: "plain" } }, 0.3, 0.3) === 1);
const climb = restLayer(leaning, { id: "f-2", kind: "card", x: 0.3, z: 0.3, rot: 0, layer: 0, card: { back: "plain" } }, 0.3, 0.3);
check("斜靠的牌把落点顶到它头顶", climb >= 18 && climb <= 24, `L${climb}`);

const wildPose = api.sanitize({
  ...stackTable,
  o: [
    { id: "s-9", kind: "card", x: 0, z: 0, rot: 0, layer: 0, tilt: 200, pin: "yes", card: { back: "plain" } } as unknown as GameObject,
    { id: "s-7", kind: "card", x: 0, z: 0, rot: 0, layer: 0, tilt: 200, pin: true, card: { back: "plain" } } as unknown as GameObject,
    { id: "s-8", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, pin: true, zone: { w: 0.5, d: 0.5 } } as GameObject,
  ],
});
check("同步收口夹住俯仰角", wildPose.o.find((o) => o.id === "s-7")?.tilt === TILT_MAX, `${wildPose.o.find((o) => o.id === "s-7")?.tilt}`);
check("同步收口丢掉非布尔锁定", wildPose.o.find((o) => o.id === "s-9")?.pin === undefined);
check("没锁定的俯仰角留不住", wildPose.o.find((o) => o.id === "s-9")?.tilt === undefined);
check("贴面物件的锁定被抹掉", wildPose.o.find((o) => o.id === "s-8")?.pin === undefined);

/* ——— 摸牌侧面弹出 / 精确取出 / 空牌堆自毁 / 吸附对齐 / 统计垫 ——— */
const three = apply(base, addPileAction([
  { back: "plain", label: "底牌" },
  { back: "plain", label: "中牌" },
  { back: "plain", label: "顶牌" },
], "#3d7fbf"), "甲");
const tp = three.o.filter((o) => o.kind === "pile").at(-1)!;
const seats: TableState = { ...three, players: [{ id: "me-1", name: "甲", color: "#c8443c" }, { id: "me-2", name: "乙", color: "#3d7fbf" }] };
const ejectA = ejectSpots(seats, tp, 2, "me-1");
const ejectB = ejectSpots(seats, tp, 2, "me-2");
check("弹出点落在牌堆外侧", ejectA.every((sp) => Math.hypot(sp.x - tp.x, sp.z - tp.z) >= footprintOf(tp) - 1e-6), ejectA.map((sp) => `${sp.x},${sp.z}`).join(" "));
check("一次两张会横向排开", Math.hypot(ejectA[1].x - ejectA[0].x, ejectA[1].z - ejectA[0].z) > 0.02);
check("各人朝自己的座位方向摸牌", Math.hypot(ejectA[0].x - ejectB[0].x, ejectA[0].z - ejectB[0].z) > 0.05, `${ejectA[0].x},${ejectA[0].z} vs ${ejectB[0].x},${ejectB[0].z}`);
check("两张牌的朝向一致", ejectA[0].rot === ejectA[1].rot, `${ejectA[0].rot}°`);

const drained = apply(seats, drawAction(seats, tp.id, 3, "me-1")!, "甲");
check("摸光的牌堆自己消失", !drained.o.some((o) => o.id === tp.id) && drained.o.filter((o) => o.kind === "card").length === 3, `${drained.o.length} 个物件`);
const emptiedBox = apply(boxed, drawAction(boxed, box.id, 3, "甲")!, "甲");
check("摸空的卡牌盒仍然留在桌上", emptiedBox.o.some((o) => o.id === box.id) && (emptiedBox.o.find((o) => o.id === box.id)?.pile ?? []).length === 0);
check("开局刻意留的空牌堆不会被顺手删掉", (() => {
  // 潮汐开局自带一块空的「沉潮」，摸走潮库一张不该把它顺手带走
  const table = starter("tide", "潮汐桌");
  const src = table.o.find((o) => (o.pile?.length ?? 0) === 40)!;
  const after = apply(table, drawAction(table, src.id, 1, "甲")!, "甲");
  return after.o.filter((o) => o.kind === "pile" && !(o.pile?.length)).length === 1;
})());

const tookMid = apply(seats, pullCardAction(seats, tp.id, 1, "me-1")!, "甲");
const outCards = tookMid.o.filter((o) => o.kind === "card");
check("按下标精确取出中间那张", outCards.length === 1 && outCards[0].card?.label === "中牌", outCards.map((o) => o.card?.label).join(","));
check("取出后堆里只剩上下两张", (tookMid.o.find((o) => o.id === tp.id)?.pile ?? []).map((c) => c.label).join(",") === "底牌,顶牌");
const pulledHand = apply(seats, pullCardAction(seats, tp.id, 0, "me-1", true)!, "甲");
check("精确取进手牌不落到桌面", pulledHand.o.filter((o) => o.hand && o.owner === "me-1").length === 1 && !pulledHand.o.some((o) => o.kind === "card" && !o.hand));
check("下标越界不生成动作", pullCardAction(seats, tp.id, 9, "me-1") === null);
const pullAct = pullCardAction(seats, tp.id, 2, "me-1")!;
const r1 = apply(seats, pullAct, "甲");
const r2 = apply(seats, pullAct, "乙");
check("两端重放同一次取出落点一致", JSON.stringify(r1.o.map((o) => [o.x, o.z, o.rot, o.card?.label])) === JSON.stringify(r2.o.map((o) => [o.x, o.z, o.rot, o.card?.label])));
const oneLeft = apply(r1, pullCardAction(r1, tp.id, 1, "me-1")!, "甲");
check("还剩一张时牌堆留着", oneLeft.o.some((o) => o.id === tp.id) && (oneLeft.o.find((o) => o.id === tp.id)?.pile ?? []).length === 1);
check("摘到最后一张时牌堆消失", apply(oneLeft, pullCardAction(oneLeft, tp.id, 0, "me-1")!, "甲").o.some((o) => o.id === tp.id) === false);

const alignState: TableState = {
  ...base,
  o: [
    { id: "a-1", kind: "token", x: 0.2, z: 0.2, rot: 0, layer: 0, label: "参照" },
    { id: "a-2", kind: "token", x: -0.44, z: -0.1, rot: 0, layer: 0, label: "待对齐" },
    { id: "h-9", kind: "card", x: 0.44, z: 0.3, rot: 0, layer: 0, hand: true, owner: "me-1", card: { back: "plain" } },
  ],
};
const ref = alignState.o[0];
const nearMiss = alignState.o[1];
check("靠近中心点会吸齐", snapTo(alignState, nearMiss, ref.x + 0.006, -0.1).x === ref.x, JSON.stringify(snapTo(alignState, nearMiss, ref.x + 0.006, -0.1)));
check("贴着边缘也能对齐到边线", (() => { const s = snapTo(alignState, nearMiss, ref.x + footprintOf(ref) + 0.004, -0.1); return Math.abs(s.x - (ref.x + footprintOf(ref))) < 1e-9; })());
check("离得远的不会被硬拽走", (() => { const s = snapTo(alignState, nearMiss, 0.25, -0.12); return s.x === 0.25 && s.z === -0.12; })());
check("手里的牌不做吸附目标", snapTo(alignState, nearMiss, 0.446, 0.3).x === 0.446);
check("棋盘自己不对齐", snapTo(alignState, { id: "b", kind: "board", x: 0, z: 0, rot: 0, layer: 0 }, ref.x + 0.006, 0.1).x === ref.x + 0.006);

const padTable: TableState = {
  ...base,
  o: [
    { id: "m-1", kind: "stat", color: "#c8443c", x: 0.1, z: 0.1, rot: 0, layer: 0, label: "出牌方向", stat: { w: 0.6, d: 0.6 } },
    { id: "m-2", kind: "card", x: 0.1, z: 0.1, rot: 0, layer: 0, card: { back: "plain", label: "竖着" } },
    { id: "m-3", kind: "card", x: 0.2, z: 0.15, rot: 90, layer: 0, card: { back: "plain", label: "横着" } },
    { id: "m-4", kind: "card", x: 0.9, z: 0.9, rot: 0, layer: 0, card: { back: "plain", label: "垫外" } },
  ],
};
const pad = padTable.o[0];
const tally = statCards(padTable, pad);
check("统计垫只数垫上的牌", tally.up === 1 && tally.side === 1, `竖${tally.up} 横${tally.side}`);
check("长边立着算竖放、转 90 度算横放", cardLie(pad, padTable.o[1]) === "up" && cardLie(pad, padTable.o[2]) === "side");
const laidOn = apply(padTable, { t: "move", m: [{ id: "m-4", x: 0.1, z: -0.05 }] }, "甲");
check("牌压在统计垫上不会把它挤走", (() => { const p = laidOn.o.find((o) => o.id === "m-1")!; return p.x === 0.1 && p.z === 0.1; })());
check("挪进垫子的牌立刻计入统计", (() => { const t2 = statCards(laidOn, laidOn.o.find((o) => o.id === "m-1")!); return t2.up + t2.side === 3; })());
check("统计垫不参与高度锁定", !pinnable(pad));
const madePad = apply(base, addStatMatAction("#c8443c", 0.5, 0.5), "甲");
const newPad = madePad.o.find((o) => o.kind === "stat")!;
check("放下统计垫自带尺寸", !!newPad && newPad.stat?.w === 0.5 && newPad.stat?.d === 0.5 && newPad.lock === undefined, JSON.stringify(newPad?.stat));
const padLocked = apply(madePad, padLockAction(newPad, true)!, "甲");
const lockedPad = padLocked.o.find((o) => o.id === newPad.id)!;
check("锁定写进共享状态", lockedPad.lock === true);
check("锁定后对谁都不可选中", lockedOut(lockedPad, padLocked, "甲") && lockedOut(lockedPad, padLocked, "乙"));
const padOpen = apply(padLocked, padLockAction(lockedPad, false)!, "甲");
check("解锁把字段抹干净", padOpen.o.find((o) => o.id === newPad.id)?.lock === undefined);
check("解锁后又能选中", !lockedOut(padOpen.o.find((o) => o.id === newPad.id)!, padOpen, "甲"));
check("垫子放大封顶", apply(padOpen, statResizeAction(padOpen.o.find((o) => o.id === newPad.id)!, 2)!, "甲").o.find((o) => o.id === newPad.id)?.stat?.w === STAT_MAX);
check("垫子缩小封底", apply(padOpen, statResizeAction(padOpen.o.find((o) => o.id === newPad.id)!, -2)!, "甲").o.find((o) => o.id === newPad.id)?.stat?.w === STAT_MIN);
check("动作打在普通物件上会被忽略", apply(padTable, { t: "lock", id: "m-2", on: true }, "甲").o.find((o) => o.id === "m-2")?.lock === undefined);
const wildStat = api.sanitize({ ...padTable, o: [
  { id: "w-1", kind: "stat", x: 0, z: 0, rot: 0, layer: 0, stat: { w: 9, d: 0.2 }, lock: "yes" } as unknown as GameObject,
  { id: "w-2", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain" }, stat: { w: 0.5, d: 0.5 }, lock: true } as unknown as GameObject,
] });
check("同步收口夹住垫子尺寸", wildStat.o[0].stat?.w === STAT_MAX, `${wildStat.o[0].stat?.w}`);
check("同步收口把非法锁定归为未锁定", wildStat.o[0].lock !== true);
check("别的种类带不上 stat/lock", wildStat.o[1].stat === undefined && wildStat.o[1].lock === undefined);
// 锁住的棋盘对谁都点不中：下棋时不怕谁顺手把盘抽走，解锁只认盘角那颗按钮
const boardAsMat = { ...base, o: [{ id: "b-lock", kind: "board" as const, x: 0, z: 0, rot: 0, layer: 0, lock: true, board: { layout: "mat" as const, cols: 12, rows: 7, cell: 0.1, theme: "felt" as const } }] };
check("锁住的棋盘对谁都点不中", lockedOut(boardAsMat.o[0], boardAsMat, "甲") && lockedOut(boardAsMat.o[0], boardAsMat, "乙"));
check("本地单人也只能按盘角按钮解锁锁住的棋盘", lockedOut(boardAsMat.o[0], boardAsMat, ""));
// 锁只挡住「谁把盘拖走」，不挡住下棋：落格吸附纯靠几何，锁着照样往格心里吸
const lockedGrid = { ...base, o: [{ id: "b-snap", kind: "board" as const, x: 0.3, z: -0.2, rot: 0, layer: 0, lock: true, board: { layout: "grid" as const, cols: 8, rows: 8, cell: 0.05, theme: "wood" as const } }] };
const snapped = snap(lockedGrid, 0.3 + 0.07, -0.2 - 0.06);
check("锁住的棋盘照样吸附落格", snapped.cell === 21 && snapped.x === 0.375 && snapped.z === -0.275, JSON.stringify(snapped));

// ——— 桌垫锁定：跟统计垫同一套锁，锁上以后只留角上那颗解锁按钮 ———
const matLocked = apply(matted, padLockAction(mat, true)!, "甲");
const matNow = matLocked.o.find((o) => o.id === mat.id)!;
check("桌垫能上锁", matNow.lock === true && !!matNow.board && matNow.board.layout === "mat", JSON.stringify({ lock: matNow.lock, board: matNow.board?.layout }));
check("锁住的桌垫对谁都点不中", lockedOut(matNow, matLocked, "甲") && lockedOut(matNow, matLocked, "乙"));
check("桌垫锁不吃统计垫的尺寸", matNow.stat === undefined);
const matOpen = apply(matLocked, padLockAction(matNow, false)!, "甲");
check("桌垫解锁把字段抹干净", matOpen.o.find((o) => o.id === mat.id)?.lock === undefined);
check("解锁后的桌垫又能点中", !lockedOut(matOpen.o.find((o) => o.id === mat.id)!, matOpen, "甲"));
const gridOnly = { ...matted, o: [{ id: "b-grid", kind: "board" as const, x: 0, z: 0, rot: 0, layer: 0, board: { layout: "grid" as const, cols: 8, rows: 8, cell: 0.05, theme: "wood" as const } }] };
check("棋盘也能整盘上锁", apply(gridOnly, { t: "lock", id: "b-grid", on: true }, "甲").o.find((o) => o.id === "b-grid")?.lock === true);
const wildMat = api.sanitize({ ...base, o: [
  { id: "b-1", kind: "board", x: 0, z: 0, rot: 0, layer: 0, lock: true, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "image", img: "ik3ccccc" } },
  { id: "b-2", kind: "board", x: 0, z: 0, rot: 0, layer: 0, lock: true, board: { layout: "grid", cols: 8, rows: 8, cell: 0.05, theme: "wood" } },
] });
check("同步收口留住桌垫的锁", wildMat.o[0].lock === true, JSON.stringify(wildMat.o[0].lock));
check("同步收口留住棋盘的锁", wildMat.o[1].lock === true, JSON.stringify(wildMat.o[1].lock));
check("没锁的棋盘不带 lock 字段", wildMat.o[1].grid === undefined && apply({ ...base, o: wildMat.o }, { t: "lock", id: "nope", on: true }, "甲").o.length === 2);

// ——— 卡槽带 / 摊齐 / 整堆倒走 ———
const stripTable: TableState = {
  ...base,
  o: [
    { id: "s-1", kind: "slot", color: "#c8443c", x: 0.3, z: 0.3, rot: 0, layer: 0, label: "出牌列", slot: { n: 3 } },
    { id: "s-2", kind: "card", x: 0.228, z: 0.3, rot: 0, layer: 0, card: { back: "plain", label: "左" } },
    { id: "s-3", kind: "card", x: 0.36, z: 0.3, rot: 0, layer: 0, card: { back: "plain", label: "右" } },
    { id: "s-4", kind: "card", x: 0.3, z: 0.345, rot: 0, layer: 0, card: { back: "plain", label: "中" } },
    { id: "s-5", kind: "card", x: -0.3, z: -0.3, rot: 0, layer: 0, card: { back: "plain", label: "带外" } },
  ],
};
const strip = stripTable.o[0];
const madeStrip = apply(base, addSlotAction("#c8443c", 5), "甲");
const newStrip = madeStrip.o.find((o) => o.kind === "slot")!;
check("放下卡槽带自带格数", !!newStrip && newStrip.slot?.n === 5, JSON.stringify(newStrip?.slot));
check("卡槽带加一格", apply(madeStrip, slotResizeAction(newStrip, 1)!, "甲").o.find((o) => o.id === newStrip.id)?.slot?.n === 6);
check("格数封顶", apply(madeStrip, slotResizeAction(newStrip, 99)!, "甲").o.find((o) => o.id === newStrip.id)?.slot?.n === SLOT_MAX);
check("格数封底", apply(madeStrip, slotResizeAction(newStrip, -99)!, "甲").o.find((o) => o.id === newStrip.id)?.slot?.n === SLOT_MIN);
check("改格数打在别的种类上会被忽略", apply(stripTable, { t: "slot", id: "s-2", n: 4 }, "甲").o.find((o) => o.id === "s-2")?.slot === undefined);
const wildSlot = api.sanitize({ ...stripTable, o: [
  { id: "q-1", kind: "slot", x: 0, z: 0, rot: 0, layer: 0, slot: { n: 99 } } as unknown as GameObject,
  { id: "q-2", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain" }, slot: { n: 3 } } as unknown as GameObject,
] });
check("同步收口夹住格数", wildSlot.o[0].slot?.n === SLOT_MAX, `${wildSlot.o[0].slot?.n}`);
check("别的种类带不上 slot", wildSlot.o[1].slot === undefined);
check("带子只数摊在带上的牌", slotCards(stripTable, strip).join(",") === "s-2,s-3,s-4", slotCards(stripTable, strip).join(","));
check("牌拖到带子上才找得到槽", slotAt(stripTable, 0.33, 0.3)?.id === "s-1" && slotAt(stripTable, -0.3, -0.3) === null);
check("已被占住的格子让位给下一格", slotNear(stripTable, strip, 0.25, 0.3)?.i === 1, JSON.stringify(slotNear(stripTable, strip, 0.25, 0.3)));
check("离格子太远就不硬拽", slotNear(stripTable, strip, 0.3, 0.5) === null);
const tidied = apply(stripTable, tidyAction(stripTable, strip)!, "甲");
// 摊齐照的是「从左到右原来的顺序」，s-4 的横坐标夹在中间，所以它落第二格
const onStrip = ["s-2", "s-4", "s-3"].map((id) => tidied.o.find((o) => o.id === id)!);
check("摊齐把带上的牌排进格子", onStrip.every((o, i) => {
  const at = slotSpot(strip, i);
  return Math.abs(o.x - at.x) < 1e-6 && Math.abs(o.z - at.z) < 1e-6 && o.layer === 0;
}), onStrip.map((o) => `${o.x},${o.z},${o.rot}`).join(" "));
check("摊齐按从左到右的原顺序", onStrip.map((o) => o.card?.label).join(",") === "左,中,右", onStrip.map((o) => o.card?.label).join(","));
check("带外的牌不受影响", tidied.o.find((o) => o.id === "s-5")?.x === -0.3);
const wide = apply(stripTable, { t: "slot", id: "s-1", n: 2 }, "甲");
check("格子不够时只排得下前几格", (() => { const a = tidyAction(wide, wide.o.find((o) => o.id === "s-1")!); return !!a && a.t === "move" && a.m.length <= 2; })());
check("空带子摊齐不出动作", tidyAction({ ...stripTable, o: stripTable.o.filter((o) => o.kind === "slot") }, strip) === null);
const zoneTidy = apply(base, addZoneAction("#3d7fbf", 0.5, 0.4), "甲");
const zoneMat = zoneTidy.o.find((o) => o.kind === "zone")!;
const scattered: TableState = {
  ...zoneTidy,
  o: [zoneMat, ...[0, 1, 2, 3].map((i) => ({ id: `z-${i}`, kind: "card" as const, x: zoneMat.x - 0.06 + i * 0.01, z: zoneMat.z + 0.02 - i * 0.03, rot: 0, layer: 0, card: { back: "plain" as const, label: `${i}` } }))],
};
const zoneTidied = apply(scattered, tidyAction(scattered, zoneMat)!, "甲");
check("摊齐本区把牌铺成区域网格", (() => {
  const spots = zoneSpots(zoneMat, 4);
  return [0, 1, 2, 3].every((i) => {
    const o = zoneTidied.o.find((x) => x.id === `z-${i}`)!;
    return Math.abs(o.x - spots[i].x) < 1e-6 && Math.abs(o.z - spots[i].z) < 1e-6;
  });
})(), [0, 1, 2, 3].map((i) => { const o = zoneTidied.o.find((x) => x.id === `z-${i}`)!; return `${o.x},${o.z}`; }).join(" "));

const src = apply(base, addPileAction([{ back: "plain", label: "A" }, { back: "plain", label: "B" }, { back: "plain", label: "C" }], "#c8443c"), "甲");
const discard = src.o.filter((o) => o.kind === "pile").at(-1)!;
const intoBox = apply(src, addBoxAction([], "#3d7fbf"), "甲");
const boxTarget = intoBox.o.find((o) => o.kind === "box" && !(o.pile?.length))!;
const poured = apply(intoBox, pourAction(intoBox.o, discard.id, boxTarget.id)!, "甲");
const pouredBox = poured.o.find((o) => o.id === boxTarget.id)!;
check("整堆倒进容器会接上牌序", pouredBox.pile?.map((c) => c.label).join(",") === "A,B,C", pouredBox.pile?.map((c) => c.label).join(","));
check("倒空的牌堆自己消失", !poured.o.some((o) => o.id === discard.id));
const flipped = apply(intoBox, pourAction(intoBox.o, discard.id, boxTarget.id, true)!, "甲");
check("翻面倒回去正好接上原序", flipped.o.find((o) => o.id === boxTarget.id)?.pile?.map((c) => c.label).join(",") === "C,B,A");
const stuffed = apply(intoBox, { t: "pileSet", id: boxTarget.id, cards: Array.from({ length: 300 }, (_, i) => ({ back: "plain" as const, label: `满${i}` })) }, "甲");
const spill = apply(stuffed, pourAction(stuffed.o, discard.id, boxTarget.id)!, "甲");
check("牌堆不再限量：整堆倒进已有 300 张的盒子也全收", spill.o.find((o) => o.id === boxTarget.id)?.pile?.length === 303, `盒里 ${spill.o.find((o) => o.id === boxTarget.id)?.pile?.length} 张`);
check("倒完的源堆清空", !spill.o.some((o) => o.id === discard.id));
check("自己倒自己不成立", pourAction(intoBox.o, discard.id, discard.id) === null);
check("散牌当不倒也接不住", pourAction(intoBox.o, discard.id, intoBox.o.find((o) => o.kind === "card")?.id ?? "nope") === null);
check("空容器之间倒不出动作", pourAction(poured.o, boxTarget.id, discard.id) === null);

// ——— 拖动落点结算（渲染层与归约共用那一份「看到的即落下的」）———
const dragStrip: GameObject = { id: "d-1", kind: "slot", color: "#c8443c", x: 0.3, z: 0.3, rot: 30, layer: 0, label: "列", slot: { n: 3 } };
const dragTable: TableState = {
  ...base,
  o: [
    dragStrip,
    { id: "d-2", kind: "card", x: -0.2, z: -0.2, rot: 0, layer: 0, card: { back: "plain", label: "一张" } },
    { id: "d-3", kind: "card", x: -0.24, z: -0.24, rot: 0, layer: 0, card: { back: "plain", label: "二张" } },
    { id: "d-4", kind: "card", x: -0.28, z: -0.28, rot: 0, layer: 0, card: { back: "plain", label: "三张" } },
  ],
};
const dropOne = resolveDrop(dragTable, [{ id: "d-2", x: 0.234, z: 0.298 }]);
check("拖到带子上会吸进格子中心", (() => {
  const at = slotSpot(dragStrip, 0);
  const m = dropOne[0];
  return Math.abs(m.x - at.x) < 1e-6 && Math.abs(m.z - at.z) < 1e-6;
})(), JSON.stringify(dropOne[0]));
check("吸进格子会转到带子的朝向", dropOne[0].rot === 30, `${dropOne[0].rot}`);
const dropThree = resolveDrop(dragTable, [
  { id: "d-2", x: 0.24, z: 0.3 },
  { id: "d-3", x: 0.29, z: 0.31 },
  { id: "d-4", x: 0.35, z: 0.3 },
]);
check("一次拖三张各占一格不抢位", (() => {
  const idx = dropThree.map((m) => {
    for (let i = 0; i < 3; i++) {
      const at = slotSpot(dragStrip, i);
      if (Math.abs(m.x - at.x) < 1e-6 && Math.abs(m.z - at.z) < 1e-6) return i;
    }
    return -1;
  });
  return idx.every((i) => i >= 0) && new Set(idx).size === 3;
})(), dropThree.map((m) => `${m.x},${m.z}`).join(" "));
const dropOff = resolveDrop(dragTable, [{ id: "d-2", x: -0.2, z: 0.4 }]);
check("拖在带子外正常落桌面", (() => { const m = dropOff[0]; return m.rot === undefined && Math.abs(m.z - 0.4) < 0.02; })(), JSON.stringify(dropOff[0]));
const reDrop = resolveDrop(dragTable, dropThree.map((m) => ({ id: m.id, x: m.x, z: m.z })));
check("松手再算一遍位置不变", JSON.stringify(reDrop.map((m) => [m.id, m.x, m.z])) === JSON.stringify(dropThree.map((m) => [m.id, m.x, m.z])));
const rigidZone: TableState = {
  ...base,
  o: [
    { id: "r-1", kind: "zone", color: "#3d7fbf", x: 0, z: 0, rot: 0, layer: 0, label: "出牌", zone: { w: 0.4, d: 0.3 } },
    { id: "r-2", kind: "card", x: 0.05, z: 0.02, rot: 0, layer: 0, card: { back: "plain", label: "圈里" } },
    { id: "r-3", kind: "card", x: 0.08, z: 0.05, rot: 0, layer: 0, card: { back: "plain", label: "压着" } },
  ],
};
const zoneMove = resolveDrop(rigidZone, [{ id: "r-1", x: 0.3, z: 0.2 }, { id: "r-2", x: 0.35, z: 0.22 }, { id: "r-3", x: 0.38, z: 0.25 }], true);
check("刚性拖动保持组内相对位置", (() => {
  const before = new Map(rigidZone.o.map((o) => [o.id, o]));
  return zoneMove.every((m) => {
    const o = before.get(m.id)!;
    return Math.abs((m.x - o.x) - 0.3) < 1e-6 && Math.abs((m.z - o.z) - 0.2) < 1e-6;
  });
})(), zoneMove.map((m) => `${m.x},${m.z}`).join(" "));
check("刚性那一批不会被挤开或塌落", zoneMove.every((m) => m.layer === 0) && zoneMove.length === 3);

// ——— 拖动帧的读端：服务器给什么形状都不可信，读不出来就当没收到 ———
const dragOk = readDrag({ t: "drag", by: "甲", color: "#c8443c", m: [{ id: "d1", x: 0.4, z: -0.2, rot: 45 }, { id: "d2", x: "0.1", z: 0.2 }] });
check("拖动帧收下合法的那几张", !!dragOk && dragOk.m.length === 1 && dragOk.m[0].rot === 45 && dragOk.by === "甲", JSON.stringify(dragOk?.m ?? null));
check("拖动帧按人数分好颜色", dragOk?.color === "#c8443c");
check("缺发起人的拖动帧作废", readDrag({ t: "drag", color: "#c8443c", m: [{ id: "d1", x: 0.1, z: 0.1 }] }) === null);
check("一张都不合法的拖动帧作废", readDrag({ t: "drag", by: "甲", color: "#c8443c", m: [{ id: "d1", x: NaN, z: 0.1 }] }) === null);
check("拖动帧不是数组也作废", readDrag({ t: "drag", by: "甲", m: "d1" }) === null);
const manyDrag = readDrag({ t: "drag", by: "甲", color: "#c8443c", m: Array.from({ length: 60 }, (_, i) => ({ id: `d${i}`, x: 0.1, z: 0.1 })) });
check("拖动帧按服务器额度截断", !!manyDrag && manyDrag.m.length === 24, `${manyDrag?.m.length} 张`);
const noColor = readDrag({ t: "drag", by: "甲", m: [{ id: "d1", x: 0.1, z: 0.1 }] });
check("没带颜色的拖动帧用兜底色", noColor?.color === "#c8443c");
check("没标模式的帧按拖动处理", noColor?.s === "drag" && dragOk?.s === "drag");

// ——— 选中帧：位置和拖动帧一样是装饰，关键是小图标能不能挂上、松手能不能收掉 ———
const pickOk = readDrag({ t: "drag", by: "甲", color: "#3f7f5f", s: "pick", m: [{ id: "d1", x: 0.1, z: 0.1 }, { id: "bad" }] });
check("选中帧收下合法的那几件", !!pickOk && pickOk.s === "pick" && pickOk.m.length === 1, JSON.stringify(pickOk?.m ?? null));
check("选中帧空着也收：那是「他把选中的全松了」", !!readDrag({ t: "drag", by: "甲", s: "pick", m: [] }));
check("空拖动帧仍然作废：拖动至少要有一件", readDrag({ t: "drag", by: "甲", s: "drag", m: [] }) === null);

// ——— 压缩包读取：手搓一个 zip，验条目过滤、自然序与两种存法的字节还原 ———
// 这里喂的是假图片字节——容器解析与图片解码是两件事，后者要画布，浏览器里才测
type ZipLike = { name: string; data: Uint8Array; method?: number; flags?: number };
const utf8 = new TextEncoder();
const zipRaw = (text: string): Uint8Array<ArrayBuffer> => utf8.encode(text);
const zipConcat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const all = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
};
const zipHead = (size: number): [Uint8Array<ArrayBuffer>, DataView] => {
  const buf = new Uint8Array(new ArrayBuffer(size));
  return [buf, new DataView(buf.buffer)];
};
function zipBytes(entries: ZipLike[]): Uint8Array<ArrayBuffer> {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  for (const e of entries) {
    const name = utf8.encode(e.name);
    const method = e.method ?? 0;
    const body = method === 8 ? new Uint8Array(deflateRawSync(Buffer.from(e.data))) : e.data;
    const [local, lv] = zipHead(30);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, e.flags ?? 0, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    locals.push(local, name, body);
    const [cd, cv] = zipHead(46);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, e.flags ?? 0, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, at, true);
    central.push(cd, name);
    at += 30 + name.length + body.length;
  }
  const cdBytes = zipConcat(central);
  const [eocd, ev] = zipHead(22);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdBytes.length, true);
  ev.setUint32(16, at, true);
  return zipConcat([...locals, cdBytes, eocd]);
}
async function zipChecks(): Promise<void> {
  const zipArchive = new Blob([zipBytes([
    { name: "cards/卡10.png", data: zipRaw("PNG-10") },
    { name: "cards/卡2.png", data: zipRaw("PNG-2"), method: 8 },
    { name: "卡1.jpeg", data: zipRaw("JPEG-1"), method: 8 },
    { name: "缩略图.gif", data: zipRaw("GIF-1") },
    { name: "rules/readme.txt", data: zipRaw("不是图片") },
    { name: "加密卡.png", data: zipRaw("SECRET"), flags: 1 },
    { name: "怪算法.png", data: zipRaw("BZIP"), method: 12 },
    { name: "__MACOSX/._卡10.png", data: zipRaw("资源叉") },
    { name: "空目录/", data: zipRaw("") },
  ])]);
  const zipItems = await readZipImages(zipArchive);
  check("压缩包只认图片，按名字自然序排好", zipItems.map((i) => i.name).join(",") === "卡1.jpeg,卡2.png,卡10.png,缩略图.gif", zipItems.map((i) => i.name).join(","));
  check("deflate 条目能还原成原字节", (await zipItems[0].blob())?.size === "JPEG-1".length);
  const stored = await zipItems[2].blob();
  check("store 条目直接给原字节并带上图片 MIME", stored?.type === "image/png" && stored?.size === "PNG-10".length, stored?.type);
  const deflated = await zipItems[1].blob();
  check("读得出的条目内容对得上", (deflated ? await deflated.text() : "") === "PNG-2");
  let zipError = "";
  try {
    await readZipImages(new Blob([zipRaw("这根本不是压缩包")]));
  } catch (error) {
    zipError = error instanceof Error ? error.message : String(error);
  }
  check("不是压缩包会明确报错而不是静默", /zip/.test(zipError), zipError);
  check("自然序比较把 2 排在 10 前", compareZipNames("卡2.png", "卡10.png") < 0);
}

// ——— 存档回执的两种形状：HTTP 给顶层 id，实时把 id 让给帧号、存档号走 romId ———
function romWireChecks(): void {
  const saved = readRomSave({ id: 12, ok: true, romId: "ab12cd34", updatedAt: 99, token: "deadbeef" });
  check("实时回执里的存档号按 romId 读回并大写", saved.id === "AB12CD34" && saved.token === "deadbeef" && saved.updatedAt === 99, JSON.stringify(saved));
  check("HTTP 回执仍按顶层 id 读", readRomSave({ ok: true, id: "AB12CD34", updatedAt: 1 }).id === "AB12CD34");
  const got = readRom({ id: 13, ok: true, romId: "AB12CD34", title: "档", note: "", owner: "甲", createdAt: 1, updatedAt: 2, objects: 4, state: starter("cards", "存档") });
  check("romGet 的实时回复能还原成一份存档", got.id === "AB12CD34" && got.state.o.length === 4);
  check("帧号顶掉存档号的旧形状会被判成坏回复", (() => { try { readRomSave({ id: 12, ok: true }); return false; } catch { return true; } })());
}

// ——— 浏览器缓存：桌况快照、离线桌子按名字归位、存档列表与口令 ———
const cacheMemory = new Map<string, string>();
const cacheGlobal = globalThis as Record<string, unknown>;
cacheGlobal.localStorage = {
  getItem: (key: string) => (cacheMemory.has(key) ? cacheMemory.get(key)! : null),
  setItem: (key: string, value: string) => void cacheMemory.set(key, value),
  removeItem: (key: string) => void cacheMemory.delete(key),
  key: (index: number) => [...cacheMemory.keys()][index] ?? null,
  get length() {
    return cacheMemory.size;
  },
};
cacheGlobal.window = { setTimeout: () => 1, clearTimeout: () => {}, addEventListener: () => {} };

function cacheChecks(): void {
  const table = (name: string): TableState => ({ ...starter("cards", name) });
  const doomed: TableState = { ...table("大桌"), o: [...table("大桌").o, { id: "big", kind: "text" as const, x: 0, z: 0, rot: 0, layer: 0, label: "字".repeat(800000) }] };

  cacheRoom("ab12cd", table("联机牌桌"), 7);
  cacheRoom("ZZ6677", doomed, 2);
  cacheLocalTable(table("离线自建房"), 1);
  cacheLocalTable(table("离线自建房"), 4);
  cacheLocalTable({ ...table("空的"), o: [] }, 1);
  const rows = localTables();
  check("缓存把联网桌与离线桌都记下来", rows.length === 3 && rows.some((r) => r.room === "AB12CD") && rows.some((r) => r.room === null), rows.map((r) => `${r.key}@v${r.version}`).join(","));
  check("同名离线桌只占一条，改桌面不新增", rows.filter((r) => r.name === "离线自建房").length === 1);
  check("空桌面不进缓存", !rows.some((r) => r.name === "空的"));
  check("联网快照能按房间码读回来", cachedRoom("ab12cd")?.name === "联机牌桌" && takeLocalTable("room:AB12CD")?.o.length === 4);
  const offline = takeLocalTable(rows.find((r) => r.room === null)!.key);
  check("离线桌读到的是最后一次写的桌面", offline?.name === "离线自建房");
  check("超体积的快照退化成只有名字", rows.find((r) => r.name === "大桌")?.hasState === false && rows.find((r) => r.name === "大桌")?.objects === 5 && takeLocalTable("room:ZZ6677") === null);
  const corrupted: TableState = { ...table("脏"), o: [{ id: "ok", kind: "die", x: 0.1, z: 0.1, rot: 0, layer: 0 }, { id: "bad", kind: "die", x: "0.2" as unknown as number, z: 0, rot: 0, layer: 0 }] };
  cacheRoom("dirty1", corrupted, 1);
  check("读缓存时按服务端同一套规则剔掉坏物件", cachedRoom("DIRTY1")?.o.length === 1 && cachedRoom("DIRTY1")?.o[0].id === "ok");
  forgetRoom("room:AB12CD");
  check("清掉单条快照后本地与房间码都读不到", !localTables().some((r) => r.key === "room:AB12CD") && cachedRoom("AB12CD") === null);

  const rom: RomMeta = { id: "ABCD1234", title: "我的存档", note: "", owner: "甲", createdAt: 1, updatedAt: 2, objects: 4 };
  cacheRoms([rom, null as unknown as RomMeta]);
  check("存档列表能读回来并滤掉脏条目", cachedRoms()?.list.length === 1 && cachedRoms()!.at >= 1);
  cacheRomPayload({ ...rom, objects: 2, state: corrupted });
  check("存档本体离线可读且同样收口", cachedRomPayload("ABCD1234")?.rom.state.o.length === 1);
  dropRomPayload("abcd1234");
  check("丢掉本体后列表还在但开不了离线档", cachedRoms()?.list.length === 1 && cachedRomPayload("ABCD1234") === null);
  rememberRomToken("abcd1234", "deadbeef");
  check("口令按大写存档号留着", romToken("ABCD1234") === "deadbeef");
  wipeRoomCache();
  check("清空缓存不动口令，只丢桌况与存档", localTables().length === 0 && cachedRoms() === null && romToken("ABCD1234") === "deadbeef");
  forgetRomToken("ABCD1234");
  check("忘了口令就再也覆盖不了那份存档", romToken("ABCD1234") === null);

  // ——— 删过的自动手牌区：按房间码记住，换标签页、换了客户端 id 重进同一间房也不补 ———
  check("只有自动生成的那块算手牌区", isHandZone(handA) && !isHandZone(zoned2.o.find((o) => o.kind === "zone")) && !isHandZone(undefined));
  forgetHandZone("ab12cd");
  check("删掉的手牌区按房间码记住", handZoneForgotten("AB12CD") && !handZoneForgotten("ZZ6677"));
  forgetHandZone("zz6677");
  check("另一间房删手牌区不顶掉上一间", handZoneForgotten("ab12cd") && handZoneForgotten("ZZ6677"));
  for (let i = 0; i < 70; i++) forgetHandZone(`r${String(i).padStart(4, "0")}x`);
  check("只留最近记下的那些房间", handZoneForgotten("R0069X") && !handZoneForgotten("ZZ6677"));

  // ——— 本机缓存查看器：把这台浏览器记着的东西数出来，删一条少一条 ———
  cacheRoom("AA11BB", table("联网快照"), 3);
  cacheLocalTable(table("离线小桌"), 1);
  cacheRoms([rom]);
  cacheRomPayload({ ...rom, objects: 4, state: table("存档本体") });
  rememberRomToken(rom.id, "deadbeef");
  rememberRoomToken("AA11BB", "cafebabe");
  cacheMemory.set("tabletop3d:name", "甲");
  cacheMemory.set("tabletop3d:fp:salt", "saltysalt");
  cacheMemory.set("tabletop3d:view", JSON.stringify({ bright: 1, quality: "high", orbit: true }));
  const presetGroup = () => inventory().find((g) => g.id === "presets");
  check("没有预设时这一组整组不出现", presetGroup() === undefined);
  const savedPreset = savePreset(table("预设桌"), "测试预设");
  check("存下一个预设", !!savedPreset && listPresets().length === 1);

  const groups = inventory();
  const byId = (id: string) => groups.find((g) => g.id === id);
  check("七类里数得出六类（口令那条也算）", ["tables", "roms", "presets", "tokens", "handzones", "prefs", "identity"].every((id) => !!byId(id)), groups.map((g) => `${g.id}:${g.rows.length}`).join(","));
  check("一份联网快照就是一行", byId("tables")!.rows.some((r) => r.id === "table:room:AA11BB" && r.bytes > 0 && r.warn.includes("AA11BB")));
  check("离线桌那行念得出它是自己摆的", byId("tables")!.rows.find((r) => r.id.startsWith("table:local:"))!.warn.includes("只存在这台浏览器里"));
  check("存档目录与本体各算一行", byId("roms")!.rows.some((r) => r.id === "rom-list") && byId("roms")!.rows.some((r) => r.id === `rom:${rom.id}`));
  check("口令只列编号，值一次都不露", byId("tokens")!.rows.length === 2
    && !JSON.stringify(groups).includes("deadbeef") && !JSON.stringify(groups).includes("cafebabe")
    && byId("tokens")!.bytes > 0 && byId("tokens")!.rows.every((r) => r.bytes === 0));
  check("手牌区记忆按房间码摊开成行", byId("handzones")!.rows.length === 60 && byId("handzones")!.bytes > 0);
  check("偏好与身份按真实存在的键来数", byId("prefs")!.rows.map((r) => r.id).join(",") === "pref:tabletop3d:view"
    && byId("identity")!.rows.map((r) => r.id).join(",") === "id:name,id:fp");
  check("总量不少于清单里各组合计", localBytes() >= groups.reduce((n, g) => n + g.bytes, 0));
  check("体积单位按大小换档", formatBytes(900) === "900 B" && formatBytes(2048) === "2 KB" && formatBytes(3145728) === "3.0 MB");

  const keyRows = byId("tables")!.rows.find((r) => r.id === "table:room:AA11BB")!;
  keyRows.drop();
  check("删掉一行快照，存储里就没有这个键", !cacheMemory.has("tabletop3d:room:AA11BB") && !inventory().some((g) => g.id === "tables" && g.rows.some((r) => r.id === "table:room:AA11BB")));
  const roms0 = byId("roms")!;
  roms0.rows.find((r) => r.id === `rom:${rom.id}`)!.drop();
  check("只删本体时目录还留着", cachedRoms()?.list.length === 1 && cachedRomPayload(rom.id) === null && storedTables().length < 2);
  byId("tokens")!.wipe!.run();
  check("整组忘掉口令：rom-keys 与 room-keys 都空了", romTokenIds().length === 0 && roomTokenIds().length === 0 && !inventory().some((g) => g.id === "tokens"));
  unforgetHandZone("R0069X");
  check("忘掉一间房的手牌区记录就不再拦着补", forgottenHandZones().length === 59 && !forgottenHandZones().includes("R0069X") && !!localStorage.getItem(HAND_ZONE_MEMORY_KEY));
  presetGroup()!.wipe!.run();
  check("清空预设连目录一起清", listPresets().length === 0 && presetGroup() === undefined);
  const rest = inventory();
  rest.forEach((g) => g.wipe?.run());
  check("一组组清完只剩没建模的序列号，清单空了", inventory().length === 0 && localBytes() >= 0);

  // 缓存用例独占这两个全局，跑完就撤，免得影响后面的压缩包检查
  delete cacheGlobal.localStorage;
  delete cacheGlobal.window;
}

// ——— 本轮试用反馈：转角归零、按牌面分堆、只收选中的散牌、离席主人的区域不再锁人、满盒顶得住筹码 ———
{
  const turned = apply(base, { t: "rot", ids: [deck.id], delta: 45, pitch: 30 }, "甲");
  const tilted = turned.o.find((o) => o.id === deck.id)!;
  check("斜靠会顺手钉住高度", tilted.rot === 45 && tilted.tilt === 30 && tilted.pin === true, `${tilted.rot}/${tilted.tilt}/${tilted.pin}`);
  const reset = apply(turned, rotResetAction([deck.id])!, "甲");
  const back = reset.o.find((o) => o.id === deck.id)!;
  check("转角归零清掉水平角与俯仰", back.rot === 0 && back.tilt === undefined, `${back.rot}/${back.tilt}`);
  check("没转过的东西归零不做事", rotResetAction([back.id]) === null || apply(reset, rotResetAction([deck.id])!, "甲").log.length === reset.log.length);

  const kinds = ["", "", "", ""].reduce((s, _, i) => apply(s, addCardAction({ back: "plain", label: i < 2 ? "杀" : "闪" }, "#c8443c"), "甲"), base);
  const looseIds = kinds.o.filter((o) => o.kind === "card").map((o) => o.id);
  const splitState = apply(kinds, splitPilesAction(kinds.o, looseIds)!, "甲");
  const madePiles = splitState.o.filter((o) => o.kind === "pile").slice(kinds.o.filter((o) => o.kind === "pile").length);
  check("按牌面分堆分成两叠", madePiles.length === 2 && madePiles.every((p) => (p.pile ?? []).length === 2), madePiles.map((p) => p.pile?.length).join("/"));
  check("全是同一种牌时不分堆", splitPilesAction(kinds.o, looseIds.slice(0, 2)) === null);
  const onePile = apply(kinds, addPileAction([{ back: "plain", label: "旧" }], "#c8443c"), "甲");
  const pileTarget = onePile.o.find((o) => o.kind === "pile" && (o.pile ?? []).length === 1)!;
  const gathered = apply(onePile, gatherAction(onePile.o, pileTarget.id, looseIds.slice(0, 1))!, "甲");
  const leftLoose = gathered.o.filter((o) => o.kind === "card" && !o.hand).length;
  check("只收选中的那一张进指定牌堆", (gathered.o.find((o) => o.id === pileTarget.id)?.pile ?? []).length === 2
    && leftLoose === kinds.o.filter((o) => o.kind === "card").length - 1, `${leftLoose} 张散牌留下`);

  const privZone = { id: "pz-1", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, owner: "乙", priv: true, zone: { w: 0.6, d: 0.4 } } as GameObject;
  const hiddenCard = { id: "pz-2", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", label: "私牌" } } as GameObject;
  const twoSeat = { ...base, o: [...base.o, privZone, hiddenCard] } as TableState;
  check("主人在席时隐私区照旧锁住别人", lockedOut(hiddenCard, twoSeat, "甲", new Set(["甲", "乙"])) && faceHidden(hiddenCard, twoSeat, "甲", new Set(["甲", "乙"])));
  check("主人离线后区域不再挡人也再不保密", !lockedOut(hiddenCard, twoSeat, "甲", new Set(["甲"])) && !faceHidden(hiddenCard, twoSeat, "甲", new Set(["甲"])));
  const adopted = takeHandZoneAction(twoSeat, { id: "甲", name: "小明" }, new Set(["甲"]));
  check("别人的普通隐私区不算手牌区，不会被认领", adopted === null);
  const orphanHand = { ...privZone, label: "小明的手牌", owner: "乙" } as GameObject;
  const claimable = takeHandZoneAction({ ...base, o: [orphanHand] } as TableState, { id: "甲", name: "小明" }, new Set(["甲"]));
  check("按名字接回离席主人留下的手牌区", claimable?.t === "zone" && claimable.id === orphanHand.id && claimable.owner === "甲");

  const fullBox = { id: "fx-1", kind: "box", x: 0, z: 0, rot: 0, layer: 0, pile: Array.from({ length: 300 }, () => ({ back: "plain" as const, label: "牌" })) } as GameObject;
  const coin = { id: "fx-2", kind: "disc", shape: "coin", x: 0.005, z: 0.005, rot: 0, layer: 0 } as GameObject;
  const boxed = { ...base, o: [fullBox, coin] } as TableState;
  const restOn = autoLayer(boxed, coin, 0.005, 0.005, 0);
  check("筹码落得上一只装满牌的盒子", restOn * LAYER_H >= boxOf(fullBox).h - 0.0005, `第 ${restOn} 层 / 盒高 ${boxOf(fullBox).h.toFixed(3)}`);
  check("落回空桌面还是 0 层", autoLayer({ ...base, o: [coin] } as TableState, coin, 0.5, 0.5, 0) === 0);
  // 层数上限撑到 0.88m：放大两倍的满盒还在天花板以下，牌不再限张数也不能撑破这一层
  const bigBox = { id: "fx-3", kind: "box", x: 0, z: 0, rot: 0, layer: 0, pile: Array.from({ length: 180 }, () => ({ back: "plain" as const, label: "牌" })) } as GameObject;
  check("层数上限够撑住放大过的满盒", LAYER_MAX * LAYER_H >= boxOf({ ...bigBox, scale: 2 } as GameObject).h, `放大满盒 ${boxOf({ ...bigBox, scale: 2 } as GameObject).h.toFixed(3)} / 天花板 ${(LAYER_MAX * LAYER_H).toFixed(3)}`);
}

// ——— 桌面物理：支撑、塌落、质量分配与甩动惯性 ———
{
  const card = (id: string, x: number, z: number, layer = 0): GameObject =>
    ({ id, kind: "card", x, z, rot: 0, layer, card: { back: "plain", label: "牌" } }) as GameObject;
  const block = (id: string, x: number, z: number, kind: "box" | "cube" = "box"): GameObject =>
    ({ id, kind, x, z, rot: 0, layer: 0, pile: kind === "box" ? [{ back: "plain" as const, label: "牌" }] : undefined }) as GameObject;

  // 只压住一角：托不住三成投影就该往悬空那侧滑，而不是稳稳停在原处
  const ledge = block("p-box", 0, 0);
  const perched = restDrop([ledge], card("p-c1", 0, 0), 0.055, 0, 0);
  check("只压住一角的牌会滑开", Math.hypot(perched.x - 0.055, perched.z) > 0.004, `滑到 ${perched.x}/${perched.z}`);
  // 大面积压住：原位不动，只是落到对方顶上
  const onTop = restDrop([ledge], card("p-c2", 0, 0), 0.004, 0, 0);
  check("大面积压住时原位落到顶面", Math.abs(onTop.x - 0.004) < 0.0005 && onTop.layer > 0, `第 ${onTop.layer} 层`);

  // 抽掉垫板：坐在上面的东西跟着塌，而且两端算出同一张桌子
  const sunk = card("p-c3", 0, 0, onTop.layer);
  const stack = { ...base, o: [ledge, sunk] } as TableState;
  const pulled = apply(stack, { t: "remove", ids: [ledge.id] }, "甲");
  const other = apply(stack, { t: "remove", ids: [ledge.id] }, "乙");
  const fallen = pulled.o.find((o) => o.id === sunk.id)!;
  check("抽掉底座后上面的牌落回桌面", fallen.layer === 0, `第 ${fallen.layer} 层`);
  check("塌落结果两端一致", JSON.stringify(pulled.o) === JSON.stringify(other.o));
  // 手工锁高的东西不参与塌落
  const pinnedStack = { ...base, o: [ledge, { ...sunk, pin: true }] } as TableState;
  const held = apply(pinnedStack, { t: "remove", ids: [ledge.id] }, "甲").o.find((o) => o.id === sunk.id)!;
  check("锁高的物件不跟着塌", held.layer === onTop.layer, `钉在第 ${held.layer} 层`);

  // 反复选中两张叠在一起的牌：绝不能互相踩着往上飞——一次解算多一层就是「左脚踩右脚」
  const pair = () => ({ ...base, o: [card("s-a", 0.2, 0.2, 0), card("s-b", 0.2, 0.2, 1)] } as TableState);
  const push = (st: TableState, id: string) =>
    apply(st, { t: "move", m: resolveDrop(st, [{ id, x: st.o.find((o) => o.id === id)!.x + 0.001, z: 0.2 }]) }, "甲");
  let ping = pair();
  for (let i = 0; i < 8; i++) ping = push(ping, i % 2 ? "s-b" : "s-a");
  const pingMax = Math.max(...ping.o.map((o) => o.layer));
  const pingFar = ping.o.some((o) => Math.abs(o.x - 0.2) > 0.05);
  check("反复选中叠牌不会互相踩着飞升", pingMax <= 1 && !pingFar, `最高第 ${pingMax} 层${pingFar ? "，牌还被甩开了" : ""}`);
  check("叠牌的层数始终连着桌面", ping.o.map((o) => o.layer).sort().join() === "0,1", ping.o.map((o) => `${o.id}:${o.layer}`).join(" "));

  // 三张一起轮流重落：层数永远就是连排的三层
  let trio = { ...base, o: [card("s-c1", 0.2, 0.2, 0), card("s-c2", 0.2, 0.2, 1), card("s-c3", 0.2, 0.2, 2)] } as TableState;
  for (let i = 0; i < 6; i++) trio = push(trio, `s-c${(i % 3) + 1}`);
  check("三张轮流重落还是连排三层", trio.o.map((o) => o.layer).sort().join() === "0,1,2", trio.o.map((o) => `${o.id}:${o.layer}`).join(" "));

  // 被压实的那张得一起提交：只报搬的那件，归约会在旧层序上重算并把顶牌一巴掌扇开
  const squeeze = resolveDrop(pair(), [{ id: "s-a", x: 0.201, z: 0.2 }]);
  const committed = apply(pair(), { t: "move", m: squeeze }, "甲");
  check("压实会带上被挪动的旁人", squeeze.length === 2 && squeeze.some((m) => m.id === "s-b" && m.layer === 0), JSON.stringify(squeeze));
  check("提交前后算的是同一张桌子", committed.o.every((o) => { const m = squeeze.find((x) => x.id === o.id)!; return Math.abs(o.x - m.x) < 0.0005 && o.layer === m.layer; }), committed.o.map((o) => `${o.id}@${o.layer}(${o.x})`).join(" "));

  // 手工钉高的那一叠不压实：那是用户自己定的高度
  const lofted = { ...base, o: [card("s-p1", 0.2, 0.2, 0), { ...card("s-p2", 0.2, 0.2, 12), pin: true }] } as TableState;
  const loft = apply(lofted, { t: "move", m: resolveDrop(lofted, [{ id: "s-p1", x: 0.201, z: 0.2 }]) }, "甲").o;
  check("锁高的一叠不跟着压实", loft.find((o) => o.id === "s-p2")?.layer === 12, loft.map((o) => `${o.id}@${o.layer}`).join(" "));

  // 挤开按质量分摊：轻的那件多让，重的那点意思就够了
  const heavy = block("p-h", 0, 0, "cube");
  const light = { ...card("p-l", 0.02, 0), kind: "token" as const };
  const both = separate([heavy, light], [heavy.id, light.id]);
  const movedHeavy = Math.abs(both.find((o) => o.id === heavy.id)!.x - heavy.x);
  const movedLight = Math.abs(both.find((o) => o.id === light.id)!.x - light.x);
  check("挤开时轻的让得多", movedLight > movedHeavy, `轻 ${movedLight.toFixed(3)} / 重 ${movedHeavy.toFixed(3)}`);
  check("质量随体积立方涨", materialOf({ ...heavy, scale: 2 } as GameObject).mass > materialOf(heavy).mass * 7);

  // 甩出去：绒布上匀减速，停车距离就是 v²/(2μg)
  const slick = card("p-f", -0.5, 0);
  const felt = { ...base, o: [slick] } as TableState;  const v0 = 1.2;
  const mu = materialOf(slick).mu;
  const slide = fling(felt.o, slick.id, { vx: v0, vz: 0 }, { x: slick.x, z: 0, layer: 0 });
  const landed = slide.moves.find((m) => m.id === slick.id);
  const theory = (v0 * v0) / (2 * mu * G);
  const travelled = landed ? Math.abs(landed.x - slick.x) : 0;
  check("甩牌滑行距离接近 v²/(2μg)", !!landed && Math.abs(travelled - theory) < theory * 0.2, `${travelled.toFixed(3)} 米 / 理论 ${theory.toFixed(3)}`);
  check("滑行有逐帧路径可回放", (slide.path.get(slick.id)?.length ?? 0) > 8, `${slide.path.get(slick.id)?.length ?? 0} 帧`);

  // 撞围板：反弹回来也得整张牌留在桌布内
  const rim = card("p-r", -0.2, 0);
  const bounced = fling([{ ...rim }], rim.id, { vx: 4.5, vz: 0.9 }, { x: rim.x, z: 0, layer: 0 }).moves[0];
  const room = { x: TABLE.w / 2 - spanOf({ ...rim, rot: bounced?.rot ?? 0 }).x, z: TABLE.d / 2 - spanOf({ ...rim, rot: bounced?.rot ?? 0 }).z };
  check("反弹后不出围板", !!bounced && Math.abs(bounced.x) <= room.x + 0.001 && Math.abs(bounced.z) <= room.z + 0.001, `${bounced?.x}/${bounced?.z}`);
  // 太慢的抬手不算甩动
  check("慢到一定程度的松手不带惯性", fling([{ ...slick }], slick.id, { vx: 0.05, vz: 0 }, { x: slick.x, z: 0, layer: 0 }).moves.length === 0);
  // 成堆的牌堆推不动它？能，但按自己的质量走
  check("锁高的物件不参与甩动", fling([{ ...slick, pin: true }], slick.id, { vx: 2, vz: 0 }, { x: slick.x, z: 0, layer: 0 }).moves.length === 0);
  check("落点收口用同一套投影贴边", restInTable(rim, 9, 9).x === TABLE.w / 2 - spanOf(rim).x);
  check("挤开链会自己找锚点重算", resolvePlacement([{ ...heavy }, { ...light }], [light.id]).o.length === 2);
}

// ——— 新道具：转盘按动作重放、计分轨共轨比分、六边形棋盘吸附 ———
{
  const RED = "#c8443c";
  // 起转时刻固定写死：归约必须是纯函数，不然各端比的是各自的时钟
  const T0 = 1777000000000;

  // 转盘：随机数由拨的人算好写进动作，别人只是重放同一段减速
  const dialed = apply(base, addSpinnerAction(RED, 8), "甲");
  const dial0 = dialed.o.find((o) => o.kind === "spinner")!;
  check("放下转盘就是一张没拨过的 8 格盘", dial0.spinner?.n === 8 && dial0.spinner?.value === undefined && spinAngle(dial0) === 0, JSON.stringify(dial0.spinner));
  const spun = spinAction(dial0, T0)!;
  check("拨一下把落点与起转时刻都写进动作", spun.t === "spin" && Number.isInteger(spun.value) && (spun.value as number) >= 0 && (spun.value as number) < 8 && spun.at === T0, JSON.stringify(spun));
  const c1 = apply(dialed, spun, "甲");
  const c2 = apply(JSON.parse(JSON.stringify(dialed)) as TableState, spun, "乙");
  check("同一份 spin 动作各端归约出同一张桌子", JSON.stringify(c1.o) === JSON.stringify(c2.o));
  const dial = c1.o.find((o) => o.id === dial0.id)!;
  const landed = dial.spinner!.value!;
  check("日志报出停在第几格（从 1 数）", c1.log[c1.log.length - 1]?.text === `转盘停在第 ${landed + 1} 格`, c1.log[c1.log.length - 1]?.text ?? "无");
  // 指针固定在正上方（时钟 0 度）：停住那格的中心必须刚好被它指着，符号反了就露馅
  const per = 360 / dial.spinner!.n;
  const needleGap = (((landed + 0.5) * per - spinAngle(dial)) % 360 + 360) % 360;
  check("停住那一格的中心正好在指针下", needleGap < 1e-6 || needleGap > 360 - 1e-6, `第 ${landed + 1} 格 / 盘面转了 ${spinAngle(dial).toFixed(2)}°，差 ${needleGap.toFixed(6)}°`);
  const rest = spinAngle(dial);
  check("起转那一刻还没冲出去", Math.abs(spinAngleAt(dial, dial.spinner!.at!) - rest) < 1e-9);
  check("动画收完落回同一格，之后一直不动", Math.abs(spinAngleAt(dial, dial.spinner!.at! + SPIN_MS) - rest) < 1e-9 && Math.abs(spinAngleAt(dial, dial.spinner!.at! + SPIN_MS * 9) - rest) < 1e-9);
  const mid = spinAngleAt(dial, dial.spinner!.at! + SPIN_MS / 2);
  check("半程角度落在静止位与起转位之间", mid > rest && mid < rest + SPIN_TURNS * 360, `还剩 ${(mid - rest).toFixed(1)}°`);
  check("缓出曲线前快后慢", spinAngleAt(dial, dial.spinner!.at! + SPIN_MS * 0.25) - mid > mid - spinAngleAt(dial, dial.spinner!.at! + SPIN_MS * 0.75));
  const grew = spinSetAction(dial, 1)!;
  const resized = apply(c1, grew, "甲").o.find((o) => o.id === dial0.id)!;
  check("改格数会抹掉上一次落点，免得指着不存在的格", resized.spinner!.n === 9 && resized.spinner!.value === undefined && resized.spinner!.at === undefined, JSON.stringify(resized.spinner));
  const minDial = apply(base, addSpinnerAction(RED, SPIN_MIN), "甲").o.find((o) => o.kind === "spinner")!;
  const maxDial = apply(base, addSpinnerAction(RED, SPIN_MAX), "甲").o.find((o) => o.kind === "spinner")!;
  check("等分数卡在 2~24 之间", spinSetAction(minDial, -1) === null && spinSetAction(maxDial, 1) === null && spinSetAction(dial, 0) === null, `${SPIN_MIN}~${SPIN_MAX}`);
  check("fixSpinner 把脏值收口", fixSpinner({ n: 999 }).n === SPIN_MAX && fixSpinner({ n: 1 }).n === SPIN_MIN && fixSpinner({ n: 0 }).n === 8 && fixSpinner({ n: "12" as unknown as number }).n === 12 && fixSpinner({ n: 8, value: 8 }).value === undefined && fixSpinner({ n: 8, value: 3.7 }).value === 3 && fixSpinner({ n: 8, at: 123 }).at === undefined && fixSpinner("转盘" as unknown as object).n === 8);

  // 计分轨：一条公共刻度，每人一枚棋子，所以比分能直接看出来
  const boarded = apply(base, addTrackAction(RED, 20), "甲");
  const railId = boarded.o.find((o) => o.kind === "track")!.id;
  const pick = (s: TableState) => s.o.find((o) => o.id === railId)!;
  check("放下计分轨是一条没人上场的 20 格轨", pick(boarded).track?.n === 20 && pick(boarded).track?.marks?.length === 0, JSON.stringify(pick(boarded).track));
  const enter = markAction(pick(boarded), "p1", 0, "甲", RED)!;
  const aboard = apply(boarded, enter, "甲");
  check("上场就是摆到起点那一格，还带上名字与颜色", (enter as { delta?: number }).delta === 0 && pick(aboard).track!.marks.length === 1 && trackMark(pick(aboard), "p1")?.at === 0 && pick(aboard).track!.marks[0].name === "甲" && pick(aboard).track!.marks[0].color === RED && aboard.log[aboard.log.length - 1]?.text.includes("上了计分轨"), JSON.stringify(pick(aboard).track));
  check("重复上场不会多出一枚棋子", pick(apply(aboard, enter, "甲")).track!.marks.length === 1);
  const advanced = apply(aboard, markAction(pick(aboard), "p1", 3)!, "甲");
  check("加三分就往右走三格", trackMark(pick(advanced), "p1")?.at === 3, JSON.stringify(pick(advanced).track!.marks[0]));
  check("减到过头停在第一格，掉不出轨外", trackMark(pick(apply(advanced, markAction(pick(advanced), "p1", -9)!, "甲")), "p1")?.at === 0);
  const maxed = apply(advanced, markAction(pick(advanced), "p1", 999)!, "甲");
  check("加到超出刻度会夹在最后一格", trackMark(pick(maxed), "p1")?.at === 19, JSON.stringify(pick(maxed).track!.marks[0]));
  check("记一分会在日志里留痕", advanced.log[advanced.log.length - 1]?.text === "甲 记到 4", advanced.log[advanced.log.length - 1]?.text ?? "无");
  let crowd = advanced;
  for (let i = 0; i < TRACK_MARK_MAX - 1; i++) {
    const act = markAction(pick(crowd), `路人${i}`, 0);
    if (!act) break;
    crowd = apply(crowd, act, "甲");
  }
  check("一条轨最多同时站 10 个人", pick(crowd).track!.marks.length === TRACK_MARK_MAX, `${pick(crowd).track!.marks.length} 枚`);
  check("满轨后再请人上场，动作与归约都拒", markAction(pick(crowd), "多出来的", 0) === null && apply(crowd, { t: "mark", id: railId, by: "多出来的", delta: 0 } as unknown as Action, "甲") === crowd);
  const removed = apply(crowd, markClearAction(pick(crowd), "路人0")!, "甲");
  check("收走一枚棋子只摘掉那个人", pick(removed).track!.marks.length === TRACK_MARK_MAX - 1 && trackMark(pick(removed), "路人0") === undefined && !!trackMark(pick(removed), "p1"));
  check("没上场的棋子收不走", markClearAction(pick(removed), "压根没来") === null);
  const zeroed = apply(advanced, markClearAction(pick(advanced))!, "甲");
  check("全员归零只挪棋子，不摘人", pick(zeroed).track!.marks.length === 1 && trackMark(pick(zeroed), "p1")?.at === 0);
  check("已经全在起点的轨不再发归零动作", markClearAction(pick(zeroed)) === null);
  const shrunk = trackSetAction(pick(maxed), -12)!;
  const shortened = apply(maxed, shrunk, "甲");
  check("轨道缩短会把越界的棋子夹到最后一格", pick(shortened).track!.n === 8 && trackMark(pick(shortened), "p1")?.at === 7, JSON.stringify(pick(shortened).track));
  check("刻度数卡在 5~80", trackSetAction(pick(shortened), -4) === null && trackSetAction(pick(shortened), 100) === null && trackSetAction(pick(shortened), 0) === null, `${TRACK_MIN}~${TRACK_MAX}`);
  // 格心几何：贴图的数字、棋子的位置都读这一份
  const wideRail = apply(base, addTrackAction(RED, TRACK_MAX), "甲").o.find((o) => o.kind === "track")!;
  check("两端那一格关于轨心对称", Math.abs(trackOffset(0, 20) + trackOffset(19, 20)) < 1e-9, `${trackOffset(0, 20).toFixed(4)} / ${trackOffset(19, 20).toFixed(4)}`);
  check("格与格之间等距", Math.abs(trackOffset(5, 20) - trackOffset(4, 20) - (trackOffset(12, 20) - trackOffset(11, 20))) < 1e-9);
  check("轨越长占桌越宽，深浅不变", trackSize(wideRail).w > trackSize(pick(boarded)).w * 3 && trackSize(wideRail).d === trackSize(pick(boarded)).d, `${trackSize(wideRail).w.toFixed(3)} 米`);
  check("计分轨贴面、转盘可锁高", DECAL_KINDS.includes("track") && !pinnable(pick(boarded)) && pinnable(dial0));

  // 六边形棋盘：贴图与吸附共用 hexPos，画出来的格子和吸进去的位置才是同一套
  const hexTable = starter("hex7", "蜂窝");
  const mat = hexTable.o.find((o) => o.kind === "board")!;
  check("六边形开局铺的是 7×7 蜂窝棋盘", mat.board?.layout === "hex" && mat.board?.cols === 7 && mat.board?.rows === 7, JSON.stringify(mat.board));
  const spec = mat.board!;
  const box = boardSize(spec);
  let allInside = true;
  let unique = new Set<number>();
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      const p = hexPos(spec, c, r);
      if (Math.abs(p.x) > box.w / 2 || Math.abs(p.z) > box.d / 2) allInside = false;
      unique.add(r * spec.cols + c);
    }
  }
  check("每一格格心都落在棋盘版面内", allInside, `版面 ${box.w.toFixed(3)}×${box.d.toFixed(3)} 米`);
  check("每格编号互不重复", unique.size === spec.cols * spec.rows, `${unique.size} 格`);
  const target = hexPos(spec, 3, 4);
  const snapped = snap(hexTable, mat.x + target.x + 0.004, mat.z + target.z - 0.006);
  check("吸附吸到最近那一格的格心", snapped.cell === 4 * spec.cols + 3 && Math.abs(snapped.x - (mat.x + target.x)) < 1e-9 && Math.abs(snapped.z - (mat.z + target.z)) < 1e-9, JSON.stringify(snapped));
  const farCell = hexPos(spec, 6, 6);
  check("越靠边的格子也吸得准", snap(hexTable, mat.x + farCell.x - 0.01, mat.z + farCell.z + 0.01).cell === 6 * spec.cols + 6);
  check("桌外的点不硬给格子", snap(hexTable, mat.x + box.w, mat.z + box.d).cell === null);
}

// ——— 中国象棋：偶数排交叉线的吸附、32 子开局与组件库那 14 个字 ———
function xiangqiChecks(): void {
  const table = starter("xiangqi", "象棋");
  const mat = table.o.find((o) => o.kind === "board")!;
  const spec = mat.board!;
  const box = boardSize(spec);
  const [red, black] = XIANGQI_GLYPHS;
  check("象棋开局铺 9×10 交叉线棋盘", spec.layout === "lines" && spec.cols === 9 && spec.rows === 10 && spec.theme === "xiangqi", JSON.stringify(spec));
  check("象棋开局不搭骰子", !table.o.some((o) => o.kind === "die"));
  const men = table.o.filter((o) => o.kind === "disc");
  check("开局 32 枚棋子", men.length === 32, `${men.length} 枚`);
  check("红黑各 16 枚", men.filter((o) => o.color === red.color).length === 16 && men.filter((o) => o.color === black.color).length === 16);
  const tally = (g: { color: string; glyphs: string[] }) => g.glyphs.map((ch) => men.filter((o) => o.color === g.color && o.label === ch).length).join(",");
  check("红方一帥、仕相馬車炮各双、五兵", tally(red) === "1,2,2,2,2,2,5", tally(red));
  check("黑方一將、士象馬車砲各双、五卒", tally(black) === "1,2,2,2,2,2,5", tally(black));
  const known = new Set(XIANGQI_GLYPHS.flatMap((g) => g.glyphs));
  check("开局每个字都在组件库那 14 个字里", men.every((o) => known.has(o.label ?? "")));
  check("开局用的都是象棋子这一形", men.every((o) => o.shape === "piece"));
  check("红方在近侧、黑方在远侧", men.every((o) => (o.color === red.color ? o.z > mat.z : o.z < mat.z)));
  check("一枚棋子坐得进一格还留得下缝", footprintOf(men[0]) * 2 < spec.cell, `${(footprintOf(men[0]) * 2).toFixed(3)} / ${spec.cell} 米`);
  let inside = true;
  for (const o of men) {
    if (Math.abs(o.x - mat.x) > box.w / 2 || Math.abs(o.z - mat.z) > box.d / 2) inside = false;
  }
  check("每一枚都在棋盘版面里", inside, `版面 ${box.w.toFixed(3)}×${box.d.toFixed(3)} 米`);
  let tight = 0;
  for (let i = 0; i < men.length; i++) {
    for (let j = i + 1; j < men.length; j++) {
      if (Math.hypot(men[i].x - men[j].x, men[i].z - men[j].z) < footprintOf(men[i]) + footprintOf(men[j])) tight++;
    }
  }
  check("开局没有两枚互相压着", tight === 0, `${tight} 对重叠`);

  // 偶数排线：中心不在任何交点上，整排交点都得吸得回去，编号还得是整数
  let allNodes = true;
  const cells = new Set<number>();
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      const node = { x: mat.x + (c - (spec.cols - 1) / 2) * spec.cell, z: mat.z + (r - (spec.rows - 1) / 2) * spec.cell };
      const s = snap(table, node.x + 0.003, node.z - 0.004);
      if (!Number.isInteger(s.cell) || Math.abs(s.x - node.x) > 1e-9 || Math.abs(s.z - node.z) > 1e-9) allNodes = false;
      cells.add(s.cell as number);
    }
  }
  check("90 个交点每一个都吸得回去", allNodes);
  check("每个交点编号互不重复", cells.size === spec.cols * spec.rows, `${cells.size} 个`);
  const far = snap(table, mat.x, mat.z - box.d / 2 + 0.001);
  const near = snap(table, mat.x, mat.z + box.d / 2 - 0.001);
  check("贴到板边也只夹在最外一排交点上", Number.isInteger(far.cell) && Number.isInteger(near.cell), JSON.stringify([far.cell, near.cell]));
  check("远侧最外排到近侧最外排正好 9 格", Math.abs(near.z - far.z - 9 * spec.cell) < 1e-9, `${(near.z - far.z).toFixed(4)} 米`);
  // 五子棋这类奇数线棋盘要保持原样，而且线阵与板边的留白必须是同一套换算（贴图按它画线）
  const gomoku = starter("gomoku", "五子棋");
  const gm = gomoku.o.find((o) => o.kind === "board")!;
  const gs = gm.board!;
  const gbox = boardSize(gs);
  const leftEdge = snap(gomoku, gm.x - gbox.w / 2 + 0.001, gm.z);
  check("最外一圈线离嵌板边缘正好留 LINES_BORDER 格", Math.abs(leftEdge.x - (gm.x - gbox.w / 2) - LINES_BORDER * gs.cell) < 1e-9, `${(leftEdge.x - (gm.x - gbox.w / 2)).toFixed(4)} 米`);
  check("奇数线棋盘仍吸得到最左那条线", leftEdge.cell === 7 * gs.cols && Math.abs(leftEdge.x - (gm.x - 7 * gs.cell)) < 1e-9, JSON.stringify(leftEdge));
  const midNode = snap(gomoku, gm.x + 0.002, gm.z - 0.002);
  check("正中心那一颗交点在原点", midNode.cell === 7 * gs.cols + 7 && Math.abs(midNode.x - gm.x) < 1e-9 && Math.abs(midNode.z - gm.z) < 1e-9, JSON.stringify(midNode));

  // 组件库与选中栏的通路：点一个字就是一枚棋子，改刻字写得回去
  const added = apply(table, addPieceAction("piece", red.color, "俥"), "甲");
  const got = added.o.find((o) => o.id !== mat.id && o.shape === "piece" && o.label === "俥");
  check("组件库点字就放出一枚象棋子", got?.kind === "disc" && got?.color === red.color, JSON.stringify(got));
  const renamed = apply(table, { t: "label", id: men[0].id, label: "車" }, "甲");
  check("选中栏改刻字会写回物件", renamed.o.find((o) => o.id === men[0].id)?.label === "車");
  const cleared = apply(renamed, { t: "label", id: men[0].id, label: "" }, "甲");
  check("刻字清空就成素面棋子", (cleared.o.find((o) => o.id === men[0].id)?.label ?? "") === "");
  check("象棋子可以被体积缩放外的常规操作选中", !DECAL_KINDS.includes("disc") && pinnable(men[0]));
}

/**
 * 棋盘批次：网格锁定、每套棋的专属棋子、吸附对齐格心、开局摆子与贴图几何。
 * 落点走 resolveDrop（渲染层的预览与提交都调它），归约里的 move 只夹紧桌面，所以这里都按渲染层的路径喂。
 */
function gridBoardChecks(): void {
  const room = starter("empty", "棋盘测试");
  const GRID_GAMES = "chess,checkers,xiangqi,gomoku,go9,go13,go,draughts,reversi";
  const locked = BOARDS.filter((b) => b.grid && b.setup);
  check("棋类盘开局就锁网格，一手一子", locked.map((b) => b.id).join(",") === GRID_GAMES, locked.map((b) => b.id).join(","));
  check("棋类盘一做出来就带着锁", locked.every((b) => makeBoard(b.id)?.grid === true));
  const free = BOARDS.filter((b) => !b.grid && b.board.cols > 0);
  check("跑团与竞速盘默认不锁网格", free.length === 6 && free.every((b) => makeBoard(b.id)?.grid === undefined), free.map((b) => b.id).join(","));
  check("棋盘不带多余的 snap 字段：吸附默认就是开的", BOARDS.every((b) => makeBoard(b.id)?.snap === undefined), BOARDS.filter((b) => makeBoard(b.id)?.snap !== undefined).map((b) => b.id).join(","));

  for (const preset of locked) {
    const s = starter(preset.id, "x");
    const board = s.o.find((o) => o.kind === "board")!;
    const spec = board.board!;
    const onPlate = s.o.filter((o) => gridHug(o) && onBoard(board, o.x, o.z));
    const spots = onPlate.map((o) => ({ o, g: snapOn(spec, o.x - board.x, o.z - board.z) }));
    const centred = spots.every(({ o, g }) => g.cell !== null && Math.hypot(board.x + g.x - o.x, board.z + g.z - o.z) <= GRID_EPS);
    if (onPlate.length === 0)
      // 围棋五子开局不入盘：黑白子摊在盘边，一手一子从边上抓，盘上是空的
      check(`${preset.name}：开局盘上留空，子摊在盘边`, s.o.filter((o) => gridHug(o)).length === 40, `${s.o.filter((o) => gridHug(o)).length} 枚在盘外`);
    else {
      check(`${preset.name}：开局摆的子正坐格心`, centred, `${onPlate.length} 枚在盘上`);
      check(`${preset.name}：一格一子，没有两枚叠在同一格`, new Set(spots.map(({ g }) => g.cell)).size === onPlate.length);
    }
    const spill = s.o.filter((o) => { const at = restInTable(o, o.x, o.z); return at.x !== o.x || at.z !== o.z; });
    check(`${preset.name}：摆子一步都没出桌面`, spill.length === 0, spill.map((o) => `${o.shape}@${o.x},${o.z}`).join(" "));
  }

  // 专属棋子：形状都登记了尺寸、归类正确，按钮放出来的那一枚也对
  const shapes = PIECE_SETS.flatMap((p) => p.sides.flatMap((d) => d.items.map((i) => i.shape)));
  check("每套棋的形状都登记了尺寸", shapes.every((x) => PIECE_SIZE[x] !== undefined), shapes.filter((x) => !PIECE_SIZE[x]).join(","));
  check("五套棋都分黑白红黑两方", PIECE_SETS.length === 5 && PIECE_SETS.every((p) => p.sides.length === 2 && p.sides.every((d) => d.items.length > 0 && d.color.length === 7)));
  check("国际象棋六个角色按兵车马象后王排开", PIECE_SETS.find((p) => p.id === "chess")?.sides[0].items.map((i) => i.name).join("") === CHESS_ROLES.map((r) => r.name).join(""));
  check("象棋两组刻字各七个字", (PIECE_SETS.find((p) => p.id === "xiangqi")?.sides ?? []).every((d) => d.items.length === 7 && d.items.every((i) => i.label === i.name)));
  check("棋子归类不认错：王后是立子不是方块码", kindOfShape("chess-king") === "pawn" && kindOfShape("chess-queen") === "pawn" && kindOfShape("stone") === "disc" && kindOfShape("puck") === "disc" && kindOfShape("man") === "disc" && kindOfShape("piece") === "disc");
  const queen = apply(room, addPieceAction("chess-queen", CHESS_COLORS[0]), "甲").o.find((o) => o.shape === "chess-queen");
  check("组件库放出的「后」是立体棋子", queen?.kind === "pawn" && queen.color === CHESS_COLORS[0]);
  const hi = (shape: string) => pieceSize(shape).h;
  check("六个角色由高到矮：王后象马车兵", hi("chess-king") > hi("chess-queen") && hi("chess-queen") > hi("chess-bishop") && hi("chess-bishop") > hi("chess-knight") && hi("chess-knight") > hi("chess-rook") && hi("chess-rook") > hi("chess-pawn"));
  const FIT: [string, string][] = [["go", "stone"], ["go9", "stone"], ["go13", "stone"], ["gomoku", "puck"], ["xiangqi", "piece"], ["chess", "chess-king"], ["checkers", "man"], ["draughts", "man"], ["hex11", "pawn"]];
  const tight = FIT.filter(([id, shape]) => pieceSize(shape).r * 2 >= BOARDS.find((b) => b.id === id)!.board.cell);
  check("每种棋子都塞得进自己那盘的一格", tight.length === 0, tight.map(([id, s]) => `${id}/${s}`).join(","));
  const stones = starter("go", "g").o.filter((o) => o.shape === "stone");
  check("围棋开局摆出 40 枚子，黑白各 20", stones.length === 40 && stones.filter((o) => o.color === GO_COLORS[0]).length === 20);
  const ranks = new Set(stones.map((o) => Math.round(o.x * 1000)));
  const files = new Set(stones.map((o) => Math.round(o.z * 1000)));
  check("盘边的黑白子排成整齐方阵（5 列 8 行）", ranks.size === 5 && files.size === 8, `${ranks.size} 列 × ${files.size} 行`);
  const closest = Math.min(...stones.flatMap((a) => stones.filter((b) => b.id !== a.id).map((b) => Math.hypot(a.x - b.x, a.z - b.z))));
  check("摆边的子一枚挨一枚但不互相嵌进", closest >= pieceSize("stone").r * 2 - 1e-6, `最近两枚相距 ${closest.toFixed(4)}`);

  // 落点：丢在格缝里也坐进格心，已经坐好的再丢一次不漂移
  const chess = starter("chess", "c");
  const cb = chess.o.find((o) => o.kind === "board")!;
  const spec = cb.board!;
  const p1: GameObject = { id: "gp-1", kind: "pawn", shape: "pawn", color: "#c8443c", x: 0.9, z: 0.6, rot: 0, layer: 0 };
  const p2: GameObject = { id: "gp-2", kind: "pawn", shape: "pawn", color: "#3d7fbf", x: 0.95, z: 0.6, rot: 0, layer: 0 };
  const withPawns = apply(apply(chess, { t: "add", o: p1 }, "甲"), { t: "add", o: p2 }, "甲");
  const seam = { x: cb.x + 0.111, z: cb.z - 0.037 };
  const d1 = resolveDrop(withPawns, [{ id: p1.id, x: seam.x, z: seam.z }])[0];
  const dg = snapOn(spec, d1.x - cb.x, d1.z - cb.z);
  check("丢在格缝里也吸进最近的格心", dg.cell !== null && Math.hypot(d1.x - (cb.x + dg.x), d1.z - (cb.z + dg.z)) < 1e-6, JSON.stringify(d1));
  const settled = apply(withPawns, { t: "move", m: [d1] }, "甲");
  const d2 = resolveDrop(settled, [{ id: p1.id, x: d1.x, z: d1.z }])[0];
  check("已经坐好的子再丢一次不漂移", d2.x === d1.x && d2.z === d1.z, `${d1.x},${d1.z} → ${d2.x},${d2.z}`);
  const pair = resolveDrop(withPawns, [{ id: p1.id, x: seam.x, z: seam.z }, { id: p2.id, x: seam.x, z: seam.z }]);
  const pc = pair.map((m) => snapOn(spec, m.x - cb.x, m.z - cb.z).cell);
  const apart = Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z);
  check("两枚抢同一个格心会散到相邻格", pc[0] !== pc[1] && apart > 0 && apart <= spec.cell * 1.5, `格 ${JSON.stringify(pc)} 相距 ${apart.toFixed(4)}`);
  check("散开的两枚都还坐得端正", pair.every((m) => { const g = snapOn(spec, m.x - cb.x, m.z - cb.z); return g.cell !== null && Math.hypot(m.x - (cb.x + g.x), m.z - (cb.z + g.z)) < 1e-6; }));

  // 坐在格心里的子是钉子：谁也别想把它挤歪，让路的是旁人
  const a1 = settled.o.find((o) => o.id === p1.id)!;
  const skewedPawn = { ...p2, x: Math.round((a1.x + 0.006) * 1000) / 1000, z: a1.z };
  const crowded = apply(apply(chess, { t: "add", o: a1 }, "甲"), { t: "add", o: skewedPawn }, "甲");
  const onCell = crowded.o.find((o) => o.id === p1.id)!;
  const intruder = crowded.o.find((o) => o.id === p2.id)!;
  const nails = anchoredIds(crowded.o);
  check("正坐格心的子算钉子，偏六毫米的不算", nails.has(onCell.id) && !nails.has(intruder.id), `${onCell.x},${onCell.z} / ${intruder.x},${intruder.z}`);
  const shoved = separate(crowded.o, [intruder.id], false, nails);
  const s1 = shoved.find((o) => o.id === p1.id)!;
  const s2 = shoved.find((o) => o.id === p2.id)!;
  check("挤开时钉子纹丝不动，只有旁人让路", s1.x === onCell.x && s1.z === onCell.z && (s2.x !== intruder.x || s2.z !== intruder.z));

  // 开关本身：关掉能骑缝摆，再打开把歪的子一次摆回去
  const off = apply(crowded, gridLockAction(cb, false)!, "甲");
  check("关掉这盘的网格锁定", off.o.find((o) => o.id === cb.id)?.grid === undefined);
  const roamed = apply(off, { t: "move", m: [{ id: p1.id, x: onCell.x + 0.013, z: onCell.z + 0.013 }] }, "甲");
  const r1 = roamed.o.find((o) => o.id === p1.id)!;
  check("关锁之后可以骑在线缝里摆", Math.abs(r1.x - (onCell.x + 0.013)) < 1e-6 && Math.abs(r1.z - (onCell.z + 0.013)) < 1e-6);
  const backOn = apply(roamed, gridLockAction(cb, true)!, "甲");
  const b1 = backOn.o.find((o) => o.id === p1.id)!;
  const bg = snapOn(spec, b1.x - cb.x, b1.z - cb.z);
  check("重新开锁会把骑缝的子摆回格里", bg.cell !== null && Math.hypot(b1.x - (cb.x + bg.x), b1.z - (cb.z + bg.z)) <= GRID_EPS, `${b1.x},${b1.z}`);
  check("开锁的日志会说摆齐了几枚", backOn.log.some((l) => l.text.includes("摆齐")), backOn.log[backOn.log.length - 1]?.text ?? "");
  const mat = { id: "gm-1", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "image", img: "ik3ccccc" } } as GameObject;
  check("桌垫没格可锁", !gridable(mat) && gridLockAction(mat, true) === null);
  const disc = { id: "gm-2", kind: "disc", x: 0, z: 0, rot: 0, layer: 0 } as GameObject;
  check("网格锁定的开关只认棋盘", !gridable(disc) && gridHug(disc) && !gridHug(mat));

  // 四份校验镜像：grid 只在真棋盘上留得住
  const sanBoard = api.sanitize({ ...room, o: [{ ...cb, grid: true }] });
  check("校验镜像留住棋盘的 grid", sanBoard.o.find((o) => o.id === cb.id)?.grid === true);
  check("校验镜像抹掉桌垫的 grid", api.sanitize({ ...room, o: [{ ...mat, grid: true }] }).o[0].grid === undefined);
  check("校验镜像抹掉卡牌的 grid", api.sanitize({ ...room, o: [{ id: "gc-1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, grid: true, card: { back: "plain" } } as unknown as GameObject] }).o[0].grid === undefined);
  check("开关网格锁定归区域权限管", changePerm({ kind: "board" } as GameObject, { kind: "board", grid: true } as GameObject) === "zone"
    && actionPerm(gridLockAction(cb, true)!) === "zone");
  check("整桌 diff 也只报区域权限", (() => { const t = touchedPerms(crowded.o, off.o); return t.has("zone") && !t.has("move"); })());

  // 三档开关：网格线只是看得见参考，吸附只管落点进格，一手一子才占用格子
  const gb = makeBoard("grid6")!;
  const gs = gb.board!;
  const q1: GameObject = { id: "sw-1", kind: "pawn", shape: "pawn", color: "#c8443c", x: 0.9, z: 0.6, rot: 0, layer: 0 };
  const q2: GameObject = { id: "sw-2", kind: "pawn", shape: "pawn", color: "#3d7fbf", x: 0.95, z: 0.6, rot: 0, layer: 0 };
  const plate: TableState = { ...room, o: [gb, q1, q2] };
  const near = snapOn(gs, 0.031, -0.026);
  const gapSpot = { x: gb.x + 0.031, z: gb.z - 0.026 };
  const seated = (m: { x: number; z: number }) => {
    const g = snapOn(gs, m.x - gb.x, m.z - gb.z);
    return g.cell !== null && Math.hypot(m.x - (gb.x + g.x), m.z - (gb.z + g.z)) <= GRID_EPS;
  };
  check("吸附盘上离格心最远的落点吸进格子", near.cell !== null && !seated(gapSpot), `格 ${near.cell}`);
  const w1 = resolveDrop(plate, [{ id: q1.id, x: gapSpot.x, z: gapSpot.z }])[0];
  check("自动吸附默认开着，落点自己进格", seated({ x: w1.x, z: w1.z }) && snapOn(gs, w1.x - gb.x, w1.z - gb.z).cell === near.cell, `${w1.x},${w1.z}`);
  const noSnap = apply(plate, snapOnAction(gb, false)!, "甲");
  check("关掉吸附只在盘上留一个 false", noSnap.o.find((o) => o.id === gb.id)?.snap === false);
  const w2 = resolveDrop(noSnap, [{ id: q1.id, x: gapSpot.x, z: gapSpot.z }])[0];
  check("关吸附后棋子就骑在格缝里摆", !seated({ x: w2.x, z: w2.z }), `${w2.x},${w2.z}`);
  const reSnap = apply(noSnap, snapOnAction(gb, true)!, "甲");
  check("重开吸附把字段删掉（默认就是开的）", reSnap.o.find((o) => o.id === gb.id)?.snap === undefined);
  const duo = resolveDrop(plate, [{ id: q1.id, x: gapSpot.x, z: gapSpot.z }, { id: q2.id, x: gapSpot.x, z: gapSpot.z }]);
  const duoCell = duo.map((m) => snapOn(gs, m.x - gb.x, m.z - gb.z).cell);
  check("只吸附不锁定的盘不管一手一子：同格两枚由物理挤歪，不另占一格", duo[0].x !== duo[1].x && duo.filter((m) => seated(m)).length < 2, `格 ${JSON.stringify(duoCell)}`);
  const bare = apply(plate, meshAction(gb, false)!, "甲");
  check("藏起网格线只在盘上留一个 false", bare.o.find((o) => o.id === gb.id)?.mesh === false);
  check("藏线一枚子都不挪", bare.o.filter((o) => o.kind !== "board").every((o) => { const b = plate.o.find((x) => x.id === o.id)!; return b.x === o.x && b.z === o.z && b.layer === o.layer; }));
  const lined = apply(bare, meshAction(gb, true)!, "甲");
  check("重画网格线把字段删掉（默认就是画的）", lined.o.find((o) => o.id === gb.id)?.mesh === undefined);
  const w3 = resolveDrop(bare, [{ id: q1.id, x: gapSpot.x, z: gapSpot.z }])[0];
  check("看不见网格线也照样吸附", seated({ x: w3.x, z: w3.z }), `${w3.x},${w3.z}`);
  check("吸附日志说清了关与开", noSnap.log.some((l) => l.text.includes("自动吸附")) && reSnap.log.some((l) => l.text.includes("自动吸附")), reSnap.log[reSnap.log.length - 1]?.text ?? "");
  check("关吸附的盘照样锁得住一手一子", (() => { const g = apply(noSnap, gridLockAction(gb, true)!, "甲"); const both = resolveDrop(g, [{ id: q1.id, x: gapSpot.x, z: gapSpot.z }, { id: q2.id, x: gapSpot.x, z: gapSpot.z }]); const cells = both.map((m) => snapOn(gs, m.x - gb.x, m.z - gb.z).cell); return g.o.find((o) => o.id === gb.id)?.grid === true && cells[0] !== null && cells[0] !== cells[1]; })());

  // 校验镜像：snap/mesh 跟 grid 一样只认真格子棋盘，而且只留「关掉」那一下
  const sanOff = api.sanitize({ ...room, o: [{ ...gb, snap: false, mesh: false }] });
  check("校验镜像留住棋盘的 snap 与 mesh", sanOff.o.find((o) => o.id === gb.id)?.snap === false && sanOff.o.find((o) => o.id === gb.id)?.mesh === false);
  const sanMat = api.sanitize({ ...room, o: [{ ...mat, snap: false, mesh: false }] });
  check("校验镜像抹掉桌垫的 snap 与 mesh", sanMat.o[0].snap === undefined && sanMat.o[0].mesh === undefined);
  const sanCard = api.sanitize({ ...room, o: [{ id: "sc-1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, snap: false, mesh: false, card: { back: "plain" } } as unknown as GameObject] });
  check("校验镜像抹掉卡牌的 snap 与 mesh", sanCard.o[0].snap === undefined && sanCard.o[0].mesh === undefined);
  const added = apply(room, { t: "add", o: { ...gb, id: "gb-2", snap: true, mesh: true, grid: true } }, "甲");
  const born = added.o.find((o) => o.id === "gb-2")!;
  check("归约收下默认值：true 的 snap 与 mesh 不进状态", born.snap === undefined && born.mesh === undefined && born.grid === true);
  check("桌垫没有吸附与网格线可关", snapOnAction(mat, false) === null && meshAction(mat, false) === null);
  check("开关吸附与网格线归区域权限管", changePerm({ kind: "board" } as GameObject, { kind: "board", snap: false } as GameObject) === "zone"
    && changePerm({ kind: "board" } as GameObject, { kind: "board", mesh: false } as GameObject) === "zone"
    && actionPerm(snapOnAction(gb, false)!) === "zone" && actionPerm(meshAction(gb, false)!) === "zone");
  check("整桌 diff 把藏线也算成区域改动", (() => { const t = touchedPerms(plate.o, bare.o); return t.has("zone") && !t.has("move"); })());

  // 新预设：井字盘只有九格，国际跳棋每方二十枚
  check("井字盘正好九格", cellCount(BOARDS.find((b) => b.id === "ttt")!.board) === 9, `${cellCount(BOARDS.find((b) => b.id === "ttt")!.board)} 格`);
  const draughts = starter("draughts", "d");
  const men = draughts.o.filter((o) => o.shape === "man");
  check("国际跳棋开局铺四十枚，黑白各二十", men.length === 40 && men.filter((o) => o.color === CHESS_COLORS[0]).length === 20, `${men.length} 枚`);
  const dPlate = draughts.o.find((o) => o.kind === "board")!;
  check("跳棋只铺深色格，一枚都没压在线上", men.every((m) => onBoard(dPlate, m.x, m.z) && snapOn(dPlate.board!, m.x - dPlate.x, m.z - dPlate.z).cell !== null));
  const hex11 = starter("hex11", "h");
  const hx = hex11.o.find((o) => o.kind === "board")!;
  check("十一路蜂窝盘开局八枚小人各占一格", (() => { const squad = hex11.o.filter((o) => gridHug(o) && onBoard(hx, o.x, o.z)); const cells = squad.map((o) => snapOn(hx.board!, o.x - hx.x, o.z - hx.z).cell); return squad.length === 8 && new Set(cells).size === 8 && cells.every((c) => c !== null); })());
  check("蜂窝盘格数对得上行列", cellCount(hx.board!) === 11 * 11, `${cellCount(hx.board!)} 格`);

  // 环形跑道：格号与贴图一一对应，格子都在盘内，盘心不吸附
  const ring = BOARDS.find((b) => b.id === "ring40")!.board;
  const ringSize = boardSize(ring);
  let numbered = true, inside = true;
  for (let i = 0; i < cellCount(ring); i++) {
    const c = cellFor(ring, i)!;
    if (snapOn(ring, c.x + 0.001, c.z - 0.001).cell !== i) numbered = false;
    if (Math.abs(c.x) > ringSize.w / 2 || Math.abs(c.z) > ringSize.d / 2) inside = false;
  }
  check("环形一圈正好 40 格", cellCount(ring) === 40, `${cellCount(ring)} 格`);
  check("环形的每一格都吸回自己那一号", numbered);
  check("环形的格子都在盘内", inside);
  check("环形盘心是空地，吸不到格", snapOn(ring, 0, 0).cell === null);
  const ringMen = starter("ring40", "r");
  check("环形开局四枚跑子各占一格", (() => { const b = ringMen.o.find((o) => o.kind === "board")!; const men = ringMen.o.filter((o) => gridHug(o) && onBoard(b, o.x, o.z)); const cells = men.map((o) => snapOn(b.board!, o.x - b.x, o.z - b.z).cell); return men.length === 4 && new Set(cells).size === 4 && cells.every((c) => c !== null); })());
  check("要掷骰推进的盘才配骰子", ringMen.o.some((o) => o.kind === "die") && !starter("chess", "c").o.some((o) => o.kind === "die") && !starter("xiangqi", "x").o.some((o) => o.kind === "die"));
}

/** 桌面预设：整桌换样子的归约、权限归属，以及资源清单与进度口径 */
function presetChecks(): void {
  const presetObjects: GameObject[] = [
    { id: "z-1", kind: "zone", x: 0.2, z: 0.2, rot: 0, layer: 0, w: 0.4, d: 0.2, label: "我的手牌区", hand: true, owner: "陌生人", priv: true },
    { id: "b-1", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "image", img: "iabc1234" } },
  ];
  const junk = apply(base, { t: "presetLoad", o: presetObjects, name: "象棋加桌垫" }, "甲");
  check("载入预设把整桌换掉", junk.o.length === 2 && junk.o.every((o) => o.id === "z-1" || o.id === "b-1"), junk.o.map((o) => o.id).join(","));
  const zone = junk.o.find((o) => o.id === "z-1")!;
  check("预设里的私有区不带着上一台浏览器的主人过来", zone.priv === undefined && zone.owner === undefined);
  check("预设里的「手牌区」只是块区域，不接管任何人的手", zone.hand === undefined);
  check("载入预设在记录里留一句系统话", junk.log.at(-1)?.kind === "system" && (junk.log.at(-1)?.text ?? "").includes("象棋加桌垫"), junk.log.at(-1)?.text ?? "");
  check("载入预设按「清空桌面」这一档管", actionPerm({ t: "presetLoad", o: [], name: "x" }) === "clear");
  const swapped = touchedPerms(base.o, junk.o);
  check("载入预设要同时有拆与建的权限", swapped.has("add") && (swapped.has("remove") || swapped.has("clear")), [...swapped].join(","));
  const named = apply(junk, { t: "presetLoad", o: presetObjects, name: "very-long-桌面预设名称-超过二十个字-超过二十个字-超过二十个字" }, "甲");
  check("预设名再长也只留得住一段", (named.log.at(-1)?.text ?? "").length < 60, named.log.at(-1)?.text ?? "");

  check("资源清单收齐卡面、牌堆、卡背与桌垫", imageKeysOf({
    o: [
      { id: "c-1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "classic", img: "iaaaaaaa" }, backImg: "ibbbbbbb" },
      { id: "p-1", kind: "pile", x: 0.1, z: 0.1, rot: 0, layer: 0, pile: [{ back: "classic", img: "iccccccc" }, { back: "classic", img: "iddddddd" }] },
      { id: "b-2", kind: "board", x: 0.2, z: 0.2, rot: 0, layer: 0, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "image", img: "ieeeeeee" } },
    ],
  }).length === 5);
  check("不成形的 key 不进资源清单", imageKeysOf({ o: [{ id: "c-2", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "classic", img: "坏 键名" } }] }).length === 0);

  // 进度口径：只有整桌那一次上报能换总数，卡片面板零散要图不算分母
  const keys = imageKeysOf({ o: [{ id: "c-3", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "classic", img: "iaaaaaaa" }, backImg: "ibbbbbbb" }] });
  check("整桌上报两张资源", keys.length === 2 && requestImages(keys, "table") === false && imageProgress().total === 2, JSON.stringify(imageProgress()));
  requestImages(["ifffffff"], undefined);
  check("零散要图不许改分母", imageProgress().total === 2, JSON.stringify(imageProgress()));
  check("换一张桌子就把分母换成新桌的量", (() => { requestImages(["iggggggg"], "table"); return imageProgress().total === 1; })());
  check("重载资源报回重排了几张", reloadImages() === 1);
}

/**
 * 象棋的踩子即吃与摆回开局。
 * 落点、拖动红圈、归约删子问的是同一份 preyAt，所以这里全按渲染层的路径喂：resolveDrop 算落点，
 * capturesOf 问吃谁，apply 的 move 落账。吃子绝不能把旁人挤开，重铺绝不能留下上一盘的残子。
 */
function xiangqiTakeChecks(): void {
  const open = starter("xiangqi", "吃子");
  const mat = open.o.find((o) => o.kind === "board")!;
  const spec = mat.board!;
  const [red, black] = XIANGQI_GLYPHS.map((g) => g.color);
  const node = (col: number, row: number) => {
    const at = cellFor(spec, row * spec.cols + col)!;
    return { x: mat.x + at.x, z: mat.z + at.z };
  };
  const cellOf = (x: number, z: number) => snapOn(spec, x - mat.x, z - mat.z).cell;
  const centred = (x: number, z: number) => {
    const g = snapOn(spec, x - mat.x, z - mat.z);
    return g.cell !== null && Math.hypot(x - (mat.x + g.x), z - (mat.z + g.z)) < 1e-6;
  };
  const at = (st: { o: GameObject[] }, pt: { x: number; z: number }) =>
    st.o.find((o) => o.kind === "disc" && Math.hypot(o.x - pt.x, o.z - pt.z) < GRID_EPS);
  const rank = { x: 4, z: 3 };   // 黑卒站的那一格（过河前最靠前的一排）
  const file = { x: 4, z: 6 };   // 红兵站的那一格
  const preyPt = node(rank.x, rank.z);
  const moverPt = node(file.x, file.z);
  const prey = at(open, preyPt);
  const mover = at(open, moverPt);
  if (!prey || !mover) {
    check("开局取得到对脸的红兵与黑卒", false, `${moverPt.x},${moverPt.z} / ${preyPt.x},${preyPt.z}`);
    return;
  }
  check("红兵正对黑卒，两家一色", mover.color === red && prey.color === black && mover.label === "兵" && prey.label === "卒");

  // ——— 踩子即吃 ———
  const drop = resolveDrop(open, [{ id: mover.id, x: preyPt.x + 0.004, z: preyPt.z - 0.003 }])[0];
  check("拖偏几毫米也正压在敌子那一格，不散开", cellOf(drop.x, drop.z) === cellOf(prey.x, prey.z) && Math.hypot(drop.x - preyPt.x, drop.z - preyPt.z) < 1e-6, JSON.stringify(drop));
  const caps = capturesOf(open, [drop]);
  check("预览圈到的正是那枚黑卒", caps.length === 1 && caps[0].prey.id === prey.id && caps[0].by === mover.id, JSON.stringify(caps.map((c) => c.prey.label)));
  const after = apply(open, { t: "move", m: [drop] }, "甲");
  check("松手就把黑卒从桌上拿走", !after.o.some((o) => o.id === prey.id));
  check("吃掉谁记进日志", (after.log.at(-1)?.text ?? "") === "吃掉了「卒」", after.log.at(-1)?.text);
  check("吃人的那枚端坐在格心里", centred(after.o.find((o) => o.id === mover.id)!.x, after.o.find((o) => o.id === mover.id)!.z));
  check("吃子不牵连旁人：其余物件一枚都没挪窝", open.o
    .filter((o) => o.id !== prey.id && o.id !== mover.id)
    .every((o) => { const n = after.o.find((x) => x.id === o.id); return !!n && n.x === o.x && n.z === o.z; }));

  const allyPt = node(2, 6);
  const friendly = resolveDrop(open, [{ id: mover.id, x: allyPt.x + 0.002, z: allyPt.z + 0.002 }])[0];
  check("踩到自己人那一格不算吃", capturesOf(open, [friendly]).length === 0);
  check("踩到自己人只散到最近的空格，照样坐得端正", cellOf(friendly.x, friendly.z) !== null
    && cellOf(friendly.x, friendly.z) !== cellOf(allyPt.x, allyPt.z)
    && centred(friendly.x, friendly.z)
    && Math.hypot(friendly.x - allyPt.x, friendly.z - allyPt.z) <= spec.cell * 1.6, JSON.stringify(friendly));

  const river = node(4, 4);
  const withDie = apply(open, { t: "add", o: { id: "tk-die", kind: "die", sides: 6, x: river.x, z: river.z, rot: 0, layer: 0 } }, "甲");
  const die = withDie.o.find((o) => o.id === "tk-die")!;
  check("骰子稳稳落在河界那一格", Math.hypot(die.x - river.x, die.z - river.z) < 1e-6, `${die.x},${die.z}`);
  const dieDrop = resolveDrop(withDie, [{ id: mover.id, x: river.x, z: river.z }])[0];
  check("骰子是随机器不是谁家的兵，踩上去不吃", capturesOf(withDie, [dieDrop]).length === 0);
  check("踩到骰子只会把它挤开，骰子还在桌上", apply(withDie, { t: "move", m: [dieDrop] }, "甲").o.some((o) => o.id === "tk-die"));

  const cannon = at(open, node(1, 7));
  if (cannon) {
    const duel = resolveDrop(open, [{ id: mover.id, x: preyPt.x, z: preyPt.z }, { id: cannon.id, x: preyPt.x, z: preyPt.z }]);
    const dubbed = capturesOf(open, duel);
    check("两枚红子抢同一枚黑卒，只有先到的吃得到", dubbed.length === 1 && dubbed[0].by === mover.id, JSON.stringify(dubbed.map((c) => c.by)));
    check("抢不到格的那枚散开了，没跟吃人的叠一处", cellOf(duel[0].x, duel[0].z) !== cellOf(duel[1].x, duel[1].z) && centred(duel[1].x, duel[1].z));
  }

  const unlocked = apply(open, gridLockAction(mat, false)!, "甲");
  const free = resolveDrop(unlocked, [{ id: mover.id, x: preyPt.x, z: preyPt.z }])[0];
  check("网格锁一关就不吃子了：锁没开，落点找不着格心", !takesCapture(unlocked.o.find((o) => o.id === mat.id)!) && capturesOf(unlocked, [free]).length === 0);
  check("锁没开时踩过去，黑卒照样在桌上", apply(unlocked, { t: "move", m: [free] }, "甲").o.some((o) => o.id === prey.id));
  check("吃子只在这盘说了「踩子即吃」的棋上成立", takesCapture(mat) && !["gomoku", "go9", "go13", "go", "chess", "checkers"].some((id) => takesCapture(makeBoard(id)!)));
  check("五子棋围棋不给「摆回开局」：开局那四十枚摊在盘边", ["gomoku", "go9", "go13", "go"].every((id) => resetAction(makeBoard(id)!) === null));

  // ——— 摆回开局 ———
  const reset = resetAction(mat);
  check("象棋盘给得出「摆回开局」", !!reset && reset.t === "reset" && reset.id === mat.id, JSON.stringify(reset));
  if (!reset) return;
  const messed = apply(apply(open, { t: "move", m: [drop] }, "甲"), { t: "move", m: [{ id: mover.id, x: river.x, z: river.z }] }, "甲");
  check("重置前盘上少了一枚", messed.o.filter((o) => o.kind === "disc").length === 31);
  const fixed = apply(messed, reset, "甲");
  const discs = fixed.o.filter((o) => o.kind === "disc");
  const cells = discs.map((o) => cellOf(o.x, o.z));
  check("摆回开局重新铺满 32 子，红黑各 16", discs.length === 32
    && discs.filter((o) => o.color === red).length === 16 && discs.filter((o) => o.color === black).length === 16, `${discs.length} 枚`);
  check("重铺的子个个坐在格心里，一格只有一枚", cells.every((c) => c !== null) && new Set(cells).size === 32, `${new Set(cells).size} 格`);
  check("重铺不收残子：吃到河界那枚红兵换了新的 id", !fixed.o.some((o) => o.id === mover.id));
  check("重铺只动盘上的子，棋盘和盘边罐子都留在原位", open.o.filter((o) => o.kind !== "disc")
    .every((o) => { const n = fixed.o.find((x) => x.id === o.id); return !!n && n.x === o.x && n.z === o.z; }));
  check("摆回开局会在记录里说一句", (fixed.log.at(-1)?.text ?? "").includes("摆回了开局"), fixed.log.at(-1)?.text);

  const bare = apply(starter("empty", "挪盘"), { t: "add", o: makeBoard("xiangqi")! }, "甲");
  const b1 = bare.o.find((o) => o.kind === "board")!;
  check("新棋盘一做出来就带着自己的来历", b1.preset === "xiangqi" && presetOf(b1)?.id === "xiangqi");
  const slid = apply(bare, { t: "move", m: resolveDrop(bare, [{ id: b1.id, x: 0.2, z: 0.12 }], true), rigid: true }, "甲");
  const b2 = slid.o.find((o) => o.id === b1.id)!;
  check("棋盘挪了位置还是那套棋", presetOf(b2)?.id === "xiangqi" && takesCapture(b2));
  const filled = apply(slid, resetAction(b2)!, "甲");
  const laid = filled.o.filter((o) => o.kind === "disc");
  const s2 = b2.board!;
  check("棋盘挪到哪，开局就铺到哪：32 子全跟着新盘心", laid.length === 32 && laid.every((o) => {
    const g = snapOn(s2, o.x - b2.x, o.z - b2.z);
    return g.cell !== null && Math.hypot(o.x - (b2.x + g.x), o.z - (b2.z + g.z)) < 1e-6 && onBoard(b2, o.x, o.z);
  }), `${laid.length} 枚`);

  // 8×8 那两套规格完全撞车：认不出来历就不给按钮，也不吃子；象棋独一份，丢了标记也认得回来
  const twin: GameObject = { id: "board-twin", kind: "board", board: { layout: "grid", cols: 8, rows: 8, cell: 0.082, theme: "checker" }, grid: true, x: 0, z: 0.2, rot: 0, layer: 0 };
  check("撞了规格的双生盘认不出来历：不吃子也不给重置", presetOf(twin) === null && !takesCapture(twin) && resetAction(twin) === null);
  const naked = { ...mat, preset: undefined };
  check("象棋盘丢了来历标记也认得回来：9×10 交叉线独一份", presetOf(naked)?.id === "xiangqi" && takesCapture(naked) && resetAction(naked) !== null);
  const chessTable = starter("chess", "重置");
  const cBoard = chessTable.o.find((o) => o.kind === "board")!;
  const perSide = (st: TableState) => CHESS_COLORS.map((c) => st.o.filter((o) => o.color === c && gridHug(o)).length).join("/");
  const routed = apply(chessTable, { t: "remove", ids: chessTable.o.filter((o) => o.color === CHESS_COLORS[0] && gridHug(o)).map((o) => o.id) }, "甲");
  const reborn = apply(routed, resetAction(cBoard)!, "甲");
  check("国际象棋照旧带重置，但不吃子", resetAction(makeBoard("chess")!) !== null && !takesCapture(makeBoard("chess")!));
  check("被收走的一整方也能摆回来：还是 16/16", perSide(chessTable) === "16/16" && perSide(routed) === "0/16" && perSide(reborn) === "16/16", `${perSide(routed)} → ${perSide(reborn)}`);

  // ——— 校验镜像与权限口径 ———
  const kept = api.sanitize({ ...open, o: [{ ...mat, id: "pm-1", preset: "xiangqi" }] }).o[0];
  const bloated = api.sanitize({ ...open, o: [{ ...mat, id: "pm-2", preset: "x".repeat(30) }] }).o[0];
  const grafted = api.sanitize({ ...open, o: [{ ...prey, preset: "xiangqi" }] }).o[0];
  check("校验镜像留得下棋盘来历", kept.preset === "xiangqi");
  check("来历标记过长会被抹掉", bloated.preset === undefined);
  check("别的物件带不进来历标记", grafted.preset === undefined);
  check("摆回开局要「清空」这一档", actionPerm({ t: "reset", id: "b" }) === "clear");
  check("吃子在服务端算「移除」", touchedPerms(open.o, after.o).has("remove"));
  check("重铺既算移除又算新增", (() => { const s = touchedPerms(messed.o, fixed.o); return s.has("remove") && s.has("add"); })());
}

/**
 * 行棋点位：开局每一枚子走得进哪些格、点位是不是正落在格心上、落子和拖动是不是一条路。
 * 下面这些期望串全部是按棋理手推出来的（車直冲、马蹩腿、象不过河、炮隔山吃子……），
 * 不是把引擎当下的输出抄成标准——上一批正是靠这个习惯揪出炮吃子和黑象河界两处错的。
 */
function xiangqiPointChecks(): void {
  const open = starter("xiangqi", "点位");
  const mat = open.o.find((o) => o.kind === "board")!;
  const spec = mat.board!;
  const [red, black] = XIANGQI_GLYPHS.map((g) => g.color);
  const node = (col: number, row: number) => {
    const at = cellFor(spec, row * spec.cols + col)!;
    return { x: mat.x + at.x, z: mat.z + at.z };
  };
  const at = (st: TableState, col: number, row: number) => {
    const pt = node(col, row);
    return st.o.find((o) => o.kind === "disc" && Math.hypot(o.x - pt.x, o.z - pt.z) < GRID_EPS);
  };
  /** 点位清单折成「列,行」串，带「!」的是踩过去就吃子的那一格 */
  const where = (st: TableState, o: GameObject) => pointsOf(st, o).map((p) => {
    const c = cellFor(spec, p.cell)!;
    return `${c.col},${c.row}${p.take ? "!" : ""}`;
  }).join(" ");
  /** 走一格：跟手拖完全同一条路（resolveDrop 定落点，move 落账） */
  const send = (st: TableState, id: string, col: number, row: number) => {
    const pt = node(col, row);
    return apply(st, { t: "move", m: resolveDrop(st, [{ id, x: pt.x, z: pt.z }]) }, "甲");
  };
  const discs = open.o.filter((o) => o.kind === "disc");

  // ——— 开局每一枚 ———
  check("开局 32 枚子个个认得出角色、归象棋这套规矩管", discs.length === 32 && discs.every((o) => roled(o) && governed(open, o)), `${discs.length} 枚`);
  const all = discs.map((o) => pointsOf(open, o));
  check("开局没有一枚子被堵死（每一枚都点亮了格子）", all.every((l) => l.length > 0), discs.map((o, i) => `${o.label}${all[i].length}`).join(" "));
  check("点位全压在格心上，跟拖动吸附落的是同一处", all.flat().every((p) => {
    const g = snapOn(spec, p.x - mat.x, p.z - mat.z);
    return g.cell === p.cell && Math.hypot(p.x - (mat.x + g.x), p.z - (mat.z + g.z)) < 1e-6;
  }));
  check("点位不会跑出盘外", all.flat().every((p) => onBoard(mat, p.x, p.z)));
  check("点位按格号排好序，游标轮换才不会跳来跳去", all.every((l) => l.every((p, i) => i === 0 || l[i - 1].cell < p.cell)));
  check("兵卒没过河绝不许踏进对岸：开局 8 枚兵卒只点亮自家那一侧", discs.filter((o) => o.label === "兵" || o.label === "卒").every((o) => pointsOf(open, o).every((p) => {
    const c = cellFor(spec, p.cell)!;
    return o.color === red ? c.row >= 5 : c.row <= 4;
  })));

  // ——— 每种角色的开局步数，逐字对 ———
  const one = (col: number, row: number) => at(open, col, row)!;
  const want = (label: string, col: number, row: number, expect: string) => {
    const o = at(open, col, row);
    check(`${label}（${col},${row}）的落点正是手推的那几格`, !!o && where(open, o) === expect, o ? where(open, o) : "取不到这一枚");
  };
  want("黑車", 0, 0, "0,1 0,2");
  want("黑馬", 1, 0, "0,2 2,2");
  want("黑象", 2, 0, "0,2 4,2");
  want("黑士", 3, 0, "4,1");
  want("黑將", 4, 0, "4,1");
  want("黑砲", 1, 2, "1,1 0,2 2,2 3,2 4,2 5,2 6,2 1,3 1,4 1,5 1,6 1,9!");
  want("黑卒", 0, 3, "0,4");
  want("红俥", 0, 9, "0,7 0,8");
  want("红馬", 1, 9, "0,7 2,7");
  want("红相", 2, 9, "0,7 4,7");
  want("红仕", 3, 9, "4,8");
  want("红帥", 4, 9, "4,8");
  want("红兵", 0, 6, "0,5");
  const cannon = at(open, 1, 7)!;
  const cpy = pointsOf(open, cannon);
  const ctakes = cpy.filter((p) => p.take).map((p) => { const c = cellFor(spec, p.cell)!; return `${c.col},${c.row}`; }).join(" ");
  check("红炮开局点亮 12 处：空处照走，隔着炮架才吃得着人", cpy.length === 12, where(open, cannon));
  check("红炮这一翻山翻得远：吃的是正对面那匹黑馬，中间空着一整条竖线", ctakes === "1,0", ctakes);
  check("红炮自己的炮架（黑砲那一格）反倒不是落点", !where(open, cannon).includes("1,2"));

  // ——— 堵路：蹩马腿、塞象眼 ———
  const hobble = send(open, at(open, 1, 2)!.id, 1, 1);
  const bHorse = at(hobble, 1, 0);
  check("马腿被人塞住：黑馬一处也走不了，可它照样归规矩管（要说「没处可走」）", !!bHorse && pointsOf(hobble, bHorse).length === 0 && governed(hobble, bHorse));
  const blind = send(open, at(open, 1, 2)!.id, 1, 8);
  const eEle = at(blind, 2, 9);
  check("象眼被人塞住：红相只剩一条斜路，另一条眼看不得", !!eEle && where(blind, eEle) === "4,7", eEle && where(blind, eEle));

  // ——— 河界与九宫：这两道墙必须真的挡得住 ———
  const eBank = send(open, at(open, 2, 0)!.id, 0, 2);
  const e2 = at(eBank, 0, 2);
  check("黑象走到河口那一格，另一条斜路正踩在河界上（半边算到第 4 行为止）", !!e2 && where(eBank, e2) === "2,0 2,4", e2 && where(eBank, e2));
  const crossed1 = send(open, at(open, 4, 6)!.id, 4, 5);
  const p1 = at(crossed1, 4, 5);
  check("红兵没过河只许直走一步", !!p1 && where(crossed1, p1) === "4,4", p1 && where(crossed1, p1));
  const crossed2 = send(crossed1, p1!.id, 4, 4);
  const p2 = at(crossed2, 4, 4);
  check("红兵过了河就左右都能走了，正前方那枚黑卒也吃得", !!p2 && where(crossed2, p2) === "4,3! 3,4 5,4", p2 && where(crossed2, p2));
  const palace2 = send(open, at(open, 4, 9)!.id, 4, 8);
  const k2 = at(palace2, 4, 8);
  check("紅帥挪到九宫正中：上下左右四格都走得开", !!k2 && where(palace2, k2) === "4,7 3,8 5,8 4,9", k2 && where(palace2, k2));
  const palace3 = send(palace2, k2!.id, 4, 7);
  const k3 = at(palace3, 4, 7);
  const klist = k3 ? pointsOf(palace3, k3) : [];
  check("帥顶到九宫上边就到此为止：绝不许走出那三道横线", !!k3 && where(palace3, k3) === "3,7 5,7 4,8" && klist.every((p) => { const c = cellFor(spec, p.cell)!; return c.row >= 7 && c.col >= 3 && c.col <= 5; }), k3 && where(palace3, k3));

  // ——— 落点上的东西算不算猎物 ———
  const stacked: TableState = { ...open, o: open.o.map((o) => (o.id === at(open, 0, 6)!.id || o.id === at(open, 2, 6)!.id ? { ...o, ...node(1, 1) } : o)) };
  const cpc = spec.cols * 1 + 1;
  check("两枚自家子挤在同一格：那一格既不是落点也不是猎物", stacked.o.filter((o) => o.kind === "disc").every((o) => {
    const l = pointsOf(stacked, o);
    return !l.some((p) => p.cell === cpc);
  }), `格子 ${cpc}`);
  check("挤成一坨的那一格照样堵得住马腿", (() => { const h = at(stacked, 1, 0); return !!h && pointsOf(stacked, h).length === 0; })());
  const withDie: TableState = { ...open, o: [...open.o, { id: "pt-die", kind: "die", sides: 6, ...node(1, 1), rot: 0, layer: 0 }] };
  const dCannon = at(withDie, 1, 2);
  check("骰子杵在路上算障碍：那一格不是落点，谁也吃不掉它", !!dCannon && !pointsOf(withDie, dCannon).some((p) => p.cell === cpc) && !pointsOf(withDie, dCannon).some((p) => p.take && Math.hypot(p.x - node(1, 1).x, p.z - node(1, 1).z) < 1e-6));
  check("骰子占的那一格照样把马腿蹩得死死的", (() => { const h = at(withDie, 1, 0); return !!h && pointsOf(withDie, h).length === 0; })());

  // ——— 不归这套规矩管的，一个点位都不许点亮 ———
  const renamed = { ...one(0, 0), label: "叉" };
  check("刻字改过的子认不出角色：不给点位", pointsOf({ ...open, o: [renamed, mat] }, renamed).length === 0 && !roled(renamed) && !governed({ ...open, o: [renamed, mat] }, renamed));
  const tinted = { ...one(0, 0), color: "#123456" };
  check("颜色对不上任何一方的子不知道是谁家的：不给点位", !governed({ ...open, o: [tinted, mat] }, tinted) && pointsOf({ ...open, o: [tinted, mat] }, tinted).length === 0);
  const card: GameObject = { id: "pt-card", kind: "card", x: mat.x, z: mat.z, rot: 0, layer: 0, card: { back: "plain" } };
  check("一张牌坐在盘上不给点位：点位是行棋规矩，不是万能吸附", pointsOf({ ...open, o: [card, mat] }, card).length === 0 && !governed({ ...open, o: [card, mat] }, card));
  check("没挂规矩的棋盘一律不亮点位：围棋盘上坐着子也算不出象棋步", (() => {
    const bare = apply(starter("empty", "点位"), { t: "add", o: makeBoard("go9")! }, "甲");
    const g = bare.o.find((o) => o.kind === "board")!;
    const gspec = g.board!;
    const cell = cellFor(gspec, gspec.cols + 1)!;
    const d = apply(bare, { t: "add", o: { id: "pt-g", kind: "disc", x: g.x + cell.x, z: g.z + cell.z, rot: 0, layer: 0, color: red, label: "○" } }, "甲");
    const disc = d.o.find((o) => o.id === "pt-g")!;
    return boardRule(g) === null && !rulesOn(g) && boardRule(mat) === "xiangqi" && pointsOf(d, disc).length === 0;
  })());
  check("五子棋盘挂上了规矩但没有角色：圆片坐得再正也点不出落子位", (() => {
    const bare = apply(starter("empty", "点位"), { t: "add", o: makeBoard("gomoku")! }, "甲");
    const g = bare.o.find((o) => o.kind === "board")!;
    const cell = cellFor(g.board!, g.board!.cols + 1)!;
    const d = apply(bare, { t: "add", o: { id: "pt-g2", kind: "disc", x: g.x + cell.x, z: g.z + cell.z, rot: 0, layer: 0, color: GO_COLORS[0], label: "●" } }, "甲");
    const disc = d.o.find((o) => o.id === "pt-g2")!;
    return boardRule(g) === "gomoku" && rulesOn(g) && seatOf(disc, g, g.board!) === g.board!.cols + 1 && pointsOf(d, disc).length === 0 && !governed(d, disc);
  })());
  const unlocked = apply(open, gridLockAction(mat, false)!, "甲");
  const uMat = unlocked.o.find((o) => o.id === mat.id)!;
  check("格子锁一开就不再点位：落点都不贴格心了，标了也落不稳", rulesOn(uMat) === false && boardRule(uMat) === "xiangqi" && discs.every((o) => {
    const x = unlocked.o.find((y) => y.id === o.id);
    return !!x && pointsOf(unlocked, x).length === 0 && !governed(unlocked, x);
  }));

  // ——— 点位落到桌上：跟手拖同一条路 ———
  const rChariot = at(open, 0, 9)!;
  const target = pointsOf(open, rChariot).find((p) => !p.take && cellFor(spec, p.cell)!.row === 7);
  const viaPoint = placeAction(open, rChariot, target!);
  const viaDrag = resolveDrop(open, [{ id: rChariot.id, x: target!.x, z: target!.z }])[0];
  check("点位给出的落点直接能喂给落子动作，不另外造一套", !!viaPoint && viaPoint.t === "move" && viaPoint.m.length === 1, JSON.stringify(viaPoint));
  const mv = viaPoint && viaPoint.t === "move" ? viaPoint.m[0] : null;
  check("点亮着那一格跟手拖过去落在同一处坐标", !!mv && mv.x === viaDrag.x && mv.z === viaDrag.z && mv.id === rChariot.id, JSON.stringify(mv));
  check("走一步落在格心里，别的子一枚都不许被挤开", (() => {
    const done = apply(open, viaPoint!, "甲");
    const now = done.o.find((o) => o.id === rChariot.id)!;
    return centred(now.x, now.z) && open.o.filter((o) => o.id !== rChariot.id).every((o) => {
      const n = done.o.find((x) => x.id === o.id);
      return !!n && n.x === o.x && n.z === o.z;
    });
  })());
  function centred(x: number, z: number) {
    const g = snapOn(spec, x - mat.x, z - mat.z);
    return g.cell !== null && Math.hypot(x - (mat.x + g.x), z - (mat.z + g.z)) < 1e-6;
  }
  const pawn = at(open, 4, 6)!;
  const half = send(open, pawn.id, 4, 5);
  const onBank = at(half, 4, 5)!;
  const camp = send(half, onBank.id, 4, 4);
  const ford = at(camp, 4, 4)!;
  const eatPoint = pointsOf(camp, ford).find((p) => p.take);
  const eat = placeAction(camp, ford, eatPoint!);
  const eaten = apply(camp, eat!, "甲");
  check("过河兵正对的黑卒确实标成了可吃的一格", !!eatPoint && eatPoint.take);
  check("点位里标了「吃」的那一格踩过去真的吃掉那一枚", !eaten.o.some((o) => o.id === at(open, 4, 3)!.id) && (eaten.log.at(-1)?.text ?? "") === "吃掉了「卒」", eaten.log.at(-1)?.text);
  check("吃子这一笔要走的权限跟手拖一模一样", touchedPerms(camp.o, eaten.o).has("remove") && actionPerm(eat!) === "move");
}

/**
 * 裁判与禁手：送将、照面走不了（硬拖也退回原位并说清为什么），吃子只认登记的两家，
 * 将军/绝杀/逼和判得出来、解将的落点数得清，五子棋黑棋连到七颗算长连禁手。
 * 下面每个局面都是按棋理手摆的，落点串也是手推的——不是抄引擎当下的输出。
 */
function judgeChecks(): void {
  const open = starter("xiangqi", "裁判");
  const mat = open.o.find((o) => o.kind === "board")!;
  const spec = mat.board!;
  const RED = XIANGQI_GLYPHS[0].color;
  const BLACK = XIANGQI_GLYPHS[1].color;
  const cellNo = (col: number, row: number) => row * spec.cols + col;
  const node = (col: number, row: number) => {
    const at = cellFor(spec, cellNo(col, row))!;
    return { x: mat.x + at.x, z: mat.z + at.z };
  };
  let seq = 0;
  const piece = (label: string, color: string, col: number, row: number): GameObject => ({
    id: `jc${++seq}`, kind: "disc", ...node(col, row), rot: 0, layer: 0, color, label,
  });
  /** 空盘上手摆局面：棋盘照旧是开局那块，子只留我点名的这几枚 */
  const scene = (...ps: GameObject[]): TableState => ({ ...open, o: [mat, ...ps] });
  const at = (st: TableState, col: number, row: number) =>
    st.o.find((o) => o.kind === "disc" && seatOf(o, mat, spec) === cellNo(col, row));
  const where = (st: TableState, o: GameObject) => pointsOf(st, o).map((p) => {
    const c = cellFor(spec, p.cell)!;
    return `${c.col},${c.row}${p.take ? "!" : ""}`;
  }).join(" ");
  /** 走一步：跟手拖完全同一条路（resolveDrop 定落点，move 落账），回「正落进那一格了吗」 */
  const play = (st: TableState, o: GameObject, col: number, row: number) => {
    const pt = node(col, row);
    const after = apply(st, { t: "move", m: resolveDrop(st, [{ id: o.id, x: pt.x, z: pt.z }]) }, "甲");
    return { after, landed: at(after, col, row)?.id === o.id, notes: after.log.slice(-3).map((l) => l.text) };
  };
  const said = (r: { notes: string[] }) => r.notes.join(" / ");

  // 五子棋那份夹具先铺好：象棋的敌我口径要拿它对照「换一套盘就是另一对颜色」
  const goStarter = starter("gomoku", "长连");
  const goBoard = goStarter.o.find((o) => o.kind === "board")!;
  const gspec = goBoard.board!;
  const gnode = (col: number, row: number) => {
    const c = cellFor(gspec, row * gspec.cols + col)!;
    return { x: goBoard.x + c.x, z: goBoard.z + c.z };
  };
  const stone = (tag: string, color: string, col: number, row: number): GameObject => ({
    id: `jg${tag}`, kind: "disc", shape: "puck", ...gnode(col, row), rot: 0, layer: 0, color,
  });
  const blackStone = goStarter.o.find((o) => o.kind === "disc" && o.color === GO_COLORS[0])!;
  const whiteStone = goStarter.o.find((o) => o.kind === "disc" && o.color === GO_COLORS[1])!;
  const gscene = (...seated: GameObject[]): TableState => ({ ...goStarter, o: [goBoard, blackStone, whiteStone, ...seated] });
  const run = (color: string, from: number, to: number, row: number, tag: string) => {
    const out: GameObject[] = [];
    for (let c = from; c <= to; c++) out.push(stone(`${tag}${c}`, color, c, row));
    return out;
  };
  const gplay = (st: TableState, o: GameObject, col: number, row: number) => {
    const pt = gnode(col, row);
    const after = apply(st, { t: "move", m: resolveDrop(st, [{ id: o.id, x: pt.x, z: pt.z }]) }, "甲");
    const now = after.o.find((x) => x.id === o.id)!;
    return { after, landed: seatOf(now, goBoard, gspec) === row * gspec.cols + col, notes: after.log.slice(-3).map((l) => l.text) };
  };

  // ——— 吃子只认登记的两家 ———
  const bite = scene(
    piece("車", RED, 2, 5),
    piece("車", BLACK, 2, 3),
    piece("兵", RED, 2, 7),
    piece("車", "#123456", 0, 5),
  );
  const bCar = at(bite, 2, 5)!;
  const bCells = pointsOf(bite, bCar).map((p) => {
    const c = cellFor(spec, p.cell)!;
    return `${c.col},${c.row}${p.take ? "!" : ""}`;
  });
  check("正对着的黑车才是猎物：可吃的一格全场独一份", bCells.filter((s) => s.endsWith("!")).join(",") === "2,3!", bCells.join(" "));
  check("同色不算敌人：自家兵那一格连落点都不是", !bCells.includes("2,7") && !bCells.includes("2,7!"));
  check("第三色挡得住路却没人吃得了它：那一格既不是落点也没标可吃", !bCells.includes("0,5") && !bCells.includes("0,5!"));
  const camps = campsOf(mat);
  check("象棋盘登记的两家就是红黑，五子棋盘是黑白", camps?.[0] === RED && camps?.[1] === BLACK && campsOf(goBoard)?.[0] === GO_COLORS[0]);
  check("两家才算敌人：同色不算、第三色也不算", enemyOf(bCar, at(bite, 2, 3)!, camps) && !enemyOf(bCar, at(bite, 2, 7)!, camps) && !enemyOf(bCar, at(bite, 0, 5)!, camps));
  check("没挂规矩的盘子照旧只看颜色不同：别把围棋的敌我口径搅进象棋", enemyOf(bCar, at(bite, 2, 3)!, null) && !enemyOf(bCar, at(bite, 2, 3)!, [RED, RED]));

  // ——— 钉子：一动就露自家王 ———
  const pin = scene(
    piece("帥", RED, 4, 9),
    piece("仕", RED, 4, 8),
    piece("車", BLACK, 4, 5),
    piece("將", BLACK, 0, 0),
  );
  const shi = at(pin, 4, 8)!;
  check("仕垫在车口上：斜走四格全在露帅，一处都不点亮，可它照样归规矩管", pointsOf(pin, shi).length === 0 && governed(pin, shi) && roled(shi) && checkedCamp(pin) === -1, where(pin, shi));
  const pinMove = play(pin, shi, 3, 7);
  check("硬把仕拖开：落不进那一格，还稳稳坐在 (4,8)", !pinMove.landed && !!at(pinMove.after, 4, 8), said(pinMove));
  check("退回原位要说清为什么露了帅", pinMove.notes.some((s) => s.includes("自家王还在对方火力下")), said(pinMove));
  const lifted: TableState = { ...pin, o: pin.o.map((o) => (o.id === shi.id ? { ...o, ...node(3, 7) } : o)) };
  check("闸门与点位同源：点位不亮的那一格，bannedLanding 也说走不得", pointsOf(pin, shi).length === 0 && bannedLanding(pin, lifted, shi) !== null, bannedLanding(pin, lifted, shi) ?? "null");
  check("被裁判拦下的一步谁也没少吃：子没少、车还在格上", pinMove.after.o.length === pin.o.length && !!at(pinMove.after, 4, 5), said(pinMove));
  const pinKing = at(pin, 4, 9)!;
  check("帅左右一让就脱开车口：点亮 3,9 与 5,9，垫着的自家仕那一格不算", where(pin, pinKing) === "3,9 5,9", where(pin, pinKing));
  check("让开的这一步裁判认：正落进 3,9", play(pin, pinKing, 3, 9).landed);

  // ——— 将帅照面：谁拆掉最后的遮挡谁犯规 ———
  const face = scene(
    piece("帥", RED, 4, 9),
    piece("將", BLACK, 4, 0),
    piece("馬", BLACK, 4, 4),
    piece("車", RED, 6, 4),
  );
  const horse = at(face, 4, 4)!;
  const fCar = at(face, 6, 4)!;
  check("马是王行线上唯一的遮挡：八步都要拆开照面，一处不许走", pointsOf(face, horse).length === 0 && governed(face, horse), where(face, horse));
  check("红车吃掉那匹马反倒合规矩：踩上去正好自家补上那道遮挡", where(face, fCar).includes("4,4!"), where(face, fCar));
  check("红车十三处照常点亮：手推的落点一格格对上", where(face, fCar) === "6,0 6,1 6,2 6,3 4,4! 5,4 7,4 8,4 6,5 6,6 6,7 6,8 6,9", where(face, fCar));
  const eatHorse = play(face, fCar, 4, 4);
  check("拖红车去吃那匹马：落得下，马真被吃了", eatHorse.landed && !eatHorse.after.o.some((o) => o.id === horse.id), said(eatHorse));
  const afterEat = judge(eatHorse.after);
  check("吃完换成红车照着黑將：轮到黑方被将，红方倒解了照面", eatHorse.landed && afterEat?.camp === 1 && afterEat.over === null && afterEat.cells.length === 2, JSON.stringify(afterEat?.cells ?? null));
  const strayHorse = play(face, horse, 2, 3);
  check("马自己走开就把两家照了面：这一步落不进", !strayHorse.landed && !!at(strayHorse.after, 4, 4), said(strayHorse));
  check("照面拦下来要说清是照面", strayHorse.notes.some((s) => s.includes("将帅照了面")), said(strayHorse));
  check("挪开一格不拆遮挡：红车这一步照常落地", play(face, fCar, 5, 4).landed);
  const mess = scene(piece("帥", RED, 4, 9), piece("將", BLACK, 4, 0), piece("車", RED, 2, 5));
  check("两家已经照面：红车只有垫进王行线那一步走得动", where(mess, at(mess, 2, 5)!) === "4,5", where(mess, at(mess, 2, 5)!));
  check("已经照面的两家都把王挪开就解了：黑將左右两格点亮", where(mess, at(mess, 4, 0)!) === "3,0 5,0", where(mess, at(mess, 4, 0)!));
  const stray = apply(mess, { t: "move", m: [{ id: at(mess, 4, 0)!.id, x: mat.x + 1.2, z: mat.z + spec.rows * spec.cell }] }, "甲");
  const strayKing = stray.o.find((o) => o.id === at(mess, 4, 0)!.id)!;
  check("摆乱的局面上把子拖离棋盘裁判不许插手：照样落", seatOf(strayKing, mat, spec) === null && Math.hypot(strayKing.x - at(mess, 4, 0)!.x, strayKing.z - at(mess, 4, 0)!.z) > 0.2);

  // ——— 将军提示与应将指引 ———
  const checked = scene(piece("帥", RED, 4, 9), piece("將", BLACK, 8, 0), piece("車", BLACK, 4, 7));
  const ck = judge(checked);
  check("车贴着脸将军：判得出被将的是红方，还没分出胜负", ck?.camp === 0 && ck?.over === null && checkedCamp(checked) === 0, JSON.stringify(ck?.cells ?? null));
  check("被将的王脚下一圈红环报得出位置", (() => { const k = checkedKing(checked); return !!k && Math.hypot(k.x - node(4, 9).x, k.z - node(4, 9).z) < 1e-6; })(), JSON.stringify(checkedKing(checked)));
  check("红环连着那一枚本身一起交出去，渲染层好按体积收放", checkedKing(checked)?.o.id === at(checked, 4, 9)!.id, checkedKing(checked)?.o.label ?? "null");
  check("贴着将还能走的只有左右两格：(4,8) 正在车口上，不点亮", where(checked, at(checked, 4, 9)!) === "3,9 5,9", where(checked, at(checked, 4, 9)!));
  check("解将的落点数得清：两处", ck?.cells.length === 2, JSON.stringify(ck?.cells ?? null));
  check("应将指引点得出名：这一局面上只有帥自己能让开", ck?.savers.length === 1 && ck.savers[0] === at(checked, 4, 9)!.id, JSON.stringify(ck?.savers ?? null));

  const reply = scene(piece("帥", RED, 4, 9), piece("車", RED, 2, 7), piece("車", BLACK, 0, 9), piece("將", BLACK, 8, 0));
  const rp = judge(reply);
  check("底线车将军：红方能解将的落点是 2 处（帅让开、车垫上）", rp?.camp === 0 && rp.cells.length === 2, JSON.stringify(rp?.cells ?? null));
  check("两处理所当然出自两枚子：讓开的帥与垫上去的红车", [...(rp?.savers ?? [])].sort().join() === [at(reply, 4, 9)!.id, at(reply, 2, 7)!.id].sort().join(), JSON.stringify(rp?.savers ?? null));
  check("红车横竖十几步里只有垫在底线那一格合规矩", where(reply, at(reply, 2, 7)!) === "2,9", where(reply, at(reply, 2, 7)!));
  const blocked = play(reply, at(reply, 2, 7)!, 2, 8);
  check("垫错一行不解决问题：这一步裁判不收", !blocked.landed && !!at(blocked.after, 2, 7), said(blocked));
  const interpose = play(reply, at(reply, 2, 7)!, 2, 9);
  check("垫在车口那一格就把将解了：落得下，也不再将着红方", interpose.landed && checkedCamp(interpose.after) === -1, said(interpose));

  // ——— 绝杀与逼和 ———
  const mate = scene(
    piece("帥", RED, 4, 9),
    piece("將", BLACK, 3, 0),
    piece("車", BLACK, 4, 8),
    piece("車", BLACK, 3, 7),
    piece("卒", BLACK, 5, 8),
  );
  const mj = judge(mate);
  check("贴身车将军、卒护住吃车的路：红方一步都解不开，判绝杀", mj?.camp === 0 && mj?.cells.length === 0 && mj?.over?.how === "绝杀", JSON.stringify(mj?.cells ?? null));
  check("绝杀的播报点名输家与赢家", verdict(mate) === "红方已被将死，黑方胜", verdict(mate) ?? "null");
  check("将死的局面里红帅三个落点全被剔干净", where(mate, at(mate, 4, 9)!) === "", where(mate, at(mate, 4, 9)!));
  check("绝杀局面里应将指引也报不出子：一个能动的都没有", mj?.savers.length === 0, JSON.stringify(mj?.savers ?? null));
  const stale = scene(piece("帥", RED, 4, 9), piece("將", BLACK, 0, 0), piece("車", BLACK, 3, 8), piece("車", BLACK, 5, 8));
  check("没人被将但红方水泄不通：判逼和，黑方胜", checkedCamp(stale) === -1 && verdict(stale) === "红方无子可动（逼和），黑方胜", verdict(stale) ?? "null");
  const noKing = scene(piece("仕", RED, 4, 8), piece("車", BLACK, 4, 5), piece("將", BLACK, 0, 0));
  check("红方的王不在了：没王就谈不上将军，仕斜走四格照点", where(noKing, at(noKing, 4, 8)!) === "3,7 5,7 3,9 5,9" && judge(noKing) === null, where(noKing, at(noKing, 4, 8)!));

  // ——— 五子棋：黑棋七连珠算长连禁手 ———
  const six = gscene(...run(GO_COLORS[0], 2, 7, 0, "h"));
  const toSeven = gplay(six, blackStone, 1, 0);
  check("黑棋补成七连：落不进去，那颗子还在罐边", !toSeven.landed && seatOf(toSeven.after.o.find((o) => o.id === blackStone.id)!, goBoard, gspec) === null, said(toSeven));
  check("长连禁手要说清连了几颗", toSeven.notes.some((s) => s.includes(`${GOMOKU_LONG} 连`)), said(toSeven));
  const sixLegal = gplay(gscene(...run(GO_COLORS[0], 2, 6, 0, "i")), blackStone, 1, 0);
  check("六连照样放得下：卡在七颗这条线上", sixLegal.landed, said(sixLegal));
  const diag = gscene(
    stone("d1", GO_COLORS[0], 1, 1), stone("d2", GO_COLORS[0], 2, 2), stone("d3", GO_COLORS[0], 3, 3),
    stone("d4", GO_COLORS[0], 4, 4), stone("d5", GO_COLORS[0], 5, 5), stone("d6", GO_COLORS[0], 6, 6),
  );
  check("斜着数也一样：斜七连同样是长连禁手", !gplay(diag, blackStone, 0, 0).landed);
  const joined = gscene(...run(GO_COLORS[0], 0, 2, 0, "j1"), ...run(GO_COLORS[0], 4, 6, 0, "j2"));
  check("补上断点连成七颗照样算长连", !gplay(joined, blackStone, 3, 0).landed);
  const joined6 = gscene(...run(GO_COLORS[0], 0, 2, 0, "k1"), ...run(GO_COLORS[0], 4, 5, 0, "k2"));
  check("补上断点只连成六颗：放行", gplay(joined6, blackStone, 3, 0).landed);
  const white7 = gscene(...run(GO_COLORS[1], 1, 6, 3, "w"));
  check("长连只限黑棋：白棋连到七颗照落", gplay(white7, whiteStone, 0, 3).landed);
  check("五子棋盘上没有吃子这回事：黑子压不着白子", !BOARDS.find((b) => b.id === "gomoku")?.take && capturesOf(white7, [{ id: blackStone.id, ...gnode(7, 3) }]).length === 0);
}

/**
 * 配件批次：牌屏遮挡、沙漏计时、规则书翻页，外加米宝/王冠旗两形。
 * 这三样各有一套规矩，用例也各归各：遮挡看几何、沙漏看时刻、书看页数与字数。
 */
function accessoryChecks(): void {
  const T = 1_760_000_000_000;
  const mkShield = (id: string, owner?: string, rot = 0, w = 0.3): GameObject =>
    ({ id, kind: "shield", label: "牌屏", color: "#7c2c3a", shield: { w, h: 0.15 }, owner, x: 0, z: 0, rot, layer: 0 });
  const mkCard = (id: string, x: number, z: number): GameObject =>
    ({ id, kind: "card", color: "#2c4a7c", card: { back: "classic", label: id }, x, z, rot: 0, layer: 0 });
  const mkHour = (id: string, mins: number, at: number | null): GameObject =>
    ({ id, kind: "hour", label: "沙漏", color: "#3d5c46", hour: { mins, at }, x: 0.2, z: -0.2, rot: 0, layer: 0 });
  const mkBook = (id: string, pages: string[], page = 0): GameObject =>
    ({ id, kind: "book", label: "规则书", color: "#d9a026", book: { pages, page }, x: -0.2, z: -0.2, rot: 0, layer: 0 });
  const tableWith = (...objects: GameObject[]): TableState => {
    let s = starter("empty", "配件桌");
    for (const o of objects) s = apply(s, { t: "add", o }, "甲");
    return s;
  };

  // ——— 牌屏：只有主人这一侧那一窄条算躲在屏后 ———
  const hiding = tableWith(mkShield("sd-1", "甲"), mkCard("c-front", 0, SHIELD_BAND / 2), mkCard("c-out", 0, SHIELD_BAND + 0.13));
  const front = hiding.o.find((o) => o.id === "c-front")!;
  const outside = hiding.o.find((o) => o.id === "c-out")!;
  check("屏前的牌对别人保密", faceHidden(front, hiding, "乙") && !faceHidden(front, hiding, "甲"));
  check("屏带以外的牌照旧给全桌看", !faceHidden(outside, hiding, "乙"));
  check("屏前那一窄条对别人也选不中", lockedOut(front, hiding, "乙") && !lockedOut(front, hiding, "甲"));
  check("别人的屏本身选不中", lockedOut(hiding.o.find((o) => o.id === "sd-1")!, hiding, "乙"));
  const gone = new Set(["乙"]);
  check("主人离席后屏不再锁人", !lockedOut(hiding.o.find((o) => o.id === "sd-1")!, hiding, "乙", gone) && !faceHidden(front, hiding, "乙", gone));
  const turned = tableWith(mkShield("sd-2", "甲", 90), mkCard("c-east", SHIELD_BAND / 2, 0), mkCard("c-west", -SHIELD_BAND / 2, 0));
  check("屏转 90° 遮挡带跟着转", faceHidden(turned.o.find((o) => o.id === "c-east")!, turned, "乙"));
  check("屏背面那一侧不挡人", !faceHidden(turned.o.find((o) => o.id === "c-west")!, turned, "乙"));
  const free = tableWith(mkShield("sd-3"), mkCard("c-free", 0, SHIELD_BAND / 2));
  check("没认领的屏谁也不挡", !faceHidden(free.o.find((o) => o.id === "c-free")!, free, "乙"));
  const bare = tableWith(mkShield("sd-4"), mkCard("c-claim", 0, SHIELD_BAND / 2));
  const bareShield = bare.o.find((o) => o.id === "sd-4")!;
  const claimed = apply(bare, shieldClaimAction(bareShield, "甲")!, "甲");
  check("认领写上归属", claimed.o.find((o) => o.id === "sd-4")?.owner === "甲");
  check("一认领屏前的牌就只对主人亮", faceHidden(claimed.o.find((o) => o.id === "c-claim")!, claimed, "乙") && !faceHidden(claimed.o.find((o) => o.id === "c-claim")!, claimed, "甲"));
  const released = apply(claimed, shieldClaimAction(claimed.o.find((o) => o.id === "sd-4")!, null)!, "甲");
  check("放开归属退回一块挡板", released.o.find((o) => o.id === "sd-4")?.owner === undefined);
  check("放开后屏前的牌又给全桌看", !faceHidden(released.o.find((o) => o.id === "c-claim")!, released, "乙"));
  const wide = tableWith(mkShield("sd-5", "甲", 0, SHIELD_MAX - 0.01));
  const widened = apply(wide, shieldResizeAction(wide.o.find((o) => o.id === "sd-5")!, 0.02)!, "甲").o.find((o) => o.id === "sd-5")!;
  check("牌屏加宽一档", fixShield(widened.shield).w === SHIELD_MAX);
  check("屏宽到顶就不再给动作", shieldResizeAction(widened, 0.05) === null);
  check("屏压到最矮就不给动作", shieldResizeAction({ ...widened, shield: { w: SHIELD_MAX, h: SHIELD_H_MIN } }, 0, -0.02) === null);
  check("脏值进桌会被夹回合法屏", (() => {
    const dirty = tableWith({ id: "sd-6", kind: "shield", color: "#fff", shield: { w: 9, h: -1 }, x: 0, z: 0.3, rot: 0, layer: 0 });
    const s = fixShield(dirty.o.find((o) => o.id === "sd-6")?.shield);
    return s.w === SHIELD_MAX && s.h === SHIELD_H_MIN;
  })());

  // ——— 沙漏：只有「翻过来漏」与「按回去停」两态 ———
  const still = tableWith(mkHour("hg-1", 3, null));
  const hg1 = still.o.find((o) => o.id === "hg-1")!;
  const flipped = apply(still, hourFlipAction(hg1, T)!, "甲");
  check("翻过来记下起算时刻", flipped.o.find((o) => o.id === "hg-1")?.hour?.at === T);
  const pressed = apply(flipped, hourFlipAction(flipped.o.find((o) => o.id === "hg-1")!, T + 60_000)!, "乙");
  check("按回去就停住", pressed.o.find((o) => o.id === "hg-1")?.hour?.at === null);
  check("两端重放同一片沙面", JSON.stringify(apply(still, hourFlipAction(hg1, T)!, "甲").o) === JSON.stringify(apply(still, hourFlipAction(hg1, T)!, "乙").o));
  const running = pressed.o.find((o) => o.id === "hg-1")!;
  const ticking = apply(pressed, { t: "hour", id: "hg-1", mins: 3, at: T }, "甲").o.find((o) => o.id === "hg-1")!;
  check("剩多少沙按时刻算", hourLeft(ticking, T + 60_000) === 120 && Math.abs(hourRatio(ticking, T + 60_000) - 2 / 3) < 1e-6);
  check("没在漏就是整整一漏", hourLeft(running, T) === 180 && hourRatio(running, T) === 1);
  check("漏完了读数归零", hourLeft(ticking, T + 400_000) === 0 && hourDone(ticking, T + 400_000));
  check("换档位会把沙子重新装满", apply(still, hourSetAction(hg1, 1)!, "甲").o.find((o) => o.id === "hg-1")?.hour?.mins === 4);
  check("沙漏档位越界不出动作", hourSetAction(hg1, 8) === null && hourSetAction(mkHour("hg-0", 1, null), -1) === null);
  check("非法分钟数进不了桌", JSON.stringify(apply(still, { t: "hour", id: "hg-1", mins: 0, at: null }, "甲").o) === JSON.stringify(still.o));
  const dirtyHour = tableWith({ id: "hg-9", kind: "hour", color: "#fff", hour: { mins: 99, at: 5 }, x: 0, z: 0.35, rot: 0, layer: 0 });
  const dh = dirtyHour.o.find((o) => o.id === "hg-9")?.hour;
  check("脏沙漏进桌会被收口", dh?.mins === HOUR_MAX && dh?.at === null);
  // 响铃：漏完就提醒，静音只压这一轮，再翻一次照常再响
  const done = mkHour("hg-ring", 1, T);
  check("漏完的沙漏在响", ringing([done], T + 61_000).some((o) => o.id === "hg-ring"));
  silenceAlarm(done);
  check("静音压住这一轮", !ringing([done], T + 61_000).some((o) => o.id === "hg-ring"));
  check("重新翻过来又会照常响", ringing([{ ...done, hour: { mins: 1, at: T + 700_000 } }], T + 761_000).some((o) => o.id === "hg-ring"));

  // ——— 规则书：翻页、加减页、每页字数 ———
  const book = tableWith(mkBook("bk-1", ["房规\n", "计分\n", "备忘\n"]));
  const bk1 = book.o.find((o) => o.id === "bk-1")!;
  check("翻到第二页", apply(book, bookPageAction(bk1, 1)!, "甲").o.find((o) => o.id === "bk-1")?.book?.page === 1);
  check("翻页会在记录里说一句", (apply(book, bookPageAction(bk1, 1)!, "甲").log.at(-1)?.text ?? "").includes("第 2 页"));
  check("翻到头就停在那一页", bookPageAction(apply(book, bookPageAction(bk1, 2)!, "甲").o.find((o) => o.id === "bk-1")!, 1) === null);
  const grown = apply(book, bookPagesAction(bk1, 1)!, "甲");
  check("末尾添一页", fixBook(grown.o.find((o) => o.id === "bk-1")?.book).pages.length === 4);
  check("撕页会夹紧当前页", (() => {
    const at3 = apply(grown, { t: "book", id: "bk-1", page: 3 }, "甲").o.find((o) => o.id === "bk-1")!;
    const shrunk = apply(grown, bookPagesAction(at3, -1)!, "甲").o.find((o) => o.id === "bk-1")!;
    const b = fixBook(shrunk.book);
    return b.pages.length === 3 && b.page <= 2;
  })());
  check("改写本页会落进书面", fixBook(apply(book, bookWriteAction(bk1, ["房规\n改过一页", "计分\n", "备忘\n"], 0), "甲").o.find((o) => o.id === "bk-1")?.book).pages[0] === "房规\n改过一页");
  check("每页字数有上限", fixBook(apply(book, bookWriteAction(bk1, ["字".repeat(BOOK_CHARS + 500), "计分\n", "备忘\n"], 0)!, "甲").o.find((o) => o.id === "bk-1")?.book).pages[0].length === BOOK_CHARS);
  check("空本子不许提交", bookWriteAction(bk1, [], 0) === null);
  check("脏规则书进桌会被收口", (() => {
    const dirty = tableWith({ id: "bk-9", kind: "book", color: "#fff", book: { pages: Array.from({ length: 99 }, () => "字".repeat(999)), page: 90 }, x: 0, z: 0.4, rot: 0, layer: 0 });
    const b = fixBook(dirty.o.find((o) => o.id === "bk-9")?.book);
    return b.pages.length === BOOK_PAGE_MAX && b.page === BOOK_PAGE_MAX - 1 && b.pages[0].length === BOOK_CHARS;
  })());
  check("别种物件带不进书的数据", (() => {
    const s = tableWith({ ...mkCard("c-mix", 0.05, 0.05), book: { pages: ["串了"], page: 0 }, hour: { mins: 3, at: null }, shield: { w: 0.3, h: 0.15 } } as GameObject);
    const o = s.o.find((x) => x.id === "c-mix")!;
    return o.book === undefined && o.hour === undefined && o.shield === undefined;
  })());

  // ——— 权限与界面口径 ———
  check("改牌屏要「区域」这一档", actionPerm({ t: "shield", id: "sd-1", owner: "甲" }) === "zone");
  check("改沙漏要「计时」这一档", actionPerm({ t: "hour", id: "hg-1", mins: 3, at: null }) === "timer");
  check("改规则书要「编辑」这一档", actionPerm({ t: "book", id: "bk-1", page: 1 }) === "edit");
  check("换屏主算「区域」权限", changePerm(mkShield("sd-p", undefined), mkShield("sd-p", "甲")) === "zone");
  check("沙漏走漏算「计时」权限", changePerm(mkHour("hg-p", 3, null), mkHour("hg-p", 3, T)) === "timer");
  check("书面翻页算「编辑」权限", changePerm(mkBook("bk-p", ["a"]), mkBook("bk-p", ["a"], 1)) === "edit");
  check("牌屏沙漏规则书没有翻面一说", !FLIPPABLE.includes("shield") && !FLIPPABLE.includes("hour") && !FLIPPABLE.includes("book"));
  check("站着的东西才能钉高度", pinnable(mkShield("sd-pin", "甲")) && pinnable(mkHour("hg-pin", 3, null)));

  // ——— 两形新棋子 ———
  const meeple = addPieceAction("meeple", "#2c7c4a");
  const flag = addPieceAction("flag", "#c9a24a", "起始");
  const mp = meeple.t === "add" ? meeple.o : null;
  const fg = flag.t === "add" ? flag.o : null;
  check("米宝归到立体棋子", !!mp && mp.kind === "pawn" && mp.shape === "meeple" && kindOfShape("meeple") === "pawn");
  check("王冠旗带得上刻字", !!fg && fg.label === "起始" && kindOfShape("flag") === "pawn");
  if (!mp || !fg) {
    check("新棋子形状生成得出添加动作", false);
    return;
  }
  const two = tableWith({ ...mp, id: "mp-1" }, { ...fg, id: "fg-1" });
  check("新棋子占桌按各自体积算", footprintOf(two.o.find((o) => o.id === "mp-1")!) > 0 && footprintOf(two.o.find((o) => o.id === "fg-1")!) > 0);
  check("新棋子能进组件库开局", apply(two, meeple, "甲").o.length === 3);
}

/**
 * 座位距离与攻防范围：绕桌一圈数座位，进攻范围是自己能伸到几家，防御范围是别人打自己要多数几家。
 * 三国杀那类卡牌的距离结算全靠这一份口径，客户端与服务端得数出同一个结果。
 */
function rangeChecks(): void {
  const mkSeat = (id: string, name: string, owner: string, at: number, n: number, extra?: Partial<ZoneSpec>): GameObject => {
    const a = (Math.PI * 2 * at) / n;
    return {
      id, kind: "zone", label: name, color: "#3d5c46", owner,
      zone: { w: 0.4, d: 0.3, ...extra },
      x: Math.round(Math.cos(a) * 0.6 * 1000) / 1000,
      z: Math.round(Math.sin(a) * 0.6 * 1000) / 1000,
      rot: 0, layer: 0,
    };
  };
  const ring = (n: number, seats: GameObject[] = []) => {
    let s = starter("empty", "座位桌");
    for (const o of seats.length ? seats : Array.from({ length: n }, (_, i) => mkSeat(`seat-${i}`, `家${i + 1}`, `p${i}`, i, n))) {
      s = apply(s, { t: "add", o }, "甲");
    }
    return s;
  };

  const eight = seatsOf(ring(8));
  check("八个带主人的区域都算座位", eight.length === 8, `${eight.length} 家`);
  check("座位按绕桌一圈的角度排号", eight.every((s, i) => s.at === i && s.name === `家${i + 1}`), eight.map((s) => s.name).join());
  check("没主人的区域垫不算座位", seatsOf(ring(1, [mkSeat("seat-0", "家1", "p0", 0, 8), { ...mkSeat("free", "公用", "", 1, 8), owner: undefined }])).length === 1);
  check("默认进攻范围是 1 家", eight.every((s) => s.reach === REACH_DEFAULT), `${eight[0].reach}`);
  check("默认防御范围是 0", eight.every((s) => s.guard === GUARD_MIN));

  check("八人桌相邻两家距离 1", seatGap(eight[0].at, eight[1].at, 8) === 1 && seatGap(eight[0].at, eight[7].at, 8) === 1);
  check("八人桌对门是 4 家", seatGap(eight[0].at, eight[4].at, 8) === 4, `${seatGap(eight[0].at, eight[4].at, 8)}`);
  check("进攻 1 家只够左右邻座", inRange(eight[0], eight[1], 8) && inRange(eight[0], eight[7], 8) && !inRange(eight[0], eight[2], 8) && !inRange(eight[0], eight[4], 8));
  check("自己打不着自己", seatDistance(eight[0], eight[0], 8) === 0 && !inRange(eight[0], eight[0], 8));
  const two = seatsOf(ring(2, [mkSeat("seat-0", "甲家", "p0", 0, 2), mkSeat("seat-1", "乙家", "p1", 1, 2)]));
  check("两人桌对门也只数 1 家", seatDistance(two[0], two[1], 2) === 1, `${seatDistance(two[0], two[1], 2)}`);
  const three = seatsOf(ring(3, [mkSeat("seat-0", "甲家", "p0", 0, 3), mkSeat("seat-1", "乙家", "p1", 1, 3), mkSeat("seat-2", "丙家", "p2", 2, 3)]));
  check("三人桌谁都在彼此 1 家里", seatGap(three[0].at, three[2].at, 3) === 1 && inRange(three[0], three[2], 3));
  const lone = seatsOf(ring(1));
  check("独苗桌没有别家可打", lone.length === 1 && !inRange(lone[0], lone[0], 1));

  // 防御范围：把邻座往后推一家，进攻方不加范围就打不着了
  const guarded = seatsOf(apply(ring(8), { t: "zone", id: "seat-1", guard: 1 }, "甲"));
  check("加 1 家防御后邻座打不着", seatDistance(guarded[0], guarded[1], 8) === 2 && !inRange(guarded[0], guarded[1], 8), `${seatDistance(guarded[0], guarded[1], 8)}`);
  check("防御只推被数的那一家", inRange(guarded[0], guarded[7], 8));
  const stretched = seatsOf(apply(apply(ring(8), { t: "zone", id: "seat-1", guard: 1 }, "甲"), { t: "zone", id: "seat-0", reach: 2 }, "甲"));
  check("进攻范围加到 2 家就把带防御的邻座打回来", inRange(stretched[0], stretched[1], 8), `${stretched[0].reach}`);
  check("进攻 2 家同时够到隔一位的散座", inRange(stretched[0], stretched[2], 8) && !inRange(stretched[0], stretched[3], 8));
  check("攻防范围改完长宽不丢", stretched[1].o.zone?.w === 0.4 && stretched[1].o.zone?.d === 0.3, JSON.stringify(stretched[1].o.zone));

  // 加减按钮的口径：到顶到底就不出动作，界面那一片不留点了没动静的行
  const push = zoneRangeAction(eight[0].o, "reach", 1);
  check("进攻范围 +1 给出一条改范围的动作", !!push && push.t === "zone" && push.reach === 2 && push.id === eight[0].o.id, JSON.stringify(push));
  check("进攻范围到底 8 家再加就不动", zoneRangeAction(seatsOf(apply(ring(8), { t: "zone", id: "seat-0", reach: REACH_MAX }, "甲"))[0].o, "reach", 1) === null);
  check("进攻范围减到 1 家就减不动了", zoneRangeAction(eight[0].o, "reach", -1) === null);
  check("防御范围 +1 改的是 guard 这一项", (() => { const a = zoneRangeAction(eight[0].o, "guard", 1); return !!a && a.t === "zone" && a.guard === 1 && a.reach === undefined; })());
  check("防御范围顶到 3 家就封住", zoneRangeAction(seatsOf(apply(ring(8), { t: "zone", id: "seat-0", guard: GUARD_MAX }, "甲"))[0].o, "guard", 1) === null);
  check("防御范围归零后不能再减", zoneRangeAction(seatsOf(apply(ring(8), { t: "zone", id: "seat-0", guard: 1 }, "甲"))[0].o, "guard", -1) !== null && zoneRangeAction(eight[0].o, "guard", -1) === null);
  const notASeat = { id: "c-no", kind: "card" as const, x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain" as const } };
  check("不是区域垫就摆不出攻防范围", zoneRangeAction(notASeat, "reach", 1) === null);
  check("攻防动作要「区域」这一档", actionPerm({ t: "zone", id: "seat-0", reach: 3 }) === "zone" && changePerm(mkSeat("seat-0", "家1", "p0", 0, 8), mkSeat("seat-0", "家1", "p0", 0, 8, { reach: 3 })) === "zone");

  // 归约与同步：脏值进得来也出得去，各端数出的座位号一致
  const dirty = api.sanitize({ ...ring(8), o: [
    { id: "z-hi", kind: "zone", x: 0.6, z: 0, rot: 0, layer: 0, owner: "甲", label: "顶格", zone: { w: 0.4, d: 0.3, reach: 99, guard: -5 } },
    { id: "z-lo", kind: "zone", x: -0.6, z: 0, rot: 0, layer: 0, owner: "乙", label: "小数", zone: { w: 0.4, d: 0.3, reach: 0, guard: 2.4 } },
    { id: "c-smuggle", kind: "card", x: 0.1, z: 0.1, rot: 0, layer: 0, card: { back: "plain" }, zone: { w: 0.4, d: 0.3, reach: 5 } } as unknown as GameObject,
  ] });
  const hi = dirty.o.find((o) => o.id === "z-hi")!;
  const lo = dirty.o.find((o) => o.id === "z-lo")!;
  check("进攻范围同步时被截到上下限", hi.zone?.reach === REACH_MAX && lo.zone?.reach === REACH_DEFAULT, `${hi.zone?.reach}/${lo.zone?.reach}`);
  check("防御范围同步时取整并夹住", hi.zone?.guard === GUARD_MIN && lo.zone?.guard === 2, `${hi.zone?.guard}/${lo.zone?.guard}`);
  check("牌类物件带不进攻防范围", dirty.o.find((o) => o.id === "c-smuggle")?.zone === undefined);
  const withCenter = seatsOf(ring(5, [
    mkSeat("seat-0", "甲家", "p0", 0, 4), mkSeat("seat-1", "乙家", "p1", 1, 4),
    mkSeat("seat-2", "丙家", "p2", 2, 4), mkSeat("seat-3", "丁家", "p3", 3, 4),
    { ...mkSeat("mid", "桌心", "p9", 0, 4), x: 0, z: 0 },
  ]));
  check("桌心那块排到圈外最后，不搅乱座位号", withCenter.length === 5 && withCenter[4].o.id === "mid" && withCenter[0].o.id === "seat-0", withCenter.map((s) => s.o.id).join());
  check("桌心那块也参与距离结算", seatDistance(withCenter[0], withCenter[4], 5) === 1 && inRange(withCenter[0], withCenter[4], 5));
}

/**
 * 唱片机：一张片子配一套走带。音频字节本身不进桌面状态，状态里只有仓库的 key 和
 * 「在放到第几秒」这一份公共读数——进度由各台机器照墙钟自己推，没人一秒写一次桌。
 */
function gramChecks(): void {
  const KEY = "arec6ord1";
  const OTHER = "abassline2";
  const T0 = 1_760_000_000_000;
  const deckAt = (gram?: GramSpec): GameObject => ({
    id: "gr-1", kind: "gram", label: "唱片机", color: "#c8443c", x: 0.2, z: 0.2, rot: 0, layer: 0, gram,
  });
  const tune = (over: Partial<GramSpec> = {}): GramSpec => fixGram({ clip: KEY, name: "月光小夜曲", dur: 60, pos: 0, playing: false, at: null, vol: 0.7, loop: false, ...over });
  const notADeck: GameObject = { id: "c-x", kind: "card", color: "#2c4a7c", card: { back: "classic", label: "不是机器" }, x: 0.05, z: 0.05, rot: 0, layer: 0 };
  const gramTable = (gram?: GramSpec): TableState => apply(starter("empty", "唱片桌"), { t: "add", o: deckAt(gram) }, "甲");
  const deckOf = (s: TableState): GameObject => s.o.find((o) => o.id === "gr-1")!;
  const specOf = (s: TableState): GramSpec => deckOf(s).gram!;
  const lastLog = (s: TableState): string => s.log[s.log.length - 1]?.text ?? "";

  // ——— 收口：脏值进不来，「在放就得记着起播时刻」这条守得住 ———
  const empty = fixGram(undefined);
  check("空机：没片子、没在放、也没起播时刻", empty.clip === null && empty.playing === false && empty.at === null && empty.dur === 0 && empty.pos === 0 && empty.loop === false, JSON.stringify(empty));
  check("空机的默认音量不到满格", empty.vol === GRAM_VOL_DEFAULT, `${empty.vol}`);
  check("唱片 key 与卡面 key 各认各的门", AUDIO_KEY.test(KEY) && !AUDIO_KEY.test("iab12cd34") && !AUDIO_KEY.test("a"), KEY);
  const smuggle = fixGram({ clip: "../../../etc/passwd", playing: true, at: T0 });
  check("脏 clip 当空机，跟着把播放与起播时刻一起抹平", smuggle.clip === null && smuggle.playing === false && smuggle.at === null);
  check("卡面那种 key 塞不进唱片仓库", fixGram({ clip: "iab12cd34" }).clip === null);
  check("在放就必须有一个起播时刻", (() => { const g = fixGram({ clip: KEY, dur: 60, playing: true, at: null }); return g.playing === true && typeof g.at === "number" && Number.isFinite(g.at); })());
  check("时长夹到一小时，位置也越不过曲子本身", (() => { const g = fixGram({ clip: KEY, dur: 99999, pos: 99999 }); return g.dur === GRAM_DUR_MAX && g.pos === GRAM_DUR_MAX; })());
  check("曲名去掉两头空格，只留得下 24 个字", fixGram({ name: "  月光小夜曲  " }).name === "月光小夜曲" && fixGram({ name: "长".repeat(40) }).name.length === GRAM_NAME_MAX);
  check("音量夹在 0 到 1，而 0 是静音不是「没给」", fixGram({ vol: 3 }).vol === 1 && fixGram({ vol: -2 }).vol === 0 && fixGram({ clip: KEY, vol: 0 }).vol === 0);

  // ——— 读数：各端照墙钟自己推，谁也不为这一秒往桌上写一笔 ———
  check("停着的时候读数就是记下的位置", gramPos(tune({ pos: 12.5 }), T0) === 12.5);
  check("放起来就照着墙钟往前推", gramPos(tune({ playing: true, at: T0, pos: 10 }), T0 + 5_000) === 15);
  check("不开循环唱到头就停在那一秒", gramPos(tune({ playing: true, at: T0 }), T0 + 90_000) === 60);
  check("开了循环就绕回开头接着唱", gramPos(tune({ playing: true, at: T0, pos: 10, loop: true }), T0 + 115_000) === 5, `${gramPos(tune({ playing: true, at: T0, pos: 10, loop: true }), T0 + 115_000)}`);
  check("起播时刻在未来也推不出负数", gramPos(tune({ playing: true, at: T0 + 9_000 }), T0) === 0);
  check("「还剩几秒」与读数是同一套口径", gramLeft(tune({ playing: true, at: T0, pos: 10 }), T0 + 20_000) === 30);

  // ——— 摆机器与换片 ———
  const fresh = gramTable();
  check("摆一台唱片机就是摆一台空机", deckOf(fresh).kind === "gram" && specOf(fresh).clip === null && specOf(fresh).playing === false);
  const place = addGramAction("#c8443c");
  check("组件库那颗放的是一台空唱片机", place.t === "add" && place.o.kind === "gram" && place.o.gram?.clip === null);
  const loaded = apply(fresh, gramLoadAction(deckOf(fresh), KEY, "月光小夜曲", 214.5, T0)!, "甲");
  check("上传唱片就自动从第一秒转起来", (() => { const g = specOf(loaded); return g.clip === KEY && g.playing === true && g.pos === 0 && g.at === T0 && g.dur === 214.5; })(), JSON.stringify(specOf(loaded)));
  check("换片在记录里说一句，认得出那张片子的名字", lastLog(loaded).includes("换了张唱片") && lastLog(loaded).includes("月光小夜曲"), lastLog(loaded));
  check("同一张片子再交一次不重播", gramLoadAction(deckOf(loaded), KEY, "月光小夜曲", 214.5, T0 + 9_000) === null);
  check("换另一张片子才算换片", gramLoadAction(deckOf(loaded), OTHER, "B 面", 88) !== null);
  const ejected = apply(loaded, gramLoadAction(deckOf(loaded), null)!, "甲");
  check("抽出唱片：机器空了、停了、进度与曲名也一起清了", (() => { const g = specOf(ejected); return g.clip === null && g.playing === false && g.pos === 0 && g.at === null && g.dur === 0 && g.name === ""; })(), JSON.stringify(specOf(ejected)));
  check("空机按播放、上循环、跳段都不生效", gramPlayAction(deckOf(fresh), true) === null && gramLoopAction(deckOf(fresh), true) === null && gramSeekAction(deckOf(fresh), 5) === null && gramNudgeAction(deckOf(fresh), 10) === null);
  check("不是唱片机就摆不出唱片动作", [gramLoadAction(notADeck, KEY), gramPlayAction(notADeck, true), gramSeekAction(notADeck, 1), gramNudgeAction(notADeck, 10), gramVolAction(notADeck, 0.1), gramLoopAction(notADeck, true), gramRenameAction(notADeck, "x")].every((act) => act === null));

  // ——— 铭牌：只改那一行字 ———
  const renamed = apply(loaded, gramRenameAction(deckOf(loaded), "  小夜曲  ")!, "甲");
  check("改名字只动铭牌：片子、进度、放没放都不变", (() => { const a = specOf(loaded); const b = specOf(renamed); return b.clip === a.clip && b.playing === a.playing && b.pos === a.pos && b.at === a.at && b.name === "小夜曲"; })(), JSON.stringify(specOf(renamed)));
  check("改名字也在记录里说一句", lastLog(renamed).includes("改了唱片的名字"), lastLog(renamed));
  check("同名与空名字都不生动作", gramRenameAction(deckOf(renamed), "   ") === null && gramRenameAction(deckOf(renamed), "小夜曲") === null);
  const retitled = apply(renamed, gramRenameAction(deckOf(renamed), "长".repeat(40))!, "甲");
  check("过长的曲名刻上铭牌就截短", specOf(retitled).name.length === GRAM_NAME_MAX, `${specOf(retitled).name.length}`);

  // ——— 放与停、跳段 ———
  const paused = apply(loaded, gramPlayAction(deckOf(loaded), false, T0 + 20_000)!, "甲");
  check("按住：此刻的位置落回状态，起播时刻清空", (() => { const g = specOf(paused); return g.playing === false && g.at === null && g.pos === 20; })(), JSON.stringify(specOf(paused)));
  check("停着再按一次不生动作", gramPlayAction(deckOf(paused), false) === null);
  const resumed = apply(paused, gramPlayAction(deckOf(paused), true, T0 + 30_000)!, "甲");
  check("接着唱：从停下的那一秒起", (() => { const g = specOf(resumed); return g.playing === true && g.at === T0 + 30_000 && g.pos === 20; })(), JSON.stringify(specOf(resumed)));
  check("按住与放起来各写一条记录", lastLog(paused).includes("按住了唱片") && lastLog(resumed).includes("放起了唱片"), `${lastLog(paused)}｜${lastLog(resumed)}`);
  const finished = gramTable(tune({ pos: 60 }));
  check("唱完再按播放就从第一秒来", (() => { const g = specOf(apply(finished, gramPlayAction(deckOf(finished), true, T0)!, "甲")); return g.pos === 0 && g.playing === true; })());
  const moved = apply(paused, gramSeekAction(deckOf(paused), 30)!, "甲");
  check("停着跳段：动位置，不凭空立一个起播时刻", (() => { const g = specOf(moved); return g.pos === 30 && g.playing === false && g.at === null; })());
  check("跳到眼下这个读数不生动作", gramSeekAction(deckOf(moved), 30) === null);
  const seeked = apply(resumed, gramSeekAction(deckOf(resumed), 45, T0 + 33_000)!, "甲");
  check("在放时跳段就照着新位置接着放", (() => { const g = specOf(seeked); return g.pos === 45 && g.at === T0 + 33_000 && g.playing === true; })());
  const nudged = apply(moved, gramNudgeAction(deckOf(moved), -10)!, "甲");
  check("往回挪十秒照的是同一套读数", specOf(nudged).pos === 20, `${specOf(nudged).pos}`);
  check("往前挪过了曲子就贴住结尾", (() => { const act = gramNudgeAction(deckOf(moved), 900); return !!act && act.t === "gram" && act.pos === 214.5; })());

  // ——— 音量与循环 ———
  const louder = apply(nudged, gramVolAction(deckOf(nudged), 0.1)!, "甲");
  check("音量一格是 0.1", Math.abs(specOf(louder).vol - 0.8) < 1e-9, `${specOf(louder).vol}`);
  const quiet = apply(louder, gramVolAction(deckOf(louder), -0.8)!, "甲");
  check("音量能一路拧到静音", specOf(quiet).vol === 0, `${specOf(quiet).vol}`);
  check("拧到顶与拧到底都不再生动作", gramVolAction(deckOf(apply(quiet, { t: "gram", id: "gr-1", vol: 1 }, "甲")), 0.1) === null && gramVolAction(deckOf(quiet), -0.1) === null);
  const looped = apply(quiet, gramLoopAction(deckOf(quiet), true)!, "甲");
  check("上循环不会把静音又拧回默认音量", specOf(looped).loop === true && specOf(looped).vol === 0, JSON.stringify(specOf(looped)));
  check("循环开关只在真的变了时生动作", gramLoopAction(deckOf(looped), true) === null && gramLoopAction(deckOf(looped), false) !== null);

  // ——— 归约是纯函数：同一串走带在两台机器上重放，得到的必须是同一台机器 ———
  const walk = (by: string): TableState => {
    let s = fresh;
    for (const make of [
      (o: GameObject) => gramLoadAction(o, KEY, "月光小夜曲", 214.5, T0),
      (o: GameObject) => gramPlayAction(o, false, T0 + 20_000),
      (o: GameObject) => gramNudgeAction(o, 5, T0 + 21_000),
      (o: GameObject) => gramVolAction(o, -0.3),
      (o: GameObject) => gramLoopAction(o, true),
      (o: GameObject) => gramRenameAction(o, "B 面第一首"),
    ]) {
      const act = make(deckOf(s));
      if (act) s = apply(s, act, by);
    }
    return s;
  };
  const left = walk("甲");
  const right = walk("乙");
  check("同一串走带在两台机器上重放得到同一台机器", JSON.stringify(left.o) === JSON.stringify(right.o), JSON.stringify(specOf(left)));
  check("这一串每一步都落了桌：曲名、片子、循环、音量、位置都对得上", (() => { const g = specOf(left); return g.name === "B 面第一首" && g.clip === KEY && g.playing === false && g.loop === true && g.vol === 0.4 && g.pos === 25; })(), JSON.stringify(specOf(left)));

  // ——— 三份校验镜像与权限认同一台机器 ———
  check("改唱片走「计时器」这一档权限", actionPerm({ t: "gram", id: "gr-1", playing: true }) === "timer");
  check("动了走带状态才占这一档，机器没变就不占", changePerm(deckOf(fresh), deckOf(loaded)) === "timer" && changePerm(deckOf(loaded), deckOf(loaded)) === null);
  check("日志与列表里认得出这台机器", describe(deckOf(fresh)) === "唱片机（没放唱片）" && describe(deckOf(loaded)) === "唱片机「月光小夜曲」", `${describe(deckOf(fresh))}｜${describe(deckOf(loaded))}`);
  check("唱片机有实身体积与材质，也钉得住高度", boxOf(deckOf(fresh)).hx > 0 && materialOf(deckOf(fresh)).mass > 0 && pinnable(deckOf(fresh)));
  check("唱片机没有翻面一说", !FLIPPABLE.includes("gram"));
  const dirtySync = api.sanitize({
    ...fresh,
    o: [{ ...deckAt(), gram: { clip: KEY, name: "x".repeat(40), dur: 99999, pos: 99999, playing: true, at: null, vol: 3, loop: "yes" } as unknown as GramSpec }],
  });
  const shown = specOf(dirtySync);
  check("交给服务端之前先把唱片机收进合法区间", shown.dur === GRAM_DUR_MAX && shown.pos === GRAM_DUR_MAX && shown.vol === 1 && shown.loop === false && shown.name.length === GRAM_NAME_MAX, JSON.stringify(shown));
  check("收口之后「在放必有起播时刻」还在", shown.playing === true && typeof shown.at === "number" && Number.isFinite(shown.at));
  check("交给服务端的唱片机一定带齐那八项", ["clip", "name", "dur", "pos", "playing", "at", "vol", "loop"].every((k) => k in shown), Object.keys(shown).join());
  const smuggledGram = api.sanitize({ ...fresh, o: [{ ...notADeck, gram: tune() }] });
  check("gram 溜到别的物件身上就被删掉", (smuggledGram.o.find((o) => o.id === "c-x") as { gram?: unknown } | undefined)?.gram === undefined);
  check("脏 clip 进不了桌：那一笔按抽出唱片处理", (() => { const g = specOf(apply(loaded, { t: "gram", id: "gr-1", clip: "../../secrets" }, "甲")); return g.clip === null && g.playing === false; })());
  check("指到不是唱片机的物件上，这条动作原样退回", apply(retitled, { t: "gram", id: "c-x", vol: 1 }, "甲") === retitled);
  check("状态没变的那一笔不写桌也不记日志", (() => { const once = apply(resumed, { t: "gram", id: "gr-1", loop: true }, "甲"); const twice = apply(once, { t: "gram", id: "gr-1", loop: true }, "乙"); return once !== resumed && twice === once; })());
}

/**
 * 随身听：一台默认只属于自己的机器。
 * 这里只认桌面那一份状态——本机走带和点对点递歌那条线路活在 game/mp3.ts 的内存里，本来就不上桌。
 */
function mp3Checks(): void {
  const KEY = "arec6ord1";
  const OTHER = "abassline2";
  const T0 = 1_760_000_000_000;
  const deckAt = (mp3?: Mp3Spec): GameObject => ({
    id: "mp-1", kind: "mp3", label: "随身听", color: "#3f7d5a", x: 0.2, z: 0.2, rot: 0, layer: 0, mp3,
  });
  const tune = (over: Partial<Mp3Spec> = {}): Mp3Spec => fixMp3({ clip: KEY, name: "月光小夜曲", dur: 60, pos: 0, playing: false, at: null, vol: 0.7, loop: false, by: "甲", shared: false, ...over });
  const notADeck: GameObject = { id: "c-x", kind: "card", color: "#2c4a7c", card: { back: "classic", label: "不是机器" }, x: 0.05, z: 0.05, rot: 0, layer: 0 };
  const mp3Table = (mp3?: Mp3Spec): TableState => apply(starter("empty", "随身桌"), { t: "add", o: deckAt(mp3) }, "甲");
  const deckOf = (s: TableState): GameObject => s.o.find((o) => o.id === "mp-1")!;
  const specOf = (s: TableState): Mp3Spec => deckOf(s).mp3!;
  const lastLog = (s: TableState): string => s.log[s.log.length - 1]?.text ?? "";
  // 共享出去才算桌上那套走带，所以「在放的机器」一律带共享
  const playing = (over: Partial<Mp3Spec> = {}): Mp3Spec => tune({ shared: true, playing: true, at: T0, ...over });

  // ——— 收口：没共享出去时桌上就是个空转的壳 ———
  const empty = fixMp3(undefined);
  check("空机：没歌、没在放、没共享，也没有起播时刻", empty.clip === null && empty.playing === false && empty.shared === false && empty.at === null && empty.dur === 0 && empty.pos === 0 && empty.loop === false, JSON.stringify(empty));
  check("空机默认音量比唱片机收着些（这是一台贴耳朵的机器）", empty.vol === MP3_VOL_DEFAULT && MP3_VOL_DEFAULT < GRAM_VOL_DEFAULT, `${empty.vol}`);
  check("随身听认的是唱片那一套 key 门，跟卡面各认各的", AUDIO_KEY.test(KEY) && fixMp3({ clip: "iab12cd34" }).clip === null && fixMp3({ clip: "../../../etc/passwd" }).clip === null);
  check("没共享出去时播放与循环一律归零，私人走带根本不上桌", (() => { const m = fixMp3({ clip: KEY, dur: 60, shared: false, playing: true, loop: true, at: T0 }); return m.playing === false && m.loop === false && m.at === null; })(), JSON.stringify(fixMp3({ clip: KEY, dur: 60, playing: true, loop: true, at: T0 })));
  check("共享必须有歌：空机共享不出去", fixMp3({ clip: null, shared: true }).shared === false);
  check("在放就必须有一个起播时刻", (() => { const m = fixMp3(playing({ at: null })); return m.playing === true && typeof m.at === "number" && Number.isFinite(m.at); })());
  check("时长夹到一小时，位置也越不过曲子本身", (() => { const m = fixMp3(tune({ dur: 99999, pos: 99999 })); return m.dur === MP3_DUR_MAX && m.pos === MP3_DUR_MAX; })());
  check("曲名去掉两头空格，只留得下 24 个字", tune({ name: "  月光小夜曲  " }).name === "月光小夜曲" && fixMp3({ name: "长".repeat(40) }).name.length === MP3_NAME_MAX);
  check("音量夹在 0 到 1，而 0 是静音不是「没给」", fixMp3({ vol: 3 }).vol === 1 && fixMp3({ vol: -2 }).vol === 0 && tune({ vol: 0 }).vol === 0);
  check("主人 id 也收口：去空格、只留得下 24 个字符", fixMp3({ by: "  甲  " }).by === "甲" && fixMp3({ by: "x".repeat(40) }).by.length === 24);

  // ——— 读数：与唱片机同一套算法，各端照墙钟自己推 ———
  check("停着的时候读数就是记下的位置", mp3Pos(tune({ pos: 12.5 }), T0) === 12.5);
  check("共享着放就照着墙钟往前推", mp3Pos(playing({ pos: 10 }), T0 + 5_000) === 15);
  check("不开循环放到头就停在那一秒", mp3Pos(playing(), T0 + 90_000) === 60);
  check("开了循环就绕回开头接着放", mp3Pos(playing({ pos: 10, loop: true }), T0 + 115_000) === 5, `${mp3Pos(playing({ pos: 10, loop: true }), T0 + 115_000)}`);
  check("起播时刻在未来也推不出负数", mp3Pos(playing({ at: T0 + 9_000 }), T0) === 0);
  check("「还剩几秒」与读数是同一套口径", mp3Left(playing({ pos: 10 }), T0 + 20_000) === 30);
  check("私人那一档在桌上永远读不出走动（它根本不在桌上）", mp3Pos(tune({ pos: 12.5 }), T0 + 600_000) === 12.5);

  // ——— 归属：谁摆的机器归谁，之后谁也挪不走 ———
  const place = addMp3Action("#3f7d5a", "甲");
  check("组件库那颗放的是一台空机，并且记上摆它的人", place.t === "add" && place.o.kind === "mp3" && place.o.mp3?.clip === null && place.o.mp3?.by === "甲");
  const fresh = mp3Table(fixMp3({ by: "甲" }));
  check("摆上桌就是一台空机", deckOf(fresh).kind === "mp3" && specOf(fresh).clip === null && specOf(fresh).by === "甲");
  check("歌在谁电脑上就谁说了算，别人连上手都不算越界（空 by 才人人可动）", mp3Mine(specOf(fresh), "甲") && !mp3Mine(specOf(fresh), "乙") && mp3Mine(fixMp3({ by: "" }), "乙"));
  const claim = apply(fresh, { t: "mp3", id: "mp-1", by: "乙", name: "顺手刻个字" }, "乙");
  check("归属只在摆下那一刻定一次：之后谁也不能把名字挪到别人那台上", specOf(claim).by === "甲", specOf(claim).by);
  const firstTouch = apply(mp3Table(), { t: "mp3", id: "mp-1", by: "乙", name: "老机器" }, "乙");
  check("没记主人的老机器，第一个动手的人把名字补上", specOf(firstTouch).by === "乙" && specOf(firstTouch).name === "老机器");

  // ——— 刻歌：只写 key、曲名与时长，一个音频字节都不进服务器 ———
  const loaded = apply(fresh, mp3LoadAction(deckOf(fresh), KEY, "月光小夜曲", 214.5)!, "甲");
  check("刻一首歌只落三项：key、曲名、时长", (() => { const m = specOf(loaded); return m.clip === KEY && m.name === "月光小夜曲" && m.dur === 214.5; })(), JSON.stringify(specOf(loaded)));
  check("刻完还是私人的：没共享、没在放，全桌听不着", (() => { const m = specOf(loaded); return m.shared === false && m.playing === false && m.at === null && m.pos === 0 && m.loop === false; })());
  check("刻歌在记录里说一句，认得出那首歌的名字", lastLog(loaded).includes("刻上了一首歌") && lastLog(loaded).includes("月光小夜曲"), lastLog(loaded));
  check("同一首歌再交一次不生动作", mp3LoadAction(deckOf(loaded), KEY, "月光小夜曲", 214.5) === null);
  check("换一首歌才算新的动作", mp3LoadAction(deckOf(loaded), OTHER, "B 面", 88) !== null);
  check("不合规矩的 key 刻不上去", mp3LoadAction(deckOf(loaded), "iab12cd34", "偷渡", 30) === null);
  const reshot = apply(loaded, mp3LoadAction(deckOf(loaded), OTHER, "B 面", 88)!, "甲");
  check("换曲子一律从头起，并且先收回私人", (() => { const m = specOf(reshot); return m.clip === OTHER && m.dur === 88 && m.shared === false && m.playing === false && m.pos === 0; })(), JSON.stringify(specOf(reshot)));
  const ejected = apply(reshot, mp3LoadAction(deckOf(reshot), null)!, "甲");
  check("抽出这首歌：歌、曲名、时长一起清空，别人桌上立刻是空机", (() => { const m = specOf(ejected); return m.clip === null && m.name === "" && m.dur === 0 && m.pos === 0 && m.shared === false; })(), JSON.stringify(specOf(ejected)));
  check("空机再抽一次不生动作", mp3LoadAction(deckOf(ejected), null) === null);
  check("不是随身听就摆不出随身听动作", [mp3LoadAction(notADeck, KEY), mp3ShareAction(notADeck, true), mp3RenameAction(notADeck, "x"), mp3PlayAction(notADeck, true), mp3SeekAction(notADeck, 1), mp3VolAction(notADeck, 0.1), mp3LoopAction(notADeck, true)].every((act) => act === null));

  // ——— 共享与收回：交出去才轮到全桌 ———
  check("没歌的机器共享不出去", mp3ShareAction(deckOf(fresh), true) === null);
  const shared = apply(loaded, mp3ShareAction(deckOf(loaded), true, 30, T0)!, "甲");
  check("共享那一刻按主人此刻的位置起转", (() => { const m = specOf(shared); return m.shared === true && m.playing === true && m.at === T0 && m.pos === 30 && m.dur === 214.5; })(), JSON.stringify(specOf(shared)));
  check("共享在记录里说一句", lastLog(shared).includes("共享给全桌一起听"), lastLog(shared));
  check("已经共享了再按一次不生动作", mp3ShareAction(deckOf(shared), true) === null);
  check("共享时位置越不过曲子本身", (() => { const act = mp3ShareAction(deckOf(loaded), true, 9999, T0); return !!act && act.t === "mp3" && act.pos === 214.5; })());
  const back = apply(shared, mp3ShareAction(deckOf(shared), false)!, "甲");
  check("收回自己听：当场停住，进度与起播时刻落回零", (() => { const m = specOf(back); return m.shared === false && m.playing === false && m.at === null && m.pos === 0; })(), JSON.stringify(specOf(back)));
  check("收回只停走带，歌与曲名还刻在那台机器上", (() => { const m = specOf(back); return m.clip === KEY && m.name === "月光小夜曲" && m.dur === 214.5; })());
  check("收回在记录里说一句", lastLog(back).includes("收回了自己听"), lastLog(back));

  // ——— 私人档一律不动桌面：那几个控件改的是本机那一档 ———
  check("没共享时放停、跳段、循环、音量全都不生效", mp3PlayAction(deckOf(loaded), true) === null && mp3SeekAction(deckOf(loaded), 5) === null && mp3LoopAction(deckOf(loaded), true) === null && mp3VolAction(deckOf(loaded), 0.1) === null);
  check("空机同上，按什么都不会往桌上写一笔", mp3PlayAction(deckOf(fresh), true) === null && mp3SeekAction(deckOf(fresh), 5) === null && mp3LoopAction(deckOf(fresh), true) === null && mp3VolAction(deckOf(fresh), 0.1) === null && mp3RenameAction(deckOf(fresh), "   ") === null);

  // ——— 共享出去之后的走带 ———
  const paused = apply(shared, mp3PlayAction(deckOf(shared), false, T0 + 50_000)!, "甲");
  check("按住：此刻的位置落回状态，起播时刻清空", (() => { const m = specOf(paused); return m.playing === false && m.at === null && m.pos === 80; })(), JSON.stringify(specOf(paused)));
  check("停着再按一次不生动作", mp3PlayAction(deckOf(paused), false) === null);
  const resumed = apply(paused, mp3PlayAction(deckOf(paused), true, T0 + 90_000)!, "甲");
  check("接着放：从停下的那一秒起", (() => { const m = specOf(resumed); return m.playing === true && m.at === T0 + 90_000 && m.pos === 80; })());
  check("按住与放起来各写一条记录", lastLog(paused).includes("全桌按住了") && lastLog(resumed).includes("全桌一起放起了"), `${lastLog(paused)}｜${lastLog(resumed)}`);
  const atEnd = mp3Table(tune({ shared: true, pos: 60 }));
  check("放到头再按就从第一秒来", (() => { const m = specOf(apply(atEnd, mp3PlayAction(deckOf(atEnd), true, T0)!, "甲")); return m.pos === 0 && m.playing === true; })());
  const moved = apply(paused, mp3SeekAction(deckOf(paused), 30)!, "甲");
  check("停着跳段：动位置，不凭空立一个起播时刻", (() => { const m = specOf(moved); return m.pos === 30 && m.playing === false && m.at === null; })());
  check("跳到眼下这个读数不生动作", mp3SeekAction(deckOf(moved), 30) === null);
  const seeked = apply(resumed, mp3SeekAction(deckOf(resumed), 45, T0 + 93_000)!, "甲");
  check("在放时跳段就照着新位置接着放", (() => { const m = specOf(seeked); return m.pos === 45 && m.at === T0 + 93_000 && m.playing === true; })());
  const louder = apply(seeked, mp3VolAction(deckOf(seeked), 0.1)!, "甲");
  check("音量一格是 0.1（共享出去才轮到全桌一起拧）", Math.abs(specOf(louder).vol - specOf(seeked).vol - 0.1) < 1e-9, `${specOf(seeked).vol}→${specOf(louder).vol}`);
  const quiet = apply(louder, mp3VolAction(deckOf(louder), -0.8)!, "甲");
  check("音量能一路拧到静音，拧到顶与拧到底都不再生动作", specOf(quiet).vol === 0 && mp3VolAction(deckOf(apply(quiet, { t: "mp3", id: "mp-1", vol: 1 }, "甲")), 0.1) === null && mp3VolAction(deckOf(quiet), -0.1) === null);
  const looped = apply(quiet, mp3LoopAction(deckOf(quiet), true)!, "甲");
  check("上循环不会把静音又拧回默认音量", specOf(looped).loop === true && specOf(looped).vol === 0, JSON.stringify(specOf(looped)));
  check("循环开关只在真的变了时生动作", mp3LoopAction(deckOf(looped), true) === null && mp3LoopAction(deckOf(looped), false) !== null);
  const renamed = apply(looped, mp3RenameAction(deckOf(looped), "  B 面第一首  ")!, "甲");
  check("改名字只动那一行字：歌、走带、音量都没碰", (() => { const a = specOf(looped); const b = specOf(renamed); return b.name === "B 面第一首" && b.clip === a.clip && b.pos === a.pos && b.playing === a.playing && b.vol === a.vol && b.loop === a.loop; })(), JSON.stringify(specOf(renamed)));
  check("改名字也在记录里说一句", lastLog(renamed).includes("改了随身听上那首歌的名字"), lastLog(renamed));
  check("同名与空名字都不生动作", mp3RenameAction(deckOf(renamed), "   ") === null && mp3RenameAction(deckOf(renamed), "B 面第一首") === null);
  check("过长的曲名刻上屏面就截短", specOf(apply(renamed, mp3RenameAction(deckOf(renamed), "长".repeat(40))!, "甲")).name.length === MP3_NAME_MAX);

  // ——— 归约是纯函数：同一串走带在两台机器上重放，得到的必须是同一台机器 ———
  const walk = (by: string): TableState => {
    let s = fresh;
    for (const make of [
      (o: GameObject) => mp3LoadAction(o, KEY, "月光小夜曲", 214.5),
      (o: GameObject) => mp3ShareAction(o, true, 30, T0),
      (o: GameObject) => mp3PlayAction(o, false, T0 + 50_000),
      (o: GameObject) => mp3SeekAction(o, 100, T0 + 51_000),
      (o: GameObject) => mp3VolAction(o, -0.3),
      (o: GameObject) => mp3LoopAction(o, true),
      (o: GameObject) => mp3RenameAction(o, "B 面第一首"),
    ]) {
      const act = make(deckOf(s));
      if (act) s = apply(s, act, by);
    }
    return s;
  };
  const left = walk("甲");
  const right = walk("乙");
  check("同一串走带在两台机器上重放得到同一台机器", JSON.stringify(left.o) === JSON.stringify(right.o), JSON.stringify(specOf(left)));
  check("这一串每一步都落了桌：曲名、歌、共享、循环、音量、位置都对得上", (() => { const m = specOf(left); return m.name === "B 面第一首" && m.clip === KEY && m.shared === true && m.playing === false && m.loop === true && m.vol === 0.3 && m.pos === 100; })(), JSON.stringify(specOf(left)));

  // ——— 三份校验镜像与权限认同一台机器 ———
  check("改随身听走「计时器」这一档权限", actionPerm({ t: "mp3", id: "mp-1", playing: true }) === "timer");
  check("动了走带状态才占这一档，机器没变就不占", changePerm(deckOf(fresh), deckOf(loaded)) === "timer" && changePerm(deckOf(loaded), deckOf(loaded)) === null);
  check("游戏模式挡掉刻歌、改名与共享收回", gameShut({ t: "mp3", id: "mp-1", clip: KEY }) && gameShut({ t: "mp3", id: "mp-1", name: "x" }) && gameShut({ t: "mp3", id: "mp-1", shared: false }));
  check("共享出去之后的放停跳段音量循环照常按，游戏模式不挡", [
    { t: "mp3", id: "mp-1", playing: false }, { t: "mp3", id: "mp-1", pos: 12 }, { t: "mp3", id: "mp-1", vol: 0.5 }, { t: "mp3", id: "mp-1", loop: true },
  ].every((act) => !gameShut(act as Action)));
  check("日志与列表里认得出这台机器，还说清是不是只在本机", describe(deckOf(fresh)) === "随身听（还没刻歌）" && describe(deckOf(loaded)) === "随身听「月光小夜曲」（只在本机）" && describe(deckOf(shared)) === "随身听「月光小夜曲」", `${describe(deckOf(fresh))}｜${describe(deckOf(loaded))}｜${describe(deckOf(shared))}`);
  check("随身听有实身体积与材质，也钉得住高度", boxOf(deckOf(fresh)).hx > 0 && materialOf(deckOf(fresh)).mass > 0 && pinnable(deckOf(fresh)));
  check("随身听没有翻面一说", !FLIPPABLE.includes("mp3"));
  const dirtySync = api.sanitize({
    ...fresh,
    o: [{ ...deckAt(), mp3: { clip: KEY, name: "x".repeat(40), dur: 99999, pos: 99999, playing: true, at: null, vol: 3, loop: "yes", by: "y".repeat(40), shared: true } as unknown as Mp3Spec }],
  });
  const shown = specOf(dirtySync);
  check("交给服务端之前先把随身听收进合法区间", shown.dur === MP3_DUR_MAX && shown.pos === MP3_DUR_MAX && shown.vol === 1 && shown.loop === false && shown.name.length === MP3_NAME_MAX && shown.by.length === 24, JSON.stringify(shown));
  check("收口之后「在放必有起播时刻」还在", shown.playing === true && typeof shown.at === "number" && Number.isFinite(shown.at));
  check("交给服务端的随身听一定带齐那十项", ["clip", "name", "dur", "pos", "playing", "at", "vol", "loop", "by", "shared"].every((k) => k in shown), Object.keys(shown).join());
  const privateSync = api.sanitize({ ...fresh, o: [{ ...deckAt(), mp3: { clip: KEY, dur: 60, shared: false, playing: true, loop: true, at: T0 } as unknown as Mp3Spec }] });
  check("没共享出去的走带在交给服务端前就被抹平", (() => { const m = specOf(privateSync); return m.playing === false && m.loop === false && m.at === null; })(), JSON.stringify(specOf(privateSync)));
  const smuggled = api.sanitize({ ...fresh, o: [{ ...notADeck, mp3: tune() }] });
  check("mp3 溜到别的物件身上就被删掉", (smuggled.o.find((o) => o.id === "c-x") as { mp3?: unknown } | undefined)?.mp3 === undefined);
  check("脏 clip 进不了桌：那一笔按抽出这首歌处理", (() => { const m = specOf(apply(loaded, { t: "mp3", id: "mp-1", clip: "../../secrets" }, "甲")); return m.clip === null && m.playing === false && m.shared === false; })());
  check("指到不是随身听的物件上，这条动作原样退回", apply(renamed, { t: "mp3", id: "c-x", vol: 1 }, "甲") === renamed);
  check("状态没变的那一笔不写桌也不记日志", (() => { const once = apply(resumed, { t: "mp3", id: "mp-1", loop: true }, "甲"); const twice = apply(once, { t: "mp3", id: "mp-1", loop: true }, "乙"); return once !== resumed && twice === once; })());
}

/**
 * 洗牌动画与空牌堆。
 * 动画本身在渲染层（three/），这里只认两件事：什么才算「洗过一把」，以及空牌堆在桌面上站不站得住。
 */
function riffleChecks(): void {
  const lastLog = (s: TableState): string => s.log[s.log.length - 1]?.text ?? "";
  const cards = poker54().slice(0, 12);
  const asReversed = cards.slice().reverse();
  const topTwo = cards.slice();
  [topTwo[topTwo.length - 1], topTwo[topTwo.length - 2]] = [topTwo[topTwo.length - 2], topTwo[topTwo.length - 1]];
  const renamed = cards.slice();
  renamed[3] = { ...renamed[3], label: "改了名字" };
  const resuited = cards.slice();
  resuited[5] = { ...resuited[5], suit: "h" };

  // ——— 洗过没有：同一批牌、只是顺序换了 ———
  check("原样不动不算洗", !sameCardsReordered(cards, cards.slice()));
  check("整叠倒过来算洗过", sameCardsReordered(cards, asReversed));
  check("只换掉最上面两张也算洗过", sameCardsReordered(cards, topTwo));
  check("张数不一样不算洗", !sameCardsReordered(cards, cards.slice(0, 11)));
  check("改一张牌的名字不算洗", !sameCardsReordered(cards, renamed));
  check("换一张牌的花色不算洗", !sameCardsReordered(cards, resuited));
  check("空堆与缺字段都不算洗", !sameCardsReordered([], []) && !sameCardsReordered(undefined, cards) && !sameCardsReordered(cards, undefined) && !sameCardsReordered(cards, []));
  const twin: CardSpec = { back: "classic", rank: "A", suit: "s" };
  check("两张一模一样的牌对调，看着没变就不算洗", !sameCardsReordered([twin, twin], [twin, twin]));

  const deckTable = apply(starter("empty", "洗牌桌"), addPileAction(cards, "#c8443c"), "甲");
  const pileOf = (s: TableState): CardSpec[] => s.o.find((o) => o.kind === "pile")?.pile ?? [];
  const pileId = deckTable.o.find((o) => o.kind === "pile")!.id;
  const riffled = apply(deckTable, { t: "shuffle", id: pileId, cards: asReversed.map(fixCard) as CardSpec[] }, "甲");
  check("洗一把这一笔真的换了顺序", (() => { const after = pileOf(riffled); return after.length === 12 && sameCardsReordered(pileOf(deckTable), after); })(), pileOf(riffled).map((c) => c.rank).join());
  check("洗牌在记录里留一句话", lastLog(riffled).includes("洗了牌堆"), lastLog(riffled));
  const spun = apply(deckTable, shuffleAction(deckTable.o, pileId)!, "甲");
  const spunPile = pileOf(spun);
  // 随机洗出来的也可能是原序（12! 分之一），那条路本来就不该播动画，所以两头一起认
  check("洗牌按钮那把随机：换了序才认，没换序也不硬播", sameCardsReordered(cards, spunPile) === spunPile.some((c, i) => c.rank !== cards[i].rank || c.suit !== cards[i].suit));

  // ——— 空牌堆：摆得上桌，也站得住 ———
  const bareTable = apply(starter("empty", "弃牌区"), addPileAction([], "#c8443c"), "甲");
  const bare = bareTable.o.find((o) => o.kind === "pile");
  check("空牌堆摆得上桌", !!bare && Array.isArray(bare.pile) && bare.pile.length === 0, JSON.stringify(bare?.pile));
  check("空牌堆过服务端校验也不会被抹掉牌堆字段", (() => { const p = api.sanitize(bareTable).o.find((o) => o.kind === "pile"); return !!p && Array.isArray(p.pile) && p.pile.length === 0; })());
  check("空牌堆洗牌不发动作", shuffleAction(bareTable.o, bare!.id) === null);
  check("空牌堆摸牌不发动作", drawAction(bareTable, bare!.id, 5, "甲") === null && stashDrawAction(bareTable, bare!.id, 5, "甲") === null);
  const loose = apply(bareTable, addCardAction({ back: "classic", rank: "A", suit: "s" }, "#2c4a7c"), "甲");
  const gathered = apply(loose, gatherAction(loose.o, bare!.id)!, "甲");
  check("空牌堆收得进全场散牌", pileOf(gathered).length === 1 && gathered.o.some((o) => o.id === bare!.id));
  const donorTable = apply(bareTable, addPileAction([cards[0], cards[1]], "#2c4a7c"), "甲");
  const donorId = donorTable.o.find((o) => o.kind === "pile" && o.id !== bare!.id)!.id;
  const poured = apply(donorTable, pourAction(donorTable.o, donorId, bare!.id)!, "甲");
  check("空牌堆也接得住整堆倒进来的牌", pileOf(poured).length === 2 && poured.o.some((o) => o.id === bare!.id), pileOf(poured).map((c) => c.rank).join());
  const flippedBare = apply(bareTable, { t: "turnCards", ids: [bare!.id], up: true }, "甲");
  check("空牌堆也翻得了面：那块托盘照样有朝向", flippedBare.o.find((o) => o.id === bare!.id)?.faceUp === true && flippedBare !== bareTable);

  const oneCard = apply(starter("empty", "抽干桌"), addPileAction([cards[0]], "#c8443c"), "甲");
  const oneId = oneCard.o.find((o) => o.kind === "pile")!.id;
  const drained = apply(oneCard, drawAction(oneCard, oneId, 1, "甲")!, "甲");
  check("摸走最后一张，空牌堆当场消失（沿用抽干即删的口径）", !drained.o.some((o) => o.id === oneId));
}

/**
 * 切牌与均分牌堆。
 * 切牌只是换个断点、一张牌不增减；均分要往桌上多摆几叠，所以顺带查权限算得对不对。
 */
function cutSplitChecks(): void {
  const lastLog = (s: TableState): string => s.log[s.log.length - 1]?.text ?? "";
  const tag = (c: CardSpec): string => `${c.suit}${c.rank}`;
  const cards = poker54().slice(0, 12);
  const table = apply(starter("empty", "切牌桌"), addPileAction(cards, "#c8443c"), "甲");
  const src = table.o.find((o) => o.kind === "pile")!;
  const deck = (s: TableState, id: string): CardSpec[] => s.o.find((o) => o.id === id)?.pile ?? [];
  const pilesIn = (s: TableState): GameObject[] => s.o.filter((o) => o.kind === "pile");
  /** 算出动作再立刻落到桌面上，用例两头都要看：分成几份、桌上变成什么样 */
  const splitBy = (s: TableState, id: string, n: number): { next: TableState; parts: CardSpec[][] } | null => {
    const a = evenSplitAction(s.o, id, n);
    if (!a || a.t !== "even") return null;
    return { next: apply(s, a, "甲"), parts: a.piles.map((p) => p.pile ?? []) };
  };

  // ——— 切牌：顶上 at 张整叠扣到底下 ———
  const cutDef = cutAction(table.o, src.id);
  check("12 张默认从中间断开", cutDef?.t === "cut" && cutDef.at === 6, JSON.stringify(cutDef));
  const cutHalf = apply(table, cutDef!, "甲");
  const cutTags = deck(cutHalf, src.id).map(tag).join();
  check("切完牌一张不少，顺序就是断点换了", cutTags === [...cards.slice(6), ...cards.slice(0, 6)].map(tag).join(), cutTags);
  check("切牌前后是同一批牌，洗牌动画顺手就认得出来", sameCardsReordered(deck(table, src.id), deck(cutHalf, src.id)));
  check("切牌在记录里留一句话", lastLog(cutHalf).includes("切了牌"), lastLog(cutHalf));
  for (const [label, at, want] of [["写 0", 0, 1], ["写负数", -3, 1], ["大过头", 99, 11], ["正好等于张数", 12, 11], ["小数四舍五入", 5.6, 6]] as const) {
    const a = cutAction(table.o, src.id, at);
    check(`切牌位次夹进 [1, 张数-1]：${label}`, !!a && a.t === "cut" && a.at === want, JSON.stringify(a));
  }
  const single = apply(starter("empty", "单张桌"), addPileAction([cards[0]], "#c8443c"), "甲");
  check("只剩一张没得切", cutAction(single.o, single.o.find((o) => o.kind === "pile")!.id) === null);
  const bare = apply(starter("empty", "空桌"), addPileAction([], "#c8443c"), "甲");
  const bareId = bare.o.find((o) => o.kind === "pile")!.id;
  check("空牌堆没得切", cutAction(bare.o, bareId) === null);
  const box = apply(starter("empty", "盒桌"), addBoxAction(cards, "#c8443c"), "甲");
  check("卡牌盒看不见上下，不给切", cutAction(box.o, box.o.find((o) => o.kind === "box")!.id) === null);
  const bag = apply(starter("empty", "袋桌"), addBagAction(cards, "#c8443c"), "甲");
  check("布袋摸着也不讲顺序，不给切", cutAction(bag.o, bag.o.find((o) => o.kind === "bag")!.id) === null);
  const cutPerms = touchedPerms(table.o, cutHalf.o);
  check("切牌算「摸牌发牌」，也不算新增物件", actionPerm({ t: "cut", id: src.id, at: 6 }) === "cards" && cutPerms.has("cards") && !cutPerms.has("add"), [...cutPerms].join());

  // ——— 均分：一叠摊成几叠，各叠最多差一张 ———
  const q4 = splitBy(table, src.id, 4)!;
  check("12 张分 4 叠，每叠 3 张", q4.parts.map((g) => g.length).join() === "3,3,3,3", q4.parts.map((g) => g.length).join());
  const r5 = splitBy(table, src.id, 5)!;
  check("多出来的一张补给头几份：12 分 5 叠是 3,3,2,2,2", r5.parts.map((g) => g.length).join() === "3,3,2,2,2", r5.parts.map((g) => g.length).join());
  check("各份最多差一张", [q4, r5].every(({ parts }) => Math.max(...parts.map((g) => g.length)) - Math.min(...parts.map((g) => g.length)) <= 1));
  check("12 张分 4 叠就是桌上 4 叠：源堆占一叠，另 3 叠新摆上桌", pilesIn(q4.next).length === 4 && q4.next.o.some((o) => o.id === src.id && o.x === src.x && o.z === src.z), `${pilesIn(q4.next).length}`);
  check("几叠拼起来正好是原来那 12 张，不重不漏", pilesIn(q4.next).flatMap((o) => o.pile ?? []).map(tag).sort().join() === cards.map(tag).sort().join());
  check("从顶牌开始一份份数：第一叠的顶牌还是原来那张", tag(q4.parts[0][q4.parts[0].length - 1]) === tag(cards[cards.length - 1]));
  check("均分在记录里留一句话", lastLog(q4.next).includes("均分成"), lastLog(q4.next));
  const flipped = apply(table, { t: "turnCards", ids: [src.id], up: true }, "甲");
  const up3 = splitBy(flipped, src.id, 3)!;
  check("分出去的每一叠都跟着源堆面朝上", pilesIn(up3.next).every((o) => o.faceUp === true));
  const branded: TableState = { ...table, o: table.o.map((o) => (o.id === src.id ? { ...o, backImg: "deckback01" } : o)) };
  check("新摊的几叠沿用源堆卡背，看着还是同一副牌", pilesIn(splitBy(branded, src.id, 4)!.next).every((o) => o.backImg === "deckback01"));
  const spots = pilesIn(q4.next).map((o) => ({ x: o.x, z: o.z }));
  check("新摊的几叠都摆在桌子里", spots.every((p) => Math.abs(p.x) <= TABLE.w / 2 && Math.abs(p.z) <= TABLE.d / 2), JSON.stringify(spots));
  check("几叠之间留了间距，落下去不会互相挤开", spots.every((a, i) => spots.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) >= 0.09)));
  check("分完的桌面过得了服务端校验", api.sanitize(q4.next).o.filter((o) => o.kind === "pile").length === 4);
  check("分出去的每一叠照样能继续切", pilesIn(q4.next).every((o) => cutAction(q4.next.o, o.id) !== null));
  const three = apply(starter("empty", "三张桌"), addPileAction(cards.slice(0, 3), "#c8443c"), "甲");
  check("牌不够分就不发动作：3 张想分 4 叠", evenSplitAction(three.o, three.o.find((o) => o.kind === "pile")!.id, 4) === null);
  check("空牌堆分不出东西", evenSplitAction(bare.o, bareId, 2) === null);
  check("份数夹在 [2, 8]", (() => {
    const few = evenSplitAction(table.o, src.id, 1);
    const many = evenSplitAction(table.o, src.id, 100);
    return !!few && few.t === "even" && few.piles.length === 2 && !!many && many.t === "even" && many.piles.length === EVEN_MAX_PILES;
  })());
  const packed: TableState = { ...table, o: [...table.o, ...Array.from({ length: MAX_OBJECTS - table.o.length }, (_, i) => ({ ...src, id: `filler${i}` }))] };
  const packedAct = evenSplitAction(packed.o, src.id, 4);
  check("快摆满的桌子不再多摆新叠，整笔不动", !!packedAct && apply(packed, packedAct, "甲") === packed);
  const evenPerms = touchedPerms(table.o, q4.next.o);
  check("均分算「摸牌发牌」，多摆的叠同时算「新增物件」", actionPerm({ t: "even", id: src.id, piles: [] }) === "cards" && evenPerms.has("cards") && evenPerms.has("add"), [...evenPerms].join());
}

// ——— 游戏模式：这一档收起的是「摆桌子」那一套，正常游玩一笔都不该动 ———
function gameModeChecks(): void {
  const objectOf = (a: Action): GameObject => (a as { o: GameObject }).o;
  const pad = objectOf(addPadAction("#c8443c", 0.6, 0.4, "甲"));
  const book = objectOf(addBookAction("#c8443c"));
  const shield = objectOf(addShieldAction("#c8443c", "甲"));
  const gram: GameObject = { ...objectOf(addGramAction("#c8443c")), gram: fixGram({ clip: "arec6ord1", name: "月光小夜曲", dur: 60 }) };
  const track = { id: "gm-track", kind: "track", x: 0, z: 0, rot: 0, layer: 0 } as GameObject;
  const cardTable = starter("cards", "游戏模式桌");
  const pile = cardTable.o.find((o) => o.kind === "pile")!;
  const shut = (x: Action) => gameShut(x);

  const tableEdits: Action[] = [
    { t: "remove", ids: [pile.id] }, { t: "clear" }, { t: "rename", name: "新桌名" },
    { t: "boardSet", board: null }, { t: "reset", id: "b-1" }, { t: "presetLoad", o: [], name: "预设" },
  ];
  check("整桌那一排全收起：拿走、清空、改名、换棋盘、重摆开局、载入预设", tableEdits.every(shut));
  const contentEdits: Action[] = [
    { t: "label", id: pad.id, label: "改个名" }, { t: "color", id: pad.id, color: "#111111" },
    { t: "effect", id: pile.id }, { t: "pileSet", id: pile.id, cards: [] },
    { t: "cardSet", id: pile.id, card: { back: "classic" } as CardSpec }, { t: "backSet", ids: [pile.id], img: null },
  ];
  check("改内容那一排全收起：名字、颜色、效果、牌堆内容、单卡牌面、卡背", contentEdits.every(shut));
  const specs: Action[] = [
    { t: "spinSet", id: "sp-1", n: 8 }, { t: "trackSet", id: track.id, n: 20 }, { t: "slot", id: "sl-1", n: 5 },
  ];
  check("装置规格也收起：转盘分数、计分轨刻度、卡槽格数——改了会把当前结果抹掉", specs.every(shut));
  const labelPerm = actionPerm({ t: "label", id: pad.id, label: "改个名" });
  check("这道闸跟房主权限是两回事：有权限的动作照样能被判成游戏中", !!labelPerm && shut({ t: "label", id: pad.id, label: "改个名" }));

  // 正常游玩：摸、打、掷、计、时，一样都不该被碰
  const drew = drawAction(cardTable, pile.id, 3, "甲");
  check("摸牌打牌掷骰洗牌照旧", !!drew && !shut(drew) && !shut(shuffleAction(cardTable.o, pile.id)!) && !shut(rollAllAction(starter("rpg", "骰桌").o)!.action));
  check("计分与转盘照旧：走子、清零、拨一下", !shut(markAction(track, "甲", 1, "甲", "#c8443c")!) && !shut({ t: "markClear", id: track.id }) && !shut(spinAction({ ...track, kind: "spinner" } as GameObject)!));
  check("计时与沙漏照旧：跑停、归零、翻面、换档位", !shut(hourFlipAction({ ...track, kind: "hour" } as GameObject)!) && !shut({ t: "hour", id: "h-1", mins: 5, at: null })
    && !shut({ t: "timer", id: "tm-1", duration: 60, left: 30, endsAt: null }) && !shut({ t: "timer", id: "tm-1", duration: 60, left: 60, endsAt: T0 }));
  const afterDraw = apply(cardTable, drew!, "甲");
  check("翻面、挪动、上锁、切牌与摊齐本区这些摆位动作不收", !shut({ t: "flip", ids: [pile.id] }) && !shut({ t: "move", m: [] })
    && !shut(padLockAction({ ...track, kind: "stat" } as GameObject, true)!) && !shut(cutAction(cardTable.o, pile.id, 3)!)
    && !shut(gatherAction(afterDraw.o, pile.id)!));

  // 同一件东西的「玩」与「改规格」要拆开看：几何留着，名字收走
  check("区域改大小留着，改名与换垫面图收起", !shut(zoneResizeAction(pad, 0.1)!) && shut({ t: "zone", id: pad.id, label: "新区域" }) && shut(padImageAction(pad, "iab12cd34")!));
  check("首选落牌区与隐私开关不收：打牌时真要按它们落点", !shut(zonePrefAction(pad, true)!) && !shut(zonePrivAction(pad, true)!));
  check("牌屏认领与改大小留着，只有刻字那一下收起", !shut(shieldClaimAction(shield, "乙")!) && !shut(shieldResizeAction(shield, 0.1)!) && shut({ t: "shield", id: shield.id, label: "我的屏风" }));
  check("规则书翻页不算改正文，加减页与改写才算", !shut(bookPageAction(book, 1)!) && [bookPagesAction(book, 1), bookWriteAction(book, ["只有一页"])].every((a) => !!a && shut(a)));
  check("唱片机播放、进度、音量、循环都照旧", [
    gramPlayAction(gram, true)!, gramSeekAction(gram, 12)!, gramNudgeAction(gram, 5)!, gramVolAction(gram, 0.1)!, gramLoopAction(gram, true)!,
  ].every((a) => !shut(a)));
  check("换唱片、抽唱片、改曲名收起：那是开桌前把音乐准备好", [
    gramLoadAction(gram, "abassline2", "另一首", 40)!, gramLoadAction(gram, null)!, gramRenameAction(gram, "换个名字")!,
  ].every((a) => !!a && shut(a)));
  check("往桌上添辅助物件不收：摆一台新机器、一块新垫子、一本新书", [addGramAction("#2c4a7c"), addPadAction("#2c4a7c", 0.5, 0.5), addBookAction("#2c4a7c"), addZoneAction("#2c4a7c", 0.5, 0.5)].every((a) => !shut(a)));
  check("提示语说清了从哪退回去", GAME_SHUT_HINT.includes("管理") && GAME_SHUT_HINT.includes("游戏模式"), GAME_SHUT_HINT);
}

/**
 * 组件库的分组、叫法与两处菜单的门控都建立在「归约器收不收得下」之上，所以这一页一起验：
 * 表漏了一类物件、某页成了空页、或菜单给收不下的物件摆了按钮，这里就该报。
 */
function paletteChecks(): void {
  const KINDS: Kind[] = ["board", "pawn", "disc", "cube", "die", "card", "pile", "box", "bag", "token", "timer", "pointer", "arrow", "text", "zone", "stat", "slot", "calc", "spinner", "track", "shield", "hour", "book", "gram", "mp3", "counter", "tray", "tablet"];
  const tabIds = PALETTE_TABS.map((t) => t.id as string);
  const homeless = KINDS.filter((k) => !KIND_TAB[k]);
  check("分类表：每种物件都有一个家", homeless.length === 0, homeless.join(","));
  const bogus = KINDS.filter((k) => !tabIds.includes(KIND_TAB[k] as string));
  check("分类表：没有指向不存在页签的归属", bogus.length === 0, bogus.map((k) => `${k}→${KIND_TAB[k]}`).join(","));
  const stale = Object.keys(KIND_TAB).filter((k) => !KINDS.includes(k as Kind));
  check("分类表：没有已消失的物件还留在表里", stale.length === 0, stale.join(","));
  const emptyTabs = tabIds.filter((id) => !KINDS.some((k) => KIND_TAB[k] === id));
  check("组件库：每一页都真有东西可摆", emptyTabs.length === 0, emptyTabs.join(","));

  const bare = (kind: Kind): GameObject => ({ id: `k-${kind}`, kind, x: 0, z: 0, rot: 0, layer: 0 });
  const nameless = KINDS.filter((k) => !displayName(bare(k)));
  check("每种物件都有叫法", nameless.length === 0, nameless.join(","));
  const zoneNames = [
    displayName({ ...bare("zone"), zone: { w: 0.4, d: 0.3 } }),
    displayName({ ...bare("zone"), zone: { w: 0.4, d: 0.3, pad: true } }),
    displayName({ ...bare("zone"), zone: { w: 0.4, d: 0.3, img: "abcd" } }),
  ];
  check("区域/垫子/图片垫子是三种叫法", new Set(zoneNames).size === 3, zoneNames.join("、"));
  const boardNames = [
    displayName({ ...bare("board"), board: { layout: "grid", cols: 8, rows: 8, cell: 0.08, theme: "checker" } }),
    displayName({ ...bare("board"), board: { layout: "mat", cols: 8, rows: 8, cell: 0.08, theme: "mat", img: "abcd" } }),
  ];
  check("棋盘与桌垫分得开", new Set(boardNames).size === 2, boardNames.join("、"));
  check("计数标记与文字牌不重名", displayName({ ...bare("token"), value: 2 }) !== displayName({ ...bare("text"), label: "此处弃牌" }));

  const table = apply(
    apply(starter("empty", "分类桌"), { t: "add", o: { ...bare("zone"), id: "z-1", zone: { w: 0.4, d: 0.3 } } }, "甲"),
    { t: "add", o: { ...bare("card"), id: "c-1", card: { back: "plain" } } },
    "甲",
  );
  const stray = table.o.find((o) => o.id === "c-1")!;
  const turned = apply(table, { t: "flip", ids: ["c-1"] }, "甲");
  check("单张散牌翻得动：长按菜单那一行不是空按钮", JSON.stringify(turned.o.find((o) => o.id === "c-1")) !== JSON.stringify(stray));
  const pinned = apply(table, { t: "layer", ids: ["z-1"], delta: 1, pin: true }, "甲").o.find((o) => o.id === "z-1")!;
  check("贴面的区域垫钉不住：上层/下层那两行只摆收得下的", !pinned.pin);

  const swapped = apply(table, boardPresetAction("xiangqi"), "甲");
  const plates = swapped.o.filter((o) => o.kind === "board");
  check("组件库换上一张网格棋盘：一张桌只留一张盘", plates.length === 1 && plates[0].preset === "xiangqi" && plates[0].grid === true, `${plates.length} 张盘`);
  check("换棋盘没把桌上的牌一起带走", swapped.o.some((o) => o.id === "c-1"));
  const sized = apply(swapped, { t: "scale", ids: [plates[0].id, "c-1"], factor: 1.2 }, "甲");
  check("棋盘不参与放大缩小：一整张盘不会被越放越大",
    JSON.stringify(sized.o.find((o) => o.id === plates[0].id)) === JSON.stringify(plates[0]) && (sized.o.find((o) => o.id === "c-1")?.scale ?? 1) > 1);
  const bared = apply(swapped, boardPresetAction(null), "甲");
  check("撤掉棋盘回到纯桌布，桌上的牌与垫子都留着", !bared.o.some((o) => o.kind === "board") && bared.o.some((o) => o.id === "c-1") && bared.o.some((o) => o.id === "z-1"));
  // 「复制」那一行的门控口径：只选一张盘时动作本身就是 null，摆出来就是颗按不动的按钮
  check("单张棋盘复制不出第二张盘：动作返回 null，菜单也就不摆那颗钮", duplicateAction(swapped.o, [plates[0].id]) === null);
  check("散牌照样复制得动：门控没把能用的那一路一起掐掉", duplicateAction(swapped.o, ["c-1"])?.t === "add");
}

function counterChecks(): void {
  const mkCard = (id: string, x: number, z: number, rot = 0, scale = 1): GameObject =>
    ({ id, kind: "card", color: "#2c4a7c", card: { back: "classic", label: id }, x, z, rot, scale, layer: 0 });
  const mkCounter = (id: string, x: number, z: number, spec?: { v?: number; step?: number }): GameObject =>
    ({ id, kind: "counter", color: "#3d5c46", counter: { v: spec?.v ?? 0, step: spec?.step ?? 1 }, x, z, rot: 0, layer: 0 });
  const tableWith = (...objects: GameObject[]): TableState => {
    let s = starter("empty", "计数器桌");
    for (const o of objects) s = apply(s, { t: "add", o }, "甲");
    return s;
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

  // ——— 出厂默认：读数 0、步进 1、散在桌上 ———
  const born = addCounterAction("#3d5c46");
  check("迷你计数器归到工具页签", KIND_TAB.counter === "tool");
  const placed = apply(starter("empty", "x"), born, "甲");
  const fresh = placed.o.find((o) => o.kind === "counter")!;
  check("放下就是读数 0 步进 1 且散在桌上", fresh.counter?.v === 0 && fresh.counter?.step === 1 && !fresh.counter?.host);
  check("描述带出读数", describe(fresh).includes("0"));

  // ——— 四条边吸附（宿主 rot 0）：拖到边附近就贴上，位置与朝向都跟着那条边 ———
  const t0 = tableWith(mkCard("c-h", 0, 0), mkCounter("n-1", 0.4, 0.4));
  const cardH = t0.o.find((o) => o.id === "c-h")!;
  for (const e of [0, 1, 2, 3] as const) {
    const spot = counterSpot(cardH, e);
    const mv = resolveDrop(t0, [{ id: "n-1", x: spot.x, z: spot.z }])[0];
    check(`拖到卡牌${COUNTER_EDGE_NAMES[e]}边就吸上那条边`, mv.host === "c-h" && mv.edge === e, `host=${mv.host} edge=${mv.edge}`);
    const after = apply(t0, { t: "move", m: [mv] }, "甲");
    const c = after.o.find((o) => o.id === "n-1")!;
    check(`吸附后贴在${COUNTER_EDGE_NAMES[e]}边且宿主没被顶走`,
      c.counter?.host === "c-h" && c.counter?.edge === e && near(c.x, spot.x) && near(c.z, spot.z) && c.rot === spot.rot
      && near(after.o.find((o) => o.id === "c-h")!.x, 0) && near(after.o.find((o) => o.id === "c-h")!.z, 0));
  }

  // ——— 转过的宿主：整片跟着转，左右两条边额外躺平 ———
  const tRot = tableWith(mkCard("c-r", 0, 0, 90), mkCounter("n-r", 0.4, 0.4));
  const cardR = tRot.o.find((o) => o.id === "c-r")!;
  const spotR = counterSpot(cardR, 0);
  const mvR = resolveDrop(tRot, [{ id: "n-r", x: spotR.x, z: spotR.z }])[0];
  const cR = apply(tRot, { t: "move", m: [mvR] }, "甲").o.find((o) => o.id === "n-r")!;
  check("宿主转 90° 计数器跟着转", cR.counter?.host === "c-r" && cR.rot === spotR.rot && near(cR.x, spotR.x) && near(cR.z, spotR.z), `rot=${cR.rot}`);

  // ——— 放大的宿主：吸附点按缩放后的牌面算 ———
  const tBig = tableWith(mkCard("c-b", 0, 0, 0, 1.5), mkCounter("n-b", 0.5, 0.5));
  const cardB = tBig.o.find((o) => o.id === "c-b")!;
  const spotB = counterSpot(cardB, 2);
  const mvB = resolveDrop(tBig, [{ id: "n-b", x: spotB.x, z: spotB.z }])[0];
  const cB = apply(tBig, { t: "move", m: [mvB] }, "甲").o.find((o) => o.id === "n-b")!;
  check("宿主放大后吸附点跟着外扩", cB.counter?.host === "c-b" && near(cB.z, spotB.z) && Math.abs(spotB.z) > Math.abs(counterSpot(mkCard("z", 0, 0), 2).z));

  // ——— 宿主自己动：没被拖的计数器重新贴回它那条边，不留在原地 ———
  const tFollow = tableWith(mkCard("c-f", 0, 0), mkCounter("n-f", 0.4, 0.4));
  const attached = apply(tFollow, { t: "move", m: [resolveDrop(tFollow, [{ id: "n-f", x: counterSpot(tFollow.o.find((o) => o.id === "c-f")!, 0).x, z: counterSpot(tFollow.o.find((o) => o.id === "c-f")!, 0).z }])[0]] }, "甲");
  check("先吸上上边", attached.o.find((o) => o.id === "n-f")?.counter?.host === "c-f");
  const movedHost = apply(attached, { t: "move", m: [{ id: "c-f", x: 0.3, z: 0.2 }] }, "甲");
  const follower = movedHost.o.find((o) => o.id === "n-f")!;
  const spotF = counterSpot(movedHost.o.find((o) => o.id === "c-f")!, 0);
  check("宿主挪走计数器跟到新的那条边", follower.counter?.host === "c-f" && near(follower.x, spotF.x) && near(follower.z, spotF.z), `(${follower.x},${follower.z}) vs (${spotF.x},${spotF.z})`);

  // ——— 拖离卡牌就脱附：读数与步进留着，不清零 ———
  const setV = apply(attached, counterSetAction(attached.o.find((o) => o.id === "n-f")!, 7)!, "甲");
  const detachedMv = resolveDrop(setV, [{ id: "n-f", x: 0.6, z: -0.5 }])[0];
  check("拖离卡牌的落点标成脱附", detachedMv.host === null);
  const detached = apply(setV, { t: "move", m: [detachedMv] }, "甲").o.find((o) => o.id === "n-f")!;
  check("脱附后读数与步进留着", !detached.counter?.host && detached.counter?.v === 7 && detached.counter?.step === 1);

  // ——— 吸附即归属：吸上之后只认自己那张牌，别的牌贴得再近也抢不走 ———
  const tOwn = tableWith(mkCard("c-o1", 0, 0), mkCard("c-o2", 0.2, 0), mkCounter("n-o", 0.4, 0.4));
  const ownA = tOwn.o.find((o) => o.id === "c-o1")!;
  const ownB = tOwn.o.find((o) => o.id === "c-o2")!;
  const owned = apply(tOwn, { t: "move", m: [resolveDrop(tOwn, [{ id: "n-o", x: counterSpot(ownA, 0).x, z: counterSpot(ownA, 0).z }])[0]] }, "甲");
  check("先归第一张牌", countersOn(owned, "c-o1").length === 1);
  const reachB = counterSpot(ownB, 3);
  const stealMv = resolveDrop(owned, [{ id: "n-o", x: reachB.x, z: reachB.z }])[0];
  check("拖到第二张牌的边上标的仍是自己宿主", stealMv.host === "c-o1" && stealMv.edge === 1, `host=${stealMv.host} edge=${stealMv.edge}`);
  const afterSteal = apply(owned, { t: "move", m: [stealMv] }, "甲");
  const stayed = afterSteal.o.find((o) => o.id === "n-o")!;
  const home = counterSpot(afterSteal.o.find((o) => o.id === "c-o1")!, 1);
  check("抢不走：整片贴回自己那张牌的右边", stayed.counter?.host === "c-o1" && near(stayed.x, home.x) && near(stayed.z, home.z), `(${stayed.x},${stayed.z}) vs (${home.x},${home.z})`);
  check("第二张牌身上一个计数器都没有", countersOn(afterSteal, "c-o2").length === 0 && countersOn(afterSteal, "c-o1").length === 1);

  // 拖宿主牌时这一片被一起带走：中途落点正好压在旁边那张牌的边上，也不换主
  const grabSpot = counterSpot(owned.o.find((o) => o.id === "c-o2")!, 1);
  const pull = resolveDrop(owned, [{ id: "c-o1", x: grabSpot.x, z: grabSpot.z + 0.055 }, { id: "n-o", x: grabSpot.x, z: grabSpot.z }]);
  check("整组拖过的落点不标成别的宿主", pull.find((m) => m.id === "n-o")?.host === "c-o1", JSON.stringify(pull.find((m) => m.id === "n-o")));
  const pulled = apply(owned, { t: "move", m: pull }, "甲");
  check("宿主拖着走时计数器跟着宿主，不被半路的牌抄走", pulled.o.find((o) => o.id === "n-o")?.counter?.host === "c-o1" && countersOn(pulled, "c-o1").length === 1);

  // 换归属的正当路：先脱附，再拖到别的牌边上，才归那张牌
  const freed = apply(owned, counterAttachAction(owned.o.find((o) => o.id === "n-o")!, null)!, "甲");
  const freeMv = resolveDrop(freed, [{ id: "n-o", x: counterSpot(freed.o.find((o) => o.id === "c-o2")!, 0).x, z: counterSpot(freed.o.find((o) => o.id === "c-o2")!, 0).z }])[0];
  check("脱附之后再拖到别的牌边上就归那张牌", freeMv.host === "c-o2", `host=${freeMv.host}`);
  const rehosted = apply(freed, { t: "move", m: [freeMv] }, "甲");
  check("重新吸附就重新归属：新牌身上有它", rehosted.o.find((o) => o.id === "n-o")?.counter?.host === "c-o2" && countersOn(rehosted, "c-o2").length === 1);

  // ——— 宿主没了（进手牌 / 被收走）：脱附但整片留在原地 ———
  const tHand = tableWith(mkCard("c-hd", 0, 0), mkCounter("n-hd", 0.4, 0.4));
  const attachedHd = apply(tHand, { t: "move", m: [resolveDrop(tHand, [{ id: "n-hd", x: counterSpot(tHand.o.find((o) => o.id === "c-hd")!, 0).x, z: counterSpot(tHand.o.find((o) => o.id === "c-hd")!, 0).z }])[0]] }, "甲");
  const toHand = apply(attachedHd, handAction(["c-hd"], "甲"), "甲");
  const orphan = toHand.o.find((o) => o.id === "n-hd")!;
  const spotHd = counterSpot(attachedHd.o.find((o) => o.id === "c-hd")!, 0);
  check("宿主进手牌后计数器脱附但留在原地", !orphan.counter?.host && near(orphan.x, spotHd.x) && near(orphan.z, spotHd.z));
  const removed = apply(attachedHd, { t: "remove", ids: ["c-hd"] }, "甲");
  check("宿主被删掉后计数器还在且脱附", removed.o.some((o) => o.id === "n-hd") && !removed.o.find((o) => o.id === "n-hd")?.counter?.host);

  // ——— 加减与步进：越界不出动作（喂回已到边界的物件才算数） ———
  const n0 = t0.o.find((o) => o.id === "n-1")!;
  const plus1 = apply(t0, counterStepAction(n0, 1)!, "甲").o.find((o) => o.id === "n-1")!;
  check("按一下加号走上一个步进", plus1.counter?.v === 1);
  const tStep2 = tableWith(mkCounter("n-s", 0, 0, { v: -5, step: 2 }));
  const stepped2 = apply(tStep2, counterStepAction(tStep2.o.find((o) => o.id === "n-s")!, -1)!, "甲").o.find((o) => o.id === "n-s")!;
  check("步进 2 按减号一次减 2", stepped2.counter?.v === -7);
  const atMin = mkCounter("n-min", 0, 0, { v: COUNTER_V_MIN, step: 1 });
  check("读数到底再减不出动作", counterStepAction(atMin, -1) === null && counterStepAction(atMin, 1)?.t === "counter");
  const atMax = mkCounter("n-max", 0, 0, { v: COUNTER_V_MAX, step: 1 });
  check("读数到顶再加不出动作", counterStepAction(atMax, 1) === null && counterStepAction(atMax, -1)?.t === "counter");
  // 步进越界：先夹到上限，再喂回那个已到上限的物件，重复设同值就不出动作
  const stepUp = apply(t0, counterStepSetAction(n0, 9999)!, "甲").o.find((o) => o.id === "n-1")!;
  check("步进越界夹到上限", fixCounter(stepUp.counter).step === COUNTER_STEP_MAX);
  check("已到步进上限再设更大不出动作", counterStepSetAction(stepUp, 500) === null);
  check("填读数越界夹到范围后重复填同值不出动作", (() => {
    const setTop = apply(t0, counterSetAction(n0, 99999)!, "甲").o.find((o) => o.id === "n-1")!;
    return fixCounter(setTop.counter).v === COUNTER_V_MAX && counterSetAction(setTop, 99999) === null;
  })());
  check("填读数与现值相同不出动作", counterSetAction(plus1, 1) === null);

  // ——— 脏值收口 ———
  check("脏读数/步进/边被 fixCounter 收口", (() => {
    const s = fixCounter({ v: 1e9, step: -3, host: "  c-h  ", edge: 9 });
    return s.v === COUNTER_V_MAX && s.step === COUNTER_STEP_MIN && s.host === "c-h" && s.edge === 0;
  })());
  check("宿主不在桌上的脏计数器进桌即脱附", (() => {
    const dirty = tableWith({ id: "n-d", kind: "counter", color: "#fff", counter: { v: 5, step: 1, host: "nope", edge: 1 } as CounterSpec, x: 0, z: 0.3, rot: 0, layer: 0 });
    return !dirty.o.find((o) => o.id === "n-d")?.counter?.host && dirty.o.find((o) => o.id === "n-d")?.counter?.v === 5;
  })());
  check("非整数读数被四舍五入", fixCounter({ v: 3.6, step: 1 }).v === 4);

  // ——— 换宿主 / 换边 / 脱附动作的门控 ———
  check("换边出动作、同边不出动作", counterAttachAction(plus1, "c-h", 2)?.t === "counter" && counterAttachAction({ ...plus1, counter: { v: 1, step: 1, host: "c-h", edge: 2 } as CounterSpec }, "c-h", 2) === null);
  check("吸自己不出动作", counterAttachAction(n0, "n-1", 0) === null);
  check("没宿主时脱附不出动作", counterAttachAction(n0, null) === null);
  const onHost = { ...n0, counter: { v: 0, step: 1, host: "c-h", edge: 0 } as CounterSpec };
  check("有宿主时脱附出动作", counterAttachAction(onHost, null)?.t === "counter");

  // ——— hostAt 只认摊在桌上的单张散牌 ———
  const tPick = tableWith(mkCard("c-p", 0, 0), mkCard("c-hand", 0.2, 0, 0, 1));
  const inHandState: TableState = { ...tPick, o: tPick.o.map((o) => (o.id === "c-hand" ? { ...o, hand: true } : o)) };
  check("手牌不能当宿主", hostAt(inHandState, 0.2, 0)?.id !== "c-hand");
  check("桌上的散牌能当宿主", hostAt(tPick, 0, 0)?.id === "c-p");
  check("nearestEdge 挑最近的边", (() => {
    const c = mkCard("c-e", 0, 0);
    return nearestEdge(c, 0, -1) === 0 && nearestEdge(c, 1, 0) === 1 && nearestEdge(c, 0, 1) === 2 && nearestEdge(c, -1, 0) === 3;
  })());
  check("countersOn 数出吸在这张牌上的计数器", countersOn(attached, "c-f").length === 1);

  // ——— 多个计数器可以吸在同一条边上 ———
  const tMulti = tableWith(mkCard("c-m", 0, 0), mkCounter("n-m1", 0.4, 0.4), mkCounter("n-m2", 0.45, 0.45));
  const m1 = apply(tMulti, { t: "move", m: [resolveDrop(tMulti, [{ id: "n-m1", x: counterSpot(tMulti.o.find((o) => o.id === "c-m")!, 0).x, z: counterSpot(tMulti.o.find((o) => o.id === "c-m")!, 0).z }])[0]] }, "甲");
  const m2 = apply(m1, { t: "move", m: [resolveDrop(m1, [{ id: "n-m2", x: counterSpot(m1.o.find((o) => o.id === "c-m")!, 0).x, z: counterSpot(m1.o.find((o) => o.id === "c-m")!, 0).z }])[0]] }, "甲");
  check("同一条边能吸多个计数器", countersOn(m2, "c-m").length === 2);

  // ——— 两端重放一致 ———
  const mvRe = resolveDrop(t0, [{ id: "n-1", x: counterSpot(cardH, 1).x, z: counterSpot(cardH, 1).z }])[0];
  check("两端重放同一片计数器", JSON.stringify(apply(t0, { t: "move", m: [mvRe] }, "甲").o) === JSON.stringify(apply(t0, { t: "move", m: [mvRe] }, "乙").o));
  check("两端重放同一个读数", JSON.stringify(apply(t0, counterStepAction(n0, 1)!, "甲").o) === JSON.stringify(apply(t0, counterStepAction(n0, 1)!, "乙").o));

  // ——— 权限口径：改读数/步进算 count，换宿主/换边算 move；游戏模式只挡改步进 ———
  check("改读数/步进归 count 权限", actionPerm({ t: "counter", id: "n", delta: 1 }) === "count" && actionPerm({ t: "counter", id: "n", step: 5 }) === "count");
  check("换宿主/换边归 move 权限", actionPerm({ t: "counter", id: "n", host: "c" }) === "move" && actionPerm({ t: "counter", id: "n", edge: 1 }) === "move");
  check("changePerm 按前后差分辨 count / move",
    changePerm({ kind: "counter", counter: { v: 0, step: 1 } } as GameObject, { kind: "counter", counter: { v: 3, step: 1 } } as GameObject) === "count"
    && changePerm({ kind: "counter", counter: { v: 0, step: 1 } } as GameObject, { kind: "counter", counter: { v: 0, step: 1, host: "c", edge: 0 } } as GameObject) === "move");
  check("游戏模式只挡改步进这一笔", gameShut({ t: "counter", id: "n", step: 5 }) === true && gameShut({ t: "counter", id: "n", delta: 1 }) === false);

  // ——— 校验镜像：脏计数器进 sanitize 被收口 ———
  check("api.sanitize 收口脏计数器字段", (() => {
    const raw: TableState = { ...starter("empty", "s"), o: [{ id: "n-x", kind: "counter", color: "#fff", counter: { v: 1e9, step: 0, host: "gone", edge: 7 } as unknown as CounterSpec, x: 0, z: 0, rot: 0, layer: 0 }] };
    const clean = fixCounter(api.sanitize(raw).o.find((o) => o.id === "n-x")?.counter);
    return clean.v === COUNTER_V_MAX && clean.step === COUNTER_STEP_MIN && clean.edge === 0;
  })());
}

function trayChecks(): void {
  const mkTray = (id: string, x: number, z: number, w = 0.2, d = 0.14, rot = 0): GameObject =>
    ({ id, kind: "tray", color: "#4b5a3c", tray: { w, d }, x, z, rot, layer: 0 });
  const mkDie = (id: string, x: number, z: number, sides = 6): GameObject =>
    ({ id, kind: "die", color: "#c8443c", sides, x, z, rot: 0, layer: 0 });
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

  // ——— 页签与命名：骰盘归到骰子页签，中文只有一处 ——
  check("骰盘归到骰子页签", KIND_TAB.tray === "die");
  check("骰盘显示名为「骰盘」", displayName(mkTray("t", 0, 0)) === "骰盘");

  // ——— fixTray：脏值收口到 [TRAY_MIN,TRAY_MAX]、四舍五入到毫米 ——
  check("fixTray 把越界与脏值夹回区间", (() => {
    const big = fixTray({ w: 99, d: -5 });
    const nan = fixTray({ w: NaN, d: "abc" });
    const round = fixTray({ w: 0.23456, d: 0.11111 });
    return big.w === TRAY_MAX && big.d === TRAY_MIN
      && nan.w === fixTray(undefined).w && nan.d === fixTray(undefined).d
      && round.w === 0.235 && round.d === 0.111;
  })(), JSON.stringify(fixTray({ w: 0.23456, d: 0.11111 })));

  // ——— 出厂默认 ——
  const born = addTrayAction("#4b5a3c");
  const placed = apply(starter("empty", "x"), born, "甲");
  const fresh = placed.o.find((o) => o.kind === "tray")!;
  check("放下就是默认内径", fresh.tray?.w === fixTray(undefined).w && fresh.tray?.w === 0.2 && fresh.tray?.d === 0.14);
  check("描述带出厘米尺寸", describe(fresh).includes("20") && describe(fresh).includes("14"));

  // ——— 几何判定：inTray 按朝向、外框比内径大两壁 ——
  check("外径 = 内径 + 两倍壁厚", (() => {
    const o = trayOuter(mkTray("t", 0, 0, 0.2, 0.14));
    return near(o.w, 0.2 + TRAY_WALL * 2) && near(o.d, 0.14 + TRAY_WALL * 2);
  })());
  check("盘心的骰子算在盘里", inTray(mkTray("t", 0, 0, 0.2, 0.14), 0, 0));
  check("盘外的点不算在盘里", !inTray(mkTray("t", 0, 0, 0.2, 0.14), 0.3, 0));
  check("转 90° 后按旋转后的长轴判定", (() => {
    const rotTray = mkTray("t", 0, 0, 0.2, 0.14, 90); // 转 90° 后长边躺到 z 轴
    return inTray(rotTray, 0, 0.09) && !inTray(rotTray, 0.09, 0);
  })());

  // ——— diceInTray：只收盘里的骰子，手里的和盘外都不算 ——
  const dz = starter("empty", "盘桌");
  const withTray = apply(dz, { t: "add", o: mkTray("t", 0, 0, 0.2, 0.14) }, "甲");
  let s1 = apply(withTray, { t: "add", o: mkDie("d-in", 0.03, 0.02) }, "甲");
  s1 = apply(s1, { t: "add", o: mkDie("d-out", 0.5, 0.5) }, "甲");
  const held = { ...mkDie("d-held", 0, 0), hand: "甲" } as GameObject;
  s1 = apply(s1, { t: "add", o: held }, "甲");
  const trayObj = s1.o.find((o) => o.id === "t")!;
  const inIds = diceInTray(s1, trayObj).sort();
  check("diceInTray 只挑盘里那颗骰子", inIds.length === 1 && inIds[0] === "d-in", inIds.join(","));

  // ——— trayAt：落点命中最近那只盘，排除自己 ——
  check("trayAt 命中盘里的落点", trayAt(s1, 0.03, 0.02)?.id === "t");
  check("trayAt 盘外返回 null", trayAt(s1, 0.5, 0.5) === null);

  // ——— trayResizeAction 门控：改到边界就不出动作（对应无死按钮铁律） ——
  const mid = mkTray("t", 0, 0, 0.2, 0.14);
  check("中间尺寸加宽出动作", trayResizeAction(mid, 0.04, 0)?.t === "tray");
  check("同尺寸不加不减出 null", trayResizeAction(mid, 0, 0) === null);
  const atMax = mkTray("t", 0, 0, TRAY_MAX, TRAY_MAX);
  check("已到上限再加不出动作", trayResizeAction(atMax, 0.04, 0) === null && trayResizeAction(atMax, 0, 0.04) === null);
  const atMin = mkTray("t", 0, 0, TRAY_MIN, TRAY_MIN);
  check("已到下限再减不出动作", trayResizeAction(atMin, -0.04, 0) === null && trayResizeAction(atMin, 0, -0.04) === null);
  // 减到刚好贴边：动作存在且结果被夹在区间内
  const nearMax = mkTray("t", 0, 0, TRAY_MAX, TRAY_MAX);
  const shrink = trayResizeAction(nearMax, -0.04, 0);
  check("从上限减一档能落到区间内", shrink?.t === "tray" && shrink.w === Math.round((TRAY_MAX - 0.04) * 1000) / 1000);

  // ——— 归约应用改尺寸 ——
  const resized = apply(s1, trayResizeAction(trayObj, 0.04, 0)!, "甲").o.find((o) => o.id === "t")!;
  check("改宽后内径真变了", near(resized.tray!.w, 0.24) && near(resized.tray!.d, 0.14));

  // ——— 权限口径：改尺寸归 zone，挪盘归 move ——
  check("改盘径归 zone 权限", actionPerm({ t: "tray", id: "t", w: 0.3 }) === "zone");
  check("改盘径的 changePerm 反推 zone", changePerm(mkTray("t", 0, 0), mkTray("t", 0, 0, 0.3, 0.2)) === "zone");
  check("挪盘位置反推 move", changePerm(mkTray("t", 0, 0), { ...mkTray("t", 0, 0), x: 0.3 }) === "move");
  check("游戏模式不挡改盘径（是玩中可调的外观）", gameShut({ t: "tray", id: "t", w: 0.3 }) === false);

  // ——— tidy：别的 kind 带上 tray 会被抹掉（tidy 只在物件进桌时跑，所以用 add 动作送进去）——
  const dirtyCard = { id: "c", kind: "card", color: "#fff", x: 0, z: 0, rot: 0, layer: 0, tray: { w: 0.9, d: 0.9 }, card: { back: "plain" } } as unknown as GameObject;
  const cleaned = apply(starter("empty", "脏"), { t: "add", o: dirtyCard }, "甲");
  check("卡牌带的 tray 字段被 tidy 抹掉", cleaned.o.find((o) => o.id === "c")?.tray === undefined);

  // ——— 收进 api.sanitize：脏 tray 被夹回区间 ——
  const raw: TableState = { ...starter("empty", "s"), o: [{ id: "t-x", kind: "tray", color: "#fff", tray: { w: 99, d: -5 } as unknown as { w: number; d: number }, x: 0, z: 0, rot: 0, layer: 0 }] };
  const san = api.sanitize(raw).o.find((o) => o.id === "t-x")?.tray;
  check("sanitize 把脏 tray 夹回区间", san?.w === TRAY_MAX && san?.d === TRAY_MIN);
}

/**
 * 平板浏览器：桌上只留一条地址与几个走带参数，进度由各端按同一套纯函数从起播时刻推。
 * 这里验收口（脏地址当空机、非 B 站的地址没有走带）、地址认法、构造器的 null 门控、权限口径与 tidy 泄漏。
 */
function tabletChecks(): void {
  const mkTv = (id: string, v?: unknown): GameObject =>
    ({ id, kind: "tablet", color: "#2b2b30", x: 0.4, z: 0, rot: 0, layer: 0, tablet: fixTablet(v) });
  const BV = "BV1xx411c7mD";
  const BILI = BILI_VIDEO + BV;
  const NEAR = "BV1t411c7mXq";
  const SITE = "https://example.com/board";
  const AT = 1_700_000_000_000;

  // 页签与命名
  check("平板归到影音页签", KIND_TAB.tablet === "music");
  check("平板显示名为「平板浏览器」", displayName(mkTv("tv")) === "平板浏览器");

  // isWebUrl：只放行写死协议的 http/https，这一条是挡在每一个人浏览器前面的那道闸
  check("认下带协议的正常网址", isWebUrl(SITE) && isWebUrl("http://a.cn") && isWebUrl("https://a.cn/x?y=1#z"));
  check("挡下 javascript 与 data 与 file", !isWebUrl("javascript:alert(1)") && !isWebUrl("data:text/html,x") && !isWebUrl("file:///etc/passwd"));
  check("挡下没写协议的裸域名与相对路径", !isWebUrl("example.com") && !isWebUrl("/board") && !isWebUrl("//a.cn"));
  check("挡下夹空格、换行与超长", !isWebUrl("https://a.cn/x y") && !isWebUrl("https://a.cn/x\nhttps://evil.cn")
    && !isWebUrl("https://a.cn/" + "x".repeat(TABLET_ADDR_MAX)) && isWebUrl("https://a.cn/" + "x".repeat(TABLET_ADDR_MAX - 13)));

  // biliOf：只认折好的那一种 B 站片页
  check("从片页地址认出 BV 号", biliOf(BILI) === BV && biliOf(`${BILI}/?p=3`) === BV);
  check("别的站与 B 站的别的页面都当普通网页", biliOf(SITE) === null && biliOf("https://www.bilibili.com/bangumi/play/ep1") === null && biliOf("") === null);

  // fixTablet：脏地址当空机，空机与非 B 站的地址都没有走带可言
  check("fixTablet 收下干净地址", fixTablet({ url: BILI, page: 3, pos: 90.5, playing: true, at: AT, mute: true }).url === BILI);
  check("fixTablet 把 javascript 地址当空机", (() => {
    const junk = fixTablet({ url: "javascript:alert(1)", pos: 42, playing: true, at: AT });
    return junk.url === "" && junk.pos === 0 && junk.playing === false && junk.at === null;
  })());
  check("普通网页没有走带：位置集数静音一起归零", (() => {
    const t = fixTablet({ url: SITE, pos: 90, playing: true, at: AT, mute: true, page: 7 });
    return t.url === SITE && t.pos === 0 && t.playing === false && t.at === null && t.mute === false && t.page === 1;
  })());
  check("老房间只写着片号：折成 B 站片页不清屏", (() => {
    const t = fixTablet({ bv: BV, pos: 30, playing: true, at: AT });
    return t.url === BILI && biliOf(t.url) === BV && t.pos === 30 && t.playing === true;
  })());
  check("老房间那种脏片号照样当空机", fixTablet({ bv: "av12345678", pos: 42, playing: true, at: AT }).url === "");
  check("没地址时 playing 与 at 一起归零", (() => {
    const t = fixTablet({ playing: true, at: AT, mute: true });
    return t.url === "" && t.playing === false && t.at === null && t.mute === false;
  })());
  check("fixTablet 夹住集数与秒数", (() => {
    const hi = fixTablet({ url: BILI, page: 9999, pos: 1e9 });
    const lo = fixTablet({ url: BILI, page: 0, pos: -50 });
    return hi.page === TABLET_PAGE_MAX && hi.pos === TABLET_POS_MAX && lo.page === 1 && lo.pos === 0;
  })());
  check("fixTablet 把秒数收到毫秒", fixTablet({ url: BILI, pos: 12.34567 }).pos === 12.346);
  check("fixTablet 没给起播时刻就用当下", (() => {
    const before = Date.now();
    const t = fixTablet({ url: BILI, playing: true });
    return t.at !== null && t.at >= before && t.at <= Date.now();
  })());
  check("重新载入的计数夹在 0~999", fixTablet({ url: BILI, rev: -3 }).rev === 0 && fixTablet({ url: BILI, rev: 1e6 }).rev === TABLET_REV_MAX);

  // tabletPos：各端按同一份推出同一个秒数
  check("停着的平板报的就是 pos", tabletPos(fixTablet({ url: BILI, pos: 33, playing: false }), AT + 9e6) === 33);
  check("在放就按起播时刻往前推", (() => {
    const t = fixTablet({ url: BILI, pos: 10, playing: true, at: AT });
    return Math.abs(tabletPos(t, AT + 60_000) - 70) < 1e-6;
  })());
  check("推算不越过上限也不小于零", (() => {
    const t = fixTablet({ url: BILI, pos: 21590, playing: true, at: AT });
    return tabletPos(t, AT + 600_000) === TABLET_POS_MAX && tabletPos(t, AT - 600_000) >= 0;
  })());

  // 出厂就是一台空机
  const born = addTabletAction("#2b2b30");
  const placed = apply(starter("empty", "tv"), born, "甲");
  const fresh = placed.o.find((o) => o.kind === "tablet")!;
  check("放下的是没填地址的空机", !!fresh && fresh.tablet?.url === "" && fresh.tablet?.playing === false);
  check("空机的描述说清没填地址", describe(fresh).includes("没填地址"));

  // 认地址：裸 BV 号、整条 B 站链接、普通网址、没写协议的域名都收
  check("裸 BV 号折成 B 站片页", tabletAddr(BV)?.url === BILI && tabletAddr(BV)?.page === 1);
  check("从整条链接里认出片号与集数", (() => {
    const hit = tabletAddr(`https://www.bilibili.com/video/${BV}/?p=3&spm_id_from=333.788`);
    return hit?.url === BILI && hit?.page === 3;
  })());
  check("普通网址原样收下", tabletAddr(SITE)?.url === SITE && tabletAddr(`  ${SITE}  `)?.url === SITE);
  check("没写协议的域名补上 https", tabletAddr("example.com/board")?.url === "https://example.com/board");
  check("认不出的输入返回 null", tabletAddr("随便一段话") === null && tabletAddr("javascript:alert(1)") === null && tabletAddr("") === null);
  check("站名读出来给人看的", tabletHost(BILI) === "bilibili.com" && tabletHost("https://www.example.com/a") === "example.com");

  // 拼屏上挂的那一条：B 站走嵌入播放器，别的站直接挂原地址
  check("平板地址带片号与集数", (() => {
    const src = tabletSrc(BV, 3, 0, false, true);
    return src.startsWith("https://player.bilibili.com/player.html?")
      && src.includes("bvid=" + BV) && src.includes("p=3") && src.includes("autoplay=1") && src.includes("muted=0")
      && !src.includes("t=");
  })());
  check("平板地址的起播秒只取整数", tabletSrc(BV, 1, 90.7, true, false).includes("t=90") && tabletSrc(BV, 1, 90.7, true, false).includes("muted=1"));
  check("B 站的屏挂的是嵌入播放器", tabletFrame(fixTablet({ url: BILI, playing: false, pos: 12 }), 12).includes("player.bilibili.com"));
  check("普通网页的屏挂的就是那条地址", tabletFrame(fixTablet({ url: SITE }), 0) === SITE);
  check("关掉弹幕才写 danmaku=0，桌面那条一字不变",
    tabletSrc(BV, 1, 0, false, true).includes("danmaku") === false
      && tabletSrc(BV, 1, 0, false, true, false).includes("danmaku=0"));
  check("非 B 站的地址不受弹幕开关影响", tabletFrame(fixTablet({ url: SITE }), 0, false) === SITE);

  // 屏面按占位分档：手机上那块平躺的平板只占两三百像素，不该按 720p 那一档挂整页播放器
  check("每一档都是 16:9，贴到机上不变形",
    TABLET_PX_TIERS.every((px) => Math.abs(px / tabletScreenPx(px) - TABLET_SCREEN.w / TABLET_SCREEN.h) < 1e-9));
  check("占满屏走高清档", tabletScreenPlan(1400).px === 1280 && tabletScreenPlan(1400).show);
  check("手机典型占位落在低档",
    tabletScreenPlan(480).px === 640 && tabletScreenPlan(300).px === 480 && tabletScreenPlan(900).px === 960);
  check("指甲盖大小干脆不挂", tabletScreenPlan(120).show === false && tabletScreenPlan(0).show === false);
  check("脏输入当最小处理", tabletScreenPlan(Number.NaN).show === false && tabletScreenPlan(-400).show === false);
  // 换档会让 iframe 里那一页重排一次，所以蹭着边界不许来回换
  check("升档要跨过门槛一截", tabletScreenPlan(700, 640).px === 640 && tabletScreenPlan(800, 640).px === 960);
  check("降档也要跌过门槛一截", tabletScreenPlan(550, 960).px === 960 && tabletScreenPlan(450, 960).px === 640);
  check("藏与露之间同样留迟滞",
    tabletScreenPlan(200, 480).show === true && tabletScreenPlan(150, 480).show === false);

  // 构造器的 null 门控：值没变就不该摆按钮
  check("空机放不出片来", tabletPlayAction(mkTv("tv"), true) === null);
  check("空机拨不动进度", tabletSeekAction(mkTv("tv"), 30) === null && tabletNudgeAction(mkTv("tv"), 10) === null);
  check("空机没有集可翻", tabletPageAction(mkTv("tv"), 1) === null);
  check("空机没有页面可关可重装", tabletClearAction(mkTv("tv")) === null && tabletReloadAction(mkTv("tv")) === null);
  const plain = mkTv("tv-p", { url: SITE });
  check("普通网页拧不动走带", tabletPlayAction(plain, true) === null && tabletSeekAction(plain, 30) === null
    && tabletPageAction(plain, 1) === null && tabletMuteAction(plain, true) === null && tabletNudgeAction(plain, 10) === null);
  check("普通网页关得掉也重载得了", tabletClearAction(plain)?.t === "tablet" && tabletReloadAction(plain)?.t === "tablet");
  const loaded = apply(placed, tabletLoadAction(fresh, `https://www.bilibili.com/video/${BV}/`)!, "甲");
  const tv1 = loaded.o.find((o) => o.id === fresh.id)!;
  check("贴上一个 BV 就从头放起来", tv1.tablet?.url === BILI && tv1.tablet?.playing === true && tv1.tablet?.pos === 0);
  check("同一个地址再贴一次不出动作", tabletLoadAction(tv1, BV) === null);
  check("换一部是从头起播", (() => {
    const act = tabletLoadAction(tv1, NEAR);
    return act?.t === "tablet" && act.url === BILI_VIDEO + NEAR && act.page === 1 && act.pos === 0;
  })());
  check("贴一条普通网址也起得来", (() => {
    const withTv = apply(starter("empty", "w"), addTabletAction("#2b2b30"), "甲");
    const pad = withTv.o.find((o) => o.kind === "tablet")!;
    const s2 = apply(withTv, tabletLoadAction(pad, SITE, AT)!, "甲");
    const t2 = s2.o.find((o) => o.id === pad.id)!.tablet!;
    return t2.url === SITE && t2.playing === false && t2.pos === 0;
  })());
  check("认不出的输入不出动作", tabletLoadAction(tv1, "随便一段话") === null);
  check("已经在放就不再放", tabletPlayAction(tv1, true) === null);
  check("集数到头就不给翻", tabletPageAction(mkTv("tv2", { url: BILI, page: TABLET_PAGE_MAX }), 1) === null);
  check("集数到头往前才给翻", tabletPageAction(mkTv("tv2", { url: BILI, page: TABLET_PAGE_MAX }), -1)?.t === "tablet");
  check("第一集往前不给翻", tabletPageAction(mkTv("tv3", { url: BILI, page: 1 }), -1) === null);
  check("停着的秒数拨到自己就是 null", tabletSeekAction(mkTv("tv4", { url: BILI, pos: 30, playing: false }), 30) === null);
  check("往前挪过头夹在零秒", (() => {
    const act = tabletNudgeAction(mkTv("tv5", { url: BILI, pos: 5, playing: false }), -10);
    return act?.t === "tablet" && act.pos === 0;
  })());
  check("静音开关 same 值不出动作", tabletMuteAction(mkTv("tv6", { url: BILI }), false) === null && tabletMuteAction(mkTv("tv6", { url: BILI }), true)?.t === "tablet");

  // 按下暂停：把此刻的位置落回 pos，下次接着放
  const mid = mkTv("tv7", { url: BILI, pos: 100, playing: true, at: AT });
  const paused = tabletPlayAction(mid, false, AT + 45_000);
  check("暂停把这一秒写回 pos", paused?.t === "tablet" && Math.abs(paused.pos! - 145) < 1e-6 && paused.playing === false && paused.at === null);
  const resumed = apply(apply(starter("empty", "z"), { t: "add", o: mid }, "甲"), paused!, "甲");
  const afterPause = resumed.o.find((o) => o.id === "tv7")!;
  check("暂停后进状态的是推算好的秒数", afterPause.tablet?.playing === false && Math.abs((afterPause.tablet?.pos ?? 0) - 145) < 1e-6);
  const again = tabletPlayAction(afterPause, true, AT + 50_000);
  check("接着放从停住那一秒起", again?.t === "tablet" && Math.abs(again.pos! - 145) < 1e-6 && again.playing === true);

  // 关掉页面：屏黑下去，进度一并抹平
  const cleared = apply(resumed, tabletClearAction(afterPause)!, "甲");
  const blank = cleared.o.find((o) => o.id === "tv7")!;
  check("关掉页面后进度与起播时刻都归零", blank.tablet?.url === "" && blank.tablet?.pos === 0 && blank.tablet?.playing === false && blank.tablet?.at === null);
  check("关掉页面后描述变回没填地址", describe(blank).includes("没填地址"));

  // 重新载入：地址一个字不动，只把计数加一，各端据此重挂一次屏
  const rl = apply(resumed, tabletReloadAction(afterPause)!, "甲");
  const r1 = rl.o.find((o) => o.id === "tv7")!;
  check("重新载入只翻计数，地址与走带一个字都不改", r1.tablet?.rev === (afterPause.tablet?.rev ?? 0) + 1
    && r1.tablet?.url === afterPause.tablet?.url && r1.tablet?.pos === afterPause.tablet?.pos);
  check("计数到顶绕回 0", (() => {
    const act = tabletReloadAction(mkTv("tv8", { url: BILI, rev: TABLET_REV_MAX }));
    return act?.t === "tablet" && act.rev === 0;
  })());
  check("日志认得出重新载入这一行", rl.log.at(-1)?.text.includes("重新载入"));

  // 换集：从第 0 秒起，放没放照旧
  const ep2 = tabletPageAction(mid, 1, AT + 30_000);
  check("翻到下一集清空进度但保持在放", ep2?.t === "tablet" && ep2.page === 2 && ep2.pos === 0 && ep2.playing === true);

  // 权限口径：放映跟计时器、唱片机同一档；游戏模式只挡备内容
  check("平板动作归 timer 权限", actionPerm({ t: "tablet", id: "tv", playing: true }) === "timer");
  check("平板改地址的 changePerm 反推 timer", changePerm(mkTv("tv"), mkTv("tv", { url: BILI })) === "timer");
  check("挪动平板的位置反推 move", changePerm(mkTv("tv"), { ...mkTv("tv"), x: 0.9 }) === "move");
  check("游戏模式不挡放映、跳段与重新载入", gameShut({ t: "tablet", id: "tv", playing: true }) === false
    && gameShut({ t: "tablet", id: "tv", pos: 90 }) === false && gameShut({ t: "tablet", id: "tv", rev: 1 }) === false);
  check("游戏模式挡下贴地址与关页面", gameShut({ t: "tablet", id: "tv", url: BILI }) === true && gameShut({ t: "tablet", id: "tv", url: "" }) === true);

  // tidy：别的 kind 带上 tablet 会被抹掉
  const dirtyDie = { id: "d", kind: "die", color: "#c8443c", sides: 6, x: 0, z: 0, rot: 0, layer: 0, tablet: { url: BILI } } as unknown as GameObject;
  const cleaned = apply(starter("empty", "脏"), { t: "add", o: dirtyDie }, "甲");
  check("骰子带的 tablet 字段被 tidy 抹掉", cleaned.o.find((o) => o.id === "d")?.tablet === undefined);

  // 收进 api.sanitize：脏平板被夹回合法形状
  const raw: TableState = {
    ...starter("empty", "s"),
    o: [{ id: "tv-s", kind: "tablet", color: "#fff", x: 0, z: 0, rot: 0, layer: 0, tablet: { url: "javascript:alert(1)", page: 5, pos: 90, playing: true, at: AT } }],
  };
  const san = api.sanitize(raw).o.find((o) => o.id === "tv-s")?.tablet;
  check("sanitize 把脏地址连同进度一起归零", san?.url === "" && san?.pos === 0 && san?.playing === false && san?.at === null);
  const raw2: TableState = {
    ...starter("empty", "s2"),
    o: [{ id: "tv-q", kind: "tablet", color: "#fff", x: 0, z: 0, rot: 0, layer: 0, tablet: { url: BILI, page: 1e6, pos: 1e9 } }],
  };
  const san2 = api.sanitize(raw2).o.find((o) => o.id === "tv-q")?.tablet;
  check("sanitize 夹住集数与秒数", san2?.page === TABLET_PAGE_MAX && san2?.pos === TABLET_POS_MAX);
  // 服务端那份是拒绝式的：形状不对整份拒收，这条在 api-check 里用真实 HTTP 验
  check("片号正则与数据层同一口径", BV_ID.test(BV) && !BV_ID.test("av12345678") && !BV_ID.test("BV1"));
}

/**
 * 选中框的自适应轮廓：框照物件自己的脚形描，圆角矩形、正圆、多边形三条路都得通，
 * 而且随体积缩放线性放大——渲染层按米直接摆，不再拿一个圆等比缩出个椭圆糊弄。
 */
function outlineChecks(): void {
  const KINDS: Kind[] = ["board", "pawn", "disc", "cube", "die", "card", "pile", "box", "bag", "token", "timer", "pointer", "arrow", "text", "zone", "stat", "slot", "calc", "spinner", "track", "shield", "hour", "book", "gram", "mp3", "counter", "tray", "tablet"];
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const mk = (kind: Kind, extra: Partial<GameObject> = {}): GameObject =>
    ({ id: `q-${kind}`, kind, color: "#8899aa", x: 0, z: 0, rot: 0, layer: 0, ...extra });

  const bad = KINDS.filter((k) => { const o = outlineOf(mk(k)); return !(o.w > 0 && o.d > 0 && o.r >= 0 && o.r <= Math.min(o.w, o.d) / 2 + 1e-9); });
  check("每种物件都描得出合法的轮廓", bad.length === 0, bad.join(","));

  const ROUND: Kind[] = ["token", "disc", "pawn", "timer", "spinner", "hour"];
  const notRound = ROUND.filter((k) => { const o = outlineOf(mk(k)); return !close(o.w, o.d) || !close(o.r, o.w / 2); });
  check("真圆底盘收成正圆（r 等于短边一半）", notRound.length === 0, notRound.join(","));

  const card = outlineOf(mk("card", { card: { back: "plain" } }));
  check("牌描的是长宽不等的圆角矩形", card.w < card.d && card.r < card.d / 2 - 1e-6, JSON.stringify(card));

  const tri = outlineOf(mk("cube", { shape: "tri" }));
  const star = outlineOf(mk("cube", { shape: "star" }));
  check("三角片与五角星走多边形", tri.pts?.length === 3 && star.pts?.length === 10, `${tri.pts?.length}/${star.pts?.length}`);
  check("多边形顶点与建模同源", (() => {
    const p = piecePoints("star");
    return !!star.pts && star.pts.length === p.length && star.pts.every((q, i) => close(q[0], p[i][0]) && close(q[1], p[i][1]));
  })(), JSON.stringify(star.pts?.[0]));

  const big = outlineOf(mk("card", { card: { back: "plain" }, scale: 2 }));
  check("轮廓随体积缩放线性放大", close(big.w, card.w * 2) && close(big.d, card.d * 2) && close(big.r, card.r * 2), `${big.w}/${card.w}`);

  const zone = outlineOf(mk("zone", { zone: { w: 0.42, d: 0.26 } }));
  check("区域垫照用户填的长宽描", close(zone.w, 0.42) && close(zone.d, 0.26), JSON.stringify(zone));
  const stat = outlineOf(mk("stat", { stat: { w: 0.5, d: 0.3 } }));
  check("统计垫也照用户填的长宽描", close(stat.w, 0.5) && close(stat.d, 0.3), JSON.stringify(stat));

  const board = outlineOf(mk("board", { board: { layout: "grid", cols: 8, rows: 8, cell: 0.05, theme: "wood" } }));
  const bs = boardSize({ layout: "grid", cols: 8, rows: 8, cell: 0.05, theme: "wood" });
  check("棋盘框落在真实盘面上", close(board.w, bs.w) && close(board.d, bs.d), `${board.w}x${board.d}`);
  check("棋盘框比默认碰撞盒准", close(board.w, 0.436), `${board.w}`);

  const arrow = outlineOf(mk("arrow", { len: 0.6 }));
  check("箭头框长随 len 走", close(arrow.w, 0.6) && arrow.d < 0.03, JSON.stringify(arrow));

  const track = outlineOf(mk("track", { track: { n: 10, marks: [] } }));
  check("计分轨框按格数拉长", track.w > track.d * 3, JSON.stringify(track));
}

/**
 * 本批新增内容：平躺薄片子（三角片/五角星）、潮汐与塔罗两副内置牌、黑白棋开局、
 * 十面骰、方向键微调、骰盘摇一摇与「全部摆正」的动作门控。
 */
function batchChecks(): void {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

  // ——— 平躺薄片：形状表登记 → 归方块类 → 尺寸只从 PIECE_SIZE 一处来 ———
  const flats = ["tri", "star"];
  check("三角片与五角星都进了形状表", flats.every((s) => SHAPES.some((x) => x.id === s)));
  check("两种薄片都归方块一类", flats.every((s) => kindOfShape(s) === "cube"));
  for (const s of flats) {
    const act = addPieceAction(s, "#c0392b");
    const o = act.t === "add" ? act.o : null;
    check(`${s} 摆出来是带形状的方块`, !!o && o.kind === "cube" && o.shape === s);
    if (!o) continue;
    const p = pieceSize(s);
    const b = boxOf(o);
    check(`${s} 是平躺薄片：占桌远大于厚度`, p.r > p.h * 2, `r=${p.r} h=${p.h}`);
    check(`${s} 的碰撞盒照外接半径与片身厚度`, close(b.hx, p.r) && close(b.hz, p.r) && close(b.h, p.h), JSON.stringify(b));
    check(`${s} 的占桌半径与碰撞盒同源`, close(footprintOf(o), p.r), `${footprintOf(o)}`);
    const onTable = apply(starter("empty", "薄片桌"), act, "甲").o.find((x) => x.id === o.id);
    check(`${s} 上得了桌：shape 没被 tidy 抹掉`, onTable?.shape === s && onTable?.kind === "cube");
  }
  check("形状表里没有重名条目", new Set(SHAPES.map((s) => s.id)).size === SHAPES.length);

  // ——— 内置牌组：张数、卡背白名单、归一化不改写 ———
  const tarot = tarotMajor();
  check("大阿卡纳 22 张", tarot.length === 22, `${tarot.length} 张`);
  check("塔罗从 0 号愚者排到 XXI 世界", tarot[0].rank === "0" && tarot[0].label === "愚者" && tarot[21].rank === "XXI" && tarot[21].label === "世界");
  check("塔罗张张有牌意且没超长", tarot.every((c) => (c.text ?? "").length > 0 && (c.text ?? "").length <= CARD_TEXT_MAX));
  const tid = tideDeck();
  check("潮汐 44 张：四色 1—10 加四枚潮珠", tid.length === 44 && tid.filter((c) => c.rank).length === 40 && tid.filter((c) => !c.rank).length === 4, `${tid.length} 张`);
  check("潮汐与塔罗都登记进了卡背白名单", CARD_BACKS.includes("tide") && CARD_BACKS.includes("tarot"));
  check("白名单外的卡背退成纯色", fixCard({ back: "nope" })?.back === "plain");
  check("潮汐与塔罗过一遍归一化不改卡背", tid.every((c) => fixCard(c)?.back === "tide") && tarot.every((c) => fixCard(c)?.back === "tarot"));
  const emptyDecks = DECKS.filter((d) => d.make().length === 0).map((d) => d.id);
  check("牌组目录里每副牌都有货", emptyDecks.length === 0, emptyDecks.join(","));
  const strayBacks = DECKS.flatMap((d) => d.make()).filter((c) => !CARD_BACKS.includes(fixCard(c)?.back ?? ""));
  check("所有内置牌的卡背都在白名单里", strayBacks.length === 0, `${strayBacks.length} 张会退成纯色`);

  // ——— 黑白棋开局：中央四子对角同色，各占一格 ———
  const rev = starter("reversi", "黑白棋桌");
  const plate = rev.o.find((o) => o.kind === "board");
  const discs = rev.o.filter((o) => o.kind === "disc");
  check("黑白棋盘一做出来就锁网格", plate?.grid === true && plate.preset === "reversi");
  check("黑白棋开局四子、两色各二", discs.length === 4 && new Set(discs.map((d) => d.color)).size === 2, `${discs.length} 子`);
  check("黑白棋起手对角同色", discs.filter((d) => d.color === GO_COLORS[1]).length === 2 && discs.filter((d) => d.color === GO_COLORS[0]).length === 2);
  if (plate?.board) {
    const cells = discs.map((d) => snapOn(plate.board!, d.x - plate.x, d.z - plate.z).cell);
    check("四子各占一格且都在盘里", cells.every((c) => c !== null) && new Set(cells).size === 4, cells.join(","));
    const re = resetAction(plate);
    const laid = re ? apply(rev, re, "甲").o.filter((o) => o.kind === "disc") : [];
    check("摆回开局重新铺出四子", re !== null && laid.length === 4, `${laid.length} 子`);
  }

  // ——— 十面骰：比 d6 大一圈，点数由发起方算好且落在 1—10 ———
  const d10 = { id: "d10", kind: "die", color: "#e0e0e0", sides: 10, x: 0, z: 0, rot: 0, layer: 0 } as GameObject;
  const d6 = { ...d10, id: "d6", sides: 6 } as GameObject;
  check("d10 的碰撞盒比 d6 宽也高", boxOf(d10).hx > boxOf(d6).hx && boxOf(d10).h > boxOf(d6).h, `${JSON.stringify(boxOf(d10))} vs ${JSON.stringify(boxOf(d6))}`);
  let ten = apply(starter("empty", "骰桌"), { t: "add", o: d10 }, "甲");
  for (let i = 0; i < 200; i++) ten = apply(ten, rollAction([d10], ["d10"])!.action, "甲");
  const v10 = ten.o.find((o) => o.id === "d10")?.value ?? 0;
  check("连掷 200 次都在 1—10 之间", v10 >= 1 && v10 <= 10, `${v10}`);
  const dirty = apply(ten, { t: "roll", r: [{ id: "d10", value: 99 }] }, "甲");
  check("越界点数被夹回 10：归约端不认脏点数", dirty.o.find((o) => o.id === "d10")?.value === 10);

  // ——— 摇一摇：只掷盘里那几枚 ———
  check("没挑骰子就不出掷骰动作", rollAction([d6], []) === null && rollAction([d6], ["d6"]) !== null);
  const trayAct = addTrayAction("#8a5cc4");
  const trayObj = trayAct.t === "add" ? { ...trayAct.o, x: 0, z: 0 } : null;
  if (trayObj) {
    const inDie = { ...d6, id: "in", x: 0.03, z: 0.02 } as GameObject;
    const outDie = { ...d6, id: "out", x: 0.42, z: 0.42 } as GameObject;
    let shake = apply(starter("empty", "骰盘桌"), { t: "add", o: trayObj }, "甲");
    shake = apply(shake, { t: "add", o: inDie }, "甲");
    shake = apply(shake, { t: "add", o: outDie }, "甲");
    const tray = shake.o.find((o) => o.id === trayObj.id)!;
    const ids = diceInTray(shake, tray);
    check("摇一摇只收盘里的骰子", ids.length === 1 && ids[0] === "in", ids.join(","));
    const rolled = rollAction(shake.o, ids)?.action;
    check("摇一摇掷的就是盘内那一枚", rolled?.t === "roll" && rolled.r.length === 1 && rolled.r[0].id === "in");
  }

  // ——— 方向键微调：一步 1cm，棋盘不参与 ———
  const up = { id: "up", kind: "cube", x: 0.2, z: 0.2, rot: 0, layer: 0 } as GameObject;
  const nudged = nudgeAction([up], ["up"], 0.01, 0);
  check("微调一步就是 1cm", nudged?.t === "move" && close(nudged.m[0].x, 0.21) && close(nudged.m[0].z, 0.2), JSON.stringify(nudged));
  check("没选中东西时微调不出动作", nudgeAction([up], [], 0, 0.01) === null);
  check("单张棋盘挪不动：微调对它给 null", nudgeAction([{ ...up, id: "b", kind: "board", x: 0, z: 0 }], ["b"], 0.01, 0) === null);
  const moved = apply(apply(starter("empty", "微调桌"), { t: "add", o: up }, "甲"), nudgeAction([up], ["up"], 0, 0.01)!, "甲").o.find((o) => o.id === "up");
  check("微调真的挪了 1cm 且转角没被牵动", !!moved && close(moved.z, 0.21) && close(moved.x, 0.2) && moved.rot === 0, `${moved?.x},${moved?.z},${moved?.rot}`);

  // ——— 全部摆正：只挑歪着的那几件，一件都不歪就不出动作 ———
  const crooked = { id: "crooked", kind: "cube", x: -0.1, z: -0.1, rot: 45, layer: 0 } as GameObject;
  const leaner = { id: "lean", kind: "cube", x: -0.2, z: -0.2, rot: 0, tilt: 30, pin: true, layer: 1 } as GameObject;
  let crookedTable = apply(starter("empty", "摆正桌"), { t: "add", o: crooked }, "甲");
  crookedTable = apply(crookedTable, { t: "add", o: leaner }, "甲");
  crookedTable = apply(crookedTable, { t: "add", o: { ...up, id: "up2" } }, "甲");
  const sa = straightenAllAction(crookedTable.o);
  check("有歪的就给一次全场摆正", sa?.t === "rotReset", JSON.stringify(sa));
  check("摆正只管歪着的那几件", sa?.t === "rotReset" && sa.ids.length === 2 && !sa.ids.includes("up2"), sa?.t === "rotReset" ? sa.ids.join(",") : "");
  const fixed = apply(crookedTable, sa!, "甲");
  const both = fixed.o.filter((o) => o.id === "crooked" || o.id === "lean");
  check("摆正后转角归零、俯仰一起松开", both.length === 2 && both.every((o) => o.rot === 0 && o.tilt === undefined));
  check("一件都不歪时摆正返回 null：按钮就不摆", straightenAllAction(fixed.o) === null);
  check("摆正归 pose 权限，游戏模式不挡", sa !== null && actionPerm(sa) === "pose" && gameShut(sa) === false);
}

function copyImportChecks(): void {
  // ——— 导入「每张份数」：一张图解码一次铺成 N 份，N 份共用同一个卡面 key，字节只占一份 ———
  const one: CardSpec = { back: "plain", img: "ab12cd", ratio: 0.7, label: "重复牌" };
  const times = (n: number): CardSpec[] => { const list: CardSpec[] = []; for (let k = 0; k < n; k++) list.push({ ...one }); return list; };

  const loose = customCardsAction(times(100), "#c0392b");
  check("一张图解码一次 ×100 摊成 100 个散牌物件", loose?.t === "addMany" && loose.o.length === 100, loose?.t === "addMany" ? `${loose.o.length} 个` : String(loose?.t));
  const table = apply(starter("empty", "重复牌桌"), loose!, "甲");
  const mine = table.o.filter((o) => o.kind === "card" && o.card?.img === "ab12cd");
  check("100 张散牌都上得了桌，且共用同一个图 key", mine.length === 100 && new Set(mine.map((o) => o.card?.img)).size === 1, `${mine.length} 张`);
  check("每张仍是独立物件：抽走一张不动其余", new Set(mine.map((o) => o.id)).size === 100);
  check("过一遍收进来的消毒，图 key 不被抹掉", api.sanitize(table).o.filter((o) => o.card?.img === "ab12cd").length === 100);

  const piled = apply(starter("empty", "重复牌堆"), addPileAction(times(100), "#27ae60"), "甲").o.find((o) => o.kind === "pile");
  check("×100 收成一块牌堆就是一叠 100 张", piled?.pile?.length === 100, `${piled?.pile?.length}`);

  // 手填的份数先按当前这条路的容量夹住，再算能收几幅图：装不下的部分不该先解码几十秒
  for (const [want, per, images] of [[1, 1, 420], [37, 37, 11], [100, 100, 4], [500, MAX_OBJECTS, 1], [999, MAX_OBJECTS, 1]] as [number, number, number][]) {
    const p = clamp(want, COPY_MIN, MAX_OBJECTS);
    check(`散牌填 ${want} 份：每张 ${p} 份、先收 ${images} 幅图，总数不超桌面容量 ${MAX_OBJECTS}`, p === per && Math.floor(MAX_OBJECTS / p) === images && p * images <= MAX_OBJECTS, `每张=${p} room=${Math.floor(MAX_OBJECTS / p)}`);
  }
  for (const [want, per, images] of [[1, 1, 1000], [7, 7, 142], [100, 100, 10], [999, 999, 1]] as [number, number, number][]) {
    const p = clamp(want, COPY_MIN, MAX_PILE);
    check(`成堆填 ${want} 份：每张 ${p} 份、先收 ${images} 幅图，装得下一叠容量 ${MAX_PILE}`, p === per && Math.floor(MAX_PILE / p) === images && p * images <= MAX_PILE, `每张=${p} room=${Math.floor(MAX_PILE / p)}`);
  }
  check("手打的份数收口：夹进 1—999、小数抹平、打歪的当一张一份", fixCopies("37.9") === 37 && fixCopies("0") === COPY_MIN && fixCopies("-5") === COPY_MIN && fixCopies("99999") === COPY_MAX && fixCopies("") === COPY_MIN && fixCopies("abc") === COPY_MIN, `"37.9"→${fixCopies("37.9")} ""→${fixCopies("")}`);

  const over = customCardsAction(times(MAX_OBJECTS + 60), "#8e44ad");
  check("份数算漏了也夹得住：超容量的散牌收口到 420", over?.t === "addMany" && over.o.length === MAX_OBJECTS, over?.t === "addMany" ? `${over.o.length}` : "");
  const overPile = apply(starter("empty", "超载牌堆"), addPileAction(times(MAX_PILE + 60), "#8e44ad"), "甲").o.find((o) => o.kind === "pile");
  check("牌堆超单叠上限只留 1000 张", overPile?.pile?.length === MAX_PILE, `${overPile?.pile?.length}`);
  check("一张图都没收着就返回 null：按钮和提示都不摆", customCardsAction([], "#c0392b") === null);
}

/**
 * 《潮汐》：牌组构成、顺潮/叠潮的最优拆法、以及开局那一桌的张数守恒。
 * 算分是渲染层现算的纯函数，所以这里给的全是牌面本身，不碰 TableState。
 */
function tideChecks(): void {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const tide = tideDeck();
  const SUITS = ["珊瑚", "海藻", "贝壳", "深海"];
  // ——— 牌组：44 张 = 四色 1—10 各一张 + 4 张潮珠 ———
  check("潮汐整副 44 张", tide.length === 44, `${tide.length} 张`);
  check("四种花色各 10 张", SUITS.every((c) => tide.filter((x) => x.cat === c).length === 10), SUITS.map((c) => `${c}${tide.filter((x) => x.cat === c).length}`).join(","));
  check("每色的 1—10 各一张、一张不重", SUITS.every((c) => tide.filter((x) => x.cat === c).map((x) => Number(x.rank)).sort((a, b) => a - b).join(",") === "1,2,3,4,5,6,7,8,9,10"));
  const pearls = tide.filter((c) => c.cat === "潮珠");
  check("潮珠 4 张：有叫法但没有数字，算分端就靠这一点认它", pearls.length === 4 && pearls.every((c) => !c.rank && c.label === "潮珠"));
  check("潮汐每张都带一句牌面话且没超长", tide.every((c) => (c.text ?? "").length > 0 && (c.text ?? "").length <= CARD_TEXT_MAX && (c.cat ?? "").length <= CARD_CAT_MAX && (c.label ?? "").length <= CARD_LABEL_MAX && (c.art ?? "").length <= CARD_ART_MAX));
  check("潮汐卡背登记进了白名单", CARD_BACKS.includes("tide"));
  check("过一遍归一化不改潮汐卡背", tide.every((c) => fixCard(c)?.back === "tide"));
  check("牌组目录里的潮汐与工厂那份是同一副", DECKS.find((d) => d.id === "tide")?.make().length === 44);

  const T = (suit: string, n: number): CardSpec => tide.find((c) => c.cat === suit && c.rank === String(n))!;
  const P = pearls[0];
  // ——— 规则书里那两道结算示例：答案都是 25 分 ———
  const exampleA = [T("海藻", 4), T("海藻", 5), T("海藻", 6), T("海藻", 7), T("珊瑚", 8), T("海藻", 8), T("深海", 8), T("贝壳", 2), T("深海", 5), P, T("珊瑚", 10)];
  const sa = tideScore(exampleA);
  check("示例 A 的 11 张最高 25 分", sa.total === 25, describeTide(sa));
  check("示例 A 把潮珠落进叠潮凑成四个 8，而不是接长顺潮", sa.groups.some((g) => g.kind === "set" && g.len === 4 && g.num === 8), describeTide(sa));
  const exampleB = [T("深海", 2), T("深海", 3), T("深海", 4), T("深海", 5), T("深海", 6), T("珊瑚", 6), T("贝壳", 6), P];
  const sb = tideScore(exampleB);
  check("示例 B 的 8 张最高 25 分：贪长顺潮只有 15", sb.total === 25, describeTide(sb));
  check("示例 B 里澜6 只进一个组", sb.groups.some((g) => g.kind === "set" && g.len === 4 && g.num === 6) && sb.groups.some((g) => g.kind === "run" && g.len === 4), describeTide(sb));
  check("拆出来的组之间不重叠：一张牌不会被算两次", sa.groups.every((g, i) => sa.groups.slice(i + 1).every((h) => g.cards.every((c) => !h.cards.includes(c)))));
  // ——— 计分公式与四条限制 ———
  check("顺潮 3 张得 6、4 张得 9、5 张得 12", tideScore([T("贝壳", 1), T("贝壳", 2), T("贝壳", 3)]).total === 6 && tideScore([T("贝壳", 1), T("贝壳", 2), T("贝壳", 3), T("贝壳", 4)]).total === 9 && tideScore([T("贝壳", 1), T("贝壳", 2), T("贝壳", 3), T("贝壳", 4), T("贝壳", 5)]).total === 12);
  check("叠潮 3 张得 12、4 张得 16", tideScore([T("贝壳", 7), T("海藻", 7), T("深海", 7)]).total === 12 && tideScore([T("贝壳", 7), T("海藻", 7), T("深海", 7), T("珊瑚", 7)]).total === 16);
  check("两张凑不出组：一分没有", tideScore([T("珊瑚", 3), T("珊瑚", 4), T("贝壳", 9)]).total === 0, describeTide(tideScore([T("珊瑚", 3), T("珊瑚", 4), T("贝壳", 9)])));
  check("1 与 10 不算相连：绕不回牌面两端", tideScore([T("珊瑚", 10), T("珊瑚", 1), T("珊瑚", 2), T("珊瑚", 3)]).total === 6, describeTide(tideScore([T("珊瑚", 10), T("珊瑚", 1), T("珊瑚", 2), T("珊瑚", 3)])));
  check("一个组合至多一张潮珠：第二张潮珠换不来更长的顺潮", tideScore([T("珊瑚", 1), T("珊瑚", 3), P, pearls[1]]).total === 6, describeTide(tideScore([T("珊瑚", 1), T("珊瑚", 3), P, pearls[1]])));
  check("落单的张数要说得出：散牌不计分但别忘了报", sa.loose === 3, `${sa.loose} 张散牌`);
  check("认牌：非潮汐牌一律不进算分", tideCardOf({ back: "poker", rank: "5" }) === null && tideCardOf(undefined) === null && tideCardOf(T("珊瑚", 5))?.num === 5);
  check("混进一张别的牌也只数潮汐那几张", tideScore([T("珊瑚", 1), T("珊瑚", 2), T("珊瑚", 3), { back: "classic", rank: "A" }]).total === 6);
  check("一堆牌里有没有潮汐牌：整副扑克给 false", isTideCards(tide) && !isTideCards(poker54()));
  check(`超过 ${TIDE_CALC_MAX} 张不硬算：诚实说算不动而不是卡住一帧`, tideScore(tide.slice(0, TIDE_CALC_MAX + 1)).tooMany === true);
  check("卡在上限那一档照常给答案", tideScore(tide.slice(0, TIDE_CALC_MAX)).tooMany === false);
  check("空手不报错：0 张就是一条组都没有", tideScore([]).total === 0 && tideScore([]).groups.length === 0);

  // ——— 开局那一桌：44 张一张不少，潮道摊在垫面上 ———
  const table = starter("tide", "潮汐桌");
  const stock = table.o.find((o) => o.kind === "pile" && o.label !== "沉潮")!;
  const sink = table.o.find((o) => o.kind === "pile" && o.label === "沉潮")!;
  const pad = table.o.find((o) => o.label === "潮道")!;
  const lanes = table.o.filter((o) => o.kind === "card");
  const keeps = table.o.filter((o) => o.kind === "zone" && !fixZone(o.zone).pad);
  const book = table.o.find((o) => o.kind === "book")!;
  check("潮库 40 张扣着、沉潮空着、潮道摊 4 张正面", stock.pile?.length === 40 && stock.faceUp === false && sink.pile?.length === 0 && lanes.length === 4 && lanes.every((c) => c.faceUp === true), `${stock.pile?.length}/${lanes.length}`);
  check("40 + 4 就是整副：开局一张牌都不凭空多也不丢", (stock.pile?.length ?? 0) + lanes.length === tide.length);
  const laneXs = lanes.map((c) => c.x).sort((a, b) => a - b);
  check("潮道四张都落在同一块垫面上", lanes.every((c) => inZone(pad, c.x, c.z)));
  check("潮道四张横排不叠牌：间距大过一张牌的宽", laneXs.every((x, i) => i === 0 || x - laneXs[i - 1] > 0.063), laneXs.map((x) => x.toFixed(3)).join(","));
  check("潮道四张全在牌组里：不是临时造的牌", lanes.every((c) => tide.some((t) => t.cat === c.card?.cat && t.rank === c.card?.rank && t.label === c.card?.label)));
  check("四块收藏区按座位铺开，各 46×34cm", keeps.length === 4 && keeps.every((z) => close(fixZone(z.zone).w, 0.46) && close(fixZone(z.zone).d, 0.34)));
  check("收藏区都没锁人：开局谁也不占着谁的", keeps.every((z) => !z.priv && !z.owner));
  const pages = fixBook(book.book).pages;
  check("规则书六页、每页不超 420 字", pages.length === 6 && pages.every((p) => p.length > 0 && p.length <= BOOK_CHARS), `${pages.length} 页`);
  check("规则书里写着计分那条：顺潮与叠潮的算法在书上", pages.some((p) => p.includes("顺潮") && p.includes("叠潮") && p.includes("潮珠")));
  check("潮汐开局过一遍服务端形状校验：一张都不该被拒", api.sanitize(table).o.length === table.o.length && api.sanitize(table).o.filter((o) => o.card || Array.isArray(o.pile)).length === table.o.filter((o) => o.card || Array.isArray(o.pile)).length);

  // ——— 游玩适配：发牌、摸牌这些既有动作对潮汐牌组照常工作 ———
  const deal = dealAction(table.o, table, stock.id, 3);
  check("扣着的潮库照样发得出牌", deal !== null);
  if (deal) {
    const dealt = apply(table, deal, "甲");
    const now = dealt.o.find((o) => o.id === stock.id);
    const onTable = dealt.o.filter((o) => o.kind === "card");
    check("按座位发一轮：潮库少 6 张、桌上多 6 张扣牌", (now?.pile?.length ?? 0) === 34 && onTable.length === 10 && onTable.filter((c) => !c.faceUp).length === 6, `${now?.pile?.length}/${onTable.length}`);
    check("发出来的牌还是潮汐牌：算分端认得", isTideCards(onTable.map((o) => o.card)));
    const spread = apply(dealt, shuffleAction(dealt.o, stock.id)!, "甲").o.find((o) => o.id === stock.id);
    check("洗完潮库还是 34 张：洗牌不增减", (spread?.pile?.length ?? 0) === 34);
  }
}

/**
 * 可选牌组包：站点根目录下那个 JSON 读进来能玩，读不到就当没有。
 * 这里只测「坏数据怎么被丢掉」——牌包不许带新 kind、新卡背或新字段。
 */
function packChecks(): void {
  const ace = { back: "poker", rank: "A", suit: "s" } as CardSpec;
  check("整包不是数组就作废", parsePacks(null).length === 0 && parsePacks({ id: "a" }).length === 0 && parsePacks("x").length === 0);
  check("一条合格的牌包能读出一个牌堆", parsePacks([{ id: "demo", name: "示例", cards: [ace] }]).length === 1);
  check("缺 id、缺名字、cards 不是数组都丢掉这一条", parsePacks([{ name: "没 id", cards: [ace] }, { id: "no-cards", name: "没牌" }, { id: "bad", name: "牌不是数组", cards: 3 }]).length === 0);
  check("空牌堆的包不占一行", parsePacks([{ id: "e", name: "空", cards: [] }]).length === 0);
  check("同 id 的包只留前一份", parsePacks([{ id: "dup", name: "甲", cards: [ace] }, { id: "dup", name: "乙", cards: [ace] }]).map((p) => p.name).join(",") === "甲");
  check("非对象条目跳过而不是抛", parsePacks([null, 1, "s", { id: "ok", name: "行", cards: [ace] }]).length === 1);
  const weird = parsePacks([{ id: "w", name: "怪卡背", cards: [{ back: "nope", label: "牌" }, ace] }])[0];
  check("包里的非法卡背过归一化退成纯色", weird?.cards[0]?.back === "plain", weird?.cards[0]?.back ?? "无");
  check("牌堆里坏掉的单张被丢掉", parsePacks([{ id: "p", name: "混", cards: [ace, null, 7] }])[0]?.cards.length === 1);
  check("没写说明的包按张数补一行", parsePacks([{ id: "h", name: "行", cards: [ace, ace] }])[0]?.hint === "2 张");
  const long = parsePacks([{ id: "l".repeat(40), name: "一".repeat(40), hint: "一".repeat(80), cards: [ace] }])[0];
  check("包名 id 与说明超长会截断", long?.id.length === 24 && long?.name.length === 20 && long?.hint.length === 40, `${long?.id.length}/${long?.name.length}/${long?.hint.length}`);
  const fat = parsePacks([{ id: "f", name: "肥", cards: Array.from({ length: 900 }, () => ace) }])[0];
  check("一副牌包最多 500 张", fat?.cards.length === 500, `${fat?.cards.length} 张`);
  const lots = parsePacks(Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, name: `包${i}`, cards: [ace] })));
  check("一次最多读 24 副牌包", lots.length === 24, `${lots.length} 副`);
  check("内置牌组与牌包共用一份卡背白名单", [...DECKS.flatMap((d) => d.make()), ...lots.flatMap((p) => p.cards)].every((c) => CARD_BACKS.includes(c.back ?? "classic")));
}

function report(): void {
  console.log(out.join("\n"));
  console.log(out.some((l) => l.startsWith("FAIL")) ? "\n有用例失败" : "\n全部通过");
}
romWireChecks();
cacheChecks();
presetChecks();
xiangqiChecks();
gridBoardChecks();
xiangqiTakeChecks();
xiangqiPointChecks();
judgeChecks();
accessoryChecks();
rangeChecks();
gramChecks();
mp3Checks();
riffleChecks();
cutSplitChecks();
gameModeChecks();
paletteChecks();
counterChecks();
trayChecks();
tabletChecks();
outlineChecks();
batchChecks();
copyImportChecks();
tideChecks();
packChecks();
zipChecks()
  .catch((error: unknown) => check("压缩包用例跑挂了", false, String((error as Error)?.message ?? error)))
  .finally(report);

