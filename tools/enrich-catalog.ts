import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateCatalog } from "../src/domain/publication.js";
import { CatalogSchema } from "../src/domain/schemas/catalog.js";
import type { EmbeddingClient } from "../src/enrichment/embeddings.js";
import { enrichCatalog } from "../src/enrichment/enrich-catalog.js";
import { writeEnrichmentOutputs } from "../src/enrichment/write-output.js";
import { OpenLibraryClient } from "../src/providers/open-library.js";
import { TmdbClient } from "../src/providers/tmdb.js";
import type { ProviderClient } from "../src/providers/types.js";
import { WikimediaClient } from "../src/providers/wikimedia.js";
import { WorkersAiClient } from "../src/providers/workers-ai.js";
import { readCatalog } from "./validate-data.js";

type WriteLine = (line: string) => void;

type EnrichmentEnvironment = Readonly<
  Record<string, string | undefined> & {
    readonly CLOUDFLARE_ACCOUNT_ID?: string;
    readonly CLOUDFLARE_API_TOKEN?: string;
    readonly TMDB_API_TOKEN?: string;
  }
>;

export type EnrichmentCliDependencies = {
  readonly rootDir?: string;
  readonly clients?: ProviderClient<unknown>[];
  readonly env?: EnrichmentEnvironment;
  readonly embeddingClient?: EmbeddingClient;
  readonly now?: string;
  readonly writeLine?: WriteLine;
};

type ParsedFlags = {
  readonly forceRefresh: boolean;
  readonly offline: boolean;
};

function parseFlags(args: readonly string[]): ParsedFlags | undefined {
  if (args.some((arg) => arg !== "--offline" && arg !== "--refresh")) {
    return undefined;
  }
  const offline = args.includes("--offline");
  const forceRefresh = args.includes("--refresh");
  if (offline && forceRefresh) return undefined;
  return { offline, forceRefresh };
}

function defaultClients(env: EnrichmentEnvironment): ProviderClient<unknown>[] {
  const clients: ProviderClient<unknown>[] = [
    new OpenLibraryClient(),
    new WikimediaClient(),
  ];
  const token = env.TMDB_API_TOKEN?.trim();
  if (token) clients.push(new TmdbClient(token));
  return clients;
}

function reportOptionalProviders(
  env: EnrichmentEnvironment,
  writeLine: WriteLine,
): void {
  if (!env.TMDB_API_TOKEN?.trim()) {
    writeLine("TMDB skipped: TMDB_API_TOKEN is not configured");
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID?.trim() || !env.CLOUDFLARE_API_TOKEN?.trim()) {
    writeLine("Workers AI skipped: Cloudflare credentials are not configured");
  }
}

function defaultEmbeddingClient(
  env: EnrichmentEnvironment,
): EmbeddingClient | undefined {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) return undefined;
  const client = new WorkersAiClient({ accountId, token });
  return {
    model: "@cf/qwen/qwen3-embedding-0.6b",
    embed: (texts) => client.embed(texts),
  };
}

export async function runEnrichmentCli(
  args: readonly string[],
  dependencies: EnrichmentCliDependencies = {},
): Promise<number> {
  const writeLine = dependencies.writeLine ?? (() => undefined);
  const flags = parseFlags(args);
  if (flags === undefined) {
    writeLine("Usage: bun run tools/enrich-catalog.ts [--offline | --refresh]");
    return 2;
  }
  const rootDir = dependencies.rootDir ?? process.cwd();
  const env = dependencies.env ?? process.env;
  reportOptionalProviders(env, writeLine);
  const embeddingClient =
    dependencies.embeddingClient ?? defaultEmbeddingClient(env);

  try {
    const catalog = await readCatalog(rootDir);
    const enriched = CatalogSchema.parse(
      await enrichCatalog(
        catalog,
        dependencies.clients ?? defaultClients(env),
        {
          cacheRoot: join(rootDir, ".cache", "providers"),
          now: dependencies.now ?? new Date().toISOString(),
          offline: flags.offline,
          forceRefresh: flags.forceRefresh,
          ...(embeddingClient === undefined ? {} : { embeddingClient }),
        },
      ),
    );
    const issues = validateCatalog(enriched);
    if (issues.length > 0) return 1;
    await writeEnrichmentOutputs(rootDir, enriched);
    writeLine(
      `enriched providerRecords=${enriched.providerRecords.length} imageAssets=${enriched.imageAssets.length} workRelations=${enriched.workRelations.length} reviewIssues=${enriched.reviewIssues.length}`,
    );
    return 0;
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "UnknownError";
    writeLine(`Enrichment failed: ${name}`);
    return 1;
  }
}

export async function main(): Promise<void> {
  process.exitCode = await runEnrichmentCli(process.argv.slice(2), {
    writeLine: (line) => process.stdout.write(`${line}\n`),
  });
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(entryPath).href
) {
  await main();
}
