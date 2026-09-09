import { toast } from "sonner";
import { ERROR_CODES, ERROR_MESSAGES } from "./error-messages";

type ApiErrorResponse = {
  response?: {
    status?: number;
    data?: {
      detail?: string;
      message?: string;
      error?: string;
      non_field_errors?: string[];
      [key: string]: unknown;
    };
  };
  message?: string;
};

type ErrorPattern = { patterns: string[]; errorCode: string };

const VALIDATION_PATTERNS: ErrorPattern[] = [
  {
    patterns: ["End date must be after start date", "end_date must be after start date"],
    errorCode: ERROR_CODES.VALIDATION_INVALID_DATE,
  },
  {
    patterns: ["Overlapping leave request", "overlapping leave request"],
    errorCode: ERROR_CODES.VALIDATION_OVERLAPPING_REQUEST,
  },
  {
    patterns: ["Insufficient leave balance", "insufficient leave balance"],
    errorCode: ERROR_CODES.VALIDATION_INSUFFICIENT_BALANCE,
  },
  {
    patterns: ["Hours cannot exceed 24", "hours cannot exceed 24"],
    errorCode: ERROR_CODES.VALIDATION_HOURS_EXCEEDED,
  },
  {
    patterns: ["Provide either hours", "start_time and end_time must be provided together"],
    errorCode: ERROR_CODES.VALIDATION_HOURS_REQUIRED,
  },
  { patterns: ["Invalid email", "email"], errorCode: ERROR_CODES.VALIDATION_INVALID_EMAIL },
  {
    patterns: ["Password must be at least 6 characters"],
    errorCode: ERROR_CODES.VALIDATION_PASSWORD_TOO_SHORT,
  },
  { patterns: ["Username already exists"], errorCode: ERROR_CODES.VALIDATION_USERNAME_EXISTS },
  {
    patterns: ["Invalid file type", "CSV file"],
    errorCode: ERROR_CODES.VALIDATION_INVALID_FILE_TYPE,
  },
  {
    patterns: ["Invalid file encoding", "UTF-8"],
    errorCode: ERROR_CODES.VALIDATION_INVALID_FILE_ENCODING,
  },
  {
    patterns: ["This field may not be blank", "is required", "field is required"],
    errorCode: ERROR_CODES.VALIDATION_EMPTY_FIELD,
  },
  {
    patterns: ["Enter a valid number", "must be a number", "not a valid number"],
    errorCode: ERROR_CODES.VALIDATION_INVALID_NUMBER,
  },
  {
    patterns: ["Invalid time", "time format", "invalid time format"],
    errorCode: ERROR_CODES.VALIDATION_INVALID_TIME,
  },
  {
    patterns: ["Select a valid choice", "make a selection", "required selection"],
    errorCode: ERROR_CODES.VALIDATION_MISSING_SELECTION,
  },
  { patterns: ["Invalid phone", "phone number"], errorCode: ERROR_CODES.VALIDATION_INVALID_PHONE },
  {
    patterns: ["Date in the past", "cannot be in the past", "must be in the future"],
    errorCode: ERROR_CODES.VALIDATION_DATE_IN_PAST,
  },
  {
    patterns: ["too far in the future", "exceeds maximum date"],
    errorCode: ERROR_CODES.VALIDATION_DATE_TOO_FAR_FUTURE,
  },
  {
    patterns: ["too long", "exceeds maximum length", "character limit"],
    errorCode: ERROR_CODES.VALIDATION_FIELD_TOO_LONG,
  },
  {
    patterns: ["already exists", "duplicate", "unique constraint"],
    errorCode: ERROR_CODES.VALIDATION_DUPLICATE_ENTRY,
  },
  {
    patterns: ["out of range", "must be between", "outside the allowed range"],
    errorCode: ERROR_CODES.VALIDATION_INVALID_RANGE,
  },
];

const PERMISSION_PATTERNS: ErrorPattern[] = [
  {
    patterns: ["Only team leaders", "team leaders can access"],
    errorCode: ERROR_CODES.PERMISSION_NOT_TEAM_LEADER,
  },
  {
    patterns: ["Only superusers", "superusers can access"],
    errorCode: ERROR_CODES.PERMISSION_ONLY_SUPERUSER,
  },
  { patterns: ["HR users have view-only", "HR users"], errorCode: ERROR_CODES.PERMISSION_ONLY_HR },
  { patterns: ["No permission"], errorCode: ERROR_CODES.PERMISSION_NO_PERMISSION },
];

const RESOURCE_PATTERNS: ErrorPattern[] = [
  {
    patterns: ["User not found", "Target user not found"],
    errorCode: ERROR_CODES.RESOURCE_USER_NOT_FOUND,
  },
];

const NETWORK_PATTERNS: ErrorPattern[] = [
  { patterns: ["Network Error", "ERR_NETWORK", "timeout"], errorCode: ERROR_CODES.NETWORK_ERROR },
];

const matchPattern = (text: string, patterns: ErrorPattern[]): string | null => {
  const lowerText = text.toLowerCase();
  for (const { patterns: patternList, errorCode } of patterns) {
    if (patternList.some((p) => lowerText.includes(p.toLowerCase()))) return errorCode;
  }
  return null;
};

const extractResponse = (error: unknown): ApiErrorResponse["response"] | null => {
  if (error && typeof error === "object" && "response" in error) {
    return (error as ApiErrorResponse).response;
  }
  return null;
};

const detect400 = (response: ApiErrorResponse["response"]): string => {
  const dataStr = JSON.stringify(response?.data || "");
  return matchPattern(dataStr, VALIDATION_PATTERNS) || ERROR_CODES.VALIDATION_REQUIRED_FIELD;
};

const detect403 = (response: ApiErrorResponse["response"]): string => {
  const errorStr = response?.data?.error || response?.data?.detail || "";
  return matchPattern(errorStr, PERMISSION_PATTERNS) || ERROR_CODES.PERMISSION_NO_WORKSPACE_ACCESS;
};

const detect404 = (response: ApiErrorResponse["response"]): string => {
  const errorStr = response?.data?.error || response?.data?.detail || "";
  return matchPattern(errorStr, RESOURCE_PATTERNS) || ERROR_CODES.RESOURCE_NOT_FOUND;
};

const detectNetwork = (error: unknown): string | null => {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as ApiErrorResponse).message || "";
    return matchPattern(message, NETWORK_PATTERNS);
  }
  return null;
};

const detectErrorCode = (error: unknown): string => {
  const response = extractResponse(error);
  if (response) {
    const status = response.status;
    if (status === 400) return detect400(response);
    if (status === 403) return detect403(response);
    if (status === 404) return detect404(response);
    if (status === 401) return ERROR_CODES.AUTHENTICATION_ERROR;
  }
  return detectNetwork(error) || ERROR_CODES.UNKNOWN_ERROR;
};

const extractBackendMessage = (response: ApiErrorResponse["response"]): string => {
  const data = response?.data;
  if (!data) return "";
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (data.message) return data.message;
  if (data.error) return data.error;
  if (data.non_field_errors && Array.isArray(data.non_field_errors))
    return data.non_field_errors.join(", ");
  if (Array.isArray(data)) return data.join(", ");
  const fieldErrors = Object.entries(data)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
  return fieldErrors.join("; ");
};

export const handleApiError = (error: unknown): string => {
  console.error("API Error:", error);
  const errorCode = detectErrorCode(error);
  const errorInfo = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR];
  const backendMessage = extractBackendMessage(extractResponse(error) ?? undefined);
  toast.error(errorInfo.title, {
    description:
      backendMessage || `${errorInfo.message}${errorInfo.action ? ` ${errorInfo.action}` : ""}`,
    duration: 5000,
  });
  return errorInfo.message;
};
