import "./styles.css";
import { useState } from "react";
import type { MouseEvent } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Radio, UploadCloud } from "lucide-react";
import { DevicesView } from "./views/devices-view";
import { OtaView } from "./views/ota-view";

type AppView = "devices" | "ota";

const NAV_ITEMS: { id: AppView; label: string; icon: typeof Radio }[] = [
  { id: "devices", label: "Dispositivos", icon: Radio },
  { id: "ota", label: "OTA", icon: UploadCloud },
];

const VIEW_BREADCRUMBS: Record<AppView, string> = {
  devices: "Dispositivos",
  ota: "OTA",
};

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
          <div className="titlebar-content">
            <h1 className="titlebar-title">DT Konfig</h1>
            <span className="titlebar-sep" aria-hidden="true">
              /
            </span>
            <span className="titlebar-breadcrumb">{VIEW_BREADCRUMBS[view]}</span>
          </div>
        </div>

        <div className="app-body">
          <nav className="activity-bar" aria-label="Navegação principal">
            <div className="activity-brand" aria-hidden="true">
              DT
            </div>
            <div className="activity-group">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={view === id ? "activity-item active" : "activity-item"}
                  onClick={() => setView(id)}
                  title={label}
                  aria-label={label}
                  aria-current={view === id ? "page" : undefined}
                >
                  <Icon size={20} aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="activity-spacer" />
          </nav>

          <section className="workspace">{view === "devices" ? <DevicesView /> : <OtaView />}</section>
        </div>
      </div>
    </main>
  );
}

export default App;
