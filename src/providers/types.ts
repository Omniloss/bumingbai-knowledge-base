export type ProviderName =
  | "open_library"
  | "tmdb"
  | "wikidata"
  | "commons"
  | "workers_ai";

export type WorkLookup = {
  workId: string;
  title: string;
  originalTitle?: string;
  originalLanguage?: string;
  creatorNames: string[];
  year?: number;
  mediaType:
    | "book"
    | "film"
    | "television"
    | "documentary"
    | "podcast"
    | "other";
};

export type ProviderResult<T> = {
  provider: ProviderName;
  retrievedAt: string;
  records: T[];
};

export interface ProviderClient<T> {
  readonly name: ProviderName;
  lookup(query: WorkLookup): Promise<ProviderResult<T>>;
}
