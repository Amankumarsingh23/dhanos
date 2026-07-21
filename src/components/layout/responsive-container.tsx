import type { ComponentProps, ElementType } from "react";
import { cn } from "@/lib/utils";

type ResponsiveContainerProps<T extends ElementType> = {
  as?: T;
  /** Caps line length for dense financial tables/forms; "wide" for dashboards. */
  size?: "narrow" | "default" | "wide";
} & Omit<ComponentProps<T>, "as">;

const SIZE_CLASSES = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

export function ResponsiveContainer<T extends ElementType = "div">({
  as,
  size = "default",
  className,
  ...props
}: ResponsiveContainerProps<T>) {
  const Component = as ?? "div";
  return (
    <Component
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
}
