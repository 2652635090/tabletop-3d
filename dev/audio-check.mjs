// 唱片字节那条路由的契约：自己起一份真实的自建网关（server/index.mjs），
// 拿真的字节 PUT 上去、GET 回来，把状态码与「GET 一个字节都不写」这两条钉死。
// 只在开发期跑，不参与发布产物。用法：node dev/audio-check.mjs [端口]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIO_KEY, AUDIO_MAX_BYTES } from "../functions/handler.mjs";

const here = pathResolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.argv[2] ?? 29931);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = mkdtempSync(pathJoin(tmpdir(), "tabletop-audio-check-"));
const out = [];
const check = (label, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);

/** 一段够真的 mp3 头：这一条路只管字节进与出，服务器不认格式也不转码，所以什么格式都刻得上去 */
const TUNE = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x12, 0xff, 0xfb, 0x90, 0x00, 0x00, 0x00]);
const KEY = "arec6ord1";

/** 走 URL 编码：没编码的「../secrets」会被 fetch 先把路径归并掉，压根到不了唱片那扇门 */
const face = (key) => `${BASE}/audio/${encodeURIComponent(key)}`;

async function put(key, bytes, type = "audio/mpeg") {
  const res = await fetch(face(key), { method: "PUT", headers: { "content-type": type }, body: bytes });
  const json = /json/.test(res.headers.get("content-type") ?? "") ? await res.json().catch(() => null) : null;
  return { status: res.status, json };
}

async function fetchClip(key, method = "GET") {
  const res = await fetch(face(key), { method });
  const type = res.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    type,
    length: res.headers.get("content-length"),
    cache: res.headers.get("cache-control"),
    allow: res.headers.get("allow"),
    json: /json/.test(type) ? JSON.parse(bytes.toString() || "null") : null,
    bytes,
  };
}

async function healthz() {
  const res = await fetch(`${BASE}/healthz`);
  return await res.json();
}

const child = spawn(process.execPath, [pathJoin(here, "..", "server", "index.mjs")], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DATA_DIR, SITE_DIR: pathJoin(here, "..", "dist") },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
child.stdout.on("data", (d) => { bootLog += d.toString(); });
child.stderr.on("data", (d) => { bootLog += d.toString(); });

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      up = (await healthz()).ok === true;
    } catch {
      up = false;
    }
  }
  check("自建网关起来了，healthz 答话", up, bootLog.trim().slice(0, 160));

  if (up) {
    const before = await healthz();
    check("开局一张唱片都没存", before.audio === 0, `audio=${before.audio}`);

    const saved = await put(KEY, TUNE);
    check("PUT 一段唱片字节收下了", saved.status === 200 && saved.json?.ok === true && saved.json?.size === TUNE.length, JSON.stringify(saved.json));
    const back = await fetchClip(KEY);
    check("取回来的字节与原样一字不差", back.status === 200 && Buffer.compare(back.bytes, Buffer.from(TUNE)) === 0, `${back.bytes.length} 字节`);
    check("原格式照原样还，不转码也不重新封装", back.type === "audio/mpeg", String(back.type));
    check("key 就是内容，所以缓存可以钉死一年", /^public, max-age=31536000/.test(String(back.cache)), String(back.cache));

    const again = await put(KEY, TUNE);
    const head = await fetchClip(KEY, "HEAD");
    check("重复上传同一段字节是幂等的", again.status === 200 && head.status === 200 && Number(head.length) === TUNE.length && head.bytes.length === 0, `${head.status}/${head.length}`);
    const counted = await healthz();
    check("仓库里数得出存了几张片", counted.audio === before.audio + 1, `audio=${counted.audio}`);

    // GET 这一趟只读不写：连着取五遍，仓库里还是那一张
    for (let i = 0; i < 5; i++) await fetchClip(KEY);
    const afterReads = await healthz();
    check("GET 一个字节都不写，也不多存一张", afterReads.audio === counted.audio, `audio=${afterReads.audio}`);

    const ghost = await fetchClip("anothere1");
    check("没存过的片子回 404 并报一个码，不给空文件", ghost.status === 404 && ghost.json?.error === "audio_not_found", `${ghost.status}/${ghost.json?.error}`);

    const other = await put("asong2bass", new Uint8Array([1, 2, 3, 4]), "audio/flac");
    const otherBack = await fetchClip("asong2bass");
    check("另一张片子各存各的，互不覆盖", other.status === 200 && otherBack.type === "audio/flac" && otherBack.bytes.length === 4, `${otherBack.type}/${otherBack.bytes.length}`);

    // 网页不该被当成唱片喂给播放器：非音频的类型进来，出去时退回字节流
    const bogus = await put("abogus0001", new Uint8Array([60, 104, 116, 109, 108, 62]), "text/html");
    const bogusBack = await fetchClip("abogus0001");
    check("非音频的类型不冒充音频，退回字节流", bogus.status === 200 && bogusBack.type === "application/octet-stream", String(bogusBack.type));

    for (const [label, key] of [["卡面那种 key 走不了唱片这门", "iab12cd34"], ["太短的 key", "a"], ["带路径的 key", "../secrets"], ["大写混进来的 key", "AreC6Ord1"], ["空 key", ""]]) {
      const bad = await put(key, TUNE);
      const badGet = await fetchClip(key);
      check(`${label}：PUT 与 GET 都挡在门外`, bad.status === 400 && badGet.status === 400, `${bad.status}/${badGet.status}`);
    }
    const escaped = await fetch(`${BASE}/audio/%zz`);
    check("解码都解不了的 key 也挡在门外", escaped.status === 400, String(escaped.status));
    const empty = await put("aemptyfile", new Uint8Array(0));
    check("空请求体不算一张唱片", empty.status === 400, String(empty.status));

    const verb = await fetchClip(KEY, "DELETE");
    check("除了读与刻，别的动词都拒", verb.status === 405 && /GET/.test(String(verb.allow)) && /PUT/.test(String(verb.allow)), `${verb.status}/${verb.allow}`);

    const full = await healthz();
    const tooBig = await put("atoolarge", new Uint8Array(AUDIO_MAX_BYTES + 1));
    const missing = await fetchClip("atoolarge");
    const untouched = await healthz();
    check("超过上限的曲子拒收并回 413", tooBig.status === 413 && tooBig.json?.error === "audio_too_large", `${tooBig.status}/${tooBig.json?.error}`);
    // 数子要先数：这一笔要是半截落盘，要么多一张，要么留下一份读不出来的残缺
    check("那一笔压根没落进仓库", missing.status === 404 && untouched.audio === full.audio, `audio=${untouched.audio}，前头 ${full.audio}`);

    check("形状对得上才收：服务端与客户端认同一种 key", AUDIO_KEY.test(KEY) && !AUDIO_KEY.test("iab12cd34"), String(AUDIO_KEY));
  }
} catch (error) {
  check("唱片路由用例跑挂了", false, String(error?.message ?? error));
} finally {
  child.kill();
  rmSync(DATA_DIR, { recursive: true, force: true });
}

console.log(out.join("\n"));
console.log(out.some((l) => l.startsWith("FAIL")) ? `\n有用例失败\n${bootLog.trim().slice(0, 500)}` : "\n全部通过");
