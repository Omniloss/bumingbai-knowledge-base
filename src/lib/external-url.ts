export function getHttpsExternalUrl(value: string): string | undefined {
  if (!URL.canParse(value)) {
    return undefined;
  }

  return new URL(value).protocol === "https:" ? value : undefined;
}
