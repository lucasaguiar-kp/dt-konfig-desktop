import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Terminal, Trash2, UploadCloud, XCircle } from "lucide-react";
import { tauriBleClient } from "../lib/ble/client";
import { startDtnNbOta } from "../lib/ota/flow";

type OtaState = "idle" | "running" | "success" | "error";
type OtaConsoleEntry = {
  id: string;
  timestamp: number;
  level: "info" | "trace" | "success" | "error";
  message: string;
};

const MAX_CONSOLE_ENTRIES = 600;
const TRACE_FLUSH_MS = 200;

function formatConsoleTime(value: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function OtaView() {
  const [imei, setImei] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Aguardando arquivo e IMEI.");
  const [state, setState] = useState<OtaState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<OtaConsoleEntry[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const traceBufferRef = useRef<OtaConsoleEntry[]>([]);
  const traceFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRunPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const lastProgressLogRef = useRef(0);
  const isRunning = state === "running";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      clearTraceQueue();
    };
  }, []);

  const canStart = useMemo(
    () => imei.trim().length > 0 && password.trim().length > 0 && !!file && file.name.toLowerCase().endsWith(".bin"),
    [file, imei, password],
  );

  useEffect(() => {
    const consoleElement = consoleRef.current;
    if (!consoleElement) return;
    consoleElement.scrollTop = consoleElement.scrollHeight;
  }, [consoleEntries]);

  function buildConsoleEntry(message: string, level: OtaConsoleEntry["level"] = "info"): OtaConsoleEntry {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      level,
      message,
    };
  }

  function appendConsoleEntries(entriesToAppend: OtaConsoleEntry[]) {
    if (!entriesToAppend.length) return;
    setConsoleEntries((entries) => [...entries, ...entriesToAppend].slice(-MAX_CONSOLE_ENTRIES));
  }

  function appendConsoleEntry(message: string, level: OtaConsoleEntry["level"] = "info") {
    appendConsoleEntries([buildConsoleEntry(message, level)]);
  }

  function flushTraceQueue() {
    if (traceFlushTimerRef.current !== null) {
      clearTimeout(traceFlushTimerRef.current);
      traceFlushTimerRef.current = null;
    }

    const entriesToAppend = traceBufferRef.current;
    traceBufferRef.current = [];
    appendConsoleEntries(entriesToAppend);
  }

  function clearTraceQueue() {
    if (traceFlushTimerRef.current !== null) {
      clearTimeout(traceFlushTimerRef.current);
      traceFlushTimerRef.current = null;
    }
    traceBufferRef.current = [];
  }

  function appendTrace(message: string) {
    traceBufferRef.current = [...traceBufferRef.current, buildConsoleEntry(message, "trace")].slice(-MAX_CONSOLE_ENTRIES);

    if (traceFlushTimerRef.current === null) {
      traceFlushTimerRef.current = setTimeout(flushTraceQueue, TRACE_FLUSH_MS);
    }
  }

  function replaceConsoleEntries(entries: OtaConsoleEntry[]) {
    clearTraceQueue();
    setConsoleEntries(entries.slice(-MAX_CONSOLE_ENTRIES));
  }

  function updateStatus(message: string) {
    flushTraceQueue();
    setStatus(message);
    appendConsoleEntry(message);
  }

  function updateProgress(value: number) {
    setProgress(value);
    const rounded = Math.round(value);
    if (rounded >= 100 || rounded - lastProgressLogRef.current >= 10) {
      lastProgressLogRef.current = rounded;
      flushTraceQueue();
      appendConsoleEntry(`Progresso da atualizacao: ${rounded}%`);
    }
  }

  function isCurrentController(abortController: AbortController): boolean {
    return abortControllerRef.current === abortController && !abortController.signal.aborted;
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (isRunning) return;

    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
    setState("idle");
    setProgress(0);
    setStatus(selected ? `Arquivo selecionado: ${selected.name}` : "Aguardando arquivo e IMEI.");
    replaceConsoleEntries(selected ? [buildConsoleEntry(`Arquivo selecionado: ${selected.name}`)] : []);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !canStart || isRunning) return;
    mountedRef.current = true;

    if (currentRunPromiseRef.current) {
      setState("running");
      setError(null);
      setProgress(0);
      clearTraceQueue();
      setConsoleEntries([]);
      updateStatus("Finalizando conexao BLE anterior...");
      await currentRunPromiseRef.current.catch(() => undefined);
      if (!mountedRef.current) return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    lastProgressLogRef.current = 0;
    setState("running");
    setError(null);
    setProgress(0);
    clearTraceQueue();
    setConsoleEntries([]);
    updateStatus("Preparando OTA...");
    appendConsoleEntry(`IMEI usado na busca: ${imei.trim()}`);
    appendConsoleEntry(`Firmware: ${file.name}`);

    let runPromise: Promise<void> | null = null;
    try {
      runPromise = startDtnNbOta({
        bleClient: tauriBleClient,
        imei,
        password,
        file,
        signal: abortController.signal,
        onProgress: (value) => {
          if (isCurrentController(abortController)) updateProgress(value);
        },
        onStatus: (message) => {
          if (isCurrentController(abortController)) updateStatus(message);
        },
        onTrace: (message) => {
          if (isCurrentController(abortController)) appendTrace(message);
        },
      });
      currentRunPromiseRef.current = runPromise;
      await runPromise;
      if (!isCurrentController(abortController)) return;
      flushTraceQueue();
      setState("success");
      setStatus("OTA concluido. O dispositivo foi reiniciado.");
      appendConsoleEntry("OTA concluido. O dispositivo foi reiniciado.", "success");
      setProgress(100);
    } catch (err) {
      if (!isCurrentController(abortController)) return;
      flushTraceQueue();
      const message = err instanceof Error ? err.message : "OTA failed. Try again with the device nearby.";
      setError(message);
      setState("error");
      setStatus("OTA interrompido.");
      appendConsoleEntry(`Erro: ${message}`, "error");
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      if (currentRunPromiseRef.current === runPromise) {
        currentRunPromiseRef.current = null;
      }
    }
  }

  function cancelOta() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    lastProgressLogRef.current = 0;
    clearTraceQueue();
    setError(null);
    setProgress(0);
    setState("idle");
    setStatus("OTA cancelado. Pronto para iniciar novamente.");
    setConsoleEntries([]);
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
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="text" disabled={isRunning} />
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

        <section className="ota-console" aria-label="Console da atualizacao">
          <div className="ota-console-heading">
            <span>
              <Terminal size={14} aria-hidden="true" />
              Console
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setConsoleEntries([])}
              title="Limpar console"
              disabled={!consoleEntries.length || isRunning}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
          <div ref={consoleRef} className="ota-console-output" role="log" aria-live="polite">
            {consoleEntries.length ? (
              consoleEntries.map((entry) => (
                <div className={`ota-console-entry ota-console-entry-${entry.level}`} key={entry.id}>
                  <time>{formatConsoleTime(entry.timestamp)}</time>
                  <span>{entry.message}</span>
                </div>
              ))
            ) : (
              <div className="ota-console-empty">Aguardando inicio da atualizacao.</div>
            )}
          </div>
        </section>

      </section>
    </div>
  );
}
