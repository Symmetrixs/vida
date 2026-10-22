const PILL = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";

export const OPEN_STATUSES = ["assigned", "in_progress"];

export const STATUS_LABEL = {
  pending:     "pending",
  assigned:    "assigned",
  in_progress: "in progress",
  submitted:   "awaiting review",
  reviewed:    "reviewed",
  rejected:    "rejected",
};

export const STATUS_CLASS = {
  pending:     "badge-yellow",
  assigned:    "badge-gray",
  in_progress: "badge-blue",
  submitted:   `${PILL} bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300`,
  reviewed:    "badge-green",
  rejected:    "badge-red",
};

export const SEVERITIES = ["low", "medium", "high", "critical"];

export const SEVERITY_CLASS = {
  low:      `${PILL} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`,
  medium:   `${PILL} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300`,
  high:     `${PILL} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`,
  critical: `${PILL} bg-red-600 text-white`,
};

export const SEVERITY_HELP = {
  low:      "Cosmetic. No action needed soon.",
  medium:   "Needs repair in routine maintenance.",
  high:     "Needs repair soon. Could get worse or affect use.",
  critical: "Safety risk. Needs urgent action.",
};

export const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : "";
export const fmtDay = (d) => d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-MY", { dateStyle: "medium" }) : "";
