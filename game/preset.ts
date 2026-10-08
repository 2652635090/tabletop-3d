/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { api } from "./api";
import { imageKeysOf } from "./images";
import type { GameObject, TableState } from "./types";

/**
 * 桌面预设：把这台浏览器摆好的一张桌子（连同它引用了哪些自传图）留在本地，
 * 之后可以在本地桌面重开，也可以在联网房里由房主一次性摆回整张桌子。
 * 只存物件与桌名，不存座位、回合与记录——预设是「桌面的样子」，不是某一局的进程。
 */
const PREFIX = "tabletop3d:";
const LIST = "presets";
/** 预设攒到这个数就把最老的挤掉：一份满桌大概几百 KB，别把配额吃干 */
const PRESET_MAX = 20;
/** 单份预设的体积闸门：超了就不存本体，只报「这张桌太大」，免得静默存成半张桌 */
const PRESET_MAX_CHARS = 900_000;

export interface PresetMeta {
  id: string;
  name: string;
  at: number;
  objects: number;
  /** 这张桌子引用了多少张自传图：载入前要先补传的就是这些 */
  images: number;
}

interface StoredPreset extends PresetMeta {
  o: GameObject[];
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* 隐私模式下本来也写不进去 */
  }
}

function slot(id: string): string {
  return `preset:${id}`;
}

function brief(hit: StoredPreset): PresetMeta {
  return {
    id: hit.id,
    name: hit.name || "牌桌",
    at: Number(hit.at) || 0,
    objects: Number(hit.objects) || 0,
    images: Number(hit.images) || 0,
  };
}

/** 清掉本机全部预设：只动本地，服务器上的像素一张都不会少 */
export function wipePresets(): void {
  for (const meta of listPresets()) remove(slot(meta.id));
  remove(LIST);
}

/** 本机所有预设，最近存的排前面 */
export function listPresets(): PresetMeta[] {
  const list = read<{ ids?: string[] }>(LIST);
  const out: PresetMeta[] = [];
  for (const id of Array.isArray(list?.ids) ? list!.ids : []) {
    const hit = read<StoredPreset>(slot(id));
    if (hit && typeof hit.id === "string" && Array.isArray(hit.o)) out.push(brief(hit));
  }
  return out.sort((a, b) => b.at - a.at);
}

/** 把当前桌面收成一个预设；存不下返回 null，让界面上说得出原因 */
export function savePreset(state: TableState, name?: string): PresetMeta | null {
  const title = (name?.trim() || state.name?.trim() || "牌桌").slice(0, 40);
  const o = api.sanitize(state).o;
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const hit: StoredPreset = {
    id,
    name: title,
    at: Date.now(),
    objects: o.length,
    images: imageKeysOf({ o }).length,
    o,
  };
  if (JSON.stringify(hit).length > PRESET_MAX_CHARS) return null;
  if (!write(slot(id), hit)) {
    // 配额满：从最老的那个预设开始腾地方，腾完再试一次
    dropOldest();
    if (!write(slot(id), hit)) return null;
  }
  const ids = [id, ...listPresets().map((m) => m.id)].slice(0, PRESET_MAX);
  if (!write(LIST, { ids })) {
    for (const extra of listPresets().slice(PRESET_MAX)) remove(slot(extra.id));
    write(LIST, { ids: ids.slice(0, PRESET_MAX) });
  }
  return brief(hit);
}

function dropOldest(): void {
  const all = listPresets();
  if (all.length < 2) return;
  const oldest = all[all.length - 1];
  remove(slot(oldest.id));
  write(LIST, { ids: all.slice(0, -1).map((m) => m.id) });
}

/** 读回一个预设的桌面本体（过一遍和服务端同一套收口） */
export function takePreset(id: string): { name: string; o: GameObject[] } | null {
  const hit = read<StoredPreset>(slot(id));
  if (!hit || !Array.isArray(hit.o)) return null;
  return { name: hit.name || "牌桌", o: api.sanitize({ name: hit.name, o: hit.o, players: [], turn: 0, step: 1, log: [] }).o };
}

/** 这个预设要哪些自传图：房主载入前先照这份往服务器补传 */
export function presetImages(id: string): string[] {
  const hit = read<StoredPreset>(slot(id));
  return hit && Array.isArray(hit.o) ? imageKeysOf({ o: hit.o }) : [];
}

export function removePreset(id: string): void {
  remove(slot(id));
  write(LIST, { ids: listPresets().filter((m) => m.id !== id).map((m) => m.id) });
}
