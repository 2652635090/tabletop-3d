// 实时通道：一条常驻 WebSocket 走完整套房间协议，服务器一有变动就推给我们。
// 连不上时 useTable 会自动改回 /functions 轮询，所以这里只负责“连上时有多快、断了多快回来”。
import { apiError, readOnline, readRom, readRoms, readRooms, readRomSave, readRoom, readSnapshot, type CommitResult, type ListedRoom, type LobbyUser, type Owner, type RomMeta, type RomPayload, type RomSaveInput, type RomSaveResult, type RoomPatch, type RoomSnapshot, type Who } from "./api";
import { AUDIO_KEY } from "./catalog";
import type { Action, Move, Presence, RoomInfo, TableState } from "./types";

export type LinkKind = "realtime" | "polling";

/** 别人正在拖的这几张牌此刻在哪：只用来画预览，落定还是等桌面推送 */
export interface DragMark {
  by: string;
  color: string;
  m: Move[];
  /** drag＝正拖着走；pick＝只是选中着，位置照桌面那份为准。缺省按 drag 处理 */
  s?: "drag" | "pick";
}

/** 服务器主动推的一份增量：桌面变了、在线名单变了，或者房主刚改了房间设置 */
export interface Push {
  version?: number;
  state?: TableState | null;
  presence?: Presence;
  drag?: DragMark;
  /** 房主改了公开私密或成员权限：成员要立刻按新规矩收自己的手 */
  room?: RoomInfo | null;
  /** 同桌有人缺这几张自传图：谁本机存着就往服务器补传一份 */
  ask?: string[];
  /** 有人想听你那台随身听里的这首歌：本机有字节就一段一段往他那儿递（服务器一份都不存） */
  want?: { from: string; key: string };
  /** 同学递来的一段歌：seq 是段号，total 是总段数，data 是这一段的 base64 */
  part?: { from: string; key: string; seq: number; total: number; data: string };
}

const PING_MS = 2000;
const BACK_MIN = 400;
const BACK_MAX = 6000;
/** 一次调用的兜底超时：连接看着在但服务器不回，也不能把界面钉死 */
const CALL_MS = 12000;

/** 同源的 /ws：https 页面自动升 wss，因此不会有混合内容问题 */
export function realtimeUrl(): string {
  if (typeof location === "undefined" || !location.host) return "";
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

/** useTable 每条链路只用到这几个方法；轮询版的 api 对象天然满足同一份形状 */
export interface RoomLink {
  create(state: TableState, owner?: Owner): Promise<RoomSnapshot>;
  join(code: string, who?: Who): Promise<RoomSnapshot>;
  sync(code: string, base: number): Promise<{ changed: boolean; version: number; state: TableState | null; presence: Presence; room?: RoomInfo | null }>;
  commit(code: string, base: number, intent: Action, state: TableState, by: string, who?: Who): Promise<CommitResult>;
  presence(code: string, clientId: string, name: string, color: string, rtt?: number | null, fp?: string): Promise<Presence>;
  putImage(key: string, data: string): Promise<void>;
  getImages(keys: string[]): Promise<{ images: Record<string, string>; omitted: string[] }>;
  /** 向同桌求几张服务器没有的自传图：只有实时链路做得到，轮询版干脆没有这个方法 */
  askImages?(code: string, keys: string[]): void;
  /** 向同桌那一位要一首歌：这首歌的字节不在服务器上，只在他自己电脑里 */
  askTrack?(code: string, to: string, key: string): void;
  /** 把本机一首歌的一段递给那位同学：只发这一趟，服务器不落一份存储 */
  sendTrackPart?(code: string, to: string, key: string, seq: number, total: number, data: string): void;
  /** 持久化房间：房间可以随时定档成 ROM，存档不受空闲清理影响 */
  romList(): Promise<RomMeta[]>;
  romGet(id: string): Promise<RomPayload>;
  romOpen(id: string, owner?: Owner): Promise<RoomSnapshot>;
  romSave(input: RomSaveInput): Promise<RomSaveResult>;
  romRemove(id: string, token: string): Promise<void>;
  /** 公开大厅：只有设为公开的房间会出现在这里 */
  roomList(): Promise<ListedRoom[]>;
  roomFeature(code: string, listed: boolean, token?: string): Promise<boolean>;
  /** 房主改房间设置（公开私密 / 成员权限表），口令不对服务端直接拒 */
  roomPerm(code: string, token: string, patch: RoomPatch): Promise<RoomInfo | null>;
  roomKick(code: string, token: string, clientId: string): Promise<boolean>;
  /** 退回本地桌面时销名，总站名单不用等超时 */
  roomLeave(code: string, who: Who): Promise<void>;
  /** 总站在线名单：跨房间 */
  online(): Promise<LobbyUser[]>;
}

export interface RealtimeLink extends RoomLink {
  up(): boolean;
  /** 本机到服务器的往返毫秒，还没量出来是 null */
  rtt(): number | null;
  ensure(): void;
  close(): void;
  subscribe(fn: (push: Push) => void): () => void;
  onStatus(fn: (up: boolean) => void): () => void;
  /** 拖动途中的瞬时位置 / 选中态：发出去就完事，没连上通道时静默丢掉，桌面状态本身不靠它 */
  sendDrag(code: string, by: string, color: string, moves: Move[], mode?: "drag" | "pick"): void;
}

interface Slot {
  resolve(value: Record<string, unknown>): void;
  reject(error: Error): void;
  timer: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

/** 服务器转来的拖动帧：形状不对就当作没收到——这条链路宁可少画一帧也不抛错 */
export function readDrag(message: Record<string, unknown>): DragMark | null {
  if (typeof message.by !== "string" || !message.by || !Array.isArray(message.m)) return null;
  const s: "drag" | "pick" = message.s === "pick" ? "pick" : "drag";
  const m: Move[] = [];
  for (const raw of message.m) {
    if (m.length >= 24) break;
    if (!isObject(raw) || typeof raw.id !== "string") continue;
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.z)) continue;
    m.push({ id: raw.id, x: Number(raw.x), z: Number(raw.z), rot: Number.isFinite(raw.rot) ? Number(raw.rot) : undefined });
  }
  // 选中帧允许一张也没有：那是「他刚把选中的全松掉了」，得让下面把图标收掉
  if (!m.length && s !== "pick") return null;
  return { by: message.by, color: typeof message.color === "string" ? message.color : "#c8443c", m, s };
}

export function createRealtime(url = realtimeUrl()): RealtimeLink {
  let socket: WebSocket | null = null;
  let seq = 0;
  let attempt = 0;
  let closed = false;
  let measured: number | null = null;
  let nextTry = 0;
  const slots = new Map<number, Slot>();
  const pushes = new Set<(push: Push) => void>();
  const statuses = new Set<(up: boolean) => void>();

  function isOpen(): boolean {
    return !!socket && socket.readyState === WebSocket.OPEN;
  }

  function setUp(next: boolean): void {
    for (const fn of [...statuses]) fn(next);
  }

  function rejectAll(): void {
    for (const [, slot] of slots) {
      window.clearTimeout(slot.timer);
      slot.reject(apiError("network_error"));
    }
    slots.clear();
  }

  /** 幂等：想连通就调它，退避没到点就什么也不做 */
  function ensure(): void {
    if (closed || !url || isOpen()) return;
    if (socket && socket.readyState === WebSocket.CONNECTING) return;
    if (Date.now() < nextTry) return;
    dial();
  }

  function dial(): void {
    if (closed || !url || isOpen()) return;
    nextTry = Date.now() + Math.min(BACK_MAX, BACK_MIN * 2 ** Math.min(attempt, 4));
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      attempt += 1;
      return;
    }
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      nextTry = 0;
      measured = null;
      ping();
      setUp(true);
    };
    ws.onmessage = (event) => {
      const message = parse(String(event.data));
      if (!message) return;
      const id = typeof message.id === "number" ? message.id : null;
      if (id !== null && slots.has(id)) {
        const slot = slots.get(id)!;
        slots.delete(id);
        window.clearTimeout(slot.timer);
        slot.resolve(message);
        return;
      }
      if (message.t === "pong" && typeof message.at === "number") {
        const sample = Date.now() - message.at;
        // 只采信合理量级的样本：机器休眠时的巨大值不该把显示数字拉飞
        if (sample >= 0 && sample < 5000) measured = measured === null ? sample : Math.round(measured * 0.6 + sample * 0.4);
        return;
      }
      if (message.t === "drag") {
        const mark = readDrag(message);
        if (mark) for (const fn of [...pushes]) fn({ drag: mark });
        return;
      }
      if (message.t === "roomMeta") {
        const meta = readRoom(message.room);
        if (meta) for (const fn of [...pushes]) fn({ room: meta });
        return;
      }
      if (message.t === "askImage") {
        // 同桌有人缺图：把缺的这几个 key 转给本地，本地有就顺手补传服务器
        const keys = Array.isArray(message.keys) ? (message.keys as unknown[]).filter((k): k is string => typeof k === "string") : [];
        if (keys.length) for (const fn of [...pushes]) fn({ ask: keys.slice(0, 64) });
        return;
      }
      if (message.t === "mp3Want") {
        // 有人点了「一起听」：这一句只冲本机来，把曲目转给本地去递字节
        const from = typeof message.from === "string" ? message.from : "";
        const key = typeof message.key === "string" && AUDIO_KEY.test(message.key) ? message.key : "";
        if (from && key) for (const fn of [...pushes]) fn({ want: { from, key } });
        return;
      }
      if (message.t === "mp3Part") {
        // 同学递来的一段：形状不对就当没收到，缺的那一段后面自有重求
        const from = typeof message.from === "string" ? message.from : "";
        const key = typeof message.key === "string" && AUDIO_KEY.test(message.key) ? message.key : "";
        const seq = Number(message.seq);
        const total = Number(message.total);
        const data = typeof message.data === "string" && message.data.length <= 140000 ? message.data : "";
        if (from && key && data && Number.isInteger(seq) && seq >= 0 && Number.isInteger(total) && total > seq) {
          for (const fn of [...pushes]) fn({ part: { from, key, seq, total, data } });
        }
        return;
      }
      if (message.t !== "room" && message.t !== "presence") return;
      const push: Push = {
        version: typeof message.version === "number" ? message.version : undefined,
        state: isObject(message.state) ? (message.state as unknown as TableState) : undefined,
        presence: isObject(message.presence) ? (message.presence as Presence) : undefined,
      };
      // 桌面推送顺带把房间设置带来：房主刚改的权限表不该等到下一次轮询才生效
      const meta = readRoom(message.room);
      if (meta) push.room = meta;
      for (const fn of [...pushes]) fn(push);
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      rejectAll();
      setUp(false);
      attempt += 1;
      ensure();
    };
    ws.onerror = () => {
      /* close 紧随其后，那里统一收口 */
    };
  }

  function parse(text: string): Record<string, unknown> | null {
    try {
      const value: unknown = JSON.parse(text);
      return isObject(value) ? value : null;
    } catch {
      return null;
    }
  }

  /** 帧 id 是回执对号的唯一凭据，所以负载里不许再出现第二个 `id`：存档号一律走 `romId` */
  function call(op: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!url || closed) return reject(apiError("network_error"));
      if (!isOpen()) {
        ensure();
        return reject(apiError("network_error"));
      }
      const id = ++seq;
      const timer = window.setTimeout(() => {
        slots.delete(id);
        reject(apiError("network_error"));
      }, CALL_MS);
      slots.set(id, { resolve, reject, timer });
      try {
        socket!.send(JSON.stringify({ id, op, ...payload }));
      } catch {
        window.clearTimeout(timer);
        slots.delete(id);
        reject(apiError("network_error"));
      }
    });
  }

  /** 只发不收：拖动帧这类瞬时数据没有回执，链路没开着就当没这回事 */
  function fire(op: string, payload: Record<string, unknown>): void {
    if (!url || closed || !isOpen()) return;
    try {
      socket!.send(JSON.stringify({ op, ...payload }));
    } catch {
      /* 断线由 onclose 统一收口，这一帧丢了就丢了 */
    }
  }

  function ping(): void {
    if (!isOpen()) return;
    try {
      socket!.send(JSON.stringify({ op: "ping", at: Date.now() }));
    } catch {
      /* 随后的 onclose 会接手 */
    }
  }

  // 每 2 秒量一次 RTT，顺手把掉下去的连接捞回来
  const beat = typeof window === "undefined" ? 0 : window.setInterval(() => {
    if (isOpen()) ping();
    else ensure();
  }, PING_MS);

  function failed(message: Record<string, unknown>): never {
    const code = typeof message.error === "string"
      ? message.error
      : typeof message.rejected === "string"
        ? (message.rejected === "tooLarge" ? "state_too_large" : "invalid_state")
        : "invalid_response";
    throw apiError(code);
  }

  return {
    up: isOpen,
    rtt: () => measured,
    ensure,
    close() {
      closed = true;
      if (beat) window.clearInterval(beat);
      rejectAll();
      try {
        socket?.close();
      } catch {
        /* 已经关了 */
      }
      socket = null;
    },
    subscribe(fn) {
      pushes.add(fn);
      return () => pushes.delete(fn);
    },
    onStatus(fn) {
      statuses.add(fn);
      return () => statuses.delete(fn);
    },

    sendDrag(code, by, color, moves, mode = "drag") {
      if (!moves.length && mode !== "pick") return;
      fire("drag", {
        code,
        by,
        color,
        s: mode,
        m: moves.slice(0, 24).map((mv) => ({ id: mv.id, x: mv.x, z: mv.z, rot: mv.rot })),
      });
    },

    async create(state, owner) {
      const r = await call("create", { state, clientId: owner?.id ?? "", fp: owner?.fp ?? "", ownerName: owner?.name ?? "" });
      if (r.ok === false) return failed(r);
      return readSnapshot(r);
    },

    async join(code, who) {
      const r = await call("join", { code, clientId: who?.id ?? "", fp: who?.fp ?? "" });
      if (r.ok === false) return failed(r);
      return readSnapshot(r, code);
    },

    async sync(code, base) {
      const r = await call("sync", { code, base });
      if (r.ok === false) return failed(r);
      const presence = isObject(r.presence) ? (r.presence as Presence) : {};
      const version = typeof r.version === "number" ? r.version : base;
      const room = readRoom(r.room);
      if (r.changed === false) return { changed: false, version, state: null, presence, room };
      if (!isObject(r.state)) throw apiError("invalid_response");
      return { changed: true, version, state: r.state as unknown as TableState, presence, room };
    },

    async commit(code, base, intent, state, by, who) {
      const r = await call("commit", { code, base, state, by, clientId: who?.id ?? "", fp: who?.fp ?? "" });
      // 被拒或版本落后都当冲突处理：交回权威桌面，由上层按原意图重放
      if (!isObject(r.state) || typeof r.version !== "number") return failed(r);
      return {
        ok: r.ok !== false,
        conflict: r.ok === false || r.conflict === true,
        version: r.version,
        state: r.state as unknown as TableState,
        presence: isObject(r.presence) ? (r.presence as Presence) : undefined,
        rejected: typeof r.hint === "string" ? r.hint : undefined,
        room: readRoom(r.room),
      };
    },

    async presence(code, clientId, name, color, rtt, fp) {
      const r = await call("presence", { code, clientId, name, color, rtt, fp });
      if (r.ok === false) return failed(r);
      return isObject(r.presence) ? (r.presence as Presence) : {};
    },

    async putImage(key, data) {
      const r = await call("putImage", { key, data });
      if (r.ok === false) return failed(r);
    },

    async getImages(keys) {
      const r = await call("getImage", { keys });
      if (r.ok === false) return failed(r);
      const raw = isObject(r.images) ? r.images : {};
      const images: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") images[k] = v;
      const omitted = Array.isArray(r.omitted) ? (r.omitted as unknown[]).filter((k): k is string => typeof k === "string") : [];
      return { images, omitted };
    },

    async askImages(code, keys) {
      if (!keys.length) return;
      fire("askImage", { code, keys: keys.slice(0, 64) });
    },

    askTrack(code, to, key) {
      if (!AUDIO_KEY.test(key) || !to) return;
      fire("mp3Want", { code, to, key });
    },

    sendTrackPart(code, to, key, seq, total, data) {
      if (!AUDIO_KEY.test(key) || !to || !data) return;
      fire("mp3Part", { code, to, key, seq, total, data });
    },

    async romList() {
      const r = await call("romList", {});
      if (r.ok === false) return failed(r);
      return readRoms(r.roms);
    },

    async romGet(id) {
      const r = await call("romGet", { romId: id });
      if (r.ok === false) return failed(r);
      return readRom(r);
    },

    async romOpen(id, owner) {
      const r = await call("romOpen", { romId: id, clientId: owner?.id ?? "", fp: owner?.fp ?? "", ownerName: owner?.name ?? "" });
      if (r.ok === false) return failed(r);
      return readSnapshot(r);
    },

    async romSave(input) {
      const r = await call("romSave", {
        romId: input.id || null,
        token: input.token || null,
        title: input.title,
        note: input.note ?? "",
        by: input.by,
        state: input.state,
      });
      if (r.ok === false) return failed(r);
      return readRomSave(r);
    },

    async romRemove(id, token) {
      const r = await call("romRemove", { romId: id, token });
      if (r.ok === false) return failed(r);
    },

    async roomList() {
      const r = await call("roomList", {});
      if (r.ok === false) return failed(r);
      return readRooms(r.rooms);
    },

    async roomFeature(code, listed, token) {
      const r = await call("roomFeature", { code, listed, token: token ?? "" });
      if (r.ok === false) return failed(r);
      return r.listed === true;
    },

    async roomPerm(code, token, patch) {
      // 三个字段都得点名转出去：服务端读的是这份字面量，漏一个那条链路就静默丢掉一个设置
      const r = await call("roomPerm", { code, token, pub: patch.pub ?? null, gm: patch.gm ?? null, perms: patch.perms ?? null });
      if (r.ok === false) return failed(r);
      return readRoom(r.room);
    },

    async roomKick(code, token, clientId) {
      const r = await call("roomKick", { code, token, clientId });
      if (r.ok === false) return failed(r);
      return r.ok === true;
    },

    async roomLeave(code, who) {
      const r = await call("roomLeave", { code, clientId: who.id, fp: who.fp });
      if (r.ok === false) return failed(r);
    },

    async online() {
      const r = await call("online", {});
      if (r.ok === false) return failed(r);
      return readOnline(r.users);
    },
  };
}
