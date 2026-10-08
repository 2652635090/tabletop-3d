/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, isMissing, makeClientId, isUnsupported, type CommitResult, type ListedRoom, type LobbyUser, type RomMeta, type RomPayload, type RomSaveResult, type RoomInfo, type RoomSnapshot, type Who } from "./api";
import { PALETTE } from "./catalog";
import { cacheLocalTable, cacheRomPayload, cacheRoms, cacheRoom, cachedRoom, cachedRomPayload, cachedRoms, dropRomPayload, forgetRomToken, rememberRomToken, rememberRoomToken, roomToken, romToken } from "./cache";
import { fingerprint, rememberNick, storedNick } from "./fingerprint";
import { imageKeysOf, pushMissingImages } from "./images";
import type { ImageTransport } from "./images";
import { handlePart, offerTo, setTrackTransport, stopTracks, wantTrack } from "./mp3";
import { allowed, actionPerm, GAME_SHUT_HINT, gameShut, permLabel, type PermKey, type Perms } from "./perm";
import { createRealtime, type DragMark, type LinkKind } from "./rt";
import { apply, emptyState, MAX_OBJECTS, trimState } from "./state";
import type { Action, Move, Presence, TableState } from "./types";

export type Mode = "local" | "online";
const MAX_HISTORY = 24;
/** 实时通道兜住的兜底同步间隔：推送是主路，这条只是防漏 */
const POLL_SLOW = 4000;
const PRESENCE_MS = 5000;
/** 轮询回落时：有人同桌就拉得勤一点，页面在背后就让路 */
const POLL_FAST = 300;
const POLL_IDLE = 900;
const POLL_HIDDEN = 1500;
const MAX_RETRY = 2;

interface Intent {
  action: Action;
  state: TableState;
  retry: boolean;
  tries: number;
}

/**
 * 持久化房间的一等入口：把当前桌定档成 ROM、翻档、开档、删档，以及公开大厅。
 * 每条方法都自带降级 —— 服务器不回就用浏览器缓存，缓存也没有才空手而归。
 */
export interface TableArchive {
  /** 当前这张桌子是从哪份存档开出来的（null = 不是） */
  romId: string | null;
  /** 当前房间有没有挂进公开大厅 */
  listed: boolean;
  /** 这台浏览器能不能完成这些操作：轮询站点没实现这套协议时回 false */
  supported: boolean;
  save(input: { id?: string | null; title: string; note?: string }): Promise<RomSaveResult | null>;
  /** 开档结果：live 是联网新开的房间，cached 是离线从本机缓存摆出来的桌子，false 是没开成 */
  open(id: string): Promise<"live" | "cached" | false>;
  read(id: string): Promise<{ rom: RomPayload; cached: boolean } | null>;
  remove(id: string): Promise<boolean>;
  list(): Promise<{ roms: RomMeta[]; cached: boolean }>;
  lobby(): Promise<ListedRoom[]>;
  feature(listed: boolean): Promise<boolean>;
}

/**
 * 房主管理面板的那套动作。成员也拿得到这个对象，只是 host=false 时三个写方法都会
 * 被服务端拒掉（口令不在他手上），界面上就该把开关摆成看得见的灰。
 */
export interface TableManage {
  /** 这台浏览器是不是这间房的房主（口令或指纹认出来） */
  host: boolean;
  /** 服务端认不认这套协议：不认时房间没有元信息，人人自由，面板只留本地设置 */
  available: boolean;
  /** 服务端记着的这份房间元信息：公开私密与权限表都在这 */
  room: RoomInfo | null;
  /** 当前身份实际拿到的权限：房主全开，成员按房间表算 */
  granted(key: PermKey): boolean;
  setPub(next: boolean): Promise<boolean>;
  /** 全桌的游戏模式：只有房主点得动，服务端改完立刻推给同桌所有人 */
  setGameMode(next: boolean): Promise<boolean>;
  setPerms(next: Perms): Promise<boolean>;
  kick(clientId: string): Promise<boolean>;
}

export interface TableSession {
  state: TableState;
  mode: Mode;
  code: string | null;
  version: number;
  presence: Presence;
  peers: number;
  status: string;
  busy: boolean;
  canUndo: boolean;
  me: { id: string; name: string; color: string };
  /** 这台浏览器的身份：会话 id + 指纹短号，服务端按它认房主、认被踢的人 */
  who: Who;
  rollSignal: { ids: string[]; seq: number };
  /** 像素走当前链路：实时通道连着就顺着它，否则回到 /functions */
  images: ImageTransport;
  /** 本机到房间的往返毫秒；没连上实时通道时是 null */
  lag: number | null;
  /** 拖动途中的瞬时位置：只走实时通道，轮询回落时是空操作 */
  sendDrag(moves: Move[], mode?: "drag" | "pick"): void;
  /** 向同桌求服务器缺的那几张自传图：谁本机存着谁补传，轮询回落时是空操作 */
  askImages(keys: string[]): void;
  /** 向同桌那台随身听的主人求一首歌：字节由他那台机器递过来，服务器一份都不存 */
  askTrack(to: string, key: string): void;
  /** 别人的拖动帧：直接交给场景画预览圈，不进 React 状态，免得每帧重渲染 */
  onPeerDrag(fn: (mark: DragMark) => void): () => void;
  link(): LinkKind;
  /** 持久化房间：定档 / 翻档 / 开档 / 删档 / 公开大厅，全部走当前链路 */
  archive: TableArchive;
  /** 房主管理：公开私密、游戏模式、逐条权限分配、踢出成员 */
  manage: TableManage;
  /**
   * 此刻是不是在游戏中：房主那一键（全桌）或本机自己开着的那一档，任一成立算开着。
   * 界面上编辑与删除那一排就照它收起来，dispatch 也在这一层再拦一道。
   */
  gaming: boolean;
  /** 总站在线名单：跨房间，refreshOnline 拉一次 */
  online: LobbyUser[];
  refreshOnline(): Promise<void>;
  setName(name: string): void;
  dispatch(action: Action, opts?: { retry?: boolean }): void;
  startLocal(state: TableState): void;
  createRoom(state: TableState): Promise<boolean>;
  joinRoom(code: string): Promise<boolean>;
  leaveRoom(): void;
  undo(): void;
}

/**
 * @param onNotify 面向人的那句话从这漏出去（toast + 状态条）
 * @param localGame 本机的游戏模式：只锁自己这一台，没联网也能开着试牌怕误删
 */
export function useTable(onNotify?: (text: string) => void, localGame = false): TableSession {
  const clientId = useMemo(makeClientId, []);
  const [state, setState] = useState<TableState>(() => emptyState());
  const [mode, setMode] = useState<Mode>("local");
  const [code, setCode] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [presence, setPresence] = useState<Presence>({});
  const [status, setStatus] = useState("本地牌桌，未联网");
  const [busy, setBusy] = useState(false);
  /** 当前桌子来自哪份存档 / 有没有挂进公开大厅 */
  const [romId, setRomId] = useState<string | null>(null);
  const [listed, setListed] = useState(false);
  /** 服务端不认这套协议时（比如 Sites 那份 Edge Function）一次性把存档入口收起来 */
  const [supported, setSupported] = useState(true);
  /** 房间元信息：房主是谁、公开还是私密、成员拿到哪些权限。服务端不认这套协议时一直是 null */
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<LobbyUser[]>([]);
  const [name, setNameState] = useState(() => storedNick());
  const [rollSignal, setRollSignal] = useState<{ ids: string[]; seq: number }>({ ids: [], seq: 0 });

  const stateRef = useRef(state);
  const versionRef = useRef(version);
  const modeRef = useRef(mode);
  const codeRef = useRef(code);
  const queue = useRef<Intent[]>([]);
  const sending = useRef(false);
  const history = useRef<TableState[]>([]);
  const [historyDepth, setHistoryDepth] = useState(0);
  const identity = useRef({ id: clientId, name: name || "玩家", color: PALETTE[0] });
  /** 这台浏览器的身份：会话 id 一刷新就换，指纹短号不换，所以房主与黑名单两道一起认 */
  const who = useMemo<Who>(() => ({ id: clientId, fp: fingerprint().id }), [clientId]);
  const presenceRef = useRef(presence);
  presenceRef.current = presence;
  /** 常驻的实时链路：整场会话只有一条，切换房间不需要重新握手 */
  const rt = useMemo(() => createRealtime(), []);
  /** 实时通道优先；它没连着就走 /functions 轮询，两条链路讲的是同一套协议 */
  const link = useCallback(() => (rt.up() ? rt : api), [rt]);
  const [lag, setLag] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLag(rt.up() ? rt.rtt() : null);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [rt]);
  /** 同一浏览器里的多个标签页：写完立刻打个招呼，不必等下一轮轮询 */
  const nudge = useMemo(() => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("tabletop3d")), []);
  /** 拖动预览的订阅者一般只有 3D 场景一个：直接喂给渲染层，不走 React 状态 */
  const dragSinks = useRef(new Set<(mark: DragMark) => void>());
  const onPeerDrag = useCallback((fn: (mark: DragMark) => void) => {
    dragSinks.current.add(fn);
    return () => {
      dragSinks.current.delete(fn);
    };
  }, []);
  const sendDrag = useCallback((moves: Move[], mode: "drag" | "pick" = "drag") => {
    const room = codeRef.current;
    if (modeRef.current !== "online" || !room || !rt.up()) return;
    rt.sendDrag(room, identity.current.name, identity.current.color, moves, mode);
  }, [rt]);
  /** 向同桌求服务器没有的那几张图：只有实时通道有这个口，轮询回落时是空操作 */
  const askImages = useCallback((keys: string[]) => {
    const room = codeRef.current;
    if (modeRef.current !== "online" || !room || !rt.up()) return;
    rt.askImages?.(room, keys);
  }, [rt]);
  /** 向同桌求一首别人本机刻着的歌：字节由那台机器一段一段递过来，服务器一份都不存 */
  const askTrack = useCallback((to: string, key: string) => {
    const room = codeRef.current;
    if (modeRef.current !== "online" || !room || !rt.up()) return;
    wantTrack(room, to, key);
  }, [rt]);

  const colorFor = useCallback((id: string) => {
    const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return PALETTE[hash % PALETTE.length];
  }, [clientId]);

  const me = identity.current;
  const myName = name.trim().slice(0, 16) || storedNick();
  const myColor = useMemo(() => colorFor(clientId), [clientId, colorFor]);
  identity.current = { id: clientId, name: myName, color: myColor };
  modeRef.current = mode;
  codeRef.current = code;

  /**
   * 房主认两道：口令原文只存在开房那台浏览器的本机存储里，指纹再兜一层，
   * 于是刷新换了 clientId 也还是这间房的主人。
   */
  const host = mode === "online" && !!code && (!!roomToken(code)
    || (!!room && (room.owner === who.id || (!!room.ownerFp && room.ownerFp === who.fp))));
  /** 没有房间元信息 = 服务端不认这套协议（比如 Sites 那份 Edge Function），此时人人自由 */
  const granted = useCallback((key: PermKey) => host || !room ? true : allowed(room.perms, key), [host, room]);
  // dispatch 会被很多地方挂在依赖数组上：权限判定走 ref，改权限不会换掉它的身份
  const allowRef = useRef(granted);
  allowRef.current = granted;
  /**
   * 在游戏中：房主那一键是全桌的，本机自己开的那一档只锁自己。
   * 服务端不认房间协议时（room 为 null）只剩本机这一档，本地牌桌照样能锁。
   */
  const gaming = localGame || (mode === "online" && room?.gm === true);
  const gameRef = useRef(gaming);
  gameRef.current = gaming;
  const localGameRef = useRef(localGame);
  localGameRef.current = localGame;

  const notify = useCallback((text: string) => {
    setStatus(text);
    onNotify?.(text);
  }, [onNotify]);

  const commitState = useCallback((next: TableState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const pump = useCallback(async () => {
    if (sending.current || !queue.current.length) return;
    if (modeRef.current !== "online" || !codeRef.current) return;
    sending.current = true;
    setBusy(true);
    const intent = queue.current[0];
    const target = codeRef.current;
    let res: CommitResult | null = null;
    let failure = "";
    try {
      res = await link().commit(target, versionRef.current, intent.action, trimState(intent.state), myName, who);
    } catch (error) {
      failure = error instanceof ApiError ? error.code : "unknown";
      if (failure === "kicked") {
        queue.current = [];
        sending.current = false;
        setBusy(false);
        setMode("local");
        setCode(null);
        setRoom(null);
        setPresence({});
        notify("房主把你请出了这个房间，桌面留在本机继续摆");
        return;
      }
    }
    if (res) {
      queue.current.shift();
      versionRef.current = res.version;
      setVersion(res.version);
      if (res.presence) setPresence(res.presence);
      if (res.room !== undefined) setRoom(res.room);
      if (res.rejected) notify(res.rejected);
      if (res.conflict) {
        const fresh = res.state;
        if (intent.retry && intent.tries < MAX_RETRY) {
          intent.tries += 1;
          intent.state = apply(fresh, intent.action, myName, myColor);
          commitState(intent.state);
          notify("有并发操作，已按最新桌面重放你的动作");
        } else {
          commitState(fresh);
          if (intent.retry) notify("有并发操作，桌面已同步为最新状态");
        }
      } else {
        commitState(res.state);
      }
      nudge?.postMessage({ code: target, version: res.version });
    } else {
      // 结果未知的写入不重放：清空待发送队列，交由 sync 采纳服务端权威状态
      queue.current = [];
      notify(failure === "state_too_large" ? "桌面内容超出上限，收纳物件后再试" : "连接中断，本步未同步；稍后按服务端桌面继续");
    }
    sending.current = false;
    setBusy(false);
    if (queue.current.length) void pump();
  }, [commitState, link, myColor, myName, notify, nudge, who]);

  const dispatch = useCallback((action: Action, opts: { retry?: boolean } = { retry: true }) => {
    // 客户端这一道只是提前拦：越权的改动服务端也会退回去，但让人对着一个不动的按钮猜更糟
    const key = actionPerm(action);
    if (modeRef.current === "online" && key && !allowRef.current(key)) {
      notify(`房主没有开放「${permLabel(key)}」这项操作`);
      return;
    }
    // 游戏模式收起来的是界面，这一道兜住键盘与界面上漏掉的那几条；本地桌也照锁
    if (gameRef.current && gameShut(action)) {
      notify(GAME_SHUT_HINT);
      return;
    }
    history.current = [...history.current, stateRef.current].slice(-MAX_HISTORY);
    setHistoryDepth(history.current.length);
    const next = apply(stateRef.current, action, identity.current.name, identity.current.color);
    commitState(next);
    if (modeRef.current === "online" && codeRef.current) {
      queue.current.push({ action, state: next, retry: opts.retry !== false, tries: 0 });
      void pump();
    }
  }, [commitState, pump]);

  const adopt = useCallback((incoming: TableState, seqProbe = true) => {
    const prev = stateRef.current;
    if (seqProbe) {
      const rolled: string[] = [];
      for (const o of incoming.o) {
        if (o.kind !== "die") continue;
        const before = prev.o.find((x) => x.id === o.id);
        if (before && o.value && before.value !== o.value) rolled.push(o.id);
      }
      if (rolled.length) setRollSignal((s) => ({ ids: rolled, seq: s.seq + 1 }));
    }
    stateRef.current = incoming;
    setState(incoming);
  }, []);

  const sync = useCallback(async () => {
    if (modeRef.current !== "online" || !codeRef.current || sending.current) return;
    try {
      const r = await link().sync(codeRef.current, versionRef.current);
      setPresence(r.presence);
      versionRef.current = r.version;
      setVersion(r.version);
      if (r.room !== undefined) setRoom(r.room);
      if (r.changed && r.state) adopt(r.state);
    } catch (error) {
      if (error instanceof ApiError && error.code === "room_not_found") {
        setMode("local");
        setCode(null);
        setRoom(null);
        notify("房间已关闭，转为本地牌桌");
      }
      if (error instanceof ApiError && error.code === "kicked") {
        setMode("local");
        setCode(null);
        setRoom(null);
        setPresence({});
        notify("房主把你请出了这个房间，桌面留在本机继续摆");
      }
    }
  }, [adopt, link, notify]);

  const heartbeat = useCallback(async () => {
    if (modeRef.current !== "online" || !codeRef.current) return;
    try {
      const p = await link().presence(codeRef.current, clientId, identity.current.name, identity.current.color, rt.rtt(), who.fp);
      setPresence(p);
    } catch (error) {
      // 被踢这件事只有下一次心跳会告诉我们：转回本地，别让人对着一张改不动的桌子发懵
      if (error instanceof ApiError && error.code === "kicked") {
        queue.current = [];
        setMode("local");
        setCode(null);
        setRoom(null);
        setPresence({});
        notify("房主把你请出了这个房间，桌面留在本机继续摆");
        return;
      }
      /* 下一拍再试 */
    }
  }, [clientId, link, notify, rt, who]);

  /** 昵称自己改：当场写进身份与本机存储，再催一次心跳让同桌的人立刻看到新名字 */
  const setName = useCallback((next: string) => {
    const clean = next.trim().slice(0, 16) || storedNick();
    identity.current = { ...identity.current, name: clean };
    setNameState(next);
    rememberNick(clean);
    void heartbeat();
  }, [heartbeat]);

  useEffect(() => {
    if (mode !== "online" || !code) return;
    let timer = 0;
    let alive = true;
    /** 实时通道活着靠推送；这条 4 秒的兜底只在它没连上时才真正发力 */
    const delay = () => {
      if (rt.up()) return POLL_SLOW;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return POLL_HIDDEN;
      return Object.keys(presenceRef.current).length > 1 ? POLL_FAST : POLL_IDLE;
    };
    const step = () => {
      timer = window.setTimeout(() => {
        void sync().then(() => { if (alive) step(); });
      }, delay());
    };
    /** 同浏览器的兄弟标签页写完就催一次，省掉一整个轮询周期 */
    const onNudge = (event: MessageEvent) => {
      const data = event.data as { code?: string; version?: number } | null;
      if (!data || data.code !== code || (data.version ?? 0) <= versionRef.current) return;
      void sync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    /** 服务器一推桌面就采纳，这是“无感”的主路 */
    const offPush = rt.subscribe((push) => {
      if (typeof push.version === "number" && push.state && push.version > versionRef.current && !sending.current) {
        versionRef.current = push.version;
        setVersion(push.version);
        adopt(push.state);
      }
      if (push.presence) setPresence(push.presence);
      if (push.room !== undefined) setRoom(push.room);
      if (push.drag) for (const fn of [...dragSinks.current]) fn(push.drag);
      // 同桌喊缺图：自己本机存着的那几张顺手补传上服务器，谁都不必直传像素
      if (push.ask?.length) void pushMissingImages(push.ask);
      // 有人想听本机这台随身听里的歌：递字节；同学递来的段：归位凑成一首歌。两头都不经服务器
      if (push.want) offerTo(codeRef.current ?? "", push.want.from, push.want.key);
      if (push.part) handlePart(codeRef.current ?? "", push.part.from, push.part.key, push.part.seq, push.part.total, push.part.data);
      step();
    });
    /** 断线重连成功要立刻补一次，别等下一轮兜底 */
    const offStatus = rt.onStatus((up) => {
      if (up) void sync();
      step();
    });
    nudge?.addEventListener("message", onNudge);
    document.addEventListener("visibilitychange", onVisible);
    const beat = window.setInterval(() => void heartbeat(), PRESENCE_MS);
    void sync();
    void heartbeat();
    step();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearInterval(beat);
      offPush();
      offStatus();
      nudge?.removeEventListener("message", onNudge);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [adopt, code, heartbeat, mode, nudge, rt, sync]);

  /** create/join/romOpen 回的都是同一份快照：落地成一次“坐上这张桌” */
  const adoptRoom = useCallback((snap: RoomSnapshot, message: string) => {
    history.current = [];
    setHistoryDepth(0);
    queue.current = [];
    commitState(snap.state);
    setMode("online");
    setCode(snap.code);
    setVersion(snap.version);
    versionRef.current = snap.version;
    setPresence(snap.presence);
    setRomId(snap.romId ?? null);
    setListed(snap.listed === true);
    setRoom(snap.room ?? null);
    // 房主口令只在开房这一次响应里出现，当场收下，之后改设置全凭它
    if (snap.token) rememberRoomToken(snap.code, snap.token);
    notify(message);
    rt.ensure();
    void heartbeat();
  }, [commitState, heartbeat, notify, rt]);

  const startLocal = useCallback((next: TableState) => {
    history.current = [];
    setHistoryDepth(0);
    queue.current = [];
    setMode("local");
    setCode(null);
    setPresence({});
    setVersion(1);
    versionRef.current = 1;
    setRomId(null);
    setListed(false);
    setRoom(null);
    commitState(next);
    notify("本地牌桌，未联网");
  }, [commitState, notify]);

  const createRoom = useCallback(async (next: TableState) => {
    try {
      const snap = await link().create(trimState(next), { ...who, name: myName });
      adoptRoom(snap, `房间 ${snap.code} 已创建，你是房主`);
      return true;
    } catch (error) {
      notify(error instanceof ApiError ? error.message : "创建房间失败");
      return false;
    }
  }, [adoptRoom, link, myName, notify, who]);

  const joinRoom = useCallback(async (raw: string) => {
    const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (clean.length < 4) {
      notify("请输入至少 4 位房间码");
      return false;
    }
    try {
      const snap = await link().join(clean, who);
      adoptRoom(snap, `已加入房间 ${snap.code}`);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "kicked") {
        notify("房主把你请出了这个房间，再进去会被拒");
        return false;
      }
      // 连不上或房间被清了，本机缓存还能把桌况摆出来：离线看桌比看空桌子有用
      const offline = cachedRoom(clean);
      if (offline) {
        setMode("local");
        setCode(null);
        setRoom(null);
        setPresence({});
        commitState(offline);
        notify(`离线打开房间 ${clean}：这是本机缓存的桌况，改动作不会同步`);
        return false;
      }
      notify(error instanceof ApiError ? error.message : "加入房间失败");
      return false;
    }
  }, [adoptRoom, commitState, link, notify, who]);

  const leaveRoom = useCallback(() => {
    const room0 = codeRef.current;
    queue.current = [];
    // 销名是打招呼不是指令：发不出去也照样本地退场，45 秒后服务端自己会清
    if (modeRef.current === "online" && room0) void link().roomLeave(room0, who).catch(() => {});
    setMode("local");
    setCode(null);
    setPresence({});
    setRomId(null);
    setListed(false);
    setRoom(null);
    notify("已离开房间，桌面保留在本地");
  }, [link, notify, who]);

  /** 存档相关的失败统一这么收口：不支持就退场，其余只报一句话 */
  const archiveError = useCallback((error: unknown): string => {
    if (isUnsupported(error)) {
      setSupported(false);
      return "这个站点还没有房间存档与牌桌列表功能";
    }
    return error instanceof ApiError ? error.message : "存档操作失败，稍后再试";
  }, []);

  /** 房间设置那一层的失败：不支持≠没有存档功能，所以不碰 supported */
  const manageError = useCallback((error: unknown): string => {
    if (isUnsupported(error)) return "这个站点还没有房间权限设置，暂时人人自由";
    return error instanceof ApiError ? error.message : "房间设置没改成功，稍后再试";
  }, []);

  /**
   * 公开还是私密：只有一个写入口，挂牌按钮和房主面板改的是同一个字段。
   * 公开房进大厅列表，私密房只认房间码。
   */
  const setPublic = useCallback(async (next: boolean): Promise<boolean> => {
    const room = codeRef.current;
    if (modeRef.current !== "online" || !room) {
      notify("先开一个联网房间再设公开");
      return false;
    }
    try {
      const out = await link().roomPerm(room, roomToken(room) ?? "", { pub: next });
      if (out) {
        setRoom(out);
        setListed(out.pub);
        notify(out.pub ? `房间 ${room} 已设为公开，大厅里能看见它` : `房间 ${room} 已设为私密：只有拿房间码的人进得来`);
        return out.pub;
      }
      // 服务端没把元信息带回来 = 这一层它不认：老站点照样让人挂牌，只是谁都看得见
      const on = await link().roomFeature(room, next);
      setListed(on);
      notify(on ? `房间 ${room} 已设为公开` : "已设为私密");
      return on;
    } catch (error) {
      notify(manageError(error));
      return false;
    }
  }, [link, manageError, notify]);

  /** 存档与公开大厅的对外接口：所有失败都在这里面收口成一句人话 */
  const archive: TableArchive = useMemo(() => ({
    romId,
    listed,
    supported,
    async save(input) {
      const current = stateRef.current;
      try {
        // 本地搭的桌子从没传过像素：定档前先把图补上传，否则存档里全是空白卡面
        await pushMissingImages(imageKeysOf(current));
        const target = input.id ?? romId ?? null;
        const out = await link().romSave({
          id: target,
          token: target ? romToken(target) : null,
          title: input.title,
          note: input.note,
          state: trimState(current),
          by: identity.current.name,
        });
        if (out.token) rememberRomToken(out.id, out.token);
        // 顺手把列表与本体写进缓存：下次离线也能直接开这份档
        const roms = await link().romList();
        cacheRoms(roms);
        const meta = roms.find((r) => r.id === out.id);
        if (meta) cacheRomPayload({ ...meta, state: current });
        setRomId(out.id);
        notify(`已定档为存档 ${out.id}`);
        return out;
      } catch (error) {
        notify(archiveError(error));
        return null;
      }
    },

    async open(id) {
      try {
        const snap = await link().romOpen(id, { ...who, name: myName });
        adoptRoom(snap, `已从存档 ${id} 摆出一张新桌，你是房主`);
        return "live";
      } catch (error) {
        // 只有连不上才降级到缓存；存档真被删了就直接说没有
        if (error instanceof ApiError && error.code === "network_error") {
          const hit = cachedRomPayload(id);
          if (hit) {
            startLocal(hit.rom.state);
            notify(`离线打开存档 ${id}：这是本机缓存的桌况，改动作不会同步`);
            return "cached";
          }
        }
        notify(archiveError(error));
        return false;
      }
    },

    async read(id) {
      try {
        const rom = await link().romGet(id);
        cacheRomPayload(rom);
        return { rom, cached: false };
      } catch (error) {
        if (isMissing(error)) {
          notify("这个存档不存在，可能已经被删除");
          return null;
        }
        const hit = cachedRomPayload(id);
        if (hit) return { rom: hit.rom, cached: true };
        notify(archiveError(error));
        return null;
      }
    },

    async remove(id) {
      const secret = romToken(id);
      if (!secret) {
        notify("这台浏览器没有该存档的口令，删不掉它");
        return false;
      }
      try {
        await link().romRemove(id, secret);
        dropRomPayload(id);
        forgetRomToken(id);
        if (romId === id.toUpperCase()) setRomId(null);
        cacheRoms(await link().romList());
        notify(`存档 ${id} 已删除`);
        return true;
      } catch (error) {
        notify(archiveError(error));
        return false;
      }
    },

    async list() {
      try {
        const roms = await link().romList();
        cacheRoms(roms);
        return { roms, cached: false };
      } catch (error) {
        const hit = cachedRoms();
        if (hit) return { roms: hit.list, cached: true };
        notify(archiveError(error));
        return { roms: [], cached: false };
      }
    },

    async lobby() {
      try {
        return await link().roomList();
      } catch {
        return [];
      }
    },

    async feature(next) {
      return await setPublic(next);
    },
  }), [adoptRoom, archiveError, link, listed, myName, notify, romId, setPublic, startLocal, supported, who]);

  /** 房主管理：口令只在本机，服务端按摘要认人，成员拿不到它也改不了设置 */
  const manage = useMemo<TableManage>(() => ({
    host,
    available: !!room,
    room,
    granted,

    async setPub(next) {
      if (!host) {
        notify("只有房主能改这间房的公开私密");
        return false;
      }
      return await setPublic(next);
    },

    async setGameMode(next) {
      const code = codeRef.current;
      const secret = code ? roomToken(code) : null;
      if (!code || !host) {
        notify(next ? "只有房主能把这间房切进游戏模式" : "只有房主能把这间房退回编辑");
        return false;
      }
      try {
        const out = await link().roomPerm(code, secret ?? "", { gm: next });
        if (!out) {
          notify("这台服务器还不认房间设置：可以用下面的「只锁自己这台」");
          return false;
        }
        // 服务端已经把它推给全桌了，这里只是让自己这端立刻见效，不等那一趟往返
        setRoom(out);
        notify(out.gm
          ? "已进入游戏模式：编辑与删除对全桌收起，添个计时器骰子这些还在"
          : "已退出游戏模式：桌面上的东西又能改能删了");
        return out.gm;
      } catch (error) {
        notify(manageError(error));
        return false;
      }
    },

    async setPerms(next) {
      const code = codeRef.current;
      const secret = code ? roomToken(code) : null;
      if (!code || !host) {
        notify("只有房主能分配权限");
        return false;
      }
      try {
        const out = await link().roomPerm(code, secret ?? "", { perms: next });
        if (out) setRoom(out);
        notify("成员权限已更新，他们的下一次操作就按新规矩算");
        return true;
      } catch (error) {
        notify(manageError(error));
        return false;
      }
    },

    async kick(clientId) {
      const code = codeRef.current;
      const secret = code ? roomToken(code) : null;
      if (!code || !host) {
        notify("只有房主能移出成员");
        return false;
      }
      try {
        await link().roomKick(code, secret ?? "", clientId);
        notify("已移出房间：他再进来会被拒");
        void heartbeat();
        return true;
      } catch (error) {
        notify(manageError(error));
        return false;
      }
    },
  }), [granted, heartbeat, host, link, manageError, notify, room, setPublic]);

  const refreshOnline = useCallback(async () => {
    try {
      setOnlineUsers(await link().online());
    } catch {
      /* 总站名单只是看看，拿不到就留着上一份 */
    }
  }, [link]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    setHistoryDepth(history.current.length);
    if (!prev) {
      notify("没有可撤销的步骤");
      return;
    }
    history.current = history.current.slice();
    // 撤销只在无人同时操作时生效，避免覆盖他人的最新改动
    const next = apply(prev, { t: "chat", text: "撤销了上一步" }, identity.current.name, identity.current.color);
    commitState(next);
    if (modeRef.current === "online" && codeRef.current) {
      queue.current.push({ action: { t: "chat", text: "撤销了上一步" }, state: next, retry: false, tries: 0 });
      void pump();
    }
  }, [commitState, notify, pump]);

  const images: ImageTransport = useMemo(() => ({
    put: (key, data) => link().putImage(key, data),
    get: (keys) => link().getImages(keys),
  }), [link]);

  useEffect(() => {
    rememberNick(myName);
  }, [myName]);

  /** 桌况随时落一份本机缓存：断网、刷新、服务器重启都不该让人看到空桌 */
  useEffect(() => {
    if (mode === "online" && code) cacheRoom(code, state, version);
    else if (mode === "local") cacheLocalTable(state, version);
  }, [code, mode, state, version]);

  useEffect(() => () => nudge?.close(), [nudge]);
  /** 随身听那条互传的路：递字节与求歌都从实时通道走，轮询回落时这套就整个哑掉 */
  useEffect(() => {
    setTrackTransport({
      ask: (code, to, key) => rt.askTrack?.(code, to, key),
      push: (code, to, key, seq, total, data) => rt.sendTrackPart?.(code, to, key, seq, total, data),
    });
    return () => {
      setTrackTransport(null);
      stopTracks();
    };
  }, [rt]);
  useEffect(() => () => rt.close(), [rt]);

  return {
    state, mode, code, version, presence, peers: Object.keys(presence).length, status, busy,
    canUndo: historyDepth > 0, me: { id: clientId, name: myName, color: myColor }, rollSignal,
    images, lag, link: () => (rt.up() ? "realtime" : "polling"),
    archive, manage, who, gaming, online: onlineUsers, refreshOnline,
    sendDrag, askImages, askTrack, onPeerDrag,
    setName, dispatch, startLocal, createRoom, joinRoom, leaveRoom, undo,
  };
}

export const OBJECT_CAP = MAX_OBJECTS;
