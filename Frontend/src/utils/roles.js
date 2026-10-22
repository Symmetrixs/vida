export const ROLE_OPTIONS = [
  { value: "inspector",        label: "Inspector",        badge: "badge-green",  desc: "Creates inspections and reports" },
  { value: "maintenance",      label: "Maintenance",      badge: "badge-yellow", desc: "Carries out repair work" },
  { value: "facility_manager", label: "Facility Manager", badge: "badge-blue",   desc: "Handles complaints and severity review" },
  { value: "admin",            label: "Admin",            badge: "badge-red",    desc: "Manages staff, buildings and statistics" },
];

export const roleLabel = (role) => ROLE_OPTIONS.find((o) => o.value === role)?.label || role;

export const roleBadge = (role) => ROLE_OPTIONS.find((o) => o.value === role)?.badge || "badge-gray";

export const rolesText = (roles) => (roles || []).map(roleLabel).join(" · ");
