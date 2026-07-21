import { z } from "zod";

const HttpsUrlSchema = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Public URLs must use HTTPS",
  );

const SiteEnvironmentSchema = z.object({
  PUBLIC_SITE_URL: HttpsUrlSchema,
  PUBLIC_REPOSITORY_URL: HttpsUrlSchema,
});

export type SiteConfig = {
  readonly siteUrl: string;
  readonly repositoryUrl: string;
};

export function parseSiteConfig(
  environment: Record<string, string | undefined>,
): SiteConfig {
  const parsed = SiteEnvironmentSchema.parse(environment);
  return {
    siteUrl: parsed.PUBLIC_SITE_URL,
    repositoryUrl: parsed.PUBLIC_REPOSITORY_URL,
  };
}
