export function tokenizeForSearch(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("zh-CN");
  const latin = normalized.match(/[a-z0-9]+/gu) ?? [];
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  const bigrams = chinese
    .slice(0, -1)
    .map((character, index) => `${character}${chinese[index + 1]}`);

  return [...new Set([...latin, ...bigrams])];
}
