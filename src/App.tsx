import "./styles.css";
import { Radio, UploadCloud } from "lucide-react";
import { DevicesView } from "./views/devices-view";

export function App() {
  return (
    <main className="app-shell">
      <nav className="global-nav" aria-label="Navegacao principal">
        <div className="brand-block">
          <h1>DT Konfig</h1>
          <p>Desktop</p>
        </div>
        <div className="nav-links">
          <button type="button" className="nav-link active">
            <Radio size={18} />
            Devices
          </button>
          <button type="button" className="nav-link" disabled>
            <UploadCloud size={18} />
            OTA
          </button>
        </div>
      </nav>
      <section className="workspace">
        <DevicesView />
      </section>
    </main>
  );
}

export default App;
