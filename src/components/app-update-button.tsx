import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { DownloadCloud, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;
type UpdateState = "idle" | "installing" | "error";

export function AppUpdateButton() {
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [state, setState] = useState<UpdateState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    check()
      .then((update) => {
        if (!cancelled) setAvailableUpdate(update);
      })
      .catch(() => {
        if (!cancelled) setAvailableUpdate(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!availableUpdate) return null;

  async function installUpdate(update: AvailableUpdate) {
    if (state === "installing") return;

    setState("installing");
    setError(null);

    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (updateError) {
      setState("error");
      setError(updateError instanceof Error ? updateError.message : "Nao foi possivel atualizar o app");
    }
  }

  const isInstalling = state === "installing";
  const title = error ?? `Atualizar para v${availableUpdate.version}`;

  return (
    <button
      type="button"
      className="titlebar-update-button"
      disabled={isInstalling}
      onClick={() => installUpdate(availableUpdate)}
      title={title}
    >
      {isInstalling ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <DownloadCloud size={14} aria-hidden="true" />}
      {isInstalling ? "Atualizando" : "Atualizar app"}
    </button>
  );
}
