/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

/** 桌面物件与牌局状态的共享类型：所有可同步内容都必须是可 JSON 序列化的纯数据。 */

export type Kind = "board" | "pawn" | "disc" | "cube" | "die" | "card" | "pile" | "box" | "bag" | "token" | "timer" | "pointer" | "arrow" | "text" | "zone" | "stat" | "slot" | "calc" | "spinner" | "track" | "shield" | "hour" | "book" | "gram" | "mp3" | "counter" | "tray" | "tablet";

export type BoardLayout = "grid" | "lines" | "ring" | "hex" | "mat";

/** 区域垫的长宽（米）：区域按几何位置圈住物件，不做父子挂载。带主人时它还是一家的座位，reach/guard 就是这家的攻防范围 */
export interface ZoneSpec {
  w: number;
  d: number;
  /** 进攻范围（家）：绕桌数到第几家以内打得着。归约后一定在，写进来时可以省 */
  reach?: number;
  /** 防御范围（家）：别人数到你时多算几家 */
  guard?: number;
  /** 垫子：同一套几何，但画成一块实心的垫子而不是虚线框。只在是垫子时进状态 */
  pad?: true;
  /** 垫面贴图（图片导入的垫子）：只存内容哈希 key，像素走图片缓存。只在有图时进状态 */
  img?: string;
}

/** 统计垫的长宽（米）：和区域垫是两种东西，它只负责数牌，不圈归属也不保密 */
export interface StatSpec {
  w: number;
  d: number;
}

/** 卡槽带的格数：一条带子上几个槽，牌拖近就自动对齐进最近的空槽 */
export interface SlotSpec {
  n: number;
}

/**
 * 迷你计数器：一片能吸在卡牌边上的小薄片，读数可以为负。
 * 吸住之后它的位置不再是独立事实——宿主一动，归约按 counterSpot 重新算它的落点。
 */
export interface CounterSpec {
  /** 读数，可为负，夹在 ±COUNTER_V_MAX */
  v: number;
  /** 每按一下走多少，默认 1 */
  step: number;
  /** 吸附的宿主物件 id；不在就是散放在桌上 */
  host?: string;
  /** 吸在哪条边：0 上(-z) / 1 右(+x) / 2 下(+z) / 3 左(-x) */
  edge?: 0 | 1 | 2 | 3;
}

/** 骰盘：一只开口四壁浅盘，接住骰子、把掷骰范围收在盘里。带内径（米）；墙高与壁厚是固定外观，不进状态 */
export interface TraySpec {
  w: number;
  d: number;
}

/** 转盘：等分几格、指针停在哪一格、哪一时刻起转（各端照同一时刻同步播这段动画） */
export interface SpinnerSpec {
  n: number;
  /** 停在第几格，0 起；没转过的转盘没有它 */
  value?: number;
  /** 起转时刻（epoch 毫秒） */
  at?: number;
}

/** 计分轨上的一位标记：by 是这个人此刻的客户端 id，名字与颜色只是刻在轨上的展示 */
export interface TrackMark {
  by: string;
  name?: string;
  color?: string;
  /** 走到的刻度，0 起 */
  at: number;
}

/** 计分轨：一条公共刻度轨，一人一枚棋子，谁领先一眼看得出来 */
export interface TrackSpec {
  n: number;
  marks: TrackMark[];
}

/**
 * 牌屏：立在面前的一块挡板。宽 w（米）、高 h（米）。
 * 屏的主人坐在屏朝向的那一侧（本地 +Z），贴在屏前那一窄条里的牌面只给主人看。
 */
export interface ShieldSpec {
  w: number;
  h: number;
}

/** 沙漏：固定几分钟一漏，at 是这次翻面的时刻（epoch 毫秒），null 表示沙子躺着没漏 */
export interface HourSpec {
  mins: number;
  at: number | null;
}

/** 规则书：摊开停在第几页，每页一段纯文本（首页当书名页） */
export interface BookSpec {
  page: number;
  pages: string[];
}

/**
 * 唱片机：一张唱片加一套播放状态。音频字节不进桌面状态，clip 只是仓库里的 key，
 * 各端自己按 at 与 pos 推出此刻该播到哪儿，所以没人每秒往桌上写一次进度。
 */
export interface GramSpec {
  /** 曲目 key（AUDIO_KEY 形状）；null 是空机，什么都没放 */
  clip: string | null;
  /** 曲名，跟着文件走，最长 GRAM_NAME_MAX */
  name: string;
  /** 全曲时长（秒），上传者本地解码出来；0 表示还没人知道 */
  dur: number;
  /** 此刻的播放位置（秒）：playing 时它是 at 那一刻的位置，停下时就是停在哪儿 */
  pos: number;
  /** 在转吗 */
  playing: boolean;
  /** 起播/续播的墙钟时刻（epoch 毫秒），停下时为 null */
  at: number | null;
  /** 音量 0..1，全桌同一个数 */
  vol: number;
  /** 循环：唱到结尾接着唱 */
  loop: boolean;
}

/**
 * 迷你播放器：一首存在本机硬盘上的歌。它跟唱片机不是一回事——唱片机的字节躺在服务器上，
 * 这一台的字节只在同学之间的线路上走一遍，谁也不存（服务器那份一份都不留）。
 * 没共享出去之前，桌面上只写着曲名和时长：放不放、放到哪、多响，全在这台机器自己身上。
 */
export interface Mp3Spec {
  /** 本机曲目 key（AUDIO_KEY 形状，内容哈希）；null 是空机，什么都没放 */
  clip: string | null;
  /** 曲名，跟着文件走，最长 MP3_NAME_MAX */
  name: string;
  /** 全曲时长（秒），主人本机解码出来的 */
  dur: number;
  /** 共享之后的播放位置（秒）：私人那一份不进桌面，见 Mp3Spec.shared */
  pos: number;
  playing: boolean;
  /** 起播/续播的墙钟时刻（epoch 毫秒），停下时为 null */
  at: number | null;
  /** 音量 0..1，只在共享之后才有意义（私人音量只归本机记着） */
  vol: number;
  loop: boolean;
  /** 这台机器是谁摆的、歌在谁电脑上（clientId）：换片与共享收回去只有他说了算 */
  by: string;
  /** 共享给全桌：true 之后进度才往桌上写，别人也就顺着线路去他电脑上取这首歌 */
  shared: boolean;
}

/**
 * 平板浏览器：一台平躺在场上的小平板，屏上挂着全桌同一页网页。
 * 地址是唯一的真源——B 站的片子也只是「一个网址」，认得出来才多一套走带按钮。
 * 字节全在对面那台服务器上，桌上只写着地址和几个参数；进度由各端照 pos 与 at
 * 自己推，没人每秒往桌上回写一次。跨源读不到真实时长与标题，所以名字用物件自带的 label 手写。
 */
export interface TabletSpec {
  /** 地址：归一化过的 http/https 完整 URL；空串是空机，什么都没挂 */
  url: string;
  /** 分 P，1 起；只有 B 站那一种地址用得上，别的网址恒为 1 */
  page: number;
  /** 起播/暂停那一刻的位置（秒）；停下时就是停在哪儿 */
  pos: number;
  playing: boolean;
  /** 起播/续播的墙钟时刻（epoch 毫秒），停下时为 null */
  at: number | null;
  /** 静音：跨源播放器读不到音量，只能开或关。全桌同一个数 */
  mute: boolean;
  /** 重新载入的计数：地址一个字都没变也要能重挂一次，只能靠这个数把变化喂给各端 */
  rev: number;
}

export interface BoardSpec {
  layout: BoardLayout;
  /** 网格/线格时为路数，桌垫（mat）时为长宽比例的两边格数 */
  cols: number;
  rows: number;
  /** 单元格/交叉点边长（米），桌垫为单边尺寸 */
  cell: number;
  theme: string;
  /** 导入大图当桌垫时的图片 key，与卡面共用图片表 */
  img?: string;
}

export interface CardSpec {
  /** 卡背样式 id，或 'plain' */
  back: string;
  rank?: string;
  suit?: "s" | "h" | "d" | "c";
  label?: string;
  /** 卡面上最显眼的那个字/符号：角色、势力、大小王的徽记 */
  art?: string;
  /** 类别或阵营，排在卡面顶栏：「狼人阵营」「锦囊牌」「魏」 */
  cat?: string;
  /** 卡牌效果/描述文本，翻开时会写进桌面记录 */
  text?: string;
  color?: string;
  /** 玩家上传的卡面图片 key，像素按客户端按需拉取，不进桌面状态 */
  img?: string;
  /** 无边框：导入的卡面铺满整张牌，不留那圈白边和描边。只有带图才有意义 */
  borderless?: boolean;
  /** 卡面图的宽高比（宽/高）：卡牌按它成形，图就不会被裁掉一块。只有带图才有意义 */
  ratio?: number;
}

export interface GameObject {
  id: string;
  kind: Kind;
  /** 桌面坐标，单位米，原点在桌面中心 */
  x: number;
  z: number;
  /** 绕 Y 轴角度，度 */
  rot: number;
  /** 绕自身 X 轴的俯仰角，度：让牌与棋子可以斜靠、立起来 */
  tilt?: number;
  /** 堆叠层数，0 为贴桌/贴棋盘 */
  layer: number;
  /** 高度锁定：拖来拖去保持当前层不坠不挤，解锁时才按物理落回去 */
  pin?: boolean;
  color?: string;
  shape?: string;
  label?: string;
  faceUp?: boolean;
  board?: BoardSpec;
  sides?: number;
  value?: number;
  card?: CardSpec;
  pile?: CardSpec[];
  /** 自定义卡背图片 key：作用于该物件本身以及它装着的牌 */
  backImg?: string;
  /** 计时器总时长（秒），重置时回到它 */
  duration?: number;
  /** 暂停时剩余的秒数；运行中由 endsAt 推算 */
  left?: number;
  /** 运行中的结束时刻（epoch 毫秒），null/未定义表示没在跑 */
  endsAt?: number | null;
  /** 路径箭头的长度（米），沿物件朝向正向铺开 */
  len?: number;
  /** 数值计数器（计分/资源标记） */
  count?: number;
  /** 模型体积倍数，0.35~3，默认 1 */
  scale?: number;
  /** 手牌归属（客户端 id）；手牌不进桌面渲染，只在持有者的手牌条里显示 */
  owner?: string;
  hand?: boolean;
  /** 区域垫尺寸（米） */
  zone?: ZoneSpec;
  /** 统计垫尺寸（米）：数清楚垫上的牌有几张竖着、几张横着 */
  stat?: StatSpec;
  /** 卡槽带的格数：牌拖到槽口就吸进去排整齐 */
  slot?: SlotSpec;
  /** 转盘：几等分、停在哪一格、什么时候起转 */
  spinner?: SpinnerSpec;
  /** 计分轨：刻度数与每人一枚的位置棋子 */
  track?: TrackSpec;
  /** 牌屏：立在面前的挡板，屏前那一窄条里的牌只对主人亮着 */
  shield?: ShieldSpec;
  /** 沙漏：几分一漏，此刻在不在漏 */
  hour?: HourSpec;
  /** 规则书：房规与记要，摊开停在哪一页 */
  book?: BookSpec;
  /** 唱片机：一张唱片在转，全桌按同一套时刻推位置 */
  gram?: GramSpec;
  /** 迷你播放器：本机的一首歌，共享出去之后全桌一起按同一套时刻推位置 */
  mp3?: Mp3Spec;
  /** 平板浏览器：屏上写一条网址（B 站那种地址额外带一套走带），全桌按同一套时刻推位置 */
  tablet?: TabletSpec;
  /** 迷你计数器：一片能吸在卡牌边上的小薄片，读数可负 */
  counter?: CounterSpec;
  /** 骰盘：开口四壁浅盘的内径（米），接住骰子、拖动盘子它们跟着走 */
  tray?: TraySpec;
  /** 垫子锁定（统计垫与桌垫）：锁上之后谁都选不中它，只能点垫角上那颗小解锁按钮 */
  lock?: boolean;
  /** 网格锁定（棋盘）：盘上的东西只许待在册格/交叉点上，抢同一格就散到最近的空格，谁也不被挤歪。开着就必然吸附 */
  grid?: boolean;
  /** 自动吸附（棋盘）：默认开着，落点吸进最近的格心／交叉点；显式关掉（false）才许骑在格缝上摆 */
  snap?: boolean;
  /** 网格线显示（棋盘）：只有显式关掉才不进状态；关了只是看不见线，吸附和锁定照常生效 */
  mesh?: boolean;
  /** 这块棋盘是哪张预设生成的：吃子与「摆回开局」都靠它认盘，规格相同的两套预设（国际象棋/跳棋）只有它分得开 */
  preset?: string;
  /** 区域隐私模式：开着时区域内物件只有创建者能选中与使用，牌面也始终只对创建者可见 */
  priv?: boolean;
  /** 我的首选落牌区：摸牌与打出手牌默认落到这里，同一时间只会有一个区域带这个标记 */
  pref?: boolean;
  /** 桌上 3D 计算器的表达式：结果由各端按同一套求值算出，不进状态 */
  calc?: { expr: string };
}

export interface Player {
  id: string;
  name: string;
  color: string;
}

export type LogKind = "move" | "add" | "remove" | "roll" | "card" | "turn" | "chat" | "system" | "effect" | "timer";

export interface LogEntry {
  id: string;
  at: number;
  by: string;
  kind: LogKind;
  text: string;
  color?: string;
}

export interface TableState {
  name: string;
  o: GameObject[];
  players: Player[];
  /** 当前回合在 players 中的下标 */
  turn: number;
  /** 顺时针/逆时针步进，用于“下一位” */
  step: number;
  log: LogEntry[];
}

export interface Presence {
  [clientId: string]: {
    name: string;
    at: number;
    color?: string;
    room?: string;
    /** 该客户端自测的往返毫秒，仅用于展示 */
    rtt?: number;
    /** 这台浏览器的指纹短号：昵称撞车时靠它认人 */
    fp?: string;
  };
}

/**
 * 房间记录上的元信息：房主是谁、公不公开、成员拿到哪些权限。
 * 这些刻意不放进 TableState —— 桌面状态是客户端整桌写入的，权限写在里面等于谁都能改自己那份。
 */
export interface RoomInfo {
  /** 房主当前这次的客户端 id，踢人转房主一类操作按它认 */
  owner: string;
  ownerName: string;
  /** 房主浏览器的指纹短号：换了标签页、clientId 变了也还能认出是同一台机器 */
  ownerFp: string;
  /** 公开房挂在大厅，私密房只能拿房间码进来 */
  pub: boolean;
  /**
   * 游戏模式：房主一键开起来，全桌把编辑与删除那些摆桌子的功能收起。
   * 也放在房间记录上，理由和权限表一样——谁都能整桌写状态，写在状态里等于谁都关不掉。
   */
  gm: boolean;
  /** 成员权限表：没写明的键按 game/perm.ts 的成员默认档算 */
  perms: Partial<Record<import("./perm").PermKey, boolean>>;
}

/** 总站在线名单上的一位：跨房间的全局名册，只带昵称与指纹短号 */
export interface LobbyUser {
  id: string;
  name: string;
  fp: string;
  color: string;
  /** 此刻在哪个房间，没进房是 null */
  room: string | null;
  at: number;
}

/** 一次意图。所有随机结果都由发起方写入 action，便于冲突后按原意图重放。 */
export type Action =
  | { t: "add"; o: GameObject }
  | { t: "addMany"; o: GameObject[]; note?: string }
  /** rigid=true：整组刚性平移（搬棋盘、拖区域垫），落点照写，不再挤开别人也不塌落 */
  | { t: "move"; m: Move[]; rigid?: boolean }
  | { t: "remove"; ids: string[] }
  | { t: "flip"; ids: string[] }
  | { t: "turnCards"; ids: string[]; up: boolean }
  /** 调层数：pin=true 表示这是手工摆高度，顺手钉住，免得下次拖动被自动堆叠拍回去 */
  | { t: "layer"; ids: string[]; delta: number; pin?: boolean }
  /** 高度锁定开关：on=false 时按落点物理结算（下坠 + 挤开） */
  | { t: "pin"; ids: string[]; on: boolean }
  | { t: "scale"; ids: string[]; factor: number }
  /** 转体：delta 是水平转角，pitch 是俯仰角增量，两者都按增量累加 */
  | { t: "rot"; ids: string[]; delta: number; pitch?: number }
  /** 转角归零：回到没调过的 0° 平躺，各端归约出同一个朝向 */
  | { t: "rotReset"; ids: string[] }
  | { t: "label"; id: string; label: string }
  | { t: "color"; id: string; color: string }
  | { t: "count"; id: string; delta: number }
  /**
   * 迷你计数器：加减读数（delta 或 v）、换步进档（step）、吸附与脱附（host=null 脱附，edge 换边）。
   * 只改传入的字段；带 host/edge 时归约顺手把位置按 counterSpot 重算，免得留下对不上的坐标。
   */
  | { t: "counter"; id: string; delta?: number; v?: number; step?: number; host?: string | null; edge?: 0 | 1 | 2 | 3 }
  /** 骰盘改内径：只改传入的字段 */
  | { t: "tray"; id: string; w?: number; d?: number }
  | { t: "roll"; r: { id: string; value: number }[] }
  | { t: "draw"; id: string; to: GameObject[] }
  /** 从收纳容器里精确取出堆内第 index 张：列表按行取牌，不靠内容匹配 */
  | { t: "pull"; id: string; index: number; to: GameObject }
  | { t: "putBack"; id: string; cardIds: string[]; cards: CardSpec[] }
  /** 整堆倒进另一个容器：flip=true 时倒前先翻面（弃牌堆扣着倒回牌库，顺序正好反过来） */
  | { t: "pour"; from: string; to: string; flip?: boolean }
  | { t: "shuffle"; id: string; cards: CardSpec[] }
  /** 切牌：牌堆顶上 at 张整叠扣到下面去，牌一张不少，只是断点换了 */
  | { t: "cut"; id: string; at: number }
  /** 均分牌堆：piles 里必有一项的 id 就是源堆（它留在原位），其余各项是要新摆上桌的牌堆 */
  | { t: "even"; id: string; piles: GameObject[] }
  | { t: "deal"; piles: { id: string; cards: CardSpec[] }[]; to: GameObject[] }
  /** 拿进手牌 / 打出手牌：owner 为 null 时回到桌面，并落到 at 位置；spots 给出每张牌的最终落点，照抄不再散开 */
  | { t: "hand"; ids: string[]; owner: string | null; at?: { x: number; z: number }; spots?: { x: number; z: number }[]; spread?: number; faceUp?: boolean }
  /** 计时器：整套剩余状态由发起方算好，各端只重放 */
  | { t: "timer"; id: string; duration: number; left: number; endsAt: number | null }
  /** 路径箭头长度（米） */
  | { t: "arrow"; id: string; len: number }
  /** 区域垫改尺寸 / 开关隐私模式 / 设为首选落牌区 / 换归属 / 换垫面图（img 传空串是撤掉图，回到纯色）：只改传入的字段 */
  | { t: "zone"; id: string; w?: number; d?: number; reach?: number; guard?: number; priv?: boolean; pref?: boolean; owner?: string; label?: string; img?: string }
  /** 统计垫改尺寸：只改传入的字段 */
  | { t: "stat"; id: string; w?: number; d?: number }
  /** 上锁 / 解锁一块垫子（统计垫或桌垫）：锁住谁都点不中，只留角上的解锁按钮 */
  | { t: "lock"; id: string; on: boolean }
  /** 网格锁定（棋盘）：开了之后盘上的子只许待在册格/交叉点上，抢同一格就散到最近的空格 */
  | { t: "grid"; id: string; on: boolean }
  /** 自动吸附（棋盘）：落点吸进最近格心，但不要求一手一子，两枚子能坐同一格 */
  | { t: "snap"; id: string; on: boolean }
  /** 网格线显示（棋盘）：只关掉盘面的线，吸附与锁定照旧生效 */
  | { t: "mesh"; id: string; on: boolean }
  /** 摆回开局：清掉这一盘上的子，按预设把开局子重新铺在盘面原来的位置上 */
  | { t: "reset"; id: string }
  /** 卡槽带改格数：加减槽位，牌照样按新格数重排 */
  | { t: "slot"; id: string; n: number }
  /** 拨一下转盘：停在第几格由发起方算好写进来，各端只按同一时刻重放这段指针动画 */
  | { t: "spin"; id: string; value: number; at: number }
  /** 改转盘的等分数：改了就把上一次的落点抹掉，免得结果落在已经不存在的格子里 */
  | { t: "spinSet"; id: string; n: number }
  /** 改计分轨的刻度数：所有人的位置夹进新范围，短轨不会把谁的棋子丢出界 */
  | { t: "trackSet"; id: string; n: number }
  /** 计分轨走子：没有这人的棋子就先建一枚再走 delta；delta 为 0 时只是改名换色 */
  | { t: "mark"; id: string; by: string; delta: number; name?: string; color?: string }
  /** 计分轨清子：带 by 只摘掉那一个人的棋子，不带则所有人回到起点 */
  | { t: "markClear"; id: string; by?: string }
  /** 按下桌上计算器的一个键：归约端用同一套 calcPress 推出新表达式 */
  | { t: "calcKey"; id: string; key: string }
  /** 牌屏改宽改高 / 换主人（null 表示没人认领）/ 改屏上的字：只改传入的字段 */
  | { t: "shield"; id: string; w?: number; h?: number; owner?: string | null; label?: string }
  /** 沙漏：翻面起算（at=起算时刻）或按停（at=null），换时长一并写进来，各端只重放 */
  | { t: "hour"; id: string; mins: number; at: number | null }
  /** 唱片机：换片（clip/name/dur）、放与停（playing/at）、跳段（pos）与音量循环都走这一条，只改传入的字段 */
  | { t: "gram"; id: string; clip?: string | null; name?: string; dur?: number; pos?: number; playing?: boolean; at?: number | null; vol?: number; loop?: boolean }
  /**
   * 随身听：刻上本机的歌（clip/name/dur，一律先收回私人）、共享与收回、改名，
   * 以及共享之后的放停跳段音量循环。私人那一台的走带参数不走这条线——那些只在它主人自己机器上。
   */
  | { t: "mp3"; id: string; clip?: string | null; name?: string; dur?: number; pos?: number; playing?: boolean; at?: number | null; vol?: number; loop?: boolean; shared?: boolean; by?: string }
  /**
   * 平板浏览器：换上地址与分 P（换页一律从头起）、放与停、跳段、静音、重新载入都走这一条，只改传入的字段。
   * 这台机器叫什么不在这里——那是物件的 label，走既有的 label 动作。
   */
  | { t: "tablet"; id: string; url?: string; page?: number; pos?: number; playing?: boolean; at?: number | null; mute?: boolean; rev?: number }
  /** 规则书：翻到第几页，或改写整本页面（pages 不传就只翻页） */
  | { t: "book"; id: string; page?: number; pages?: string[] }
  /** 整叠换牌：卡牌管理面板的增删改排序都走它 */
  | { t: "pileSet"; id: string; cards: CardSpec[]; note?: string }
  /** 改写单张牌（散牌或手牌）的名字、描述、卡面 */
  | { t: "cardSet"; id: string; card: CardSpec }
  /** 自定义卡背图片；null 表示回到内置样式；一次可以作用于多个物件 */
  | { t: "backSet"; ids: string[]; img: string | null; style?: string }
  /** 把选中的散牌按牌面分成若干叠：ids 是收走的散牌，piles 是发起方算好的新牌堆 */
  | { t: "split"; ids: string[]; piles: GameObject[] }
  /** 把某张牌的效果写进桌面记录 */
  | { t: "effect"; id: string; index?: number }
  | { t: "playerAdd"; player: Player }
  | { t: "playerRemove"; id: string }
  | { t: "turnSet"; index: number }
  | { t: "turnNext" }
  | { t: "clear" }
  /** 把桌面上存过的整套预设摆回来：整桌物件一次换掉，座位与记录不动 */
  | { t: "presetLoad"; o: GameObject[]; name: string }
  | { t: "rename"; name: string }
  | { t: "boardSet"; board: GameObject | null }
  | { t: "chat"; text: string };

export interface Move {
  id: string;
  x: number;
  z: number;
  rot?: number;
  layer?: number;
  /**
   * 迷你计数器的吸附意图：string 是吸到这个宿主上，null 是从宿主上拖下来。
   * 只在拖的是计数器时出现，归约照它落账，所以吸附与落点一次提交就对齐了。
   */
  host?: string | null;
  /** 吸在哪条边，配 host 一起用 */
  edge?: 0 | 1 | 2 | 3;
}

export interface Envelope {
  /** 发起方意图，用于冲突后重放 */
  action: Action;
  /** 期望的服务器版本 */
  base: number;
  /** 本地计算出的新状态 */
  state: TableState;
  by: string;
}
