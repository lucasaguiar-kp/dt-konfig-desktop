import { openUrl } from "@tauri-apps/plugin-opener";
import { DownloadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import packageJson from "../../package.json";
import { checkForAppUpdate, type AppUpdateInfo } from "../lib/releases";

const CURRENT_VERSION = packageJson.version;

export function AppUpdateButton() {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    checkForAppUpdate(CURRENT_VERSION)
      .then((info) => {
        if (!cancelled) setUpdateInfo(info);
      })
      .catch(() => {
        if (!cancelled) setUpdateInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!updateInfo) return null;

  function openRelease() {
    if (!updateInfo) return;
    openUrl(updateInfo.releaseUrl).catch(() => {
      window.open(updateInfo.releaseUrl, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <button
      type="button"
      className="titlebar-update-button"
      onClick={openRelease}
      title={`Atualizar para v${updateInfo.latestVersion}`}
    >
      <DownloadCloud size={14} aria-hidden="true" />
      Atualizar app
    </button>
  );
}
