export class LegacyEpisodeReferenceError extends Error {
  readonly name = "LegacyEpisodeReferenceError";

  constructor(readonly episodeNumber: number) {
    super(`legacy recommendation references missing episode ${episodeNumber}`);
  }
}

export class LegacyStatusMappingError extends Error {
  readonly name = "LegacyStatusMappingError";

  constructor(readonly status: unknown) {
    super(`unexpected legacy status variant: ${String(status)}`);
  }
}
