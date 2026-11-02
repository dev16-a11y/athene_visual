import type { EntityStatus, VesselOperation } from "../domain/types";

const numberFormatter = new Intl.NumberFormat("ru-RU");

export function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

export function formatDecimal(value: number, digits = 1): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${formatShortTime(iso)}, ${date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}

export function formatDateTimeSeconds(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${formatTime(iso)}, ${date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}

export function formatDuration(fromIso: string, toMs: number): string {
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from)) {
    return "—";
  }
  const minutes = Math.max(0, Math.round((toMs - from) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} мин`;
  }
  return `${hours} ч ${rest.toString().padStart(2, "0")} мин`;
}

export function operationLabel(operation: VesselOperation): string {
  return operation === "loading" ? "Погрузка" : "Выгрузка";
}

export function operationShortLabel(operation: VesselOperation): string {
  return operation === "loading" ? "Погрузка" : "Выгрузка";
}

export function statusLabel(status: EntityStatus): string {
  switch (status) {
    case "working":
      return "В работе";
    case "moving":
      return "В движении";
    case "idle":
      return "Ожидание";
    case "warning":
      return "Предупреждение";
    case "critical":
      return "Критично";
    case "maintenance":
      return "Обслуживание";
  }
}

export function statusTone(
  status: EntityStatus,
): "ok" | "warn" | "danger" | "muted" {
  switch (status) {
    case "working":
    case "moving":
      return "ok";
    case "warning":
      return "warn";
    case "critical":
      return "danger";
    case "maintenance":
    case "idle":
      return "muted";
  }
}

export function deviationTone(minutes: number): "ok" | "warn" | "danger" {
  if (minutes > 30) {
    return "danger";
  }
  if (minutes > 0) {
    return "warn";
  }
  return "ok";
}
