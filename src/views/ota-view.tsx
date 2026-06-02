import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileUp,
  Hand,
  Loader2,
  MousePointerClick,
  RotateCcw,
  Send,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import { tauriBleClient } from "../lib/ble/client";
import { startDtnNbOta } from "../lib/ota/flow";
import { OtaStepper } from "../components/ota/ota-stepper";
import { DeviceActionHint } from "../components/ota/device-action-hint";

type OtaState = "idle" | "running" | "success" | "error";
type WizardStep = "identify" | "reset" | "boot" | "run";
type OtaConsoleEntry = {
  id: string;
  timestamp: number;
  level: "info" | "trace" | "success" | "error";
  message: string;
};

const MAX_CONSOLE_ENTRIES = 600;
const TRACE_FLUSH_MS = 200;

const STEP_SEQUENCE: WizardStep[] = ["identify", "reset", "boot", "run"];
const STEP_LABELS = ["Identificação", "Sleep", "Boot", "Atualização"];
const STEP_TITLES: Record<WizardStep, string> = {
  identify: "Identificação do dispositivo",
  reset: "Modo sleep",
  boot: "Modo de envio",
  run: "Atualização OTA",
};

function formatConsoleTime(value: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function OtaView() {
  const [step, setStep] = useState<WizardStep>("identify");
  const [imei, setImei] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Aguardando início da atualização.");
  const [state, setState] = useState<OtaState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<OtaConsoleEntry[]>([]);
  const [fullLogCount, setFullLogCount] = useState(0);
  const [didDownloadLog, setDidDownloadLog] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const traceBufferRef = useRef<OtaConsoleEntry[]>([]);
  const fullLogEntriesRef = useRef<OtaConsoleEntry[]>([]);
  const traceFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRunPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const lastProgressLogRef = useRef(0);
  const isRunning = state === "running";
  const currentStepIndex = STEP_SEQUENCE.indexOf(step);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      clearTraceQueue();
      if (downloadFeedbackTimerRef.current !== null) {
        clearTimeout(downloadFeedbackTimerRef.current);
      }
    };
  }, []);

  const canProceedIdentify = useMemo(
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
    fullLogEntriesRef.current = [...fullLogEntriesRef.current, ...entriesToAppend];
    setFullLogCount(fullLogEntriesRef.current.length + traceBufferRef.current.length);
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
    setFullLogCount(fullLogEntriesRef.current.length);
  }

  function clearTraceQueue() {
    if (traceFlushTimerRef.current !== null) {
      clearTimeout(traceFlushTimerRef.current);
      traceFlushTimerRef.current = null;
    }
    traceBufferRef.current = [];
    setFullLogCount(fullLogEntriesRef.current.length);
  }

  function appendTrace(message: string) {
    traceBufferRef.current = [...traceBufferRef.current, buildConsoleEntry(message, "trace")];
    setFullLogCount(fullLogEntriesRef.current.length + traceBufferRef.current.length);

    if (traceFlushTimerRef.current === null) {
      traceFlushTimerRef.current = setTimeout(flushTraceQueue, TRACE_FLUSH_MS);
    }
  }

  function resetLog() {
    clearTraceQueue();
    fullLogEntriesRef.current = [];
    setFullLogCount(0);
    setConsoleEntries([]);
  }

  function formatLogLine(entry: OtaConsoleEntry): string {
    return `[${new Date(entry.timestamp).toISOString()}] [${entry.level.toUpperCase()}] ${entry.message}`;
  }

  function downloadFullLog() {
    const entries = [...fullLogEntriesRef.current, ...traceBufferRef.current];
    if (!entries.length) return;

    const fileLabel = imei.trim() || "sem-imei";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([`${entries.map(formatLogLine).join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ota-log-${fileLabel}-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setDidDownloadLog(true);
    if (downloadFeedbackTimerRef.current !== null) {
      clearTimeout(downloadFeedbackTimerRef.current);
    }
    downloadFeedbackTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setDidDownloadLog(false);
      }
      downloadFeedbackTimerRef.current = null;
    }, 1800);
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
      appendConsoleEntry(`Progresso da atualização: ${rounded}%`);
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
  }

  async function startOta() {
    if (!file || !canProceedIdentify || isRunning) return;
    mountedRef.current = true;

    if (currentRunPromiseRef.current) {
      setState("running");
      setError(null);
      setProgress(0);
      resetLog();
      updateStatus("Finalizando conexão BLE anterior...");
      await currentRunPromiseRef.current.catch(() => undefined);
      if (!mountedRef.current) return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    lastProgressLogRef.current = 0;
    setState("running");
    setError(null);
    setProgress(0);
    resetLog();
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
      setStatus("OTA concluído. O dispositivo foi reiniciado.");
      appendConsoleEntry("OTA concluído. O dispositivo foi reiniciado.", "success");
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
    setStatus("OTA cancelado. Pronto para reenviar.");
  }

  function resetWizard() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    lastProgressLogRef.current = 0;
    clearTraceQueue();
    setState("idle");
    setProgress(0);
    setError(null);
    setStatus("Aguardando início da atualização.");
    resetLog();
    setStep("identify");
  }

  function cancelToStart() {
    resetWizard();
    setImei("");
    setPassword("");
    setFile(null);
  }

  function goBack() {
    if (step === "reset") setStep("identify");
    else if (step === "boot") setStep("reset");
    else if (step === "run") setStep("boot");
  }

  function handlePrimaryAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "identify") {
      if (!canProceedIdentify || isRunning) return;
      setStep("reset");
    } else if (step === "reset") {
      setStep("boot");
    } else if (step === "boot") {
      setStep("run");
      void startOta();
    }
  }

  function renderRunFooter() {
    if (isRunning) {
      return (
        <button type="button" className="control-button" onClick={cancelOta}>
          Cancelar
        </button>
      );
    }

    if (state === "success") {
      return (
        <button type="button" className="control-button primary" onClick={cancelToStart}>
          <RotateCcw size={16} aria-hidden="true" />
          Novo OTA
        </button>
      );
    }

    if (state === "error") {
      return (
        <>
          <button type="button" className="control-button" onClick={cancelToStart}>
            Cancelar
          </button>
          <button type="button" className="control-button primary" onClick={() => void startOta()}>
            <RotateCcw size={16} aria-hidden="true" />
            Tentar novamente
          </button>
        </>
      );
    }

    return (
      <>
        <button type="button" className="control-button" onClick={() => setStep("boot")}>
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar
        </button>
        <button type="button" className="control-button primary" onClick={() => void startOta()}>
          <RotateCcw size={16} aria-hidden="true" />
          Tentar novamente
        </button>
      </>
    );
  }

  return (
    <form className="ota-wizard" onSubmit={handlePrimaryAction}>
      <header className="ota-wizard-header">
        <div className="ota-wizard-heading">
          <p className="eyebrow">Atualização OTA</p>
          <h2>{STEP_TITLES[step]}</h2>
        </div>
        <OtaStepper steps={STEP_LABELS} current={currentStepIndex} />
      </header>

      <div className="ota-wizard-body">
        {step === "identify" ? (
          <div className="ota-step-panel ota-identify">
            <div className="ota-field-grid">
              <div className="ota-field">
                <span>IMEI</span>
                <input
                  aria-label="IMEI"
                  value={imei}
                  onChange={(event) => setImei(event.target.value)}
                  placeholder="IMEI ou nome BLE"
                  disabled={isRunning}
                />
              </div>
              <label className="ota-field">
                <span>Senha OTA</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="text"
                  disabled={isRunning}
                />
              </label>
            </div>

            <label className="ota-file-picker">
              <FileUp size={20} aria-hidden="true" />
              <span>{file ? file.name : "Selecionar firmware .bin"}</span>
              <input type="file" accept=".bin,application/octet-stream" onChange={selectFile} disabled={isRunning} />
            </label>
          </div>
        ) : null}

        {step === "reset" ? (
          <div className="ota-step-panel ota-instruction">
            <DeviceActionHint variant="red-blink" />
            <div className="ota-instruction-text">
              <span className="ota-instruction-badge">
                <MousePointerClick size={14} aria-hidden="true" />
                Passo físico
              </span>
              <h3>Clique 5 vezes no botão do dispositivo</h3>
              <p>
                Clique no botão do dispositivo <strong>5 vezes seguidas</strong>. A cada clique o LED pisca em{" "}
                <strong className="hint-green">verde</strong>. Depois, aguarde alguns instantes até o LED ficar{" "}
                <strong className="hint-red">vermelho</strong>: isso confirma que entrou em <strong>modo sleep</strong>.
              </p>
            </div>
          </div>
        ) : null}

        {step === "boot" ? (
          <div className="ota-step-panel ota-instruction">
            <DeviceActionHint variant="green-hold" />
            <div className="ota-instruction-text">
              <span className="ota-instruction-badge">
                <Hand size={14} aria-hidden="true" />
                Passo físico
              </span>
              <h3>Clique em Enviar e segure o botão</h3>
              <p>
                Clique em <strong>Enviar</strong> no desktop. Depois segure o botão do dispositivo: o LED fica{" "}
                <strong className="hint-green">verde</strong> fixo. Continue segurando até ele{" "}
                <strong className="hint-green">piscar em verde 5 vezes</strong>; então solte o botão.
              </p>
            </div>
          </div>
        ) : null}

        {step === "run" ? (
          <div className="ota-step-panel ota-run" aria-live="polite">
            <div className="ota-run-summary">
              <div className="ota-run-meta">
                <span className="ota-run-meta-item">
                  IMEI <strong>{imei.trim()}</strong>
                </span>
                <span className="ota-run-meta-item">
                  Firmware <strong>{file?.name ?? "-"}</strong>
                </span>
              </div>
              <div className="ota-run-state-icon">
                {state === "success" ? <CheckCircle2 className="success-icon" size={22} /> : null}
                {state === "error" ? <XCircle className="danger-icon" size={22} /> : null}
                {isRunning ? <Loader2 className="spin" size={20} aria-hidden="true" /> : null}
              </div>
            </div>

            <div className="ota-progress-row">
              <div className="ota-progress-track">
                <span style={{ width: `${clampProgress(progress)}%` }} />
              </div>
              <strong>{Math.round(progress)}%</strong>
            </div>

            <p className="ota-status-text">{status}</p>
            {error ? <p className="inline-error">{error}</p> : null}

            <section className="ota-console" aria-label="Console da atualização">
              <div className="ota-console-heading">
                <span>
                  <Terminal size={14} aria-hidden="true" />
                  Console
                </span>
                <div className="ota-console-actions">
                  <button
                    type="button"
                    className={`icon-button ${didDownloadLog ? "success" : ""}`}
                    onClick={downloadFullLog}
                    title={didDownloadLog ? "Log baixado" : "Baixar log completo"}
                    aria-label={didDownloadLog ? "Log baixado" : "Baixar log completo"}
                    disabled={!fullLogCount}
                  >
                    {didDownloadLog ? (
                      <CheckCircle2 size={15} aria-hidden="true" />
                    ) : (
                      <Download size={15} aria-hidden="true" />
                    )}
                  </button>
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
                  <div className="ota-console-empty">Aguardando início da atualização.</div>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <footer className="ota-wizard-footer">
        <div className="ota-footer-left">
          {step === "reset" || step === "boot" ? (
            <button type="button" className="control-button" onClick={goBack}>
              <ArrowLeft size={16} aria-hidden="true" />
              Voltar
            </button>
          ) : null}
        </div>
        <div className="ota-footer-right">
          {step === "identify" ? (
            <button type="submit" className="control-button primary ota-next-button" disabled={!canProceedIdentify}>
              Próximo
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : null}
          {step === "reset" ? (
            <button type="submit" className="control-button primary ota-next-button">
              Próximo
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : null}
          {step === "boot" ? (
            <button type="submit" className="control-button primary ota-next-button">
              <Send size={16} aria-hidden="true" />
              Enviar
            </button>
          ) : null}
          {step === "run" ? renderRunFooter() : null}
        </div>
      </footer>
    </form>
  );
}
