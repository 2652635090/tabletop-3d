// 自建实时网关的回归校验：真的起一个 server/index.mjs，用两个 WebSocket 客户端跑完
// create/join/commit/冲突/presence/像素/ROM 存档/公开大厅/重启快照，并测一次“本机推送延迟”。
// 用法：node dev/realtime-check.mjs [端口]
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = [];
const check = (label, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const die = (id) => ({ id, kind: "die", x: 0.1, z: 0.1, rot: 0, layer: 0, sides: 6, value: 3 });
const stateOf = (objects = [die("d1")], name = "实时") => ({ name, o: objects, players: [], turn: 0, step: 1, log: [] });

async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const hit = fn();
    if (hit) return hit;
    if (Date.now() > end) return null;
    await wait(4);
  }
}

function connect(url) {
  const ws = new WebSocket(url);
  const client = {
    ws,
    seq: 0,
    pending: new Map(),
    pushes: [],
    closed: false,
    op(data) {
      const id = ++client.seq;
      const p = new Promise((res) => client.pending.set(id, res));
      ws.send(JSON.stringify({ ...data, id }));
      // 没有回执就明确报出是哪个 op，别让整场校验静默挂在那里
      let timer = 0;
      const guard = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(`op 超时: ${data.op}`)), 5000);
      });
      guard.catch(() => {});
      return Promise.race([p, guard]).finally(() => clearTimeout(timer));
    },
    /** 只发不收的帧（拖动预览这类没有回执的消息） */
    fire(data) {
      ws.send(JSON.stringify(data));
    },
    /** 取走第一条匹配的服务器推送，避免后面的用例读到旧消息 */
    take(matcher) {
      const index = client.pushes.findIndex(matcher);
      if (index < 0) return null;
      return client.pushes.splice(index, 1)[0];
    },
    close() {
      try {
        ws.close();
      } catch {
        /* 已经关了 */
      }
    },
  };
  ws.onmessage = (event) => {
    let msg = null;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!msg) return;
    const key = msg.id;
    if ((typeof key === "number" || typeof key === "string") && client.pending.has(key)) {
      const res = client.pending.get(key);
      client.pending.delete(key);
      res(msg);
      return;
    }
    // 服务器主动推送、以及没人认领的错误回复，都留给 take() 断言
    client.pushes.push(msg);
  };
  ws.onclose = () => {
    client.closed = true;
  };
  return new Promise((res, rej) => {
    ws.onopen = () => res(client);
    ws.onerror = (e) => rej(e.error ?? new Error("websocket_failed"));
  });
}

async function start(port, dir) {
  const child = spawn(process.execPath, [join(root, "server", "index.mjs")], {
    cwd: join(root, "server"),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dir, SITE_DIR: join(root, "dist") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) return child;
    } catch {
      /* 还没起来 */
    }
    if (child.exitCode !== null) break;
    await wait(50);
  }
  throw new Error("server 启动失败");
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await until(() => child.exitCode !== null, 4000);
}

const port = Number(process.argv[2] || 20921);
const dir = await mkdtemp(join(tmpdir(), "tabletop-rt-"));
let child = null;
try {
  child = await start(port, dir);
  const client = await connect(`ws://127.0.0.1:${port}/ws`);
  check("握手成功", client.ws.readyState === 1);
  const health = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
  check("healthz 可访问", health.ok === true && typeof health.uptime === "number");
  const page = await fetch(`http://127.0.0.1:${port}/`);
  const html = await page.text();
  check("同端口托管前端首页", page.ok && /<div id="root">/.test(html) && /no-store/.test(page.headers.get("cache-control") || ""), page.headers.get("content-type"));
  const spa = await fetch(`http://127.0.0.1:${port}/join/ABCDEF`);
  check("未知路径回落 index.html", spa.ok && /<div id="root">/.test(await spa.text()));
  const traversal = await fetch(`http://127.0.0.1:${port}/%2e%2e%2fpackage.json`);
  const traversalBody = await traversal.text();
  check("编码后的目录穿越拿不到站点外的文件", !/"name": "tabletop-3d"/.test(traversalBody) && /<div id="root">/.test(traversalBody));

  const created = await client.op({ op: "create", state: stateOf() });
  check("create 返回房间码", created.ok === true && /^[A-Z0-9]{6}$/.test(created.code || ""), created.code);
  check("create 版本为 1", created.version === 1);
  const code = created.code;

  const b = await connect(`ws://127.0.0.1:${port}/ws`);
  const joined = await b.op({ op: "join", code });
  check("join 拿到同一份桌面", joined.ok === true && joined.state.o.length === 1 && joined.version === 1);

  const noChange = await b.op({ op: "sync", code, base: 1 });
  check("sync 版本一致时 changed:false", noChange.ok === true && noChange.changed === false && noChange.state === null);

  // ——— 实时性：A 提交后 B 不轮询也应立刻收到 ———
  const moved = { ...created.state, o: [{ ...die("d1"), x: 0.42 }], log: [{ id: "l1", at: Date.now(), by: "甲", kind: "move", text: "移动了骰子" }] };
  const t0 = performance.now();
  const committed = client.op({ op: "commit", code, base: 1, state: moved, by: "甲" });
  const pushed = await until(() => b.take((m) => m.t === "room" && m.version === 2), 2000);
  const dt = performance.now() - t0;
  check("A 提交后 B 立刻收到房间推送", !!pushed && pushed.state.o[0].x === 0.42, pushed ? `v${pushed.version}` : "超时");
  check("本机推送延迟在 120ms 以内", !!pushed && dt < 120, `${Math.round(dt)}ms`);
  check("提交方自己也拿到 v2", (await committed).version === 2);
  const echo = await until(() => client.take((m) => m.t === "room" && m.version === 2), 200);
  check("提交方不会收到自己的回声推送", echo === null);

  const ack = await b.op({ op: "commit", code, base: 1, state: moved, by: "乙" });
  check("旧版本写入被判冲突", ack.ok === false && ack.conflict === true && ack.version === 2 && ack.state.o[0].x === 0.42, `v${ack.version}`);
  const rejected = await b.op({ op: "commit", code, base: 2, state: { ...moved, o: [{ ...die("d1"), x: 99 }] }, by: "乙" });
  check("越界桌面被拒绝并回权威状态", rejected.ok === false && rejected.rejected === "invalid_state" && rejected.state.o[0].x === 0.42, rejected.rejected);
  const fat = await b.op({ op: "create", state: stateOf(Array.from({ length: 500 }, (_, i) => die(`d${i}`))) });
  check("超大桌面被拒绝", fat.ok === false && fat.error === "invalid_state");
  const fatCommit = await b.op({ op: "commit", code, base: 2, state: stateOf(Array.from({ length: 500 }, (_, i) => die(`d${i}`))), by: "乙" });
  check("提交超物件数上限回 tooLarge", fatCommit.ok === false && fatCommit.rejected === "tooLarge", fatCommit.rejected);

  const ghost = await b.op({ op: "join", code: "ZZZZZZ" });
  check("不存在的房间回 room_not_found", ghost.ok === false && ghost.error === "room_not_found");
  const junk = await b.op({ op: "drop-table" });
  check("未知 op 被拒绝", junk.ok === false && junk.error === "unknown_op");
  client.ws.send("{not json");
  check("坏帧只回错误不断线", (await until(() => client.take((m) => m.error === "invalid_json"), 1000)) !== null && !client.closed);

  // ——— 存在性 ———
  const p1 = await client.op({ op: "presence", code, clientId: "c-1", name: "甲", color: "#c8443c" });
  check("presence 收下自己", p1.ok === true && p1.presence["c-1"].name === "甲" && p1.presence["c-1"].color === "#c8443c");
  const sawPresence = await until(() => b.take((m) => m.t === "presence" && m.presence["c-1"]), 2000);
  check("其他人实时收到在线名单", !!sawPresence);
  const p2 = await b.op({ op: "presence", code, clientId: "c-2", name: "乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙太多了", color: "#not-a-color" });
  check("presence 截断名字并挡住非法颜色", p2.presence["c-2"].name.length === 20 && /^#[0-9a-fA-F]{6}$/.test(p2.presence["c-2"].color), `${p2.presence["c-2"].name.length}/${p2.presence["c-2"].color}`);
  check("presence 不推进版本号", p2.version === 2, `v${p2.version}`);
  const pRtt = await client.op({ op: "presence", code, clientId: "c-1", name: "甲", color: "#c8443c", rtt: 23 });
  check("presence 收下自测延迟", pRtt.presence["c-1"].rtt === 23);
  const pBogus = await client.op({ op: "presence", code, clientId: "c-1", name: "甲", color: "#c8443c", rtt: 99999 });
  check("离谱的自报延迟直接丢掉而不是夹紧", pBogus.presence["c-1"].rtt === undefined);

  // ——— 延迟探测 ———
  const sentAt = Date.now();
  const pong = await client.op({ op: "ping", at: sentAt });
  const rtt = Date.now() - sentAt;
  check("ping 回 pong 并带回发送时刻", pong.ok === true && pong.t === "pong" && pong.at === sentAt && typeof pong.now === "number");
  check("本机 RTT 是个合理的毫秒数", rtt >= 0 && rtt < 1000, `${rtt}ms`);

  // ——— 拖动流式广播：不落库、不抬版本，只转给同桌其他人 ———
  client.fire({ op: "drag", code, by: "甲", color: "#c8443c", m: [{ id: "d1", x: 0.4123456, z: -0.2, rot: 45 }] });
  const frame = await until(() => b.take((m) => m.t === "drag" && m.by === "甲"), 2000);
  check("别人实时收到拖动帧", !!frame && frame.m[0].id === "d1" && frame.m[0].rot === 45, JSON.stringify(frame?.m ?? null));
  check("拖动帧把坐标收到三位小数，够对齐也免得刷屏", !!frame && frame.m[0].x === 0.412, String(frame?.m?.[0]?.x));
  check("拖动方自己不收回声", (await until(() => client.take((m) => m.t === "drag"), 150)) === null);
  check("拖动帧不推进版本号", (await client.op({ op: "sync", code, base: 2 })).changed === false);
  b.pushes.length = 0;
  client.fire({ op: "drag", code, by: "甲", color: "#c8443c", m: [{ id: "d1", x: "0.3", z: 0 }] });
  client.fire({ op: "drag", code, by: "", color: "#c8443c", m: [{ id: "d1", x: 0.3, z: 0 }] });
  client.fire({ op: "drag", code, by: "甲", color: "#c8443c", m: Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, x: 0.1, z: 0.1 })) });
  client.fire({ op: "drag", code: "ZZZZZZ", by: "甲", color: "#c8443c", m: [{ id: "d1", x: 0.3, z: 0 }] });
  check("坏拖动帧整帧丢掉且不回错误", (await until(() => b.take((m) => m.t === "drag"), 200)) === null);
  check("坏拖动帧不断线，桌面也没变", (await client.op({ op: "sync", code, base: 2 })).changed === false);
  // 前一秒的额度已经被上面的用例占掉，先等窗口翻篇，再来一局确定性的洪泛
  await wait(1100);
  b.pushes.length = 0;
  for (let i = 0; i < 40; i++) {
    client.fire({ op: "drag", code, by: "甲", color: "#c8443c", m: [{ id: "d1", x: 0.1 + i / 100, z: 0.1 }] });
  }
  await wait(300);
  const burst = b.pushes.filter((m) => m.t === "drag").length;
  b.pushes.length = 0;
  check("拖动洪泛按每秒额度收口", burst >= 18 && burst <= 20, `${burst}/40 帧`);

  // ——— 像素 ———
  const img = "data:image/webp;base64," + "A".repeat(4096);
  const put = await client.op({ op: "putImage", key: "rtabc123", data: img });
  check("putImage 收下合法图", put.ok === true);
  const again = await client.op({ op: "putImage", key: "rtabc123", data: img });
  check("重复上传幂等", again.ok === true);
  const got = await client.op({ op: "getImage", keys: ["rtabc123", "nothere1"] });
  check("getImage 只返回存在的像素", got.images.rtabc123 === img && got.omitted.join() === "nothere1", JSON.stringify(got.omitted));
  check("非法 key 被拒绝", (await client.op({ op: "putImage", key: "BAD KEY", data: img })).ok === false);
  check("非图片 dataURL 被拒绝", (await client.op({ op: "putImage", key: "rtabc124", data: "data:text/html;base64,PHNjcmlwdD4=" })).ok === false);
  check("超大像素被拒绝", (await client.op({ op: "putImage", key: "rtabc125", data: "data:image/png;base64," + "A".repeat(210000) })).ok === false);
  // ——— 同桌求源：服务器答不上来的那几张，在房里喊一嗓子让有图的人去补传 ———
  // 放在下一段开新房之前：client 一旦 create/join 另一间房就离开了这间房的订阅集
  b.pushes.length = 0;
  client.fire({ op: "askImage", code, keys: ["probeaaa", "probebbb"] });
  const ask = await until(() => b.take((m) => m.t === "askImage" && m.code === code), 2000);
  check("同桌听得到求源广播", !!ask && ask.keys.join() === "probeaaa,probebbb", JSON.stringify(ask?.keys ?? null));
  check("喊话的人自己不收回声", (await until(() => client.take((m) => m.t === "askImage"), 150)) === null);
  b.pushes.length = 0;
  client.fire({ op: "askImage", code, keys: ["rtabc123"] });
  check("同一个人两秒内再喊不透传，免得刷成上传风暴", (await until(() => b.take((m) => m.t === "askImage"), 300)) === null);
  client.pushes.length = 0;
  b.fire({ op: "askImage", code, keys: ["BAD KEY", "rtabc123", 42, null] });
  const onlyGood = await until(() => client.take((m) => m.t === "askImage"), 2000);
  check("非法 key 被滤掉，合法的那张照样喊给同桌", !!onlyGood && onlyGood.keys.join() === "rtabc123", JSON.stringify(onlyGood?.keys ?? null));
  client.pushes.length = 0;
  b.pushes.length = 0;
  // 等额度翻篇，这样「收不到」只可能是因为那桌不对，不可能是因为被限流
  await wait(2100);
  b.fire({ op: "askImage", code: "ZZZZZZ", keys: ["rtabc123"] });
  check("不在那一桌就喊不动那一桌", (await until(() => client.take((m) => m.t === "askImage"), 300)) === null);

  const bigRoom = await client.op({ op: "create", state: stateOf([{ id: "m1", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { img: "rtabc123", w: 2, d: 1.4 } }]) });
  check("桌垫 key 走状态、像素走单独通道", bigRoom.state.o[0].board.img === "rtabc123");

  // ——— 随身听点对点递歌：服务器只替人递一下，自己一个字节都不存 ———
  const songKey = "arec6ord1";
  const player = { id: "mp1", kind: "mp3", x: 0.2, z: 0.2, rot: 0, layer: 0, color: "#3f7d5a", mp3: { clip: songKey, name: "月光小夜曲", dur: 214.5, pos: 0, playing: false, at: null, vol: 0.6, loop: false, by: "own-1", shared: false } };
  const owner = await connect(`ws://127.0.0.1:${port}/ws`);
  const fan = await connect(`ws://127.0.0.1:${port}/ws`);
  const playerRoom = await owner.op({ op: "create", state: stateOf([player], "随身桌") });
  const pcode = playerRoom.code;
  await owner.op({ op: "join", code: pcode, clientId: "own-1", fp: "OWNFP0000001" });
  await fan.op({ op: "join", code: pcode, clientId: "fan-1", fp: "FANFP0000001" });
  check("带随身听的桌面收得下：桌上只有歌曲 key 与走带读数", playerRoom.ok === true && playerRoom.state?.o?.[0]?.mp3?.clip === songKey, playerRoom.error ?? pcode);
  const pVersion = (await owner.op({ op: "sync", code: pcode, base: 0 })).version;

  fan.fire({ op: "mp3Want", code: pcode, to: "own-1", key: songKey });
  const want = await until(() => owner.take((m) => m.t === "mp3Want" && m.code === pcode), 2000);
  check("求歌那句话只递给机器的主人，还带着是谁在要", !!want && want.from === "fan-1" && want.key === songKey, JSON.stringify(want ?? null));
  check("喊话的人自己不收回声", (await until(() => fan.take((m) => m.t === "mp3Want"), 150)) === null);
  fan.fire({ op: "mp3Want", code: pcode, to: "own-1", key: songKey });
  check("同一个人两秒内再求不透传：一首歌只喊一回，别人不该被连着敲", (await until(() => owner.take((m) => m.t === "mp3Want"), 300)) === null);
  // 等求歌的额度翻篇，这样下面「收不到」只可能是因为 key 不对，不可能是因为被限流
  await wait(2100);
  fan.fire({ op: "mp3Want", code: pcode, to: "own-1", key: "BAD KEY" });
  check("不合规矩的歌曲 key 递不出去", (await until(() => owner.take((m) => m.t === "mp3Want"), 300)) === null);
  await wait(2100);
  fan.fire({ op: "mp3Want", code: pcode, to: "own-1", key: songKey });
  check("上一句被挡下来没把线路弄坏：下一扇窗里合法的那句照样到", !!(await until(() => owner.take((m) => m.t === "mp3Want"), 2000)));

  const partData = "A".repeat(2048);
  fan.pushes.length = 0;
  owner.fire({ op: "mp3Part", code: pcode, to: "fan-1", key: songKey, seq: 0, total: 2, data: partData });
  const part = await until(() => fan.take((m) => m.t === "mp3Part" && m.code === pcode), 2000);
  check("一段歌的字节照着序号递到要它的人手里，带的是歌曲 key 不是房间号", !!part && part.from === "own-1" && part.key === songKey && part.seq === 0 && part.total === 2 && part.data === partData, JSON.stringify({ t: part?.t, key: part?.key, seq: part?.seq, len: part?.data?.length }));
  fan.pushes.length = 0;
  owner.fire({ op: "mp3Part", code: pcode, to: "ghost-1", key: songKey, seq: 1, total: 2, data: partData });
  check("递给不在这一桌的人：一个字节也不落到别人头上", (await until(() => fan.take((m) => m.t === "mp3Part"), 300)) === null);
  for (const [label, msg] of [
    ["超大的一段（140001 字符）", { seq: 0, total: 2, data: "A".repeat(140001) }],
    ["序号是小数", { seq: 1.5, total: 2, data: partData }],
    ["序号是负的", { seq: -1, total: 2, data: partData }],
    ["不说一共几段", { seq: 0, total: 0, data: partData }],
    ["段数多到不像一首歌", { seq: 0, total: 999999, data: partData }],
    ["不是 base64 的一串", { seq: 0, total: 2, data: "bad data!!" }],
    ["不合规矩的歌曲 key", { seq: 0, total: 2, data: partData, key: "BAD KEY" }],
  ]) {
    fan.pushes.length = 0;
    owner.fire({ op: "mp3Part", code: pcode, to: "fan-1", key: songKey, ...msg });
    check(`${label} 被挡在门外`, (await until(() => fan.take((m) => m.t === "mp3Part"), 200)) === null);
  }
  // 前一秒的额度已经被上面那几段占掉，先等窗口翻篇，再来一局确定性的洪泛
  await wait(1100);
  fan.pushes.length = 0;
  const bigPart = "A".repeat(140000);
  for (let i = 0; i < 60; i++) owner.fire({ op: "mp3Part", code: pcode, to: "fan-1", key: songKey, seq: i, total: 60, data: bigPart });
  await wait(400);
  const flooded = fan.pushes.filter((m) => m.t === "mp3Part").length;
  fan.pushes.length = 0;
  check("递字节按每人每秒的额度收口：谁也不能拿同桌当下载站", flooded < 60 && flooded > 20, `${flooded}/60 段`);
  const pAfter = await owner.op({ op: "sync", code: pcode, base: pVersion });
  check("求歌与递歌全程没在服务器上落下一笔桌面", pAfter.changed === false && pAfter.version === pVersion, JSON.stringify({ changed: pAfter.changed, version: pAfter.version, base: pVersion }));
  const notStored = await owner.op({ op: "getImage", keys: [songKey] });
  check("歌曲 key 从没进过服务器的像素仓库", notStored.omitted?.join() === songKey && notStored.images?.[songKey] === undefined, JSON.stringify(notStored.omitted ?? null));
  owner.close();
  fan.close();

  // ——— 持久化房间：桌面定档成 ROM，存档不受房间生命周期影响 ———
  const romSource = stateOf([{ ...die("d1"), x: 0.5 }], "存档源");
  const romV2 = { ...romSource, name: "覆盖后" };
  const romCreated = await client.op({ op: "romSave", state: romSource, title: "我的桌", note: "第一档", by: "甲" });
  check("romSave 新建回 8 位存档号", romCreated.ok === true && /^[A-Z0-9]{8}$/.test(romCreated.romId || ""), romCreated.romId);
  check("romSave 只在新建那一次回口令", typeof romCreated.token === "string" && /^[0-9a-f]{24}$/.test(romCreated.token || ""));
  check("存档元数据里不含口令或其摘要", romCreated.rom?.title === "我的桌" && romCreated.rom.objects === 1 && romCreated.rom.hash === undefined && romCreated.rom.token === undefined);
  // 回执全靠前后的帧 id 对号：存档号要是顶掉了它，客户端就只能等到超时
  client.ws.send(JSON.stringify({ op: "romGet", romId: romCreated.romId, id: "rom-probe" }));
  const echoed = await until(() => client.take((m) => m.id === "rom-probe"), 2000);
  check("存档回复留着帧 id，存档号另走 romId", echoed?.ok === true && echoed.romId === romCreated.romId, JSON.stringify(echoed?.romId ?? echoed?.error ?? null));
  const romId = romCreated.romId;

  const romListed = await client.op({ op: "romList" });
  check("romList 列出存档与定档人", romListed.roms.some((r) => r.id === romId && r.owner === "甲" && r.note === "第一档"));
  const romRead = await client.op({ op: "romGet", romId: romId });
  check("romGet 读回桌面本体且不带口令", romRead.state?.o?.[0]?.x === 0.5 && romRead.token === undefined && romRead.hash === undefined);
  check("romGet 不存在的存档回 rom_not_found", (await client.op({ op: "romGet", romId: "ZZZZZZZZ" })).error === "rom_not_found");
  check("romGet 非法存档号不被当作存在", (await client.op({ op: "romGet", romId: "bad id!" })).error === "rom_not_found");

  const romOver = await client.op({ op: "romSave", romId: romId, token: romCreated.token, state: romV2, title: "改名了", by: "乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙乙" });
  check("带口令能覆盖自己的存档且不再回口令", romOver.ok === true && romOver.token === undefined, romOver.error);
  check("覆盖写入生效", (await client.op({ op: "romGet", romId: romId })).state?.name === "覆盖后");
  check("存档标题与定档人被截到合理长度", romOver.rom?.title === "改名了" && romOver.rom.owner.length === 20, `${romOver.rom?.title}/${romOver.rom?.owner?.length}`);
  const romKept = await client.op({ op: "romSave", romId: romId, token: romCreated.token, state: romV2 });
  check("覆盖时空标题保留原名", romKept.ok === true && romKept.rom?.title === "改名了", romKept.rom?.title);
  check("口令不对的覆盖被拒绝", (await client.op({ op: "romSave", romId: romId, token: "0".repeat(24), state: romV2, by: "乙" })).error === "access_denied");
  check("没口令删不掉存档", (await client.op({ op: "romRemove", romId: romId })).error === "access_denied");
  check("覆盖不存在的存档回 rom_not_found", (await client.op({ op: "romSave", romId: "AAAAAAAA", token: romCreated.token, state: romV2 })).error === "rom_not_found");
  check("定档非法桌面回 invalid_state", (await client.op({ op: "romSave", state: { ...romSource, o: [{ ...die("d1"), x: Number.NaN }] } })).error === "invalid_state");
  check("定档超物件数上限回 state_too_large", (await client.op({ op: "romSave", state: stateOf(Array.from({ length: 500 }, (_, i) => die(`r${i}`))) })).error === "state_too_large");

  const ro = await connect(`ws://127.0.0.1:${port}/ws`);
  const opened = await ro.op({ op: "romOpen", romId: romId });
  check("romOpen 从存档摆出一张新桌", opened.ok === true && /^[A-Z0-9]{6}$/.test(opened.code || "") && opened.version === 1 && opened.state?.name === "覆盖后", opened.code);
  check("romOpen 标明这桌来自哪份存档", opened.romId === romId && opened.romTitle === "改名了");
  check("romOpen 不存在的存档回 rom_not_found", (await ro.op({ op: "romOpen", romId: "ZZZZZZZZ" })).error === "rom_not_found");
  const openedJoin = await ro.op({ op: "join", code: opened.code });
  check("从存档开的桌可正常加入并保留来源", openedJoin.romId === romId && openedJoin.state.name === "覆盖后");
  check("romOpen 不会改动存档本身", (await client.op({ op: "romGet", romId: romId })).state?.name === "覆盖后");
  check("romOpen 出来的桌能照常提交推进", (await ro.op({ op: "commit", code: opened.code, base: 1, state: { ...romV2, o: [{ ...die("d1"), x: 0.9 }] }, by: "甲" })).version === 2);
  check("改过的桌况不会回写到存档", (await client.op({ op: "romGet", romId: romId })).state?.o?.[0]?.x === 0.5);

  // ——— 公开大厅：只有主动挂牌的房间才会被陌生人看到 ———
  check("没人挂牌时大厅是空的", (await ro.op({ op: "roomList" })).rooms.length === 0);
  const featured = await ro.op({ op: "roomFeature", code: opened.code, listed: true });
  check("挂牌成功并回当前状态", featured.ok === true && featured.listed === true && featured.code === opened.code);
  const lobbyRow = (await client.op({ op: "roomList" })).rooms.find((r) => r.code === opened.code);
  check("大厅里能看到挂牌的房间", !!lobbyRow && lobbyRow.name === "覆盖后" && lobbyRow.objects === 1 && lobbyRow.romId === romId, JSON.stringify(lobbyRow ?? null));
  check("大厅里的房间可按房间码加入", (await client.op({ op: "join", code: opened.code })).state?.name === "覆盖后");
  check("没挂牌的房间不出现在大厅里", !(await client.op({ op: "roomList" })).rooms.some((r) => r.code === code));
  check("挂牌不推进版本号", (await ro.op({ op: "sync", code: opened.code, base: 2 })).changed === false);
  await ro.op({ op: "presence", code: opened.code, clientId: "c-9", name: "甲", color: "#c8443c" });
  check("在座人数来自没过期的心跳", ((await client.op({ op: "roomList" })).rooms.find((r) => r.code === opened.code))?.peers === 1);
  check("挂牌不存在的房间回 room_not_found", (await ro.op({ op: "roomFeature", code: "ZZZZZZ", listed: true })).error === "room_not_found");
  const unlisted = await ro.op({ op: "roomFeature", code: opened.code, listed: false });
  check("摘牌后大厅不再列它", unlisted.listed === false && !(await client.op({ op: "roomList" })).rooms.some((r) => r.code === opened.code));
  check("重新挂牌会一直带到重启之后", (await ro.op({ op: "roomFeature", code: opened.code, listed: true })).listed === true);

  // ——— 房主与成员权限：服务端拿两份状态做差逐件收口，客户端那一层改不动这里 ———
  const BOARD = { id: "b1", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { img: "rtabc123", w: 2, d: 1.4 } };
  const host = await connect(`ws://127.0.0.1:${port}/ws`);
  const owned = await host.op({
    op: "create",
    state: stateOf([die("p1"), { ...die("p2"), x: 0.2 }, BOARD], "权限房"),
    clientId: "host-1", fp: "HOSTFP1234", ownerName: "房主甲",
  });
  const own = owned.code;
  let v = owned.version;
  check("带身份开房回 24 位房主口令", owned.ok === true && /^[0-9a-f]{24}$/.test(owned.token || ""));
  check("口令只在这一次响应里，桌面与快照都不带", owned.hash === undefined && owned.state?.token === undefined && JSON.stringify(owned.state).includes(owned.token) === false);
  check("房间元信息报出房主、私密与空白权限表", owned.room?.owner === "host-1" && owned.room?.ownerName === "房主甲" && owned.room?.ownerFp === "HOSTFP1234" && owned.room?.pub === false && Object.keys(owned.room?.perms ?? {}).length === 0, JSON.stringify(owned.room ?? null));
  const anonRoom = await client.op({ op: "create", state: stateOf([die("a1")], "无主桌") });
  check("没报上身份的开局没有房主也不发口令", anonRoom.ok === true && anonRoom.token === undefined && anonRoom.room === undefined);
  const freeEdit = await client.op({ op: "commit", code: anonRoom.code, base: 1, state: { ...anonRoom.state, name: "谁都能改" }, by: "甲" });
  check("没有房主就没有权限门：改名照常落地", freeEdit.ok === true && freeEdit.state?.name === "谁都能改" && freeEdit.denied === undefined, freeEdit.error ?? String(freeEdit.state?.name));

  const mem = await connect(`ws://127.0.0.1:${port}/ws`);
  const memWho = { clientId: "mem-1", fp: "MEMBERFP1" };
  const memJoin = await mem.op({ op: "join", code: own, ...memWho });
  check("成员加入拿到同一份房间元信息与桌面", memJoin.ok === true && memJoin.room?.owner === "host-1" && memJoin.state?.o?.length === 3, memJoin.error);
  const memBeat = await mem.op({ op: "presence", code: own, ...memWho, name: "乙", color: "#3f7d5a" });
  check("心跳把指纹短号带进在座名单", memBeat.presence?.["mem-1"]?.fp === "MEMBERFP1", JSON.stringify(memBeat.presence?.["mem-1"] ?? null));
  await host.op({ op: "presence", code: own, clientId: "host-1", fp: "HOSTFP1234", name: "房主甲", color: "#c8443c" });
  const here = (await client.op({ op: "online" })).users.filter((u) => u.room === own);
  check("总站名册按房间列出在座的两人", here.length === 2 && here.every((u) => u.fp && u.name), JSON.stringify(here.map((u) => `${u.id}/${u.fp}`)));

  const shut = await host.op({ op: "roomPerm", code: own, token: owned.token, perms: { move: false } });
  check("房主逐条改权限表：没写过的键仍走默认档", shut.ok === true && Object.keys(shut.room?.perms ?? {}).join() === "move" && shut.room?.perms?.move === false, JSON.stringify(shut.room?.perms ?? null));
  const metaPush = await until(() => mem.take((m) => m.t === "roomMeta" && m.room?.perms?.move === false), 2000);
  check("权限一改，成员当场收到新表", !!metaPush && metaPush.room.ownerName === "房主甲");
  const memMove = () => mem.op({ op: "commit", code: own, base: v, state: { ...owned.state, o: [{ ...owned.state.o[0], x: 0.7 }, owned.state.o[1], owned.state.o[2]] }, by: "乙", ...memWho });
  const blocked = await memMove();
  v = blocked.version;
  check("成员越权的改动被逐件退回上一版，其余照常落地", blocked.ok === true && blocked.state.o[0].x === owned.state.o[0].x && blocked.denied?.includes("move") === true, JSON.stringify(blocked.denied ?? null));
  check("退回时说的是一句人话，不是内部键名", typeof blocked.hint === "string" && blocked.hint.includes("移动摆放"), blocked.hint);
  check("被拦下也照样推进版本，两人不会各写一份桌面", Number.isInteger(v) && v > 1, `v${v}`);
  const rolled = await mem.op({ op: "commit", code: own, base: v, state: { ...blocked.state, o: [{ ...blocked.state.o[0], value: 5 }, blocked.state.o[1], blocked.state.o[2]] }, by: "乙", ...memWho });
  v = rolled.version;
  check("默认档允许的掷骰不受影响", rolled.ok === true && rolled.state.o[0].value === 5 && rolled.denied === undefined, JSON.stringify(rolled.denied ?? null));
  const renamed = await mem.op({ op: "commit", code: own, base: v, state: { ...rolled.state, name: "我把牌桌改了名" }, by: "乙", ...memWho });
  v = renamed.version;
  check("牌桌改名归房主管", renamed.state.name === "权限房" && renamed.denied?.includes("rename") === true);
  const reskinned = await mem.op({ op: "commit", code: own, base: v, state: { ...renamed.state, o: [renamed.state.o[0], renamed.state.o[1], { ...renamed.state.o[2], board: { img: renamed.state.o[2].board.img, w: 2.4, d: renamed.state.o[2].board.d } }] }, by: "乙", ...memWho });
  v = reskinned.version;
  check("换棋盘是管理动作，成员换不了", reskinned.state.o[2].board.w === 2 && reskinned.denied?.includes("board") === true, JSON.stringify(reskinned.denied ?? null));
  const wiped = await mem.op({ op: "commit", code: own, base: v, state: { ...reskinned.state, o: [] }, by: "乙", ...memWho });
  v = wiped.version;
  check("一次收走整张桌子被当作清空挡下", wiped.state.o.length === 3 && wiped.denied?.includes("clear") === true);
  // 棋盘从头到尾留在桌上：收走它的改动算「更换棋盘」，那是另一条权限，别和「拿走一件」混在一个用例里
  const tookOne = await mem.op({ op: "commit", code: own, base: v, state: { ...wiped.state, o: [wiped.state.o[0], wiped.state.o[2]] }, by: "乙", ...memWho });
  v = tookOne.version;
  check("默认档允许拿走单件：这不算清空", tookOne.state.o.length === 2 && tookOne.denied === undefined, JSON.stringify(tookOne.denied ?? null));
  await host.op({ op: "roomPerm", code: own, token: owned.token, perms: { move: false, add: false } });
  const added = await mem.op({ op: "commit", code: own, base: v, state: { ...tookOne.state, o: [tookOne.state.o[0], die("p3"), tookOne.state.o[1]] }, by: "乙", ...memWho });
  v = added.version;
  check("关掉新增权限后成员摆不出东西", added.state.o.length === 2 && added.denied?.includes("add") === true, JSON.stringify(added.denied ?? null));
  const freed = await host.op({ op: "roomPerm", code: own, token: owned.token, perms: { move: true } });
  check("权限表整表覆盖：放开一条不会顺手留下另一条", Object.keys(freed.room?.perms ?? {}).join() === "move");
  const played = await mem.op({ op: "commit", code: own, base: v, state: { ...added.state, o: [{ ...added.state.o[0], x: 0.55 }, die("p3"), added.state.o[1]] }, by: "乙", ...memWho });
  v = played.version;
  check("放开之后同一个动作立刻能落地", played.state.o[0].x === 0.55 && played.state.o.length === 3 && played.denied === undefined, JSON.stringify(played.denied ?? null));

  // ——— 载入桌面预设 = 整桌替换：新板面进不来，桌上原有的板面也不许被顺手收走 ———
  const oldBoard = played.state.o.find((o) => o.kind === "board");
  const presetO = [
    { id: "preset-board", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "grid", cols: 19, rows: 19, cell: 0.04 } },
    die("q1"), die("q2"),
  ];
  const preset = await mem.op({ op: "commit", code: own, base: v, state: { ...played.state, name: "预设桌名", o: presetO }, by: "乙", ...memWho });
  v = preset.version;
  check("预设带进来的新板面按「更换棋盘」挡下", preset.denied?.includes("board") === true && !preset.state.o.some((o) => o.id === "preset-board"), JSON.stringify(preset.denied ?? null));
  check("桌上原来那张板面没被整桌替换收走", !!oldBoard && preset.state.o.some((o) => o.id === oldBoard.id), JSON.stringify(preset.state.o.map((o) => o.id)));
  check("预设的其余物件照常摆上桌", preset.state.o.filter((o) => o.id === "q1" || o.id === "q2").length === 2, JSON.stringify(preset.state.o.map((o) => o.id)));
  check("预设带来的桌名同样归房主管", preset.state.name === played.state.name, preset.state.name);

  const pubbed = await host.op({ op: "roomPerm", code: own, token: owned.token, pub: true });
  check("公开私密走房主口令", pubbed.ok === true && pubbed.listed === true && pubbed.room?.pub === true);
  check("公开后大厅列它并标出房主", (await client.op({ op: "roomList" })).rooms.some((r) => r.code === own && r.host === "房主甲"));
  check("没口令的挂牌被当成不是房主", (await mem.op({ op: "roomFeature", code: own, listed: false })).error === "not_owner");
  check("口令不对的权限改动一个字也不改", (await mem.op({ op: "roomPerm", code: own, token: "0".repeat(24), perms: { move: false } })).error === "not_owner");
  const stillFree = await mem.op({ op: "commit", code: own, base: v, state: { ...played.state, o: [{ ...played.state.o[0], x: 0.2 }, ...played.state.o.slice(1)] }, by: "乙", ...memWho });
  v = stillFree.version;
  check("被拒的越权请求不影响之后的正常操作", stillFree.state.o[0].x === 0.2 && stillFree.denied === undefined);
  check("改回私密也能一次做到", (await host.op({ op: "roomPerm", code: own, token: owned.token, pub: false })).listed === false);
  check("私密房间不再出现在大厅里", !(await client.op({ op: "roomList" })).rooms.some((r) => r.code === own));

  // ——— 游戏模式：一间房一个开关，跟权限表一样只认房主口令 ———
  const gmOn = await host.op({ op: "roomPerm", code: own, token: owned.token, gm: true });
  check("房主一键把全桌切进游戏模式", gmOn.ok === true && gmOn.room?.gm === true && gmOn.room?.pub === false, JSON.stringify(gmOn.room ?? null));
  const gmPush = await until(() => mem.take((m) => m.t === "roomMeta" && m.room?.gm === true), 2000);
  check("成员当场收到「全桌进入游戏模式」这一推", !!gmPush && gmPush.room?.owner === "host-1", JSON.stringify(gmPush ?? null));
  const late = await connect(`ws://127.0.0.1:${port}/ws`);
  const lateJoin = await late.op({ op: "join", code: own, clientId: "late-1", fp: "LATEFP00001" });
  check("后入座的一进来就带着这一档，不用房主再按一次", lateJoin.ok === true && lateJoin.room?.gm === true, JSON.stringify(lateJoin.room ?? null));
  late.close();
  check("没口令的人开不动全桌游戏模式", (await mem.op({ op: "roomPerm", code: own, token: "0".repeat(24), gm: false })).error === "not_owner");
  const gmState = (await mem.op({ op: "sync", code: own, base: v })).room;
  check("sync 也带着这一档：刷新页面的人一样看得见", gmState?.gm === true, JSON.stringify(gmState ?? null));
  const gmPub = await host.op({ op: "roomPerm", code: own, token: owned.token, pub: true });
  check("只改公开私密不会把游戏模式抹掉", gmPub.room?.pub === true && gmPub.room?.gm === true, JSON.stringify(gmPub.room ?? null));
  const gmGone = await host.op({ op: "roomPerm", code: own, token: owned.token, gm: false });
  check("房主再按一次就退回编辑", gmGone.ok === true && gmGone.room?.gm === false && gmGone.room?.pub === true, JSON.stringify(gmGone.room ?? null));
  check("退回时成员同样当场收到", !!(await until(() => mem.take((m) => m.t === "roomMeta" && m.room?.gm === false), 2000)));
  // 留一间开着游戏模式的房到进程重启那一步：这一档得跟公开私密一样落盘
  await host.op({ op: "roomPerm", code: own, token: owned.token, pub: false, gm: true });

  await host.op({ op: "presence", code: own, clientId: "host-2", fp: "HOSTFP1234", name: "房主甲", color: "#c8443c" });
  check("踢不掉同指纹的自己：房主不会把自己锁在门外", (await host.op({ op: "roomKick", code: own, token: owned.token, clientId: "host-2" })).error === "invalid_input");
  const kicked = await host.op({ op: "roomKick", code: own, token: owned.token, clientId: "mem-1" });
  check("房主踢人：名单当场少一位", kicked.ok === true && kicked.presence?.["mem-1"] === undefined, JSON.stringify(Object.keys(kicked.presence ?? {})));
  check("被踢的人也看到名单变了", !!(await until(() => mem.take((m) => m.t === "presence" && !m.presence?.["mem-1"]), 2000)));
  check("被踢后提交直接回 kicked", (await mem.op({ op: "commit", code: own, base: v, state: played.state, by: "乙", ...memWho })).error === "kicked");
  check("被踢后心跳进不来", (await mem.op({ op: "presence", code: own, ...memWho, name: "乙", color: "#3f7d5a" })).error === "kicked");
  check("被踢后重新加入也被拒", (await mem.op({ op: "join", code: own, ...memWho })).error === "kicked");
  const mem2 = await connect(`ws://127.0.0.1:${port}/ws`);
  check("换个标签页换个会话 id 也进不来：按指纹认人", (await mem2.op({ op: "join", code: own, clientId: "mem-77", fp: "MEMBERFP1" })).error === "kicked");
  mem2.close();
  const gone = await host.op({ op: "roomLeave", code: own, clientId: "host-1", fp: "HOSTFP1234" });
  check("退回本地桌面时名单立刻清空，不用等超时", gone.ok === true && Object.keys(gone.presence ?? {}).length === 0);
  check("总站名册里同时销掉他的名", (await client.op({ op: "online" })).users.some((u) => u.id === "host-1") === false);
  host.close();
  mem.close();

  const temp = await client.op({ op: "romSave", state: romSource, title: "待删", by: "甲" });
  check("带口令能删掉存档", (await client.op({ op: "romRemove", romId: temp.romId, token: temp.token })).ok === true);
  const afterDelete = await client.op({ op: "romList" });
  check("删掉的存档从列表与读取里一起消失", !afterDelete.roms.some((r) => r.id === temp.romId) && (await client.op({ op: "romGet", romId: temp.romId })).error === "rom_not_found");
  const stats = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
  check("healthz 报出存档数量", stats.roms >= 1 && stats.rooms >= 1, `rooms=${stats.rooms} roms=${stats.roms}`);
  ro.close();

  // ——— HTTP 面孔：WebSocket 被代理挡住时的回落链路，和实时共用同一份 store ———
  const post = async (body) => {
    const r = await fetch(`http://127.0.0.1:${port}/functions/v1/app`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, ...(await r.json()) };
  };
  const httpCreated = await post({ action: "create", state: stateOf([{ ...die("h1"), x: 0.2 }], "HTTP") });
  check("HTTP 建桌同样可用", httpCreated.ok === true && /^[A-Z0-9]{6}$/.test(httpCreated.code || "") && httpCreated.version === 1, httpCreated.code);
  await b.op({ op: "join", code: httpCreated.code });
  const httpJoined = await post({ action: "join", code: httpCreated.code });
  check("HTTP 加入房间", httpJoined.state.name === "HTTP");
  const httpSame = await post({ action: "sync", code: httpCreated.code, base: 1 });
  check("HTTP sync 版本一致时不带桌面", httpSame.changed === false && httpSame.state === null);
  const viaHttp = await post({ action: "commit", code: httpCreated.code, base: 1, state: { ...httpCreated.state, o: [{ ...die("h1"), x: 0.77 }] }, by: "轮询者" });
  check("HTTP 提交推进版本", viaHttp.ok === true && viaHttp.version === 2, `v${viaHttp.version}`);
  const crossPush = await until(() => b.take((m) => m.t === "room" && m.code === httpCreated.code), 2000);
  check("HTTP 提交也会立刻推给实时客户端", !!crossPush && crossPush.state.o[0].x === 0.77);
  const staleHttp = await post({ action: "commit", code: httpCreated.code, base: 1, state: httpCreated.state, by: "轮询者" });
  check("HTTP 旧版本写入回 conflict 和权威桌面", staleHttp.ok === false && staleHttp.conflict === true && staleHttp.version === 2 && staleHttp.state.o[0].x === 0.77);
  const fatHttp = await post({ action: "commit", code: httpCreated.code, base: 2, state: stateOf(Array.from({ length: 500 }, (_, i) => die(`h${i}`))), by: "轮询者" });
  check("HTTP 超上限回 413", fatHttp.status === 413 && fatHttp.error === "state_too_large", `${fatHttp.status}/${fatHttp.error}`);
  check("HTTP 未知 action 被拒绝", (await post({ action: "drop-table" })).status === 400);
  const httpGhost = await post({ action: "join", code: "QQQQQQ" });
  check("HTTP 不存在的房间回 404", httpGhost.status === 404 && httpGhost.error === "room_not_found");
  const httpPresence = await post({ action: "presence", code: httpCreated.code, clientId: "h-1", name: "轮询者", color: "#123456", rtt: 42 });
  check("HTTP presence 收下自测延迟", httpPresence.presence["h-1"].rtt === 42);
  const sawHttpPresence = await until(() => b.take((m) => m.t === "presence" && m.presence["h-1"]), 2000);
  check("HTTP 心跳也会广播给实时客户端", !!sawHttpPresence && sawHttpPresence.presence["h-1"].rtt === 42);
  const httpImage = await post({ action: "putImage", key: "httpimg1", data: img });
  check("HTTP 上传像素", httpImage.ok === true);
  check("HTTP 取回的像素一致", (await post({ action: "getImage", keys: ["httpimg1"] })).images.httpimg1 === img);
  const huge = await fetch(`http://127.0.0.1:${port}/functions/v1/app`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "getImage", keys: ["x"], pad: "y".repeat(300000) }),
  });
  check("超过体积上限的请求体不会拖垮服务", huge.status === 400 && (await post({ action: "join", code: httpCreated.code })).ok === true, String(huge.status));

  // ——— 存档与大厅的 HTTP 面孔：与实时共用同一份 store ———
  const httpRom = await post({ action: "romSave", state: stateOf([{ ...die("h9"), x: 0.3 }], "HTTP档"), title: "HTTP 定档", by: "轮询者" });
  check("HTTP 定档同样回存档号与口令", httpRom.ok === true && /^[A-Z0-9]{8}$/.test(httpRom.id || "") && typeof httpRom.token === "string", httpRom.error);
  check("HTTP 与实时看到同一份存档列表", (await post({ action: "romList" })).roms.some((r) => r.id === romId) && (await client.op({ op: "romList" })).roms.some((r) => r.id === httpRom.id));
  check("HTTP romGet 读回桌面", (await post({ action: "romGet", id: httpRom.id })).state?.name === "HTTP档");
  const httpOpened = await post({ action: "romOpen", id: httpRom.id });
  check("HTTP romOpen 开出一张带来源的桌子", httpOpened.ok === true && httpOpened.romId === httpRom.id && /^[A-Z0-9]{6}$/.test(httpOpened.code || ""));
  check("HTTP romOpen 不存在的存档回 404", (await post({ action: "romOpen", id: "ZZZZZZZZ" })).status === 404);
  check("HTTP 口令不对回 403", (await post({ action: "romSave", id: httpRom.id, token: "0".repeat(24), state: stateOf() })).status === 403);
  check("HTTP 超上限定档回 413", (await post({ action: "romSave", state: stateOf(Array.from({ length: 500 }, (_, i) => die(`q${i}`))) })).status === 413);
  const httpFeature = await post({ action: "roomFeature", code: httpOpened.code, listed: true });
  check("HTTP 挂牌", httpFeature.ok === true && httpFeature.listed === true);
  const crossLobby = await client.op({ op: "roomList" });
  check("HTTP 挂牌的房间立刻出现在实时大厅里", crossLobby.rooms.some((r) => r.code === httpOpened.code && r.romId === httpRom.id));
  check("挂牌的房间也带着 WS 那份大厅列表", (await post({ action: "roomList" })).rooms.some((r) => r.code === opened.code));
  check("HTTP 没口令删不掉", (await post({ action: "romRemove", id: httpRom.id })).status === 403);
  check("HTTP 带口令能删档", (await post({ action: "romRemove", id: httpRom.id, token: httpRom.token })).ok === true);
  check("HTTP 删掉的存档读不回来", (await post({ action: "romGet", id: httpRom.id })).status === 404);

  // ——— 房主权限的 HTTP 面孔：与实时共用同一份 store，也共用同一道闸门 ———
  const httpOwned = await post({ action: "create", state: stateOf([die("k1")], "HTTP权限房"), clientId: "hh-1", fp: "HTTPFP1234", ownerName: "网主" });
  check("HTTP 带身份建房同样回房主与口令", httpOwned.ok === true && /^[0-9a-f]{24}$/.test(httpOwned.token || "") && httpOwned.room?.owner === "hh-1", httpOwned.error);
  const httpShut = await post({ action: "roomPerm", code: httpOwned.code, token: httpOwned.token, perms: { move: false } });
  check("HTTP 房主带口令能改权限表", httpShut.ok === true && httpShut.room?.perms?.move === false, httpShut.error);
  const httpOver = await post({ action: "commit", code: httpOwned.code, base: 1, state: { ...httpOwned.state, name: "路人改名", o: [{ ...die("k1"), x: 0.8 }] }, by: "过路人", clientId: "hm-1", fp: "HTTPFP9876" });
  check("HTTP 成员越权同样被逐件退回", httpOver.ok === true && httpOver.state.o[0].x === 0.1 && httpOver.state.name === "HTTP权限房", JSON.stringify(httpOver.denied ?? null));
  check("HTTP 退回时也把拦下的事说成人话", (httpOver.denied ?? []).length === 2 && httpOver.hint.includes("移动摆放") && httpOver.hint.includes("牌桌改名"), httpOver.hint);
  check("HTTP 口令不对的权限改动回 403 且一个字不改", (await post({ action: "roomPerm", code: httpOwned.code, token: "f".repeat(24), perms: { move: true } })).status === 403);
  check("被拒的权限改动没有把表改回去", (await post({ action: "sync", code: httpOwned.code, base: 2 })).room?.perms?.move === false);
  check("HTTP 房主带口令能公开房间", (await post({ action: "roomPerm", code: httpOwned.code, token: httpOwned.token, pub: true })).listed === true);
  const httpGm = await post({ action: "roomPerm", code: httpOwned.code, token: httpOwned.token, gm: true });
  check("HTTP 这一路也能开全桌游戏模式，且不动公开私密", httpGm.ok === true && httpGm.room?.gm === true && httpGm.room?.pub === true, JSON.stringify(httpGm.room ?? null));
  check("HTTP 没口令开不动游戏模式", (await post({ action: "roomPerm", code: httpOwned.code, token: "0".repeat(24), gm: false })).status === 403);
  const httpLobby = (await post({ action: "roomList" })).rooms.find((r) => r.code === httpOwned.code);
  check("HTTP 公开的房间在两个面孔的大厅里都看得到", httpLobby?.host === "网主" && (await client.op({ op: "roomList" })).rooms.some((r) => r.code === httpOwned.code), JSON.stringify(httpLobby ?? null));
  // 踢人靠会话 id 与指纹两道认，所以先让他在名册里跳一次，指纹才落到服务端眼里
  await post({ action: "presence", code: httpOwned.code, clientId: "hm-1", name: "过路人", color: "#3f7d5a", fp: "HTTPFP9876" });
  check("HTTP 踢人", (await post({ action: "roomKick", code: httpOwned.code, token: httpOwned.token, clientId: "hm-1" })).ok === true);
  check("HTTP 被踢后提交回 403", (await post({ action: "commit", code: httpOwned.code, base: 2, state: httpOwned.state, by: "过路人", clientId: "hm-1", fp: "HTTPFP9876" })).status === 403);
  check("HTTP 换个会话 id 也进不来：黑名单按指纹认", (await post({ action: "join", code: httpOwned.code, clientId: "hm-2", fp: "HTTPFP9876" })).status === 403);
  await post({ action: "presence", code: httpOwned.code, clientId: "hh-1", name: "网主", color: "#c8443c", fp: "HTTPFP1234" });
  check("HTTP 心跳进总站名册并标出所在房间", (await post({ action: "online" })).users.some((u) => u.id === "hh-1" && u.room === httpOwned.code && u.fp === "HTTPFP1234"));
  await post({ action: "roomLeave", code: httpOwned.code, clientId: "hh-1", fp: "HTTPFP1234" });
  check("HTTP 销名后名册立刻少人", (await post({ action: "online" })).users.some((u) => u.id === "hh-1") === false);

  // ——— 断开只影响自己的订阅 ———
  b.close();
  await wait(120);
  const stillOk = await client.op({ op: "sync", code, base: 2 });
  check("一个客户端断开不影响他人", stillOk.ok === true && stillOk.changed === false);

  // ——— 重启后桌况从快照回来 ———
  const last = await client.op({ op: "commit", code, base: 2, state: { ...moved, name: "重启前", o: [{ ...die("d1"), x: -0.33 }] }, by: "甲" });
  check("写盘前还能继续提交", last.version === 3);
  // 快照是节流的（1.5s），等它落盘再杀进程；Windows 上 kill 不会走优雅退出，正好只测这一条路
  await wait(2200);
  client.close();
  await stop(child);
  child = await start(port, dir);
  const c3 = await connect(`ws://127.0.0.1:${port}/ws`);
  const revived = await c3.op({ op: "join", code });
  check("重启后房间还在", revived.ok === true && revived.version === 3, `v${revived.version}`);
  check("重启后桌面数据没丢", revived.state.name === "重启前" && revived.state.o[0].x === -0.33);
  check("重启后像素还在", (await c3.op({ op: "getImage", keys: ["rtabc123"] })).images.rtabc123 === img);
  const fresh = await c3.op({ op: "create", state: stateOf() });
  check("重启后仍能开新房间", fresh.ok === true && fresh.version === 1);
  const revivedRom = await c3.op({ op: "romGet", romId: romId });
  check("重启后存档还在，口令仍然保密", revivedRom.state?.name === "覆盖后" && revivedRom.token === undefined && revivedRom.hash === undefined);
  check("重启后仍能凭口令覆盖同一份存档", (await c3.op({ op: "romSave", romId: romId, token: romCreated.token, state: romV2, by: "甲" })).ok === true);
  check("重启后没口令依旧删不掉", (await c3.op({ op: "romRemove", romId: romId })).error === "access_denied");
  check("重启后挂牌状态还在", (await c3.op({ op: "roomList" })).rooms.some((r) => r.code === opened.code && r.romId === romId));
  const revivedOwn = await c3.op({ op: "join", code: own });
  check("重启后房主、权限表与公开私密都还在", revivedOwn.room?.owner === "host-1" && revivedOwn.room?.perms?.move === true && revivedOwn.room?.pub === false, JSON.stringify(revivedOwn.room ?? null));
  check("重启后全桌游戏模式还开着：这开关是房间设置，不是临时界面状态", revivedOwn.room?.gm === true, JSON.stringify(revivedOwn.room ?? null));
  check("重启后旧口令仍能管这间房", (await c3.op({ op: "roomPerm", code: own, token: owned.token, pub: true })).ok === true);
  check("重启后黑名单仍然挡住被踢的那位", (await c3.op({ op: "join", code: own, clientId: "mem-1", fp: "MEMBERFP1" })).error === "kicked");
  // ——— 唱片机：走带状态是一件公共装置，提交后经实时这一路推给同桌每一台机器 ———
  // 放在最后一段、另开一间房：上面每一段都按版本号 2→3 排过序，这里再提交一笔会把它们打乱
  const AT = 1_760_000_000_000;
  const tune = { clip: "arec6ord1", name: "月光小夜曲", dur: 214.5, pos: 0, playing: true, at: AT, vol: 0.7, loop: false };
  const deck = (gram) => ({ id: "gr1", kind: "gram", x: 0.2, z: 0.2, rot: 0, layer: 0, color: "#c8443c", gram });
  const g1 = await connect(`ws://127.0.0.1:${port}/ws`);
  const gRoom = await g1.op({ op: "create", state: stateOf([deck(tune)], "唱片桌") });
  const g2 = await connect(`ws://127.0.0.1:${port}/ws`);
  const gJoin = await g2.op({ op: "join", code: gRoom.code });
  check("唱片机的走带状态进得了实时房间", gJoin.ok === true && gJoin.state.o[0].gram.clip === "arec6ord1" && gJoin.state.o[0].gram.at === AT, JSON.stringify(gJoin.state?.o?.[0]?.gram ?? null));
  g2.pushes.length = 0;
  const gCommit = g1.op({ op: "commit", code: gRoom.code, base: 1, state: { ...gRoom.state, o: [deck({ ...tune, playing: false, at: null, pos: 20 })] }, by: "甲" });
  const gPush = await until(() => g2.take((m) => m.t === "room" && m.version === 2), 2000);
  check("按住那一笔立刻推给同桌", !!gPush && gPush.state.o[0].gram.playing === false && gPush.state.o[0].gram.pos === 20 && gPush.state.o[0].gram.at === null, gPush ? `v${gPush.version}` : "超时");
  check("提交方自己也拿到新版本", (await gCommit).version === 2);
  const badAck = await g2.op({ op: "commit", code: gRoom.code, base: 2, state: { ...gRoom.state, o: [deck({ ...tune, at: null })] }, by: "乙" });
  check("在放却没起播时刻，实时这一路照旧挡下并回权威桌面", badAck.ok === false && badAck.rejected === "invalid_state" && badAck.state.o[0].gram.playing === false, badAck.rejected);
  g1.close();
  g2.close();
  c3.close();

  // ——— 过期清理：直接调 store，把时间往前拨，免得测试真等 45 秒 ———
  const storeModule = await import(pathToFileURL(join(root, "server", "store.mjs")).href);
  const dir2 = await mkdtemp(join(tmpdir(), "tabletop-rt-store-"));
  const s2 = storeModule.createTableStore({ dir: dir2 });
  await s2.init();
  const made = await s2.create(stateOf());
  s2.touchPresence(made.code, "c-1", "甲", "#c8443c");
  check("store：心跳立刻出现在名单里", Object.keys(s2.join(made.code).presence).length === 1);
  const swept = s2.sweepPresence(Date.now() + storeModule.PRESENCE_CUTOFF + 1000);
  check("store：过期心跳被清出名单并回一份新桌子", swept.length === 1 && Object.keys(swept[0].presence).length === 0);
  check("store：一小时没动还不算空闲", s2.sweepRooms(storeModule.ROOM_IDLE_MS, Date.now() + 3600000).length === 0 && s2.join(made.code) !== null);
  check("store：一天没动的房间会被清掉", s2.sweepRooms(storeModule.ROOM_IDLE_MS, Date.now() + storeModule.ROOM_IDLE_MS + 1000).join() === made.code && s2.join(made.code) === null);
  const storeRom = await s2.romSave({ state: stateOf([{ ...die("d1"), x: 0.6 }], "持久"), title: "持久", owner: "甲" });
  const storeOpened = await s2.romOpen(storeRom.id);
  check("store：从存档开的桌带着来源", storeOpened?.romId === storeRom.id && storeOpened?.state?.name === "持久");
  s2.sweepRooms(0, Date.now() + 1);
  check("store：空闲清理把房间清光", s2.join(storeOpened.code) === null);
  check("store：存档不会被空闲清理碰掉", (await s2.romGet(storeRom.id))?.objects === 1 && (await s2.romList()).some((r) => r.id === storeRom.id));
  check("store：房间清光后仍能凭存档再摆一桌", (await s2.romOpen(storeRom.id))?.version === 1);
  const reopened = await s2.romOpen(storeRom.id);
  s2.featureRoom(reopened.code, true);
  check("store：大厅只列挂牌的桌", s2.listRooms().length === 1 && s2.listRooms()[0].code === reopened.code);
  check("store：大厅里的在座人数与物件数来自当前桌况", s2.listRooms()[0].peers === 0 && s2.listRooms()[0].objects === 1);
  await s2.flush();
  const s3 = storeModule.createTableStore({ dir: dir2 });
  await s3.init();
  check("store：flush 后存档与索引都能从磁盘回来", (await s3.romGet(storeRom.id))?.title === "持久" && (await s3.romList()).length === 1);
  check("store：磁盘上的存档读不出合法桌面时当作不存在", (await s3.romGet("AAAAAAAA")) === null);
  await rm(dir2, { recursive: true, force: true });
} catch (error) {
  check("实时校验整体跑通", false, String(error?.message ?? error));
} finally {
  await stop(child);
  await rm(dir, { recursive: true, force: true });
}

console.log(out.join("\n"));
console.log(out.some((line) => line.startsWith("FAIL")) ? "\n有用例失败" : "\n全部通过");
process.exit(out.some((line) => line.startsWith("FAIL")) ? 1 : 0);
