export type OfficialEpisodeSnapshot = {
  number: number;
  title: string;
  publishedAt: string;
  duration?: string;
  officialUrl: string;
  transcriptUrl?: string;
  guestNames: string[];
  descriptionHtml: string;
  sourceKind: "official_rss" | "official_wordpress";
  retrievedAt: string;
  contentHash: string;
};

export type SyncRisk = "low" | "high";

export type SyncChange = {
  episodeNumber: number;
  field: string;
  before: unknown;
  after: unknown;
  risk: SyncRisk;
};
