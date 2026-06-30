import React from "react";
import {
  Package,
  Wheat,
  CupSoda,
  Sparkles,
  Brush,
  Wrench,
  Smartphone,
  Shirt,
  Croissant,
  Leaf,
  Drumstick,
  Snowflake,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package,
  Wheat,
  CupSoda,
  Sparkles,
  Brush,
  Wrench,
  Smartphone,
  Shirt,
  Croissant,
  Leaf,
  Drumstick,
  Snowflake,
};

interface CategoryIconProps {
  iconName: string | null | undefined;
  className?: string;
  fallbackClassName?: string;
}

/**
 * Renders a lucide-react icon for a category by its string name.
 * Falls back to Package icon if the name is not found.
 * This replaces the old pattern of rendering {category.icon} as text.
 */
export const CategoryIcon = ({ iconName, className, fallbackClassName }: CategoryIconProps) => {
  const IconComp = iconName && ICON_MAP[iconName];
  const Fallback = Package;

  if (IconComp) {
    return <IconComp className={cn(className)} />;
  }

  return <Fallback className={cn(fallbackClassName || className)} />;
};

export { ICON_MAP };
