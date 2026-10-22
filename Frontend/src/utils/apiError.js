const LOCATIONS = ["body", "query", "path", "header", "form"];

const fieldName = (loc) => {
  const parts = (Array.isArray(loc) ? loc : []).filter(p => !LOCATIONS.includes(p));
  return parts.length ? String(parts[parts.length - 1]).replace(/_/g, " ") : "";
};

const itemText = (item) => {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  const field = fieldName(item.loc);
  const message = typeof item.msg === "string" ? item.msg : "";
  return field && message ? `${field}: ${message}` : message || field;
};

export function apiErrorText(error, fallback = "Something went wrong. Please try again.") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const text = detail.map(itemText).filter(Boolean).join("; ");
    if (text) return text;
  }
  if (detail && typeof detail === "object" && typeof detail.msg === "string") return itemText(detail);
  if (error?.response) return fallback;
  if (error?.code === "ECONNABORTED") return "The server took too long to respond. Please try again.";
  if (error?.request) return "Cannot reach the server. Check your connection and try again.";
  return fallback;
}
