export class LegacyEpisodeReferenceError extends Error {
  readonly name = "LegacyEpisodeReferenceError";

  constructor(readonly episodeNumber: number) {
    super(`legacy recommendation references missing episode ${episodeNumber}`);
  }
}
