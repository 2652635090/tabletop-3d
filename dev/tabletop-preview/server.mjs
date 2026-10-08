// 本地预览用的房间服务：用内存假 Supabase 跑真实的 functions/handler.mjs。
// 仅提供开发期联机模拟，不参与发布产物。
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const target = process.argv[2]
  ? pathToFileURL(process.argv[2]).href
  : new URL("../../functions/handler.mjs", import.meta.url).href;
const handlerModule = await import(target);
const PORT = Number(process.argv[3] ?? 8000);
const handleTable = handlerModule.handleTable;

const tables = {
  rooms: [],
  card_images: [],
};
const PRIMARY = { rooms: "code", card_images: "key" };

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** 只实现 handler.mjs 用到的查询子集：from/select/insert/update/eq/in/maybeSingle */
function fakeSupabase() {
  return {
    from(name) {
      const rows = tables[name];
      if (!rows) throw new Error("unsupported_table");
      const pk = PRIMARY[name];
      const state = { filters: [], in: null, payload: null, op: null };
      const hits = () => rows.filter((row) => state.filters.every(([c, v]) => row[c] === v)
        && (!state.in || state.in.values.includes(row[state.in.column])));
      const api = {
        select() { return api; },
        insert(payload) { state.op = "insert"; state.payload = clone(payload); return api; },
        update(payload) { state.op = "update"; state.payload = clone(payload); return api; },
        eq(column, value) { state.filters.push([column, value]); return api; },
        in(column, values) { state.in = { column, values }; return api; },
        then(onDone) {
          return api.all().then(onDone);
        },
        async all() {
          if (state.op === "insert") {
            // 主键相同才算冲突，与其他过滤条件无关
            if (rows.some((row) => row[pk] === state.payload?.[pk])) {
              return { data: null, error: { code: "23505", message: "duplicate_key" } };
            }
            rows.push({ ...state.payload });
            return { data: clone(state.payload), error: null };
          }
          if (state.op === "update") {
            const found = hits();
            if (!found.length) return { data: null, error: null };
            Object.assign(found[0], state.payload);
            return { data: clone(found[0]), error: null };
          }
          return { data: clone(hits()), error: null };
        },
        async maybeSingle() {
          const r = await api.all();
          const data = Array.isArray(r.data) ? (r.data.length ? r.data[0] : null) : r.data;
          return { data: data ?? null, error: r.error ?? null };
        },
      };
      return api;
    },
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  if (url.pathname === "/functions/v1/app" || url.pathname.startsWith("/functions/v1/app/")) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new Request(`http://${req.headers.host ?? "127.0.0.1"}${url.pathname}${url.search}`, {
      method: req.method ?? "POST",
      headers,
      body: req.method === "POST" ? body : undefined,
    });
    let response;
    try {
      response = await handleTable({ request, supabase: fakeSupabase() });
    } catch (error) {
      response = Response.json({ error: "service_unavailable" }, { status: 503 });
      console.error("[fixture] handler error:", error?.message ?? error);
    }
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  if (url.pathname === "/__rooms") {
    res.writeHead(200, { "content-type": "application/json" });
    const rooms = tables.rooms;
    res.end(JSON.stringify({
      rooms: rooms.map((r) => ({ code: r.code, version: r.version, objects: r.state?.o?.length ?? 0 })),
      images: tables.card_images.map((i) => ({ key: i.key, chars: i.data?.length ?? 0 })),
    }, null, 2));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`本地房间服务（内存假数据库）: http://127.0.0.1:${PORT}/functions/v1/app`);
});
