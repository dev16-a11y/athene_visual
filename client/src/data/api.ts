const rawBase = (import.meta.env.VITE_API_BASE ?? "").trim();

export const API_BASE = rawBase.replace(/\/$/, "");
export const HUB_URL = `${API_BASE}/hubs/port`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}

export function getSnapshot(): Promise<import("../domain/types").Snapshot> {
  return request("/api/state");
}

export function getHistory(): Promise<import("../domain/types").HistoryInfo> {
  return request("/api/state/history");
}

export function getSnapshotAt(
  at: string,
): Promise<import("../domain/types").Snapshot> {
  const query = encodeURIComponent(at);
  return request(`/api/state/at?at=${query}`);
}
