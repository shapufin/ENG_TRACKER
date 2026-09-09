/**
 * Centralized error message system for user-friendly error handling.
 * Maps error codes to specific messages with actionable guidance.
 */

// Error code constants
export const ERROR_CODES = {
  VALIDATION_REQUIRED_FIELD: "VALIDATION_REQUIRED_FIELD",
  VALIDATION_INVALID_DATE: "VALIDATION_INVALID_DATE",
  VALIDATION_INSUFFICIENT_BALANCE: "VALIDATION_INSUFFICIENT_BALANCE",
  VALIDATION_OVERLAPPING_REQUEST: "VALIDATION_OVERLAPPING_REQUEST",
  VALIDATION_HOURS_EXCEEDED: "VALIDATION_HOURS_EXCEEDED",
  VALIDATION_HOURS_REQUIRED: "VALIDATION_HOURS_REQUIRED",
  VALIDATION_INVALID_EMAIL: "VALIDATION_INVALID_EMAIL",
  VALIDATION_PASSWORD_TOO_SHORT: "VALIDATION_PASSWORD_TOO_SHORT",
  VALIDATION_USERNAME_EXISTS: "VALIDATION_USERNAME_EXISTS",
  VALIDATION_INVALID_FILE_TYPE: "VALIDATION_INVALID_FILE_TYPE",
  VALIDATION_INVALID_FILE_ENCODING: "VALIDATION_INVALID_FILE_ENCODING",
  VALIDATION_EMPTY_FIELD: "VALIDATION_EMPTY_FIELD",
  VALIDATION_INVALID_NUMBER: "VALIDATION_INVALID_NUMBER",
  VALIDATION_INVALID_TIME: "VALIDATION_INVALID_TIME",
  VALIDATION_MISSING_SELECTION: "VALIDATION_MISSING_SELECTION",
  VALIDATION_INVALID_PHONE: "VALIDATION_INVALID_PHONE",
  VALIDATION_DATE_IN_PAST: "VALIDATION_DATE_IN_PAST",
  VALIDATION_DATE_TOO_FAR_FUTURE: "VALIDATION_DATE_TOO_FAR_FUTURE",
  VALIDATION_FIELD_TOO_LONG: "VALIDATION_FIELD_TOO_LONG",
  VALIDATION_DUPLICATE_ENTRY: "VALIDATION_DUPLICATE_ENTRY",
  VALIDATION_INVALID_RANGE: "VALIDATION_INVALID_RANGE",
  PERMISSION_NOT_TEAM_LEADER: "PERMISSION_NOT_TEAM_LEADER",
  PERMISSION_NO_WORKSPACE_ACCESS: "PERMISSION_NO_WORKSPACE_ACCESS",
  PERMISSION_ONLY_SUPERUSER: "PERMISSION_ONLY_SUPERUSER",
  PERMISSION_ONLY_HR: "PERMISSION_ONLY_HR",
  PERMISSION_NO_PERMISSION: "PERMISSION_NO_PERMISSION",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RESOURCE_USER_NOT_FOUND: "RESOURCE_USER_NOT_FOUND",
  NETWORK_ERROR: "NETWORK_ERROR",
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

// Error message mapping with actionable guidance
export const ERROR_MESSAGES: Record<string, { title: string; message: string; action?: string }> = {
  [ERROR_CODES.VALIDATION_REQUIRED_FIELD]: {
    title: "Required Field Missing",
    message: "Please fill in all required fields.",
    action: "Check the form for highlighted fields and complete them.",
  },
  [ERROR_CODES.VALIDATION_INVALID_DATE]: {
    title: "Invalid Date",
    message: "The end date must be after the start date.",
    action: "Please select a valid date range.",
  },
  [ERROR_CODES.VALIDATION_INSUFFICIENT_BALANCE]: {
    title: "Insufficient Leave Balance",
    message: "You do not have enough leave days available.",
    action: "Check your balance in the sidebar or contact HR for balance adjustment.",
  },
  [ERROR_CODES.VALIDATION_OVERLAPPING_REQUEST]: {
    title: "Overlapping Request",
    message: "A leave request already exists for these dates.",
    action: "Modify the dates or cancel the existing request first.",
  },
  [ERROR_CODES.VALIDATION_HOURS_EXCEEDED]: {
    title: "Hours Limit Exceeded",
    message: "Hours cannot exceed 24 in a single day.",
    action: "Please enter a valid number of hours (1-24).",
  },
  [ERROR_CODES.VALIDATION_HOURS_REQUIRED]: {
    title: "Hours Required",
    message: "Please provide either hours or both start and end times.",
    action: "Enter the number of hours or select start and end times.",
  },
  [ERROR_CODES.VALIDATION_INVALID_EMAIL]: {
    title: "Invalid Email",
    message: "The email address is not valid.",
    action: "Please enter a valid email address.",
  },
  [ERROR_CODES.VALIDATION_PASSWORD_TOO_SHORT]: {
    title: "Password Too Short",
    message: "Password must be at least 6 characters.",
    action: "Please enter a longer password.",
  },
  [ERROR_CODES.VALIDATION_USERNAME_EXISTS]: {
    title: "Username Already Exists",
    message: "This username is already taken.",
    action: "Please choose a different username.",
  },
  [ERROR_CODES.VALIDATION_INVALID_FILE_TYPE]: {
    title: "Invalid File Type",
    message: "Only CSV files are allowed.",
    action: "Please upload a CSV file.",
  },
  [ERROR_CODES.VALIDATION_INVALID_FILE_ENCODING]: {
    title: "Invalid File Encoding",
    message: "The file must be UTF-8 encoded.",
    action: "Please save the file as UTF-8 and try again.",
  },
  [ERROR_CODES.VALIDATION_EMPTY_FIELD]: {
    title: "Field Cannot Be Empty",
    message: "This field cannot be left blank.",
    action: "Please enter a value for this field.",
  },
  [ERROR_CODES.VALIDATION_INVALID_NUMBER]: {
    title: "Invalid Number",
    message: "Please enter a valid number.",
    action: "Check that you entered only digits and no special characters.",
  },
  [ERROR_CODES.VALIDATION_INVALID_TIME]: {
    title: "Invalid Time",
    message: "The time format is invalid.",
    action: "Please enter a valid time (e.g., 09:00 or 14:30).",
  },
  [ERROR_CODES.VALIDATION_MISSING_SELECTION]: {
    title: "Selection Required",
    message: "Please make a selection from the dropdown.",
    action: "Choose an option from the list.",
  },
  [ERROR_CODES.VALIDATION_INVALID_PHONE]: {
    title: "Invalid Phone Number",
    message: "The phone number format is invalid.",
    action: "Please enter a valid phone number.",
  },
  [ERROR_CODES.VALIDATION_DATE_IN_PAST]: {
    title: "Date in Past",
    message: "The selected date is in the past.",
    action: "Please select a current or future date.",
  },
  [ERROR_CODES.VALIDATION_DATE_TOO_FAR_FUTURE]: {
    title: "Date Too Far in Future",
    message: "The selected date is too far in the future.",
    action: "Please select a date within the allowed range.",
  },
  [ERROR_CODES.VALIDATION_FIELD_TOO_LONG]: {
    title: "Field Too Long",
    message: "This field exceeds the maximum character limit.",
    action: "Please shorten your input.",
  },
  [ERROR_CODES.VALIDATION_DUPLICATE_ENTRY]: {
    title: "Duplicate Entry",
    message: "This entry already exists.",
    action: "Please check for duplicates or use a different value.",
  },
  [ERROR_CODES.VALIDATION_INVALID_RANGE]: {
    title: "Value Out of Range",
    message: "The value is outside the allowed range.",
    action: "Please enter a value within the specified range.",
  },
  [ERROR_CODES.PERMISSION_NOT_TEAM_LEADER]: {
    title: "Permission Denied",
    message: "Only team leaders can perform this action.",
    action: "Contact your team leader or administrator for assistance.",
  },
  [ERROR_CODES.PERMISSION_NO_WORKSPACE_ACCESS]: {
    title: "Workspace Access Denied",
    message: "You do not have access to this workspace.",
    action: "Select a workspace you have access to or contact your administrator.",
  },
  [ERROR_CODES.PERMISSION_ONLY_SUPERUSER]: {
    title: "Admin Access Required",
    message: "Only superusers can perform this action.",
    action: "Contact your system administrator.",
  },
  [ERROR_CODES.PERMISSION_ONLY_HR]: {
    title: "View-Only Access",
    message: "HR users cannot create or modify records.",
    action: "Contact your administrator if you need write access.",
  },
  [ERROR_CODES.PERMISSION_NO_PERMISSION]: {
    title: "Permission Denied",
    message: "You do not have permission to perform this action.",
    action: "Contact your administrator for access.",
  },
  [ERROR_CODES.RESOURCE_NOT_FOUND]: {
    title: "Resource Not Found",
    message: "The requested resource could not be found.",
    action: "It may have been deleted or you may not have access.",
  },
  [ERROR_CODES.RESOURCE_USER_NOT_FOUND]: {
    title: "User Not Found",
    message: "The specified user could not be found.",
    action: "Please verify the user ID or contact support.",
  },
  [ERROR_CODES.NETWORK_ERROR]: {
    title: "Connection Error",
    message: "Unable to connect to the server.",
    action: "Check your internet connection and try again.",
  },
  [ERROR_CODES.AUTHENTICATION_ERROR]: {
    title: "Authentication Failed",
    message: "Your session has expired.",
    action: "Please log in again.",
  },
  [ERROR_CODES.TOKEN_EXPIRED]: {
    title: "Session Expired",
    message: "Your session has expired due to inactivity.",
    action: "Please log in again to continue.",
  },
  [ERROR_CODES.UNKNOWN_ERROR]: {
    title: "Operation Failed",
    message: "An unexpected error occurred.",
    action: "Please try again or contact support if the problem persists.",
  },
} as const;
