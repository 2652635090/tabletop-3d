/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

/** 四则计算器：只吃按钮拼出来的表达式，不走 eval；面板与 3D 摆件共用这一套状态机。 */

export const CALC_MAX = 40;

/** 键位表：4 列 5 行，面板和 3D 键盘都按它摆 */
export const CALC_KEYS: string[][] = [
  ["C", "⌫", "(", ")"],
  ["7", "8", "9", "÷"],
  ["4", "5", "6", "×"],
  ["1", "2", "3", "−"],
  ["0", ".", "=", "+"],
];

/** 递归下降求值，返回 null 表示当前表达式还不完整或非法 */
export function evalCalc(src: string): number | null {
  const s = src.replace(/÷/g, "/").replace(/×/g, "*").replace(/−/g, "-");
  let i = 0;
  const expr = (): number | null => {
    let v = term();
    if (v === null) return null;
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = term();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const term = (): number | null => {
    let v = factor();
    if (v === null) return null;
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const r = factor();
      if (r === null || (op === "/" && r === 0)) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const factor = (): number | null => {
    if (s[i] === "(") {
      i++;
      const v = expr();
      if (v === null || s[i] !== ")") return null;
      i++;
      return v;
    }
    const start = i;
    if (s[i] === "-") i++;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (i === start) return null;
    const num = Number(s.slice(start, i));
    return Number.isFinite(num) ? num : null;
  };
  const v = expr();
  return v === null || i !== s.length ? null : v;
}

/** 结果转显示字符串：最多四位小数，去掉浮点噪声 */
export function formatCalc(v: number): string {
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v * 10000) / 10000);
}

/** 按下一个键后的新表达式：C 清空、⌫ 退格、= 收敛成结果、其余追加（限长） */
export function calcPress(expr: string, key: string): string {
  if (key === "C") return "";
  if (key === "⌫") return expr.slice(0, -1);
  if (key === "=") {
    const v = evalCalc(expr);
    return v === null ? expr : formatCalc(v);
  }
  return (expr + key).slice(0, CALC_MAX);
}

/** 当前表达式的实时结果，非法时为 null */
export function calcResult(expr: string): number | null {
  return evalCalc(expr);
}

/** 收口外来表达式：只留按键能拼出来的字符（含 U+2212 减号），限长，脏字段不会让各端算出两份结果 */
export function fixCalcExpr(src: unknown): string {
  return (typeof src === "string" ? src : "").replace(/[^0-9.+\-−×÷()]/g, "").slice(0, CALC_MAX);
}
