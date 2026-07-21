import { z } from "zod";

export const WikimediaClaimSchema = z.object({
  mainsnak: z.object({
    datatype: z.string(),
    datavalue: z.object({ value: z.unknown(), type: z.string() }).optional(),
  }),
});

type WikimediaClaim = z.infer<typeof WikimediaClaimSchema>;
type WikimediaClaims = Record<string, WikimediaClaim[] | undefined>;

function stringClaimValue(
  statement: WikimediaClaim,
  datatype: string,
): string | undefined {
  if (statement.mainsnak.datatype !== datatype) return undefined;
  const value = z.string().safeParse(statement.mainsnak.datavalue?.value);
  return value.success ? value.data : undefined;
}

export function firstStringClaim(
  statements: WikimediaClaim[] | undefined,
  datatype: string,
): string | undefined {
  for (const statement of statements ?? []) {
    const value = stringClaimValue(statement, datatype);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function externalIdClaims(
  claims: WikimediaClaims,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [property, statements] of Object.entries(claims)) {
    const values = (statements ?? []).flatMap((statement) => {
      const value = stringClaimValue(statement, "external-id");
      return value === undefined ? [] : [value];
    });
    if (values.length > 0) result[property] = values;
  }
  return result;
}

const WikibaseItemValueSchema = z.object({ id: z.string().regex(/^Q\d+$/u) });

export function wikibaseItemClaims(
  statements: WikimediaClaim[] | undefined,
): string[] {
  return (statements ?? []).flatMap((statement) => {
    if (statement.mainsnak.datatype !== "wikibase-item") return [];
    const value = WikibaseItemValueSchema.safeParse(
      statement.mainsnak.datavalue?.value,
    );
    return value.success ? [value.data.id] : [];
  });
}

const TimeValueSchema = z.object({
  time: z.string().regex(/^[+-]\d{4,}-\d{2}-\d{2}T/u),
});

export function publicationYearClaims(
  statements: WikimediaClaim[] | undefined,
): number[] {
  return (statements ?? []).flatMap((statement) => {
    if (statement.mainsnak.datatype !== "time") return [];
    const value = TimeValueSchema.safeParse(
      statement.mainsnak.datavalue?.value,
    );
    if (!value.success) return [];
    const year = Number.parseInt(
      value.data.time.slice(1).split("-")[0] ?? "",
      10,
    );
    return Number.isInteger(year) && year > 0 ? [year] : [];
  });
}
