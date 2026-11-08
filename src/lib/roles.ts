export type AppRole = "Admin" | "Employee";

export function normalizeRole(value: unknown): AppRole {
  if (value === "Admin" || value === "admin" || value === "Administrator") return "Admin";
  return "Employee";
}
