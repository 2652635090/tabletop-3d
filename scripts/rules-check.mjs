/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

// 跑数据层用例（dev/tabletop-preview/rules-check.ts）。
// 这个文件没有 npm script 也能跑，但 Node 直接跑不了它——它 import 别的 TS 模块时不写扩展名，
// 只有 tsc 那套参数能吃下，而根 package.json 是 "type": "module"，编出来的 CJS 还要一份 local package.json。
// 用法：
//   npm run check:rules            # 只报失败与总数
//   npm run check:rules -- --all   # 连 PASS 一起打
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, ".tmp-rules-check");
const out = join(tmp, "out");
const entry = join(out, "dev", "tabletop-preview", "rules-check.js");
const source = join(root, "dev", "tabletop-preview", "rules-check.ts");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const showAll = process.argv.includes("--all");

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const compiled = spawnSync(
  process.execPath,
  [tsc, source, "--outDir", out, "--target", "es2022", "--module", "commonjs", "--moduleResolution", "node", "--skipLibCheck"],
  { cwd: root, encoding: "utf8" },
);

if (!existsSync(entry)) {
  console.error("FAIL: tsc 没产出入口 " + entry);
  console.error((compiled.stdout ?? "") + (compiled.stderr ?? ""));
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

// harness 自身有一批既有类型噪音（不影响产物），只在真的一个用例都没跑出来时才值得看
const noise = (String(compiled.stdout ?? "").match(/error TS/g) ?? []).length;
writeFileSync(join(out, "package.json"), '{"type":"commonjs"}\n');

const ran = spawnSync(process.execPath, [entry], { cwd: root, encoding: "utf8" });
const text = String(ran.stdout ?? "") + String(ran.stderr ?? "");
rmSync(tmp, { recursive: true, force: true });

const lines = text.split("\n").filter((l) => l.startsWith("PASS") || l.startsWith("FAIL"));
const failed = lines.filter((l) => l.startsWith("FAIL"));
if (showAll) console.log(text.trimEnd());
else {
  for (const line of failed.slice(0, 60)) console.log(line);
  if (failed.length > 60) console.log(`…还有 ${failed.length - 60} 条，加 --all 看全部`);
}
console.log(`${failed.length ? "FAIL" : "OK"} 用例 ${lines.length} 条：PASS ${lines.length - failed.length} / FAIL ${failed.length}` +
  (noise ? `（编译期另有 ${noise} 条 harness 自身的类型噪音，不影响运行）` : ""));
if (!lines.length) {
  console.error("一条用例都没跑出来，多半是编译或运行挂了：");
  console.error(text.slice(0, 4000));
  process.exit(1);
}
process.exit(failed.length ? 1 : 0);
