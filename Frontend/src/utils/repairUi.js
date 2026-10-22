const PILL = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";

export const JOB_STATUS_LABEL = {
  open:            "on job board",
  in_progress:     "in progress",
  awaiting_review: "awaiting review",
  done:            "done",
};

export const JOB_STATUS_CLASS = {
  open:            "badge-yellow",
  in_progress:     "badge-blue",
  awaiting_review: `${PILL} bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300`,
  done:            "badge-green",
};

export const REWORK_CLASS = `${PILL} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`;

export const defectLabel = (s) => (s || "").replace(/_/g, " ");

export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const countsText = (counts) => {
  const entries = Object.entries(counts || {}).filter(([, n]) => n > 0);
  if (entries.length === 0) return "No defects detected";
  return entries.map(([label, n]) => `${n} ${defectLabel(label)}`).join(", ");
};

export const EVENT_TEXT = {
  created:    (e) => `Job created by ${e.actor_name || "a facility manager"}`,
  claimed:    (e) => `Claimed from the Job Board by ${e.actor_name || "a worker"}`,
  assigned:   (e) => `Assigned to ${e.to_name || "a worker"} by ${e.actor_name || "a facility manager"}`,
  reassigned: (e) => `Reassigned from ${e.from_name || "a worker"} to ${e.to_name || "a worker"} by ${e.actor_name || "a facility manager"}`,
  submitted:  (e) => `Submission ${e.round} by ${e.actor_name || "the worker"}`,
  sent_back:  (e) => `Sent back for rework by ${e.actor_name || "a facility manager"}`,
  approved:   (e) => `Approved by ${e.actor_name || "a facility manager"}`,
};
