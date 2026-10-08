// 一次性公网复测：用两个真实 WebSocket 客户端打已部署的网关，量公网 RTT 与推送延迟。
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 仓库里不留现成的线上地址：打谁都由 CHECK_BASE 说清楚，没给就直接退出。
const BASE = process.env.CHECK_BASE || "";
if (!BASE) {
  console.error("用法：CHECK_BASE=http://你的服务器:29920 node dev/public-check.mjs");
  process.exit(1);
}
const WS = BASE.replace(/^http/, "ws") + "/ws";
const die = (id) => ({ id, kind: "die", x: 0.1, z: 0.1, rot: 0, layer: 0, sides: 6, value: 3 });
const stateOf = (objects = [die("d1")], name = "公网") => ({ name, o: objects, players: [], turn: 0, step: 1, log: [] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const out = [];
const check = (label, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

function connect(url) {
  const ws = new WebSocket(url);
  const client = {
    ws, seq: 0, pending: new Map(), pushes: [],
    op(data) {
      const id = ++client.seq;
      const p = new Promise((res) => client.pending.set(id, res));
      ws.send(JSON.stringify({ ...data, id }));
      // 没有回执就报出是哪个 op，别让整个复测静默挂住
      let timer = 0;
      const guard = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(`op 超时: ${data.op}`)), 8000);
      });
      guard.catch(() => {});
      return Promise.race([p, guard]).finally(() => clearTimeout(timer));
    },
    take(matcher) {
      const i = client.pushes.findIndex(matcher);
      return i < 0 ? null : client.pushes.splice(i, 1)[0];
    },
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data));
    const key = msg.id;
    if (client.pending.has(key)) {
      const res = client.pending.get(key);
      client.pending.delete(key);
      res(msg);
      return;
    }
    client.pushes.push(msg);
  };
  return new Promise((res, rej) => {
    ws.onopen = () => res(client);
    ws.onerror = () => rej(new Error("ws_failed"));
  });
}

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const hit = fn();
    if (hit) return hit;
    if (Date.now() > end) return null;
    await wait(3);
  }
}

const post = async (body) => {
  const r = await fetch(`${BASE}/functions/v1/app`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, ...(await r.json()) };
};

const dir = await mkdtemp(join(tmpdir(), "tabletop-public-"));
try {
  const health = await (await fetch(`${BASE}/healthz`)).json();
  check("公网 healthz 正常", health.ok === true, `房间 ${health.rooms}／运行 ${health.uptime}s`);
  const page = await fetch(`${BASE}/`);
  const html = await page.text();
  check("公网首页可直接托管前端", page.ok && /<div id="root">/.test(html) && /assets\//.test(html));

  const a = await connect(WS);
  const b = await connect(WS);
  check("公网 WebSocket 握手成功", a.ws.readyState === 1 && b.ws.readyState === 1);

  const rtts = [];
  for (let i = 0; i < 6; i++) {
    const t = Date.now();
    const pong = await a.op({ op: "ping", at: t });
    if (pong.t === "pong") rtts.push(Date.now() - t);
    await wait(120);
  }
  check("公网 RTT 在合理范围", rtts.length === 6 && Math.min(...rtts) < 400, `最小 ${Math.min(...rtts)}ms／中位 ${median(rtts)}ms／最大 ${Math.max(...rtts)}ms`);

  const created = await a.op({ op: "create", state: stateOf() });
  check("公网建桌", created.ok === true && /^[A-Z0-9]{6}$/.test(created.code || ""), created.code);
  const code = created.code;
  const joined = await b.op({ op: "join", code });
  check("第二人加入同一桌面", joined.state.o.length === 1);

  const lags = [];
  let version = created.version;
  for (let i = 0; i < 5; i++) {
    const next = { ...stateOf([{ ...die("d1"), x: 0.1 + i * 0.1 }], "公网"), };
    const t0 = performance.now();
    const ack = await a.op({ op: "commit", code, base: version, state: next, by: "甲" });
    const pushed = await until(() => b.take((m) => m.t === "room" && m.version === ack.version), 4000);
    if (pushed) lags.push(performance.now() - t0);
    version = ack.version;
    await wait(80);
  }
  check("每次提交都实时推给另一端", lags.length === 5, `${lags.length}/5`);
  check("公网推送延迟中位数在 250ms 以内", lags.length === 5 && median(lags) < 250, `中位 ${Math.round(median(lags))}ms／最好 ${Math.round(Math.min(...lags))}ms／最差 ${Math.round(Math.max(...lags))}ms`);

  const stale = await b.op({ op: "commit", code, base: 1, state: stateOf(), by: "乙" });
  check("旧基线写入在公网也判冲突", stale.ok === false && stale.conflict === true && stale.version === version, `v${stale.version}`);

  const before = version;
  const p1 = await a.op({ op: "presence", code, clientId: "pub-a", name: "甲", color: "#c8443c", rtt: rtts[0] });
  check("公网 presence 收下自己的延迟", p1.presence["pub-a"].rtt === rtts[0], `${p1.presence["pub-a"].rtt}ms`);
  const sawPresence = await until(() => b.take((m) => m.t === "presence" && m.presence["pub-a"]), 4000);
  check("另一端实时看到在线名单", !!sawPresence);
  const after = (await b.op({ op: "sync", code, base: version })).version;
  check("心跳不推进版本号", after === before, `v${after}`);

  const key = `pub${Date.now().toString(36)}`.slice(0, 20);
  const data = "data:image/webp;base64," + "AAAAAAAA".repeat(2048);
  check("公网上传像素", (await a.op({ op: "putImage", key, data })).ok === true);
  const fetched = await b.op({ op: "getImage", keys: [key] });
  check("公网取回像素一致", fetched.images[key] === data, `${(fetched.images[key] || "").length} 字符`);

  const h = await post({ action: "create", state: stateOf([die("h1")], "HTTP公网") });
  check("公网 HTTP 回落面孔建桌", h.ok === true && h.state.name === "HTTP公网", h.code);
  await b.op({ op: "join", code: h.code });
  const hc = await post({ action: "commit", code: h.code, base: 1, state: stateOf([{ ...die("h1"), x: 0.5 }], "HTTP公网"), by: "轮询者" });
  check("公网 HTTP 提交推进版本", hc.ok === true && hc.version === 2);
  const cross = await until(() => b.take((m) => m.t === "room" && m.code === h.code), 4000);
  check("公网 HTTP 提交也推给实时端", !!cross && cross.state.o[0].x === 0.5);
  const hp = await post({ action: "presence", code: h.code, clientId: "h-1", name: "轮询者", color: "#123456", rtt: 88 });
  check("公网 HTTP 心跳带延迟", hp.presence["h-1"].rtt === 88);
  check("公网 HTTP 取回像素", (await post({ action: "getImage", keys: [key] })).images[key] === data);

  // ——— 唱片仓库：公网这台网关才是二进制那条路，站点副本没有，所以必须在这里真跑一遍 ———
  // key 与字节都定死：内容按 key 寻址，反复跑也只占仓库里那一条
  const clipKey = "apubcheck1";
  const clipBytes = new Uint8Array(64).fill(7);
  const putClip = await fetch(`${BASE}/audio/${clipKey}`, { method: "PUT", headers: { "content-type": "audio/mpeg" }, body: clipBytes });
  const clipBack = await fetch(`${BASE}/audio/${clipKey}`);
  const clipView = new Uint8Array(await clipBack.arrayBuffer());
  check("公网刻得进唱片仓库", putClip.ok && (await putClip.json()).size === clipBytes.length, `${putClip.status}`);
  check("公网取回的唱片字节一字不差，类型也不改", clipBack.ok && clipBack.headers.get("content-type") === "audio/mpeg" && clipView.every((v, i) => v === clipBytes[i]), `${clipView.length} 字节`);
  const absent = await fetch(`${BASE}/audio/abubabsent`);
  check("公网没存过的片子回 404 并报码", absent.status === 404 && (await absent.json()).error === "audio_not_found", `${absent.status}`);
  const badClip = await fetch(`${BASE}/audio/iab12cd34`, { method: "PUT", headers: { "content-type": "audio/mpeg" }, body: clipBytes });
  check("公网的唱片门不认卡面那种 key", badClip.status === 400, `${badClip.status}`);
  const AT = 1_760_000_000_000;
  const gramRoom = await post({
    action: "create",
    state: stateOf([{ id: "g1", kind: "gram", x: 0.2, z: 0.2, rot: 0, layer: 0, color: "#c8443c", gram: { clip: clipKey, name: "月光小夜曲", dur: 214.5, pos: 0, playing: true, at: AT, vol: 0.7, loop: false } }], "公网唱片桌"),
  });
  check("公网存得下走带状态，key 指向仓库里那张片", gramRoom.ok === true && gramRoom.state.o[0].gram.clip === clipKey && gramRoom.state.o[0].gram.at === AT, gramRoom.code);

  // ——— 随身听：桌上只走那十个字段的走带状态，字节在同学之间的线路上过一遍就没了 ———
  const walkman = { clip: clipKey, name: "月光小夜曲", dur: 214.5, pos: 30, playing: true, at: AT, vol: 0.6, loop: false, by: "own-1", shared: true };
  const mp3Obj = (mp3) => ({ id: "mp1", kind: "mp3", x: 0.2, z: 0.2, rot: 0, layer: 0, color: "#3f7d5a", mp3 });
  const mp3Room = await post({ action: "create", state: stateOf([mp3Obj(walkman)], "公网随身桌") });
  check("公网存得下随身听的归属与共享", mp3Room.ok === true && mp3Room.state?.o?.[0]?.mp3?.by === "own-1" && mp3Room.state?.o?.[0]?.mp3?.shared === true && mp3Room.state?.o?.[0]?.mp3?.at === AT, `${mp3Room.status ?? ""} ${mp3Room.error ?? ""}`);
  const mp3Back = await post({ action: "getImage", keys: [clipKey] });
  check("公网的像素仓库里没有歌曲字节（随身听没搭服务器的便车）", mp3Back.images?.[clipKey] === undefined, JSON.stringify(Object.keys(mp3Back.images ?? {})));
  for (const [label, mp3] of [
    ["没共享却在放", { ...walkman, shared: false }],
    ["没共享却上了循环", { ...walkman, shared: false, playing: false, loop: true }],
    ["在放却没记起播时刻", { ...walkman, at: null }],
    ["主人名字超长", { ...walkman, by: "长".repeat(30) }],
    ["shared 写成字符串", { ...walkman, shared: "yes" }],
  ]) {
    const r = await post({ action: "create", state: stateOf([mp3Obj(mp3)], "x") });
    check(`公网拒掉随身听：${label}`, r.ok !== true && (r.status === 400 || r.error === "invalid_state"), `${r.status ?? ""} ${r.error ?? ""}`);
  }

  // 互传这条路在公网上真跑一遍：求歌只递给主人，歌曲片段顺着那条线回来，桌面版本号一动不动
  const songKey = "apubcheck1";
  const relayHost = await connect(WS);
  const relayFan = await connect(WS);
  const relayRoom = await relayHost.op({ op: "create", state: stateOf([mp3Obj({ ...walkman, playing: false, at: null, by: "pub-mp3-host" })], "公网互传桌"), clientId: "pub-mp3-host" });
  await relayFan.op({ op: "join", code: relayRoom.code, clientId: "pub-mp3-fan" });
  relayFan.ws.send(JSON.stringify({ op: "mp3Want", code: relayRoom.code, to: "pub-mp3-host", key: songKey }));
  const gotWant = await until(() => relayHost.take((m) => m.t === "mp3Want" && m.key === songKey), 4000);
  check("公网把求歌那句话只递给机器的主人，还带着是谁在要", !!gotWant && gotWant.from === "pub-mp3-fan" && gotWant.code === relayRoom.code, JSON.stringify(gotWant ?? null));
  relayHost.ws.send(JSON.stringify({ op: "mp3Part", code: relayRoom.code, to: "pub-mp3-fan", key: songKey, seq: 0, total: 1, data: Buffer.from(clipBytes).toString("base64") }));
  const gotPart = await until(() => relayFan.take((m) => m.t === "mp3Part" && m.key === songKey), 4000);
  check("公网把歌曲片段送回要歌的那一端，字节一字不差", !!gotPart && gotPart.seq === 0 && gotPart.total === 1 && Uint8Array.from(Buffer.from(gotPart.data, "base64")).every((v, i) => v === clipBytes[i]), `${gotPart?.data?.length ?? 0} 字符`);
  const relayVersion = await relayFan.op({ op: "sync", code: relayRoom.code, base: relayRoom.version });
  check("互传整趟没推进桌面版本号", relayVersion.changed === false && relayVersion.version === relayRoom.version, `v${relayVersion.version}`);
  relayHost.ws.close();
  relayFan.ws.close();

  // 自带牌堆的卡面字段：art/cat 要能在公网这份校验上原样过一遍
  const deckPile = { id: "dp1", kind: "pile", x: 0, z: 0, rot: 0, layer: 0, faceUp: true, pile: Array.from({ length: 108 }, (_, i) => ({ back: "tide", rank: String(1 + (i % 10)), suit: "s", label: `潮${i}`, art: "珊", cat: "珊瑚", color: "#d1523f", text: `顺潮：同色数字相连 3 张以上。第 ${i} 张。` })) };
  const decks = await post({ action: "create", state: stateOf([deckPile], "自带牌") });
  const top = decks.state?.o?.[0]?.pile?.[0];
  check("公网收下 108 张一整叠", decks.ok === true && decks.state.o[0].pile.length === 108, `${decks.state?.o?.[0]?.pile?.length}`);
  check("公网保留 art 与 cat", top?.art === "珊" && top?.cat === "珊瑚" && top?.color === "#d1523f", JSON.stringify(top));
  const bad = await post({ action: "create", state: stateOf([{ ...deckPile, pile: [{ back: "tide", cat: "一".repeat(25) }] }], "超长") });
  check("公网拒掉超长 cat", bad.status === 400 || bad.error === "invalid_state", `${bad.status} ${bad.error}`);

  // 棋盘来历标记（吃子与摆回开局认棋靠它）：公网这份校验收得下棋盘上的，也拦得住夹带到别处的
  const xqTag = { id: "b-pub", kind: "board", x: 0, z: -0.02, rot: 0, layer: 0, preset: "xiangqi", board: { layout: "lines", cols: 9, rows: 10, cell: 0.058, theme: "xiangqi" } };
  const tagged = await post({ action: "create", state: stateOf([xqTag], "来历") });
  check("公网收下棋盘来历标记", tagged.ok === true && tagged.state?.o?.[0]?.preset === "xiangqi", `${tagged.status ?? ""} ${tagged.error ?? ""}`);
  const smuggled = await post({ action: "create", state: stateOf([{ ...die("d-pub"), preset: "xiangqi" }], "夹带") });
  check("公网拒掉骰子身上的来历标记", smuggled.ok !== true, `${smuggled.status ?? ""} ${smuggled.error ?? ""}`);

  // 存档与大厅的公网往返：定档→开桌→删档，全部自带清理，不在服务器上留垃圾
  const pubRom = await a.op({ op: "romSave", state: stateOf([{ ...die("d1"), x: 0.2 }], "公网存档"), title: "公网复测", note: "跑完就删", by: "复测" });
  check("公网定档回存档号与口令", pubRom.ok === true && /^[A-Z0-9]{8}$/.test(pubRom.romId || "") && typeof pubRom.token === "string", pubRom.romId);
  check("公网存档列表读得回来", (await a.op({ op: "romList" })).roms.some((r) => r.id === pubRom.romId));
  const pubOpened = await b.op({ op: "romOpen", romId: pubRom.romId });
  check("公网能从存档摆出新桌", pubOpened.ok === true && pubOpened.romId === pubRom.romId && pubOpened.state?.name === "公网存档", pubOpened.code);
  const pubList = await a.op({ op: "roomList" });
  check("公网大厅回的是数组（没人挂牌就是空的）", Array.isArray(pubList.rooms), `${pubList.rooms.length} 张`);
  const pubFeature = await b.op({ op: "roomFeature", code: pubOpened.code, listed: true });
  check("公网挂牌后大厅能看到它", pubFeature.listed === true && (await a.op({ op: "roomList" })).rooms.some((r) => r.code === pubOpened.code));
  check("公网没口令删不掉", (await b.op({ op: "romRemove", romId: pubRom.romId })).error === "access_denied");
  check("公网凭口令删掉存档", (await b.op({ op: "romRemove", romId: pubRom.romId, token: pubRom.token })).ok === true);
  check("删掉的存档在公网也读不回来", (await b.op({ op: "romGet", romId: pubRom.romId })).error === "rom_not_found");
  await b.op({ op: "roomFeature", code: pubOpened.code, listed: false });

  // ——— 房主权限的公网往返：线上那台服务确实带着 perm.mjs 这一层 ———
  const pubHost = await connect(WS);
  const pubGuest = await connect(WS);
  const pubOwned = await pubHost.op({ op: "create", state: stateOf([die("g1")], "公网权限房"), clientId: "pub-host", fp: "PUBHOSTFP", ownerName: "公网房主" });
  check("公网带身份建房回房主口令与元信息", pubOwned.ok === true && /^[0-9a-f]{24}$/.test(pubOwned.token || "") && pubOwned.room?.ownerFp === "PUBHOSTFP" && pubOwned.room?.pub === false, pubOwned.code);
  check("公网房主改权限表", (await pubHost.op({ op: "roomPerm", code: pubOwned.code, token: pubOwned.token, perms: { move: false } })).room?.perms?.move === false);
  await pubGuest.op({ op: "join", code: pubOwned.code, clientId: "pub-guest", fp: "PUBGUESTFP", name: "路人" });
  const pubOver = await pubGuest.op({ op: "commit", code: pubOwned.code, base: 1, state: stateOf([{ ...die("g1"), x: 0.7 }], "公网权限房"), by: "路人", clientId: "pub-guest", fp: "PUBGUESTFP" });
  check("公网成员越权被逐件退回上一版", pubOver.ok === true && pubOver.state.o[0].x === 0.1 && pubOver.denied?.includes("move") === true, JSON.stringify(pubOver.denied ?? pubOver.error));
  check("公网退回提示是一句人话", String(pubOver.hint || "").includes("移动摆放"), pubOver.hint);
  check("公网没口令改不动权限表", (await pubGuest.op({ op: "roomPerm", code: pubOwned.code, token: "0".repeat(24), perms: { move: true } })).error === "not_owner");
  const pubBeat = await pubGuest.op({ op: "presence", code: pubOwned.code, clientId: "pub-guest", fp: "PUBGUESTFP", name: "路人", color: "#3f7d5a" });
  check("公网心跳把指纹带进在座名单", pubBeat.presence?.["pub-guest"]?.fp === "PUBGUESTFP", JSON.stringify(pubBeat.presence?.["pub-guest"] ?? null));
  await pubHost.op({ op: "presence", code: pubOwned.code, clientId: "pub-host", fp: "PUBHOSTFP", name: "公网房主", color: "#c8443c" });
  check("公网总站名册按房间列出这两把椅子", (await pubGuest.op({ op: "online" })).users.filter((u) => u.room === pubOwned.code).length === 2);
  check("公网房主踢人", (await pubHost.op({ op: "roomKick", code: pubOwned.code, token: pubOwned.token, clientId: "pub-guest" })).ok === true);
  check("公网被踢后提交被挡在门外", (await pubGuest.op({ op: "commit", code: pubOwned.code, base: 2, state: pubOwned.state, by: "路人", clientId: "pub-guest", fp: "PUBGUESTFP" })).error === "kicked");
  pubHost.ws.close();
  pubGuest.ws.close();

  a.ws.close();
  b.ws.close();

  // 重启不丢桌：让运维重启服务，再确认房间还在（这里只验快照落盘可读）
  const snapshot = await fetch(`${BASE}/healthz`).then((r) => r.json());
  check("重启前房间计数不为 0", snapshot.rooms >= 1, `${snapshot.rooms} 个房间`);
} catch (error) {
  check("公网复测整体跑通", false, String(error?.message ?? error));
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(out.join("\n"));
console.log(out.some((l) => l.startsWith("FAIL")) ? "\n有用例失败" : "\n全部通过");
process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);
