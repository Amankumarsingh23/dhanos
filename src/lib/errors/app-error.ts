export type AppErrorCode =
  | "validation_error"
  | "not_found"
  | "permission_denied"
  | "configuration_error"
  | "conflict"
  | "rate_limited"
  | "unknown_error";

/**
 * Base class for all application-thrown errors. `message` is safe to show
 * to the user; anything sensitive belongs in `cause`, which is logged
 * server-side but never rendered.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(
    message: string,
    options: { code: AppErrorCode; cause?: unknown } = {
      code: "unknown_error",
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: "validation_error", cause });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = "The requested item could not be found.",
    cause?: unknown,
  ) {
    super(message, { code: "not_found", cause });
    this.name = "NotFoundError";
  }
}

export class PermissionDeniedError extends AppError {
  constructor(
    message = "You don't have permission to do that.",
    cause?: unknown,
  ) {
    super(message, { code: "permission_denied", cause });
    this.name = "PermissionDeniedError";
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: "configuration_error", cause });
    this.name = "ConfigurationError";
  }
}

/** Thrown when a caller has exceeded an endpoint-specific request quota (e.g. household data export — see docs/security-model.md §5/§6, "a full financial export is a high-value target"). */
export class RateLimitError extends AppError {
  constructor(
    message = "Too many requests. Please try again later.",
    cause?: unknown,
  ) {
    super(message, { code: "rate_limited", cause });
    this.name = "RateLimitError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** A message safe to render to the user, never leaking internal detail for unknown errors. */
export function toUserMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
