const DEFAULT_PREVIEW_URL = "http://127.0.0.1:4321/";

export function resolveLighthouseUrl(argv: readonly string[]): string {
  return (
    argv.slice(2).find((argument) => argument !== "--") ?? DEFAULT_PREVIEW_URL
  );
}
