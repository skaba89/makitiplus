import { checkPassword, scoreLabel, scoreColor } from "@/lib/passwordPolicy";
import { CheckCircle2, XCircle } from "lucide-react";

interface Props {
  password: string;
  className?: string;
}

export const PasswordStrengthMeter = ({ password, className }: Props) => {
  const result = checkPassword(password || "");
  if (!password) return null;

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${scoreColor(result.score)}`}
            style={{ width: `${(result.score / 4) * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground w-20 text-right">
          {scoreLabel(result.score)}
        </span>
      </div>
      {result.errors.length > 0 ? (
        <ul className="space-y-1">
          {result.errors.map((err) => (
            <li key={err} className="flex items-center gap-2 text-xs text-muted-foreground">
              <XCircle className="h-3 w-3 text-destructive shrink-0" />
              <span>{err}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 text-xs text-green-600">
          <CheckCircle2 className="h-3 w-3" />
          <span>Mot de passe conforme</span>
        </div>
      )}
    </div>
  );
};
