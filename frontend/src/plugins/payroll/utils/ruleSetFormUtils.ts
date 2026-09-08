const DECIMAL_PATTERN = /^-?(?:\d+|\d*\.\d+)$/;

const shiftDecimal = (value: string, places: number): string => {
  const sign = value.startsWith("-") ? "-" : "";
  const unsigned = sign ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole || "0"}${fraction}`;
  const decimalIndex = (whole || "0").length + places;
  const padded =
    decimalIndex <= 0
      ? `0.${"0".repeat(-decimalIndex)}${digits}`
      : decimalIndex >= digits.length
        ? `${digits}${"0".repeat(decimalIndex - digits.length)}`
        : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  const [resultWhole, resultFraction] = padded.split(".");
  const normalizedWhole = resultWhole.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = (resultFraction ?? "").replace(/0+$/, "");
  return `${sign}${normalizedWhole}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
};

const normalizeInput = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value).trim();
  return DECIMAL_PATTERN.test(normalized) ? normalized : null;
};

export const fractionToPercent = (value: string | number | null | undefined): string => {
  const normalized = normalizeInput(value);
  return normalized === null ? "" : shiftDecimal(normalized, 2);
};

export const percentToFraction = (value: string | number | null | undefined): string => {
  const normalized = normalizeInput(value);
  return normalized === null ? "" : shiftDecimal(normalized, -2);
};

export const parseOptionalDecimal = (value: string): string | null => {
  const normalized = normalizeInput(value);
  return normalized === null ? null : normalized;
};
