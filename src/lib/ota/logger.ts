const OTA_TAG = "[OTA]";

function isDebugEnabled(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem("dt-konfig:ota-debug") === "1";
}

export function otaLog(...args: unknown[]): void {
  if (isDebugEnabled()) console.debug(OTA_TAG, ...args);
}

export function otaWarn(...args: unknown[]): void {
  console.warn(OTA_TAG, ...args);
}
