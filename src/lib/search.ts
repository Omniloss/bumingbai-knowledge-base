import { z } from "zod";

export const SearchKindSchema = z.enum(["episode", "work", "person", "topic"]);

const InternalCatalogPathSchema = z
  .string()
  .regex(/^\/(?:episodes|works|people|topics)\/[^/]+\/$/u);

export const SearchRecordSchema = z
  .object({
    aliases: z.array(z.string()).readonly(),
    id: z.string(),
    kind: SearchKindSchema,
    title: z.string(),
    tokens: z.array(z.string()).readonly(),
    url: InternalCatalogPathSchema,
  })
  .readonly();

export const SearchIndexSchema = z.array(SearchRecordSchema).readonly();

export type SearchKind = z.infer<typeof SearchKindSchema>;
export type SearchRecord = z.infer<typeof SearchRecordSchema>;
export type SearchIndex = z.infer<typeof SearchIndexSchema>;

export function tokenizeForSearch(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("zh-CN");
  const latin = normalized.match(/[a-z0-9]+/gu) ?? [];
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  const bigrams = chinese
    .slice(0, -1)
    .map((character, index) => `${character}${chinese[index + 1]}`);

  return [...new Set([...latin, ...bigrams])];
}

export function rankSearchRecords(
  records: SearchIndex,
  rawQuery: string,
): SearchIndex {
  const query = rawQuery.normalize("NFKC").toLocaleLowerCase("zh-CN");
  const queryTokens = tokenizeForSearch(query);

  return records
    .flatMap((record) => {
      const hasPrefix = [record.title, ...record.aliases].some((field) =>
        field.normalize("NFKC").toLocaleLowerCase("zh-CN").startsWith(query),
      );
      const matchingTokens = queryTokens.filter((token) =>
        record.tokens.includes(token),
      ).length;
      return hasPrefix || matchingTokens > 0
        ? [{ hasPrefix, matchingTokens, record }]
        : [];
    })
    .toSorted((left, right) => {
      const prefixOrder = Number(right.hasPrefix) - Number(left.hasPrefix);
      if (prefixOrder !== 0) return prefixOrder;

      const tokenOrder = right.matchingTokens - left.matchingTokens;
      return (
        tokenOrder ||
        left.record.title.localeCompare(right.record.title, "zh-CN") ||
        left.record.id.localeCompare(right.record.id)
      );
    })
    .map(({ record }) => record);
}
