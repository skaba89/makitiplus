import { z } from "zod";

/**
 * Password policy — used both client-side and server-side (edge functions).
 * Keep this in sync with supabase/functions/_shared/passwordPolicy.ts
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt limit

export interface PasswordCheckResult {
  ok: boolean;
  errors: string[];
  score: 0 | 1 | 2 | 3 | 4; // weak → strong
}

export function checkPassword(password: string): PasswordCheckResult {
  const errors: string[] = [];

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Au moins ${PASSWORD_MIN_LENGTH} caractères`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Maximum ${PASSWORD_MAX_LENGTH} caractères`);
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (!hasLower) errors.push("Une lettre minuscule");
  if (!hasUpper) errors.push("Une lettre majuscule");
  if (!hasDigit) errors.push("Un chiffre");
  if (!hasSymbol) errors.push("Un caractère spécial (ex: !@#$)");

  // Common weak passwords blocklist (top abused)
  const weak = [
    "password",
    "motdepasse",
    "azerty",
    "qwerty",
    "12345678",
    "test1234",
    "admin123",
  ];
  if (weak.some((w) => password.toLowerCase().includes(w))) {
    errors.push("Évitez les mots courants (password, azerty…)");
  }

  // Repeated characters (aaaaaaaa)
  if (/^(.)\1+$/.test(password)) {
    errors.push("Évitez les caractères répétés");
  }

  const criteriaPassed =
    Number(hasLower) + Number(hasUpper) + Number(hasDigit) + Number(hasSymbol);
  const lengthBonus = password.length >= 12 ? 1 : 0;
  const rawScore = Math.min(4, criteriaPassed + lengthBonus - (errors.length > 0 ? 1 : 0));
  const score = (Math.max(0, rawScore) as 0 | 1 | 2 | 3 | 4);

  return { ok: errors.length === 0, errors, score };
}

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Au moins ${PASSWORD_MIN_LENGTH} caractères`)
  .max(PASSWORD_MAX_LENGTH, `Maximum ${PASSWORD_MAX_LENGTH} caractères`)
  .superRefine((val, ctx) => {
    const result = checkPassword(val);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.errors.join(" • "),
      });
    }
  });

export const scoreLabel = (score: number) =>
  ["Très faible", "Faible", "Moyen", "Bon", "Excellent"][score] ?? "—";

export const scoreColor = (score: number) =>
  [
    "bg-destructive",
    "bg-destructive/70",
    "bg-yellow-500",
    "bg-green-500",
    "bg-green-600",
  ][score] ?? "bg-muted";
