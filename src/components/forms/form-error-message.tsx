import { CircleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type FormErrorMessageProps = {
  /** Pass the react-hook-form field error message, or undefined/null when there's no error. */
  message?: string | null;
  /** Must match the associated field's `aria-describedby` for screen readers to announce it. */
  id?: string;
  className?: string;
};

/** Renders nothing when there's no message — safe to render unconditionally next to every field. */
export function FormErrorMessage({
  message,
  id,
  className,
}: FormErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <p
      id={id}
      role="alert"
      className={cn(
        "text-destructive flex items-center gap-1.5 text-sm",
        className,
      )}
    >
      <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
