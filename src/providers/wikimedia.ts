import { z } from "zod";
import type { ProviderClient, ProviderResult, WorkLookup } from "./types.js";

const SearchResponseSchema = z.object({
  search: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string().optional(),
    }),
  ),
});
const ClaimSchema = z.object({
  mainsnak: z.object({
    datatype: z.string(),
    datavalue: z.object({ value: z.unknown(), type: z.string() }).optional(),
  }),
});
const LanguageValueSchema = z.object({
  language: z.string(),
  value: z.string(),
});
const EntitySchema = z.object({
  id: z.string(),
  labels: z.object({ en: LanguageValueSchema.optional() }).optional(),
  descriptions: z.object({ en: LanguageValueSchema.optional() }).optional(),
  claims: z
    .object({ P18: z.array(ClaimSchema).optional() })
    .catchall(z.array(ClaimSchema)),
});
const EntitiesResponseSchema = z.object({
  entities: z.record(z.string(), EntitySchema),
});
const MetadataValueSchema = z.object({ value: z.string().min(1) });
const CommonsResponseSchema = z.object({
  query: z.object({
    pages: z.record(
      z.string(),
      z.object({
        imageinfo: z
          .array(
            z.object({
              url: z.url(),
              descriptionurl: z.url(),
              extmetadata: z.object({
                LicenseShortName: MetadataValueSchema.optional(),
                Artist: MetadataValueSchema.optional(),
                Credit: MetadataValueSchema.optional(),
              }),
            }),
          )
          .optional(),
      }),
    ),
  }),
});

export type CommonsImageCandidate = {
  url: string;
  sourcePageUrl: string;
  license: string;
  artist: string;
  credit: string;
  attribution: string;
};

export type WikimediaRecord = {
  externalId: string;
  title: string;
  description?: string;
  sourcePageUrl: string;
  license: "CC0";
  externalIds: Record<string, string[]>;
  image?: CommonsImageCandidate;
};

function apiUrl(base: string, parameters: Record<string, string>): URL {
  const url = new URL(base);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>) {
  if (!response.ok)
    throw new Error(`Wikimedia request failed: ${response.status}`);
  const payload: unknown = await response.json();
  return schema.parse(payload);
}

function claimValues(
  claims: z.infer<typeof EntitySchema>["claims"],
  datatype: string,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [property, statements] of Object.entries(claims)) {
    const values = (statements ?? []).flatMap((statement) => {
      const value = stringClaimValue(statement, datatype);
      return value === undefined ? [] : [value];
    });
    if (values.length > 0) result[property] = values;
  }
  return result;
}

function stringClaimValue(
  statement: z.infer<typeof ClaimSchema>,
  datatype: string,
): string | undefined {
  if (statement.mainsnak.datatype !== datatype) return undefined;
  const value = z.string().safeParse(statement.mainsnak.datavalue?.value);
  return value.success ? value.data : undefined;
}

function firstClaim(
  statements: z.infer<typeof ClaimSchema>[] | undefined,
  datatype: string,
): string | undefined {
  for (const statement of statements ?? []) {
    const value = stringClaimValue(statement, datatype);
    if (value !== undefined) return value;
  }
  return undefined;
}

function imageFromCommons(
  response: z.infer<typeof CommonsResponseSchema>,
): CommonsImageCandidate | undefined {
  const info = Object.values(response.query.pages)[0]?.imageinfo?.[0];
  const license = info?.extmetadata.LicenseShortName?.value.trim();
  const artist = info?.extmetadata.Artist?.value.trim();
  const credit = info?.extmetadata.Credit?.value.trim();
  if (info === undefined || !license || !artist || !credit) return undefined;
  return {
    url: info.url,
    sourcePageUrl: info.descriptionurl,
    license,
    artist,
    credit,
    attribution: `${credit}; ${artist}`,
  };
}

export class WikimediaClient implements ProviderClient<WikimediaRecord> {
  readonly name = "wikidata" as const;

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async commonsImage(
    filename: string | undefined,
  ): Promise<CommonsImageCandidate | undefined> {
    if (filename === undefined) return undefined;
    const url = apiUrl("https://commons.wikimedia.org/w/api.php", {
      action: "query",
      format: "json",
      prop: "imageinfo",
      titles: `File:${filename}`,
      iiprop: "url|extmetadata",
      iiextmetadatafilter: "LicenseShortName|Artist|Credit",
    });
    return imageFromCommons(
      await parseResponse(await this.fetcher(url), CommonsResponseSchema),
    );
  }

  async lookup(query: WorkLookup): Promise<ProviderResult<WikimediaRecord>> {
    const base = "https://www.wikidata.org/w/api.php";
    const searchUrl = apiUrl(base, {
      action: "wbsearchentities",
      format: "json",
      search: query.originalTitle ?? query.title,
      language: "en",
      uselang: "en",
      type: "item",
      limit: "5",
    });
    const search = await parseResponse(
      await this.fetcher(searchUrl),
      SearchResponseSchema,
    );
    if (search.search.length === 0) {
      return {
        provider: this.name,
        retrievedAt: new Date().toISOString(),
        records: [],
      };
    }

    const ids = search.search.map((candidate) => candidate.id);
    const entitiesUrl = apiUrl(base, {
      action: "wbgetentities",
      format: "json",
      ids: ids.join("|"),
      props: "labels|descriptions|claims",
      languages: "en",
    });
    const response = await parseResponse(
      await this.fetcher(entitiesUrl),
      EntitiesResponseSchema,
    );
    const records = await Promise.all(
      ids.flatMap((id) => {
        const entity = response.entities[id];
        if (entity === undefined) return [];
        return [this.toRecord(entity)];
      }),
    );
    return {
      provider: this.name,
      retrievedAt: new Date().toISOString(),
      records,
    };
  }

  private async toRecord(
    entity: z.infer<typeof EntitySchema>,
  ): Promise<WikimediaRecord> {
    const image = await this.commonsImage(
      firstClaim(entity.claims.P18, "commonsMedia"),
    );
    const record: WikimediaRecord = {
      externalId: entity.id,
      title: entity.labels?.en?.value ?? entity.id,
      sourcePageUrl: `https://www.wikidata.org/wiki/${entity.id}`,
      license: "CC0",
      externalIds: claimValues(entity.claims, "external-id"),
    };
    const description = entity.descriptions?.en?.value;
    if (description !== undefined) record.description = description;
    if (image !== undefined) record.image = image;
    return record;
  }
}
