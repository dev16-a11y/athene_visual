export function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

export function computePercent(value: number, total: number): number {
  const v = toFiniteNumber(value);
  const t = toFiniteNumber(total);
  if (v === null || t === null || t <= 0) {
    return 0;
  }
  return clamp((v / t) * 100, 0, 100);
}

export function computeProgress(completed: number, planned: number): number {
  return Math.round(computePercent(completed, planned) * 10) / 10;
}

export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const rounded =
    Math.round(value * 10 ** fractionDigits) / 10 ** fractionDigits;
  return `${rounded.toFixed(fractionDigits)}%`;
}

export function deviationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || Math.abs(minutes) < 1) {
    return "по графику";
  }
  if (minutes > 0) {
    return `+${Math.round(minutes)} мин`;
  }
  return `${Math.round(minutes)} мин`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
