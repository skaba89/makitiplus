import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Short date format: "25/06/2026" */
export const formatDate = (date: Date | string): string =>
  format(new Date(date), "dd/MM/yyyy");

/** Full date+time format: "25 juin 2026 à 14:30" */
export const formatDateTime = (date: Date | string): string =>
  format(new Date(date), "dd MMM yyyy 'à' HH:mm", { locale: fr });
