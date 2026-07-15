import type { LegacyEpisodeLookup } from "./legacy-episode-identity.js";

export class LegacyEpisodeReferenceError extends Error {
  readonly name = "LegacyEpisodeReferenceError";
  readonly episodeNumber: number | null;

  constructor(readonly lookup: LegacyEpisodeLookup) {
    super(
      `legacy recommendation references missing episode ${lookup.description} (stable lookup ${lookup.key})`,
    );
    this.episodeNumber = lookup.episodeNumber;
  }
}

export class LegacyStatusMappingError extends Error {
  readonly name = "LegacyStatusMappingError";

  constructor(readonly status: unknown) {
    super(`unexpected legacy status variant: ${String(status)}`);
  }
}
