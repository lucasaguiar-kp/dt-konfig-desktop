import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, UploadCloud, XCircle } from "lucide-react";
import { tauriBleClient } from "../lib/ble/client";
import { startDtnNbOta } from "../lib/ota/flow";

type OtaState = "idle" | "running" | "success" | "error";

export function OtaView() {
  const [imei, setImei] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Aguardando arquivo e IMEI.");
  const [state, setState] = useState<OtaState>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const isRunning = state === "running";

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const canStart = useMemo(
    () => imei.trim().length > 0 && password.trim().length > 0 && !!file && file.name.toLowerCase().endsWith(".bin"),
    [file, imei, password],
  );

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (isRunning) return;

    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
    setState("idle");
    setProgress(0);
    setStatus(selected ? `Arquivo selecionado: ${selected.name}` : "Aguardando arquivo e IMEI.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !canStart || isRunning) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setState("running");
    setError(null);
    setProgress(0);
    setStatus("Preparando OTA...");

    try {
      await startDtnNbOta({
        bleClient: tauriBleClient,
        imei,
        password,
        file,
        signal: abortController.signal,
        onProgress: setProgress,
        onStatus: setStatus,
      });
      if (!mountedRef.current) return;
      setState("success");
      setStatus("OTA concluido. O dispositivo foi reiniciado.");
      setProgress(100);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "OTA failed. Try again with the device nearby.";
      setError(message);
      setState("error");
      setStatus("OTA interrompido.");
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }

  function cancelOta() {
    abortControllerRef.current?.abort();
    setStatus("Cancelando OTA...");
  }

  return (
    <div className="ota-view">
      <form className="ota-panel ota-form-panel" onSubmit={(event) => void submit(event)}>
        <div className="ota-header">
          <div>
            <p className="eyebrow">Atualizacao</p>
            <h2>OTA por IMEI</h2>
          </div>
          <UploadCloud size={26} aria-hidden="true" />
        </div>

        <div className="ota-field-grid">
          <label className="ota-field">
            <span>IMEI</span>
            <input
              value={imei}
              onChange={(event) => setImei(event.target.value)}
              placeholder="Nome BLE do dispositivo"
              disabled={isRunning}
            />
          </label>
          <label className="ota-field">
            <span>Senha OTA</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" disabled={isRunning} />
          </label>
        </div>

        <label className="ota-file-picker">
          <FileUp size={20} aria-hidden="true" />
          <span>{file ? file.name : "Selecionar firmware .bin"}</span>
          <input type="file" accept=".bin,application/octet-stream" onChange={selectFile} disabled={isRunning} />
        </label>

        <div className="ota-action-row">
          <button type="submit" className="control-button primary ota-start-button" disabled={!canStart || isRunning}>
            {isRunning ? (
              <Loader2 className="spin" size={18} aria-hidden="true" />
            ) : (
              <UploadCloud size={18} aria-hidden="true" />
            )}
            Iniciar OTA
          </button>
          {isRunning ? (
            <button type="button" className="control-button" onClick={cancelOta}>
              Cancelar
            </button>
          ) : null}
        </div>
      </form>

      <section className="ota-panel ota-status-panel" aria-live="polite">
        <div className="ota-status-heading">
          <h2>Status</h2>
          {state === "success" ? <CheckCircle2 className="success-icon" size={24} /> : null}
          {state === "error" ? <XCircle className="danger-icon" size={24} /> : null}
        </div>

        <div className="ota-progress-row">
          <div className="ota-progress-track">
            <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          <strong>{Math.round(progress)}%</strong>
        </div>

        <p className="ota-status-text">{status}</p>
        {error ? <p className="inline-error">{error}</p> : null}

        <div className="ota-checklist">
          <span>IMEI usado na busca BLE</span>
          <span>Arquivo validado por extensao, tamanho e assinatura</span>
          <span>Progresso de flash entre 40% e 95%</span>
        </div>
      </section>
    </div>
  );
}
