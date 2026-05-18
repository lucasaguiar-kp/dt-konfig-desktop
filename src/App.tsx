import "./styles.css";
import { useState } from "react";
import { Radio, UploadCloud } from "lucide-react";
import { DevicesView } from "./views/devices-view";
import { OtaView } from "./views/ota-view";

type AppView = "devices" | "ota";

export function App() {
  const [view, setView] = useState<AppView>("devices");

  return (
    <main className="app-shell">
      <nav className="global-nav" aria-label="Navegacao principal">
        <div className="brand-block">
          <h1>DT Konfig</h1>
          <p>Desktop</p>
        </div>
        <div className="nav-links">
          <button
            type="button"
            className={view === "devices" ? "nav-link active" : "nav-link"}
            onClick={() => setView("devices")}
          >
            <Radio size={18} />
            Devices
          </button>
          <button type="button" className={view === "ota" ? "nav-link active" : "nav-link"} onClick={() => setView("ota")}>
            <UploadCloud size={18} />
            OTA
          </button>
        </div>
      </nav>
      <section className="workspace">
        {view === "devices" ? <DevicesView /> : <OtaView />}
      </section>
    </main>
  );
}

export default App;
