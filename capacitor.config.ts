import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 安卓壳：整个桌面从服务器上加载，所以网站更新了不用重新装 APK。
 *
 * 服务器地址从环境变量来，仓库里不留任何现成地址：
 *   TABLETOP_SITE_URL=https://your-tabletop.example/ npm run android:apk
 * 明文 HTTP 会被 WebView 拦，所以按 URL 的 scheme 自动决定要不要开 cleartext 与混合内容；
 * 换成 https 后这两处自己就关掉了。
 */
const SERVER_URL = process.env.TABLETOP_SITE_URL ?? "";
if (!SERVER_URL) {
  throw new Error("缺少 TABLETOP_SITE_URL：壳要从哪台服务器加载桌面？例如 TABLETOP_SITE_URL=https://你的域名/ npm run android:apk");
}
const cleartext = SERVER_URL.startsWith("http://");

const config: CapacitorConfig = {
  appId: "com.tabletop3d.app",
  appName: "牌桌",
  webDir: "dist",
  server: {
    url: SERVER_URL,
    androidScheme: cleartext ? "http" : "https",
    allowUniversalLink: false,
  },
  android: {
    allowMixedContent: cleartext,
    // 站点认得出自己跑在壳里：网页全屏那两颗按钮在壳里没有意义（本来就没有浏览器工具条）
    appendUserAgent: "tabletop-app",
    // 调试期留着：真机上 chrome://inspect 能直接看到这张桌子的控制台
    webContentsDebuggingEnabled: true,
  },
};

export default config;
