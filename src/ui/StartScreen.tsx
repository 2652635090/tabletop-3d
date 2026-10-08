import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dices, LogIn, Minus, Plus, SquareArrowOutUpRight, Users, Wifi } from "lucide-react";
import { fpShort } from "@/game/fingerprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function StartScreen({ nick, onNick, onEmpty, onCreate, onJoin, onLobby, recent, onRecent }: {
  nick: string;
  onNick: (name: string) => void;
  /** 默认就是这张空桌子：不用再挑开局 */
  onEmpty: () => void;
  onCreate: () => void;
  onJoin: () => void;
  onLobby: () => void;
  /** 这台浏览器记着的房间：一进来就顺着房间码接着用，服务器联系不上时用缓存桌况摆桌 */
  recent: { code: string; name: string; version: number; at: number }[];
  onRecent: (code: string) => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[3px]">
      <div className="panel my-auto w-full max-w-xl rounded-2xl p-5 sm:p-7">
        <p className="panel-title">3D 桌游沙盒</p>
        <h1 className="mt-1 font-serif text-3xl leading-tight sm:text-4xl">牌桌</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          随便摆棋子、掷骰子、洗牌发牌，也能开个房间把房间码发给朋友一起坐同一张桌。
        </p>

        {recent.length > 0 && (
          <>
            <p className="mt-5 panel-title">继续上次的房间</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => onRecent(r.code)}
                  className="rounded-lg border border-border/70 bg-black/30 px-2.5 py-1.5 text-start transition hover:border-primary/70 hover:bg-primary/10"
                >
                  <span className="flex items-center gap-1.5">
                    <code className="font-mono text-xs tracking-[0.2em] text-primary">{r.code}</code>
                    <span className="max-w-[9rem] truncate text-xs text-foreground/90">{r.name}</span>
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">缓存到 v{r.version} · {ago(r.at)}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              这些桌况本机都存了一份：房间还开着一进来就是最新桌面，服务器联系不上时也会用缓存把桌子先摆出来。
            </p>
          </>
        )}

        <label className="mt-5 block text-xs text-muted-foreground" htmlFor="nick">你的昵称</label>
        <Input
          id="nick"
          className="mt-1.5 h-10"
          value={nick}
          placeholder="例如：小周"
          maxLength={16}
          onChange={(e) => onNick(e.target.value)}
        />
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          昵称随你改，同桌的人看到的就是它。这台浏览器另外还有一个指纹短号 <code className="font-mono text-primary/90">#{fpShort()}</code>：
          昵称撞车、或者有人改了名，都靠它认人。
        </p>

        <Button size="sm" className="mt-5 w-full gap-1.5" onClick={onEmpty}>
          <SquareArrowOutUpRight className="size-4" />进入空桌面
        </Button>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onCreate}>
            <Wifi className="size-4" />创建联网房间
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onJoin}>
            <LogIn className="size-4" />用房间码加入
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onLobby}>
            <Users className="size-4" />大厅与在线的人
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Dices className="mt-0.5 size-3.5 shrink-0" />
          开局不用挑牌桌：进来就是一张空桌布，扑克、狼人杀、塔罗这些现成的牌局在左侧「开局」面板里，随时摆上或换掉。
        </p>
      </div>
    </div>
  );
}

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.round(s / 60)}分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)}小时前`;
  return `${Math.round(s / 86400)}天前`;
}

export function RoomDialog({ mode, nick, onNick, busy, onClose, onCreate, onJoin, onLobby }: {
  mode: "create" | "join";
  nick: string;
  onNick: (name: string) => void;
  busy: boolean;
  onClose: () => void;
  onCreate: () => Promise<boolean>;
  onJoin: (code: string) => Promise<boolean>;
  /** 没有房间码时的退路：直接去大厅挑一桌公开牌桌坐下 */
  onLobby: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const run = async (fn: () => Promise<boolean>, fail: string) => {
    setPending(true);
    setError("");
    const ok = await fn();
    setPending(false);
    if (!ok) setError(fail);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[3px]" onClick={onClose}>
      <div className="panel my-auto w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-xl">{mode === "create" ? "创建联网房间" : "加入房间"}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {mode === "create"
            ? "创建后得到一个 6 位房间码，把它告诉朋友就能同桌。房间所有人共享同一份桌面。"
            : "输入朋友给你的 6 位房间码。桌面会直接同步成对方当前的样子。"}
        </p>

        {mode === "create" ? (
          <>
            <label className="mt-4 block text-xs text-muted-foreground" htmlFor="room-nick">你的昵称</label>
            <Input id="room-nick" ref={inputRef} className="mt-1.5 h-10" value={nick} maxLength={16} placeholder="例如：小周" onChange={(e) => onNick(e.target.value)} />
            <Button
              className="mt-4 w-full gap-1.5"
              disabled={pending || busy}
              onClick={() => void run(onCreate, "创建房间失败，稍后再试")}
            >
              <Wifi className="size-4" />{pending ? "创建中…" : "创建房间"}
            </Button>
          </>
        ) : (
          <>
            <label className="mt-4 block text-xs text-muted-foreground" htmlFor="room-code">房间码</label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id="room-code"
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code.length >= 4) void run(() => onJoin(code), "找不到这个房间");
                }}
                placeholder="ABC123"
                maxLength={8}
                className="h-10 flex-1 text-center font-mono text-xl uppercase tracking-[0.3em]"
              />
              <Button size="icon-sm" variant="ghost" aria-label="清空房间码" onClick={() => setCode("")}>
                <Minus className="size-3.5" />
              </Button>
            </div>
            <Button
              className="mt-4 w-full gap-1.5"
              disabled={pending || busy || code.length < 4}
              onClick={() => void run(() => onJoin(code), "找不到这个房间，检查房间码后再试")}
            >
              <LogIn className="size-4" />{pending ? "连接中…" : "进入房间"}
            </Button>
          </>
        )}

        {error && <p className="mt-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">{error}</p>}
        {mode === "join" && (
          <Button size="sm" variant="outline" className="mt-3 w-full gap-1.5" onClick={onLobby}>
            <Users className="size-4" />不知道房间码？看公开牌桌
          </Button>
        )}
        <Button size="xs" variant="ghost" className="mt-2 w-full text-muted-foreground" onClick={onClose}>
          先不了
        </Button>
      </div>
    </div>
  );
}

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]" onClick={onClose}>
      <div className="panel my-auto w-full max-w-2xl rounded-2xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-xl">怎么玩这张桌子</h2>
        <div className="mt-3 grid gap-4 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
          <Section title="鼠标">
            <p>左键点选物件，按住拖动即可摆放；松开后自动吸附棋盘格。</p>
            <p>中键拖动旋转视角（也可按 Alt + 左键），滚轮缩放。右键整颗留给菜单，不再和浏览器的右键菜单抢。</p>
            <p>顶栏那个「转视角／平移」开关是空白处左键拖动的用途：点了转视角，空白处拖着就是绕桌子转；再点回去，就是拖着挪画面。抓得着物件的那一下永远算摆放，不受它影响。它和「双指转」只能亮一颗，点一颗另一颗自动关掉，两颗都关就是纯平移＋只缩放。</p>
            <p>双击：骰子直接掷、牌堆摸一张、卡牌翻面、标记计数加一、沙漏翻面、唱片机放与停。</p>
            <p>左侧「辅助」里放一台唱片机，选中它展开的那一栏可以上传音频：什么格式都按原样存，一个人按下播放全桌一起响，进度各端自己推。音量是桌上共享的那一个，「本机静音」只管自己这台机器。</p>
            <p>右键点击物件打开快捷菜单，Shift/Ctrl 点选可多选。</p>
            <p>长按牌、牌堆或盒袋约半秒，弹出高清大图细看：朝上就给你看正面，扣着就给你看背面。</p>
            <p>空白处按住半秒不动再拖，画出一个框，松手就把框里的东西一次圈进选中菜单；空白处轻一下则放开选中、收回两侧栏。滑那一下不算点，那是平移画面。</p>
            <p>桌子有真实物理：单件拖得快、松手就甩出去滑行，撞到人把它顶开、撞到围板反弹回来；只压住一角的东西会滑下去，抽掉垫板则上面那一叠跟着塌。</p>
            <p>顶栏最左边那颗「收起工具条」把整条让给桌面，剩下的小按钮点一下就摊回来；「转视角」「双指转」这两颗不进去，收起时也摆在外面随时能切。</p>
          </Section>
          <Section title="整理牌桌">
            <p>框选或连点多张散牌，菜单里的「按牌面分堆」会把同名的合成一叠、扑克按花色分叠，一次分好几堆。</p>
            <p>想收进指定的那一叠：连选散牌和那个容器，「收进牌堆（N 张）」就只往你选中的那一叠里放。</p>
            <p>转过的角度回不去就点「转角归零」，一次把选中物件的水平转角和俯仰全清成初始状态。</p>
            <p>卡牌管理面板上的内置卡背一次统一整叠牌；批量卡背则一次写给选中的每张牌和每一叠。</p>
          </Section>
          <Section title="键盘">
            <p><Kbd>Del</Kbd> 拿走选中 · <Kbd>Ctrl</Kbd>+<Kbd>D</Kbd> 复制 · <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> 撤销</p>
            <p><Kbd>Q</Kbd>/<Kbd>E</Kbd> 按住水平转 · <Kbd>R</Kbd>/<Kbd>F</Kbd> 按住立起或压平，加 <Kbd>Shift</Kbd> 转得更细</p>
            <p><Kbd>L</Kbd> 锁定当前高度，解锁后按物理落回去 · <Kbd>T</Kbd> 翻面 · <Kbd>G</Kbd> 下一位</p>
            <p>空着手按 <Kbd>R</Kbd> 仍是掷全部骰子；<Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> 斜视/俯视/坐位，<Kbd>Esc</Kbd> 取消选择</p>
            <p>选中一枚走得动的棋子时：<Kbd>N</Kbd>/<Kbd>M</Kbd> 换一处落点，<Kbd>Enter</Kbd> 走到盘上亮着那一格；不用键盘也可以直接点亮着的那一格</p>
          </Section>
          <Section title="触屏">
            <p>单指点选物件、按住拖动摆放；空白处单指滑动默认平移画面，顶栏点了「转视角」之后同样这一下改成绕桌子转视角（此时「双指转」自动关掉，转视角只由一颗开关负责）。</p>
            <p>空白处按住不动半秒、感觉到轻轻一震再拖，就画出框选的那个方框，松手直接弹出选中菜单。空白处轻一下是放开选中并收回两侧栏。</p>
            <p>双指捏合只管把镜头拉近拉远，默认不会顺手把桌子转歪——想转视角用单指那一下。顶栏点了「双指转」就回到最初的手感：捏合照旧缩放，两指同时拖动绕桌子转。双击快速掷骰、摸牌、翻面。</p>
            <p>选中后底部那一条就是迷你调节条：按住「转角」「俯仰」两端的键连续转，用高度加减层，锁定后再叠下一个。展开箭头才显示完整菜单，平时只占一行。</p>
            <p>顶栏那条小工具带在手机上只放图标，从左到右依次是三个视角、转视角开关、双指转视角开关、掷骰、撤销、权限、画质、全屏、横屏全屏、说明；左右滑到底就能看全，图标上按住的提示会念出名字。最左边那颗「收起」把整条折成一颗小按钮，横屏竖屏都能再让出一行桌面，点小按钮就摊回来。折起来的时候「转视角」「双指转」这两颗照样留在外面——它们管的是这一下拖的到底是画面还是镜头，藏起来就没人猜得着了。这两颗互斥：亮着（带底色）的那一颗才是当前用法，另一颗必定是灰的，两个都灰就是单指平移、双指只缩放。</p>
            <p>顶部「组件」「房间」按钮负责开合两侧栏，手机上一次只展开一条。左侧再点一下「开局」就换成整桌起手，右侧在记录/房间/公开房之间换页。</p>
          </Section>
          <Section title="联网房间">
            <p>开房的那台浏览器就是房主：房主持有全部设置权，成员按房主开放的权限玩。权限一项一项分，从「移动摆放」到「清空桌面」都能单独收回来。</p>
            <p>房间分公开与私密：公开的挂进大厅，陌生人不用问房间码也能坐下；私密的只认房间码。</p>
            <p>桌面用版本号做比对同步，实时通道连着时由服务器推送，掉线才退回轮询；别人的动作会在你这里以同样的结果呈现。</p>
            <p>两个人同时操作时，系统会按最新桌面重放你的这一步；重放不了就直接采纳服务端桌面，绝不重复写入。越权的改动会被服务器整件退回，并告诉你被收回的是哪几项。</p>
            <p>区域垫可以上隐私模式：开着的区域内物件只有创建者能选中与使用，牌面也只有创建者看得见；关掉后别人能操作，但牌面依旧保密，把牌拿出区域才恢复可见。</p>
          </Section>
          <Section title="画面与手感">
            <p>顶部「画面」里能调画质档与灯光亮度：嫌吊灯刺眼就往左拖，最暗只剩四成光，这台浏览器会记住你调到的位置。</p>
            <p>画质切到「超清」后屏幕像素全开：导入的卡面与桌垫能塞进单图额度就原图直存，不缩放也不重编码，卡面画布更按原图分辨率重画。代价是一整桌大图很吃显存，手机建议留在均衡。</p>
            <p>组件库「卡牌」页里的「无边框导入」开着时，这张牌就是一张整图：不留那一圈白边和描边，牌的长宽也照着图的比例来，不会被切掉一头；已经传过的牌在卡牌管理里逐张改得回来。</p>
          </Section>
          <Section title="沙盒规则">
            <p>棋盘的格子长在自己身上：搬动棋盘，格线、交叉点和落点吸附一起跟着走，跟桌布没关系。棋子一放上去就自动吸进最近的空格，开了「格子已锁」则一格只许一子。</p>
            <p>选中棋盘后那条「棋盘」菜单里有两个锁：一个是格子的锁，一个是整盘的锁。整盘锁上以后这张盘点不中也拖不走，只留盘角那颗小按钮能解锁——摆好一盘棋就不怕谁顺手把盘抽走。</p>
            <p>踩子即吃照最终落点算：把棋子拖到敌子那一格，它落地时顺手把那一枚收走，盘边记一句「吃掉了谁」；选中棋盘还能「摆回开局」，照盘上现有的棋盘重铺一副。</p>
            <p>选中一枚认得出的棋子，盘上会点亮它这一步走得进的格：绿圈是空位，红圈踩过去就吃掉那一枚。按 N/M 换一处、回车落子，也可以直接点亮着的那一格——点位就是格心，点、拖、回车落的是同一处，吃的是同一枚。</p>
            <p>象棋的走法按老规矩来：帥将和士出不了九宫，象走田字还被塞住象眼、也过不去河界，马腿别着就跳不出去，兵过了河才许左右，炮隔着恰好一枚子才打得着。走不进的格子根本不会点亮；硬拖过去也落不进原位，盘边会写明为什么。</p>
            <p>走完这一步自家王还在对方火力下、或者把将帅之间的最后一道遮挡拆掉（照面），都算送将，这一步同样落不进。谁被将军，那枚王脚下会圈一圈红的，手牌条上方一直挂着「还剩几处可解、哪几枚子能将」——选中那枚子，点亮的就只有应将的格。一步都解不了就是绝杀，轮到谁动却无子可动算逼和，桌边会记一句谁胜。</p>
            <p>五子棋只有黑棋受限：连成七里算长连禁手，白棋连多少都算赢。</p>
            <p>洗牌与摸牌的结果由发起方定稿后同步，所以所有玩家看到的是同一张牌。</p>
            <p>
              <Plus className="inline size-3" />
              左侧组件库可以随意补充棋子、骰子、卡牌、标记与七种棋盘。
            </p>
          </Section>
          <Section title="本机缓存">
            <p>右侧「房间」面板最下面那颗「缓存」，列的是这台浏览器替自己记着的东西：桌况快照、存档副本、桌面预设、口令、删过的自动手牌区、本机偏好、这台机器的身份，以及卡面像素。</p>
            <p>每条都写着它是什么、丢了会怎样、占多大地方。删任何一样都要按两下：先按那颗垃圾桶，旁边才长出「确认删除」，中间随时能取消。分组那颗一次清掉整组，最下面那颗才是一次清掉这台浏览器的全部记录。</p>
            <p>口令那一组只列得着编号，值本身从不显示出来；服务器那边存的只是它们的摘要，删掉之后这台机器就改不动对应的存档、也管不了对应的房。</p>
          </Section>
        </div>
        <Button size="sm" className="mt-5 w-full" onClick={onClose}>回到牌桌</Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-black/25 p-3")}>
      <h3 className="panel-title mb-1.5">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="key">{children}</kbd>;
}
