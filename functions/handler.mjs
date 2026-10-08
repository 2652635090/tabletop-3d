/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

// 桌游房间同步：单表 rooms，写入使用 version 条件更新实现单行比较交换。
// 牌局规则在客户端归约，服务端只做校验、版本仲裁与权威状态存取。

const MAX_BODY = 262144;
const MAX_STATE = 200000;
const MAX_OBJECTS = 420;
/** 一整叠牌的硬闸，和 game/state.ts 的 MAX_PILE 对齐：几百张导入要过得去 */
const MAX_PILE = 1000;
const MAX_LOG = 200;
const MAX_PLAYERS = 8;
const CODE_LEN = 6;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 卡面图片：状态里只带 key，像素单独存 card_images 表。桌垫大图需要更大的额度。 */
const IMAGE_KEY = /^[a-z0-9]{6,24}$/;
const IMAGE_DATA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]{1,200000}$/;
/** 单次 getImage 响应的像素总量，避免一次拉回几十张图把客户端卡住 */
const IMAGE_BUDGET = 900000;
/** 唱片音频的 key：首位固定 a，跟图片仓库各走各的门 */
const AUDIO_KEY = /^a[a-z0-9]{5,23}$/;
/** 单曲字节上限，与 game/catalog.ts 的 AUDIO_MAX_BYTES 同一档：只有自建服务端有二进制路由用得上 */
const AUDIO_MAX_BYTES = 24 * 1024 * 1024;
/** validState 用它的引用来区分“超出上限”和“形状不合法”两类拒绝 */
const TOO_LARGE = { tooLarge: true };

// 自建 WebSocket 服务端（server/）复用同一份校验与限额，避免出现第四份校验镜像：
// 客户端 game/api.ts sanitize ⇄ 这里 validState ⇄ game/state.ts tidy。
export { validState, TOO_LARGE, validCode, randomCode, validPresence, validRtt, MAX_STATE, MAX_BODY, IMAGE_KEY, IMAGE_DATA, IMAGE_BUDGET, AUDIO_KEY, AUDIO_MAX_BYTES };

const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const bad = (code, status = 400) => json({ error: code }, status);

function randomCode() {
  let out = "";
  const bytes = new Uint8Array(CODE_LEN);
  globalThis.crypto.getRandomValues(bytes);
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function validCode(value) {
  return typeof value === "string" && /^[A-Z0-9]{4,8}$/.test(value.toUpperCase());
}

/** 卡牌字段：像素只带 key，名字/描述限长，别让 dataURL 混进每份桌面状态 */
function validCard(c) {
  if (!c || typeof c !== "object") return false;
  if (c.img !== undefined && !IMAGE_KEY.test(String(c.img))) return false;
  // 无边框卡面：只认布尔，脏类型整份拒收；归一化（只留 true）由客户端的 fixCard 负责
  if (c.borderless !== undefined && typeof c.borderless !== "boolean") return false;
  // 牌形比例：放宽到图可能的一切形状，夹进可用区间是客户端的事
  if (!numInRange(c.ratio, 0.05, 20)) return false;
  if (c.back !== undefined && (typeof c.back !== "string" || c.back.length > 20)) return false;
  if (c.label !== undefined && (typeof c.label !== "string" || c.label.length > 40)) return false;
  if (c.art !== undefined && (typeof c.art !== "string" || c.art.length > 8)) return false;
  if (c.cat !== undefined && (typeof c.cat !== "string" || c.cat.length > 24)) return false;
  if (c.text !== undefined && (typeof c.text !== "string" || c.text.length > 400)) return false;
  return true;
}

function numInRange(v, lo, hi) {
  return v === undefined || (Number.isFinite(v) && v >= lo && v <= hi);
}

/** 只接受形状正确的桌面状态，避免脏数据进入所有客户端。超长返回 TOO_LARGE。 */
function validState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value;
  if (!Array.isArray(s.o) || !Array.isArray(s.log) || !Array.isArray(s.players)) return null;
  if (s.o.length > MAX_OBJECTS || s.log.length > MAX_LOG || s.players.length > MAX_PLAYERS) return TOO_LARGE;
  for (const o of s.o) {
    if (!o || typeof o !== "object") return null;
    if (typeof o.id !== "string" || o.id.length > 40) return null;
    if (typeof o.kind !== "string" || o.kind.length > 12) return null;
    if (typeof o.x !== "number" || !Number.isFinite(o.x) || Math.abs(o.x) > 5) return null;
    if (typeof o.z !== "number" || !Number.isFinite(o.z) || Math.abs(o.z) > 5) return null;
    if (o.pile && (!Array.isArray(o.pile) || o.pile.length > MAX_PILE)) return TOO_LARGE;
    // 卡面只允许带图片 key，避免把 dataURL 塞进每份桌面状态
    if (o.card && !validCard(o.card)) return null;
    if (Array.isArray(o.pile)) {
      for (const c of o.pile) if (c && !validCard(c)) return null;
    }
    if (o.backImg !== undefined && !IMAGE_KEY.test(String(o.backImg))) return null;
    // 桌垫同样是 key + 像素分离
    if (o.board && o.board.img !== undefined && !IMAGE_KEY.test(o.board.img)) return null;
    if (o.scale !== undefined && (!Number.isFinite(o.scale) || o.scale < 0.2 || o.scale > 4)) return null;
    if (!numInRange(o.len, 0.02, 2)) return null;
    if (!numInRange(o.duration, 0, 3700) || !numInRange(o.left, 0, 3700)) return null;
    if (o.endsAt !== undefined && o.endsAt !== null && (!Number.isFinite(o.endsAt) || o.endsAt < 1e12 || o.endsAt > 1e13)) return null;
    if (o.owner !== undefined && (typeof o.owner !== "string" || o.owner.length > 24)) return null;
    if (o.hand !== undefined && typeof o.hand !== "boolean") return null;
    // 区域垫：尺寸落在合理范围，priv 只接受布尔；攻防范围是整数几家，越界不如直接拒
    if (o.zone !== undefined) {
      const z = o.zone;
      if (!z || typeof z !== "object" || !Number.isFinite(z.w) || !Number.isFinite(z.d) || z.w < 0.15 || z.w > 2.2 || z.d < 0.15 || z.d > 2.2) return null;
      if (z.reach !== undefined && (!Number.isInteger(z.reach) || z.reach < 1 || z.reach > 8)) return null;
      if (z.guard !== undefined && (!Number.isInteger(z.guard) || z.guard < 0 || z.guard > 3)) return null;
      // 垫子标记只在是垫子时出现；垫面图和桌垫图一样只认内容哈希 key
      if (z.pad !== undefined && z.pad !== true) return null;
      if (z.img !== undefined && (typeof z.img !== "string" || !IMAGE_KEY.test(z.img))) return null;
    }
    if (o.priv !== undefined && typeof o.priv !== "boolean") return null;
    if (o.pref !== undefined && typeof o.pref !== "boolean") return null;
    // 统计垫：尺寸范围比区域垫小一档，lock 只接受布尔
    if (o.stat !== undefined) {
      const t = o.stat;
      if (!t || typeof t !== "object" || !Number.isFinite(t.w) || !Number.isFinite(t.d) || t.w < 0.12 || t.w > 1.2 || t.d < 0.12 || t.d > 1.2) return null;
    }
    if (o.lock !== undefined && typeof o.lock !== "boolean") return null;
    // 网格三开关：只许真格子棋盘带着，桌垫摊的是整张图，没格可吸也没线可关
    const gridded = o.kind === "board" && o.board && o.board.layout !== "mat";
    if (o.grid !== undefined && (o.grid !== true || !gridded)) return null;
    if (o.snap !== undefined && (o.snap !== false || !gridded)) return null;
    if (o.mesh !== undefined && (o.mesh !== false || !gridded)) return null;
    // 棋盘记住自己是哪张预设摆的：只有棋盘带，认不出预设名的字符串也不许脏别种物件
    if (o.preset !== undefined && (o.kind !== "board" || typeof o.preset !== "string" || !o.preset.length || o.preset.length > 24)) return null;
    // 卡槽带：只有格数一个字段，整数 1~14
    if (o.slot !== undefined) {
      const s = o.slot;
      if (!s || typeof s !== "object" || !Number.isInteger(s.n) || s.n < 1 || s.n > 14) return null;
    }
    // 转盘：扇区数 2~24；结果与起转时刻可有可无，但一旦带上就必须落在格内
    if (o.spinner !== undefined) {
      const sp = o.spinner;
      if (!sp || typeof sp !== "object" || !Number.isInteger(sp.n) || sp.n < 2 || sp.n > 24) return null;
      if (sp.value !== undefined && (!Number.isInteger(sp.value) || sp.value < 0 || sp.value >= sp.n)) return null;
      if (sp.at !== undefined && (!Number.isFinite(sp.at) || sp.at < 1e12 || sp.at > 1e13)) return null;
    }
    // 计分轨：刻度数 5~80，每人一枚棋子，位置不能掉出轨外
    if (o.track !== undefined) {
      const tk = o.track;
      if (!tk || typeof tk !== "object" || !Number.isInteger(tk.n) || tk.n < 5 || tk.n > 80) return null;
      // 缺数组是形状不对，超出 10 枚才是太大：两者分开报，别把脏数据说成体积问题
      if (!Array.isArray(tk.marks)) return null;
      if (tk.marks.length > 10) return TOO_LARGE;
      const seen = new Set();
      for (const m of tk.marks) {
        if (!m || typeof m !== "object") return null;
        if (typeof m.by !== "string" || !m.by.length || m.by.length > 24) return null;
        seen.add(m.by);
        if (!Number.isInteger(m.at) || m.at < 0 || m.at >= tk.n) return null;
        if (m.name !== undefined && (typeof m.name !== "string" || m.name.length > 20)) return null;
        if (m.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(m.color)) return null;
      }
      if (seen.size !== tk.marks.length) return null;
    }
    // 牌屏：只有长宽两个字段，厘米级；归属复用上面的 owner 规则
    if (o.shield !== undefined) {
      const sd = o.shield;
      if (!sd || typeof sd !== "object") return null;
      if (!Number.isFinite(sd.w) || sd.w < 0.16 || sd.w > 0.6) return null;
      if (!Number.isFinite(sd.h) || sd.h < 0.09 || sd.h > 0.28) return null;
    }
    // 沙漏：档位 1~10 分钟，起翻时刻要么没有要么是一个像样的 epoch 毫秒
    if (o.hour !== undefined) {
      const h = o.hour;
      if (!h || typeof h !== "object" || !Number.isInteger(h.mins) || h.mins < 1 || h.mins > 10) return null;
      if (h.at !== undefined && h.at !== null && (!Number.isFinite(h.at) || h.at < 1e12 || h.at > 1e13)) return null;
    }
    // 规则书：最多 24 页、每页 420 字，页码必须落在页内
    if (o.book !== undefined) {
      const bk = o.book;
      if (!bk || typeof bk !== "object" || !Array.isArray(bk.pages) || !bk.pages.length) return null;
      if (bk.pages.length > 24) return TOO_LARGE;
      for (const p of bk.pages) if (typeof p !== "string" || p.length > 420) return null;
      if (!Number.isInteger(bk.page) || bk.page < 0 || bk.page >= bk.pages.length) return null;
    }
    // 唱片机：状态里只带音频 key 和走带参数，字节本身不进门（跟卡面图片一个道理）
    if (o.gram !== undefined) {
      const gm = o.gram;
      if (!gm || typeof gm !== "object") return null;
      if (gm.clip !== null && !(typeof gm.clip === "string" && AUDIO_KEY.test(gm.clip))) return null;
      if (typeof gm.name !== "string" || gm.name.length > 24) return null;
      if (typeof gm.playing !== "boolean" || typeof gm.loop !== "boolean") return null;
      if (gm.at !== null && (!Number.isFinite(gm.at) || gm.at < 1e12 || gm.at > 1e13)) return null;
      // 在放却没记起播时刻 = 各端推出三个不同的进度，等于没同步
      if (gm.playing && gm.at === null) return null;
      if (!Number.isFinite(gm.dur) || gm.dur < 0 || gm.dur > 3600) return null;
      if (!Number.isFinite(gm.pos) || gm.pos < 0 || gm.pos > gm.dur) return null;
      if (!Number.isFinite(gm.vol) || gm.vol < 0 || gm.vol > 1) return null;
    }
    // 随身听：跟唱片机同一道形状检查，多出来的两位是「谁的机器」和「共享了没有」。
    // 字节本身从不经过这里——服务器一份都不存，歌只在同学之间的线路上走一遍。
    if (o.mp3 !== undefined) {
      const m = o.mp3;
      if (!m || typeof m !== "object") return null;
      if (m.clip !== null && !(typeof m.clip === "string" && AUDIO_KEY.test(m.clip))) return null;
      if (typeof m.name !== "string" || m.name.length > 24) return null;
      if (typeof m.by !== "string" || m.by.length > 24) return null;
      if (typeof m.shared !== "boolean" || typeof m.playing !== "boolean" || typeof m.loop !== "boolean") return null;
      if (m.at !== null && (!Number.isFinite(m.at) || m.at < 1e12 || m.at > 1e13)) return null;
      // 在放却没记起播时刻 = 各端推出三个不同的进度，等于没同步
      if (m.playing && m.at === null) return null;
      // 没共享出去的曲子不许在桌上留播放状态：那一台只在它主人自己机器上响
      if (!m.shared && (m.playing || m.loop)) return null;
      if (!Number.isFinite(m.dur) || m.dur < 0 || m.dur > 3600) return null;
      if (!Number.isFinite(m.pos) || m.pos < 0 || m.pos > m.dur) return null;
      if (!Number.isFinite(m.vol) || m.vol < 0 || m.vol > 1) return null;
    }
    // 迷你计数器：读数可以为负，步进 1~100。宿主与边号要么都在要么都不在，
    // 只带一半等于各端对「吸没吸住」有两种理解，整份状态拒收。
    if (o.counter !== undefined) {
      if (o.kind !== "counter") return null;
      const ct = o.counter;
      if (!ct || typeof ct !== "object") return null;
      if (!Number.isInteger(ct.v) || ct.v < -9999 || ct.v > 9999) return null;
      if (!Number.isInteger(ct.step) || ct.step < 1 || ct.step > 100) return null;
      const hasHost = ct.host !== undefined;
      if (hasHost !== (ct.edge !== undefined)) return null;
      if (hasHost) {
        if (typeof ct.host !== "string" || !ct.host.length || ct.host.length > 32) return null;
        if (!Number.isInteger(ct.edge) || ct.edge < 0 || ct.edge > 3) return null;
      }
    }
    // 骰盘：只有内径一对数字，厘米级（0.1~0.6 米），别的种类带上就是脏数据
    if (o.tray !== undefined) {
      if (o.kind !== "tray") return null;
      const tr = o.tray;
      if (!tr || typeof tr !== "object") return null;
      if (!Number.isFinite(tr.w) || tr.w < 0.1 || tr.w > 0.6) return null;
      if (!Number.isFinite(tr.d) || tr.d < 0.1 || tr.d > 0.6) return null;
    }
    // 平板浏览器：桌上只写一条地址和几个走带数，页面字节一直待在原来那个站点那边，一个字节都不过服务器。
    // 地址只认写死协议的 http/https——javascript: 与 data: 一旦能挂上屏，就等于把任意脚本塞进同桌每一个人的浏览器。
    // 老房间与老存档里那一屏写的是片号：照旧认下来，别一上线就把别人的旧 ROM 整份拒掉。
    if (o.tablet !== undefined) {
      if (o.kind !== "tablet") return null;
      const tb = o.tablet;
      if (!tb || typeof tb !== "object") return null;
      if (tb.url !== undefined && typeof tb.url !== "string") return null;
      if (typeof tb.url === "string" && tb.url) {
        if (tb.url.length > 500) return null;
        // 与控制字符同一条口径：换行与空格会把一条地址劈成两条，那已经不是 URL 了
        for (let i = 0; i < tb.url.length; i++) if (tb.url.charCodeAt(i) < 33) return null;
        if (!/^https?:\/\/[^/\s<>"'\\][^\s<>"'\\]*$/.test(tb.url)) return null;
      }
      if (tb.bv !== undefined && tb.bv !== null && !(typeof tb.bv === "string" && /^BV[0-9A-Za-z]{10,16}$/.test(tb.bv))) return null;
      if (!Number.isInteger(tb.page) || tb.page < 1 || tb.page > 100) return null;
      if (tb.rev !== undefined && (!Number.isInteger(tb.rev) || tb.rev > 999)) return null;
      if (typeof tb.playing !== "boolean" || typeof tb.mute !== "boolean") return null;
      if (tb.at !== null && (!Number.isFinite(tb.at) || tb.at < 1e12 || tb.at > 1e13)) return null;
      // 在放却没记起播时刻 = 各端推出三个不同的进度，等于没同步
      if (tb.playing && tb.at === null) return null;
      // 空屏不许留着放映状态：屏上什么都没有，却在「放」，那是脏数据
      if (!tb.url && !tb.bv && (tb.playing || tb.pos)) return null;
      if (!Number.isFinite(tb.pos) || tb.pos < 0 || tb.pos > 21600) return null;
    }
    // 高度锁定与俯仰角：布尔 + 有限角度，超出范围的整份状态拒收
    if (o.pin !== undefined && typeof o.pin !== "boolean") return null;
    if (!numInRange(o.tilt, -85, 85)) return null;
    // 斜靠只在钉住时成立：没锁定的俯仰角当场抹掉，免得各端一份平一份斜
    if (!o.pin && o.tilt !== undefined) delete o.tilt;
    // 桌上计算器：只带一条表达式，脏字符一律剔掉，各端按同一套求值算出同一个结果
    if (o.calc !== undefined) {
      if (!o.calc || typeof o.calc !== "object" || typeof o.calc.expr !== "string") return null;
      o.calc = { expr: o.calc.expr.replace(/[^0-9.+\-−×÷()]/g, "").slice(0, 40) };
    }
  }
  const name = typeof s.name === "string" ? s.name.slice(0, 40) : "牌桌";
  const turn = Number.isFinite(s.turn) ? Math.max(0, Math.min(MAX_PLAYERS - 1, Math.round(s.turn))) : 0;
  return {
    name,
    turn,
    step: s.step === -1 ? -1 : 1,
    o: s.o,
    players: s.players,
    log: s.log.map((l) => ({
      id: typeof l?.id === "string" ? l.id.slice(0, 40) : "",
      at: Number.isFinite(l?.at) ? l.at : 0,
      by: typeof l?.by === "string" ? l.by.slice(0, 20) : "",
      kind: typeof l?.kind === "string" ? l.kind.slice(0, 10) : "system",
      text: typeof l?.text === "string" ? l.text.slice(0, 400) : "",
      color: /^#[0-9a-fA-F]{6}$/.test(l?.color ?? "") ? l.color : undefined,
    })),
  };
}

/** 客户端自报的往返延迟，只当展示用；异常值一律丢掉而不是夹紧 */
function validRtt(value) {
  return Number.isFinite(value) && value >= 0 && value < 10000 ? Math.round(value) : undefined;
}

function validPresence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [id, raw] of Object.entries(value).slice(0, 32)) {
    if (typeof id !== "string" || id.length > 24 || !raw || typeof raw !== "object") continue;
    const entry = {
      name: typeof raw.name === "string" ? raw.name.slice(0, 20) : "玩家",
      at: Number.isFinite(raw.at) ? raw.at : 0,
      color: /^#[0-9a-fA-F]{6}$/.test(raw.color ?? "") ? raw.color : "#c8443c",
    };
    const rtt = validRtt(raw.rtt);
    if (rtt !== undefined) entry.rtt = rtt;
    // 指纹短号：昵称撞车时靠它认人，只有 8 个字符，不含任何原始设备信息
    if (/^[A-Z0-9]{4,16}$/.test(String(raw.fp ?? ""))) entry.fp = String(raw.fp);
    out[id.slice(0, 24)] = entry;
  }
  return out;
}

const COLS = "code,state,version,presence,updated_at";

async function loadRoom(supabase, code) {
  const { data, error } = await supabase.from("rooms").select(COLS).eq("code", code).maybeSingle();
  if (error) throw new Error("database_request_failed");
  return data ?? null;
}

function snapshot(row) {
  return {
    code: row.code,
    version: Number(row.version),
    state: row.state,
    presence: row.presence && typeof row.presence === "object" ? row.presence : {},
  };
}

async function createRoom(supabase, state) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, state, version: 1, presence: {}, created_at: now, updated_at: now })
      .select(COLS)
      .maybeSingle();
    if (!error && data) return snapshot(data);
    // 主键冲突可安全重试；其他错误直接返回不可用
    if (error && error.code !== "23505") throw new Error("database_request_failed");
  }
  throw new Error("database_request_failed");
}

/** 版本条件更新：返回 null 表示基线版本已被他人推进 */
async function casRoom(supabase, code, base, state) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("rooms")
    .update({ state, version: base + 1, updated_at: now })
    .eq("code", code)
    .eq("version", base)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error("database_request_failed");
  return data ?? null;
}

async function touchPresence(supabase, code, clientId, name, color, rtt) {
  const room = await loadRoom(supabase, code);
  if (!room) return null;
  const presence = validPresence(room.presence);
  const id = clientId.slice(0, 24);
  delete presence[id];
  const cutoff = Date.now() - 45000;
  for (const [key, value] of Object.entries(presence)) if (!value.at || value.at < cutoff) delete presence[key];
  const entry = { name: name.slice(0, 20) || "玩家", at: Date.now(), color };
  const measured = validRtt(rtt);
  if (measured !== undefined) entry.rtt = measured;
  presence[id] = entry;
  const { data, error } = await supabase
    .from("rooms")
    .update({ presence, updated_at: new Date().toISOString() })
    .eq("code", code)
    .select(COLS)
    .maybeSingle();
  if (error || !data) throw new Error("database_request_failed");
  return snapshot(data);
}

async function commit(supabase, { code, base, state, by }) {
  const room = await loadRoom(supabase, code);
  if (!room) return bad("room_not_found", 404);
  const current = Number(room.version);
  if (current !== base) return json({ ok: false, conflict: true, ...snapshot(room) });
  const written = await casRoom(supabase, code, base, state);
  if (!written) {
    const latest = (await loadRoom(supabase, code)) ?? room;
    return json({ ok: false, conflict: true, ...snapshot(latest) });
  }
  return json({ ok: true, ...snapshot(written), by: typeof by === "string" ? by.slice(0, 20) : "" });
}

const ACTIONS = new Set(["create", "join", "sync", "commit", "presence", "putImage", "getImage"]);

/** 卡面像素按内容哈希存一份，重复写入视为幂等成功 */
async function putImage(supabase, key, data) {
  if (!IMAGE_KEY.test(key) || typeof data !== "string" || !IMAGE_DATA.test(data)) return bad("invalid_input", 400);
  const now = new Date().toISOString();
  const { error } = await supabase.from("card_images").insert({ key, data, created_at: now });
  if (error && error.code !== "23505") throw new Error("database_request_failed");
  return json({ ok: true, key });
}

async function getImages(supabase, keys) {
  if (!Array.isArray(keys) || !keys.length || keys.length > 24) return bad("invalid_input", 400);
  const clean = [];
  for (const key of keys) {
    if (typeof key !== "string" || !IMAGE_KEY.test(key)) return bad("invalid_input", 400);
    if (!clean.includes(key)) clean.push(key);
  }
  const { data, error } = await supabase.from("card_images").select("key,data").in("key", clean);
  if (error) throw new Error("database_request_failed");
  const found = new Map();
  for (const row of data ?? []) {
    if (typeof row?.key === "string" && IMAGE_KEY.test(row.key) && typeof row.data === "string" && IMAGE_DATA.test(row.data)) {
      if (!found.has(row.key)) found.set(row.key, row.data);
    }
  }
  const images = {};
  const omitted = [];
  let used = 0;
  // 按请求顺序装填，超出响应的 key 交给客户端下一轮再取，不能当成取不到
  for (const key of clean) {
    const dataURL = found.get(key);
    if (!dataURL) continue;
    if (used + dataURL.length > IMAGE_BUDGET) { omitted.push(key); continue; }
    images[key] = dataURL;
    used += dataURL.length;
  }
  return json({ ok: true, images, omitted });
}

export async function handleTable({ request, supabase }) {
  if (request.method !== "POST") return bad("method_not_allowed", 405);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) return bad("state_too_large", 413);
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return bad("state_too_large", 413);
    body = JSON.parse(text);
  } catch {
    return bad("invalid_input", 400);
  }
  if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) return bad("invalid_input", 400);

  try {
    if (body.action === "create") {
      const state = validState(body.state);
      if (state === TOO_LARGE) return bad("state_too_large", 413);
      if (!state) return bad("invalid_input", 400);
      const snap = await createRoom(supabase, state);
      return json({ ok: true, ...snap });
    }

    if (body.action === "putImage") return await putImage(supabase, body.key, body.data);
    if (body.action === "getImage") return await getImages(supabase, body.keys);

    if (!validCode(body.code)) return bad("invalid_input", 400);
    const code = body.code.toUpperCase();

    if (body.action === "join" || body.action === "sync") {
      const room = await loadRoom(supabase, code);
      if (!room) return bad("room_not_found", 404);
      const snap = snapshot(room);
      if (body.action === "join") return json({ ok: true, ...snap });
      const base = Number(body.base);
      if (!Number.isFinite(base)) return bad("invalid_input", 400);
      if (base === snap.version) return json({ ok: true, changed: false, version: snap.version, presence: snap.presence });
      return json({ ok: true, changed: true, ...snap });
    }

    if (body.action === "commit") {
      const base = Number(body.base);
      if (!Number.isInteger(base) || base < 1) return bad("invalid_input", 400);
      const state = validState(body.state);
      if (state === TOO_LARGE) return bad("state_too_large", 413);
      if (!state) return bad("invalid_input", 400);
      if (JSON.stringify(state).length > MAX_STATE) return bad("state_too_large", 413);
      return await commit(supabase, { code, base, state, by: body.by });
    }

    // presence
    if (typeof body.clientId !== "string" || !body.clientId.length) return bad("invalid_input", 400);
    const snap = await touchPresence(supabase, code, body.clientId, String(body.name ?? ""), /^#[0-9a-fA-F]{6}$/.test(body.color ?? "") ? body.color : "#c8443c", body.rtt);
    if (!snap) return bad("room_not_found", 404);
    return json({ ok: true, presence: snap.presence });
  } catch (error) {
    if (error instanceof Error && error.message === "database_request_failed") return bad("service_unavailable", 503);
    return bad("service_unavailable", 503);
  }
}
