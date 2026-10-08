/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { handler } from "../functions/handler.ts";

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, handler);
