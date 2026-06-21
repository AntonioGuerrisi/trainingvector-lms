import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function resolveMediaUrl(sourceUrl: string) {
  if (sourceUrl.startsWith("http")) {
    return sourceUrl;
  }

  return `${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}${sourceUrl}`;
}
