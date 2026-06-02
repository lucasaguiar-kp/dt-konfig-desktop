export type GithubRelease = {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
};

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
};

const LATEST_RELEASE_URL = "https://api.github.com/repos/lucasaguiar-kp/dt-konfig-desktop/releases/latest";

function normalizeVersion(value: string): number[] {
  const match = value.trim().match(/^v?(\d+(?:\.\d+){0,2})/i);
  if (!match) return [];

  return match[1].split(".").map((part) => Number.parseInt(part, 10));
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const candidateParts = normalizeVersion(candidate);
  const currentParts = normalizeVersion(current);
  if (!candidateParts.length || !currentParts.length) return false;

  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const candidatePart = candidateParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (candidatePart > currentPart) return true;
    if (candidatePart < currentPart) return false;
  }

  return false;
}

export async function checkForAppUpdate(currentVersion: string): Promise<AppUpdateInfo | null> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) return null;

  const release = (await response.json()) as GithubRelease;
  if (release.draft || release.prerelease) return null;
  if (!release.tag_name || !release.html_url) return null;
  if (!isVersionNewer(release.tag_name, currentVersion)) return null;

  return {
    currentVersion,
    latestVersion: release.tag_name.replace(/^v/i, ""),
    releaseUrl: release.html_url,
  };
}
