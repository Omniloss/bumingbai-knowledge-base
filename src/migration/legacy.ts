import type { Catalog } from "../domain/schemas/catalog.js";
import { buildCatalog } from "./legacy-catalog.js";
import { LegacyRootSchema } from "./legacy-schema.js";

export { LegacyEpisodeReferenceError } from "./legacy-error.js";

export function migrateLegacy(input: unknown, generatedAt: string): Catalog {
  const legacy = LegacyRootSchema.parse(input);
  return buildCatalog(legacy, generatedAt);
}
