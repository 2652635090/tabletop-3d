import { ARROW_MAX, ARROW_MIN, AUDIO_KEY, BOARD_HOME, CARD_BACKS, COUNTER_STEP_MAX, COUNTER_STEP_MIN, COUNTER_V_MAX, COUNTER_V_MIN, GRAM_DUR_MAX, HOUR_MAX, HOUR_MIN, LAYER_MAX, MP3_BY_MAX, MP3_DUR_MAX, PALETTE, SCALE_MAX, SCALE_MIN, SLOT_MAX, SLOT_MIN, TABLE, TRACK_MARK_MAX, TRACK_MAX, TRACK_MIN, TABLET_PAGE_MAX, TABLET_POS_MAX, TABLET_REV_MAX, cardText, clamp, clampTilt, counterSpot, fixBackImg, fixBook, fixCard, fixCounter, fixGram, fixHour, fixMp3, fixShield, fixSlot, fixSpinner, fixStat, fixTablet, fixTrack, fixTray, fixZone, gridable, gridHug, inTable, isContainer, isMat, isWebUrl, lockable, mmss, onBoard, pinnable, presetOf, restInTable, scaleOf, timerOf, uid } from "./catalog";
import { anchorOf, resolvePlacement, restDrop, type Anchor } from "./physics";
import { resolveDrop, capturesOf } from "./landing";
import { bannedLanding, verdict } from "./rules";
import { calcPress, evalCalc, fixCalcExpr, formatCalc } from "./calc";
import { tabletHost } from "./tablet";
import type { Action, CardSpec, CounterSpec, GameObject, LogEntry, LogKind, Player, TableState, TrackMark } from "./types";

export const MAX_OBJECTS = 420;
export const MAX_LOG = 80;
/** 一整叠牌的上限：原来卡在 120，几百张导入的卡一叠装不下；这里只留一道防脏数据的硬闸，真正收口的是整桌状态体积 */
export const MAX_PILE = 1000;
/** 一次分堆最多生成几叠：按花色分也才四叠，卡在这里只防脏动作 */
export const SPLIT_MAX_PILES = 40;

export function emptyState(name = "未命名牌桌"): TableState {
  return { name, o: [], players: [], turn: 0, step: 1, log: [] };
}

export function logLine(by: string, kind: LogKind, text: string, color?: string): LogEntry {
  return { id: uid("l"), at: Date.now(), by, kind, text, color };
}

/** 纯函数归约：客户端乐观计算与冲突重放共用，日志也在归约内生成以保证各端一致。 */
export function apply(state: TableState, action: Action, by: string, actorColor?: string): TableState {
  const next: TableState = { ...state, o: state.o.slice(), log: state.log.slice() };
  const push = (kind: LogKind, text: string) => {
    next.log = [...next.log, logLine(by, kind, text, actorColor)].slice(-MAX_LOG);
  };
  const find = (id: string) => next.o.find((o) => o.id === id);
  const patch = (id: string, changes: Partial<GameObject>) => {
    const i = next.o.findIndex((o) => o.id === id);
    if (i >= 0) next.o[i] = { ...next.o[i], ...changes };
  };
  /** 翻开正面时把效果文本记进日志，这正是“记录卡牌效果”要的东西 */
  const logEffect = (spec?: CardSpec) => {
    if (spec?.text) push("effect", effectLine(spec));
  };
  const faceUpOf = (o: GameObject) => o.faceUp !== false;
  const shownOf = (o: GameObject) => (o.kind === "card" ? o.card : faceUpOf(o) ? o.pile?.at(-1) : undefined);

  switch (action.t) {
    case "add": {
      if (next.o.length >= MAX_OBJECTS) return state;
      next.o.push(tidy(action.o));
      push("add", `放置了${describe(action.o)}`);
      break;
    }
    case "addMany": {
      const room = MAX_OBJECTS - next.o.length;
      if (room <= 0) return state;
      next.o.push(...action.o.slice(0, room).map(tidy));
      push("add", action.note ?? `放置了 ${Math.min(room, action.o.length)} 个物件`);
      break;
    }
    case "move": {
      let touched = 0;
      // 移动前的位置就是「支撑面变了」的那片地方：坐在上面的东西待会儿要跟着塌
      const seatsBefore = new Map<string, { x: number; z: number; a: Anchor }>();
      for (const m of action.m) {
        const o = find(m.id);
        if (!o) continue;
        seatsBefore.set(m.id, { x: o.x, z: o.z, a: anchorOf(o) });
      }
      for (const m of action.m) {
        const o = find(m.id);
        if (!o) continue;
        touched += 1;
        const at = restInTable(o, numOr(m.x, o.x), numOr(m.z, o.z));
        patch(m.id, {
          x: round(at.x),
          z: round(at.z),
          rot: m.rot === undefined ? o.rot : normDeg(m.rot),
          layer: m.layer === undefined ? o.layer : clampLayer(m.layer),
        });
      }
      if (touched === 0) return state;
      // 裁判先看落点：送将、照面、黑棋长连这类走完就犯规的，退回原位，别的照常落下。
      // 刚性平移（搬棋盘、拖区域垫）不是行棋，不管——棋盘自己一动格心全变，拦谁都是冤枉。
      const mv: { id: string; x: number; z: number }[] = [];
      const holds: { who: string; why: string }[] = [];
      for (const m of action.m) {
        const o = find(m.id);
        if (!o) continue;
        const why = action.rigid ? null : bannedLanding(state, next, o);
        if (!why) {
          mv.push({ id: m.id, x: o.x, z: o.z });
          continue;
        }
        const back = seatsBefore.get(m.id);
        if (back) patch(m.id, { x: round(back.x), z: round(back.z) });
        holds.push({ who: o.label ? `「${o.label}」` : describe(o), why });
      }
      if (!mv.length) {
        for (const h of holds) push("system", `${h.who}不能那么走：${h.why}`);
        break;
      }
      const anchors = mv.map((m) => seatsBefore.get(m.id)?.a).filter((a): a is Anchor => !!a);
      // 踩子即吃：落点正压在异色子那一格上，被吃的就算死了。先从场上撤掉再算挤开，
      // 不然它会当成还站着，把刚落下的这一枚又顶回原位。
      const taken = capturesOf(next, mv);
      if (taken.length) {
        const gone = new Set(taken.map((c) => c.prey.id));
        next.o = next.o.filter((o) => !gone.has(o.id));
      }
      // 落点挤到别人身上时按质量把对方推开，再让失去支撑的塌下来：各端从同一份 move 算出同一张桌子
      // 刚性平移（搬棋盘、拖区域垫）保持组内形状：一起搬的东西彼此不让路，免得松手时牌又乱跑
      next.o = resolvePlacement(next.o, mv.map((m) => m.id), anchors, !!action.rigid).o;
      // 迷你计数器的吸附账：拖到卡牌边上就吸上去，宿主自己动过就跟着重贴一条边。
      // 全挤开与塌落之后才算，拿到的是最终桌面，所以各端从同一份 move 算出同一处吸附。
      const wanted = new Map<string, { host: string | null; edge: 0 | 1 | 2 | 3 }>();
      for (const m of action.m) if (m.host !== undefined) wanted.set(m.id, { host: m.host, edge: m.edge ?? 0 });
      const movedIds = new Set(mv.map((m) => m.id));
      for (const [id, want] of wanted) {
        const c = find(id);
        if (!c || c.kind !== "counter") continue;
        movedIds.delete(id);
        const host = want.host ? find(want.host) : undefined;
        if (!host || host.kind !== "card" || host.hand) {
          // 拖离了卡牌就脱附，读数与步进照旧留着
          if (c.counter?.host) patch(id, { counter: fixCounter({ v: c.counter.v, step: c.counter.step }) });
          continue;
        }
        const at = counterSpot(host, want.edge);
        const land = restInTable(c, at.x, at.z);
        patch(id, { x: round(land.x), z: round(land.z), rot: at.rot, counter: fixCounter({ ...c.counter, host: host.id, edge: want.edge }) });
      }
      // 没被拖着走的计数器：宿主这一动就重新贴回它那条边，牌走了它不留在原地
      for (const c of next.o) {
        if (c.kind !== "counter" || !c.counter?.host || movedIds.has(c.id)) continue;
        if (!movedIds.has(c.counter.host)) continue;
        const host = find(c.counter.host);
        if (!host) continue;
        const at = counterSpot(host, c.counter.edge ?? 0);
        const land = restInTable(c, at.x, at.z);
        patch(c.id, { x: round(land.x), z: round(land.z), rot: at.rot });
      }
      if (touched === 1) {
        const o = find(mv[0].id)!;
        push("move", `移动了${describe(o)}`);
      } else push("move", `移动了 ${mv.length} 个物件`);
      for (const c of taken) push("remove", `吃掉了${c.prey.label ? `「${c.prey.label}」` : describe(c.prey)}`);
      for (const h of holds) push("system", `${h.who}不能那么走：${h.why}`);
      // 走完分出胜负就播报一句：绝杀、逼和都在这里，别等玩家自己盯棋盘琢磨
      const done = verdict(next);
      if (done && done !== verdict(state)) push("system", done);
      break;
    }
    case "remove": {
      const set = new Set(action.ids);
      const removed = next.o.filter((o) => set.has(o.id));
      if (!removed.length) return state;
      // 抽掉的垫板留下了坑：原本坐在它上面的那些照同一套落点重新落一遍
      const anchors = removed.map((o) => anchorOf(o));
      next.o = next.o.filter((o) => !set.has(o.id));
      const sank = resolvePlacement(next.o, [], anchors);
      next.o = sank.o;
      push("remove", `收走了 ${removed.length} 个物件${sank.fell.length ? `，带塌了 ${sank.fell.length} 个` : ""}`);
      break;
    }
    case "flip": {
      const turned: GameObject[] = [];
      for (const id of action.ids) {
        const o = find(id);
        if (!o || (o.kind !== "card" && !Array.isArray(o.pile))) continue;
        const up = !faceUpOf(o);
        patch(id, { faceUp: up });
        turned.push(find(id)!);
      }
      if (!turned.length) return state;
      push("card", turned.length === 1 ? "翻动了卡牌" : `翻动了 ${turned.length} 处卡牌`);
      for (const o of turned) if (faceUpOf(o)) logEffect(shownOf(o));
      break;
    }
    case "turnCards": {
      const hit = action.ids.map((id) => find(id)).filter((o): o is GameObject => !!o);
      if (!hit.length) return state;
      for (const o of hit) patch(o.id, { faceUp: action.up });
      push("card", action.up ? "全部翻开" : "全部扣下");
      if (action.up) for (const id of action.ids) logEffect(shownOf(find(id)!));
      break;
    }
    case "layer": {
      for (const id of action.ids) {
        const o = find(id);
        if (!o) continue;
        const changes: Partial<GameObject> = { layer: clampLayer(o.layer + action.delta) };
        if (action.pin && pinnable(o)) changes.pin = true;
        patch(id, changes);
      }
      break;
    }
    case "scale": {
      let touched = 0;
      for (const id of action.ids) {
        const o = find(id);
        if (!o || o.kind === "board") continue;
        const next = clampScale(scaleOf(o) * action.factor);
        if (next === scaleOf(o)) continue;
        patch(id, { scale: next });
        touched += 1;
      }
      if (!touched) return state;
      break;
    }
    case "rot": {
      const pitch = numOr(action.pitch ?? 0, 0);
      for (const id of action.ids) {
        const o = find(id);
        if (!o) continue;
        const changes: Partial<GameObject> = { rot: normDeg(o.rot + action.delta) };
        // 斜靠是站不住的：调俯仰角顺手钉住，解锁时才会平躺落回去
        if (pitch && pinnable(o)) {
          changes.tilt = clampTilt((o.tilt ?? 0) + pitch);
          changes.pin = true;
        }
        patch(id, changes);
      }
      break;
    }
    case "rotReset": {
      const hit = action.ids.map((id) => find(id)).filter((o): o is GameObject => !!o && !!(o.rot || o.tilt));
      if (!hit.length) return state;
      for (const o of hit) patch(o.id, { rot: 0, tilt: undefined });
      push("move", hit.length === 1 ? "把转角归回 0°" : `把 ${hit.length} 个物件的转角归回 0°`);
      break;
    }
    case "pin": {
      const hit = action.ids.map((id) => find(id)).filter((o): o is GameObject => !!o && pinnable(o));
      if (!hit.length) return state;
      if (!action.on) {
        // 解锁即平躺落回：按支撑面找落点（只压住一角会滑开），再挤开一遍，各端算出同一个结果
        const anchors = hit.map((o) => anchorOf(o));
        for (const o of hit) {
          const flat = { ...o, tilt: undefined, pin: undefined };
          const at = restDrop(next.o, flat, o.x, o.z, 0);
          patch(o.id, { pin: undefined, tilt: undefined, x: at.x, z: at.z, layer: clampLayer(at.layer) });
        }
        next.o = resolvePlacement(next.o, hit.map((o) => o.id), anchors).o;
        push("move", hit.length === 1 ? "解锁了物件，任它落回桌面" : `解锁了 ${hit.length} 个物件，任它们落回桌面`);
        break;
      }
      for (const o of hit) patch(o.id, { pin: true });
      push("move", hit.length === 1 ? "锁定了物件高度" : `锁定了 ${hit.length} 个物件的高度`);
      break;
    }
    case "hand": {
      const playing = action.owner === null;
      // 只有牌进得了手：手牌条按卡面画，骰子之类一旦标上 hand 就从桌面消失又画不出来
      const ids = action.ids.filter((id) => {
        const o = find(id);
        return !!o && (playing || o.kind === "card");
      });
      if (!ids.length) return state;
      const anchors: Anchor[] = [];
      ids.forEach((id, i) => {
        const o = find(id)!;
        if (!playing) {
          // 牌被拿走后原来的位置就成了空坑：压在它下面的东西跟着塌
          anchors.push(anchorOf(o));
          patch(id, { owner: action.owner!.slice(0, 24), hand: true });
          return;
        }
        const at = action.at;
        const spot = action.spots?.[i];
        const spread = action.spread ?? 0.068;
        const where = spot ?? (at ? inTable(at.x, at.z) : { x: o.x, z: o.z });
        // 给了显式落点就照抄：这些坐标是 ops 里按区域排好的，再散开就和显示不一致了
        const x = spot ? where.x : Math.min(where.x + (i - (ids.length - 1) / 2) * spread, TABLE.w / 2 - 0.04);
        const z = spot ? where.z : Math.max(where.z, -TABLE.d / 2 + 0.06);
        const placed = restInTable(o, x, z);
        patch(id, {
          owner: undefined,
          hand: undefined,
          x: round(placed.x),
          z: round(placed.z),
          faceUp: action.faceUp ?? true,
        });
      });
      // 打出的牌同样是上桌：和拖动走同一套推开与塌落，区域格子步长留了余量所以只挤开压到人的那些
      next.o = (playing ? resolvePlacement(next.o, ids) : resolvePlacement(next.o, [], anchors)).o;
      push("card", playing ? `打出了 ${ids.length} 张手牌` : `把 ${ids.length} 张牌拿进手牌`);
      if (playing && action.faceUp !== false) ids.forEach((id) => logEffect(find(id)?.card));
      break;
    }
    case "timer": {
      const o = find(action.id);
      if (!o || o.kind !== "timer") return state;
      const t = timerOf({ duration: action.duration, left: action.left, endsAt: action.endsAt });
      patch(action.id, t);
      const running = t.endsAt !== null;
      push("timer", running
        ? `启动了 ${mmss(t.left)} 计时器`
        : o.endsAt != null
          ? `暂停了计时器（剩 ${mmss(t.left)}）`
          : t.left === t.duration
            ? `重置了计时器（${mmss(t.duration)}）`
            : `计时器调到了 ${mmss(t.left)}`);
      break;
    }
    case "arrow": {
      const o = find(action.id);
      if (!o || o.kind !== "arrow") return state;
      const len = Math.round(clamp(numOr(Number(action.len), o.len ?? 0.3), ARROW_MIN, ARROW_MAX) * 1000) / 1000;
      if (len === o.len) return state;
      patch(action.id, { len });
      break;
    }
    case "zone": {
      const o = find(action.id);
      if (!o || o.kind !== "zone") return state;
      const changes: Partial<GameObject> = {};
      // 垫面贴图：空串是撤掉图回到纯色，非法 key 由 fixZone 吞掉（只剩纯色垫）
      if (action.w !== undefined || action.d !== undefined || action.reach !== undefined || action.guard !== undefined || action.img !== undefined) {
        const cur = fixZone(o.zone);
        changes.zone = fixZone({
          ...cur,
          w: action.w === undefined ? cur.w : numOr(action.w, cur.w),
          d: action.d === undefined ? cur.d : numOr(action.d, cur.d),
          reach: action.reach === undefined ? cur.reach : numOr(action.reach, cur.reach),
          guard: action.guard === undefined ? cur.guard : numOr(action.guard, cur.guard),
          img: action.img === undefined ? cur.img : action.img,
        });
      }
      if (action.priv !== undefined) changes.priv = action.priv ? true : undefined;
      if (action.pref !== undefined) changes.pref = action.pref ? true : undefined;
      // 认领：换归属时可以顺手改名字（自动手牌区跟着主人走）
      if (action.owner !== undefined) {
        const owner = action.owner.slice(0, 24);
        changes.owner = owner || undefined;
        if (owner && action.label !== undefined) changes.label = String(action.label).slice(0, 40);
      }
      if (!Object.keys(changes).length) return state;
      patch(action.id, changes);
      if (action.pref === true) {
        // 首选落牌区同时只认一个：清掉别人身上的标记，免得两份"优先区域"打架
        for (const z of next.o) if (z.kind === "zone" && z.id !== action.id && z.pref) patch(z.id, { pref: undefined });
        push("system", `把「${find(action.id)?.label || "区域"}」设为自己的首选落牌区`);
      }
      if (action.priv !== undefined) {
        const o2 = find(action.id)!;
        push(action.priv ? "card" : "system", action.priv ? `开启了「${o2.label || "区域"}」的隐私模式` : `关闭了「${o2.label || "区域"}」的隐私模式`);
      }
      if (action.reach !== undefined || action.guard !== undefined) {
        const z = find(action.id)!.zone ?? fixZone(undefined);
        push("system", `把「${find(action.id)?.label || "区域"}」的攻防范围调成攻 ${z.reach} / 守 ${z.guard}`);
      }
      break;
    }
    case "stat": {
      const o = find(action.id);
      if (!o || o.kind !== "stat") return state;
      const changes: Partial<GameObject> = {};
      if (action.w !== undefined || action.d !== undefined) {
        const cur = o.stat ?? fixStat(undefined);
        const w = action.w === undefined ? cur.w : numOr(action.w, cur.w);
        const d = action.d === undefined ? cur.d : numOr(action.d, cur.d);
        changes.stat = fixStat({ w, d });
      }
      if (!Object.keys(changes).length) return state;
      patch(action.id, changes);
      break;
    }
    case "lock": {
      const o = find(action.id);
      // 上锁的是摊在桌面上的一整块：统计垫、桌垫、棋盘，锁住就点不中也拖不走
      if (!o || !lockable(o)) return state;
      const on = action.on === true;
      if ((o.lock === true) === on) return state;
      patch(action.id, { lock: on ? true : undefined });
      const what = o.kind === "stat" ? "统计垫" : isMat(o) ? "桌垫" : "棋盘";
      push("system", on ? `锁定了${what}，现在只能点它角上的解锁按钮` : `解锁了${what}`);
      break;
    }
    case "grid": {
      const o = find(action.id);
      if (!o || !gridable(o)) return state;
      const on = action.on === true;
      if ((o.grid === true) === on) return state;
      patch(action.id, { grid: on ? true : undefined });
      let aligned = 0;
      if (on) {
        // 按下开关顺手把盘上原有的子摆进格子：只翻标志不动桌面，看着就像没生效
        const raw = next.o.filter((x) => gridHug(x) && onBoard(o, x.x, x.z)).map((x) => ({ id: x.id, x: x.x, z: x.z }));
        for (const m of resolveDrop(next, raw)) {
          const cur = find(m.id);
          if (!cur || (cur.x === m.x && cur.z === m.z && cur.layer === m.layer)) continue;
          aligned += 1;
          patch(m.id, { x: m.x, z: m.z, layer: m.layer });
        }
      }
      push("system", on ? `打开了${describe(o)}的网格锁定，摆齐 ${aligned} 枚棋子` : `关闭了${describe(o)}的网格锁定，棋子想摆哪摆哪`);
      break;
    }
    case "snap": {
      const o = find(action.id);
      // 吸附默认就是开的：只有关掉那一下才留个 false，盘上的子不会被强行挪进格子
      if (!o || !gridable(o)) return state;
      const on = action.on === true;
      if ((o.snap !== false) === on) return state;
      patch(action.id, { snap: on ? undefined : false });
      push("system", on ? `打开了${describe(o)}的自动吸附，落点吸进最近的格子` : `关闭了${describe(o)}的自动吸附，棋子可以骑在格缝上`);
      break;
    }
    case "mesh": {
      const o = find(action.id);
      if (!o || !gridable(o)) return state;
      const on = action.on === true;
      if ((o.mesh !== false) === on) return state;
      patch(action.id, { mesh: on ? undefined : false });
      push("system", on ? `显示了${describe(o)}的网格线` : `隐藏了${describe(o)}的网格线，吸附与锁定照常`);
      break;
    }
    case "slot": {
      const o = find(action.id);
      if (!o || o.kind !== "slot") return state;
      const cur = fixSlot(o.slot);
      const nextSlot = fixSlot({ n: numOr(action.n, cur.n) });
      if (nextSlot.n === cur.n) return state;
      patch(action.id, { slot: nextSlot });
      push("system", `把卡槽带改成 ${nextSlot.n} 格`);
      break;
    }
    case "spin": {
      const o = find(action.id);
      if (!o || o.kind !== "spinner") return state;
      const cur = fixSpinner(o.spinner);
      const value = Math.floor(numOr(action.value, -1));
      if (value < 0 || value >= cur.n) return state;
      // 起转时刻照抄动作里的：归约是纯函数，各端才算得出同一个落点与同一段动画
      const at = Number.isFinite(action.at) && action.at >= 1e12 && action.at <= 1e13 ? Math.round(action.at) : cur.at ?? 0;
      patch(action.id, { spinner: { ...cur, value, at: at || undefined } });
      push("roll", `转盘停在第 ${value + 1} 格`);
      break;
    }
    case "spinSet": {
      const o = find(action.id);
      if (!o || o.kind !== "spinner") return state;
      const cur = fixSpinner(o.spinner);
      const next = fixSpinner({ n: numOr(action.n, cur.n) });
      if (next.n === cur.n) return state;
      // 格子数一变，上一次的落点可能就落在不存在的格子里：抹掉重来
      delete next.value;
      delete next.at;
      patch(action.id, { spinner: next });
      push("system", `把转盘改成 ${next.n} 格`);
      break;
    }
    case "trackSet": {
      const o = find(action.id);
      if (!o || o.kind !== "track") return state;
      const cur = fixTrack(o.track);
      const n = Math.round(numOr(action.n, cur.n));
      if (n < TRACK_MIN || n > TRACK_MAX || n === cur.n) return state;
      // 轨道缩短不该把谁的棋子丢出界：越界的都夹回最后一格
      patch(action.id, { track: { n, marks: cur.marks.map((m) => ({ ...m, at: clampInt(m.at, 0, n - 1) })) } });
      push("system", `把计分轨改成 ${n} 格`);
      break;
    }
    case "mark": {
      const o = find(action.id);
      if (!o || o.kind !== "track") return state;
      const cur = fixTrack(o.track);
      const by = typeof action.by === "string" ? action.by.slice(0, 24) : "";
      if (!by) return state;
      const hit = cur.marks.find((m) => m.by === by);
      const delta = Math.round(numOr(action.delta, 0));
      // delta 可以是 0：那是「上场」，把棋子摆在起点格上，之后再用加减走
      if (!hit && cur.marks.length >= TRACK_MARK_MAX) return state;
      const mark: TrackMark = { by, at: clampInt((hit?.at ?? 0) + delta, 0, cur.n - 1) };
      const name = (typeof action.name === "string" ? action.name.trim() : "") || hit?.name;
      if (name) mark.name = name.slice(0, 20);
      const color = /^#[0-9a-fA-F]{6}$/.test(String(action.color ?? "")) ? String(action.color).toLowerCase() : hit?.color;
      if (color) mark.color = color;
      if (hit && hit.at === mark.at && hit.name === mark.name && hit.color === mark.color) return state;
      patch(action.id, { track: { ...cur, marks: [...cur.marks.filter((m) => m.by !== by), mark] } });
      push("system", hit ? `${mark.name || "有人"} 记到 ${mark.at + 1}` : `${mark.name || "有人"} 上了计分轨`);
      break;
    }
    case "markClear": {
      const o = find(action.id);
      if (!o || o.kind !== "track") return state;
      const cur = fixTrack(o.track);
      const by = typeof action.by === "string" ? action.by.slice(0, 24) : "";
      if (by) {
        const gone = cur.marks.find((m) => m.by === by);
        if (!gone) return state;
        patch(action.id, { track: { ...cur, marks: cur.marks.filter((m) => m.by !== by) } });
        push("system", `收走了${gone.name || "某人"}的计分棋子`);
        break;
      }
      if (!cur.marks.length || cur.marks.every((m) => m.at === 0)) return state;
      patch(action.id, { track: { ...cur, marks: cur.marks.map((m) => ({ ...m, at: 0 })) } });
      push("system", "把计分轨全部归零");
      break;
    }
    case "calcKey": {
      const o = find(action.id);
      if (!o || o.kind !== "calc") return state;
      const expr = calcPress(o.calc?.expr ?? "", action.key);
      if (expr === (o.calc?.expr ?? "")) return state;
      patch(action.id, { calc: { expr } });
      if (action.key === "=") {
        const v = evalCalc(expr);
        push("system", v === null ? "计算器算不出结果" : `用计算器算出 ${formatCalc(v)}`);
      }
      break;
    }
    case "shield": {
      const o = find(action.id);
      if (!o || o.kind !== "shield") return state;
      const cur = fixShield(o.shield);
      const changes: Partial<GameObject> = {};
      if (action.w !== undefined || action.h !== undefined) {
        const w = action.w === undefined ? cur.w : numOr(action.w, cur.w);
        const h = action.h === undefined ? cur.h : numOr(action.h, cur.h);
        changes.shield = fixShield({ w, h });
      }
      // 认领牌屏：写上归属就只对主人亮屏前那块；null 是撤掉归属，退回一块纯挡板
      if (action.owner !== undefined) {
        const owner = action.owner === null ? "" : String(action.owner).slice(0, 24);
        changes.owner = owner || undefined;
        if (owner && action.label !== undefined) changes.label = String(action.label).slice(0, 40);
      }
      if (!Object.keys(changes).length) return state;
      patch(action.id, changes);
      if (action.owner !== undefined) {
        const who = find(action.id)?.label || "牌屏";
        push("system", changes.owner ? `认领了「${who}」，屏前只有他自己看得见` : `放开了「${who}」的归属，它只是一块挡板`);
      }
      break;
    }
    case "hour": {
      const o = find(action.id);
      if (!o || o.kind !== "hour") return state;
      const cur = fixHour(o.hour);
      // 起算时刻照抄动作里的：归约是纯函数，各端才算得出同一片沙面
      const mins = Math.round(numOr(action.mins, cur.mins));
      if (mins < HOUR_MIN || mins > HOUR_MAX) return state;
      const at = Number.isFinite(action.at ?? NaN) && (action.at as number) >= 1e12 && (action.at as number) <= 1e13
        ? Math.round(action.at as number)
        : null;
      if (cur.mins === mins && cur.at === at) return state;
      patch(action.id, { hour: { mins, at } });
      push("timer", at === null
        ? (cur.at === null ? `把沙漏调成了 ${mins} 分钟` : `按停了沙漏`)
        : `翻过了沙漏，${mins} 分钟`);
      break;
    }
    case "book": {
      const o = find(action.id);
      if (!o || o.kind !== "book") return state;
      const cur = fixBook(o.book);
      const next = action.pages === undefined ? cur : fixBook({ pages: action.pages, page: action.page ?? cur.page });
      const page = action.page === undefined ? next.page : clampInt(Math.round(numOr(action.page, next.page)), 0, next.pages.length - 1);
      if (page === cur.page && next.pages.length === cur.pages.length && next.pages.every((p, i) => p === cur.pages[i])) return state;
      patch(action.id, { book: { ...next, page } });
      if (action.pages !== undefined && action.pages.length !== cur.pages.length)
        push("system", `把规则书改成 ${next.pages.length} 页`);
      else push("system", `翻到规则书第 ${page + 1} 页`);
      break;
    }
    case "gram": {
      const o = find(action.id);
      if (!o || o.kind !== "gram") return state;
      const cur = fixGram(o.gram);
      // 换片一律从头起：旧片唱到哪儿跟新片没关系，接着上次的进度放新曲子是怪事
      const clip = action.clip === undefined ? cur.clip : typeof action.clip === "string" && AUDIO_KEY.test(action.clip) ? action.clip : null;
      const swapping = action.clip !== undefined && action.clip !== cur.clip;
      const dur = action.dur === undefined ? (swapping ? 0 : cur.dur) : clamp(Math.round(numOr(action.dur, 0) * 1000) / 1000, 0, GRAM_DUR_MAX);
      const pos = clamp(action.pos === undefined ? (swapping ? 0 : cur.pos) : Math.round(numOr(action.pos, 0) * 1000) / 1000, 0, dur);
      const playing = action.playing === undefined ? cur.playing : action.playing === true;
      const rawAt = action.at === undefined ? cur.at : action.at;
      const gm = fixGram({
        clip,
        name: action.name === undefined ? cur.name : String(action.name),
        dur,
        pos,
        playing,
        at: playing && typeof rawAt === "number" && Number.isFinite(rawAt) ? Math.round(rawAt) : null,
        vol: action.vol === undefined ? cur.vol : numOr(action.vol, cur.vol),
        loop: action.loop === undefined ? cur.loop : action.loop === true,
      });
      if (JSON.stringify(gm) === JSON.stringify(cur)) return state;
      patch(action.id, { gram: gm });
      const title = gm.name ? `「${gm.name}」` : "";
      if (clip !== cur.clip) push("system", `给唱片机换了张唱片${clip ? title : "（空机）"}`);
      else if (gm.playing !== cur.playing) push("system", gm.playing ? `放起了唱片${title}` : `按住了唱片（${gm.pos.toFixed(1)} 秒处）`);
      else if (gm.pos !== cur.pos) push("system", `把唱片拨到 ${gm.pos.toFixed(1)} 秒`);
      else if (gm.vol !== cur.vol) push("system", `拧了拧唱片机的音量（${Math.round(gm.vol * 100)}%）`);
      else if (gm.loop !== cur.loop) push("system", gm.loop ? "给唱片上了循环" : "关掉循环，唱完就停");
      else if (gm.name !== cur.name) push("system", `改了唱片的名字${title}`);
      break;
    }
    case "mp3": {
      const o = find(action.id);
      if (!o || o.kind !== "mp3") return state;
      const cur = fixMp3(o.mp3);
      const clip = action.clip === undefined ? cur.clip : typeof action.clip === "string" && AUDIO_KEY.test(action.clip) ? action.clip : null;
      const swapping = action.clip !== undefined && action.clip !== cur.clip;
      const dur = action.dur === undefined ? (swapping ? 0 : cur.dur) : clamp(Math.round(numOr(action.dur, 0) * 1000) / 1000, 0, MP3_DUR_MAX);
      const pos = clamp(action.pos === undefined ? (swapping ? 0 : cur.pos) : Math.round(numOr(action.pos, 0) * 1000) / 1000, 0, dur);
      const rawAt = action.at === undefined ? cur.at : action.at;
      // 归属只在摆下这台机器那一刻定一次：之后谁也不能把自己的名字挪到别人那台上
      const by = cur.by || (typeof action.by === "string" ? action.by.trim().slice(0, MP3_BY_MAX) : "");
      const shared = action.shared === undefined ? cur.shared : action.shared === true;
      const m = fixMp3({
        clip,
        name: action.name === undefined ? cur.name : String(action.name),
        dur,
        pos,
        by,
        shared,
        playing: action.playing === undefined ? cur.playing : action.playing === true,
        at: (action.playing === undefined ? cur.playing : action.playing === true) && typeof rawAt === "number" && Number.isFinite(rawAt) ? Math.round(rawAt) : null,
        vol: action.vol === undefined ? cur.vol : numOr(action.vol, cur.vol),
        loop: action.loop === undefined ? cur.loop : action.loop === true,
      });
      if (JSON.stringify(m) === JSON.stringify(cur)) return state;
      patch(action.id, { mp3: m });
      const title = m.name ? `「${m.name}」` : "";
      // 这台机器上的事说人话要说清是谁的：歌在谁电脑上，别人就只能等他自己共享
      if (clip !== cur.clip) push("system", `给随身听${clip ? `刻上了一首歌${title}` : "清空了"}`);
      else if (m.shared !== cur.shared) push("system", m.shared ? `把${title}共享给全桌一起听` : `把${title}收回了自己听`);
      else if (m.playing !== cur.playing) push("system", m.playing ? `全桌一起放起了${title}` : `全桌按住了${title}`);
      else if (m.pos !== cur.pos) push("system", `把${title}拨到 ${mmss(m.pos)}`);
      else if (m.vol !== cur.vol) push("system", `拧了拧随身听的音量（${Math.round(m.vol * 100)}%）`);
      else if (m.loop !== cur.loop) push("system", m.loop ? "给随身听上了循环" : "关掉循环，放完就停");
      else if (m.name !== cur.name) push("system", `改了随身听上那首歌的名字${title}`);
      break;
    }
    case "tablet": {
      const o = find(action.id);
      if (!o || o.kind !== "tablet") return state;
      const cur = fixTablet(o.tablet);
      // 换页一律从头起：上一页看到第几分钟，跟这一页没关系
      const url = action.url === undefined ? cur.url : isWebUrl(action.url) ? action.url : "";
      const swapping = action.url !== undefined && url !== cur.url;
      const page = action.page === undefined ? (swapping ? 1 : cur.page) : Math.round(clamp(numOr(action.page, 1), 1, TABLET_PAGE_MAX));
      const pos = clamp(action.pos === undefined ? (swapping ? 0 : cur.pos) : Math.round(numOr(action.pos, 0) * 1000) / 1000, 0, TABLET_POS_MAX);
      const playing = action.playing === undefined ? cur.playing : action.playing === true;
      const rawAt = action.at === undefined ? cur.at : action.at;
      const tb = fixTablet({
        url,
        page,
        pos,
        playing,
        at: playing && typeof rawAt === "number" && Number.isFinite(rawAt) ? Math.round(rawAt) : null,
        mute: action.mute === undefined ? cur.mute : action.mute === true,
        rev: action.rev === undefined ? cur.rev : Math.round(clamp(numOr(action.rev, 0), 0, TABLET_REV_MAX)),
      });
      if (JSON.stringify(tb) === JSON.stringify(cur)) return state;
      patch(action.id, { tablet: tb });
      const title = o.label ? `「${o.label}」` : "";
      if (tb.url !== cur.url) push("system", tb.url ? `给平板换上了 ${tabletHost(tb.url)}` : "平板关掉了页面");
      else if (tb.rev !== cur.rev) push("system", `重新载入了平板上的页面${title}`);
      else if (tb.playing !== cur.playing) push("system", tb.playing ? `放映开始了${title}` : `按下了暂停（${tb.pos.toFixed(1)} 秒处）`);
      else if (tb.pos !== cur.pos) push("system", `把片子拨到 ${tb.pos.toFixed(1)} 秒${title}`);
      else if (tb.page !== cur.page) push("system", `平板切到第 ${tb.page} 集`);
      else if (tb.mute !== cur.mute) push("system", tb.mute ? "平板静音了" : "平板出了声");
      break;
    }
    case "pileSet": {
      const o = find(action.id);
      if (!o || !Array.isArray(o.pile)) return state;
      const cards = action.cards.map(fixCard).filter((c): c is CardSpec => !!c).slice(0, MAX_PILE);
      patch(action.id, { pile: cards });
      push("card", action.note ?? `整理了${describe(o)}（${cards.length} 张）`);
      break;
    }
    case "cardSet": {
      const o = find(action.id);
      const card = fixCard(action.card);
      if (!o || !card || o.kind !== "card") return state;
      patch(action.id, { card });
      push("card", `编辑了卡牌「${cardText(card) || card.label || "空白卡"}」`);
      break;
    }
    case "backSet": {
      const img = action.img === null ? undefined : fixBackImg(action.img);
      const style = typeof action.style === "string" && CARD_BACKS.includes(action.style) ? action.style : "";
      const hit = action.ids.map((id) => find(id)).filter((o): o is GameObject => !!o);
      if (!hit.length) return state;
      // 内置纹样要对得上：单张牌改自己，容器把整叠的 back 统一刷过去
      const styled = (o: GameObject) => {
        if (!style) return true;
        if (o.card && o.card.back !== style) return false;
        return !(o.pile ?? []).some((c) => c.back !== style);
      };
      const same = (o: GameObject) => (o.backImg ? fixBackImg(o.backImg) : undefined) === img && styled(o);
      // 一处都没变过就不出日志：重复点同一个卡背不该刷屏
      if (hit.every(same)) return state;
      let n = 0;
      for (const o of hit) {
        if (same(o)) continue;
        const changes: Partial<GameObject> = { backImg: img };
        if (style && o.card) changes.card = { ...o.card, back: style };
        if (style && Array.isArray(o.pile)) changes.pile = o.pile.map((c) => ({ ...c, back: style }));
        patch(o.id, changes);
        n += 1;
      }
      push("card", img
        ? n === 1 ? "换上了自定义卡背" : `给 ${n} 处换上了自定义卡背`
        : style
          ? n === 1 ? "换上了内置卡背" : `给 ${n} 处统一换上了内置卡背`
          : n === 1 ? "恢复了内置卡背" : `给 ${n} 处恢复了内置卡背`);
      break;
    }
    case "split": {
      const set = new Set(action.ids);
      const loose = next.o.filter((o) => set.has(o.id) && o.kind === "card" && !o.hand);
      if (!loose.length || !action.piles.length) return state;
      if (next.o.length - loose.length + action.piles.length > MAX_OBJECTS) return state;
      const added = action.piles.slice(0, SPLIT_MAX_PILES).map(tidy).filter((o) => Array.isArray(o.pile) && o.pile.length);
      if (!added.length) return state;
      next.o = next.o.filter((o) => !set.has(o.id)).concat(added);
      push("card", `把 ${loose.length} 张散牌按牌面分成 ${added.length} 叠`);
      break;
    }
    case "effect": {
      const o = find(action.id);
      if (!o) return state;
      const spec = o.kind === "card" ? o.card : o.pile?.[action.index ?? (o.pile?.length ?? 0) - 1];
      if (!spec) return state;
      push("effect", spec.text ? effectLine(spec) : `${cardText(spec) || spec.label || "卡牌"}：还没写效果`);
      break;
    }
    case "label": {
      if (!find(action.id)) return state;
      patch(action.id, { label: action.label.slice(0, 40) });
      break;
    }
    case "color": {
      if (!find(action.id)) return state;
      patch(action.id, { color: safeColor(action.color) });
      break;
    }
    case "count": {
      const o = find(action.id);
      if (!o) return state;
      const v = clampInt((o.count ?? 0) + action.delta, 0, 9999);
      patch(action.id, { count: v });
      break;
    }
    case "counter": {
      const o = find(action.id);
      if (!o || o.kind !== "counter") return state;
      const c = o.counter ?? fixCounter(undefined);
      // 只改读数/步进时把吸附原样留着：spec 从当前值起步，不然后面 clean 会把 host 抹掉，一按 ± 就脱附
      const spec: CounterSpec = { v: c.v, step: c.step };
      if (c.host) { spec.host = c.host; spec.edge = c.edge ?? 0; }
      if (action.delta !== undefined) spec.v = clampInt(c.v + Math.round(action.delta), COUNTER_V_MIN, COUNTER_V_MAX);
      if (action.v !== undefined) spec.v = clampInt(Math.round(action.v), COUNTER_V_MIN, COUNTER_V_MAX);
      if (action.step !== undefined) spec.step = clampInt(Math.round(action.step), COUNTER_STEP_MIN, COUNTER_STEP_MAX);
      // 换宿主或换边都要顺手把位置贴到新那条边上，不然读数对而位置漂
      let rehost = false;
      if (action.host !== undefined) {
        const host = action.host === null ? undefined : find(action.host);
        if (host && host.kind === "card" && !host.hand) {
          spec.host = host.id;
          spec.edge = action.edge ?? c.edge ?? 0;
          rehost = true;
        } else {
          // 拖离卡牌 / 宿主已不是桌上的散牌：脱附，读数与步进留着
          delete spec.host;
          delete spec.edge;
          if (c.host) rehost = true;
        }
      } else if (action.edge !== undefined && c.host) {
        spec.edge = action.edge;
        rehost = true;
      }
      const clean = fixCounter(spec);
      if (!rehost && clean.v === c.v && clean.step === c.step) return state;
      patch(action.id, { counter: clean });
      if (rehost && clean.host) {
        const host = find(clean.host)!;
        const at = counterSpot(host, clean.edge ?? 0);
        const land = restInTable(o, at.x, at.z);
        patch(action.id, { x: round(land.x), z: round(land.z), rot: at.rot });
      }
      break;
    }
    case "tray": {
      const o = find(action.id);
      if (!o || o.kind !== "tray") return state;
      const cur = o.tray ?? fixTray(undefined);
      if (action.w === undefined && action.d === undefined) return state;
      const w = action.w === undefined ? cur.w : numOr(action.w, cur.w);
      const d = action.d === undefined ? cur.d : numOr(action.d, cur.d);
      const next = fixTray({ w, d });
      if (next.w === cur.w && next.d === cur.d) return state;
      patch(action.id, { tray: next });
      break;
    }
    case "roll": {
      const parts: string[] = [];
      for (const r of action.r) {
        const o = find(r.id);
        if (!o || o.kind !== "die") continue;
        const sides = o.sides ?? 6;
        const v = clampInt(r.value, 1, sides);
        patch(r.id, { value: v });
        parts.push(`${sides}面:${v}`);
      }
      if (!parts.length) return state;
      const total = action.r.reduce((s, r) => s + r.value, 0);
      push("roll", `掷出 ${parts.join("  ")}${action.r.length > 1 ? ` · 合计 ${total}` : ""}`);
      break;
    }
    case "draw": {
      const pile = find(action.id);
      if (!pile?.pile?.length) return state;
      const rest = removeFrom(pile.pile, action.to.map((c) => c.card));
      patch(action.id, { pile: rest });
      const added = action.to.slice(0, Math.max(0, MAX_OBJECTS - next.o.length)).map(tidy);
      next.o = next.o.concat(added);
      push("card", `从牌堆摸了 ${added.length} 张`);
      for (const o of added) if (o.faceUp !== false) logEffect(o.card);
      dropEmptyPile(next, action.id);
      break;
    }
    case "pull": {
      const pile = find(action.id);
      const spec = pile?.pile?.[action.index];
      if (!pile?.pile || !spec) return state;
      const card = fixCard(spec);
      if (!card) return state;
      const rest = pile.pile.slice();
      rest.splice(action.index, 1);
      patch(action.id, { pile: rest });
      if (next.o.length >= MAX_OBJECTS) return state;
      // 只取那一张：按内容再匹配会撞上同名牌，所以这里直接按堆内下标摘走
      const taken = tidy({ ...action.to, card });
      next.o = next.o.concat(taken);
      push("card", `从${describe(pile)}里取出了「${cardText(card) || card.label || "空白卡"}」`);
      if (taken.faceUp !== false) logEffect(card);
      dropEmptyPile(next, action.id);
      break;
    }
    case "putBack": {
      const pile = find(action.id);
      if (!pile) return state;
      const set = new Set(action.cardIds);
      next.o = next.o.filter((o) => !set.has(o.id));
      patch(action.id, { pile: [...(pile.pile ?? []), ...action.cards.map(fixCard)].filter((c): c is CardSpec => !!c).slice(0, MAX_PILE) });
      push("card", `收回 ${action.cards.length} 张牌`);
      break;
    }
    case "pour": {
      const from = find(action.from);
      const to = find(action.to);
      if (!from || !to || !from.pile?.length || !isContainer(from) || !isContainer(to) || from.id === to.id) return state;
      // 倒扣着回库：最上面弃的那张落到最底下，翻过来正好就是原来的顺序
      const moved = (action.flip ? from.pile.slice().reverse() : from.pile.slice()).map(fixCard).filter((c): c is CardSpec => !!c);
      if (!moved.length) return state;
      patch(to.id, { pile: [...(to.pile ?? []), ...moved].slice(0, MAX_PILE) });
      patch(from.id, { pile: [] });
      push("card", `把${describe(from)}倒进${describe(to)}（${moved.length} 张）`);
      dropEmptyPile(next, from.id);
      break;
    }
    case "shuffle": {
      const pile = find(action.id);
      if (!pile?.pile) return state;
      patch(action.id, { pile: action.cards.map(fixCard).filter((c): c is CardSpec => !!c) });
      push("card", `洗了牌堆（${pile.pile.length} 张）`);
      break;
    }
    case "cut": {
      const pile = find(action.id);
      const cards = pile?.pile ?? [];
      // 只有牌堆讲「上下」：盒子和袋子看着就是装的容器，切了也看不出差别
      if (pile?.kind !== "pile" || cards.length < 2) return state;
      const at = Math.max(1, Math.min(cards.length - 1, Math.round(action.at)));
      patch(action.id, { pile: [...cards.slice(at), ...cards.slice(0, at)] });
      push("card", `切了牌（上面 ${at} 张扣到底下）`);
      break;
    }
    case "even": {
      const src = find(action.id);
      const total = src?.pile?.length ?? 0;
      if (!src || !total || action.piles.length < 2) return state;
      const own = action.piles.find((p) => p.id === action.id);
      if (!own?.pile?.length) return state;
      const added = action.piles.filter((p) => p.id !== action.id).map(tidy).filter((p) => Array.isArray(p.pile) && p.pile.length);
      if (next.o.length + added.length > MAX_OBJECTS) return state;
      patch(action.id, { pile: own.pile });
      next.o = next.o.concat(added);
      push("card", `把 ${total} 张牌均分成 ${added.length + 1} 叠`);
      break;
    }
    case "deal": {
      for (const p of action.piles) if (find(p.id)) patch(p.id, { pile: p.cards.map(fixCard).filter((c): c is CardSpec => !!c) });
      const dealt = action.to.slice(0, MAX_OBJECTS - next.o.length).map(tidy);
      next.o = next.o.concat(dealt);
      push("card", `发出了 ${dealt.length} 张手牌`);
      break;
    }
    case "playerAdd": {
      if (next.players.length >= 8) return state;
      next.players = [...next.players, action.player];
      push("system", `${action.player.name} 入座`);
      break;
    }
    case "playerRemove": {
      const p = next.players.find((x) => x.id === action.id);
      if (!p) return state;
      const idx = next.players.indexOf(p);
      next.players = next.players.filter((x) => x.id !== action.id);
      next.turn = next.players.length ? Math.min(next.turn, next.players.length - 1) : 0;
      if (idx < next.turn) next.turn = Math.max(0, next.turn - 1);
      push("system", `${p.name} 离席`);
      break;
    }
    case "turnSet": {
      if (!next.players.length) return state;
      next.turn = clampInt(action.index, 0, next.players.length - 1);
      push("turn", `轮到 ${next.players[next.turn].name}`);
      break;
    }
    case "turnNext": {
      if (!next.players.length) return state;
      next.turn = (next.turn + next.step + next.players.length) % next.players.length;
      push("turn", `轮到 ${next.players[next.turn].name}`);
      break;
    }
    case "clear": {
      const boards = next.o.filter((o) => o.kind === "board");
      next.o = boards;
      push("system", "清空了桌面");
      break;
    }
    case "presetLoad": {
      // 预设存的是「桌面的样子」：手牌归属与隐私区主人都是上一台浏览器的事，
      // 带进来会让别人守着一堆陌生 id 名下的私有区，选不中也改不动。
      next.o = action.o.slice(0, MAX_OBJECTS).map((raw) => {
        const o = tidy(raw);
        delete o.hand;
        delete o.owner;
        delete o.priv;
        return o;
      });
      push("system", `载入了桌面预设「${action.name.slice(0, 24)}」`);
      break;
    }
    case "rename": {
      next.name = action.name.slice(0, 24) || "牌桌";
      push("system", `牌桌改名为「${next.name}」`);
      break;
    }
    case "boardSet": {
      next.o = next.o.filter((o) => o.kind !== "board");
      if (action.board) next.o.unshift(action.board);
      push("system", action.board ? "更换了棋盘" : "移除了棋盘");
      break;
    }
    case "reset": {
      // 「摆回开局」只认得出预设的盘：预设没在盘面上摆子的（围棋那堆罐边子）没有开局可摆，按钮也就不出现
      const b = find(action.id);
      const preset = b?.kind === "board" ? presetOf(b) : null;
      if (!b || !preset?.setup || !preset.opening) return state;
      // 收掉的是这一盘上的子：摊在旁边的牌、别人的手牌、骰子都跟这盘棋无关
      const onIt = (o: GameObject) => o.id !== b.id && !o.hand && o.kind !== "die" && gridHug(o) && onBoard(b, o.x, o.z);
      const rest = next.o.filter((o) => !onIt(o));
      const room = MAX_OBJECTS - rest.length;
      if (room <= 0) return state;
      // 开局坐标是按「棋盘在 BOARD_HOME」算的：棋盘挪过位置就整体跟着挪过去
      const born = preset.setup(preset.id).slice(0, room).map((raw) => tidy({
        ...raw,
        id: uid(),
        x: round(b.x + raw.x - BOARD_HOME.x),
        z: round(b.z + raw.z - BOARD_HOME.z),
      } as GameObject));
      next.o = [...rest, ...born];
      push("system", `摆回了开局「${preset.name}」${born.length} 子`);
      break;
    }
    case "chat": {
      push("chat", action.text.slice(0, 300));
      break;
    }
    default:
      return state;
  }
  // 迷你计数器吸着的宿主没了（被收走、进了手牌、倒回牌堆）就脱附，但整片留在原地——
  // 少了一片东西用户会莫名其妙，留着至少看得见。读数与步进照旧。
  for (let i = 0; i < next.o.length; i++) {
    const c = next.o[i];
    if (c.kind !== "counter" || !c.counter?.host) continue;
    const host = next.o.find((x) => x.id === c.counter!.host);
    if (host && !host.hand) continue;
    next.o[i] = { ...c, counter: fixCounter({ v: c.counter.v, step: c.counter.step }) };
  }
  return next;
}

/** 进场的物件先收口字段，脏数值不会让各端算出两份状态 */
function tidy(o: GameObject): GameObject {
  const out: GameObject = { ...o };
  if (out.card) out.card = fixCard(out.card);
  if (Array.isArray(out.pile)) out.pile = out.pile.map(fixCard).filter((c): c is CardSpec => !!c).slice(0, MAX_PILE);
  const back = fixBackImg(out.backImg);
  if (back) out.backImg = back;
  else delete out.backImg;
  if (typeof out.len === "number" && Number.isFinite(out.len)) out.len = Math.round(clamp(out.len, ARROW_MIN, ARROW_MAX) * 1000) / 1000;
  else delete out.len;
  if (out.kind === "timer") Object.assign(out, timerOf(out));
  if (typeof out.tilt === "number" && Number.isFinite(out.tilt)) out.tilt = clampTilt(out.tilt);
  else delete out.tilt;
  if (out.pin !== true) delete out.pin;
  if (!pinnable(out)) delete out.pin;
  // 斜着的牌站不住：没钉住就没有俯仰角，各端才不会一份平一份斜
  if (!out.pin) delete out.tilt;
  if (out.kind === "calc") {
    out.calc = { expr: fixCalcExpr(out.calc?.expr) };
  } else delete out.calc;
  if (out.kind === "zone") {
    out.zone = fixZone(out.zone);
    if (out.priv !== true) delete out.priv;
    if (out.pref !== true) delete out.pref;
  } else {
    delete out.zone;
    delete out.priv;
    delete out.pref;
  }
  if (out.kind === "stat") {
    out.stat = fixStat(out.stat);
    if (out.lock !== true) delete out.lock;
  } else if (out.kind === "board") {
    // 桌垫锁的是「别被顺手拖走」，棋盘锁的是下棋时那一清静：两种都吃锁
    delete out.stat;
    if (out.lock !== true) delete out.lock;
  } else {
    delete out.stat;
    delete out.lock;
  }
  if (out.grid !== true || !gridable(out)) delete out.grid;
  // 吸附与网格线默认都是开的：只有明确关掉才留一个 false，开着不进状态（老房间的盘不带字段，照旧吸附）
  if (out.snap !== false || !gridable(out)) delete out.snap;
  if (out.mesh !== false || !gridable(out)) delete out.mesh;
  // 预设 id 只属于棋盘：认不出的字符串留着也没人读，删掉让各端状态一致
  if (out.kind !== "board" || typeof out.preset !== "string" || !out.preset.length || out.preset.length > 24) delete out.preset;
  if (out.kind === "slot") out.slot = fixSlot(out.slot);
  else delete out.slot;
  if (out.kind === "spinner") out.spinner = fixSpinner(out.spinner);
  else delete out.spinner;
  if (out.kind === "track") out.track = fixTrack(out.track);
  else delete out.track;
  if (out.kind === "shield") out.shield = fixShield(out.shield);
  else delete out.shield;
  if (out.kind === "hour") out.hour = fixHour(out.hour);
  else delete out.hour;
  if (out.kind === "book") out.book = fixBook(out.book);
  else delete out.book;
  if (out.kind === "gram") out.gram = fixGram(out.gram);
  else delete out.gram;
  if (out.kind === "mp3") out.mp3 = fixMp3(out.mp3);
  else delete out.mp3;
  if (out.kind === "tablet") out.tablet = fixTablet(out.tablet);
  else delete out.tablet;
  if (out.kind === "counter") out.counter = fixCounter(out.counter);
  else delete out.counter;
  if (out.kind === "tray") out.tray = fixTray(out.tray);
  else delete out.tray;
  return out;
}

/**
 * 牌堆摸空了就自己消失：场上只剩一个空壳子没意义，还挡着后面的物件。
 * 只在取牌路径上调用，开局摆好的空弃牌堆不会一放上来就被删掉。
 */
function dropEmptyPile(next: TableState, id: string) {
  const i = next.o.findIndex((o) => o.id === id);
  if (i < 0) return;
  const o = next.o[i];
  if (o.kind !== "pile" || o.pile?.length) return;
  // 空壳子消失后它占过的那片地方也空了：停在上面的东西跟着落回桌面
  next.o = next.o.filter((x) => x.id !== id);
  next.o = resolvePlacement(next.o, [], [anchorOf(o)]).o;
}

function effectLine(spec: CardSpec): string {
  return `${cardText(spec) || spec.label || "卡牌"}：${spec.text ?? ""}`;
}

/** 从牌堆里逐张移除指定卡牌（按内容匹配一次），返回剩余顺序。 */
function removeFrom(pile: CardSpec[], wanted: (CardSpec | undefined)[]): CardSpec[] {
  const out = pile.slice();
  for (const spec of wanted) {
    if (!spec) continue;
    const i = out.findIndex((c) => c && c.rank === spec.rank && c.suit === spec.suit && c.label === spec.label && c.back === spec.back && c.img === spec.img);
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

export function describe(o: GameObject): string {
  switch (o.kind) {
    case "board": return "棋盘";
    case "die": return `${o.sides ?? 6} 面骰`;
    case "card": return "卡牌";
    case "pile": return "牌堆";
    case "box": return "卡牌盒";
    case "bag": return "袋子";
    case "pawn": return "棋子";
    case "disc": return "圆片";
    case "cube": return "方块";
    case "token": return `标记${o.label ? `「${o.label}」` : ""}`;
    case "timer": return "计时器";
    case "pointer": return "指针";
    case "arrow": return "路径箭头";
    case "text": return `文字「${o.label ?? ""}」`;
    case "zone": return `区域垫「${o.label || "区域"}」`;
    case "stat": return `统计垫「${o.label || "统计垫"}」`;
    case "slot": return `卡槽带「${o.label || "卡槽"}」`;
    case "spinner": return `转盘「${o.label || `${o.spinner?.n ?? 8} 格`}」`;
    case "track": return `计分轨「${o.label || `${o.track?.n ?? 20} 格`}」`;
    case "shield": return `牌屏「${o.label || `${Math.round((o.shield?.w ?? 0.24) * 100)} 厘米`}」`;
    case "hour": return `${o.hour?.mins ?? 3} 分钟沙漏`;
    case "book": return `规则书「${o.label || "房规"}」`;
    case "gram": return `唱片机${o.gram?.clip ? `「${o.gram.name || "无题"}」` : "（没放唱片）"}`;
    case "mp3": return `随身听${o.mp3?.clip ? `「${o.mp3.name || "无题"}」${o.mp3.shared ? "" : "（只在本机）"}` : "（还没刻歌）"}`;
    case "tablet": return `平板浏览器${o.tablet?.url ? `（${tabletHost(o.tablet.url)}）` : "（没填地址）"}`;
    case "counter": return `迷你计数器${o.counter ? ` ${o.counter.v}` : ""}`;
    case "tray": return `骰盘 ${Math.round((o.tray?.w ?? 0.2) * 100)}×${Math.round((o.tray?.d ?? 0.14) * 100)} 厘米`;
    default: return "物件";
  }
}

export function newPlayer(name: string, index: number): Player {
  const clean = name.trim().slice(0, 16) || `玩家${index + 1}`;
  return { id: uid("p"), name: clean, color: PALETTE[index % PALETTE.length] };
}

export function tableSurface() {
  return TABLE;
}

export function round(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
}

/** 非法数值退回原值，避免脏动作把 Infinity/NaN 写进共享桌面 */
function numOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normDeg(v: number): number {
  const deg = Number.isFinite(v) ? v : 0;
  return Math.round(((deg % 360) + 360) % 360);
}

export function clampLayer(v: number): number {
  return clampInt(v, 0, LAYER_MAX);
}

/** 体积倍数保留三位小数，避免多次缩放后各端浮点尾差 */
export function clampScale(v: number): number {
  return Math.round(clamp(Number.isFinite(v) ? v : 1, SCALE_MIN, SCALE_MAX) * 1000) / 1000;
}

export function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
}

export function safeColor(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : PALETTE[0];
}

/** 估算序列化体积，用于在发送前裁剪日志 */
export function sizeOf(state: TableState): number {
  return JSON.stringify(state).length;
}

export function trimState(state: TableState, limit = 180_000): TableState {
  if (sizeOf(state) <= limit) return state;
  return { ...state, log: state.log.slice(-20) };
}
