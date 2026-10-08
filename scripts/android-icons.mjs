/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * 从一张 1024 的方图生成安卓各密度的启动图标。
 *
 * 源图是「一张圆角方块图标浮在渐变背景上」，还带着一行水印。直接塞进 mipmap 会得到
 * 双重图标（系统再套一层圆角），所以先按内框裁出那块牌桌本体再放大。裁切框按源图
 * 宽度的比例算，换源图尺寸也不用改代码。
 */
const SRC = process.argv[2] ?? "vibe_images/tabletop-app-icon_1790338246788_b2f8b648.png";
const OUT = process.argv[3] ?? "android/app/src/main/res";

/** 各密度对应的边长（px），与 Capacitor 模板原有尺寸一致。 */
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
/** 自适应图标前景画布 = 内框的 2.25 倍（108dp / 48dp），四周留给系统遮罩裁切。 */
const FOREGROUND_SCALE = 2.25;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(root, SRC);
const outDir = join(root, OUT);

const meta = await sharp(srcPath).metadata();
if (!meta.width || !meta.height) throw new Error(`读不到源图尺寸：${SRC}`);
const crop = {
  left: Math.round(meta.width * 0.2265),
  top: Math.round(meta.height * 0.2217),
  width: Math.round(meta.width * 0.547),
  height: Math.round(meta.height * 0.547),
};

const tile = sharp(srcPath).extract(crop);
const stats = await tile.clone().flatten().stats();
const mean = Math.round(stats.channels.reduce((acc, c) => acc + c.mean, 0) / stats.channels.length);
const hex = `#${[mean, mean, mean].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

async function emit(path, buf) {
  const full = join(outDir, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, buf);
}

const circleMask = (size) => Buffer.from(
  `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
);

for (const [density, size] of Object.entries(DENSITIES)) {
  const square = await tile.clone().resize(size, size).png().toBuffer();
  await emit(`mipmap-${density}/ic_launcher.png`, square);
  await emit(`mipmap-${density}/ic_launcher_round.png`, await sharp(square)
    .composite([{ input: circleMask(size), blend: "dest-in" }])
    .png().toBuffer());

  const canvas = Math.round(size * FOREGROUND_SCALE);
  const inner = Math.round(canvas * 0.66);
  await emit(`mipmap-${density}/ic_launcher_foreground.png`, await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: "#0000" },
  }).composite([
    { input: await tile.clone().resize(inner, inner).png().toBuffer(), gravity: "centre" },
  ]).png().toBuffer());
}

await emit(
  "values/ic_launcher_background.xml",
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${hex}</color>\n</resources>`
  )
);

console.log(`图标源图 ${SRC}（裁切框 ${crop.width}px 见方）→ ${OUT} 五档密度 + 自适应前景，底色 ${hex}`);
