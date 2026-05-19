import "./styles.css";
import { useState } from "react";
import type { MouseEvent } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Radio, UploadCloud } from "lucide-react";
import { DevicesView } from "./views/devices-view";
import { OtaView } from "./views/ota-view";

type AppView = "devices" | "ota";

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function shouldIgnoreWindowDrag(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("button, a, input, textarea, [role='button']"));
}

function handleTitlebarMouseDown(event: MouseEvent) {
  if (event.button !== 0 || shouldIgnoreWindowDrag(event.target) || !isTauriRuntime()) {
    return;
  }

  getCurrentWebviewWindow()
    .startDragging()
    .catch(() => undefined);
}

function handleTitlebarDoubleClick(event: MouseEvent) {
  if (event.button !== 0 || shouldIgnoreWindowDrag(event.target) || !isTauriRuntime()) {
    return;
  }

  const currentWindow = getCurrentWebviewWindow();
  currentWindow
    .isMaximized()
    .then((isMaximized) => (isMaximized ? currentWindow.unmaximize() : currentWindow.maximize()))
    .catch(() => undefined);
}

export function App() {
  const [view, setView] = useState<AppView>("devices");

  return (
    <main className="app-shell">
      <div className="app-window">
        <div
          className="window-titlebar"
          data-tauri-drag-region
          onMouseDown={handleTitlebarMouseDown}
          onDoubleClick={handleTitlebarDoubleClick}
        >
          <div className="titlebar-brand">
            <h1>DT Konfig</h1>
          </div>
          <nav className="titlebar-nav" aria-label="Navegacao principal">
            <button
              type="button"
              className={view === "devices" ? "titlebar-tab active" : "titlebar-tab"}
              onClick={() => setView("devices")}
            >
              <Radio size={14} />
              Devices
            </button>
            <button
              type="button"
              className={view === "ota" ? "titlebar-tab active" : "titlebar-tab"}
              onClick={() => setView("ota")}
            >
              <UploadCloud size={14} />
              OTA
            </button>
          </nav>
        </div>
        <section className="workspace">{view === "devices" ? <DevicesView /> : <OtaView />}</section>
      </div>
    </main>
  );
}

export default App;
