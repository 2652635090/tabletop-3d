import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FELT_Y, G, TABLE, baseY, boxOf, containerAt, diceInTray, faceHidden, fixTablet, fixTray, floorY, footprintOf, hourLeft, hourRatio, inZone, liftFor, lockedOut, materialOf, mmss, onBoard, outlineOf, remainingOf, restInTable, sameCardsReordered, scaleOf, slotCards, spanOf, spinAngleAt, statCards, surfaceY, TABLET_SCREEN, tabletPos, trackOffset, trayAt } from "@/game/catalog";
import { fling } from "@/game/physics";
import { tabletFrame, tabletHost, tabletScreenPlan, tabletScreenPx } from "@/game/tablet";
import { resolveDrop, capturesOf, round3 } from "@/game/landing";
import { MAX_PILE } from "@/game/state";
import { requestImages, subscribeImages } from "@/game/images";
import { localPlaying } from "@/game/mp3";
import { clampBright, COARSE_POINTER, type QualityLevel } from "@/game/view";
import { calcResult, formatCalc } from "@/game/calc";
import type { MovePoint } from "@/game/rules";
import type { GameObject, Move, TableState, TabletSpec } from "@/game/types";
import { GRAM_MOTION, MP3_MOTION, RING_R, buildPiece, dropPrintMaterials, landingFrame, peerRing, rifflePile, selectionFrame, tableMaterials } from "./pieces";
import type { DragMark } from "@/game/rt";
import type { Plate } from "./textures";
import { dieNormal, handBadgeTexture, labelSpriteTexture, objectSignature, paintCalc, paintCounter, paintTimer, setPrintScale, setTextureAnisotropy } from "./textures";

export type ViewName = "default" | "top" | "seat";

export interface TabletopEvents {
  onSelect: (ids: string[], additive: boolean) => void;
  /** rigid=true：这一批是刚性平移（搬棋盘、拖区域垫），归约里别再挤开与塌落，否则松手又跳一次 */
  onCommit: (moves: Move[], rigid: boolean) => void;
  /** 牌被拖到容器口上松手：不是移动，是丢进盒/袋/牌堆 */
  onDropIn: (ids: string[], containerId: string) => void;
  /** 拖动途中的瞬时位置：约每 100ms 一次，只为让同桌的人实时看见，不进状态 */
  onDragLive: (moves: Move[]) => void;
  onDouble: (id: string) => void;
  onContext: (id: string | null, screen: { x: number; y: number }) => void;
  /** 桌面上 3D 计算器的键被直接点中 */
  onCalcKey: (id: string, key: string) => void;
  /** 按到迷你计数器顶上的 ± 键帽 */
  onCounterKey: (id: string, key: string) => void;
  /** 锁定垫子（统计垫与桌垫）角上的解锁按钮被点中 */
  onUnlock: (id: string) => void;
  /** 按住一张牌不动：细看它此刻朝上的那一面 */
  onInspect: (id: string) => void;
  /** 拖动途中指针移到了哪块「非桌面」落点上：目前只有手牌条，用来给牌栏高亮 */
  onDragZone: (zone: "hand" | null) => void;
  /** 桌上的牌被拖进手牌条松手：不是移动，是收进手里 */
  onToHand: (ids: string[]) => void;
  /** 空白处一次「没有滑动」的点击：外层借此取消选中，并把左右两侧菜单收回去 */
  onBlank: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);
/** 抽样角点算最低点会偏乐观，留一点余量免得棱角蹭进桌布 */
const FLOOR_PAD = 0.0012;
/** 拖动中的物件抬离桌面这么多：悬空一点才好看出「正被拿着」 */
const DRAG_HOVER = 0.014;
/** 拖动帧的发送间隔：10 帧/秒足够跟手，也留在服务端每人 20 帧/秒的额度以内 */
const DRAG_PUSH_MS = 100;
/** 别人的幽灵圈活多久：这么久没再收到帧就算他已经松手，落点以桌面推送为准 */
const GHOST_MS = 1200;
/** 别人的选中图标活多久：选中帧只在改动与心跳时发，余量要给到两次心跳 */
const PICK_MS = 4600;
/** 小手悬浮在物件顶面上方这么多：贴着牌面就看不出那是只手 */
const HAND_CLEAR = 0.036;
/** 小手的基准大小（米）：物件越大跟着放大一点，但不至于盖住半张牌 */
const HAND_BASE = 0.034;
/** 按住不动多久算「长按细看」：比翻牌的点击慢，比右键菜单快 */
const LONG_PRESS_MS = 430;
/** 长按期间手抖出这个像素数就当拖拽，不再弹细看 */
const LONG_PRESS_SLOP = 7;
/** 洗牌动画走多久（秒）：一次到手、对半掰开、错着咬合、墩齐，慢过这个就成拖时间了 */
const RIFFLE_S = 1.05;
const SPIN_Q = new THREE.Quaternion();
const SCRATCH_V = new THREE.Vector3();

interface Tumble {
  id: string;
  mesh: THREE.Object3D;
  /** 骰子自己的网格：绕它本身的中心翻转，才不会把棱角甩到桌面以下 */
  holder: THREE.Object3D | null;
  lift: number;
  verts: Float32Array | null;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  axis: THREE.Vector3;
  spin: number;
  final: THREE.Quaternion;
  t: number;
  flight: number;
  total: number;
  base: number;
  /** 材质给的恢复系数与落地后的水平保留：塑料骰子蹦得欢，木质棋子一落就停 */
  e: number;
  grip: number;
  /** 围板留的余量：按当前体积下的真实投影算 */
  span: { x: number; z: number };
  /** 掷骰时它所在骰盘的框（含朝向）：有就把弹跳收在盘腔里，不撒出盘外 */
  trayBox: { cx: number; cz: number; rad: number; hw: number; hd: number } | null;
}

/** 落地表现用的弹性参数：查不到物件就按一枚普通筹码算 */
function bounceOf(o: unknown): { e: number; hops: number } {
  const m = materialOf((o ?? { kind: "token" }) as GameObject);
  return { e: m.e, hops: m.hops };
}

/** 抽一批不重复的角点：漏掉最低那个角就会穿桌，所以宁可多取几个 */
function sampleVertices(mesh: THREE.Object3D): Float32Array | null {
  const pos = (mesh as THREE.Mesh).geometry?.attributes?.position;
  if (!pos || !pos.count) return null;
  const seen = new Set<string>();
  const out: number[] = [];
  for (let i = 0; i < pos.count && out.length < 576; i++) {
    const x = Math.round(pos.getX(i) * 1e4);
    const y = Math.round(pos.getY(i) * 1e4);
    const z = Math.round(pos.getZ(i) * 1e4);
    const k = `${x},${y},${z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  return Float32Array.from(out);
}

/** 当前姿态下最低点刚好贴住桌面所需的组高度；落地姿态下就等于 base */
function restFloor(tb: Tumble, q: THREE.Quaternion): number {
  if (!tb.verts || !tb.holder) return tb.base;
  let min = 0;
  for (let i = 0; i < tb.verts.length; i += 3) {
    const y = SCRATCH_V.set(tb.verts[i], tb.verts[i + 1], tb.verts[i + 2]).applyQuaternion(q).y;
    if (y < min) min = y;
  }
  return Math.max(tb.base, tb.base - tb.lift - min + FLOOR_PAD);
}

interface Drag {
  ids: string[];
  origin: Map<string, { x: number; z: number }>;
  anchor: string;
  offset: { x: number; z: number };
  base: number;
  moved: boolean;
  live: Map<string, { x: number; z: number }>;
  /** 每件各自的静止高度：托起来时各抬各的，叠着的牌才不会拍平成一张 */
  bases: Map<string, number>;
  /** 每件原本的水平角：卡槽带吸附时牌会转过去，指针离开带子要照原样转回来 */
  rots: Map<string, number>;
  /** 整组刚性平移：搬棋盘、拖区域垫时圈上的东西一起走，不做格子吸附也不互相挤开 */
  rigid: boolean;
  /** 最近 120 毫秒的拖动轨迹：松手那一下用它算甩出去的初速 */
  hist: { t: number; x: number; z: number }[];
}

interface Glide {
  g: THREE.Object3D;
  x0: number; y0: number; z0: number; r0: number; t0: number;
  x1: number; y1: number; z1: number; r1: number; t1: number;
  t: number;
  dur: number;
}

/** 解锁后的下坠：只有竖直方向走重力，水平位置跟着状态即刻落定 */
interface Fall {
  g: THREE.Object3D;
  y: number;
  vy: number;
  floor: number;
  bounces: number;
  /** 材质给的恢复系数与允许的弹跳次数：筹码会蹦两下，纸牌基本一落到底 */
  e: number;
  hops: number;
}

/** 甩出去之后的一滑：照 data 层算好的那条路径逐帧回放，走完就停在动作里写的落点 */
interface Slide {
  g: THREE.Object3D;
  id: string;
  path: { x: number; z: number; rot: number; t: number }[];
  t: number;
  base: number;
}

/** 别人拖动途中的预览圈：跟着收到的帧补间，一段时间没消息就自行消失 */
interface Ghost {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  by: string;
  id: string;
  x: number;
  z: number;
  tx: number;
  tz: number;
  until: number;
}

/** 谁的手正按在哪件东西上：拖动帧与选中帧都刷新它，一段时间没消息就自行收掉 */
interface Hold {
  sprite: THREE.Sprite;
  by: string;
  id: string;
  /** 拖动中＝跟着幽灵圈走；只是选中＝原地悬浮，物件被权威桌面挪走就跟着挪 */
  drag: boolean;
  until: number;
}

const _scrNormal = new THREE.Vector3();
const _scrPos = new THREE.Vector3();
const _scrToCam = new THREE.Vector3();
const _scrQuat = new THREE.Quaternion();
const _scrCorner = new THREE.Vector3();
const _scrFrustum = new THREE.Frustum();
const _scrProj = new THREE.Matrix4();
const _scrSphere = new THREE.Sphere();
/** 屏面四角（占位屏是一块 1×1 的面，网格自己的 scale 已经是米的尺寸） */
const _CORNERS: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
/** 屏面包得住的球：出画面就整块藏掉，别让镜头外的播放器每帧重新采样 */
const SCREEN_RADIUS = Math.hypot(TABLET_SCREEN.w, TABLET_SCREEN.h) / 2;

/** 屏面朝没朝着镜头：CSS3D 那一层压不到桌上物件后面，背过去时宁可留一块黑玻璃，别让画面浮在半空 */
function facesScreen(scr: THREE.Mesh, cam: THREE.Vector3): boolean {
  scr.getWorldQuaternion(_scrQuat);
  _scrNormal.set(0, 0, 1).applyQuaternion(_scrQuat);
  _scrPos.setFromMatrixPosition(scr.matrixWorld);
  _scrToCam.copy(cam).sub(_scrPos);
  return _scrNormal.dot(_scrToCam) > 0.02;
}

/** 一块挂上桌的播放器：px 是当前那一档像素宽，换档就顺手把外壳和贴回去的缩放一起换掉 */
type Screen = { node: CSS3DObject; frame: HTMLIFrameElement; key: string; px: number };

export class Tabletop {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly world = new THREE.Group();
  private readonly pieces = new THREE.Group();
  private readonly rings = new THREE.Group();
  /** 同桌其他人拖动途中的预览圈单独一组：drawRings 每帧重建自己的选中圈，别把它们扫掉 */
  private readonly peerRings = new THREE.Group();
  /** 别人正在操作的物件头顶那些小手：跟预览圈同一批消息，另一组免得被选中圈重建扫到 */
  private readonly hands = new THREE.Group();
  /** 手牌往桌上拖时的落点预览圈：拖动手势在 DOM 那边，这一组由 previewHandDrop 管 */
  private readonly hints = new THREE.Group();
  /**
   * 行棋点位那一圈单独一组：clearHandDrop 每次拖动结束都清空 hints，
   * 点位是选中态的东西，不该被手牌预览的清理顺手扫掉。
   */
  private readonly pointGroup = new THREE.Group();
  private readonly sprites = new THREE.Group();
  /** 灯罩与灯泡：俯视时挂在桌面正上方会挡视线，按相机高度收起 */
  private readonly lampVisual = new THREE.Group();
  /** 房间里的每盏灯与它本来的亮度：亮度滑杆按这个倍数缩放，收回滑杆就回到原始值 */
  private readonly lamps: { light: THREE.Light; base: number }[] = [];
  /** 主光单独留一份引用：换画质档时要改它的阴影贴图尺寸 */
  private keyLight: THREE.DirectionalLight | null = null;
  private bright = 1;
  private readonly groups = new Map<string, THREE.Group>();
  private readonly signatures = new Map<string, string>();
  private readonly ray = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane(UP, 0);
  private state: TableState | null = null;
  /** 当前观看者的客户端 id：决定谁的牌面要保密、哪些区域对自己上锁 */
  private viewer = "";
  /** 在线的客户端 id 集合；离线玩家的私有区域不再锁人，区域里的牌也就重新选得中 */
  private peers: Set<string> | null = null;
  /** 长按细看的计时：手指/鼠标按住不动才弹，挪一下就算拖拽 */
  private press: { id: string; x: number; y: number; timer: number } | null = null;
  /**
   * 落在空白处的一次按下：滑出去是平移画面，按住不动再拖是框选，
   * 三样都从这一笔里分出来，所以「没滑动就松手」只能等到 pointerup 才算点空白。
   */
  private blank: { x: number; y: number; moved: boolean; timer: number } | null = null;
  /** 长按空白处以后拖出来的框选矩形，用的是屏幕坐标（和 clientX/Y 同一把尺） */
  private marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private marqueeEl: HTMLDivElement | null = null;
  private altRotate = false;
  /** 顶栏那个开关：空手拖屏幕是转视角还是平移，本机说了算 */
  private orbit = false;
  private selection = new Set<string>();
  private drag: Drag | null = null;
  /** 界外落点由外面说了算：牌栏那块矩形在 React 那边，这里只负责问一句「这个点算不算」 */
  private zoneOf: ((x: number, y: number) => "hand" | null) | null = null;
  /** 当前这次拖拽正停在哪个界外落点上 */
  private zone: "hand" | null = null;
  /** 这一次拖动压在哪个容器口上（松手就把牌丢进去）与它头顶那圈高亮 */
  private dropIn: string | null = null;
  private boxHint: THREE.Mesh | null = null;
  /** 这一拖会吃掉的敌子头顶那几圈红的：吃一个一圈，一次拖几枚就几圈 */
  private takeHints: THREE.Object3D[] = [];
  /** 被将军的王脚下那一圈红的：跟着局面常驻，收放都由 setChecked 说了算 */
  private checkRing: THREE.Mesh | null = null;
  /** 行棋点位：由 setPoints 灌进来的这枚子走得进的格心，游标那一圈最大最亮 */
  private points: MovePoint[] = [];
  private pointId = "";
  private pointCursor = 0;
  private pointRings: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  /** 点在哪一个点位上就算落子：盘面的高度与格宽，决定投影平面和吸附半径 */
  private pointY = 0;
  private pointCell = 0;
  /** 按下去时指针压住了某个点位：没滑走就在松手那一下落子，滑走了照常拖动。连同当时那枚子一起记下来 */
  private tapPoint: { id: string; pt: MovePoint } | null = null;
  private tumbles: Tumble[] = [];
  /** 别人同步过来的移动在这里补间：位置瞬间跳变会让人以为牌被换掉了 */
  private glides = new Map<string, Glide>();
  /** 解锁与别人把东西挪走后的下坠：只有竖直方向走重力，水平位置照抄状态 */
  private falls = new Map<string, Fall>();
  /** 正在按甩动路径滑行的物件：走完之前不让状态补间把它们抢回去 */
  private slides = new Map<string, Slide>();
  /** 正在洗牌的牌堆，键是物件 id，值是已经走了多少秒：只动 group 里的每张牌，group 自己照旧归状态管 */
  private riffles = new Map<string, number>();
  /** 按住 Q/E/R/F 时的实时角度：状态还没提交就先照着显示 */
  private pose = new Map<string, { rot: number; tilt: number }>();
  /** 别人正在拖的牌，键是「谁|哪张」：帧到了只改目标，补间与过期都在 step 里收口 */
  private ghosts = new Map<string, Ghost>();
  /** 键同样是 `玩家|物件`：一个人一次拖动/选中里的每件东西各一个图标 */
  private readonly holds = new Map<string, Hold>();
  private dragSentAt = 0;
  private readonly labelFade = new Map<THREE.Sprite, number>();
  private lastAt = 0;
  private raf = 0;
  private host: HTMLElement | null = null;
  private camGoal: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  /** 哪一块屏交还给页面自己点：null = 桌上的手势一律归 WebGL */
  private touch: string | null = null;
  /** 进屏之前相机站在哪：退出就回到这里，免得把人从原来的视角甩走 */
  private camBack: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private offImages: (() => void) | null = null;
  /**
   * 平板屏面上那一层真播放器：CSS3D 的 DOM 永远盖在 WebGL 画布上面，压不进机身里，
   * 所以机身正对着镜头时才亮屏，背过去就收掉——不然它会浮在桌上所有东西前面。
   */
  private css: CSS3DRenderer | null = null;
  private readonly cssScene = new THREE.Scene();
  private readonly screens = new Map<string, Screen>();
  /** 这一帧有没有一块屏真的露着脸：全藏着的时候 CSS3D 那一层一笔都不用画 */
  private screensShown = false;
  private cssShown = false;
  /** 像素换世界单位：占位屏的网格已经按米做好，右边乘上 1/像素宽就正好贴满。每一档一份，换档只换这一张矩阵 */
  private readonly screenFits = new Map<number, THREE.Matrix4>();
  /** 放大观看那块浮层自己就是一个播放器，浮层在的时候桌上同一片就别再挂一份——两份一起解码，手机上直接卡死，声音还是两路 */
  private watchId: string | null = null;
  /** 触屏一律不挂弹幕层：那一层是播放器每帧重画的满屏画布，手机上最贵的一笔；桌面按原来的样子照旧 */
  private readonly danmaku = !COARSE_POINTER;
  private readonly onResize = () => this.resize();

  constructor(private events: TabletopEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.02, 40);
    this.camera.position.set(0, 1.12, 1.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.02, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    // 凑到卡牌前细看卡面：0.3 就把镜头怼到牌面上，再往前是贴得越近看得越清
    this.controls.minDistance = 0.08;
    this.controls.maxDistance = 3.2;
    this.controls.maxPolarAngle = 1.45;
    this.controls.screenSpacePanning = false;
    // 左键：空白处平移画面，物件上拖拽由本类接管；右键完整留给菜单，转视角交给中键或 Alt+左键
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
    // 两指默认只管捏合缩放与平移：转视角留给顶栏那两个开关，捏一下不该把桌子甩歪
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    setTextureAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
  }

  mount(host: HTMLElement) {
    this.host = host;
    host.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { display: "block", width: "100%", height: "100%", touchAction: "none" });
    // 播放器那层跟着画布铺满同一个宿主：整层默认不吃指针事件，抓桌子还是抓 WebGL；
    // 只有 setTouchScreen 点名的那一块屏例外（见 syncScreens），放大观看那块浮层不在这层里
    this.css = new CSS3DRenderer();
    Object.assign(this.css.domElement.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
    host.appendChild(this.css.domElement);
    this.buildWorld();
    this.resize();
    window.addEventListener("resize", this.onResize);
    const el = this.renderer.domElement;
    // 捕获阶段先于 OrbitControls 的 pointerdown，抓到物件时可以拦住它，避免同一次手势被平移接管
    host.addEventListener("pointerdown", this.onDown, true);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("dblclick", this.onDbl);
    el.addEventListener("contextmenu", this.onCtx);
    this.lastAt = 0;
    this.offImages = subscribeImages(() => {
      if (this.state) this.sync(this.state);
    });
    this.loop();
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    this.clearPress();
    this.clearBlankTimer();
    this.blank = null;
    this.marquee = null;
    this.marqueeEl?.remove();
    this.marqueeEl = null;
    for (const key of [...this.ghosts.keys()]) this.dropGhost(key);
    for (const key of [...this.holds.keys()]) this.dropHold(key);
    this.offImages?.();
    this.offImages = null;
    // 播放器要真关掉：detached 的 iframe 有些浏览器还在出声，先把地址导航走再摘掉
    for (const id of [...this.screens.keys()]) this.dropScreen(id);
    this.css?.domElement.remove();
    this.css = null;
    window.removeEventListener("resize", this.onResize);
    const el = this.renderer.domElement;
    this.host?.removeEventListener("pointerdown", this.onDown, true);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onUp);
    el.removeEventListener("dblclick", this.onDbl);
    el.removeEventListener("contextmenu", this.onCtx);
    this.controls.dispose();
    this.renderer.dispose();
    el.remove();
    this.host = null;
  }

  private buildWorld() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
    this.scene.background = gradientBackground();
    this.scene.fog = new THREE.Fog(0x0d1014, 3.4, 9);

    const { wood, felt } = tableMaterials();
    const tableW = TABLE.w + TABLE.rim * 2;
    const tableD = TABLE.d + TABLE.rim * 2;
    const top = new THREE.Mesh(new RoundedBoxGeometry(tableW, 0.05, tableD, 2, 0.012), wood);
    top.position.y = -0.025;
    top.castShadow = true;
    top.receiveShadow = true;
    this.world.add(top);

    const inlay = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.w, TABLE.d), felt);
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = FELT_Y;
    inlay.receiveShadow = true;
    this.world.add(inlay);

    // 围板：压着木沿起一圈边，桌面这才像家具有个框，也顺手盖住绒布的接缝
    const railMat = wood.clone();
    railMat.color = new THREE.Color(0.9, 0.83, 0.76);
    railMat.clearcoat = 0.62;
    railMat.envMapIntensity = 1.05;
    const railT = TABLE.rim - 0.002;
    const railH = 0.028;
    const railGeo: [number, number, number, number][] = [
      [tableW, railT, 0, -(tableD - railT) / 2],
      [tableW, railT, 0, (tableD - railT) / 2],
      [railT, tableD - railT * 2, -(tableW - railT) / 2, 0],
      [railT, tableD - railT * 2, (tableW - railT) / 2, 0],
    ];
    for (const [w, d, x, z] of railGeo) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(w, railH, d, 2, 0.0085), railMat);
      rail.position.set(x, railH / 2 - 0.006, z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.world.add(rail);
    }

    // 裙板：桌面底下收一圈，桌腿不再是凭空顶着一块板
    const skirtMat = wood.clone();
    skirtMat.color = new THREE.Color(0.66, 0.6, 0.56);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(tableW - 0.14, 0.1, tableD - 0.14), skirtMat);
    skirt.position.y = -0.1;
    skirt.castShadow = true;
    this.world.add(skirt);

    const legGeo = new THREE.CylinderGeometry(0.03, 0.046, 0.68, 16);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, skirtMat);
      leg.position.set(sx * (tableW / 2 - 0.13), -0.42, sz * (tableD / 2 - 0.13));
      leg.castShadow = true;
      this.world.add(leg);
    }

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 48),
      new THREE.MeshStandardMaterial({ color: 0x191d24, roughness: 0.94 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.77;
    floor.receiveShadow = true;
    this.world.add(floor);

    const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
    key.position.set(1.15, 2.5, 1.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.6;
    key.shadow.camera.far = 6;
    key.shadow.camera.left = -1.8;
    key.shadow.camera.right = 1.8;
    key.shadow.camera.top = 1.5;
    key.shadow.camera.bottom = -1.5;
    key.shadow.bias = -0.0006;
    key.shadow.radius = 3;
    this.world.add(key, key.target);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.4);
    fill.position.set(-1.6, 1.5, -1.1);
    this.world.add(fill);
    const hemi = new THREE.HemisphereLight(0xdce8ff, 0x2a2117, 0.32);
    this.world.add(hemi);

    const lamp = new THREE.PointLight(0xffe0b0, 4.6, 3.2, 2);
    lamp.position.set(0, 1.42, 0);
    this.world.add(lamp);
    this.lamps.push({ light: key, base: key.intensity }, { light: fill, base: fill.intensity }, { light: hemi, base: hemi.intensity }, { light: lamp, base: lamp.intensity });
    this.applyBright();
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.12, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
    );
    shade.position.set(0, 1.49, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9c4 }));
    bulb.position.set(0, 1.4, 0);
    this.lampVisual.add(shade, bulb);
    this.world.add(this.lampVisual);

    this.world.add(this.pieces, this.rings, this.peerRings, this.hands, this.hints, this.pointGroup, this.sprites);
    this.scene.add(this.world);
  }

  private resize() {
    if (!this.host) return;
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.css?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setSelection(ids: string[]) {
    this.selection = new Set(ids.filter((id) => {
      const o = this.state?.o.find((x) => x.id === id);
      return o ? !this.locked(o) : false;
    }));
    // 选中与否改变了牌的放大与抬高，光重画圈不够，得照新状态把变换重摆一遍
    if (this.state) this.sync(this.state);
    else this.drawRings();
  }

  /** 切换观看者：牌面保密与区域锁按新人重算，清掉签名让受影响的网格重建 */
  setViewer(id: string) {
    if (this.viewer === id) return;
    this.viewer = id;
    this.signatures.clear();
    this.selection = new Set([...this.selection].filter((sid) => {
      const o = this.state?.o.find((x) => x.id === sid);
      return o ? !this.locked(o) : false;
    }));
    if (this.state) this.sync(this.state);
    else this.drawRings();
  }

  /** 在线名单变了：离线玩家的私有区域要当场解开，不然牌会永远选不中 */
  setPeers(present?: Set<string> | null) {
    const next = present && present.size ? present : null;
    const cur = this.peers;
    if (cur === next || (cur && next && cur.size === next.size && [...next].every((id) => cur.has(id)))) return;
    this.peers = next;
    this.signatures.clear();
    if (this.state) this.sync(this.state);
    else this.drawRings();
  }

  /** 这个物件对当前观看者是否上了锁：别人开着隐私模式、而且人还在线的区域才锁得住 */
  private locked(o: GameObject): boolean {
    return !!this.state && lockedOut(o, this.state, this.viewer, this.peers ?? undefined);
  }

  /** 交给外面一个「这个屏幕点算不算牌栏」的判据：拖桌上的牌时靠它决定要不要收进手里 */
  setDropZone(fn: ((x: number, y: number) => "hand" | null) | null) {
    this.zoneOf = fn;
  }

  /**
   * 这一拖收不收进手：整把都是牌才算。手牌条只画 kind=card，
   * 混着骰子一起收就等于把骰子变没，所以宁可照常按移动处理。
   */
  private handReady(ids: string[]): boolean {
    const st = this.state;
    if (!st || !ids.length) return false;
    return ids.every((id) => st.o.find((o) => o.id === id)?.kind === "card");
  }

  /** 屏幕上的一个点 → 桌面上的落点；拖出画布视口就没有交点。盘面比桌布高，点位要按盘面的高度投 */
  private planePoint(clientX: number, clientY: number, y = FELT_Y): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    this.pointer.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    return this.groundPoint(y);
  }

  /**
   * 手牌往桌上拖：把指针这个屏幕点换算成桌面落点，并在落点摆一个预览圈。
   * 圈用的是提交那套 resolveDrop，所以松手后牌不会从圈上跳开；指针还在桌面外就收掉圈回 null。
   */
  previewHandDrop(id: string, clientX: number, clientY: number): { x: number; z: number } | null {
    const at = this.planePoint(clientX, clientY);
    const state = this.state;
    if (!at || !state) {
      this.clearHandDrop();
      return null;
    }
    const [move] = resolveDrop(state, [{ id, x: at.x, z: at.z }]);
    if (!move) {
      this.clearHandDrop();
      return null;
    }
    const o = state.o.find((x) => x.id === id);
    this.clearHandDrop();
    const ghost = landingFrame(o ? outlineOf(o) : { w: 0.063, d: 0.09, r: 0.006 });
    ghost.position.set(move.x, surfaceY(state, move.x, move.z) + 0.0014, move.z);
    this.hints.add(ghost);
    return { x: move.x, z: move.z };
  }

  /** 手牌拖动结束（松手或取消）：预览圈立刻收掉，别留在桌上装成一张牌（盒口那圈与将军那圈自己管自己） */
  clearHandDrop() {
    for (const c of [...this.hints.children]) if (c !== this.boxHint && c !== this.checkRing && !this.takeHints.includes(c)) this.hints.remove(c);
  }

  /**
   * 这一拖是不是要丢进容器：手上全是牌、落点压在某个容器口上、那张嘴还装得下。
   * 预览与松手问的是同一个判据，所以圈亮在哪个盒上就是丢进哪个盒。
   */
  private boxUnder(drag: Drag, at: { x: number; z: number }): GameObject | null {
    const state = this.state;
    if (!state || drag.rigid) return null;
    let n = 0;
    for (const id of drag.ids) {
      const o = state.o.find((x) => x.id === id);
      if (!o || o.kind !== "card" || !o.card) return null;
      n += 1;
    }
    const box = containerAt(state, at.x, at.z, drag.ids);
    if (!box) return null;
    return (box.pile?.length ?? 0) + n <= MAX_PILE ? box : null;
  }

  /** 盒口那一圈高亮：颜色照容器自己，常驻一圈只是亮起来或收下去 */
  private showBoxHint(box: GameObject | null) {
    this.dropIn = box?.id ?? null;
    const state = this.state;
    if (!this.boxHint) {
      if (!box || !state) return;
      this.boxHint = peerRing(0x9fd8ff);
      this.hints.add(this.boxHint);
    }
    const ring = this.boxHint as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    if (!box || !state) {
      ring.visible = false;
      return;
    }
    ring.visible = true;
    ring.material.color.set(parseInt((box.color ?? "").slice(1), 16) || 0x9fd8ff);
    ring.scale.setScalar(Math.max(0.5, (footprintOf(box) * 1.5) / RING_R));
    ring.position.set(box.x, baseY(state, box) + boxOf(box).h + 0.002, box.z);
  }

  /**
   * 踩子即吃的红圈：这一拖真会吃掉的那枚子，圈在它脚上。
   * 判据就是松手后归约用的 capturesOf，所以圈住谁、松手就没的就是谁。
   */
  private showTakeHints(preys: GameObject[]) {
    const state = this.state;
    while (this.takeHints.length > preys.length) this.hints.remove(this.takeHints.pop()!);
    if (!state) return;
    for (let i = 0; i < preys.length; i++) {
      let ring = this.takeHints[i];
      if (!ring) {
        ring = peerRing(0xff6b57);
        this.takeHints.push(ring);
        this.hints.add(ring);
      }
      const prey = preys[i];
      ring.scale.setScalar(Math.max(0.6, (footprintOf(prey) * 1.2) / RING_R));
      ring.position.set(prey.x, baseY(state, prey) + 0.0022, prey.z);
    }
  }

  /**
   * 被将军的那枚王脚下一圈红：判据就是界面横幅用的 judge，亮在谁脚下谁就真的被将着了。
   * 吃子那一圈红跟着拖动走，这一圈跟着局面常驻，所以各留一圈、互不占用。
   */
  setChecked(k: { o: GameObject; x: number; z: number } | null) {
    const state = this.state;
    if (!k || !state) {
      if (this.checkRing) this.hints.remove(this.checkRing);
      this.checkRing = null;
      return;
    }
    if (!this.checkRing) {
      this.checkRing = peerRing(0xff4d42);
      this.hints.add(this.checkRing);
    }
    this.checkRing.scale.setScalar(Math.max(0.8, (footprintOf(k.o) * 1.7) / RING_R));
    this.checkRing.position.set(k.x, baseY(state, k.o) + 0.0026, k.z);
  }

  /**
   * 行棋点位：把这枚子走得进的格心点亮。圈摆不摆得出来全看外面算的 pointsOf，
   * 这里只负责画与点——点位本身不参与拾取，点哪一格靠 planeUnder 往盘面上投影就近算。
   */
  setPoints(id: string, pts: MovePoint[], cursor: number) {
    const state = this.state;
    this.pointId = pts.length ? id : "";
    this.points = pts;
    this.pointCursor = pts.length ? ((cursor % pts.length) + pts.length) % pts.length : 0;
    this.pointCell = pts.length && state ? this.boardCell(state, pts[0]) : 0;
    this.pointY = pts.length && state ? surfaceY(state, pts[0].x, pts[0].z) : 0;
    this.drawPoints(state);
  }

  /** 换选中、落子、撤销之后点位就作废了：连带那次没滑走的按下一起收掉 */
  clearPoints() {
    this.points = [];
    this.pointId = "";
    this.pointCursor = 0;
    this.pointCell = 0;
    this.tapPoint = null;
    this.drawPoints(this.state);
  }

  private drawPoints(state: TableState | null) {
    while (this.pointRings.length > this.points.length) this.pointGroup.remove(this.pointRings.pop()!);
    if (!state) return;
    for (let i = 0; i < this.points.length; i++) {
      let ring = this.pointRings[i];
      if (!ring) {
        ring = peerRing(0x7fe3b0);
        this.pointRings.push(ring);
        this.pointGroup.add(ring);
      }
      const p = this.points[i];
      const on = i === this.pointCursor;
      ring.material.color.setHex(p.take ? 0xff6b57 : 0x7fe3b0);
      ring.material.opacity = on ? 0.95 : 0.5;
      // 吃子那一格站着敌子：圈比子小就会被它盖住，等于没点亮，所以可吃的圈一律画得比子大一圈
      ring.scale.setScalar((this.pointCell * (p.take ? (on ? 0.66 : 0.56) : (on ? 0.44 : 0.3))) / RING_R);
      ring.position.set(p.x, this.pointY + (on ? 0.0028 : 0.002), p.z);
    }
  }

  /** 这一格的边长：点位圈要按格宽来画，吸附半径也要它来定 */
  private boardCell(state: TableState, pt: MovePoint): number {
    const b = state.o.find((o) => o.kind === "board" && o.board && onBoard(o, pt.x, pt.z));
    return b?.board?.cell ?? 0.058;
  }

  /**
   * 屏幕上的这一按压住了哪个点位：点位圈只是画出来的，不参与拾取，
   * 所以把屏幕点投到盘面那一个平面上，再取最近的一个。
   */
  private pointUnder(clientX: number, clientY: number): MovePoint | null {
    const state = this.state;
    if (!state || !this.points.length || !this.pointCell) return null;
    const at = this.planePoint(clientX, clientY, this.pointY);
    if (!at) return null;
    const r = this.pointCell * 0.6;
    let best: MovePoint | null = null;
    let d = r;
    for (const p of this.points) {
      const q = Math.hypot(p.x - at.x, p.z - at.z);
      if (q < d) {
        d = q;
        best = p;
      }
    }
    return best;
  }

  /**
   * 点一下即落子：和拖动松手走的是同一份 resolveDrop，所以点出来的落点、
   * 踩子即吃、挤开旁人都跟手拖过去一模一样，不可能落到两处。
   */
  private placeAtPoint(id: string, pt: MovePoint): boolean {
    const state = this.state;
    if (!state || !id) return false;
    const [m] = resolveDrop(state, [{ id, x: pt.x, z: pt.z }]);
    if (!m) return false;
    this.clearPoints();
    this.events.onCommit([m], false);
    return true;
  }

  sync(state: TableState) {
    // 洗牌动画要拿「上一版的顺序」来比，所以旧桌面得先握在手里，别被下面这句换掉
    const prev = this.state;
    this.state = state;
    const keys: string[] = [];
    for (const o of state.o) {
      if (o.card?.img) keys.push(o.card.img);
      if (o.board?.img) keys.push(o.board.img);
      if (o.backImg) keys.push(o.backImg);
      const top = o.pile?.at(-1);
      if (top?.img) keys.push(top.img);
    }
    // 整桌一次报全：进度条的「总数」就以这份为准，别处零散要图不算数
    requestImages(keys, "table");
    const dragging = this.drag;
    for (const o of state.o) {
      // 手牌只在自己的手牌条里显示，不上桌
      if (o.hand) continue;
      const hidden = faceHidden(o, state, this.viewer, this.peers ?? undefined);
      // 统计垫上的牌数是当场数出来的：牌一挪动网格就要跟着重画
      const tally = o.kind === "stat" ? statCards(state, o) : null;
      const sig = objectSignature(o, hidden) + (tally ? `|${tally.up}:${tally.side}` : "");
      let g = this.groups.get(o.id);
      const fresh = !g || this.signatures.get(o.id) !== sig;
      if (g && this.signatures.get(o.id) !== sig) {
        this.pieces.remove(g);
        this.groups.delete(o.id);
        g = undefined;
      }
      if (!g) {
        g = buildPiece(o, hidden, tally ?? undefined);
        g.userData.radius = footprintOf(o);
        this.pieces.add(g);
        this.groups.set(o.id, g);
        this.signatures.set(o.id, sig);
      }
      const floor = o.kind === "board" ? 0 : floorY(state, o);
      // 桌面上的选中只有圈，没有放大：牌立在原地就是它本来的样子，放大留给手里的牌
      const resting = o.kind === "board" ? 0 : baseY(state, o);
      g.userData.base = resting;
      g.userData.floor = floor;
      g.userData.obj = o;
      const scale = o.kind === "board" ? 1 : scaleOf(o);
      if (g.scale.x !== scale) g.scale.setScalar(scale);
      g.userData.radius = footprintOf(o);
      if (dragging?.ids.includes(o.id)) continue;
      const held = this.pose.get(o.id);
      this.place(g, o.id, o.x, o.z, resting, held?.rot ?? o.rot, held?.tilt ?? o.tilt ?? 0, fresh);
    }
    // 洗牌动画：同一叠牌、只是顺序换了就走一遍。本地提交和别人同步过来的桌面都从这一条路过，不必多一条协议
    if (prev && prev !== state) {
      const was = new Map(prev.o.map((o) => [o.id, o] as const));
      for (const o of state.o) {
        if (o.kind !== "pile" || (o.pile?.length ?? 0) < 2) continue;
        const before = was.get(o.id);
        if (before?.kind === "pile" && sameCardsReordered(before.pile, o.pile)) this.riffles.set(o.id, 0);
      }
    }
    const ids = new Set(state.o.filter((o) => !o.hand).map((o) => o.id));
    for (const [id, g] of this.groups) {
      if (ids.has(id)) continue;
      this.pieces.remove(g);
      this.groups.delete(id);
      this.signatures.delete(id);
      this.glides.delete(id);
      this.falls.delete(id);
      this.slides.delete(id);
      this.riffles.delete(id);
      this.pose.delete(id);
    }
    // 权威桌面一到位，对应的拖动预览圈就没意义了：牌被拿走或已经落到那一格就当场收掉
    // 收圈不收手：他还按着这件东西，小手要等松手或选中的那把换掉才走
    for (const [key, gh] of this.ghosts) {
      const o = state.o.find((x) => x.id === gh.id);
      if (!o || (Math.abs(o.x - gh.tx) < 0.002 && Math.abs(o.z - gh.tz) < 0.002)) this.dropRing(key);
    }
    this.drawRings();
  }

  /** 对齐到状态里的位置：挪得远的补间过去，贴面的小调整直接落位，从高到低改走下坠 */
  private place(g: THREE.Object3D, id: string, x: number, z: number, base: number, rot: number, tilt: number, instant: boolean) {
    const yaw = THREE.MathUtils.degToRad(rot);
    const pitch = THREE.MathUtils.degToRad(tilt);
    const cur = g.position;
    // 甩出去的东西自己走自己的路径，状态补间插手只会把它半路拽停
    if (this.slides.has(id)) return;
    const busy = this.tumbles.some((t) => t.id === id);
    const falling = this.falls.has(id);
    // 掉下来不是补间：水平位置照抄状态，竖直交给重力，解锁那一下才有重量感
    if (!busy && !falling && !instant && base < cur.y - 0.006) {
      this.glides.delete(id);
      cur.set(x, cur.y, z);
      g.rotation.y = yaw;
      g.rotation.x = pitch;
      this.falls.set(id, { g, y: cur.y, vy: 0, floor: base, bounces: 0, ...bounceOf(g.userData.obj) });
      return;
    }
    if (instant || busy || falling) {
      this.glides.delete(id);
      cur.set(x, falling ? cur.y : base, z);
      g.rotation.y = yaw;
      g.rotation.x = pitch;
      return;
    }
    const dist = Math.hypot(x - cur.x, z - cur.z);
    const spin = shortAngle(yaw - g.rotation.y);
    const lean = shortAngle(pitch - g.rotation.x);
    if (dist < 0.006 && Math.abs(base - cur.y) < 0.0006 && Math.abs(spin) < 0.01 && Math.abs(lean) < 0.004) {
      this.glides.delete(id);
      cur.set(x, base, z);
      g.rotation.y = yaw;
      g.rotation.x = pitch;
      return;
    }
    this.glides.set(id, {
      g,
      x0: cur.x, y0: cur.y, z0: cur.z, r0: g.rotation.y, t0: g.rotation.x,
      x1: x, y1: base, z1: z, r1: g.rotation.y + spin, t1: g.rotation.x + lean,
      t: 0,
      dur: Math.min(0.42, 0.1 + dist * 1.6),
    });
  }

  /** 按住调节角度时的实时姿态：状态提交前先照这个显示，松手提交后自然对齐 */
  previewPose(at: { id: string; rot: number; tilt: number }[]) {
    for (const p of at) {
      const g = this.groups.get(p.id);
      if (!g) continue;
      this.pose.set(p.id, { rot: p.rot, tilt: p.tilt });
      g.rotation.y = THREE.MathUtils.degToRad(p.rot);
      g.rotation.x = THREE.MathUtils.degToRad(p.tilt);
      // 俯仰绕的是底面中心，斜下去的那条边要靠抬高基点躲开桌布
      const o = g.userData.obj as GameObject | undefined;
      const floor = g.userData.floor as number | undefined;
      if (o && floor !== undefined) g.position.y = floor + liftFor(o, p.tilt);
      this.glides.delete(p.id);
    }
    this.drawRings();
  }

  /** 清掉实时姿态：提交动作先派出去，这里只负责不再覆盖状态里的角度 */
  clearPose() {
    this.pose.clear();
    this.drawRings();
  }

  /** 收到别人拖动途中的一帧位置：画成会过期的预览圈，权威桌面到了再由补间接手 */
  peerDrag(mark: DragMark) {
    if (!this.state) return;
    const now = performance.now();
    if (mark.s === "pick") {
      this.peerPick(mark, now);
      return;
    }
    for (const mv of mark.m) {
      const o = this.state.o.find((x) => x.id === mv.id);
      if (!o) continue;
      const key = `${mark.by}|${mv.id}`;
      let ghost = this.ghosts.get(key);
      if (!ghost) {
        const mesh = peerRing(parseInt(mark.color.slice(1), 16) || 0xc8443c);
        this.peerRings.add(mesh);
        ghost = { mesh, mat: mesh.material, by: mark.by, id: mv.id, x: mv.x, z: mv.z, tx: mv.x, tz: mv.z, until: now + GHOST_MS };
        this.ghosts.set(key, ghost);
      }
      ghost.tx = mv.x;
      ghost.tz = mv.z;
      ghost.until = now + GHOST_MS;
      ghost.mesh.scale.setScalar(Math.max(0.6, (footprintOf(o) ?? 0.03) / RING_R));
      this.hold(mark, mv.id, now, true);
    }
  }

  /**
   * 收到别人「选中了哪几件」：这一把整份替换，被取消的那几件当场收掉图标。
   * 只画小手不画幽灵圈——没在拖的东西摆在原地，画一圈反而像有人按住了它。
   */
  private peerPick(mark: DragMark, now: number) {
    const kept = new Set(mark.m.map((mv) => mv.id));
    for (const [key, hd] of [...this.holds]) {
      if (hd.by !== mark.by || hd.drag || kept.has(hd.id)) continue;
      this.dropHold(key);
    }
    for (const mv of mark.m) this.hold(mark, mv.id, now, false);
  }

  private hold(mark: DragMark, id: string, now: number, drag: boolean) {
    const o = this.state?.o.find((x) => x.id === id);
    if (!o) return;
    const key = `${mark.by}|${id}`;
    let hd = this.holds.get(key);
    if (!hd) {
      const mat = new THREE.SpriteMaterial({ map: handBadgeTexture(mark.color), transparent: true, depthWrite: false, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      // 小手要压过牌面与骰子，但它是提示不是物件：不参与拾取
      sprite.renderOrder = 24;
      this.hands.add(sprite);
      hd = { sprite, by: mark.by, id, drag, until: now };
      this.holds.set(key, hd);
    }
    hd.drag = drag;
    hd.until = now + (drag ? GHOST_MS : PICK_MS);
  }

  private dropHold(key: string) {
    const hd = this.holds.get(key);
    if (!hd) return;
    this.hands.remove(hd.sprite);
    hd.sprite.material.dispose();
    this.holds.delete(key);
  }

  private dropRing(key: string) {
    const gh = this.ghosts.get(key);
    if (!gh) return;
    this.peerRings.remove(gh.mesh);
    gh.mat.dispose();
    this.ghosts.delete(key);
  }

  /** 幽灵圈与小手是一对：圈没了说明这只手也松开了 */
  private dropGhost(key: string) {
    this.dropRing(key);
    this.dropHold(key);
  }

  /** 让某颗骰子重放掷骰表现 */
  roll(id: string, spread = 1) {
    const o = this.state?.o.find((x) => x.id === id);
    if (o?.kind === "die") this.tumble(o, o.value ?? 1, false, spread);
  }

  private drawRings() {
    while (this.rings.children.length) this.rings.remove(this.rings.children[0]);
    if (!this.state) return;
    for (const o of this.state.o) {
      if (!this.selection.has(o.id)) continue;
      const g = this.groups.get(o.id);
      if (!g) continue;
      const frame = selectionFrame(outlineOf(o));
      const rot = THREE.MathUtils.degToRad(this.pose.get(o.id)?.rot ?? o.rot);
      frame.rotation.z = rot;
      // 箭头从原点沿朝向铺开，框要跟着挪到几何中心
      const off = o.kind === "arrow" ? (o.len ?? 0.3) / 2 : 0;
      // 棋盘的网格底在桌面上，选中框要抬到棋盘面上才看得见；斜牌的基点被抬高了，框仍要贴着桌面
      const y = o.kind === "board" ? surfaceY(this.state, o.x, o.z) + 0.002 : (g.userData.floor ?? g.userData.base ?? 0) + 0.0018;
      frame.position.set(g.position.x + Math.cos(rot) * off, y, g.position.z - Math.sin(rot) * off);
      this.rings.add(frame);
      // 锁着的物件脚下再投影一圈：解锁后它会掉到这里，叠高时心里有数
      if (o.pin && o.kind !== "board" && o.kind !== "zone") {
        const ghost = landingFrame(outlineOf(o));
        ghost.rotation.z = rot;
        ghost.position.set(g.position.x + Math.cos(rot) * off, surfaceY(this.state, o.x, o.z) + 0.0012, g.position.z - Math.sin(rot) * off);
        this.rings.add(ghost);
      }
    }
  }

  // —— 指针交互 ————————————————————————————————

  private setPointer(event: MouseEvent | PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
  }

  /** 最近一次 pick() 是否精确点到了计算器的某个键；像素容差救回来的不算 */
  private hitKey: string | null = null;
  /** 最近一次 pick() 是否点到了锁定垫子（统计垫与桌垫）角上的解锁按钮 */
  private hitUnlock: string | null = null;
  /** 最近一次 pick() 是否点到了迷你计数器顶上的 ± 键帽；与 hitKey 分开，两种键含义不同 */
  private hitCounterKey: string | null = null;

  private pick(): string | null {
    if (!this.state) return null;
    this.hitKey = null;
    this.hitUnlock = null;
    this.hitCounterKey = null;
    this.ray.setFromCamera(this.pointer, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const g of this.groups.values()) meshes.push(...g.children);
    const hits = this.ray.intersectObjects(meshes, false);
    for (const h of hits) {
      // 解锁按钮排在上层：垫子本身锁着，射线到它这里就等于点中了按钮
      const unlock = h.object.userData.unlock as string | undefined;
      if (unlock) {
        this.hitUnlock = unlock;
        return null;
      }
      const id = (h.object.userData.id ?? (h.object.parent as THREE.Object3D)?.userData.id) as string | undefined;
      if (!id) continue;
      const o = this.state.o.find((x) => x.id === id);
      // 别人锁着的区域当作不存在：射线穿过去摸到下面的东西
      if (!o || this.locked(o)) continue;
      const key = h.object.userData.calcKey as string | undefined;
      if (key && o.kind === "calc") this.hitKey = key;
      const ckey = h.object.userData.counterKey as string | undefined;
      if (ckey && o.kind === "counter") this.hitCounterKey = ckey;
      return id;
    }
    return this.pickNearby();
  }

  /**
   * 网格没点中也算命中：在屏幕上按像素距离找最近的那个。
   * 骰子和棋子在桌面上只有几个像素大，光靠射线点中太难，这一层专门用来救小物件。
   */
  private pickNearby(): string | null {
    if (!this.state || !this.groups.size) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = (this.pointer.x * 0.5 + 0.5) * rect.width;
    const py = (-this.pointer.y * 0.5 + 0.5) * rect.height;
    const at = new THREE.Vector3();
    const hits: { id: string; d: number; top: number }[] = [];
    for (let i = 0; i < this.state.o.length; i++) {
      const o = this.state.o[i];
      const g = this.groups.get(o.id);
      // 棋盘又宽又平，射线扫得到，不必再给像素容差（不然空白处永远点不干净）
      if (!g || o.hand || o.kind === "board" || this.locked(o)) continue;
      const span = footprintOf(o) * (o.kind === "zone" ? 0.2 : 1);
      at.set(g.position.x, g.userData.base ?? 0, g.position.z).project(this.camera);
      if (at.z > 1) continue;
      const sx = (at.x * 0.5 + 0.5) * rect.width;
      const sy = (-at.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      let r = 15;
      if (span > 0) {
        at.set(g.position.x + span, g.userData.base ?? 0, g.position.z).project(this.camera);
        r = Math.max(r, Math.abs((at.x * 0.5 + 0.5) * rect.width - sx) * 1.15);
      }
      if (d > Math.min(46, r)) continue;
      // 摞在一起的东西中心几乎重影：拿层数和高度当第二把尺，才不至于摸到最底下那张
      hits.push({ id: o.id, d, top: (o.layer ?? 0) * 100 + (g.userData.base ?? 0) * 1000 + i });
    }
    if (!hits.length) return null;
    hits.sort((a, b) => a.d - b.d);
    let take = hits[0];
    for (const h of hits) {
      if (h.d > take.d + 6) break;
      if (h.top > take.top) take = h;
    }
    return take.id;
  }

  private groundPoint(y: number): THREE.Vector3 | null {
    this.ray.setFromCamera(this.pointer, this.camera);
    this.plane.set(UP, -y);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, out) ? out : null;
  }

  /** 按住一张牌（或一摞牌）不动就细看它当前朝上的那一面 */
  private armPress(obj: GameObject, x: number, y: number) {
    this.clearPress();
    if (!obj.card && !Array.isArray(obj.pile)) return;
    const id = obj.id;
    const timer = window.setTimeout(() => {
      this.press = null;
      // 长按只是看一眼：把这次拖拽掐掉，免得松手时牌被挪了位
      this.drag = null;
      this.events.onInspect(id);
    }, LONG_PRESS_MS);
    this.press = { id, x, y, timer };
  }

  private clearPress() {
    if (!this.press) return;
    clearTimeout(this.press.timer);
    this.press = null;
  }

  /** 空白处按下：先让 OrbitControls 平移，按住不动满 LONG_PRESS_MS 就转成框选 */
  private armBlank(x: number, y: number) {
    this.clearBlankTimer();
    this.blank = { x, y, moved: false, timer: 0 };
    this.blank.timer = window.setTimeout(() => {
      if (!this.blank) return;
      this.blank.timer = 0;
      this.startMarquee(this.blank.x, this.blank.y);
    }, LONG_PRESS_MS);
  }

  private clearBlankTimer() {
    if (!this.blank?.timer) return;
    clearTimeout(this.blank.timer);
    this.blank.timer = 0;
  }

  private startMarquee(x: number, y: number) {
    // 轻轻一震当作「框选接管了这一笔」的回执：手机上没有鼠标框，看不见起手会不会画框
    navigator.vibrate?.(14);
    if (!this.marqueeEl) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "fixed",
        zIndex: "60",
        pointerEvents: "none",
        border: "1px solid rgba(255,255,255,.72)",
        background: "rgba(255,255,255,.12)",
        borderRadius: "3px",
      });
      document.body.appendChild(el);
      this.marqueeEl = el;
    }
    // 框选期间把镜头让开：同一只手不能又平移画面又画框
    this.controls.enabled = false;
    this.marquee = { x0: x, y0: y, x1: x, y1: y };
    this.paintMarquee();
  }

  private paintMarquee() {
    const m = this.marquee;
    const el = this.marqueeEl;
    if (!m || !el) return;
    Object.assign(el.style, {
      left: `${Math.min(m.x0, m.x1)}px`,
      top: `${Math.min(m.y0, m.y1)}px`,
      width: `${Math.abs(m.x1 - m.x0)}px`,
      height: `${Math.abs(m.y1 - m.y0)}px`,
    });
  }

  private finishMarquee() {
    const m = this.marquee;
    this.marquee = null;
    this.marqueeEl?.remove();
    this.marqueeEl = null;
    this.blank = null;
    this.controls.enabled = true;
    if (!m || !this.state) return;
    const x0 = Math.min(m.x0, m.x1);
    const x1 = Math.max(m.x0, m.x1);
    const y0 = Math.min(m.y0, m.y1);
    const y1 = Math.max(m.y0, m.y1);
    // 按住却没拖开：这么小的框不算框选，按「点空白」处理，不然一次误触就把整桌圈走了
    if (x1 - x0 < 14 || y1 - y0 < 14) {
      this.events.onBlank();
      return;
    }
    const ids = this.inRect(x0, y0, x1, y1);
    this.events.onSelect(ids, false);
    if (ids.length) this.events.onContext(null, { x: m.x1, y: m.y1 });
  }

  /** 屏幕矩形圈住了谁：拿各物件中心的投影点算，锁住的和棋盘本身不进圈 */
  private inRect(rx0: number, ry0: number, rx1: number, ry1: number): string[] {
    if (!this.state) return [];
    const rect = this.renderer.domElement.getBoundingClientRect();
    const out: string[] = [];
    for (const o of this.state.o) {
      if (o.hand || o.kind === "board" || this.locked(o)) continue;
      const g = this.groups.get(o.id);
      if (!g) continue;
      SCRATCH_V.set(g.position.x, (g.userData.base as number | undefined) ?? 0, g.position.z).project(this.camera);
      if (SCRATCH_V.z > 1) continue;
      const sx = rect.left + (SCRATCH_V.x * 0.5 + 0.5) * rect.width;
      const sy = rect.top + (-SCRATCH_V.y * 0.5 + 0.5) * rect.height;
      if (sx >= rx0 && sx <= rx1 && sy >= ry0 && sy <= ry1) out.push(o.id);
    }
    return out.slice(0, 80);
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // 没有中键的鼠标/触控板：Alt+左键当转视角用，这一笔不碰物件
    if (e.altKey) {
      this.altRotate = true;
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      return;
    }
    this.setPointer(e);
    const id = this.pick();
    // 锁定垫子角上的解锁按钮：这一笔只是解锁，既不选它也拖不动
    const unlock = this.hitUnlock;
    if (unlock) {
      e.stopPropagation();
      this.events.onUnlock(unlock);
      return;
    }
    const obj = id && this.state ? this.state.o.find((o) => o.id === id) : undefined;
    // 压在某个点位圈上：点位只是画出来的，敌子那一格照样拾得到敌子，所以先记下这一压，
    // 松手时没滑走就算落子，滑走了照常拖动/平移，两者不打架。
    const pt = this.pointUnder(e.clientX, e.clientY);
    this.tapPoint = pt && this.pointId ? { id: this.pointId, pt } : null;
    if (!obj || !this.state) {
      // 空白处交给 OrbitControls：左键平移画面。同时留意这一笔到底是不是「点一下」——
      // 取消选中要等到松手才定，滑出去的那一下只是挪画面
      this.clearPress();
      this.armBlank(e.clientX, e.clientY);
      return;
    }
    this.armPress(obj, e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    // 棋盘要先单独点一下选中才允许搬：不然在棋盘面上起手就是拖棋盘，画面再也平移不动
    if (obj.kind === "board" && !this.selection.has(obj.id)) {
      this.events.onSelect([obj.id], additive);
      return;
    }
    // 按计算器的键：这一笔就是按一下，既不拖也不转镜头
    const key = this.hitKey;
    if (key && obj.kind === "calc") {
      e.stopPropagation();
      if (!this.selection.has(obj.id)) this.events.onSelect([obj.id], false);
      this.events.onCalcKey(obj.id, key);
      return;
    }
    // 按迷你计数器的 ± 键：跟计算器同一个口径，这一笔只是按一下，不拖不转镜头
    const ckey = this.hitCounterKey;
    if (ckey && obj.kind === "counter") {
      e.stopPropagation();
      if (!this.selection.has(obj.id)) this.events.onSelect([obj.id], false);
      this.events.onCounterKey(obj.id, ckey);
      return;
    }
    // 抓到物件：本次手势由这里接管，不让相机平移同时抢走
    e.stopPropagation();
    let ids = this.selection;
    if (additive) {
      const next = new Set(this.selection);
      if (next.has(obj.id)) next.delete(obj.id);
      else next.add(obj.id);
      this.events.onSelect([...next], true);
      ids = next;
    } else if (!this.selection.has(obj.id)) {
      this.events.onSelect([obj.id], false);
      ids = new Set([obj.id]);
    }
    const movable = [...ids].filter((x) => {
      const o = this.state!.o.find((y) => y.id === x);
      return o && !this.locked(o);
    });
    // 拖区域垫时把圈里的东西一起带走：归属靠几何位置维持，不搬就会留下错位的牌
    if (obj.kind === "zone") {
      for (const o of this.state.o) {
        if (movable.includes(o.id) || o.kind === "board" || o.hand) continue;
        if (inZone(obj, o.x, o.z) && !this.locked(o)) movable.push(o.id);
      }
    }
    // 卡槽带也一样：摊在格子里的牌跟着带子走，挪个位置不用重新摆一遍
    if (obj.kind === "slot") {
      for (const id of slotCards(this.state, obj)) {
        const o = this.state.o.find((x) => x.id === id);
        if (o && !movable.includes(o.id) && !this.locked(o)) movable.push(id);
      }
    }
    // 骰盘：盘里停着的骰子跟着盘子一起走，端起来不会撒一桌
    if (obj.kind === "tray") {
      for (const id of diceInTray(this.state, obj)) {
        const o = this.state.o.find((x) => x.id === id);
        if (o && !movable.includes(o.id) && !this.locked(o)) movable.push(id);
      }
    }
    // 吸在牌边上的计数器跟着宿主走：选了哪几张牌，牌上挂着的计数器一并拎起来
    for (const o of this.state.o) {
      if (o.kind !== "counter" || !o.counter?.host || movable.includes(o.id) || this.locked(o)) continue;
      if (movable.includes(o.counter.host)) movable.push(o.id);
    }
    // 搬棋盘与拖贴面垫是刚性平移：圈上的东西照原样跟着走，谁也不许被重新甩一遍落点
    const rigid = obj.kind === "board" || obj.kind === "zone" || obj.kind === "slot" || obj.kind === "track" || obj.kind === "tray";
    if (obj.kind === "board" && obj.board) {
      for (const o of this.state.o) {
        if (movable.includes(o.id) || o.kind === "board" || o.hand) continue;
        if (onBoard(obj, o.x, o.z) && !this.locked(o)) movable.push(o.id);
      }
    }
    if (!movable.includes(obj.id) || this.tumbles.some((t) => movable.includes(t.id))) return;
    const base = this.groups.get(obj.id)?.userData.base ?? 0;
    const gp = this.groundPoint(base);
    if (!gp) return;
    const origin = new Map<string, { x: number; z: number }>();
    const live = new Map<string, { x: number; z: number }>();
    const bases = new Map<string, number>();
    const rots = new Map<string, number>();
    for (const x of movable) {
      const o = this.state.o.find((y) => y.id === x)!;
      origin.set(x, { x: o.x, z: o.z });
      live.set(x, { x: o.x, z: o.z });
      bases.set(x, o.kind === "board" ? 0 : baseY(this.state, o));
      rots.set(x, o.rot || 0);
    }
    this.drag = {
      ids: movable,
      origin,
      anchor: obj.id,
      offset: { x: obj.x - gp.x, z: obj.z - gp.z },
      base,
      moved: false,
      live,
      bases,
      rots,
      rigid,
      hist: [{ t: performance.now(), x: obj.x, z: obj.z }],
    };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (this.marquee) {
      this.marquee = { ...this.marquee, x1: e.clientX, y1: e.clientY };
      this.paintMarquee();
      return;
    }
    if (this.blank && Math.hypot(e.clientX - this.blank.x, e.clientY - this.blank.y) > LONG_PRESS_SLOP) {
      // 滑出去了就是平移画面，既不框选也不算「点空白」
      this.blank.moved = true;
      this.clearBlankTimer();
    }
    if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > LONG_PRESS_SLOP) this.clearPress();
    if (!this.drag || !this.state) return;
    this.setPointer(e);
    // 指针挪进牌栏就是「要收进手」：这一步得在投影失败之前问，牌栏正压在画布最底下一截
    const zone = this.handReady(this.drag.ids) ? this.zoneOf?.(e.clientX, e.clientY) ?? null : null;
    if (zone !== this.zone) {
      this.zone = zone;
      this.events.onDragZone(zone);
    }
    const gp = this.groundPoint(this.drag.base);
    if (!gp) {
      // 指针出了画布：这一帧没有落点，盒口那圈跟着灭掉，别留着骗人
      this.showBoxHint(null);
      this.showTakeHints([]);
      return;
    }
    const anchorObj = this.state.o.find((x) => x.id === this.drag!.anchor);
    const grabbed = anchorObj ? restInTable(anchorObj, gp.x + this.drag.offset.x, gp.z + this.drag.offset.z) : { x: gp.x + this.drag.offset.x, z: gp.z + this.drag.offset.z };
    const anchorStart = this.drag.origin.get(this.drag.anchor)!;
    const dx = grabbed.x - anchorStart.x;
    const dz = grabbed.z - anchorStart.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.0005) this.drag.moved = true;
    // 轨迹只留最近 130 毫秒：算初速要的是「松手前那一下有多快」，不是整段路程的平均
    const hp = performance.now();
    const hist = this.drag.hist;
    hist.push({ t: hp, x: grabbed.x, z: grabbed.z });
    while (hist.length > 2 && hp - hist[0].t > 130) hist.shift();
    const where = new Map(this.drag.ids.map((id) => {
      const start = this.drag!.origin.get(id)!;
      return [id, { x: start.x + dx, z: start.z + dz }] as const;
    }));
    // 预览就按提交同一套算法算：吸附、贴边、挤开全在这里跑完，松手不会再跳一次
    const carried = new Set(where.keys());
    const settled = resolveDrop(this.state, [...where].map(([id, p]) => ({ id, ...p })), this.drag.rigid).filter((m) => carried.has(m.id));
    const rotById = new Map(settled.map((m) => [m.id, m.rot] as const));
    for (const m of settled) where.set(m.id, { x: m.x, z: m.z });
    // 牌压在容器口上：整叠吸附到盒口，亮一圈告诉用户松手就是丢进去
    const box = this.boxUnder(this.drag, where.get(this.drag.anchor) ?? grabbed);
    if (box) {
      let i = 0;
      for (const id of this.drag.ids) {
        if (!where.has(id)) continue;
        where.set(id, { x: round3(box.x + i * 0.002), z: round3(box.z + i * 0.002) });
        i += 1;
      }
    }
    this.showBoxHint(box);
    // 落点压在异色子上：先给它圈一圈红的，松手就是吃掉而不是挤到旁边去
    this.showTakeHints(capturesOf(this.state, settled).map((c) => c.prey));
    for (const id of this.drag.ids) {
      const g = this.groups.get(id);
      const at = where.get(id);
      if (!g || !at) continue;
      this.drag.live.set(id, at);
      // 各件按自己的静止高度抬起来：叠着的牌保持原来的层次，松手才不会又掉一截
      g.position.set(at.x, (this.drag.bases.get(id) ?? this.drag.base) + DRAG_HOVER, at.z);
      // 吸进卡槽的那一张当场就转向：预览里看到斜了，松手才是斜的
      g.rotation.y = THREE.MathUtils.degToRad(rotById.get(id) ?? this.drag.rots.get(id) ?? 0);
    }
    // 松手之前就把位置广播出去：别人看到的是你在拖，而不是牌突然瞬移
    const now = performance.now();
    if (this.drag.moved && now - this.dragSentAt >= DRAG_PUSH_MS) {
      this.dragSentAt = now;
      this.events.onDragLive(settled.map((m) => ({ ...m, ...where.get(m.id) })));
    }
    this.drawRings();
  };

  private onUp = (e: PointerEvent) => {
    const tap = this.tapPoint;
    this.tapPoint = null;
    if (this.marquee) {
      this.finishMarquee();
      return;
    }
    // 压在点位圈上、这一笔没滑走：落子优先于「点空白」，也优先于「改选脚下那枚敌子」
    if (tap && !this.drag?.moved && !this.blank?.moved && this.placeAtPoint(tap.id, tap.pt)) {
      this.clearBlankTimer();
      this.blank = null;
      this.clearPress();
      this.drag = null;
      this.dropIn = null;
      this.showBoxHint(null);
      this.showTakeHints([]);
      this.renderer.domElement.releasePointerCapture?.(e.pointerId);
      return;
    }
    if (this.blank) {
      // 一直没滑动才算「点空白」：滑那一下是平移画面，不该把选中清空
      const tapped = !this.blank.moved;
      this.clearBlankTimer();
      this.blank = null;
      if (tapped) this.events.onBlank();
    }
    this.clearPress();
    if (this.altRotate) {
      this.altRotate = false;
      this.controls.mouseButtons.LEFT = this.orbit ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    }
    const drag = this.drag;
    const state = this.state;
    if (!drag) return;
    this.drag = null;
    // 亮到刚才那一帧的盒口就是这次的目标：预览与提交认同一份判定，松手才不会丢错盒
    const boxId = this.dropIn;
    this.showBoxHint(null);
    this.showTakeHints([]);
    this.renderer.domElement.releasePointerCapture?.(e.pointerId);
    // 松手时指针停在牌栏里：这不是移动，是把牌收进手里，位置先照原样落回去等归约结果
    const zone = this.handReady(drag.ids) ? this.zoneOf?.(e.clientX, e.clientY) ?? null : null;
    this.zone = null;
    this.events.onDragZone(null);
    if (zone === "hand" && drag.moved) {
      if (state) this.sync(state);
      this.events.onToHand(drag.ids);
      return;
    }
    // 亮着的盒口 + 真的挪动过：松手就是把牌丢进盒，而不是在盒盖上摊一张
    const box = boxId && state && drag.moved ? state.o.find((o) => o.id === boxId) ?? null : null;
    this.dropIn = null;
    if (box) {
      if (state) this.sync(state);
      this.events.onDropIn(drag.ids, box.id);
      return;
    }
    if (!drag.moved || !state) {
      if (state) this.sync(state);
      return;
    }
    const moves = resolveDrop(state, [...drag.live].map(([id, p]) => ({ id, ...p })), drag.rigid);
    const byId = new Map<string, Move>();
    for (const m of moves) byId.set(m.id, m);
    // 单件拖出去才谈惯性：按住一整叠甩不符合任何桌游的动作
    if (drag.ids.length === 1 && !drag.rigid) {
      const hit = moves.find((m) => m.id === drag.anchor);
      if (hit) for (const m of this.releaseFling(state, drag, hit)) byId.set(m.id, m);
    }
    const kept = [...byId.values()].filter((m) => {
      const o = state.o.find((x) => x.id === m.id);
      return o && (Math.abs(m.x - o.x) >= 0.0005 || Math.abs(m.z - o.z) >= 0.0005 || m.layer !== o.layer || (m.rot !== undefined && m.rot !== o.rot));
    });
    // 落点先自己贴住，等归约结果回来再补间，否则会看到一次回弹
    for (const id of drag.ids) {
      if (this.slides.has(id)) continue;
      const g = this.groups.get(id);
      const o = state.o.find((x) => x.id === id);
      if (!g || !o) continue;
      const mv = kept.find((m) => m.id === id);
      const at = { ...o, x: mv?.x ?? o.x, z: mv?.z ?? o.z, layer: mv?.layer ?? o.layer };
      const base = o.kind === "board" ? 0 : baseY(state, at);
      this.glides.delete(id);
      g.position.set(at.x, base, at.z);
      if (mv?.rot !== undefined) g.rotation.y = THREE.MathUtils.degToRad(mv.rot);
      g.userData.base = base;
      g.userData.floor = o.kind === "board" ? 0 : floorY(state, at);
    }
    this.drawRings();
    if (kept.length) this.events.onCommit(kept, drag.rigid);
  };

  /**
   * 松手那一下的甩动：拿最近 130 毫秒的轨迹算初速，交给 data 层的 fling 积分。
   * 落点由同一次计算写进动作，本端只照它给出的路径逐帧回放，所以别人看到的终点就是这里算出的终点。
   */
  private releaseFling(state: TableState, drag: Drag, at: Move): Move[] {
    const h = drag.hist;
    if (h.length < 2) return [];
    const span = (h[h.length - 1].t - h[0].t) / 1000;
    if (span < 0.016) return [];
    const vx = (h[h.length - 1].x - h[0].x) / span;
    const vz = (h[h.length - 1].z - h[0].z) / span;
    const o = state.o.find((x) => x.id === at.id);
    if (!o) return [];
    const res = fling(state.o, at.id, { vx, vz }, { x: at.x, z: at.z, layer: at.layer ?? o.layer });
    if (!res.moves.length) return [];
    for (const [id, path] of res.path) {
      const g = this.groups.get(id);
      const m = state.o.find((x) => x.id === id);
      const mv = res.moves.find((x) => x.id === id);
      if (!g || !m || !mv || path.length < 2) continue;
      this.glides.delete(id);
      this.falls.delete(id);
      this.slides.set(id, { g, id, path, t: path[0].t, base: baseY(state, { ...m, x: mv.x, z: mv.z, layer: mv.layer }) });
    }
    return res.moves;
  };

  private onDbl = (e: MouseEvent) => {
    this.setPointer(e);
    const id = this.pick();
    if (id) this.events.onDouble(id);
  };

  private onCtx = (e: MouseEvent) => {
    e.preventDefault();
    this.setPointer(e);
    this.events.onContext(this.pick(), { x: e.clientX, y: e.clientY });
  };

  // —— 动画 ————————————————————————————————

  /** 掷骰：点数来自动作，本地只做表现。spread=0 时原地弹跳，不甩开 */
  tumble(o: GameObject, value: number, showTag = true, spread = 1) {
    const g = this.groups.get(o.id);
    if (!g || this.tumbles.some((t) => t.id === o.id)) return;
    const base = (g.userData.base as number) ?? 0;
    const sides = o.sides ?? 6;
    const yaw = Math.random() * Math.PI * 2;
    const final = new THREE.Quaternion();
    if (sides === 6) final.setFromAxisAngle(UP, yaw).multiply(new THREE.Quaternion().setFromUnitVectors(dieNormal(value), UP));
    else final.setFromEuler(new THREE.Euler(0, yaw, 0));
    const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)
      .normalize()
      .multiplyScalar((0.14 + Math.random() * 0.12) * spread);
    const holder = g.children.find((c) => c.userData.id === o.id) ?? null;
    const mat = materialOf(o);
    // 空中怎么转都不好说，围板就按最斜的那一档留余量
    const span = spanOf(o, 45);
    // 骰子起点压在哪只盘里，这一下就把弹跳收进那口盘，别撒到盘外
    const tn = this.state ? trayAt(this.state, o.x, o.z, [o.id]) : null;
    const ts = tn ? fixTray(tn.tray) : null;
    const trayBox = ts
      ? { cx: tn!.x, cz: tn!.z, rad: ((tn!.rot || 0) * Math.PI) / 180, hw: Math.max(0.01, ts.w / 2 - span.x), hd: Math.max(0.01, ts.d / 2 - span.z) }
      : null;
    g.quaternion.identity();
    holder?.quaternion.identity();
    this.tumbles.push({
      id: o.id,
      mesh: g,
      holder,
      lift: holder?.position.y ?? 0,
      verts: holder ? sampleVertices(holder) : null,
      pos: new THREE.Vector3(o.x, base + 0.085, o.z),
      vel: new THREE.Vector3(dir.x, (0.6 + Math.random() * 0.25) * (spread ? 1 : 0.72), dir.z),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spin: 9 + Math.random() * 7,
      final,
      t: 0,
      flight: 0.5 + Math.random() * 0.12,
      total: 1.02,
      base,
      e: mat.e,
      grip: 1 - mat.mu * 0.6,
      span: { x: span.x, z: span.z },
      trayBox,
    });
    if (showTag) this.showLabel(o.id, String(value), base);
  }

  private showLabel(id: string, text: string, base: number) {
    const o = this.state?.o.find((x) => x.id === id);
    if (!o) return;
    const mat = new THREE.SpriteMaterial({ map: labelSpriteTexture(text, o.color ?? "#c8443c"), transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.position.set(o.x, base + 0.078, o.z);
    sp.scale.set(0.058, 0.029, 1);
    this.sprites.add(sp);
    this.labelFade.set(sp, 2.1);
  }

  /** 状态里只有绝对结束时刻，倒计时文字由每个客户端按本地时钟刷出来；计算器屏幕则跟着表达式刷 */
  private tickPlates() {
    if (!this.state) return;
    const now = Date.now();
    for (const g of this.groups.values()) {
      const holder = g.userData.plate as { plate: Plate; color: string; shown?: string } | undefined;
      const o = g.userData.obj as GameObject | undefined;
      if (!holder || !o) continue;
      if (o.kind === "timer") {
        const left = remainingOf(o, now);
        const total = Math.max(1, o.duration || left || 1);
        const text = mmss(left);
        const key = `${text}:${Math.round((left / total) * 36)}:${o.endsAt != null && left <= 0 ? "x" : ""}`;
        if (key === holder.shown) continue;
        holder.shown = key;
        paintTimer(holder.plate, text, holder.color, left / total, o.endsAt != null && left <= 0);
      } else if (o.kind === "hour") {
        const left = hourLeft(o, now);
        const ratio = hourRatio(o, now);
        const text = mmss(left);
        const key = `${text}:${Math.round(ratio * 36)}:${o.hour?.at != null && left <= 0 ? "x" : ""}`;
        if (key === holder.shown) continue;
        holder.shown = key;
        paintTimer(holder.plate, text, holder.color, ratio, o.hour?.at != null && left <= 0);
      } else if (o.kind === "calc") {
        const expr = o.calc?.expr ?? "";
        const value = calcResult(expr);
        const key = `${expr}=${value === null ? "?" : formatCalc(value)}`;
        if (key === holder.shown) continue;
        holder.shown = key;
        paintCalc(holder.plate, expr, value === null ? "" : formatCalc(value), holder.color);
      } else if (o.kind === "counter") {
        const v = o.counter?.v ?? 0;
        const key = `n${v}`;
        if (key === holder.shown) continue;
        holder.shown = key;
        paintCounter(holder.plate, v, holder.color);
      } else continue;
      holder.plate.texture.needsUpdate = true;
    }
  }

  /**
   * 会自己动的三件：转盘按「起转时刻 + 本地时钟」算盘面角度，沙漏按同一时刻算两边沙面，计分轨的棋子往目标格滑过去。
   * 三者都不重建网格、只挪已有的物体，所以动画一帧都不会被状态更新打断。
   */
  private tickPieces(dt: number) {
    if (!this.state) return;
    const now = Date.now();
    for (const g of this.groups.values()) {
      const o = g.userData.obj as GameObject | undefined;
      if (!o) continue;
      if (o.kind === "spinner") {
        const dial = g.userData.dial as THREE.Object3D | undefined;
        if (dial) dial.rotation.y = THREE.MathUtils.degToRad(spinAngleAt(o, now));
        continue;
      }
      if (o.kind === "gram") {
        const rig = g.userData.gram as { platter: THREE.Object3D; arm: THREE.Object3D; lamp: THREE.Mesh; mats: THREE.Material[] } | undefined;
        if (!rig) continue;
        const gm = o.gram;
        const on = !!gm?.playing && !!gm.clip;
        // 转速按帧累加而不是按墙钟算：一晚上不放就转掉两圈，谁也不会去看盘面上的角度
        if (on) rig.platter.rotation.y = (rig.platter.rotation.y + GRAM_MOTION.spin * Math.min(0.2, dt)) % (Math.PI * 2);
        const ease = Math.min(1, dt * 4.5);
        rig.arm.rotation.y += ((on ? GRAM_MOTION.cue : GRAM_MOTION.park) - rig.arm.rotation.y) * ease;
        rig.arm.rotation.x += ((on ? GRAM_MOTION.tilt : 0) - rig.arm.rotation.x) * ease;
        rig.lamp.material = on ? rig.mats[1] : rig.mats[0];
        continue;
      }
      if (o.kind === "mp3") {
        const rig = g.userData.walkman as { reels: THREE.Object3D[]; led: THREE.Mesh; mats: THREE.Material[] } | undefined;
        if (!rig) continue;
        const m = o.mp3;
        // 共享档看桌面那一份的起停，私人档看本机这一档：后者根本不上桌，所以只能按本机的读
        const on = !!m?.clip && (m.shared ? m.playing : localPlaying(o));
        if (on) for (const r of rig.reels) r.rotation.y = (r.rotation.y + MP3_MOTION.spin * Math.min(0.2, dt)) % (Math.PI * 2);
        rig.led.material = m?.shared ? rig.mats[1] : rig.mats[0];
        continue;
      }
      if (o.kind === "hour") {
        const sand = g.userData.sand as { top: THREE.Object3D; bottom: THREE.Object3D; stream: THREE.Object3D } | undefined;
        if (!sand) continue;
        const ratio = hourRatio(o, now);
        sand.top.scale.setScalar(ratio);
        sand.bottom.scale.setScalar(1 - ratio);
        sand.stream.visible = o.hour?.at != null && hourLeft(o, now) > 0;
        continue;
      }
      if (o.kind !== "track") continue;
      const holder = g.userData.marks as { pucks: { mesh: THREE.Mesh; x: number }[] } | undefined;
      if (!holder) continue;
      const marks = o.track?.marks ?? [];
      const n = o.track?.n ?? marks.length;
      for (let i = 0; i < holder.pucks.length; i++) {
        const p = holder.pucks[i];
        const m = marks[i];
        p.mesh.visible = !!m;
        if (!m) {
          p.x = Number.NaN;
          continue;
        }
        const target = trackOffset(m.at, n);
        // 空出来的槽位记成「没来过」：下一个人顶上来时直接落位，不该从别人那格横滑一趟
        if (Number.isNaN(p.x)) p.x = target;
        else p.x += (target - p.x) * Math.min(1, dt * 9);
        p.mesh.position.x = p.x;
        (p.mesh.material as THREE.MeshPhysicalMaterial).color.set(m.color ?? "#efe7d6");
      }
    }
  }

  private step(dt: number) {
    this.tickPlates();
    this.tickPieces(dt);
    if (this.glides.size) {
      let moved = false;
      for (const [id, gl] of [...this.glides]) {
        gl.t += dt;
        const k = Math.min(1, gl.t / gl.dur);
        const e = 1 - (1 - k) ** 3;
        gl.g.position.set(gl.x0 + (gl.x1 - gl.x0) * e, gl.y0 + (gl.y1 - gl.y0) * e, gl.z0 + (gl.z1 - gl.z0) * e);
        gl.g.rotation.y = gl.r0 + (gl.r1 - gl.r0) * e;
        gl.g.rotation.x = gl.t0 + (gl.t1 - gl.t0) * e;
        if (k >= 1) this.glides.delete(id);
        moved = true;
      }
      if (moved && this.selection.size) this.drawRings();
    }
    if (this.falls.size) {
      let landed = false;
      for (const [id, f] of [...this.falls]) {
        f.vy -= G * dt;
        f.y += f.vy * dt;
        if (f.y <= f.floor) {
          f.y = f.floor;
          // 弹几下由材质说了算：骰子蹦三下，纸牌一次躺平
          if (f.bounces < f.hops && Math.abs(f.vy) > 0.16) {
            f.vy = Math.abs(f.vy) * f.e;
            f.bounces += 1;
          } else {
            f.vy = 0;
            f.g.position.y = f.floor;
            this.falls.delete(id);
            landed = true;
            continue;
          }
        }
        f.g.position.y = f.y;
      }
      if (landed && this.selection.size) this.drawRings();
    }
    if (this.slides.size) {
      let moved = false;
      for (const [id, s] of [...this.slides]) {
        s.t += dt;
        const last = s.path[s.path.length - 1];
        if (s.t >= last.t) {
          s.g.position.set(last.x, s.base, last.z);
          s.g.rotation.y = THREE.MathUtils.degToRad(last.rot);
          this.slides.delete(id);
          moved = true;
          continue;
        }
        let i = 1;
        while (i < s.path.length && s.path[i].t < s.t) i++;
        const a = s.path[i - 1];
        const b = s.path[i];
        const k = b.t > a.t ? (s.t - a.t) / (b.t - a.t) : 1;
        s.g.position.set(a.x + (b.x - a.x) * k, s.base, a.z + (b.z - a.z) * k);
        s.g.rotation.y = THREE.MathUtils.degToRad(a.rot + (b.rot - a.rot) * k);
        moved = true;
      }
      if (moved && this.selection.size) this.drawRings();
    }
    if (this.riffles.size) {
      for (const [id, t] of [...this.riffles]) {
        const g = this.groups.get(id);
        // 牌堆被拆了、或者换了张顶牌整个重画了：这一轮就没有对象了，当场收掉
        if (!g) {
          this.riffles.delete(id);
          continue;
        }
        const next = t + dt;
        // 走到 1 时每张牌正好落回摊平的位置，收掉之后状态里的坐标接着管，不需要额外补一帧
        rifflePile(g, Math.min(1, next / RIFFLE_S));
        if (next >= RIFFLE_S) this.riffles.delete(id);
        else this.riffles.set(id, next);
      }
    }
    if (this.ghosts.size) {
      const now = performance.now();
      for (const [key, gh] of [...this.ghosts]) {
        if (gh.until <= now) {
          // 只收圈：小手由下面那段按自己的寿命收，选中帧随时可能把它续上更长的一档
          this.dropRing(key);
          continue;
        }
        // 一帧一帧追过去：拖动预览本来就只有几十毫秒的寿命，插值太慢反而看不出是谁在动
        const k = Math.min(1, dt * 18);
        gh.x += (gh.tx - gh.x) * k;
        gh.z += (gh.tz - gh.z) * k;
        const o = this.state?.o.find((x) => x.id === gh.id);
        const y = (o ? surfaceY(this.state!, gh.x, gh.z) : FELT_Y) + 0.0022;
        gh.mesh.position.set(gh.x, y, gh.z);
        gh.mat.opacity = Math.min(1, (gh.until - now) / 260) * 0.72;
      }
    }
    if (this.holds.size && this.state) {
      const now = performance.now();
      const st = this.state;
      for (const [key, hd] of [...this.holds]) {
        const o = st.o.find((x) => x.id === hd.id);
        // 东西被删了、被收进手里了，或者超时没再收到消息：这只手就该松开
        if (hd.until <= now || !o || o.hand) {
          if (hd.drag) this.dropGhost(key);
          else this.dropHold(key);
          continue;
        }
        const gh = this.ghosts.get(key);
        const x = gh ? gh.x : o.x;
        const z = gh ? gh.z : o.z;
        const top = baseY(st, o) + boxOf(o).h + HAND_CLEAR + Math.sin(now / 280 + key.length) * 0.004;
        hd.sprite.position.set(x, Math.max(top, surfaceY(st, x, z) + HAND_CLEAR), z);
        const k = Math.max(0.8, Math.min(1.9, footprintOf(o) / 0.05));
        hd.sprite.scale.setScalar(HAND_BASE * k);
        hd.sprite.material.opacity = Math.min(1, (hd.until - now) / (hd.drag ? 260 : 600));
      }
    }
    const keep: Tumble[] = [];
    for (const tb of this.tumbles) {
      tb.t += dt;
      if (tb.t < tb.flight) {
        tb.vel.y -= G * dt;
        tb.pos.addScaledVector(tb.vel, dt);
        if (tb.pos.y < tb.base) {
          tb.pos.y = tb.base;
          tb.vel.y = Math.abs(tb.vel.y) * tb.e;
          tb.vel.x *= tb.grip;
          tb.vel.z *= tb.grip;
          tb.spin *= 0.58;
        }
        // 围板按骰子自己的投影收边：放大到三倍的骰子不该有一半卡在木头里
        const limX = TABLE.w / 2 - tb.span.x;
        const limZ = TABLE.d / 2 - tb.span.z;
        if (Math.abs(tb.pos.x) > limX) { tb.pos.x = Math.sign(tb.pos.x) * limX; tb.vel.x *= -tb.e; }
        if (Math.abs(tb.pos.z) > limZ) { tb.pos.z = Math.sign(tb.pos.z) * limZ; tb.vel.z *= -tb.e; }
        // 骰子从盘里掷出：撞矮墙就弹回盘腔，滚不出盘外（纯表现，不改落点）
        if (tb.trayBox) {
          const bx = tb.trayBox, c = Math.cos(bx.rad), s = Math.sin(bx.rad);
          let lx = (tb.pos.x - bx.cx) * c + (tb.pos.z - bx.cz) * s;
          let lz = -(tb.pos.x - bx.cx) * s + (tb.pos.z - bx.cz) * c;
          let vx = tb.vel.x * c + tb.vel.z * s;
          let vz = -tb.vel.x * s + tb.vel.z * c;
          let bump = false;
          if (Math.abs(lx) > bx.hw) { lx = Math.sign(lx) * bx.hw; vx *= -tb.e; bump = true; }
          if (Math.abs(lz) > bx.hd) { lz = Math.sign(lz) * bx.hd; vz *= -tb.e; bump = true; }
          if (bump) {
            tb.pos.x = bx.cx + lx * c - lz * s;
            tb.pos.z = bx.cz + lx * s + lz * c;
            tb.vel.x = vx * c - vz * s;
            tb.vel.z = vx * s + vz * c;
          }
        }
        const spinner = tb.holder ?? tb.mesh;
        SPIN_Q.setFromAxisAngle(tb.axis, tb.spin * dt);
        spinner.quaternion.premultiply(SPIN_Q);
        const floor = restFloor(tb, spinner.quaternion);
        if (tb.pos.y < floor) {
          tb.pos.y = floor;
          tb.vel.y = Math.abs(tb.vel.y) * 0.4;
          tb.spin *= 0.7;
        }

        tb.mesh.position.copy(tb.pos);
        keep.push(tb);
        continue;
      }
      const k = Math.min(1, (tb.t - tb.flight) / Math.max(0.001, tb.total - tb.flight));
      const spinner = tb.holder ?? tb.mesh;
      spinner.quaternion.slerp(tb.final, 0.12 + k * 0.3);
      tb.mesh.quaternion.identity();
      const floor = restFloor(tb, spinner.quaternion);
      const target = new THREE.Vector3(tb.pos.x, Math.max(tb.base, floor), tb.pos.z);
      tb.mesh.position.lerp(target, 0.2 + k * 0.4);
      // 收尾时姿态还在转，最低点可能突然变高，别让插值把棱角留在桌面以下
      if (tb.mesh.position.y < floor) tb.mesh.position.y = floor;
      if (k < 1) { keep.push(tb); continue; }
      spinner.quaternion.copy(tb.final);
      tb.mesh.position.set(target.x, tb.base, target.z);
      const o = this.state?.o.find((x) => x.id === tb.id);
      if (o?.value) this.showLabel(tb.id, String(o.value), tb.base);
    }
    this.tumbles = keep;

    for (const [sp, left] of [...this.labelFade]) {
      const v = left - dt;
      if (v <= 0) {
        this.sprites.remove(sp);
        sp.material.dispose();
        this.labelFade.delete(sp);
        continue;
      }
      this.labelFade.set(sp, v);
      sp.material.opacity = Math.min(1, v / 0.6);
      sp.position.y += dt * 0.008;
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.lastAt ? Math.min(0.05, (now - this.lastAt) / 1000) : 0.016;
    this.lastAt = now;
    this.step(dt);
    if (this.camGoal) {
      this.camera.position.lerp(this.camGoal.pos, 0.12);
      this.controls.target.lerp(this.camGoal.look, 0.12);
      if (this.camera.position.distanceTo(this.camGoal.pos) < 0.01) this.camGoal = null;
    }
    this.clampTarget();
    this.syncLamp();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.syncScreens();
    // 一层里没有屏、或者屏全藏着，这一层整层不用摆；从露脸收进到全藏的那一帧还要多画一笔，把元素真关掉
    if (this.screensShown || this.cssShown) this.css?.render(this.cssScene, this.camera);
    this.cssShown = this.screensShown;
  };

  /**
   * 平板亮屏要等到机身矩阵算完，所以排在画布那一笔之后。
   * 每块屏先量它实际占多少屏幕像素，再决定按哪一档画、要不要先藏起来：手机上平躺的平板多半只占两三百像素，
   * 却按 1280×720 那一档挂整页播放器，等于拿四倍面积的页面每帧重新采样一遍。
   */
  private syncScreens() {
    if (!this.css) return;
    const live = new Set<string>();
    let shown = 0;
    _scrProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    _scrFrustum.setFromProjectionMatrix(_scrProj);
    for (const o of this.state?.o ?? []) {
      // watchId 那一片归放大观看的浮层，桌上不再挂第二份：两份一起解码手机顶不住，声音还是两路
      if (o.kind !== "tablet" || o.hand || o.id === this.watchId) continue;
      const tb = fixTablet(o.tablet);
      if (!tb.url) continue;
      const scr = this.groups.get(o.id)?.userData.screen as THREE.Mesh | undefined;
      if (!scr) continue;
      live.add(o.id);
      // 走带参数全算进键里：同一页同一秒不该重装，但别人一按暂停就得重装成静帧；rev 是「地址没变也要再来一遍」
      const key = `${tb.url}|${tb.page}|${tb.playing ? 1 : 0}|${tb.pos}|${tb.at ?? ""}|${tb.mute ? 1 : 0}|${tb.rev}`;
      let hit: Screen | null = this.screens.get(o.id) ?? null;
      if (hit && hit.key !== key) {
        this.dropScreen(o.id);
        hit = null;
      }
      scr.updateWorldMatrix(true, false);
      const plan = tabletScreenPlan(this.screenWidthPx(scr), hit?.px ?? 0);
      if (!hit) hit = this.openScreen(o.id, tb, key, plan.px);
      if (!hit) continue;
      // 只有被点名的那块屏吃指针事件： iframe 一吃，那一片矩形里的点击与滚轮就都进了页面，
      // 落在屏外的手指照样转到 WebGL——所以机身边框仍是这块物件，选它挪它都还使得。
      hit.frame.style.pointerEvents = this.touch === o.id ? "auto" : "none";
      // 藏着的时候不动那一档：来回缩放会一次次跨过门槛，每跨一次页面重排一次，比糊一点贵
      const want = plan.show ? plan.px : hit.px;
      if (hit.px !== want) this.applyPx(hit, want);
      hit.node.matrix.copy(scr.matrixWorld).multiply(this.fitFor(hit.px));
      hit.node.matrixWorldNeedsUpdate = true;
      _scrSphere.center.setFromMatrixPosition(scr.matrixWorld);
      _scrSphere.radius = SCREEN_RADIUS;
      // 上手摸的那一块永远不许藏：手指按上去结果是一块黑玻璃，等于把功能变没了
      hit.node.visible = (plan.show || this.touch === o.id)
        && _scrFrustum.intersectsSphere(_scrSphere)
        && facesScreen(scr, this.camera.position);
      if (hit.node.visible) shown++;
    }
    for (const id of [...this.screens.keys()]) if (!live.has(id)) this.dropScreen(id);
    this.screensShown = shown > 0;
  }

  /** 这块屏在屏幕上占多少设备像素宽：四角投影量面积，再折成 16:9 的等效宽度，所以歪着摆、转 90° 摆得到的数一样 */
  private screenWidthPx(scr: THREE.Mesh): number {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [cx, cy] of _CORNERS) {
      _scrCorner.set(cx, cy, 0).applyMatrix4(scr.matrixWorld).project(this.camera);
      if (_scrCorner.x < minX) minX = _scrCorner.x;
      if (_scrCorner.x > maxX) maxX = _scrCorner.x;
      if (_scrCorner.y < minY) minY = _scrCorner.y;
      if (_scrCorner.y > maxY) maxY = _scrCorner.y;
    }
    const buf = this.renderer.domElement;
    const w = Math.max(0, (maxX - minX) / 2) * buf.width;
    const h = Math.max(0, (maxY - minY) / 2) * buf.height;
    return Math.sqrt(w * h * (16 / 9));
  }

  /** 那一档像素宽贴回机身要乘的缩放：占位屏的网格已按米做好，右边乘 1/像素宽就正好贴满 */
  private fitFor(px: number): THREE.Matrix4 {
    let fit = this.screenFits.get(px);
    if (!fit) {
      fit = new THREE.Matrix4().makeScale(1 / px, 1 / tabletScreenPx(px), 1);
      this.screenFits.set(px, fit);
    }
    return fit;
  }

  /** 换档：外壳尺寸跟着走，iframe 是 100%，那一页自己按新的视口重排一次 */
  private applyPx(hit: Screen, px: number) {
    hit.px = px;
    const style = hit.node.element.style;
    style.width = `${px}px`;
    style.height = `${tabletScreenPx(px)}px`;
  }

  /**
   * 放大观看浮层开合：开着的那一块桌上不再挂屏，关掉就按桌上的起播秒重新挂回来。
   * 这是本机视角，桌面状态一个字都不写。
   */
  setWatchScreen(id: string | null) {
    const next = id && this.groups.has(id) ? id : null;
    if (next === this.watchId) return;
    this.watchId = next;
    if (next) this.dropScreen(next);
  }

  /** 认了地址才立一块屏上来：B 站那一种按本地时刻现推起播点，晚进房的人落下就在同一秒 */
  private openScreen(id: string, tb: TabletSpec, key: string, px: number): Screen | null {
    if (!this.css || !tb.url) return null;
    const frame = document.createElement("iframe");
    frame.src = tabletFrame(tb, tb.playing ? tabletPos(tb) : tb.pos, this.danmaku);
    frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.title = tabletHost(tb.url);
    // 那块 3D 矩阵（把当前那一档的像素宽缩成 0.232m）只能落在外壳上，别落在 iframe 自己身上：
    // Chromium 对自带 3D 矩阵的 frame 不做命中测试，屏面点得着才谈得上「上手摸」。
    const shell = document.createElement("div");
    shell.appendChild(frame);
    const node = new CSS3DObject(shell);
    // CSS3DObject 默认把元素开成吃指针事件的，这里盖回去：桌上的手势归 WebGL，别让播放器截走
    Object.assign(shell.style, { width: `${px}px`, height: `${tabletScreenPx(px)}px`, pointerEvents: "none" });
    Object.assign(frame.style, {
      display: "block", width: "100%", height: "100%",
      border: "none", background: "#05070a", pointerEvents: "none",
    });
    node.matrixAutoUpdate = false;
    this.cssScene.add(node);
    const hit = { node, frame, key, px };
    this.screens.set(id, hit);
    return hit;
  }

  /** 摘掉一块播放器：先把地址导航走再说，detached 的 iframe 有的浏览器还在出声 */
  private dropScreen(id: string) {
    const hit = this.screens.get(id);
    if (!hit) return;
    this.screens.delete(id);
    hit.frame.src = "about:blank";
    // 要从父节点摘才算数：CSS3DObject 只在收到 removed 事件时才把自己的 DOM 抠掉，node.remove() 是清它的子节点
    hit.node.removeFromParent();
  }

  /** 相机高过吊灯时灯罩/灯泡正挡视线，收掉它们但保留光照 */
  private syncLamp() {
    this.lampVisual.visible = this.camera.position.y < 1.34;
  }

  private clampTarget() {
    const t = this.controls.target;
    const hw = TABLE.w / 2 + 0.15;
    const hd = TABLE.d / 2 + 0.15;
    t.x = THREE.MathUtils.clamp(t.x, -hw, hw);
    t.z = THREE.MathUtils.clamp(t.z, -hd, hd);
    t.y = THREE.MathUtils.clamp(t.y, -0.05, 0.3);
  }

  view(name: ViewName) {
    const look = new THREE.Vector3(this.controls.target.x, 0.02, this.controls.target.z);
    if (name === "top") this.camGoal = { pos: new THREE.Vector3(look.x, 1.72, look.z + 0.02), look };
    else if (name === "seat") this.camGoal = { pos: new THREE.Vector3(look.x, 0.48, look.z + 1.14), look };
    else this.camGoal = { pos: new THREE.Vector3(look.x, 1.12, look.z + 1.4), look };
  }

  focus(id: string) {
    const g = this.groups.get(id);
    if (!g) return;
    this.camGoal = {
      look: new THREE.Vector3(g.position.x, 0.02, g.position.z),
      pos: new THREE.Vector3(g.position.x, 0.5, g.position.z + 0.6),
    };
  }

  /**
   * 上手摸这块屏：只把这一台平板的 iframe 放开指针事件，并把镜头凑到屏前。
   * 这是本机视角，不进桌面状态——页面是人家的，跨源读不到里面点了什么，
   * 全桌同步的照旧只有那一条地址与几个走带数。
   */
  setTouchScreen(id: string | null) {
    const next = id && this.groups.has(id) ? id : null;
    if (next === this.touch) return;
    if (next) {
      const g = this.groups.get(next);
      const scr = g?.userData.screen as THREE.Mesh | undefined;
      if (!g || !scr) return;
      if (!this.touch) this.camBack = { pos: this.camera.position.clone(), look: this.controls.target.clone() };
      scr.updateWorldMatrix(true, false);
      const look = scr.getWorldPosition(new THREE.Vector3());
      // 站在这块屏的正上方偏自己那一侧，跟着机身自己的 rot/tilt 走：歪着摆的平板也正好正对着看
      const q = g.getWorldQuaternion(new THREE.Quaternion());
      this.camGoal = { look, pos: look.clone().add(new THREE.Vector3(0, 0.24, 0.05).applyQuaternion(q)) };
    } else {
      if (this.camBack) this.camGoal = { pos: this.camBack.pos, look: this.camBack.look };
      this.camBack = null;
    }
    this.touch = next;
  }

  /**
   * 视角旋转开关：开着时空手拖动（左键 / 单指）转视角，关掉就是平移画面。
   * 只管单指那一档，两指归 setPinchRotate 说了算；顶栏那两颗互斥，所以至多一颗是开的。
   */
  setOrbit(on: boolean) {
    this.orbit = !!on;
    this.controls.touches.ONE = this.orbit ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
    if (!this.altRotate) this.controls.mouseButtons.LEFT = this.orbit ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  }

  /**
   * 双指转视角（最初的手感）：开着时两指同时拖动绕桌子转，捏合那一下仍然只是缩放。
   * OrbitControls 把缩放与旋转捆在 DOLLY_ROTATE 这一档里，所以这里只能整档换，拆不开。
   */
  setPinchRotate(on: boolean) {
    this.controls.touches.TWO = on ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN;
  }

  /**
   * 亮度调节：灯、环境光贴图和曝光一起按倍数走。
   * 只压灯不压曝光的话，高光那一片还是刺眼，等于没调。
   */
  setBright(value: number) {
    this.bright = clampBright(value);
    this.applyBright();
  }

  private applyBright() {
    for (const { light, base } of this.lamps) light.intensity = base * this.bright;
    this.scene.environmentIntensity = this.bright;
    this.renderer.toneMappingExposure = 1.06 * (0.82 + 0.18 * this.bright);
  }

  setQuality(level: QualityLevel) {
    // 超清档按屏幕原生像素出图，不再压像素比：这一步之后屏幕每个物理像素都是渲染出来的
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(level === "ultra" ? dpr : Math.min(dpr, level === "high" ? 2 : level === "balanced" ? 1.35 : 1));
    this.renderer.shadowMap.enabled = level !== "light";
    this.renderer.shadowMap.needsUpdate = true;
    // 阴影贴图只有一张主光要换：4096 才压得住超清档那块满分辨率的屏幕
    const key = this.keyLight;
    const map = level === "ultra" ? 4096 : 2048;
    if (key && key.shadow.mapSize.x !== map) {
      key.shadow.mapSize.set(map, map);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    // 画质档同时决定印刷精度：轻量档省显存，高清档把卡面/ token 的画布放大重画
    if (setPrintScale(level === "ultra" ? 3 : level === "high" ? 2 : level === "balanced" ? 1.5 : 1)) {
      dropPrintMaterials();
      this.signatures.clear();
      if (this.state) this.sync(this.state);
    }
    this.resize();
  }
}

/** 转角差收进 ±π：补间才不会绕远路 */
function shortAngle(delta: number): number {
  return ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function gradientBackground(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#161d27");
  g.addColorStop(0.55, "#10151c");
  g.addColorStop(1, "#08090c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 512);
  // 暗部渐变在 8bit 屏上会起一圈圈横纹，逐行抖一点噪声就化开了
  const img = ctx.getImageData(0, 0, 8, 512);
  for (let y = 0; y < 512; y++) {
    const jitter = (Math.random() - 0.5) * 5.5;
    for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      for (const k of [0, 1, 2]) {
        img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] + jitter));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
