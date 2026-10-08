/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

const BASE = process.argv[2] ?? "http://127.0.0.1:8000/functions/v1/app";
const post = async (body) => {
  const res = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};
const die = (id) => ({ id, kind: "die", x: 0.1, z: 0.1, rot: 0, layer: 0, sides: 6, value: 3 });
const out = [];
const check = (label, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

const created = await post({ action: "create", state: { name: "契约", o: [die("d1")], players: [], turn: 0, step: 1, log: [] } });
check("create 返回房间码", created.status === 200 && /^[A-Z0-9]{6}$/.test(created.data.code), created.data.code);
const code = created.data.code;
check("create 版本为 1", created.data.version === 1);

const joined = await post({ action: "join", code });
check("join 拿到同一份桌面", joined.data.state.o.length === 1 && joined.data.version === 1);

const noChange = await post({ action: "sync", code, base: 1 });
check("sync 版本一致时 changed:false", noChange.data.changed === false && noChange.data.version === 1);

const moved = { ...created.data.state, o: [{ ...die("d1"), x: 0.4 }], log: [...created.data.state.log, { id: "l1", at: Date.now(), by: "甲", kind: "move", text: "移动了骰子" }] };
const committed = await post({ action: "commit", code, base: 1, state: moved, by: "甲" });
check("commit 成功版本 +1", committed.data.version === 2 && committed.data.state.o[0].x === 0.4, `v${committed.data.version}`);

const stale = { ...created.data.state, o: [{ ...die("d1"), x: -0.5 }], log: [...created.data.state.log, { id: "l2", at: Date.now(), by: "乙", kind: "move", text: "我也移动了" }] };
const conflict = await post({ action: "commit", code, base: 1, state: stale, by: "乙" });
check("旧版本写入被判冲突", conflict.data.conflict === true && conflict.data.version === 2 && conflict.data.state.o[0].x === 0.4);

const after = await post({ action: "sync", code, base: 1 });
check("落后客户端 sync 得到权威桌面", after.data.changed === true && after.data.state.o[0].x === 0.4 && after.data.version === 2);

const p1 = await post({ action: "presence", code, clientId: "c-1", name: "甲", color: "#c8443c" });
const p2 = await post({ action: "presence", code, clientId: "c-2", name: "乙", color: "#3d7fbf" });
check("presence 汇总在线", Object.keys(p2.data.presence ?? {}).length === 2, JSON.stringify(Object.keys(p2.data.presence ?? {})));
check("presence 过滤非法颜色", !/[^(#a-fA-F0-9)]/.test(p1.data.presence["c-1"].color));

const ghost = await post({ action: "join", code: "ZZZZZZ" });
check("不存在的房间 404", ghost.status === 404 && ghost.data.error === "room_not_found");
const junk = await post({ action: "drop-table" });
check("未知动作 400", junk.status === 400 && junk.data.error === "invalid_input");
const dirty = await post({ action: "create", state: { name: "x", o: [{ id: "a", kind: "die", x: 1e9, z: 0, layer: 0 }], players: [], turn: 0, step: 1, log: [] } });
check("越界物件被拒绝", dirty.status === 400 && dirty.data.error === "invalid_input", `${dirty.status}/${dirty.data.error}`);

const img = "data:image/webp;base64," + "A".repeat(2048);
const imgKey = "iab12cd34";
const put = await post({ action: "putImage", key: imgKey, data: img });
check("putImage 收下合法卡面", put.status === 200 && put.data.key === imgKey, `${put.status}`);
const again = await post({ action: "putImage", key: imgKey, data: img });
check("重复上传同一张图幂等", again.status === 200 && again.data.ok === true);
const got = await post({ action: "getImage", keys: [imgKey, "inothere"] });
check("getImage 只返回存在的像素", got.data.images?.[imgKey] === img && !("inothere" in (got.data.images ?? {})), Object.keys(got.data.images ?? {}).join(","));
check("非法图片 key 被拒绝", (await post({ action: "putImage", key: "BAD KEY", data: img })).status === 400);
check("非图片 dataURL 被拒绝", (await post({ action: "putImage", key: "iabc123", data: "data:text/html;base64,PHNjcmlwdD4=" })).status === 400);
check("70k 字符的图现在收得下（桌垫额度）", (await post({ action: "putImage", key: "iabc125", data: "data:image/png;base64," + "A".repeat(70000) })).status === 200);
check("超出桌垫额度的图被拒绝", (await post({ action: "putImage", key: "iabc124", data: "data:image/png;base64," + "A".repeat(210000) })).status === 400);
const fat = await post({ action: "putImage", key: "iabc126", data: "data:image/png;base64," + "A".repeat(400000) });
check("整个请求体超上限被拒绝", fat.status === 413 && fat.data.error === "state_too_large", `${fat.status}/${fat.data.error}`);

// 手牌 / 体积 / 桌垫：服务端按形状放行，坏值拒绝
const handObj = { id: "h1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", label: "手牌" }, owner: "c-1", hand: true };
const handRoom = await post({ action: "create", state: { name: "手牌", o: [handObj], players: [], turn: 0, step: 1, log: [] } });
check("带归属的手牌可以入库", handRoom.status === 200 && handRoom.data.state.o[0].hand === true && handRoom.data.state.o[0].owner === "c-1");
const badOwner = await post({ action: "create", state: { name: "x", o: [{ ...handObj, owner: "x".repeat(40) }], players: [], turn: 0, step: 1, log: [] } });
check("超长 owner 被拒绝", badOwner.status === 400);
const badHand = await post({ action: "create", state: { name: "x", o: [{ ...handObj, hand: "yes" }], players: [], turn: 0, step: 1, log: [] } });
check("非布尔 hand 被拒绝", badHand.status === 400);
const scaledObj = await post({ action: "create", state: { name: "体积", o: [{ id: "b1", kind: "box", x: 0, z: 0, rot: 0, layer: 0, pile: [], scale: 1.8 }], players: [], turn: 0, step: 1, log: [] } });
check("卡牌盒与体积倍率入库", scaledObj.status === 200 && scaledObj.data.state.o[0].scale === 1.8);
for (const bad of [0, 9, Number.NaN]) {
  const r = await post({ action: "create", state: { name: "x", o: [{ id: "b2", kind: "bag", x: 0, z: 0, rot: 0, layer: 0, pile: [], scale: bad }], players: [], turn: 0, step: 1, log: [] } });
  check(`体积 ${bad} 被拒绝`, r.status === 400);
}
const matRoom = await post({ action: "create", state: { name: "桌垫", o: [{ id: "m1", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "image", img: imgKey } }], players: [], turn: 0, step: 1, log: [] } });
check("桌垫引用图片 key 入库", matRoom.status === 200 && matRoom.data.state.o[0].board.img === imgKey);
const matSmuggle = await post({ action: "create", state: { name: "x", o: [{ id: "m2", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "mat", cols: 3, rows: 3, cell: 0.2, theme: "image", img: img } }], players: [], turn: 0, step: 1, log: [] } });
check("桌垫里塞 dataURL 被拒绝", matSmuggle.status === 400 && matSmuggle.data.error === "invalid_input");

// getImage 的响应额度：多张图一次取回，超预算的走 omitted 而不是当成取不到
const matKey = "imat0001";
const matData = "data:image/webp;base64," + "B".repeat(190000);
check("桌垫大图上传成功", (await post({ action: "putImage", key: matKey, data: matData })).status === 200);
const batch = await post({ action: "getImage", keys: [matKey, imgKey, "imatk02", "imatk03", "imatk04", "imatk05", "imatk06", "imatk07", "imatk08", "imatk09", "imatk10", "imatk11", "imatk12", "imatk13", "imatk14", "imatk15", "imatk16", "imatk17", "imatk18", "imatk19", "imatk20", "imatk21", "imatk22", "imatk23"] });
const batchKeys = Object.keys(batch.data.images ?? {});
check("批量取图在额度内返回", batch.status === 200 && batchKeys.includes(matKey) && batchKeys.length <= 24, `${batchKeys.length} 张 / omitted ${(batch.data.omitted ?? []).length}`);
check("被省下的 key 记在 omitted 里", Array.isArray(batch.data.omitted) && new Set([...batchKeys, ...batch.data.omitted]).size === batchKeys.length + batch.data.omitted.length);
check("不存在的 key 既不在 images 也不在 omitted", !("imatk02" in (batch.data.images ?? {})) || batch.data.omitted.includes("imatk02") === false);

const withImg = await post({ action: "create", state: { name: "卡面", o: [{ id: "c1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: imgKey } }], players: [], turn: 0, step: 1, log: [] } });
check("桌面可以引用卡面 key", withImg.status === 200 && withImg.data.state.o[0].card.img === imgKey);
const smuggled = await post({ action: "create", state: { name: "x", o: [{ id: "c1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: img } }], players: [], turn: 0, step: 1, log: [] } });
check("把 dataURL 塞进桌面状态被拒绝", smuggled.status === 400 && smuggled.data.error === "invalid_input", `${smuggled.status}/${smuggled.data.error}`);
const smuggledPile = await post({ action: "create", state: { name: "x", o: [{ id: "p1", kind: "pile", x: 0, z: 0, rot: 0, layer: 0, pile: [{ back: "plain", img: img }] }], players: [], turn: 0, step: 1, log: [] } });
check("牌堆里也不让塞像素", smuggledPile.status === 400 && smuggledPile.data.error === "invalid_input");

// 计时器 / 路径箭头 / 文字 / 效果文本：服务端按同一套范围放行或拒绝
const epoch = Date.now() + 60_000;
const room = (name, o, log = []) => post({ action: "create", state: { name, o, players: [], turn: 0, step: 1, log } });
const auxRoom = await room("辅助", [
  { id: "t1", kind: "timer", x: 0, z: 0, rot: 0, layer: 0, duration: 120, left: 90, endsAt: epoch },
  { id: "t2", kind: "timer", x: 0.05, z: 0, rot: 0, layer: 0, duration: 30, left: 30, endsAt: null },
  { id: "a1", kind: "arrow", x: 0.1, z: 0, rot: 90, layer: 0, len: 0.5 },
  { id: "x1", kind: "text", x: 0.15, z: 0, rot: 0, layer: 0, label: "你的回合" },
  { id: "p1", kind: "pointer", x: 0.2, z: 0, rot: 0, layer: 0 },
], [{ id: "l1", at: Date.now(), by: "甲", kind: "effect", text: "治疗药水：恢复 2 点生命" }]);
check("计时器/箭头/文字/指针入库", auxRoom.status === 200 && auxRoom.data.state.o.length === 5, `${auxRoom.status}`);
check("运行中的结束时刻原样存回", auxRoom.data.state.o[0].endsAt === epoch, String(auxRoom.data.state.o[0].endsAt));
check("暂停的计时器保留 endsAt:null", auxRoom.data.state.o[1].endsAt === null && auxRoom.data.state.o[1].left === 30);
check("箭头长度入库", auxRoom.data.state.o[2].len === 0.5);
check("效果日志按 kind 入库", auxRoom.data.state.log[0].kind === "effect" && auxRoom.data.state.log[0].text.includes("恢复 2 点生命"));
const badObjs = {
  "超出范围的计时时长": { id: "b1", kind: "timer", x: 0, z: 0, rot: 0, layer: 0, duration: 1e6, left: 0 },
  "非 epoch 的 endsAt": { id: "b2", kind: "timer", x: 0, z: 0, rot: 0, layer: 0, endsAt: 12345 },
  "超长的箭头": { id: "b3", kind: "arrow", x: 0, z: 0, rot: 0, layer: 0, len: 50 },
  "脏卡背 key": { id: "b4", kind: "pile", x: 0, z: 0, rot: 0, layer: 0, pile: [], backImg: "BAD KEY" },
  "卡面对象写错类型": { id: "b5", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", text: 42 } },
};
for (const [label, o] of Object.entries(badObjs)) check(`${label} 被拒绝`, (await room("x", [o])).status === 400);
const cardRoom = await room("卡面", [{ id: "c9", kind: "card", x: 0, z: 0, rot: 0, layer: 0, backImg: imgKey, card: { back: "plain", label: "治疗药水", text: "效".repeat(300), img: imgKey } }]);
check("卡牌名称/效果/自定义卡背入库", cardRoom.status === 200 && cardRoom.data.state.o[0].card.label === "治疗药水" && cardRoom.data.state.o[0].backImg === imgKey);
check("服务端收下 400 字以内的效果文本", cardRoom.data.state.o[0].card.text.length === 300, String(cardRoom.data.state.o[0].card.text.length));
check("超长效果文本被拒绝", (await room("x", [{ id: "c8", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", text: "效".repeat(500) } }])).status === 400);

// 无边框卡面：true 照原样入库，脏类型整份拒收
const blRoom = await room("无边框", [{ id: "c-bl", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: imgKey, borderless: true } }]);
check("无边框卡面入库", blRoom.status === 200 && blRoom.data.state.o[0].card.borderless === true, `${blRoom.status}`);
const blPileRoom = await room("无边框牌堆", [{ id: "p-bl", kind: "pile", x: 0, z: 0, rot: 0, layer: 0, pile: [{ back: "plain", img: imgKey, borderless: true }] }]);
check("牌堆里每张牌的无边框入库", blPileRoom.status === 200 && blPileRoom.data.state.o[0].pile[0].borderless === true, `${blPileRoom.status}`);
for (const [label, bl] of [["非布尔的 borderless", "yes"], ["数字 borderless", 1]])
  check(`${label} 被拒绝`, (await room("x", [{ id: "c-bd", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", borderless: bl } }])).status === 400);
check("显式关掉无边框（false）照收", (await room("无边框", [{ id: "c-off", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: imgKey, borderless: false } }])).status === 200);

// 牌形比例：服务端只挡脏值和不成牌的极端值，夹区间与「只跟图走」归一化由客户端 fixCard 负责
const ratioRoom = await room("牌形", [{ id: "c-r", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: imgKey, ratio: 0.9, borderless: true } }]);
check("卡面比例入库", ratioRoom.status === 200 && ratioRoom.data.state.o[0].card.ratio === 0.9, `${ratioRoom.status}`);
const ratioPileRoom = await room("牌堆牌形", [{ id: "p-r", kind: "pile", x: 0, z: 0, rot: 0, layer: 0, pile: [{ back: "plain", img: imgKey, ratio: 1.6 }] }]);
check("牌堆里每张牌的比例入库", ratioPileRoom.status === 200 && ratioPileRoom.data.state.o[0].pile[0].ratio === 1.6, `${ratioPileRoom.status}`);
for (const [label, r] of [["字符串 ratio", "1.6"], ["NaN/-null ratio", null], ["不成牌的超宽 ratio", 300], ["零比例", 0], ["负比例", -1]])
  check(`${label} 被拒绝`, (await room("x", [{ id: "c-rd", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: imgKey, ratio: r } }])).status === 400);

// 空牌堆（弃牌堆的牌子摆在那儿）：服务端不能把「零张」当成脏值删掉，也不能顺手把整个物件抹了
const emptyPileRoom = await room("空牌堆", [{ id: "p-empty", kind: "pile", x: 0.2, z: 0.1, rot: 0, layer: 0, faceUp: true, pile: [] }]);
check("空牌堆交得上去：物件还在，牌堆字段原样是空的", emptyPileRoom.status === 200 && emptyPileRoom.data.state.o.length === 1 && Array.isArray(emptyPileRoom.data.state.o[0].pile) && emptyPileRoom.data.state.o[0].pile.length === 0, `${emptyPileRoom.status}/${JSON.stringify(emptyPileRoom.data.state?.o?.[0]?.pile)}`);
const emptyBoxRoom = await room("空盒", [{ id: "b-empty", kind: "box", x: 0.3, z: 0.1, rot: 0, layer: 0, pile: [] }]);
check("空卡牌盒同样收得住", emptyBoxRoom.status === 200 && emptyBoxRoom.data.state.o[0].pile.length === 0, `${emptyBoxRoom.status}`);
check("服务端收下贴近可用区间两端的比例", (await room("牌形", [
  { id: "c-rmin", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain", img: imgKey, ratio: 0.06 } },
  { id: "c-rmax", kind: "card", x: 0.2, z: 0, rot: 0, layer: 0, card: { back: "plain", img: imgKey, ratio: 12 } },
])).status === 200);

const zoneObj = (extra) => ({ id: "z1", kind: "zone", x: 0, z: 0, rot: 0, layer: 0, owner: "c-1", ...extra });
const zoneRoom = await room("区域", [zoneObj({ zone: { w: 0.8, d: 0.5 }, priv: true })]);
check("区域垫与隐私标记入库", zoneRoom.status === 200 && zoneRoom.data.state.o[0].zone.w === 0.8 && zoneRoom.data.state.o[0].priv === true, `${zoneRoom.status}`);
check("关掉隐私（false）也收", (await room("区域", [zoneObj({ zone: { w: 0.5, d: 0.5 }, priv: false })])).status === 200);
const handZone = await room("手牌区", [zoneObj({ zone: { w: 0.72, d: 0.3 }, priv: true, label: "阿明的手牌" })]);
check("自动手牌区（归属+隐私+中文名）入库", handZone.status === 200 && handZone.data.state.o[0].owner === "c-1" && handZone.data.state.o[0].label === "阿明的手牌", `${handZone.status}`);
check("没有隐私标记的区域正常入库", (await room("区域", [zoneObj({ zone: { w: 0.5, d: 0.5 } })])).status === 200);
for (const [label, extra] of [
  ["边长超出上限的区域", { zone: { w: 9.9, d: 0.5 } }],
  ["边长小于下限的区域", { zone: { w: 0.5, d: 0.01 } }],
  ["缺一条边的区域", { zone: { w: 0.5 } }],
  ["非布尔的 priv", { zone: { w: 0.5, d: 0.5 }, priv: "yes" }],
]) check(`${label} 被拒绝`, (await room("x", [zoneObj(extra)])).status === 400);

// 座位攻防范围：整数、攻 1..8、守 0..3，服务端照原样存，夹档由客户端 fixZone 负责
const rangeRoom = await room("攻防", [zoneObj({ zone: { w: 0.5, d: 0.5, reach: 3, guard: 1 } })]);
check("进攻范围与防御范围入库", rangeRoom.status === 200 && rangeRoom.data.state.o[0].zone.reach === 3 && rangeRoom.data.state.o[0].zone.guard === 1, `${rangeRoom.status}`);
check("攻防两项都取下限的区域照收", (await room("攻防", [zoneObj({ zone: { w: 0.5, d: 0.5, reach: 1, guard: 0 } })])).status === 200);
check("攻防两项都取上限的区域照收", (await room("攻防", [zoneObj({ zone: { w: 0.5, d: 0.5, reach: 8, guard: 3 } })])).status === 200);
for (const [label, z] of [
  ["进攻范围 0 家", { w: 0.5, d: 0.5, reach: 0 }],
  ["进攻范围 9 家", { w: 0.5, d: 0.5, reach: 9 }],
  ["半家的进攻范围", { w: 0.5, d: 0.5, reach: 2.5 }],
  ["字符串进攻范围", { w: 0.5, d: 0.5, reach: "3" }],
  ["防御范围负一家", { w: 0.5, d: 0.5, guard: -1 }],
  ["防御范围 4 家", { w: 0.5, d: 0.5, guard: 4 }],
]) check(`${label} 被拒绝`, (await room("x", [zoneObj({ zone: z })])).status === 400);

// 垫子：与区域垫同一副骨架，标记只认 true，垫面图与桌垫图一样只认内容哈希 key
const padRoom = await room("区域", [zoneObj({ zone: { w: 0.4, d: 0.3, pad: true, img: "abc123" } })]);
check("垫子标记与垫面图入库", padRoom.status === 200 && padRoom.data.state.o[0]?.zone?.pad === true && padRoom.data.state.o[0]?.zone?.img === "abc123",
  `${padRoom.status}/${JSON.stringify(padRoom.data.state?.o?.[0]?.zone ?? padRoom.data.error)}`);
for (const [label, z] of [
  ["垫子标记不是 true", { w: 0.4, d: 0.3, pad: "yes" }],
  ["垫面图带空格与大写", { w: 0.4, d: 0.3, img: "AB CD" }],
  ["垫面图是长串 dataURL", { w: 0.4, d: 0.3, img: "data:image/png;base64,AAAA" }],
  ["垫面图太短", { w: 0.4, d: 0.3, img: "abc" }],
]) check(`${label} 被拒绝`, (await room("x", [zoneObj({ zone: z })])).status === 400);

// 配件批次：牌屏只存长宽，沙漏只存档位与起算时刻，规则书只存页码与正文
const shieldObj = (extra) => ({ id: "sd1", kind: "shield", x: 0, z: 0, rot: 0, layer: 0, color: "#7c2c3a", owner: "c-1", shield: { w: 0.24, h: 0.15 }, ...extra });
const shieldRoom = await room("牌屏", [shieldObj({ label: "我的手牌屏" })]);
check("牌屏长宽与归属入库", shieldRoom.status === 200 && shieldRoom.data.state.o[0].shield.w === 0.24 && shieldRoom.data.state.o[0].owner === "c-1", `${shieldRoom.status}`);
check("没人认领的牌屏照收（只是一块挡板）", (await room("牌屏", [shieldObj({ owner: undefined })])).status === 200);
for (const [label, sd] of [
  ["超宽牌屏", { w: 9, h: 0.15 }],
  ["缺屏高的牌屏", { w: 0.24 }],
  ["屏高越过上限", { w: 0.24, h: 0.9 }],
  ["shield 不是对象", "0.24"],
]) check(`${label} 被拒绝`, (await room("x", [shieldObj({ shield: sd })])).status === 400);

const hourObj = (extra) => ({ id: "hg1", kind: "hour", x: 0.1, z: 0, rot: 0, layer: 0, color: "#3d5c46", hour: { mins: 3, at: null }, ...extra });
const hourRoom = await room("沙漏", [hourObj({ hour: { mins: 5, at: 1760000000000 } })]);
check("沙漏档位与起算时刻入库", hourRoom.status === 200 && hourRoom.data.state.o[0].hour.mins === 5 && hourRoom.data.state.o[0].hour.at === 1760000000000, `${hourRoom.status}`);
check("静止中的沙漏（at 为 null）照收", (await room("沙漏", [hourObj()])).status === 200);
for (const [label, h] of [
  ["零分钟沙漏", { mins: 0, at: null }],
  ["超过十档的沙漏", { mins: 11, at: null }],
  ["非整数分钟", { mins: 2.5, at: null }],
  ["不像时刻的 at", { mins: 3, at: 12345 }],
  ["hour 不是对象", 3],
]) check(`${label} 被拒绝`, (await room("x", [hourObj({ hour: h })])).status === 400);

const bookObj = (book) => ({ id: "bk1", kind: "book", x: -0.1, z: 0, rot: 0, layer: 0, color: "#d9a026", book });
const bookRoom = await room("规则书", [bookObj({ page: 1, pages: ["先手轮流摸一张", "每轮结束计分"] })]);
check("规则书页码与正文入库", bookRoom.status === 200 && bookRoom.data.state.o[0].book.pages.length === 2 && bookRoom.data.state.o[0].book.page === 1, `${bookRoom.status}`);
for (const [label, bk] of [
  ["空本子（pages 为空）", { page: 0, pages: [] }],
  ["页码越过最后一页", { page: 2, pages: ["一", "二"] }],
  ["负页码", { page: -1, pages: ["一"] }],
  ["单页超过 420 字", { page: 0, pages: ["字".repeat(421)] }],
  ["页里混进非字符串", { page: 0, pages: [42] }],
]) check(`${label} 被拒绝`, (await room("x", [bookObj(bk)])).status === 400);
const fatBook = await room("x", [bookObj({ page: 0, pages: Array.from({ length: 25 }, (_, i) => `第 ${i} 页`) })]);
check("25 页的规则书按体积拒收", fatBook.status === 413 && fatBook.data.error === "state_too_large", `${fatBook.status}/${fatBook.data.error}`);

// 桌上计算器：只存一条表达式，脏字符剔掉、超长截断，坏形状整份拒绝
const calcObj = (calc) => ({ id: "k1", kind: "calc", x: 0, z: 0, rot: 0, layer: 0, calc });
const calcRoom = await room("计算器", [calcObj({ expr: "12×3−4.5÷(1+2)" })]);
check("计算器表达式入库", calcRoom.status === 200 && calcRoom.data.state.o[0].calc.expr === "12×3−4.5÷(1+2)", `${calcRoom.status}`);
const junkRoom = await room("计算器", [calcObj({ expr: "1;DROP TABLE+2 alert(3)" + "9".repeat(60) })]);
const cleaned = junkRoom.data.state.o?.[0]?.calc?.expr;
check("脏字符与超长表达式被收口", junkRoom.status === 200 && cleaned === "1+2(3)".concat("9".repeat(34)) && cleaned.length === 40, JSON.stringify(cleaned));
for (const [label, calc] of [
  ["缺 expr 的 calc", {}],
  ["expr 不是字符串", { expr: 42 }],
  ["calc 不是对象", "1+1"],
]) check(`${label} 被拒绝`, (await room("x", [calcObj(calc)])).status === 400);

// 内置三副牌：art/cat 这两个卡面字段要能原样入库，超出的要拒
const pileOf = (id, n, extra) => ({ id, kind: "pile", x: 0, z: 0, rot: 0, layer: 0, faceUp: true, pile: Array.from({ length: n }, (_, i) => ({ back: "wolf", rank: "A", suit: "s", label: `牌 ${i}`, ...extra })) });
const artRoom = await room("卡面", [pileOf("p1", 108, { art: "殺", cat: "基本牌", color: "#c8443c" })]);
check("108 张一整叠入库", artRoom.status === 200 && artRoom.data.state.o[0].pile.length === 108, `${artRoom.status}`);
check("art 与 cat 原样保留", artRoom.data.state.o?.[0]?.pile?.[0]?.art === "殺" && artRoom.data.state.o?.[0]?.pile?.[0]?.cat === "基本牌", JSON.stringify(artRoom.data.state.o?.[0]?.pile?.[0]));
const fatPile = await room("x", [pileOf("p1", 500, { art: "殺" })]);
check("500 张一整叠入库（牌堆不再卡 120）", fatPile.status === 200 && fatPile.data.state.o[0].pile.length === 500, `${fatPile.status} ${fatPile.data.state.o?.[0]?.pile?.length}`);
const overPile = await room("x", [pileOf("p1", 1001, { art: "殺" })]);
check("超过 1000 张的整叠仍被硬闸拒收", overPile.status === 413 || overPile.data.error === "state_too_large", `${overPile.status} ${overPile.data.error}`);
for (const [label, card] of [
  ["art 太长", { back: "wolf", art: "一".repeat(9) }],
  ["cat 太长", { back: "wolf", cat: "一".repeat(25) }],
  ["art 不是字符串", { back: "wolf", art: 7 }],
]) {
  const r = await room("x", [{ id: "c1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card }]);
  check(`${label} 被拒绝`, r.status === 400, `${r.status}`);
}

// 高度锁定与俯仰角：合法值原样入库，越界或脏类型整份拒收
const pose = (extra) => ({ id: "c1", kind: "card", x: 0, z: 0, rot: 0, layer: 6, card: { back: "plain", label: "斜靠的牌" }, ...extra });
const poseRoom = await room("姿态", [pose({ pin: true, tilt: 35.5 })]);
check("锁定与俯仰角入库", poseRoom.status === 200 && poseRoom.data.state.o[0].pin === true && poseRoom.data.state.o[0].tilt === 35.5, `${poseRoom.status} ${JSON.stringify(poseRoom.data.state.o?.[0])}`);
const looseLean = await room("斜靠没钉住", [pose({ tilt: 35.5 })]);
check("没锁定的俯仰角被服务端抹平", looseLean.status === 200 && looseLean.data.state.o[0].tilt === undefined, JSON.stringify(looseLean.data.state?.o?.[0]));
for (const [label, dirty] of [
  ["俯仰角超出 ±85", pose({ tilt: 200 })],
  ["俯仰角是字符串", pose({ tilt: "35" })],
  ["锁定不是布尔", pose({ pin: "yes" })],
]) {
  const r = await room("x", [dirty]);
  check(`${label} 被拒绝`, r.status === 400, `${r.status} ${r.data.error}`);
}

const statOf = (extra) => ({ id: "s1", kind: "stat", x: 0, z: 0, rot: 0, layer: 0, color: "#3f7d5a", stat: { w: 0.6, d: 0.42 }, ...extra });
const statRoom = await room("统计垫", [statOf({ lock: true })]);
check("统计垫的尺寸与锁定入库", statRoom.status === 200 && statRoom.data.state.o[0].stat.w === 0.6 && statRoom.data.state.o[0].lock === true, JSON.stringify(statRoom.data.state?.o?.[0]));
for (const [label, dirty] of [
  ["垫子尺寸越界", statOf({ stat: { w: 9, d: 0.2 } })],
  ["垫子尺寸是字符串", statOf({ stat: { w: "0.6", d: 0.2 } })],
  ["垫子锁定不是布尔", statOf({ lock: "yes" })],
]) {
  const r = await room("x", [dirty]);
  check(`${label} 被拒绝`, r.status === 400, `${r.status} ${r.data.error}`);
}

// 桌垫的锁：服务端照样收，字段口径跟统计垫一致
const matOf = (extra) => ({ id: "b1", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "image", img: "ik3ccccc" }, ...extra });
const lockMatRoom = await room("桌垫上锁", [matOf({ lock: true })]);
check("锁住的桌垫能入库", lockMatRoom.status === 200 && lockMatRoom.data.state.o[0].lock === true, JSON.stringify(lockMatRoom.data.state?.o?.[0]));
const lockMatDirty = await room("x", [matOf({ lock: "yes" })]);
check("桌垫锁定不是布尔被拒绝", lockMatDirty.status === 400, `${lockMatDirty.status} ${lockMatDirty.data.error}`);

const slotOf = (extra) => ({ id: "sl1", kind: "slot", x: 0, z: 0, rot: 0, layer: 0, color: "#3f7d5a", slot: { n: 4 }, ...extra });
const slotRoom = await room("卡槽带", [slotOf()]);
check("卡槽带的格数入库", slotRoom.status === 200 && slotRoom.data.state.o[0].slot.n === 4, JSON.stringify(slotRoom.data.state?.o?.[0]));
for (const [label, dirty] of [
  ["格数超出上限", slotOf({ slot: { n: 99 } })],
  ["格数是零", slotOf({ slot: { n: 0 } })],
  ["格数不是整数", slotOf({ slot: { n: 2.5 } })],
  ["格数是字符串", slotOf({ slot: { n: "4" } })],
]) {
  const r = await room("x", [dirty]);
  check(`${label} 被拒绝`, r.status === 400, `${r.status} ${r.data.error}`);
}

// 转盘：格数与落点都得落在格内，起转时刻只认毫秒时间戳
const spinOf = (spinner) => ({ id: "sp1", kind: "spinner", x: 0, z: 0, rot: 0, layer: 0, color: "#c8443c", spinner });
const spinRoom = await room("转盘", [spinOf({ n: 12, value: 3, at: 1777000000000 })]);
check("转盘的格数、落点与起转时刻入库", spinRoom.status === 200 && spinRoom.data.state.o[0].spinner.n === 12 && spinRoom.data.state.o[0].spinner.value === 3 && spinRoom.data.state.o[0].spinner.at === 1777000000000, JSON.stringify(spinRoom.data.state?.o?.[0]));
check("只写格数的空转盘入库", (await room("转盘", [spinOf({ n: 2 })])).status === 200);
for (const [label, spinner] of [
  ["扇区数超出 2~24", { n: 30 }],
  ["扇区数不是整数", { n: 8.5 }],
  ["落点掉在格数之外", { n: 8, value: 8 }],
  ["落点是负数", { n: 8, value: -1 }],
  ["起转时刻是字符串", { n: 8, at: "昨天" }],
]) {
  const r = await room("x", [spinOf(spinner)]);
  check(`${label} 被拒绝`, r.status === 400, `${r.status} ${r.data.error}`);
}

// 计分轨：一条公共刻度，每人最多一枚棋子，位置不许掉出轨外
const trackOf = (track) => ({ id: "tk1", kind: "track", x: 0, z: 0, rot: 0, layer: 0, color: "#3f7d5a", label: "得分轨", track });
const trackRoom = await room("计分轨", [trackOf({ n: 30, marks: [{ by: "c-1", at: 0, name: "甲", color: "#c8443c" }, { by: "c-2", at: 29 }] })]);
check("计分轨的刻度与每人位置入库", trackRoom.status === 200 && trackRoom.data.state.o[0].track.n === 30 && trackRoom.data.state.o[0].track.marks[1].at === 29 && trackRoom.data.state.o[0].track.marks[0].name === "甲", JSON.stringify(trackRoom.data.state?.o?.[0]));
check("一条没人上场的计分轨入库", (await room("计分轨", [trackOf({ n: 20, marks: [] })])).status === 200);
for (const [label, track, want] of [
  ["刻度数超出 5~80", { n: 200, marks: [] }, 400],
  ["棋子位置掉出轨外", { n: 10, marks: [{ by: "c-1", at: 10 }] }, 400],
  ["同一个人两枚棋子", { n: 10, marks: [{ by: "c-1", at: 0 }, { by: "c-1", at: 3 }] }, 400],
  ["超过 10 枚棋子", { n: 10, marks: Array.from({ length: 11 }, (_, i) => ({ by: `c-${i}`, at: 0 })) }, 413],
  ["棋子颜色不是 #rrggbb", { n: 10, marks: [{ by: "c-1", at: 0, color: "red" }] }, 400],
  ["没有 marks 这条数组", { n: 10 }, 400],
]) {
  const r = await room("x", [trackOf(track)]);
  check(`${label} 被拒绝`, r.status === want, `${r.status} ${r.data.error}`);
}

// 六边形棋盘：layout 新值要能入库，格子参数照旧
const hexBoard = { id: "b-hex", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "hex", cols: 7, rows: 7, cell: 0.055, theme: "slate" } };
const hexRoom = await room("蜂窝", [hexBoard]);
check("六边形棋盘入库", hexRoom.status === 200 && hexRoom.data.state.o[0].board.layout === "hex" && hexRoom.data.state.o[0].board.cols === 7, JSON.stringify(hexRoom.data.state?.o?.[0]));

// 象棋：整盘 33 个物件（1 棋盘 + 32 棋子）要能一次存下，刻字与 piece 形制原样回来
const xqPiece = (i) => ({ id: `x${i}`, kind: "disc", shape: "piece", color: i % 2 ? "#b8322a" : "#26262b", label: i % 2 ? "俥" : "將", x: -0.232 + i * 0.0145, z: 0.261, rot: 0, layer: 0 });
const xqRoom = await room("象棋", [
  { id: "b-xq", kind: "board", x: 0, z: -0.02, rot: 0, layer: 0, board: { layout: "lines", cols: 9, rows: 10, cell: 0.058, theme: "xiangqi" } },
  ...Array.from({ length: 32 }, (_, i) => xqPiece(i)),
]);
check("一整盘象棋 33 个物件入库", xqRoom.status === 200 && xqRoom.data.state.o.length === 33, `${xqRoom.status} ${xqRoom.data.error ?? ""}`);
check("象棋棋盘的 theme 原样回来", xqRoom.data.state.o?.[0]?.board?.theme === "xiangqi", JSON.stringify(xqRoom.data.state.o?.[0]?.board));
check("棋子形制 piece 与中文刻字入库", xqRoom.data.state.o?.[1]?.shape === "piece" && xqRoom.data.state.o?.[1]?.label === "將", JSON.stringify(xqRoom.data.state.o?.[1]));
const xqSync = await post({ action: "sync", code: xqRoom.data.code, base: 0 });
check("象棋桌读回来还是 33 个物件", xqSync.data.state?.o?.length === 33, String(xqSync.data.state?.o?.length));

// 棋盘来历标记（踩子即吃与摆回开局靠它认棋）：只认棋盘上的一段短字符串，别处一律拒
const presetBoard = { id: "b-pt", kind: "board", x: 0, z: -0.02, rot: 0, layer: 0, preset: "xiangqi", board: { layout: "lines", cols: 9, rows: 10, cell: 0.058, theme: "xiangqi" } };
const presetRoom = await room("来历标记", [presetBoard]);
check("棋盘带着来历标记入库", presetRoom.status === 200 && presetRoom.data.state?.o?.[0]?.preset === "xiangqi", `${presetRoom.status} ${presetRoom.data.error ?? ""}`);
const presetSync = await post({ action: "sync", code: presetRoom.data.code, base: 0 });
check("来历标记读回来还是那一套棋", presetSync.data.state?.o?.[0]?.preset === "xiangqi", JSON.stringify(presetSync.data.state?.o?.[0]?.preset));
for (const [label, o] of [
  ["棋子身上的来历标记", { id: "p-pt", kind: "disc", shape: "piece", preset: "xiangqi", x: 0, z: 0.2, rot: 0, layer: 0 }],
  ["空来历", { ...presetBoard, preset: "" }],
  ["过长来历", { ...presetBoard, preset: "x".repeat(25) }],
  ["非字符串来历", { ...presetBoard, preset: 3 }],
]) {
  const r = await room("x", [o]);
  check(`${label} 被拒绝`, r.status === 400, `${r.status} ${r.data.error ?? ""}`);
}

// 网格锁定：棋盘的 grid 要能存能读；新形制棋子照旧收；grid 溜到桌垫或卡牌身上就整个拒
const gridRoom = await room("网格锁定", [
  { id: "b-g", kind: "board", x: 0, z: 0, rot: 0, layer: 0, grid: true, board: { layout: "grid", cols: 8, rows: 8, cell: 0.082, theme: "checker" } },
  { id: "p-k", kind: "pawn", shape: "chess-king", color: "#f3ece0", x: 0, z: 0.3, rot: 0, layer: 0 },
  { id: "p-s", kind: "disc", shape: "stone", color: "#14151a", x: 0.1, z: 0.3, rot: 0, layer: 0 },
]);
check("棋盘带着 grid 入库", gridRoom.status === 200 && gridRoom.data.state?.o?.[0]?.grid === true, `${gridRoom.status} ${gridRoom.data.error ?? ""}`);
check("国际象棋王与围棋子的形制入库", gridRoom.data.state?.o?.[1]?.shape === "chess-king" && gridRoom.data.state?.o?.[2]?.shape === "stone");
const gridMatSmuggle = await room("x", [{ id: "b-m", kind: "board", x: 0, z: 0, rot: 0, layer: 0, grid: true, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "felt" } }]);
check("桌垫上的 grid 被拒绝", gridMatSmuggle.status === 400, `${gridMatSmuggle.status} ${gridMatSmuggle.data.error ?? ""}`);
const gridCardSmuggle = await room("x", [{ id: "k-g", kind: "card", x: 0, z: 0, rot: 0, layer: 0, grid: true, card: { back: "plain" } }]);
check("卡牌上的 grid 被拒绝", gridCardSmuggle.status === 400, `${gridCardSmuggle.status} ${gridCardSmuggle.data.error ?? ""}`);
const gridSync = await post({ action: "sync", code: gridRoom.data.code, base: 0 });
check("锁着的状态读回来还是锁着", gridSync.data.state?.o?.[0]?.grid === true, JSON.stringify(gridSync.data.state?.o?.[0]?.grid));
const gridOff = await post({ action: "commit", code: gridRoom.data.code, base: gridSync.data.version, by: "甲", state: { ...gridSync.data.state, o: gridSync.data.state.o.map((o) => (o.id === "b-g" ? { ...o, grid: undefined } : o)) } });
check("关掉锁定也存得回去", gridOff.status === 200 && gridOff.data.state?.o?.[0]?.grid === undefined, `${gridOff.status} ${gridOff.data.error ?? ""}`);

// 自动吸附与网格线：跟 grid 同一套口径——只认真格子棋盘，而且只留「关掉」那一下
const snapBoard = { id: "b-s", kind: "board", x: 0, z: 0, rot: 0, layer: 0, board: { layout: "grid", cols: 10, rows: 6, cell: 0.09, theme: "sand" } };
const snapRoom = await room("三档网格开关", [{ ...snapBoard, snap: false, mesh: false }]);
check("棋盘带着 snap 与 mesh 的关闭态入库", snapRoom.status === 200 && snapRoom.data.state?.o?.[0]?.snap === false && snapRoom.data.state?.o?.[0]?.mesh === false, `${snapRoom.status} ${snapRoom.data.error ?? ""}`);
const snapSync = await post({ action: "sync", code: snapRoom.data.code, base: 0 });
check("吸附与网格线的关闭态读回来还是关着", snapSync.data.state?.o?.[0]?.snap === false && snapSync.data.state?.o?.[0]?.mesh === false, JSON.stringify(snapSync.data.state?.o?.[0]));
const snapBack = await post({ action: "commit", code: snapRoom.data.code, base: snapSync.data.version, by: "甲", state: { ...snapSync.data.state, o: [{ ...snapBoard, grid: true }] } });
check("把吸附和网格线都打开（字段删光）存得回去", snapBack.status === 200 && snapBack.data.state?.o?.[0]?.snap === undefined && snapBack.data.state?.o?.[0]?.mesh === undefined && snapBack.data.state?.o?.[0]?.grid === true, `${snapBack.status} ${snapBack.data.error ?? ""}`);
const snapTrue = await room("x", [{ ...snapBoard, snap: true }]);
check("吸附写成 true 被拒绝（默认就是开的，不留冗余）", snapTrue.status === 400, `${snapTrue.status} ${snapTrue.data.error ?? ""}`);
const meshTrue = await room("x", [{ ...snapBoard, mesh: true }]);
check("网格线写成 true 被拒绝", meshTrue.status === 400, `${meshTrue.status} ${meshTrue.data.error ?? ""}`);
const snapMat = await room("x", [{ ...snapBoard, board: { layout: "mat", cols: 12, rows: 7, cell: 0.1, theme: "felt" }, snap: false }]);
check("桌垫上的 snap 被拒绝", snapMat.status === 400, `${snapMat.status} ${snapMat.data.error ?? ""}`);
const meshCard = await room("x", [{ id: "k-m", kind: "card", x: 0, z: 0, rot: 0, layer: 0, mesh: false, card: { back: "plain" } }]);
check("卡牌上的 mesh 被拒绝", meshCard.status === 400, `${meshCard.status} ${meshCard.data.error ?? ""}`);
const meshJunk = await room("x", [{ ...snapBoard, mesh: "off" }]);
check("网格线不是布尔被拒绝", meshJunk.status === 400, `${meshJunk.status} ${meshJunk.data.error ?? ""}`);

// 唱片机：桌面状态里只带音频 key 和一份走带读数，字节本身不进门（跟卡面图片一个道理）
const AT = 1760000000000;
const tune = { clip: "arec6ord1", name: "月光小夜曲", dur: 214.5, pos: 0, playing: true, at: AT, vol: 0.7, loop: false };
const gramObj = (gram) => ({ id: "gr1", kind: "gram", x: 0.2, z: 0.2, rot: 0, layer: 0, color: "#c8443c", gram });
const gramRoom = await room("唱片机", [gramObj(tune)]);
check("唱片机带着走带状态入库", gramRoom.status === 200 && gramRoom.data.state?.o?.[0]?.gram?.clip === "arec6ord1", `${gramRoom.status} ${gramRoom.data.error ?? ""}`);
const gramSync = await post({ action: "sync", code: gramRoom.data.code, base: 0 });
check("走带状态读回来还是同一张片子", gramSync.data.state?.o?.[0]?.gram?.playing === true && gramSync.data.state?.o?.[0]?.gram?.at === AT, JSON.stringify(gramSync.data.state?.o?.[0]?.gram));
const gramPause = await post({ action: "commit", code: gramRoom.data.code, base: gramSync.data.version, by: "甲", state: { ...gramSync.data.state, o: gramSync.data.state.o.map((o) => ({ ...o, gram: { ...o.gram, playing: false, at: null, pos: 20 } })) } });
check("按住那一笔存得回去（位置落下、起播时刻清空）", gramPause.status === 200 && gramPause.data.state?.o?.[0]?.gram?.playing === false && gramPause.data.state?.o?.[0]?.gram?.pos === 20 && gramPause.data.state?.o?.[0]?.gram?.at === null, `${gramPause.status} ${gramPause.data.error ?? ""}`);
const bareDeck = await room("空机", [gramObj({ clip: null, name: "", dur: 0, pos: 0, playing: false, at: null, vol: 0.7, loop: false })]);
check("空机也存得下（抽出唱片就是这一态）", bareDeck.status === 200 && bareDeck.data.state?.o?.[0]?.gram?.clip === null, `${bareDeck.status} ${bareDeck.data.error ?? ""}`);
for (const [label, gram] of [
  ["卡面那种 key 当唱片 key", { ...tune, clip: "iab12cd34" }],
  ["路径穿越式的 key", { ...tune, clip: "../secrets" }],
  ["在放却没记起播时刻", { ...tune, at: null }],
  ["位置越过曲子本身", { ...tune, pos: 999 }],
  ["时长超过一小时", { ...tune, dur: 99999 }],
  ["音量不在 0 到 1", { ...tune, vol: 3 }],
  ["循环写成字符串", { ...tune, loop: "yes" }],
  ["曲名超长", { ...tune, name: "长".repeat(40) }],
]) {
  const r = await room("x", [gramObj(gram)]);
  check(`${label} 被拒绝`, r.status === 400, `${r.status} ${r.data.error ?? ""}`);
}

// 随身听：桌上只带「刻了哪首歌的 key」和共享出去那一份走带；字节在同学之间递，服务器一份都不存
const walkman = { clip: "arec6ord1", name: "月光小夜曲", dur: 214.5, pos: 30, playing: true, at: AT, vol: 0.6, loop: false, by: "own-1", shared: true };
const mp3Obj = (mp3) => ({ id: "mp1", kind: "mp3", x: 0.2, z: 0.2, rot: 0, layer: 0, color: "#3f7d5a", mp3 });
const mp3Room = await room("随身听", [mp3Obj(walkman)]);
check("随身听带着共享那一份走带入库", mp3Room.status === 200 && mp3Room.data.state?.o?.[0]?.mp3?.clip === "arec6ord1", `${mp3Room.status} ${mp3Room.data.error ?? ""}`);
const mp3Sync = await post({ action: "sync", code: mp3Room.data.code, base: 0 });
check("读回来还是同一首歌、同一个主人", mp3Sync.data.state?.o?.[0]?.mp3?.by === "own-1" && mp3Sync.data.state?.o?.[0]?.mp3?.shared === true && mp3Sync.data.state?.o?.[0]?.mp3?.at === AT, JSON.stringify(mp3Sync.data.state?.o?.[0]?.mp3));
const mp3Back = await post({ action: "commit", code: mp3Room.data.code, base: mp3Sync.data.version, by: "甲", state: { ...mp3Sync.data.state, o: mp3Sync.data.state.o.map((o) => ({ ...o, mp3: { ...o.mp3, shared: false, playing: false, at: null, pos: 0 } })) } });
check("收回自己听那一笔存得回去（走带停下，歌还刻着）", mp3Back.status === 200 && mp3Back.data.state?.o?.[0]?.mp3?.shared === false && mp3Back.data.state?.o?.[0]?.mp3?.clip === "arec6ord1" && mp3Back.data.state?.o?.[0]?.mp3?.at === null, `${mp3Back.status} ${mp3Back.data.error ?? ""}`);
const barePlayer = await room("空机", [mp3Obj({ clip: null, name: "", dur: 0, pos: 0, playing: false, at: null, vol: 0.6, loop: false, by: "own-1", shared: false })]);
check("空机也存得下（抽出这首歌就是这一态）", barePlayer.status === 200 && barePlayer.data.state?.o?.[0]?.mp3?.clip === null, `${barePlayer.status} ${barePlayer.data.error ?? ""}`);
for (const [label, mp3] of [
  ["卡面那种 key 当歌曲 key", { ...walkman, clip: "iab12cd34" }],
  ["路径穿越式的 key", { ...walkman, clip: "../secrets" }],
  ["在放却没记起播时刻", { ...walkman, at: null }],
  ["没共享却在放（本机走带根本不上桌）", { ...walkman, shared: false, playing: true, pos: 0 }],
  ["没共享却上了循环", { ...walkman, shared: false, playing: false, loop: true, at: null }],
  ["位置越过曲子本身", { ...walkman, pos: 999 }],
  ["时长超过一小时", { ...walkman, dur: 99999 }],
  ["音量不在 0 到 1", { ...walkman, vol: 3 }],
  ["循环写成字符串", { ...walkman, loop: "yes" }],
  ["共享写成字符串", { ...walkman, shared: "yes" }],
  ["曲名超长", { ...walkman, name: "长".repeat(40) }],
  ["主人 id 超长", { ...walkman, by: "x".repeat(40) }],
]) {
  const r = await room("x", [mp3Obj(mp3)]);
  check(`${label} 被拒绝`, r.status === 400, `${r.status} ${r.data.error ?? ""}`);
}
const noSongStore = await post({ action: "getImage", keys: ["arec6ord1"] });
check("歌曲 key 从来不在服务器的像素仓库里（字节没上过桌）", noSongStore.status === 200 && noSongStore.data.images?.["arec6ord1"] === undefined, JSON.stringify(noSongStore.data));

// 迷你计数器：读数可以为负、步进 1~100；宿主与边号要么都在要么都不在，坏形状整份拒收
const ctrObj = (counter) => ({ id: "n1", kind: "counter", x: 0.2, z: 0.2, rot: 0, layer: 0, color: "#3d5c46", ...(counter === undefined ? {} : { counter }) });
const ctrRoom = await room("计数器", [ctrObj({ v: -12, step: 5 })]);
check("负读数与步进入库", ctrRoom.status === 200 && ctrRoom.data.state?.o?.[0]?.counter?.v === -12 && ctrRoom.data.state?.o?.[0]?.counter?.step === 5, `${ctrRoom.status} ${ctrRoom.data.error ?? ""}`);
const ctrSync = await post({ action: "sync", code: ctrRoom.data.code, base: 0 });
check("读数读回来还是那个负数", ctrSync.data.state?.o?.[0]?.counter?.v === -12, JSON.stringify(ctrSync.data.state?.o?.[0]?.counter));
const ctrHost = await room("计数器吸附", [
  { id: "c-host", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain" } },
  ctrObj({ v: 3, step: 1, host: "c-host", edge: 2 }),
]);
check("带着宿主与边号入库", ctrHost.status === 200 && ctrHost.data.state?.o?.[1]?.counter?.host === "c-host" && ctrHost.data.state?.o?.[1]?.counter?.edge === 2, `${ctrHost.status} ${ctrHost.data.error ?? ""}`);
check("没带 counter 字段的计数器也收（散片）", (await room("计数器", [ctrObj(undefined)])).status === 200);
for (const [label, counter] of [
  ["读数不是整数", { v: 1.5, step: 1 }],
  ["读数越过上限", { v: 10000, step: 1 }],
  ["读数越过下限", { v: -10000, step: 1 }],
  ["步进是零", { v: 0, step: 0 }],
  ["步进越过上限", { v: 0, step: 101 }],
  ["步进不是整数", { v: 0, step: 2.5 }],
  ["只带宿主没带边号", { v: 0, step: 1, host: "c-host" }],
  ["只带边号没带宿主", { v: 0, step: 1, edge: 1 }],
  ["边号越过 3", { v: 0, step: 1, host: "c-host", edge: 4 }],
  ["边号是负数", { v: 0, step: 1, host: "c-host", edge: -1 }],
  ["边号不是整数", { v: 0, step: 1, host: "c-host", edge: 1.5 }],
  ["宿主是空串", { v: 0, step: 1, host: "", edge: 0 }],
  ["宿主超长", { v: 0, step: 1, host: "x".repeat(33), edge: 0 }],
  ["counter 不是对象", 5],
]) {
  const r = await room("x", [ctrObj(counter)]);
  check(`${label} 被拒绝`, r.status === 400 && r.data.error === "invalid_input", `${r.status} ${r.data.error ?? ""}`);
}
const ctrSmuggle = await room("x", [{ id: "k-c", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain" }, counter: { v: 0, step: 1 } }]);
check("counter 字段溜到卡牌身上被拒绝", ctrSmuggle.status === 400 && ctrSmuggle.data.error === "invalid_input", `${ctrSmuggle.status} ${ctrSmuggle.data.error ?? ""}`);

// 骰盘：只存内径 {w,d}，两边各自 0.1~0.6；坏形状或字段溜到别的 kind 身上整份拒收
const trayObj = (tray) => ({ id: "dy1", kind: "tray", x: 0.2, z: 0.2, rot: 0, layer: 0, color: "#3d5c46", ...(tray === undefined ? {} : { tray }) });
const trayRoom = await room("骰盘", [trayObj({ w: 0.34, d: 0.22 })]);
check("内径入库", trayRoom.status === 200 && trayRoom.data.state?.o?.[0]?.tray?.w === 0.34 && trayRoom.data.state?.o?.[0]?.tray?.d === 0.22, `${trayRoom.status} ${trayRoom.data.error ?? ""}`);
check("贴着上下两端的内径照收", (await room("骰盘", [trayObj({ w: 0.6, d: 0.1 })])).status === 200);
check("没带 tray 字段的骰盘也收（落默认盘）", (await room("骰盘", [trayObj(undefined)])).status === 200);
for (const [label, tray] of [
  ["盘宽越过上限", { w: 0.7, d: 0.2 }],
  ["盘宽越过下限", { w: 0.05, d: 0.2 }],
  ["盘深越过上限", { w: 0.2, d: 0.9 }],
  ["盘深越过下限", { w: 0.2, d: 0 }],
  ["盘宽不是数字", { w: "x", d: 0.2 }],
  ["盘深是 NaN", { w: 0.2, d: NaN }],
  ["tray 不是对象", 5],
]) {
  const r = await room("x", [trayObj(tray)]);
  check(`${label} 被拒绝`, r.status === 400 && r.data.error === "invalid_input", `${r.status} ${r.data.error ?? ""}`);
}
const traySmuggle = await room("x", [{ id: "d-smug", kind: "die", x: 0, z: 0, rot: 0, layer: 0, die: { faces: 6 }, tray: { w: 0.2, d: 0.2 } }]);
check("tray 字段溜到骰子身上被拒绝", traySmuggle.status === 400 && traySmuggle.data.error === "invalid_input", `${traySmuggle.status} ${traySmuggle.data.error ?? ""}`);

// 平板浏览器：桌上只存一条地址与走带参数，页面字节一个都不过服务器。脏协议、空屏留进度、在放没起播时刻整份拒收
const TV_BV = "BV1xx411c7mD";
const TV_URL = `https://www.bilibili.com/video/${TV_BV}`;
const TV_SITE = "https://example.com/board";
const tvObj = (tablet) => ({ id: "tv1", kind: "tablet", x: 0.4, z: 0, rot: 0, layer: 0, color: "#2b2b30", ...(tablet === undefined ? {} : { tablet }) });
const tvRoom = await room("平板浏览器", [tvObj({ url: TV_URL, page: 3, pos: 90.5, playing: true, at: 1.7e12, mute: true, rev: 2 })]);
check("地址与走带参数入库", tvRoom.status === 200 && tvRoom.data.state?.o?.[0]?.tablet?.url === TV_URL
  && tvRoom.data.state?.o?.[0]?.tablet?.page === 3 && tvRoom.data.state?.o?.[0]?.tablet?.pos === 90.5
  && tvRoom.data.state?.o?.[0]?.tablet?.playing === true && tvRoom.data.state?.o?.[0]?.tablet?.mute === true
  && tvRoom.data.state?.o?.[0]?.tablet?.rev === 2,
  `${tvRoom.status} ${tvRoom.data.error ?? ""}`);
const tvBlank = await room("平板浏览器", [tvObj({ url: "", page: 1, pos: 0, playing: false, at: null, mute: false, rev: 0 })]);
check("空屏收得下", tvBlank.status === 200 && tvBlank.data.state?.o?.[0]?.tablet?.url === "", `${tvBlank.status} ${tvBlank.data.error ?? ""}`);
check("没带 tablet 字段的平板也收（落默认空屏）", (await room("平板浏览器", [tvObj(undefined)])).status === 200);
check("普通网页收得下，而且不需要走带", (await room("平板浏览器", [tvObj({ url: TV_SITE, page: 1, pos: 0, playing: false, at: null, mute: false, rev: 0 })])).status === 200);
check("http 与带端口带查询的网址都收", (await room("平板浏览器", [tvObj({ url: "http://a.cn:8080/x?y=1#z", page: 1, pos: 0, playing: false, at: null, mute: false, rev: 0 })])).status === 200);
// 老存档与旧客户端只写着片号：照旧认下来，别一上线把别人的旧 ROM 整份拒掉
check("老写法（只有 bv）照样收得下", (await room("平板浏览器", [tvObj({ bv: TV_BV, page: 1, pos: 0, playing: false, at: null, mute: false })])).status === 200);
check("bv 长度放宽到 10~16 位都收", (await room("平板浏览器", [tvObj({ bv: "BV" + "a".repeat(16), page: 1, pos: 0, playing: false, at: null, mute: false })])).status === 200);
for (const [label, tablet] of [
  ["javascript: 地址", { url: "javascript:alert(1)", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["data: 地址", { url: "data:text/html,<b>hi</b>", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["file: 地址", { url: "file:///etc/passwd", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["没写协议的裸域名", { url: "example.com/board", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["相对路径", { url: "/board", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["地址夹换行（一条劈成两条）", { url: "https://a.cn/x\nhttps://evil.cn", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["地址夹空格", { url: "https://a.cn/x y", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["地址不是字符串", { url: 5, page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["地址长过 500 字", { url: "https://a.cn/" + "x".repeat(500), page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["脏片号（av 号）", { bv: "av12345678", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["片号不是字符串", { bv: 123456, page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["片号太短", { bv: "BV1", page: 1, pos: 0, playing: false, at: null, mute: false }],
  ["集数是 0", { url: TV_URL, page: 0, pos: 0, playing: false, at: null, mute: false }],
  ["集数越过上限", { url: TV_URL, page: 101, pos: 0, playing: false, at: null, mute: false }],
  ["集数不是整数", { url: TV_URL, page: 1.5, pos: 0, playing: false, at: null, mute: false }],
  ["重新载入的计数越界", { url: TV_URL, page: 1, pos: 0, playing: false, at: null, mute: false, rev: 1000 }],
  ["秒数是负的", { url: TV_URL, page: 1, pos: -1, playing: false, at: null, mute: false }],
  ["秒数越过六小时", { url: TV_URL, page: 1, pos: 21601, playing: false, at: null, mute: false }],
  ["秒数是 NaN 派生物", { url: TV_URL, page: 1, pos: "90", playing: false, at: null, mute: false }],
  ["playing 不是布尔", { url: TV_URL, page: 1, pos: 0, playing: 1, at: 1.7e12, mute: false }],
  ["mute 不是布尔", { url: TV_URL, page: 1, pos: 0, playing: false, at: null, mute: null }],
  ["在放却没有起播时刻", { url: TV_URL, page: 1, pos: 0, playing: true, at: null, mute: false }],
  ["起播时刻不像时间戳", { url: TV_URL, page: 1, pos: 0, playing: true, at: 123, mute: false }],
  ["空屏却留着放映状态", { url: "", page: 1, pos: 0, playing: true, at: 1.7e12, mute: false }],
  ["空屏却留着进度", { url: "", page: 1, pos: 42, playing: false, at: null, mute: false }],
  ["tablet 不是对象", 5],
]) {
  const r = await room("x", [tvObj(tablet)]);
  check(`${label} 被拒绝`, r.status === 400 && r.data.error === "invalid_input", `${r.status} ${r.data.error ?? ""}`);
}
const tvSmuggle = await room("x", [{ id: "k-tv", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "plain" }, tablet: { url: TV_URL, page: 1, pos: 0, playing: false, at: null, mute: false } }]);
check("tablet 字段溜到卡牌身上被拒绝", tvSmuggle.status === 400 && tvSmuggle.data.error === "invalid_input", `${tvSmuggle.status} ${tvSmuggle.data.error ?? ""}`);
const tvCommit = await post({ action: "commit", code: tvRoom.data.code, base: tvRoom.data.version, by: "甲",
  state: { ...tvRoom.data.state, o: [tvObj({ url: TV_SITE, page: 1, pos: 0, playing: false, at: null, mute: false, rev: 3 })], step: tvRoom.data.state.step + 1 } });
check("换成一条普通网址能提交上去", tvCommit.data.version === tvRoom.data.version + 1 && tvCommit.data.state?.o?.[0]?.tablet?.url === TV_SITE
  && tvCommit.data.state?.o?.[0]?.tablet?.rev === 3, `${tvCommit.status} ${tvCommit.data.error ?? ""}`);
const tvReject = await post({ action: "commit", code: tvRoom.data.code, base: tvCommit.data.version, by: "乙",
  state: { ...tvCommit.data.state, o: [tvObj({ url: "javascript:alert(1)", page: 1, pos: 0, playing: false, at: null, mute: false })], step: tvCommit.data.state.step + 1 } });
check("提交一条 javascript: 地址被拒", tvReject.status === 400 && tvReject.data.error === "invalid_input", `${tvReject.status} ${tvReject.data.error ?? ""}`);

// 本批新增：两种平躺薄片的形制、潮汐与塔罗的卡背，都要存得回来
const flatRoom = await room("薄片标记", [
  { id: "f-tri", kind: "cube", shape: "tri", color: "#c0392b", x: -0.1, z: 0.3, rot: 0, layer: 0 },
  { id: "f-star", kind: "cube", shape: "star", color: "#d9a026", x: 0.1, z: 0.3, rot: 0, layer: 0 },
]);
check("三角片与五角星的形制入库", flatRoom.status === 200 && flatRoom.data.state?.o?.[0]?.shape === "tri" && flatRoom.data.state?.o?.[1]?.shape === "star", `${flatRoom.status} ${flatRoom.data.error ?? ""}`);
const newBackRoom = await room("新卡背", [
  { id: "p-tide", kind: "pile", x: -0.2, z: 0.1, rot: 0, layer: 0, pile: [{ back: "tide", rank: "7", cat: "珊瑚", art: "珊", color: "#d1523f" }] },
  { id: "c-tarot", kind: "card", x: 0.2, z: 0.1, rot: 0, layer: 0, card: { back: "tarot", rank: "XII", label: "倒吊人", cat: "大阿卡纳" } },
]);
check("潮汐与塔罗的卡背入库", newBackRoom.status === 200 && newBackRoom.data.state?.o?.[0]?.pile?.[0]?.back === "tide" && newBackRoom.data.state?.o?.[1]?.card?.back === "tarot", `${newBackRoom.status} ${newBackRoom.data.error ?? ""}`);
const longBack = await room("x", [{ id: "c-lb", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "背".repeat(21) } }]);
check("超过 20 字的卡背被拒绝", longBack.status === 400 && longBack.data.error === "invalid_input", `${longBack.status} ${longBack.data.error ?? ""}`);
const d10Room = await room("十面骰", [{ id: "d-10", kind: "die", sides: 10, color: "#e0e0e0", x: 0, z: 0.4, rot: 0, layer: 0, value: 7 }]);
check("d10 与它的点数入库", d10Room.status === 200 && d10Room.data.state?.o?.[0]?.sides === 10 && d10Room.data.state?.o?.[0]?.value === 7, `${d10Room.status} ${d10Room.data.error ?? ""}`);

const huge = await post({ action: "create", state: { name: "x", o: Array.from({ length: 500 }, (_, i) => die(`d${i}`)), players: [], turn: 0, step: 1, log: [] } });check("超大桌面被拒绝", huge.data.error === "state_too_large" || huge.data.error === "invalid_input", huge.data.error);
for (const action of ["romSave", "romList", "romGet", "romOpen", "romRemove", "roomList", "roomFeature"]) {
  const r = await post({ action, code: "ABCDEF", id: "ABCD1234" });
  check(`站点函数没有 ${action} 协议，回 400 而不是 500`, r.status === 400, `${r.status} ${r.data.error}`);
}
const wrongMethod = await fetch(BASE, { method: "GET" });
check("GET 被拒绝", wrongMethod.status === 405, String(wrongMethod.status));

// 导入「每张份数」：一张图铺成 N 份同样的牌——服务端只认形状与容量，共用一个图 key 不算脏
const twin = (i) => ({ id: `dup${i}`, kind: "card", x: -0.2 + (i % 20) * 0.02, z: -0.3 + Math.floor(i / 20) * 0.04, rot: 0, layer: 0, card: { back: "plain", img: imgKey, ratio: 0.74, label: "重复牌" } });
const dupLoose = await room("散牌 ×100", Array.from({ length: 100 }, (_, i) => twin(i)));
check("100 份同样卡面的散牌入库", dupLoose.status === 200 && dupLoose.data.state?.o?.length === 100, `${dupLoose.status} ${dupLoose.data.error ?? ""}`);
check("100 份散牌共用一个图 key，没被当成脏字段抹掉", new Set((dupLoose.data.state?.o ?? []).map((o) => o.card?.img)).size === 1 && dupLoose.data.state.o.every((o) => o.card?.img === imgKey), `${(dupLoose.data.state?.o ?? []).length} 张`);
const twinSpec = { back: "plain", img: imgKey, ratio: 0.74, label: "重复牌" };
const dupPile = await room("牌堆 ×100", [{ id: "duppile", kind: "pile", x: 0.3, z: 0.3, rot: 0, layer: 0, pile: Array.from({ length: 1000 }, () => ({ ...twinSpec })) }]);
check("一叠 1000 张同图牌堆入库", dupPile.status === 200 && dupPile.data.state?.o?.[0]?.pile?.length === 1000, `${dupPile.status} ${dupPile.data.error ?? ""}`);
const dupOver = await room("超容量牌堆", [{ id: "overpile", kind: "pile", x: 0.3, z: 0.3, rot: 0, layer: 0, pile: Array.from({ length: 1001 }, () => ({ ...twinSpec })) }]);
check("一叠超过 1000 张被拒绝而不是静默截断", dupOver.status === 413 && dupOver.data.error === "state_too_large", `${dupOver.status} ${dupOver.data.error ?? ""}`);
const dupOverLoose = await room("超容量散牌", Array.from({ length: 421 }, (_, i) => twin(i)));
check("散牌超过 420 个物件被拒绝", dupOverLoose.status === 413 && dupOverLoose.data.error === "state_too_large", `${dupOverLoose.status} ${dupOverLoose.data.error ?? ""}`);

// 本批新增：《潮汐》内置小游戏——数字牌、潮珠与一整库潮牌都存得回来，字段超长照旧整份拒
const tideNum = (n, cat, art, color) => ({ back: "tide", rank: String(n), cat, art, color, text: "顺潮：同色数字相连 3 张以上；1 与 10 不算相连。" });
const SUIT4 = [["珊瑚", "珊", "#d1523f"], ["海藻", "藻", "#2c7d63"], ["贝壳", "贝", "#c98a24"], ["深海", "澜", "#35618f"]];
const tideRoom = await room("潮汐", [
  { id: "t-run", kind: "card", x: -0.1, z: -0.12, rot: 0, layer: 0, faceUp: true, card: tideNum(7, "海藻", "藻", "#2c7d63") },
  { id: "t-pearl", kind: "card", x: 0.1, z: -0.12, rot: 0, layer: 0, faceUp: true, card: { back: "tide", label: "潮珠", cat: "潮珠", art: "珠", color: "#7b6fa8" } },
  { id: "t-stock", kind: "pile", x: 0, z: 0.3, rot: 0, layer: 0, pile: Array.from({ length: 40 }, (_, i) => tideNum((i % 10) + 1, ...SUIT4[i % 4])) },
]);
check("潮汐数字牌与潮珠入库：卡背、花色、叫法都在", tideRoom.status === 200 && tideRoom.data.state?.o?.[0]?.card?.back === "tide" && tideRoom.data.state?.o?.[0]?.card?.cat === "海藻" && tideRoom.data.state?.o?.[1]?.card?.label === "潮珠", `${tideRoom.status} ${tideRoom.data.error ?? ""}`);
check("40 张潮库存得住：整副牌走得通服务端那一道门", (tideRoom.data.state?.o?.[2]?.pile?.length ?? 0) === 40, `${tideRoom.data.state?.o?.[2]?.pile?.length}`);
const tideLong = await room("x", [{ id: "t-1", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "tide", cat: "珊".repeat(25) } }]);
check("潮汐花色名超长被拒绝", tideLong.status === 400 && tideLong.data.error === "invalid_input", `${tideLong.status} ${tideLong.data.error ?? ""}`);
const tideArt = await room("x", [{ id: "t-2", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "tide", art: "藻".repeat(9) } }]);
check("潮汐角标超长被拒绝", tideArt.status === 400, `${tideArt.status} ${tideArt.data.error ?? ""}`);
const tideBack = await room("x", [{ id: "t-3", kind: "card", x: 0, z: 0, rot: 0, layer: 0, card: { back: "tide", text: "顺".repeat(401) } }]);
check("潮汐牌面那句说明超长被拒绝", tideBack.status === 400, `${tideBack.status} ${tideBack.data.error ?? ""}`);

console.log(out.join("\n"));
console.log(out.some((l) => l.startsWith("FAIL")) ? "\n有用例失败" : "\n全部通过");
