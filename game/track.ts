import { ApiError } from "./api";
import { adoptClip, audioKeyOf, CLIP_MAX_BYTES, localClip } from "./audio";
import { MP3_DUR_MAX, MP3_CHUNK } from "./catalog";

/**
 * 随身听的字节层：本机挑的那首歌，和同学一段一段递过来的那些段，都在这里凑成一首完整的曲子。
 * 这一层跟服务器那条门（api.getAudio / api.putAudio）没有来往：字节只在人与人之间走。
 */

/** 刻进机身的那三个数：桌上只记这些，一个音频字节都不进桌面状态 */
export interface TrackInfo {
  key: string;
  name: string;
  dur: number;
}

/** 曲名：文件名去掉后缀，截到机身刻得下的长度 */
function trackName(file: File): string {
  return file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim().slice(0, 24);
}

/** 挑一首本机的歌：量出时长、存进本机缓存，从此这台机器就有的放 */
export async function pickTrack(file: File): Promise<TrackInfo> {
  if (file.size > CLIP_MAX_BYTES) throw new ApiError("这首曲子太大，先剪短到 24MB 以内再往机器上刻。", "audio_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = audioKeyOf(bytes);
  const clip = await adoptClip(key, new Blob([bytes], { type: file.type }));
  if (!clip) throw new ApiError("这台浏览器放不动这种格式，换个 mp3 或 ogg 试试。", "audio_unsupported");
  if (clip.dur > MP3_DUR_MAX) throw new ApiError("超过一小时的录音不叫随身听的歌，先剪短一些。", "audio_too_large");
  return { key, name: trackName(file), dur: clip.dur };
}

/* ———— 递字节用的分段：base64 走实时通道那条文本线路 ———— */

/** 每 8192 字节转一次字符串：一次性 apply 几万字节的参数会把调用栈压垮 */
function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(s);
}

function fromB64(text: string): Uint8Array | null {
  try {
    const s = atob(text);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** 一首歌切成往外递的几段：拿不到本机那份字节时返回 null，让递的人去求歌 */
export async function splitTrack(key: string): Promise<string[] | null> {
  const blob = await localClip(key);
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += MP3_CHUNK) {
    parts.push(toB64(bytes.subarray(i, i + MP3_CHUNK)));
  }
  return parts.length ? parts : null;
}

/** 收进来的一段：脏 base64 就当没收到，缺的那一段下一轮求歌还会补 */
export function decodePart(text: string): Uint8Array | null {
  if (!text || text.length > 140000) return null;
  return fromB64(text);
}

/** 段齐了凑成一首歌，交回本机缓存：成了返回 true，这浏览器放不动就返回 false */
export async function joinTrack(key: string, parts: Uint8Array[], mime = ""): Promise<boolean> {
  const blob = new Blob(parts as unknown as BlobPart[], { type: mime });
  if (!blob.size) return false;
  return !!(await adoptClip(key, blob));
}
