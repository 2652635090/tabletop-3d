import { ARROW_MAX, ARROW_MIN, AUDIO_KEY, IMAGE_KEY, LAYER_MAX, SPIN_MAX, SPIN_MIN, TRACK_MARK_MAX, TRACK_MAX, TRACK_MIN, clampTilt, fixBackImg, fixBook, fixCard, fixCounter, fixGram, fixHour, fixMp3, fixShield, fixSlot, fixSpinner, fixStat, fixTablet, fixTrack, fixTray, fixZone, gridable, pinnable, timerOf } from "./catalog";
import { fixCalcExpr } from "./calc";
import { fixPerms, type Perms } from "./perm";
import type { Action, BoardSpec, CardSpec, GameObject, LobbyUser, Presence, RoomInfo, TableState } from "./types";

/** 两条链路（WebSocket 与轮询）共用这里的解析与类型，免得两边各认一份形状 */
export type { LobbyUser, RoomInfo } from "./types";

/** 桌垫大图同理：像素走 card_images，状态里只留 key */
function usableBoard(spec: BoardSpec | undefined): BoardSpec | undefined {
  if (!spec || spec.img === undefined) return spec;
  const next = { ...spec };
  if (typeof next.img !== "string" || !IMAGE_KEY.test(next.img)) delete next.img;
  return next;
}

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status = 0) {
    super(message);
    this.name = "ApiError";
  }
}

const MESSAGES: Record<string, string> = {
  network_error: "无法连接到房间服务，请检查网络后再试。",
  invalid_response: "房间服务返回了无法识别的响应。",
  access_denied: "没有访问该房间的权限。",
  room_not_found: "房间不存在，或房间码已失效。",
  room_full: "这个房间的人数已达上限。",
  state_too_large: "桌面内容超出上限，请先收纳一部分物件。",
  conflict: "有其他人同时操作，已同步最新桌面。",
  service_unavailable: "房间服务暂时不可用。",
  invalid_input: "提交的内容不被接受。",
  invalid_state: "这份桌面数据没有被房间服务接受。",
  invalid_request: "这条请求没有被房间服务接受。",
  image_rejected: "这张图没有被房间服务接受，换一张试试。",
  internal_error: "房间服务出了点问题，请稍后再试。",
  image_too_large: "这张图压不到合适的卡面大小，换一张小一点的图。",
  audio_too_large: "这首曲子太大，装不进唱片机，先剪短一些。",
  audio_unsupported: "这个站点没有放唱片的地方：音频要传到自建服务器的二进制门上，Sites 那份只有 256KB 的 JSON 通道。",
  audio_missing: "服务器上找不到这张唱片，可能已经被清掉了。",
  rom_not_found: "这个存档不存在，可能已经被删除。",
  rom_limit: "服务器上的存档满了，先删掉几个旧档。",
  unknown_op: "这个站点还没有房间存档与牌桌列表功能。",
  not_owner: "这个设置只有房主能改。",
  bad_token: "房主口令不对，这份房间记录不是本机开的。",
  kicked: "房主把你请出了这个房间。",
  no_perm: "房主没有开放这项操作。",
};

/** 传输层（轮询 / 实时）共用同一套错误码与文案，UI 只需要认 ApiError */
export function apiError(code: string, status = 0): ApiError {
  return new ApiError(MESSAGES[code] ?? MESSAGES.invalid_response, code, status);
}

/** 二进制门回的错误：认得出错误码就用它，认不出（比如静态托管回了一页 HTML）就算这站点没这条路 */
async function audioFault(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body?.error === "string") return body.error;
  } catch {
    /* 回的不是 JSON：多半是静态托管，下面按「不支持」报 */
  }
  return "audio_unsupported";
}

/** 与同源 Function 通信；失败时抛出带应用错误码的 ApiError，不展示原始服务信息。 */
export async function requestJson<T extends Record<string, unknown>>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/functions/v1/app", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError(MESSAGES.network_error, "network_error");
  }
  if (response.status === 401 || response.status === 403) throw apiError("access_denied", response.status);
  let data: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try { data = await response.json(); } catch { data = null; }
  }
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const code = typeof obj?.error === "string" ? obj.error : !response.ok ? (obj ? "invalid_input" : "invalid_response") : null;
  if (code) {
    throw apiError(code, response.status);
  }
  return obj as T;
}

export interface RoomSnapshot {
  code: string;
  version: number;
  state: TableState;
  presence: Presence;
  /** 这张桌子是从哪份存档开出来的 */
  romId?: string;
  romTitle?: string;
  listed?: boolean;
  /** 房主/公开私密/权限表；老站点没有这一层时是 undefined，客户端按「人人自由」处理 */
  room?: RoomInfo;
  /** 只有创建房间那次会回：房主口令，此后改设置都要带上它 */
  token?: string;
}

export interface CommitResult {
  ok: boolean;
  conflict?: boolean;
  version: number;
  state: TableState;
  presence?: Presence;
  /** 服务端按权限表回退过越权改动：这里是给人看的那一句人话 */
  rejected?: string;
  /** 顺带带回来的房间元信息：房主刚改的权限表不用等下一轮同步才生效 */
  room?: RoomInfo | null;
}

/** 提交者身份：clientId 认当前这次的会话，fp 认这台浏览器（刷新后 clientId 会变，指纹不会） */
export interface Who {
  id: string;
  fp: string;
}

/** 房主改房间设置：只允许动公开标记、游戏模式与权限表，房主本身不可转让 */
export interface RoomPatch {
  pub?: boolean;
  gm?: boolean;
  perms?: Perms;
}

/** 开房时登记下来的房主身份：昵称只是展示，认人靠 id 与指纹 */
export interface Owner extends Who {
  name: string;
}

/** 一份 ROM 存档的目录条目：桌面本体要单独 romGet 才拿得到 */
export interface RomMeta {
  id: string;
  title: string;
  note: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  objects: number;
}

export interface RomPayload extends RomMeta {
  state: TableState;
}

/** 公开大厅里挂着牌的真房间 */
export interface ListedRoom {
  code: string;
  name: string;
  peers: number;
  objects: number;
  romId?: string;
  /** 房主的昵称：大厅里让人知道这桌是谁的 */
  host?: string;
  updatedAt: number;
}

export interface RomSaveResult {
  id: string;
  /** 只有新档才回口令；改档要带着它，所以别处拿不到 */
  token?: string;
  updatedAt: number;
}

/** 定档入参：id 为空是新档，带 id + token 才是覆盖自己的旧档 */
export interface RomSaveInput {
  id?: string | null;
  token?: string | null;
  title: string;
  note?: string;
  state: TableState;
  by: string;
}

/** 存档/房间被删是正常结局而不是故障：让 UI 用一句话收场，而不是弹错误 */
export function isMissing(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "rom_not_found" || error.code === "room_not_found");
}

/** 站点后端不支持这些协议时（比如 Sites 那份 Edge Function）回 unknown_op，UI 要能安静降级 */
export function isUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "unknown_op" || error.code === "invalid_input" || error.code === "invalid_request");
}

/** 存档号在两条链路里的落点：HTTP 直接给顶层 id，实时那份让位给帧 id，走 romId */
function romIdOf(r: Record<string, unknown>): string {
  const raw = typeof r.id === "string" ? r.id : typeof r.romId === "string" ? r.romId : "";
  return raw.toUpperCase();
}

function looksLikeRom(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return /^[A-Z0-9]{8}$/.test(romIdOf(r)) && typeof r.title === "string";
}

function toRom(v: unknown): RomMeta | null {
  if (!looksLikeRom(v)) return null;
  const r = v as Record<string, unknown>;
  return {
    id: romIdOf(r),
    title: String(r.title ?? "").slice(0, 40),
    note: typeof r.note === "string" ? r.note.slice(0, 160) : "",
    owner: typeof r.owner === "string" ? r.owner.slice(0, 20) : "",
    createdAt: Number.isFinite(r.createdAt as number) ? Number(r.createdAt) : 0,
    updatedAt: Number.isFinite(r.updatedAt as number) ? Number(r.updatedAt) : 0,
    objects: Number.isFinite(r.objects as number) ? Number(r.objects) : 0,
  };
}

function toRoom(v: unknown): ListedRoom | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.code !== "string" || !/^[A-Z0-9]{4,8}$/.test(r.code)) return null;
  const out: ListedRoom = {
    code: r.code,
    name: typeof r.name === "string" ? r.name.slice(0, 40) : "牌桌",
    peers: Number.isFinite(r.peers as number) ? Number(r.peers) : 0,
    objects: Number.isFinite(r.objects as number) ? Number(r.objects) : 0,
    updatedAt: Number.isFinite(r.updatedAt as number) ? Number(r.updatedAt) : 0,
  };
  if (typeof r.romId === "string" && /^[A-Z0-9]{8}$/.test(r.romId)) out.romId = r.romId;
  if (typeof r.host === "string" && r.host) out.host = r.host.slice(0, 20);
  return out;
}

/** 两条链路共用同一份解析：轮询版和实时版对同一响应的读法不能分叉 */
export function readRoms(value: unknown): RomMeta[] {
  return Array.isArray(value) ? value.map(toRom).filter((x): x is RomMeta => !!x).slice(0, 60) : [];
}

export function readRooms(value: unknown): ListedRoom[] {
  return Array.isArray(value) ? value.map(toRoom).filter((x): x is ListedRoom => !!x).slice(0, 60) : [];
}

/** 房间元信息：服务端没这一层时回 null，客户端按「人人自由」跑 */
export function readRoom(value: unknown): RoomInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  return {
    owner: typeof r.owner === "string" ? r.owner.slice(0, 24) : "",
    ownerName: typeof r.ownerName === "string" ? r.ownerName.slice(0, 20) : "",
    ownerFp: typeof r.ownerFp === "string" ? r.ownerFp.slice(0, 8) : "",
    pub: r.pub === true,
    gm: r.gm === true,
    perms: fixPerms(r.perms),
  };
}

function toLobby(v: unknown): LobbyUser | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id.length) return null;
  return {
    id: r.id.slice(0, 24),
    name: typeof r.name === "string" ? r.name.slice(0, 20) : "玩家",
    fp: typeof r.fp === "string" ? r.fp.slice(0, 8) : "",
    color: /^#[0-9a-fA-F]{6}$/.test(String(r.color ?? "")) ? String(r.color) : "#c8443c",
    room: typeof r.room === "string" ? r.room.slice(0, 8) : null,
    at: Number.isFinite(r.at as number) ? Number(r.at) : 0,
  };
}

/** 总站在线名单：只取形状正确的条目，最多 60 位 */
export function readOnline(value: unknown): LobbyUser[] {
  return Array.isArray(value) ? value.map(toLobby).filter((x): x is LobbyUser => !!x).slice(0, 60) : [];
}

export function readRom(value: unknown): RomPayload {
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const meta = toRom(r);
  if (!meta || !isState(r?.state)) throw apiError("invalid_response");
  // 服务端存档与读档都过一遍 validState，所以这里和房间一样只认形状
  return { ...meta, state: r!.state as TableState };
}

export function readRomSave(value: unknown): RomSaveResult {
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const id = romIdOf(r ?? {});
  if (!/^[A-Z0-9]{8}$/.test(id)) throw apiError("invalid_response");
  const out: RomSaveResult = { id, updatedAt: Number.isFinite(r?.updatedAt as number) ? Number(r?.updatedAt) : Date.now() };
  if (typeof r?.token === "string" && r.token.length) out.token = r.token;
  return out;
}

/** create/join/romOpen 回的都是同一份形状：解析一次，两条链路共用 */
export function readSnapshot(value: unknown, fallbackCode = ""): RoomSnapshot {
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!r || !isState(r.state)) throw apiError("invalid_response");
  const out: RoomSnapshot = {
    code: typeof r.code === "string" ? r.code : fallbackCode,
    version: typeof r.version === "number" ? r.version : 1,
    state: r.state,
    presence: isPresence(r.presence) ? r.presence : {},
  };
  if (typeof r.romId === "string" && /^[A-Z0-9]{8}$/.test(r.romId)) out.romId = r.romId;
  if (typeof r.romTitle === "string") out.romTitle = r.romTitle.slice(0, 40);
  if (r.listed === true) out.listed = true;
  const room = readRoom(r.room);
  if (room) out.room = room;
  if (typeof r.token === "string" && r.token.length) out.token = r.token;
  return out;
}

function isState(v: unknown): v is TableState {
  return !!v && typeof v === "object" && Array.isArray((v as TableState).o) && Array.isArray((v as TableState).log);
}

function isPresence(v: unknown): v is Presence {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function makeClientId(): string {
  const key = "tabletop3d:client";
  try {
    const hit = sessionStorage.getItem(key);
    if (hit) return hit;
    const id = `c${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `c${Math.random().toString(36).slice(2, 10)}`;
  }
}

export const api = {
  async create(state: TableState, owner?: Owner): Promise<RoomSnapshot> {
    const r = await requestJson<Record<string, unknown>>({
      action: "create",
      state,
      clientId: owner?.id ?? "",
      fp: owner?.fp ?? "",
      ownerName: owner?.name ?? "",
    });
    return readSnapshot(r);
  },

  async join(code: string, who?: Who): Promise<RoomSnapshot> {
    const r = await requestJson<Record<string, unknown>>({ action: "join", code, clientId: who?.id ?? "", fp: who?.fp ?? "" });
    return readSnapshot(r, code);
  },

  /** base 与服务端一致时返回 changed:false，避免重复传输整份桌面 */
  async sync(code: string, base: number): Promise<{ changed: boolean; version: number; state: TableState | null; presence: Presence; room?: RoomInfo | null }> {
    const r = await requestJson<Record<string, unknown>>({ action: "sync", code, base });
    const presence = isPresence(r.presence) ? r.presence : {};
    const room = readRoom(r.room);
    if (r.changed === false) return { changed: false, version: typeof r.version === "number" ? r.version : base, state: null, presence, room };
    if (typeof r.version !== "number" || !isState(r.state)) throw apiError("invalid_response");
    return { changed: true, version: r.version, state: r.state, presence, room };
  },

  async commit(code: string, base: number, intent: Action, state: TableState, by: string, who?: Who): Promise<CommitResult> {
    const r = await requestJson<Record<string, unknown>>({ action: "commit", code, base, state, by, clientId: who?.id ?? "", fp: who?.fp ?? "" });
    if (typeof r.version !== "number" || !isState(r.state)) throw apiError("invalid_response");
    return {
      ok: r.ok !== false,
      conflict: r.conflict === true,
      version: r.version,
      state: r.state,
      presence: isPresence(r.presence) ? r.presence : undefined,
      rejected: typeof r.hint === "string" ? r.hint : undefined,
      room: readRoom(r.room),
    };
  },

  /** rtt 是本机实测的往返毫秒，同房间的人据此看到彼此的线路质量 */
  async presence(code: string, clientId: string, name: string, color: string, rtt: number | null = null, fp = ""): Promise<Presence> {
    const r = await requestJson<Record<string, unknown>>({ action: "presence", code, clientId, name, color, rtt, fp });
    return isPresence(r.presence) ? r.presence : {};
  },

  /** 上传一张卡面像素；key 由内容哈希得出，重复上传是幂等的 */
  async putImage(key: string, data: string): Promise<void> {
    await requestJson<Record<string, unknown>>({ action: "putImage", key, data });
  },

  /**
   * 唱片字节走一条同源的原始请求路由（PUT /audio/<key>）：JSON 那条 256KB 的门装不下一首歌。
   * 只有自建网关有这条路；Sites 那份静态托管会把 PUT 顶回来，或把 GET 回落成 index.html，
   * 两种都当成「这站点放不了唱片」如实报出来，绝不把 HTML 当音频塞进播放器。
   */
  async putAudio(key: string, bytes: Blob): Promise<void> {
    if (!AUDIO_KEY.test(key)) throw apiError("invalid_input");
    let response: Response;
    try {
      response = await fetch(`/audio/${key}`, {
        method: "PUT",
        headers: { "content-type": bytes.type || "application/octet-stream" },
        body: bytes,
        credentials: "same-origin",
      });
    } catch {
      throw new ApiError(MESSAGES.network_error, "network_error");
    }
    if (response.ok) return;
    const code = response.status === 413 ? "audio_too_large" : response.status === 400 ? "invalid_input" : await audioFault(response);
    throw apiError(code, response.status);
  },

  /** 取一张唱片的字节；服务器没有（或这站点压根没这条路）就回 null，让调用方去报「取不到」 */
  async getAudio(key: string): Promise<Blob | null> {
    if (!AUDIO_KEY.test(key)) return null;
    let response: Response;
    try {
      response = await fetch(`/audio/${key}`, { method: "GET", credentials: "same-origin" });
    } catch {
      throw new ApiError(MESSAGES.network_error, "network_error");
    }
    if (response.status === 404) return null;
    if (!response.ok) throw apiError(await audioFault(response), response.status);
    // 静态托管会把未知路径回落成入口页：那是一页 HTML，不是一张唱片
    if (!/^(audio|application\/octet-stream)\b/.test(response.headers.get("content-type") ?? "")) return null;
    return await response.blob();
  },

  async getImages(keys: string[]): Promise<{ images: Record<string, string>; omitted: string[] }> {
    const r = await requestJson<Record<string, unknown>>({ action: "getImage", keys });
    const raw = r.images && typeof r.images === "object" ? (r.images as Record<string, unknown>) : {};
    const images: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string") images[k] = v;
    const omitted = Array.isArray(r.omitted) ? (r.omitted as unknown[]).filter((k): k is string => typeof k === "string") : [];
    return { images, omitted };
  },

  async romList(): Promise<RomMeta[]> {
    const r = await requestJson<Record<string, unknown>>({ action: "romList" });
    return readRoms(r.roms);
  },

  async romGet(id: string): Promise<RomPayload> {
    const r = await requestJson<Record<string, unknown>>({ action: "romGet", id });
    return readRom(r);
  },

  async romOpen(id: string, owner?: Owner): Promise<RoomSnapshot> {
    const r = await requestJson<Record<string, unknown>>({
      action: "romOpen",
      id,
      clientId: owner?.id ?? "",
      fp: owner?.fp ?? "",
      ownerName: owner?.name ?? "",
    });
    return readSnapshot(r);
  },

  async romSave(input: RomSaveInput): Promise<RomSaveResult> {
    const r = await requestJson<Record<string, unknown>>({
      action: "romSave",
      id: input.id ?? null,
      token: input.token ?? null,
      title: input.title,
      note: input.note ?? "",
      by: input.by,
      state: input.state,
    });
    return readRomSave(r);
  },

  async romRemove(id: string, token: string): Promise<void> {
    await requestJson<Record<string, unknown>>({ action: "romRemove", id, token });
  },

  async roomList(): Promise<ListedRoom[]> {
    const r = await requestJson<Record<string, unknown>>({ action: "roomList" });
    return readRooms(r.rooms);
  },

  async roomFeature(code: string, listed: boolean, token = ""): Promise<boolean> {
    const r = await requestJson<Record<string, unknown>>({ action: "roomFeature", code, listed, token });
    return r.listed === true;
  },

  /** 房主改房间设置：口令不对服务端直接拒，返回改完的元信息 */
  async roomPerm(code: string, token: string, patch: RoomPatch): Promise<RoomInfo | null> {
    const r = await requestJson<Record<string, unknown>>({
      action: "roomPerm",
      code,
      token,
      pub: patch.pub === undefined ? null : patch.pub === true,
      gm: patch.gm === undefined ? null : patch.gm === true,
      perms: patch.perms ?? null,
    });
    return readRoom(r.room);
  },

  /** 把某人移出房间：服务端记入黑名单，他再进来会被拒 */
  async roomKick(code: string, token: string, clientId: string): Promise<boolean> {
    const r = await requestJson<Record<string, unknown>>({ action: "roomKick", code, token, clientId });
    return r.ok === true;
  },

  /** 退到本地桌面时打招呼：总站名单立刻少一个人，不用等 45 秒超时 */
  async roomLeave(code: string, who: Who): Promise<void> {
    await requestJson<Record<string, unknown>>({ action: "roomLeave", code, clientId: who.id, fp: who.fp });
  },

  /** 总站在线名单：跨房间的全局名册 */
  async online(): Promise<LobbyUser[]> {
    const r = await requestJson<Record<string, unknown>>({ action: "online" });
    return readOnline(r.users);
  },

  /** 本地/远端都需要的最小校验，避免把损坏的对象塞进渲染层 */
  sanitize(state: TableState): TableState {
    const o: GameObject[] = [];
    for (const item of state.o.slice(0, 420)) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.kind !== "string") continue;
      if (typeof item.x !== "number" || typeof item.z !== "number") continue;
      const clean: GameObject = { ...item, rot: Number(item.rot) || 0, layer: Math.max(0, Math.min(LAYER_MAX, Number(item.layer) || 0)) };
      // 高度锁定与俯仰角：和归约器同一套收口
      if (typeof clean.tilt === "number" && Number.isFinite(clean.tilt)) clean.tilt = clampTilt(clean.tilt);
      else delete clean.tilt;
      if (clean.pin !== true || !pinnable(clean)) delete clean.pin;
      // 斜靠只在钉住时成立：和归约器一样，没锁定就把俯仰角抹平
      if (!clean.pin) delete clean.tilt;
      // 与归约器共用同一套收口，脏字段在两端只会有一份结果
      if (clean.card) clean.card = fixCard(clean.card);
      if (Array.isArray(clean.pile)) clean.pile = clean.pile.map((c) => fixCard(c)).filter((c): c is CardSpec => !!c);
      const back = fixBackImg(clean.backImg);
      if (back) clean.backImg = back;
      else delete clean.backImg;
      if (clean.kind === "timer") Object.assign(clean, timerOf(clean));
      else {
        delete clean.endsAt;
        delete clean.duration;
        delete clean.left;
      }
      if (typeof clean.len === "number" && Number.isFinite(clean.len)) clean.len = Math.min(ARROW_MAX, Math.max(ARROW_MIN, clean.len));
      else delete clean.len;
      clean.board = usableBoard(clean.board);
      if (typeof clean.scale === "number" && Number.isFinite(clean.scale)) clean.scale = Math.max(0.2, Math.min(4, clean.scale));
      else delete clean.scale;
      if (typeof clean.owner !== "string" || !clean.owner.length || clean.owner.length > 24) delete clean.owner;
      if (clean.hand !== true) delete clean.hand;
      if (clean.kind === "calc") clean.calc = { expr: fixCalcExpr(clean.calc?.expr) };
      else delete clean.calc;
      if (clean.kind === "zone") {
        clean.zone = fixZone(clean.zone);
        if (clean.priv !== true) delete clean.priv;
        if (clean.pref !== true) delete clean.pref;
      } else {
        delete clean.zone;
        delete clean.priv;
        delete clean.pref;
      }
      // 统计垫：只有它自己带尺寸与锁定；桌垫不带尺寸，但贴了整张大图的桌垫一样可以上锁
      if (clean.kind === "stat") {
        clean.stat = fixStat(clean.stat);
        if (clean.lock !== true) delete clean.lock;
      } else if (clean.kind === "board") {
        delete clean.stat;
        if (clean.lock !== true) delete clean.lock;
      } else {
        delete clean.stat;
        delete clean.lock;
      }
      // 网格锁定是真有格子的棋盘的事：桌垫摊一整张图，锁无可锁
      if (clean.grid !== true || !gridable(clean)) delete clean.grid;
      // 吸附与网格线默认开着，只有 false（关掉）才需要留着
      if (clean.snap !== false || !gridable(clean)) delete clean.snap;
      if (clean.mesh !== false || !gridable(clean)) delete clean.mesh;
      // 棋盘记住自己是哪张预设摆的：吃子与摆回开局都靠它认盘
      if (clean.kind !== "board" || typeof clean.preset !== "string" || !clean.preset.length || clean.preset.length > 24) delete clean.preset;
      // 卡槽带：格数是它唯一的数据，别的种类带上也没意义
      if (clean.kind === "slot") clean.slot = fixSlot(clean.slot);
      else delete clean.slot;
      // 转盘与计分轨同理：各自的字段只属于自己那一种物件
      if (clean.kind === "spinner") clean.spinner = fixSpinner(clean.spinner);
      else delete clean.spinner;
      if (clean.kind === "track") clean.track = fixTrack(clean.track);
      else delete clean.track;
      // 三种配件各自的字段只属于自己的 kind，别的种类带上就是脏数据
      if (clean.kind === "shield") clean.shield = fixShield(clean.shield);
      else delete clean.shield;
      if (clean.kind === "hour") clean.hour = fixHour(clean.hour);
      else delete clean.hour;
      if (clean.kind === "book") clean.book = fixBook(clean.book);
      else delete clean.book;
      if (clean.kind === "gram") clean.gram = fixGram(clean.gram);
      else delete clean.gram;
      // 随身听：与唱片机同一道门，但字节从来不进服务器，这里收口的只是 key 与走带参数
      if (clean.kind === "mp3") clean.mp3 = fixMp3(clean.mp3);
      else delete clean.mp3;
      // 迷你计数器：读数、步进与吸附的宿主，别的种类带上就是脏数据
      if (clean.kind === "counter") clean.counter = fixCounter(clean.counter);
      else delete clean.counter;
      // 骰盘：只有内径这一对数字，别的种类带上就是脏数据
      if (clean.kind === "tray") clean.tray = fixTray(clean.tray);
      else delete clean.tray;
      // 平板浏览器：桌上只有一条地址和几个走带数，页面字节一直待在原来那个站点那边，一个字节都不过服务器
      if (clean.kind === "tablet") clean.tablet = fixTablet(clean.tablet);
      else delete clean.tablet;
      o.push(clean);
    }
    return {
      name: typeof state.name === "string" ? state.name.slice(0, 40) : "牌桌",
      o,
      players: Array.isArray(state.players) ? state.players.filter((p) => p && typeof p.id === "string").slice(0, 8) : [],
      turn: Number.isFinite(state.turn) ? Math.max(0, Math.min(7, Math.round(state.turn))) : 0,
      step: state.step === -1 ? -1 : 1,
      log: Array.isArray(state.log) ? state.log.filter((l) => l && typeof l.text === "string").slice(-80) : [],
    };
  },
};
