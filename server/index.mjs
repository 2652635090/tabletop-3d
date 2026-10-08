// 自建实时网关：HTTP 静态站点 + 同端口 WebSocket 房间广播。
// 之所以把前端也放在这里，是因为 https 的站点打不开 ws:// 的连接（混合内容会被浏览器拦掉）。
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join as pathJoin, resolve as pathResolve, sep as pathSep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { ROOM_IDLE_MS, createTableStore } from "./store.mjs";
import { AUDIO_KEY, AUDIO_MAX_BYTES, IMAGE_KEY, MAX_BODY, TOO_LARGE, validCode, validState } from "../functions/handler.mjs";

const here = pathResolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT || 29920);
const HOST = process.env.HOST || "0.0.0.0";
const SITE_DIR = pathResolve(process.env.SITE_DIR || pathJoin(here, "..", "dist"));
const DATA_DIR = pathResolve(process.env.DATA_DIR || pathJoin(here, "data"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const store = createTableStore({ dir: DATA_DIR });

function safePath(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const target = pathResolve(root, "." + (decoded.endsWith("/") ? `${decoded}index.html` : decoded));
  const inside = target === root || target.startsWith(root + pathSep);
  return inside ? target : null;
}

function serveStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "cache-control": "no-store", allow: "GET, HEAD" });
    return response.end();
  }
  const urlPath = request.url || "/";
  if (urlPath === "/healthz") {
    response.writeHead(200, { "content-type": TYPES[".json"], "cache-control": "no-store" });
    return response.end(JSON.stringify({ ok: true, ...store.stats(), uptime: Math.round(process.uptime()) }));
  }
  let file = safePath(SITE_DIR, urlPath);
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    // 单页应用：未知路径回落到入口，路由在客户端手里
    file = pathJoin(SITE_DIR, "index.html");
    if (!existsSync(file)) {
      response.writeHead(503, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return response.end("site assets missing: run npm run build");
    }
  }
  const ext = extname(file).toLowerCase();
  const hashed = file.includes(`${pathSep}assets${pathSep}`);
  response.writeHead(200, {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "cache-control": ext === ".html" || !hashed ? "no-store" : "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  if (request.method === "HEAD") return response.end();
  createReadStream(file).pipe(response);
}

const server = createServer((request, response) => {
  const pathname = (request.url || "").split("?")[0];
  if (request.method === "POST" && pathname === API_PATH) {
    void apiFace(request, response);
    return;
  }
  if (pathname.startsWith(AUDIO_PREFIX)) {
    void audioFace(request, response, pathname);
    return;
  }
  try {
    serveStatic(request, response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("internal_error");
    log(`static failed: ${error?.message ?? error}`);
  }
});

/** 唱片字节的门面：JSON 那条 256KB 的通道装不下一首歌，所以另开一条同源的原始请求路由。 */
const AUDIO_PREFIX = "/audio/";

/** 读一份原始请求体。超上限时仍把剩下的字节排掉，好让客户端收到准确的 413 而不是断线。 */
function readRaw(request, cap) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    request.on("data", (part) => {
      size += part.length;
      if (size > cap) {
        tooBig = true;
        chunks.length = 0;
        return;
      }
      if (!tooBig) chunks.push(part);
    });
    request.on("end", () => resolve(tooBig ? { tooBig: true } : { bytes: Buffer.concat(chunks) }));
    request.on("error", () => resolve({ tooBig: true }));
  });
}

async function audioFace(request, response, pathname) {
  let key = "";
  try {
    key = decodeURIComponent(pathname.slice(AUDIO_PREFIX.length));
  } catch {
    key = "";
  }
  if (!AUDIO_KEY.test(key)) return reply(response, 400, { ok: false, error: "invalid_input" });

  if (request.method === "GET" || request.method === "HEAD") {
    // GET 一个字节都不写：读文件、报大小，剩下的交给流
    const clip = await store.getAudio(key);
    if (!clip) return reply(response, 404, { ok: false, error: "audio_not_found" });
    response.writeHead(200, {
      "content-type": clip.type,
      "content-length": String(clip.size),
      // key 就是内容哈希，同一串字节永远对应同一个地址
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") return response.end();
    createReadStream(clip.file).pipe(response);
    return undefined;
  }

  if (request.method === "PUT") {
    const { bytes, tooBig } = await readRaw(request, AUDIO_MAX_BYTES);
    if (tooBig) return reply(response, 413, { ok: false, error: "audio_too_large" });
    if (!bytes?.length) return reply(response, 400, { ok: false, error: "invalid_input" });
    const saved = await store.putAudio(key, request.headers["content-type"], bytes);
    return saved
      ? reply(response, 200, { ok: true, size: bytes.length })
      : reply(response, 400, { ok: false, error: "invalid_input" });
  }

  response.writeHead(405, { "cache-control": "no-store", allow: "GET, HEAD, PUT" });
  response.end();
}

/** WebSocket 被代理或防火墙挡住时，客户端会自动退回这条 HTTP 面孔：同一份 store、同一套错误码。 */
const API_PATH = "/functions/v1/app";
const ACTIONS = new Set([
  "create", "join", "sync", "commit", "presence", "putImage", "getImage",
  "romSave", "romList", "romGet", "romOpen", "romRemove", "roomList", "roomFeature",
  "roomPerm", "roomKick", "roomLeave", "online",
]);

/** 存档失败码对应的 HTTP 状态：与房间协议同一套口径，客户端只认 ApiError */
const FAULT_STATUS = { state_too_large: 413, rom_not_found: 404, room_not_found: 404, access_denied: 403, not_owner: 403, kicked: 403 };

/** 提交者身份：两条面孔都从这几个字段里读，缺一个就当匿名成员（权限表照旧生效） */
function whoOf(msg) {
  return { id: typeof msg.clientId === "string" ? msg.clientId : "", fp: typeof msg.fp === "string" ? msg.fp : "" };
}

/**
 * WebSocket 的回执靠 `id` 认门，所以存档号在实时面孔里走 `romId`：
 * 直接铺开负载会让存档号顶掉帧 id，客户端就再也对不上是哪个请求回来了。
 * HTTP 面孔没有帧编号，继续用顶层 `id`，客户端两个字段都认。
 */
function romPayload(out) {
  const { id, ...rest } = out;
  return { ...rest, romId: id };
}

/** 存档写入的统一收口：把 store 的三种失败形状翻译成一个错误码 */
function romFault(out) {
  if (out?.rejected) return out.rejected === "tooLarge" ? "state_too_large" : String(out.rejected);
  if (out?.missing) return "rom_not_found";
  if (out?.denied) return "access_denied";
  return null;
}

function reply(response, status, payload) {
  response.writeHead(status, { "content-type": TYPES[".json"], "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    request.on("data", (part) => {
      size += part.length;
      // 超了就只排掉剩下的字节：把连接直接打断会让客户端看不到我们的错误回复
      if (size > MAX_BODY) {
        tooBig = true;
        chunks.length = 0;
        return;
      }
      if (!tooBig) chunks.push(part);
    });
    request.on("end", () => {
      if (tooBig) return resolve(null);
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(parsed && typeof parsed === "object" && ACTIONS.has(parsed.action) ? parsed : null);
      } catch {
        resolve(null);
      }
    });
    request.on("error", () => resolve(null));
  });
}

async function apiFace(request, response) {
  const body = await readBody(request);
  if (!body) return reply(response, 400, { ok: false, error: "invalid_input" });
  try {
    await apiCall(response, body);
  } catch (error) {
    log(`api ${body.action} failed: ${error?.message ?? error}`);
    if (!response.headersSent) reply(response, 500, { ok: false, error: "service_unavailable" });
  }
}

async function apiCall(response, body) {
  const bad = (error, status = 400) => reply(response, status, { ok: false, error });

  if (body.action === "create") {
    const room = await store.create(body.state, { ...whoOf(body), name: body.ownerName });
    return room ? reply(response, 200, { ok: true, ...room }) : bad("invalid_input");
  }
  if (body.action === "putImage") {
    return (await store.putImage(body.key, body.data)) ? reply(response, 200, { ok: true }) : bad("invalid_input");
  }
  if (body.action === "getImage") {
    return reply(response, 200, { ok: true, ...(await store.getImages(body.keys)) });
  }

  if (body.action === "roomList") {
    return reply(response, 200, { ok: true, rooms: store.listRooms() });
  }
  if (body.action === "online") {
    return reply(response, 200, { ok: true, users: store.online() });
  }
  if (body.action === "romList") {
    return reply(response, 200, { ok: true, roms: await store.romList() });
  }
  if (body.action === "romGet") {
    const rom = await store.romGet(body.id);
    return rom ? reply(response, 200, { ok: true, ...rom }) : bad("rom_not_found", 404);
  }
  if (body.action === "romOpen") {
    const room = await store.romOpen(body.id, { ...whoOf(body), name: body.ownerName });
    return room ? reply(response, 200, { ok: true, ...room }) : bad("rom_not_found", 404);
  }
  if (body.action === "romSave") {
    const out = await store.romSave({ id: body.id, token: body.token, title: body.title, note: body.note, state: body.state, owner: body.by });
    const fault = romFault(out);
    if (fault) return bad(fault, FAULT_STATUS[fault] ?? 400);
    return reply(response, 200, { ok: true, ...out });
  }
  if (body.action === "romRemove") {
    const out = await store.romRemove(body.id, body.token);
    const fault = romFault(out);
    if (fault) return bad(fault, FAULT_STATUS[fault] ?? 400);
    return reply(response, 200, { ok: true });
  }

  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  if (!validCode(code)) return bad("invalid_input");

  if (body.action === "roomFeature") {
    const room = store.featureRoom(code, body.listed, body.token);
    if (room?.denied) return bad("not_owner", 403);
    return room ? reply(response, 200, { ok: true, ...room }) : bad("room_not_found", 404);
  }
  if (body.action === "roomPerm") {
    const out = store.roomPerm(code, body.token, { pub: body.pub, gm: body.gm, perms: body.perms });
    if (out?.missing) return bad("room_not_found", 404);
    if (out?.denied) return bad("not_owner", 403);
    if (out?.rejected) return bad(String(out.rejected), 400);
    broadcast(code, { t: "roomMeta", code, room: out.room });
    return reply(response, 200, { ok: true, ...out });
  }
  if (body.action === "roomKick") {
    const out = store.roomKick(code, body.token, body.clientId);
    if (out?.missing) return bad("room_not_found", 404);
    if (out?.denied) return bad("not_owner", 403);
    if (out?.rejected) return bad(String(out.rejected), 400);
    broadcast(code, { t: "presence", code, presence: out.presence });
    return reply(response, 200, { ok: true });
  }
  if (body.action === "roomLeave") {
    const out = store.leaveRoom(code, whoOf(body));
    return reply(response, 200, { ok: true, presence: out?.presence ?? {} });
  }
  if (body.action === "join") {
    const room = store.join(code, whoOf(body));
    if (room?.banned) return bad("kicked", 403);
    return room ? reply(response, 200, { ok: true, ...room }) : bad("room_not_found", 404);
  }
  if (body.action === "sync") {
    const room = store.sync(code, Number(body.base));
    return room ? reply(response, 200, { ok: true, ...room }) : bad("room_not_found", 404);
  }
  if (body.action === "commit") {
    const base = Number(body.base);
    if (!Number.isInteger(base) || base < 1) return bad("invalid_input");
    const clean = validState(body.state);
    if (clean === TOO_LARGE) return bad("state_too_large", 413);
    if (!clean) return bad("invalid_input");
    const result = store.commit(code, base, body.state, body.by, whoOf(body));
    if (result.missing) return bad("room_not_found", 404);
    const { missing, ...out } = result;
    if (out.kicked) return bad("kicked", 403);
    if (out.ok) broadcast(code, { t: "room", code: out.code, version: out.version, state: out.state, presence: out.presence, room: out.room });
    return reply(response, 200, out);
  }

  // presence
  if (typeof body.clientId !== "string" || !body.clientId.length) return bad("invalid_input");
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color ?? "") ? body.color : "#c8443c";
  const room = store.touchPresence(code, body.clientId, String(body.name ?? ""), String(color), body.rtt, body.fp);
  if (room?.banned) return bad("kicked", 403);
  if (!room) return bad("room_not_found", 404);
  broadcast(code, { t: "presence", code: room.code, presence: room.presence });
  return reply(response, 200, { ok: true, presence: room.presence });
}

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: MAX_BODY,
});

/** code(大写) → 该房间的订阅连接 */
const members = new Map();

function log(message) {
  console.log(new Date().toISOString(), message);
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(code, payload, except) {
  const room = members.get(code);
  if (!room) return;
  const text = JSON.stringify(payload);
  for (const socket of room) {
    if (socket === except || socket.readyState !== socket.OPEN) continue;
    socket.send(text);
  }
}

/**
 * 拖动帧是纯表现数据：非法就 quietly 丢掉，一帧也不值得为它回错误、排队或重连。
 * pick（选中态）允许列表为空——那一句意思是「他把选中的都松了」，不是坏帧。
 */
const DRAG_MAX_MOVES = 24;
const DRAG_PER_SECOND = 20;
/** 同桌求源的最小间隔：一次喊话能带动十几张图的补传，不必每帧都喊 */
const ASK_MS = 2000;

function validDrag(raw, mode) {
  if (!Array.isArray(raw) || (!raw.length && mode !== "pick") || raw.length > DRAG_MAX_MOVES) return null;
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    if (typeof m.id !== "string" || !m.id.length || m.id.length > 32) return null;
    if (!Number.isFinite(m.x) || !Number.isFinite(m.z)) return null;
    const one = { id: m.id, x: round3(m.x), z: round3(m.z) };
    if (Number.isFinite(m.rot)) one.rot = round3(m.rot);
    out.push(one);
  }
  return out;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/** 每人每秒 20 帧的固定窗口：拖动本来就只有一两秒的时效，超额的帧直接扔，不追赶也不缓冲 */
function allowDrag(socket) {
  const now = Date.now();
  if (!socket.dragUntil || socket.dragUntil <= now) {
    socket.dragUntil = now + 1000;
    socket.dragFrames = 0;
  }
  socket.dragFrames += 1;
  return socket.dragFrames <= DRAG_PER_SECOND;
}

/** 求源喊话两秒一次就够：真缺的那几张下一轮重试还会再喊，不必让人连着刷屏上传 */
function allowAsk(socket) {
  const now = Date.now();
  if (socket.askAt && socket.askAt + ASK_MS > now) return false;
  socket.askAt = now;
  return true;
}

/* ———— 随身听的同学互传：只递不落，服务器一份字节都不存 ———— */

/** 一段的字符上限：客户端按 96KB 原始字节切，base64 之后约 128K，留一点余量 */
const MP3_MAX_PART = 140000;
const MP3_PART = /^[A-Za-z0-9+/]+={0,2}$/;
/** 一首歌最多切到第几段：24MB / 96KB 是 256 段，这里给到 4096 只防脏序号 */
const MP3_MAX_SEQ = 4096;
/** 求歌一句两秒一次：一首歌只喊一回，别人不该被同一首歌敲连着传好几遍 */
const WANT_MS = 2000;
/** 每人每秒最多往外递多少字符：约 4MB 原始字节，一首歌十几秒走完，谁也不能拿它当下载站 */
const PART_BUDGET = 5.6 * 1024 * 1024;

function allowWant(socket) {
  const now = Date.now();
  if (socket.wantAt && socket.wantAt + WANT_MS > now) return false;
  socket.wantAt = now;
  return true;
}

/** 递字节的这一头按秒记字符数：超出预算的那几段直接扔，接收端下一轮求歌会补上 */
function allowPart(socket, size) {
  const now = Date.now();
  if (!socket.partUntil || socket.partUntil <= now) {
    socket.partUntil = now + 1000;
    socket.partBytes = 0;
  }
  socket.partBytes += size;
  return socket.partBytes <= PART_BUDGET;
}

/** 只递给房里那一个 cid：找不到就算了，一句也不回，跟拖动帧一个脾气 */
function toPeer(code, cid, payload, except) {
  const room = members.get(code);
  const to = typeof cid === "string" ? cid : "";
  if (!room || !to) return;
  const text = JSON.stringify(payload);
  for (const socket of room) {
    if (socket === except || socket.cid !== to || socket.readyState !== socket.OPEN) continue;
    socket.send(text);
  }
}

/** 订阅者集合里顺手维护房间归属，断开时要把自己摘干净 */
function attach(socket, code) {
  const key = String(code).toUpperCase();
  // 只订阅真实存在的房间，别让脏参数造出一个永远没人离开的幽灵房间
  if (!validCode(key)) return;
  const hit = store.join(key);
  if (!hit || hit.banned) return;
  if (socket.code === key) return;
  detach(socket);
  let room = members.get(key);
  if (!room) {
    room = new Set();
    members.set(key, room);
  }
  room.add(socket);
  socket.code = key;
}

function detach(socket) {
  const key = socket.code;
  if (!key) return;
  socket.code = null;
  // 连接一断就把人从名册和这桌的存在性里摘掉：等 45 秒超时会让人以为他还坐着
  if (socket.cid) {
    const left = store.leaveRoom(key, { id: socket.cid, fp: socket.fp });
    const room = members.get(key);
    if (left && room) {
      const text = JSON.stringify({ t: "presence", code: key, presence: left.presence });
      for (const peer of room) if (peer !== socket && peer.readyState === peer.OPEN) peer.send(text);
    }
  }
  const room = members.get(key);
  if (!room) return;
  room.delete(socket);
  if (!room.size) members.delete(key);
}

function error(socket, id, code) {
  send(socket, { id, ok: false, error: code });
}

/** 记住这条连接是谁：断开时要拿它去名册和存在性里销名 */
function remember(socket, msg) {
  const person = whoOf(msg);
  if (person.id) socket.cid = person.id;
  if (person.fp) socket.fp = person.fp;
}

wss.on("connection", (socket) => {
  socket.isAlive = true;
  socket.code = null;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", async (raw) => {
    let msg = null;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return error(socket, null, "invalid_json");
    }
    if (!msg || typeof msg !== "object" || typeof msg.op !== "string") return error(socket, msg?.id ?? null, "invalid_request");
    const id = typeof msg.id === "number" || typeof msg.id === "string" ? msg.id : null;
    try {
      await handle(socket, id, msg);
    } catch (error_) {
      log(`op ${msg.op} failed: ${error_?.message ?? error_}`);
      error(socket, id, "internal_error");
    }
  });

  socket.on("close", () => detach(socket));
  socket.on("error", () => detach(socket));
});

async function handle(socket, id, msg) {
  switch (msg.op) {
    case "ping":
      // 客户端用它量 RTT：只回原样带出的发送时刻，不做任何持久化
      return send(socket, { id, ok: true, t: "pong", at: typeof msg.at === "number" ? msg.at : 0, now: Date.now() });

    case "create": {
      const room = await store.create(msg.state, { ...whoOf(msg), name: msg.ownerName });
      if (!room) return error(socket, id, "invalid_state");
      remember(socket, msg);
      attach(socket, room.code);
      send(socket, { id, ok: true, ...room });
      return undefined;
    }

    case "join": {
      const room = store.join(msg.code, whoOf(msg));
      if (room?.banned) return error(socket, id, "kicked");
      if (!room) return error(socket, id, "room_not_found");
      remember(socket, msg);
      attach(socket, room.code);
      send(socket, { id, ok: true, ...room });
      return undefined;
    }

    case "sync": {
      const room = store.sync(msg.code, Number(msg.base));
      if (!room) return error(socket, id, "room_not_found");
      remember(socket, msg);
      attach(socket, room.code);
      return send(socket, { id, ok: true, ...room });
    }

    case "commit": {
      const result = store.commit(msg.code, Number(msg.base), msg.state, msg.by, whoOf(msg));
      if (result.missing) return error(socket, id, "room_not_found");
      if (result.kicked) {
        // 先记下身份再摘出去：黑名单里那位的心跳与座位要一起清掉
        remember(socket, msg);
        detach(socket);
        return error(socket, id, "kicked");
      }
      const { missing, ...body } = result;
      remember(socket, msg);
      attach(socket, msg.code);
      send(socket, { id, ok: result.ok !== false, ...body });
      if (result.ok) {
        broadcast(String(msg.code).toUpperCase(), { t: "room", code: body.code, version: body.version, state: body.state, presence: body.presence, room: body.room }, socket);
      }
      return undefined;
    }

    case "presence": {
      if (typeof msg.clientId !== "string" || !msg.clientId.length) return error(socket, id, "invalid_request");
      const room = store.touchPresence(msg.code, msg.clientId, String(msg.name ?? ""), String(msg.color ?? ""), msg.rtt, msg.fp);
      if (room?.banned) return error(socket, id, "kicked");
      if (!room) return error(socket, id, "room_not_found");
      remember(socket, msg);
      attach(socket, msg.code);
      send(socket, { id, ok: true, presence: room.presence, version: room.version });
      return broadcast(String(msg.code).toUpperCase(), { t: "presence", code: room.code, presence: room.presence }, socket);
    }

    case "drag": {
      // 拖动过程中的瞬时位置：不入存储、不抬版本号，只把这一帧转给同桌其他人看。
      // 权威落点仍由随后的 commit 决定，所以这里丢了帧也无非是别人眼里卡一下。
      const key = typeof msg.code === "string" ? msg.code.toUpperCase() : "";
      if (!validCode(key) || socket.code !== key) return undefined;
      if (!allowDrag(socket)) return undefined;
      const mode = msg.s === "pick" ? "pick" : "drag";
      const m = validDrag(msg.m, mode);
      const by = typeof msg.by === "string" ? msg.by.trim().slice(0, 24) : "";
      if (!m || !by) return undefined;
      const color = /^#[0-9a-fA-F]{6}$/.test(msg.color ?? "") ? msg.color : "#c8443c";
      return broadcast(key, { t: "drag", code: key, by, color, s: mode, m }, socket);
    }

    case "askImage": {
      // 缺图的人在房里喊一嗓子：本机存着这几张的人听见了就往服务器补传一份。
      // 服务器仍是唯一的存储，这一层只是替它找一遍「谁手上有」，所以不认任何直传的像素。
      const key = typeof msg.code === "string" ? msg.code.toUpperCase() : "";
      if (!validCode(key) || socket.code !== key) return undefined;
      if (!allowAsk(socket)) return undefined;
      const keys = (Array.isArray(msg.keys) ? msg.keys : [])
        .filter((k) => typeof k === "string" && IMAGE_KEY.test(k))
        .slice(0, 64);
      if (!keys.length) return undefined;
      return broadcast(key, { t: "askImage", code: key, keys }, socket);
    }

    case "mp3Want": {
      // 想听别人随身听里那首歌：这句话只递给那台机器的主人，服务器一个字节都不经手。
      // 递不到就算了——主人不在线，本来也没人能把歌送过来。
      const key = typeof msg.code === "string" ? msg.code.toUpperCase() : "";
      if (!validCode(key) || socket.code !== key) return undefined;
      if (!allowWant(socket)) return undefined;
      if (typeof msg.key !== "string" || !AUDIO_KEY.test(msg.key)) return undefined;
      return toPeer(key, msg.to, { t: "mp3Want", code: key, from: socket.cid ?? "", key: msg.key }, socket);
    }

    case "mp3Part": {
      // 一段歌的字节：主人一段一段往要它的人那儿递，递完就算完。
      // 这一条刻意不走 store——服务器的磁盘上从此不会多出这一首歌，那份压力仍在同学之间。
      const key = typeof msg.code === "string" ? msg.code.toUpperCase() : "";
      if (!validCode(key) || socket.code !== key) return undefined;
      if (typeof msg.key !== "string" || !AUDIO_KEY.test(msg.key)) return undefined;
      const seq = msg.seq;
      const total = msg.total;
      const data = msg.data;
      if (!Number.isInteger(seq) || seq < 0 || seq > MP3_MAX_SEQ) return undefined;
      // 一共几段要说清楚：接收端就靠这个数判断「这首歌唱完了没有」，不然只能一直等
      if (!Number.isInteger(total) || total < 1 || total > MP3_MAX_SEQ + 1) return undefined;
      if (typeof data !== "string" || data.length > MP3_MAX_PART || !MP3_PART.test(data)) return undefined;
      if (!allowPart(socket, data.length)) return undefined;
      return toPeer(key, msg.to, { t: "mp3Part", code: key, from: socket.cid ?? "", key: msg.key, seq, total, data }, socket);
    }

    case "putImage": {
      const saved = await store.putImage(msg.key, msg.data);
      return send(socket, { id, ok: saved, ...(saved ? {} : { error: "image_rejected" }) });
    }

    case "getImage": {
      const out = await store.getImages(msg.keys);
      return send(socket, { id, ok: true, ...out });
    }

    case "roomList":
      return send(socket, { id, ok: true, rooms: store.listRooms() });

    case "online":
      return send(socket, { id, ok: true, users: store.online() });

    case "roomFeature": {
      const room = store.featureRoom(msg.code, msg.listed, msg.token);
      if (room?.denied) return error(socket, id, "not_owner");
      if (!room) return error(socket, id, "room_not_found");
      attach(socket, room.code);
      return send(socket, { id, ok: true, ...room });
    }

    case "roomPerm": {
      const key = String(msg.code ?? "").toUpperCase();
      const out = store.roomPerm(key, msg.token, { pub: msg.pub, gm: msg.gm, perms: msg.perms });
      if (out?.missing) return error(socket, id, "room_not_found");
      if (out?.denied) return error(socket, id, "not_owner");
      if (out?.rejected) return error(socket, id, String(out.rejected));
      attach(socket, key);
      send(socket, { id, ok: true, ...out });
      // 权限表变了要立刻告诉全桌：成员的输入框得马上知道哪些事他做不得了
      return broadcast(key, { t: "roomMeta", code: key, room: out.room }, socket);
    }

    case "roomKick": {
      const key = String(msg.code ?? "").toUpperCase();
      const out = store.roomKick(key, msg.token, msg.clientId);
      if (out?.missing) return error(socket, id, "room_not_found");
      if (out?.denied) return error(socket, id, "not_owner");
      if (out?.rejected) return error(socket, id, String(out.rejected));
      const { missing, ...body } = out;
      send(socket, { id, ok: true });
      return broadcast(key, { t: "presence", code: body.code, presence: body.presence });
    }

    case "roomLeave": {
      const out = store.leaveRoom(msg.code, whoOf(msg));
      detach(socket);
      return send(socket, { id, ok: true, presence: out?.presence ?? {} });
    }

    case "romList":
      return send(socket, { id, ok: true, roms: await store.romList() });

    case "romGet": {
      const rom = await store.romGet(msg.romId);
      return rom ? send(socket, { id, ok: true, ...romPayload(rom) }) : error(socket, id, "rom_not_found");
    }

    case "romOpen": {
      const room = await store.romOpen(msg.romId, { ...whoOf(msg), name: msg.ownerName });
      if (!room) return error(socket, id, "rom_not_found");
      attach(socket, room.code);
      return send(socket, { id, ok: true, ...room });
    }

    case "romSave": {
      const out = await store.romSave({ id: msg.romId, token: msg.token, title: msg.title, note: msg.note, state: msg.state, owner: msg.by });
      const fault = romFault(out);
      if (fault) return error(socket, id, fault);
      return send(socket, { id, ok: true, ...romPayload(out) });
    }

    case "romRemove": {
      const out = await store.romRemove(msg.romId, msg.token);
      const fault = romFault(out);
      if (fault) return error(socket, id, fault);
      return send(socket, { id, ok: true });
    }

    default:
      return error(socket, id, "unknown_op");
  }
}

// ws 层保活：25 秒一次 ping，两轮没回 pong 就断开，订阅者集合才不会挂着死连接
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      detach(socket);
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
  // 存在性过期要重新广播，别让人走了座位牌还亮着
  for (const room of store.sweepPresence()) {
    broadcast(room.code, { t: "presence", code: room.code, presence: room.presence });
  }
  // 一天没人碰的桌子从内存和快照里一起清掉，订阅集合也顺手收掉
  for (const code of store.sweepRooms(ROOM_IDLE_MS)) members.delete(code);
}, 25000);
heartbeat.unref?.();

await store.init();
server.listen(PORT, HOST, () => {
  log(`tabletop realtime gateway on http://${HOST}:${PORT} (site ${SITE_DIR}, data ${DATA_DIR})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`${signal}: flushing rooms`);
    store
      .flush()
      .catch(() => {})
      .finally(() => process.exit(0));
  });
}
