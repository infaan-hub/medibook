/**
 * Preload for the MediBook desktop shell.
 *
 * Runs in an isolated world (contextIsolation + sandbox) and flags the page as
 * running inside the desktop app. The web app checks `window.__MB_DESKTOP__`
 * (see frontend/src/pwa/installPrompt.ts) so the header keeps the notification
 * bell instead of offering an app that is already running.
 */

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("__MB_DESKTOP__", true);
