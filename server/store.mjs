// 房间存储：内存为准，磁盘做延迟快照。create/join/sync/commit/presence 的语义与
// functions/handler.mjs 的 Supabase 版本一一对应，换传输层不换规则。
// 这一份还比 Edge Function 多两层：房间元信息（房主口令、公开私密、成员权限表、黑名单）
// 与总站在线名册——Supabase 那张 rooms 表没有地方放它们，所以 Sites 那份会直接回不支持。
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join as pathJoin } from "node:path";
import { AUDIO_KEY, AUDIO_MAX_BYTES, IMAGE_BUDGET, IMAGE_DATA, IMAGE_KEY, MAX_BODY, MAX_STATE, TOO_LARGE, randomCode, validCode, validPresence, validRtt, validState } from "../functions/handler.mjs";
import { deniedHint, fixPerms, gateState } from "./perm.mjs";

/** 与轮询版同一份存在性口径：45 秒没心跳就算离开 */
export const PRESENCE_CUTOFF = 45000;
/** 桌上没人再碰这么久就可以把房间从内存和快照里清掉 */
export const ROOM_IDLE_MS = 24 * 3600 * 1000;
const ROOMS_FILE = "rooms.json";
/** ROM 存档的索引（只放元数据），桌面本体一份一个文件，删房间不会连档一起删 */
const ROMS_FILE = "roms.json";
const ROM_ID = /^[A-Z0-9]{8}$/;
/** 存档总数上限：磁盘不是无限的，满了就要求先删旧档 */
const ROM_MAX = 300;
/** 列表一次最多给这么多条，客户端拿去做缓存也够翻几屏 */
const LIST_MAX = 60;
/** 快照写盘的节流间隔；崩溃最多丢这一段时间的桌况 */
const SAVE_DEBOUNCE = 1500;
/** 像素缓存条目上限，超了先丢最早进来的一半，避免桌垫图把内存吃满 */
const IMAGE_CACHE_MAX = 240;
/** 音频仓库的总字节预算：唱片比牌面贵得多，超了就按最久没传的那首先扔，磁盘不是无限的 */
const AUDIO_BUDGET = 256 * 1024 * 1024;
/** 只认这一类 MIME，别的都当未知；原始字节一律不转码，什么格式都能存 */
const AUDIO_MIME = /^audio\/[a-z0-9.+-]{1,24}$/i;
const ROM_TITLE_MAX = 40;
const ROM_NOTE_MAX = 160;
const ROM_NAME_MAX = 20;

function newRomId() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
    if (id.length === 8) return id;
  }
  return null;
}

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

/** 房主口令：和存档口令同一形状，只在开房那一刻回给客户端一次 */
function newToken() {
  return randomBytes(12).toString("hex");
}

/** 指纹短号：客户端算好的 8 位十六进制，服务端只当不透明标签用 */
function validFp(value) {
  return typeof value === "string" && /^[A-Z0-9]{4,16}$/.test(value.toUpperCase()) ? value.toUpperCase() : "";
}

/** 提交者身份：id 认当前会话，fp 认这台浏览器 */
function who(value) {
  const src = value && typeof value === "object" ? value : {};
  const id = typeof src.id === "string" ? src.id.slice(0, 24) : "";
  return { id, fp: validFp(src.fp) };
}

/** 定档口令只在通过时比一次，且用常数时间比较，别把长度当成侧信道 */
function tokenOk(meta, token) {
  if (typeof token !== "string" || !token.length || !meta?.hash) return false;
  const mine = Buffer.from(hashToken(token), "hex");
  const theirs = Buffer.from(String(meta.hash), "hex");
  return mine.length === theirs.length && timingSafeEqual(mine, theirs);
}

export function createTableStore({ dir }) {
  /** @type {Map<string, {code:string,state:unknown,version:number,presence:Record<string,unknown>,updated_at:number,listed?:boolean,romId?:string}>} */
  const rooms = new Map();
  /** @type {Map<string, {id:string,title:string,note:string,owner:string,createdAt:number,updatedAt:number,objects:number,hash:string}>} */
  const roms = new Map();
  /** @type {Map<string, string>} */
  const imageCache = new Map();
  /**
   * 总站在线名册：跨房间，靠心跳续命。
   * 键是 clientId，值只带昵称、指纹短号和此刻在哪个房间——原始设备信息从来不上来。
   * @type {Map<string, {id:string,name:string,fp:string,color:string,room:string|null,at:number}>}
   */
  const roster = new Map();
  const imageDir = pathJoin(dir, "images");
  const romDir = pathJoin(dir, "roms");
  const audioDir = pathJoin(dir, "audio");
  /** 本机认得的唱片 key：只为健康检查报个数，真身永远是磁盘上那些 .bin */
  const audioSeen = new Set();
  let saveTimer = null;
  let romTimer = null;
  let saving = Promise.resolve();

  function keyOf(code) {
    return String(code).toUpperCase();
  }

  /** 房间元信息：房主是谁、公不公开、开没开游戏模式、成员拿到哪些权限。口令摘要绝不在里面。 */
  function roomMeta(room) {
    if (!room?.owner) return null;
    return {
      owner: room.owner.id,
      ownerName: room.owner.name || "",
      ownerFp: room.owner.fp || "",
      pub: room.listed === true,
      gm: room.gaming === true,
      perms: fixPerms(room.perms),
    };
  }

  /** 这台浏览器是不是这个房间的房主：口令摘要之外的第二道认人，刷新后 clientId 变了也算 */
  function isOwner(room, who) {
    const owner = room?.owner;
    if (!owner) return false;
    return (!!who.id && owner.id === who.id) || (!!who.fp && owner.fp === who.fp);
  }

  /** 被房主请出去过：按会话 id 或按指纹，认一个就算 */
  function isBanned(room, who) {
    if (!Array.isArray(room?.banned) || (!who.id && !who.fp)) return false;
    return room.banned.some((b) => (who.id && b.id === who.id) || (who.fp && b.fp === who.fp));
  }

  function snapshot(room) {
    const out = {
      code: room.code,
      version: Number(room.version),
      state: room.state,
      presence: validPresence(room.presence),
    };
    // 挂牌与定档来源只在有时才占字段，老客户端读到的响应形状不变
    if (room.listed === true) out.listed = true;
    if (typeof room.romId === "string" && ROM_ID.test(room.romId)) out.romId = room.romId;
    const meta = roomMeta(room);
    if (meta) out.room = meta;
    return out;
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saving = saving.then(() => flush().catch(() => {})).catch(() => {});
    }, SAVE_DEBOUNCE);
    // 快照只是灾备，不要让一个待写的定时器把进程钉住
    saveTimer.unref?.();
  }

  function scheduleRomSave() {
    if (romTimer) return;
    romTimer = setTimeout(() => {
      romTimer = null;
      saving = saving.then(() => flushRoms().catch(() => {})).catch(() => {});
    }, SAVE_DEBOUNCE);
    romTimer.unref?.();
  }

  async function writeAtomic(file, payload) {
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, payload, "utf8");
    await rename(tmp, file);
  }

  async function flush() {
    const payload = JSON.stringify({
      rooms: [...rooms.values()],
      savedAt: Date.now(),
    });
    await writeAtomic(pathJoin(dir, ROOMS_FILE), payload);
  }

  async function flushRoms() {
    await writeAtomic(pathJoin(dir, ROMS_FILE), JSON.stringify({ roms: [...roms.values()], savedAt: Date.now() }));
  }

  async function loadJson(file) {
    let raw = null;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async function loadRoomsFile() {
    const parsed = await loadJson(pathJoin(dir, ROOMS_FILE));
    const list = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
    for (const item of list.slice(0, 2000)) {
      if (!item || typeof item.code !== "string" || !validCode(item.code)) continue;
      const clean = validState(item.state);
      if (!clean || clean === TOO_LARGE) continue;
      const room = {
        code: keyOf(item.code),
        state: clean,
        version: Number.isFinite(item.version) && item.version > 0 ? Math.floor(item.version) : 1,
        presence: validPresence(item.presence),
        updated_at: Number.isFinite(item.updated_at) ? item.updated_at : Date.now(),
      };
      if (item.listed === true) room.listed = true;
      if (item.gaming === true) room.gaming = true;
      if (typeof item.romId === "string" && ROM_ID.test(item.romId)) room.romId = item.romId;
      const owner = item.owner && typeof item.owner === "object" ? item.owner : null;
      if (owner && typeof owner.hash === "string" && /^[0-9a-f]{64}$/.test(owner.hash)) {
        room.owner = {
          id: typeof owner.id === "string" ? owner.id.slice(0, 24) : "",
          fp: validFp(owner.fp),
          name: typeof owner.name === "string" ? owner.name.slice(0, 20) : "",
          hash: owner.hash,
        };
        room.perms = fixPerms(item.perms);
        room.banned = (Array.isArray(item.banned) ? item.banned : []).slice(0, 32)
          .map((b) => ({ id: typeof b?.id === "string" ? b.id.slice(0, 24) : "", fp: validFp(b?.fp), at: Number(b?.at) || 0 }))
          .filter((b) => b.id || b.fp);
      }
      rooms.set(room.code, room);
    }
  }

  async function loadRomsFile() {
    const parsed = await loadJson(pathJoin(dir, ROMS_FILE));
    const list = Array.isArray(parsed?.roms) ? parsed.roms : [];
    for (const item of list.slice(0, ROM_MAX)) {
      const meta = validRomMeta(item);
      if (meta) roms.set(meta.id, meta);
    }
  }

  function validRomMeta(item) {
    if (!item || typeof item.id !== "string" || !ROM_ID.test(item.id.toUpperCase())) return null;
    const meta = {
      id: item.id.toUpperCase(),
      title: typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, ROM_TITLE_MAX) : "未命名存档",
      note: typeof item.note === "string" ? item.note.slice(0, ROM_NOTE_MAX) : "",
      owner: typeof item.owner === "string" ? item.owner.slice(0, ROM_NAME_MAX) : "",
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      objects: Number.isFinite(item.objects) ? Math.max(0, Math.floor(item.objects)) : 0,
      hash: typeof item.hash === "string" && /^[0-9a-f]{64}$/.test(item.hash) ? item.hash : "",
    };
    // 没有口令摘要的存档谁也改不了，宁可当作不存在
    return meta.hash ? meta : null;
  }

  function romPath(id) {
    return pathJoin(romDir, `${id}.json`);
  }

  /** 存档元数据：绝不含口令摘要 */
  function romPublic(meta) {
    return { id: meta.id, title: meta.title, note: meta.note, owner: meta.owner, createdAt: meta.createdAt, updatedAt: meta.updatedAt, objects: meta.objects };
  }

  async function init() {
    await mkdir(imageDir, { recursive: true });
    await mkdir(romDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });
    // 启动时扫一遍唱片：健康检查里的个数才对得上磁盘
    const names = await readdir(audioDir).catch(() => []);
    for (const name of names) {
      if (!name.endsWith(".bin")) continue;
      const key = name.slice(0, -4);
      if (AUDIO_KEY.test(key)) audioSeen.add(key);
    }
    await loadRoomsFile();
    await loadRomsFile();
  }

  async function create(state, by) {
    const clean = validState(state);
    if (!clean || clean === TOO_LARGE || JSON.stringify(clean).length > MAX_STATE) return null;
    const person = who(by);
    // 没报上身份的开局（老客户端、校验脚本）就是间没有主人的房：不设权限、不发口令，谁改都行
    const named = !!person.id || !!person.fp;
    const secret = newToken();
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomCode();
      if (rooms.has(code)) continue;
      const room = {
        code,
        state: clean,
        version: 1,
        presence: {},
        updated_at: Date.now(),
        // 房间元信息：权限表与房主口令摘要。口令本身只在这一次响应里回给客户端。
        perms: {},
        banned: [],
        owner: named ? { id: person.id, fp: person.fp, name: String(by?.name ?? "").slice(0, 20), hash: hashToken(secret) } : null,
      };
      rooms.set(code, room);
      scheduleSave();
      return named ? { ...snapshot(room), token: secret } : snapshot(room);
    }
    return null;
  }

  function join(code, by) {
    if (!validCode(code)) return null;
    const room = rooms.get(keyOf(code));
    if (!room) return null;
    if (isBanned(room, who(by))) return { banned: true };
    return snapshot(room);
  }

  /** base 与当前版本一致时不带状态，省掉一次整桌传输 */
  function sync(code, base) {
    if (!validCode(code)) return null;
    const room = rooms.get(keyOf(code));
    if (!room) return null;
    const snap = snapshot(room);
    if (snap.version === base) return { code: room.code, changed: false, version: snap.version, state: null, presence: snap.presence, room: snap.room };
    return { code: room.code, changed: true, ...snap };
  }

  /** 版本条件写：基线被他人推进时返回 conflict + 权威状态 */
  function commit(code, base, state, by, byWho) {
    const room = rooms.get(keyOf(code));
    if (!room) return { missing: true };
    const person = who(byWho);
    if (isBanned(room, person)) return { ok: false, kicked: true, ...snapshot(room) };
    if (!Number.isInteger(base) || base < 1) return { missing: false, ok: false, conflict: true, ...snapshot(room) };
    if (room.version !== base) return { ok: false, conflict: true, ...snapshot(room) };
    const clean = validState(state);
    if (!clean) return { ok: false, rejected: "invalid_state", ...snapshot(room) };
    if (clean === TOO_LARGE || JSON.stringify(clean).length > MAX_STATE) return { ok: false, rejected: "tooLarge", ...snapshot(room) };
    // 房主（含口令认出的那台浏览器）写整桌；成员先按权限表逐物件收口，越权那几件退回上一版
    let next = clean;
    let denied = [];
    if (room.owner && !isOwner(room, person)) {
      const gated = gateState(room.state, clean, room.perms);
      next = gated.state;
      denied = gated.denied;
    }
    room.state = next;
    room.version = base + 1;
    room.updated_at = Date.now();
    scheduleSave();
    const out = { ok: true, ...snapshot(room), by: typeof by === "string" ? by.slice(0, 20) : "" };
    if (denied.length) {
      out.denied = denied;
      out.hint = deniedHint(denied);
    }
    return out;
  }

  /** 房主改房间设置：口令不对一个字也不改，返回 null 让上层区分「没这个房」和「不是房主」 */
  function roomPerm(code, token, patch) {
    const room = rooms.get(keyOf(code));
    if (!room) return { missing: true };
    if (!room.owner) return { rejected: "unknown_op" };
    if (!tokenOk(room.owner, token)) return { denied: true };
    if (typeof patch?.pub === "boolean") room.listed = patch.pub;
    // 游戏模式是一间房一个开关，跟权限表一样只认房主；true/false 才改，null 是不动这一项
    if (typeof patch?.gm === "boolean") room.gaming = patch.gm;
    if (patch?.perms && typeof patch.perms === "object") {
      // 整表覆盖：管理面板每次把全部键勾一遍再提交，不搞增量合并，省得两边猜
      room.perms = fixPerms(patch.perms);
    }
    room.updated_at = Date.now();
    scheduleSave();
    return { ok: true, room: roomMeta(room), listed: room.listed === true };
  }

  /** 踢人：记进黑名单后他的心跳与再进来都会被拒，按会话 id 与指纹两道认 */
  function roomKick(code, token, clientId, by) {
    const room = rooms.get(keyOf(code));
    if (!room) return { missing: true };
    if (!room.owner) return { rejected: "unknown_op" };
    if (!tokenOk(room.owner, token)) return { denied: true };
    const id = typeof clientId === "string" ? clientId.slice(0, 24) : "";
    if (!id || id === room.owner.id) return { rejected: "invalid_input" };
    const presence = validPresence(room.presence);
    const fp = validFp(presence[id]?.fp) || validFp(by);
    // 房主换了标签页、会话 id 变了，指纹还是同一个：别让他把自己锁在门外
    if (fp && fp === room.owner.fp) return { rejected: "invalid_input" };
    delete presence[id];
    room.presence = presence;
    if (!Array.isArray(room.banned)) room.banned = [];
    if (!room.banned.some((b) => b.id === id)) room.banned.push({ id, fp, at: Date.now() });
    roster.delete(id);
    room.updated_at = Date.now();
    scheduleSave();
    return { ok: true, ...snapshot(room) };
  }

  function touchPresence(code, clientId, name, color, rtt, fp) {
    const room = rooms.get(keyOf(code));
    if (!room) return null;
    const presence = validPresence(room.presence);
    const id = String(clientId).slice(0, 24);
    if (isBanned(room, { id, fp: validFp(fp) })) return { banned: true };
    delete presence[id];
    const cutoff = Date.now() - PRESENCE_CUTOFF;
    for (const [key, value] of Object.entries(presence)) if (!value.at || value.at < cutoff) delete presence[key];
    const entry = { name: String(name).slice(0, 20) || "玩家", at: Date.now(), color };
    const measured = validRtt(rtt);
    if (measured !== undefined) entry.rtt = measured;
    const mark = validFp(fp);
    if (mark) entry.fp = mark;
    presence[id] = entry;
    room.presence = presence;
    // 心跳算一次活动：空闲清理只清真的没人碰过的桌子；但不推进版本号，
    // 否则每次心跳都会让正在提交的客户端撞一次冲突。
    room.updated_at = Date.now();
    beat(code, id, entry.name, mark, color);
    scheduleSave();
    return snapshot(room);
  }

  /** 总站名册打卡：进房、心跳、换房间都走这里，只留展示用的三样东西 */
  function beat(code, id, name, fp, color) {
    if (!id) return;
    roster.set(id, {
      id,
      name: String(name || "玩家").slice(0, 20),
      fp: String(fp || "").slice(0, 16),
      color: /^#[0-9a-fA-F]{6}$/.test(String(color)) ? String(color) : "#c8443c",
      room: typeof code === "string" ? code.toUpperCase() : null,
      at: Date.now(),
    });
  }

  /** 退回本地桌面：名册里立刻少一个人，不用等 45 秒超时 */
  function leaveRoom(code, by) {
    const person = who(by);
    if (person.id) roster.delete(person.id);
    const room = typeof code === "string" ? rooms.get(keyOf(code)) : null;
    if (!room) return null;
    const presence = validPresence(room.presence);
    let changed = false;
    for (const key of Object.keys(presence)) {
      if (key === person.id || (person.fp && presence[key].fp === person.fp)) {
        delete presence[key];
        changed = true;
      }
    }
    if (!changed) return snapshot(room);
    room.presence = presence;
    room.updated_at = Date.now();
    scheduleSave();
    return snapshot(room);
  }

  /** 总站在线名单：只报还活着的人 */
  function online(now = Date.now()) {
    const cutoff = now - PRESENCE_CUTOFF;
    const out = [];
    for (const [id, entry] of roster) {
      if (entry.at < cutoff) {
        roster.delete(id);
        continue;
      }
      out.push(entry);
    }
    out.sort((a, b) => b.at - a.at);
    return out.slice(0, LIST_MAX);
  }

  /** 掉线玩家的心跳过期后要把桌子重新广播给活着的人 */
  function sweepPresence(now = Date.now()) {
    const changed = [];
    const cutoff = now - PRESENCE_CUTOFF;
    for (const room of rooms.values()) {
      const presence = validPresence(room.presence);
      let removed = false;
      for (const [key, value] of Object.entries(presence)) {
        if (!value.at || value.at < cutoff) {
          delete presence[key];
          removed = true;
        }
      }
      if (!removed) continue;
      room.presence = presence;
      changed.push(snapshot(room));
    }
    for (const [id, entry] of roster) if (entry.at < cutoff) roster.delete(id);
    if (changed.length) scheduleSave();
    return changed;
  }

  /** 桌上没人又一天没动的房间要清掉，否则磁盘快照只增不减 */
  function sweepRooms(maxIdleMs, now = Date.now()) {
    const dropped = [];
    for (const [code, room] of rooms) {
      if (now - room.updated_at < maxIdleMs) continue;
      rooms.delete(code);
      dropped.push(code);
    }
    if (dropped.length) scheduleSave();
    return dropped;
  }

  /** 挂牌的房间：有房主的房间只有房主（口令对得上）能挂进大厅 */
  function featureRoom(code, listed, token) {
    const room = rooms.get(keyOf(code));
    if (!room) return null;
    if (room.owner && !tokenOk(room.owner, token)) return { denied: true };
    room.listed = listed === true;
    room.updated_at = Date.now();
    scheduleSave();
    return { code: room.code, listed: room.listed === true };
  }

  /** 公开大厅：只列主动挂过牌的真房间，没人挂牌时就是空的 */
  function listRooms() {
    const out = [];
    for (const room of rooms.values()) {
      if (room.listed !== true) continue;
      const presence = validPresence(room.presence);
      out.push({
        code: room.code,
        name: typeof room.state?.name === "string" ? room.state.name.slice(0, 40) : "牌桌",
        peers: Object.keys(presence).length,
        objects: Array.isArray(room.state?.o) ? room.state.o.length : 0,
        romId: typeof room.romId === "string" && ROM_ID.test(room.romId) ? room.romId : undefined,
        host: typeof room.owner?.name === "string" ? room.owner.name.slice(0, 20) : "",
        updatedAt: room.updated_at,
      });
    }
    out.sort((a, b) => b.peers - a.peers || b.updatedAt - a.updatedAt);
    return out.slice(0, LIST_MAX);
  }

  /**
   * 定档：把一份桌面写成持久存档。id 为空是新档（回一份口令，只有定档的人拿着），
   * 带 id 与口令才是覆盖旧档 —— 口令不对就 denied，不泄露存档是否存在之外的信息。
   */
  async function romSave({ id, token, title, note, state, owner }) {
    const clean = validState(state);
    // 和 commit 一样区分“形状不合法”和“超出上限”，客户端才能给出准确的中文提示
    if (!clean) return { rejected: "invalid_state" };
    if (clean === TOO_LARGE || JSON.stringify(clean).length > MAX_STATE) return { rejected: "tooLarge" };
    const meta = {
      title: (typeof title === "string" ? title.trim() : "").slice(0, ROM_TITLE_MAX),
      note: (typeof note === "string" ? note.trim() : "").slice(0, ROM_NOTE_MAX),
      owner: (typeof owner === "string" ? owner.trim() : "").slice(0, ROM_NAME_MAX),
      objects: Array.isArray(clean.o) ? clean.o.length : 0,
      updatedAt: Date.now(),
    };
    const wanted = typeof id === "string" ? id.toUpperCase() : "";
    if (wanted) {
      if (!ROM_ID.test(wanted)) return { rejected: "invalid_input" };
      const hit = roms.get(wanted);
      if (!hit) return { missing: true };
      if (!tokenOk(hit, token)) return { denied: true };
      const next = { ...hit, title: meta.title || hit.title, owner: meta.owner || hit.owner, note: meta.note, objects: meta.objects, updatedAt: meta.updatedAt };
      roms.set(wanted, next);
      await writeAtomic(romPath(wanted), JSON.stringify({ id: wanted, state: clean }));
      scheduleRomSave();
      return { id: wanted, updatedAt: next.updatedAt, rom: romPublic(next) };
    }
    if (roms.size >= ROM_MAX) return { rejected: "rom_limit" };
    for (let attempt = 0; attempt < 8; attempt++) {
      const fresh = newRomId();
      if (!fresh || roms.has(fresh)) continue;
      const secret = randomBytes(12).toString("hex");
      const created = { id: fresh, createdAt: Date.now(), ...meta, title: meta.title || "未命名存档", hash: hashToken(secret) };
      roms.set(fresh, created);
      await writeAtomic(romPath(fresh), JSON.stringify({ id: fresh, state: clean }));
      scheduleRomSave();
      return { id: fresh, token: secret, createdAt: created.createdAt, updatedAt: created.updatedAt, rom: romPublic(created) };
    }
    return { rejected: "internal_error" };
  }

  async function romList() {
    const list = [...roms.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LIST_MAX);
    return list.map(romPublic);
  }

  /** 读一份存档：元数据 + 桌面本体，永远不含口令 */
  async function romGet(id) {
    const wanted = typeof id === "string" ? id.toUpperCase() : "";
    if (!ROM_ID.test(wanted)) return null;
    const meta = roms.get(wanted);
    if (!meta) return null;
    let record = null;
    try {
      record = JSON.parse(await readFile(romPath(wanted), "utf8"));
    } catch {
      record = null;
    }
    const clean = validState(record?.state);
    if (!clean || clean === TOO_LARGE) return null;
    return { ...romPublic(meta), state: clean };
  }

  /** 从存档开一桌新房间：存档本身不动，改坏了随时回来；开房的人当房主 */
  async function romOpen(id, by) {
    const rom = await romGet(id);
    if (!rom) return null;
    const room = await create(rom.state, by);
    if (!room) return null;
    const live = rooms.get(room.code);
    if (live) {
      live.romId = rom.id;
      scheduleSave();
    }
    return { ...room, romId: rom.id, romTitle: rom.title };
  }

  async function romRemove(id, token) {
    const wanted = typeof id === "string" ? id.toUpperCase() : "";
    if (!ROM_ID.test(wanted)) return { rejected: "invalid_input" };
    const meta = roms.get(wanted);
    if (!meta) return { missing: true };
    if (!tokenOk(meta, token)) return { denied: true };
    roms.delete(wanted);
    await rm(romPath(wanted), { force: true }).catch(() => {});
    scheduleRomSave();
    return { ok: true };
  }

  function imagePath(key) {
    return pathJoin(imageDir, `${key}.txt`);
  }
  async function putImage(key, data) {
    if (typeof key !== "string" || !IMAGE_KEY.test(key)) return false;
    if (typeof data !== "string" || !IMAGE_DATA.test(data) || data.length > MAX_BODY) return false;
    if (!imageCache.has(key)) {
      // 先把上一张留下的大小算进去，避免无限攒像素
      if (imageCache.size >= IMAGE_CACHE_MAX) {
        for (const old of [...imageCache.keys()].slice(0, IMAGE_CACHE_MAX / 2)) imageCache.delete(old);
      }
      imageCache.set(key, data);
    }
    await writeFile(imagePath(key), data, "utf8");
    return true;
  }

  async function getImages(keys) {
    const wanted = [...new Set((Array.isArray(keys) ? keys : []).filter((k) => typeof k === "string" && IMAGE_KEY.test(k)))].slice(0, 64);
    const images = {};
    const omitted = [];
    let budget = IMAGE_BUDGET;
    for (const key of wanted) {
      let data = imageCache.get(key);
      if (data === undefined) {
        try {
          data = await readFile(imagePath(key), "utf8");
        } catch {
          data = null;
        }
        if (data !== null) imageCache.set(key, data);
      }
      if (data === null || data === undefined) {
        omitted.push(key);
        continue;
      }
      if (data.length > budget) {
        omitted.push(key);
        continue;
      }
      budget -= data.length;
      images[key] = data;
    }
    return { images, omitted };
  }

  /**
   * 唱片仓库：一首一个 <key>.bin，原始字节照存，绝不转码——所以 mp3/ogg/m4a/flac 都还是上传时那份。
   * 旁边的 <key>.meta 只记浏览器报来的 MIME；key 是内容哈希，同 key 重写就是同一份字节。
   */
  function audioPath(key) {
    return pathJoin(audioDir, `${key}.bin`);
  }

  async function putAudio(key, mime, bytes) {
    if (typeof key !== "string" || !AUDIO_KEY.test(key)) return false;
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > AUDIO_MAX_BYTES) return false;
    const type = AUDIO_MIME.test(String(mime)) ? String(mime).toLowerCase() : "application/octet-stream";
    await writeFile(audioPath(key), bytes);
    await writeFile(pathJoin(audioDir, `${key}.meta`), type, "utf8");
    audioSeen.add(key);
    void trimAudio();
    return true;
  }

  /** 取唱片：只回磁盘上的真身，GET 一路不写任何东西 */
  async function getAudio(key) {
    if (typeof key !== "string" || !AUDIO_KEY.test(key)) return null;
    const file = audioPath(key);
    let info = null;
    try {
      info = await stat(file);
    } catch {
      return null;
    }
    if (!info.isFile()) return null;
    let type = "";
    try {
      type = (await readFile(pathJoin(audioDir, `${key}.meta`), "utf8")).trim();
    } catch {
      type = "";
    }
    return { file, size: info.size, type: AUDIO_MIME.test(type) ? type : "application/octet-stream" };
  }

  /** 收一次仓库：超过预算就按最久没放的那首先扔。同一时刻只跑一份，别让人连着传把 stat 打满 */
  let trimming = null;
  function trimAudio() {
    if (trimming) return trimming;
    trimming = (async () => {
      const names = await readdir(audioDir).catch(() => []);
      const clips = [];
      let total = 0;
      for (const name of names) {
        if (!name.endsWith(".bin")) continue;
        const key = name.slice(0, -4);
        if (!AUDIO_KEY.test(key)) continue;
        const info = await stat(pathJoin(audioDir, name)).catch(() => null);
        if (!info?.isFile()) continue;
        clips.push({ key, size: info.size, at: info.mtimeMs });
        total += info.size;
      }
      clips.sort((a, b) => b.at - a.at);
      while (total > AUDIO_BUDGET && clips.length) {
        const old = clips.pop();
        await rm(audioPath(old.key), { force: true }).catch(() => {});
        await rm(pathJoin(audioDir, `${old.key}.meta`), { force: true }).catch(() => {});
        total -= old.size;
      }
      audioSeen.clear();
      for (const one of clips) audioSeen.add(one.key);
    })()
      .catch(() => {})
      .finally(() => {
        trimming = null;
      });
    return trimming;
  }

  function stats() {
    return { rooms: rooms.size, roms: roms.size, images: imageCache.size, audio: audioSeen.size, online: roster.size };
  }

  return {
    init, create, join, sync, commit, touchPresence, sweepPresence, sweepRooms,
    featureRoom, listRooms, roomPerm, roomKick, leaveRoom, online,
    romSave, romList, romGet, romOpen, romRemove,
    putImage, getImages, putAudio, getAudio, stats,
    flush: () => saving.then(() => flush()).then(() => flushRoms()),
  };
}
