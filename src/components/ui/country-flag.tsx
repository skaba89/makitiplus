import { cn } from "@/lib/utils";

interface CountryFlagProps {
  countryCode: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Renders a country flag as an inline SVG image using flagcdn.com.
 * Replaces emoji flags for consistent cross-platform rendering.
 */
export const CountryFlag = ({ countryCode, className, size = "md" }: CountryFlagProps) => {
  const code = countryCode.toLowerCase();
  const dimensions = {
    sm: { w: 16, h: 12 },
    md: { w: 20, h: 15 },
    lg: { w: 28, h: 21 },
  };

  const { w, h } = dimensions[size];

  return (
    <img
      src={`https://flagcdn.com/w${w}/${code}.png`}
      alt={`Drapeau ${countryCode}`}
      width={w}
      height={h}
      className={cn("inline-block rounded-sm object-cover", className)}
      loading="lazy"
      onError={(e) => {
        // Fallback: hide the broken image
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
};
