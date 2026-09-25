/**
 * Centralized API errors — the TypeScript replacement for the Django REST
 * Framework exception handler (backend/common/exceptions.py).
 *
 * Every error that reaches the route wrapper is rendered as the §28 envelope:
 *   { "success": false, "message": "...", "errors": { field: ["..."] } }
 *
 * The DEFAULT_MESSAGES table is copied verbatim from the Django implementation
 * so status/message pairs stay byte-compatible.
 */

export type FieldErrors = Record<string, string[]>;

export const DEFAULT_MESSAGES: Record<number, string> = {
  400: "The request could not be processed.",
  401: "Authentication credentials were not provided or are invalid.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource was not found.",
  405: "This method is not allowed for this endpoint.",
  409: "The request conflicts with the current state of the resource.",
  413: "The uploaded file is too large.",
  415: "The submitted data type is not supported.",
  422: "The submitted data failed validation.",
  429: "Too many requests. Please try again later.",
  500: "The request failed.",
};

export class ApiError extends Error {
  readonly status: number;
  readonly errors: FieldErrors;

  constructor(status: number, message?: string, errors: FieldErrors = {}) {
    super(message ?? DEFAULT_MESSAGES[status] ?? "The request failed.");
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

/** DRF serializer validation failure: 400 with per-field errors. */
export class ValidationError extends ApiError {
  constructor(errors: FieldErrors, message?: string) {
    super(400, message ?? DEFAULT_MESSAGES[400], errors);
  }
}

export const badRequest = (message?: string, errors?: FieldErrors) =>
  new ApiError(400, message, errors);

export const unauthorized = (message?: string) => new ApiError(401, message);

export const forbidden = (message?: string) => new ApiError(403, message);

export const notFound = (message?: string) => new ApiError(404, message);

/** Django REST's "Invalid page." (out-of-range / non-numeric ?page=). */
export const invalidPage = () => new ApiError(404, "Invalid page.");

export const conflict = (message?: string, errors?: FieldErrors) =>
  new ApiError(409, message, errors);

export const throttled = () => new ApiError(429, "Request was throttled.");

/** Permission messages used by the Django permission classes (§30). */
export const PERMISSION_MESSAGES = {
  patient: "This action is available to patients only.",
  doctor: "This action is available to doctors only.",
  admin: "This action is available to administrators only.",
} as const;

export const nonFieldError = (message: string) =>
  new ValidationError({ non_field_errors: [message] });
