/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { serveSite } from "./adapter.mjs";
import { handleTable } from "./handler.mjs";

Deno.serve(serveSite(handleTable, {
  createClient,
  env: (name: string) => Deno.env.get(name),
}));
