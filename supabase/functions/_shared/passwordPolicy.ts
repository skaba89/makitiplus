// Server-side password policy — must mirror src/lib/passwordPolicy.ts
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function validatePasswordServer(password: string): { ok: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { ok: false, error: "Mot de passe requis" };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Au moins ${PASSWORD_MIN_LENGTH} caractères requis` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `Maximum ${PASSWORD_MAX_LENGTH} caractères` };
  }
  if (!/[a-z]/.test(password)) return { ok: false, error: "Une lettre minuscule requise" };
  if (!/[A-Z]/.test(password)) return { ok: false, error: "Une lettre majuscule requise" };
  if (!/[0-9]/.test(password)) return { ok: false, error: "Un chiffre requis" };
  if (!/[^a-zA-Z0-9]/.test(password)) return { ok: false, error: "Un caractère spécial requis" };

  const weak = ["password", "motdepasse", "azerty", "qwerty", "12345678", "test1234", "admin123"];
  if (weak.some((w) => password.toLowerCase().includes(w))) {
    return { ok: false, error: "Mot de passe trop courant" };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, error: "Caractères répétés interdits" };
  }
  return { ok: true };
}
