/**
 * 浏览器里手写的 ZIP 读取器：只认 store 与 deflate 两种最常见的存法，
 * 唯一用途是把「一整包图片」导成牌堆，所以宁可跳过读不懂的条目也不引第三方依赖。
 */

const EOCD_SIG = 0x06054b50;
const EOCD64_SIG = 0x06064b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** 注释最长 65535，尾部捞这么多足够找到中央目录结束记录 */
const TAIL_BYTES = 65536 + 1024;
const MAX_CENTRAL_BYTES = 8 * 1024 * 1024;
/** 防失控的硬闸：几百张一整叠也远到不了这个数，真正的收口在 MAX_PILE 和整桌体积 */
const MAX_ZIP_ITEMS = 1500;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
/** 解压后的大小也要挡：deflate 能压上千倍，只看压缩尺寸挡不住构造包 */
const MAX_RAW_BYTES = 48 * 1024 * 1024;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

export interface ZipImage {
  /** 去掉目录路径后的条目名，直接拿来当卡面标签 */
  name: string;
  /** 解出来的原始图片字节；条目损坏或被挡住时返回 null，由调用方跳过 */
  blob(): Promise<Blob | null>;
}

/** 按名字排的自然序：卡2 排在 卡10 前面，牌堆顺序才对得上包里的编号 */
export function compareZipNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export async function readZipImages(file: Blob): Promise<ZipImage[]> {
  const tail = await sliceAt(file, Math.max(0, file.size - TAIL_BYTES), TAIL_BYTES);
  if (!tail) throw new Error("这不是一个 zip 压缩包");
  const eocd = findEocd(tail);
  if (eocd < 0) throw new Error("这不是一个 zip 压缩包");
  const view = viewOf(tail);
  let count = view.getUint16(eocd + 10, true);
  let cdSize = view.getUint32(eocd + 12, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  // 16/32 位字段被填满 0xffff 说明这是 zip64，真值在同一条 zip64 结束记录里
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const zip64 = await readZip64(file, tail, eocd);
    if (!zip64) throw new Error("这个 zip64 压缩包读不动");
    count = zip64.count;
    cdSize = zip64.size;
    cdOffset = zip64.offset;
  }
  if (cdOffset >= file.size) throw new Error("压缩包目录越界");

  const central = await sliceAt(file, cdOffset, Math.min(cdSize, MAX_CENTRAL_BYTES));
  if (!central || central.byteLength < 46) throw new Error("中央目录是空的");
  const cd = viewOf(central);
  const decoder = new TextDecoder("utf-8");
  const out: ZipImage[] = [];
  let p = 0;
  while (p + 46 <= cd.byteLength && out.length < Math.min(count, MAX_ZIP_ITEMS)) {
    if (cd.getUint32(p, true) !== CENTRAL_SIG) break;
    const flags = cd.getUint16(p + 8, true);
    const method = cd.getUint16(p + 10, true);
    const compressed = cd.getUint32(p + 20, true);
    const uncompressed = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const local = cd.getUint32(p + 42, true);
    const path = decoder.decode(central.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const name = basename(path);
    // 目录项、加密条目、macOS 资源叉、没认的压缩方式一律跳过而不是报错：
    // 一个坏条目不该让整包导入失败
    if (!name || name.startsWith(".") || path.endsWith("/") || path.includes("__MACOSX")) continue;
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8) || !IMAGE_EXT.test(name)) continue;
    if (compressed > MAX_ENTRY_BYTES || (uncompressed !== 0xffffffff && uncompressed > MAX_RAW_BYTES)) continue;
    out.push({ name, blob: () => readEntry(file, local, method, compressed, name) });
  }
  out.sort((a, b) => compareZipNames(a.name, b.name));
  return out;
}

async function readEntry(file: Blob, local: number, method: number, compressed: number, name: string): Promise<Blob | null> {
  const head = await sliceAt(file, local, 30);
  if (!head || head.byteLength < 30) return null;
  const view = viewOf(head);
  if (view.getUint32(0, true) !== LOCAL_SIG) return null;
  // 本地头的名字与附加字段长度可以和中央目录不同，数据起点只能按本地头算
  const dataAt = local + 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const bytes = await sliceAt(file, dataAt, compressed);
  if (!bytes || bytes.byteLength < compressed) return null;
  const type = MIME[extensionOf(name)] ?? "application/octet-stream";
  if (method === 0) return new Blob([bytes], { type });
  if (typeof DecompressionStream !== "function") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const raw = await new Response(stream).arrayBuffer();
    return raw.byteLength ? new Blob([raw], { type }) : null;
  } catch {
    // 数据被截断或不是合法的 deflate 流
    return null;
  }
}

/** zip64 结束记录的位置记在 EOCD 前面那 20 字节的定位器里 */
async function readZip64(file: Blob, tail: Uint8Array<ArrayBuffer>, eocd: number): Promise<{ count: number; size: number; offset: number } | null> {
  const locator = eocd - 20;
  const view = viewOf(tail);
  if (locator < 0 || view.getUint32(locator, true) !== EOCD64_LOCATOR_SIG) return null;
  const at = Number(view.getBigUint64(locator + 8, true));
  const record = await sliceAt(file, at, 56);
  if (!record || record.byteLength < 56) return null;
  const rec = viewOf(record);
  if (rec.getUint32(0, true) !== EOCD64_SIG) return null;
  return { count: Number(rec.getBigUint64(32, true)), size: Number(rec.getBigUint64(40, true)), offset: Number(rec.getBigUint64(48, true)) };
}

function findEocd(tail: Uint8Array<ArrayBuffer>): number {
  const view = viewOf(tail);
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

function viewOf(bytes: Uint8Array<ArrayBuffer>): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

async function sliceAt(file: Blob, offset: number, length: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!Number.isFinite(offset) || offset < 0 || length <= 0 || offset >= file.size) return null;
  const end = Math.min(file.size, offset + length);
  if (end <= offset) return null;
  return new Uint8Array(await file.slice(offset, end).arrayBuffer());
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop()?.trim() ?? "";
}

function extensionOf(name: string): string {
  return name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
}
