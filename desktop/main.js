/**
 * MediBook desktop shell (Electron).
 *
 * Loads the MediBook web app in a dedicated window. The URL is configurable:
 *
 *   MEDIBOOK_APP_URL=http://localhost:3000   npm start   (development)
 *   MEDIBOOK_APP_URL=https://your-domain     npm start   (production)
 *
 * Defaults to http://localhost:3000 (the PWA dev server started by
 * start-dev.bat). Packaged builds read the same variable from the environment,
 * so point it at the deployed site before running `npm run dist`.
 *
 * The session is tagged two ways so the web app can recognise it as "already
 * using the app" (notification bell instead of the Download app button):
 *   1. the preload script exposes `window.__MB_DESKTOP__ = true`, and
 *   2. a `MediBookDesktop/x.y.z` token is appended to the user agent.
 *
 * `npm run smoke` boots the window and quits as soon as the page finishes
 * loading (or fails) — a headless-friendly self-check for CI / verification.
 */

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const START_URL =
  process.env.MEDIBOOK_APP_URL || "http://localhost:3000";
const SMOKE = process.argv.includes("--smoke");
const UA_TOKEN = `MediBookDesktop/${app.getVersion()}`;

let mainWindow = null;

function isAppUrl(url) {
  try {
    return new URL(url).origin === new URL(START_URL).origin;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#08a79d",
    title: "MediBook",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // Tag the session: navigator.userAgent then includes "MediBookDesktop".
  mainWindow.webContents.setUserAgent(
    `${mainWindow.webContents.getUserAgent()} ${UA_TOKEN}`
  );

  mainWindow.once("ready-to-show", () => {
    if (!SMOKE) mainWindow.show();
  });

  // Smoke mode: verify the desktop-app signals the web app reads, then quit
  // once the load settles (success or failure).
  mainWindow.webContents.on("did-finish-load", () => {
    if (!SMOKE) return;
    mainWindow.webContents
      .executeJavaScript(
        `({ uaTag: navigator.userAgent.includes("MediBookDesktop"), desktopFlag: window.__MB_DESKTOP__ === true })`
      )
      .then((result) => console.log("smoke:", JSON.stringify(result)))
      .catch((error) => console.log("smoke: probe failed:", error.message))
      .finally(() => app.quit());
  });
  mainWindow.webContents.on("did-fail-load", () => {
    if (SMOKE) app.quit();
  });
  if (SMOKE) setTimeout(() => app.quit(), 30000);

  // Links that leave the app open in the system browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void mainWindow.loadURL(START_URL);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.userAgentFallback = `${app.userAgentFallback} ${UA_TOKEN}`;
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
