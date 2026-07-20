export const LOW_RISK_OFFICIAL_FIELDS = [
  "number",
  "title",
  "publishedAt",
  "duration",
  "officialUrl",
  "transcriptUrl",
  "guestNames",
] as const;

const LOW_RISK_FIELDS: ReadonlySet<string> = new Set(LOW_RISK_OFFICIAL_FIELDS);

export function classifyField(field: string): "low" | "high" {
  return LOW_RISK_FIELDS.has(field) ? "low" : "high";
}
