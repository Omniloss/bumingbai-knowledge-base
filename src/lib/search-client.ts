import ky, { isKyError } from "ky";
import { z } from "zod";
import { type SearchIndex, SearchIndexSchema } from "./search.js";

const searchIndexClient = ky.create({
  retry: { limit: 1, methods: ["get"] },
  timeout: 5000,
});

export class SearchIndexLoadError extends Error {
  readonly name = "SearchIndexLoadError";

  constructor() {
    super("Search index is unavailable.");
  }
}

export async function loadSearchIndex(): Promise<SearchIndex> {
  try {
    const value: unknown = await searchIndexClient
      .get("/search-index.json")
      .json();
    return SearchIndexSchema.parse(value);
  } catch (error) {
    if (
      isKyError(error) ||
      error instanceof z.ZodError ||
      error instanceof SyntaxError
    ) {
      throw new SearchIndexLoadError();
    }
    throw error;
  }
}
