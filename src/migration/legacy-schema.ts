import { z } from "zod";

export const LEGACY_EPISODE_RECOMMENDATION_STATUS = {
  EXPLICIT: "官方简介明确标注",
  UNMARKED: "官方简介未出现推荐标记",
} as const;

export const LEGACY_METADATA_STATUS = {
  FETCHED_LINK: "已抓取推荐链接元数据",
  RAW_ONLY: "仅保留节目原文，待人工书目核验",
} as const;

const LegacyDateSchema = z
  .string()
  .min(1)
  .pipe(z.coerce.date())
  .transform((value) => value.toISOString());

const OptionalUrlSchema = z
  .union([z.string().url(), z.literal("")])
  .optional()
  .default("");

const OptionalLegacyDateSchema = z
  .union([LegacyDateSchema, z.literal("")])
  .optional()
  .default("");

const LegacyEpisodeRecommendationStatusSchema = z
  .string()
  .optional()
  .default("")
  .transform((raw) => {
    if (raw === LEGACY_EPISODE_RECOMMENDATION_STATUS.EXPLICIT) {
      return { kind: "explicit", raw } as const;
    }
    if (raw === LEGACY_EPISODE_RECOMMENDATION_STATUS.UNMARKED) {
      return { kind: "unmarked", raw } as const;
    }
    if (raw.length === 0) return { kind: "missing", raw } as const;
    return { kind: "unknown", raw } as const;
  });

const LegacyMetadataStatusSchema = z
  .string()
  .optional()
  .default("")
  .transform((raw) => {
    if (raw === LEGACY_METADATA_STATUS.FETCHED_LINK) {
      return { kind: "fetched_link", raw } as const;
    }
    if (raw === LEGACY_METADATA_STATUS.RAW_ONLY) {
      return { kind: "raw_only", raw } as const;
    }
    if (raw.length === 0) return { kind: "missing", raw } as const;
    return { kind: "unknown", raw } as const;
  });

const LegacyEpisodeSchema = z
  .object({
    episode_number: z.coerce.number().int().positive().nullable(),
    title: z.string().trim().min(1),
    published_at: LegacyDateSchema,
    duration: z.string().trim().optional().default(""),
    official_url: z.string().url(),
    transcript_url: OptionalUrlSchema,
    guest_or_participants: z.string().trim().optional().default(""),
    recommendation_status: LegacyEpisodeRecommendationStatusSchema,
  })
  .readonly();

const LegacyRecommendationBaseSchema = z.object({
  recommendation_order: z.coerce.number().int().positive(),
  recommender: z.string().trim().optional().default(""),
  raw_entry: z.string().min(1),
  title: z.string().trim().min(1),
  original_title: z.string().trim().optional().default(""),
  creator: z.string().trim().optional().default(""),
  media_type: z.string().trim().optional().default(""),
  item_source_url: OptionalUrlSchema,
  has_chinese_translation: z.string().optional().default(""),
  translator: z.string().trim().optional().default(""),
  publisher: z.string().trim().optional().default(""),
  publication_year: z.string().trim().optional().default(""),
  isbn: z.string().trim().optional().default(""),
  translation_quality: z.string().optional().default(""),
  metadata_source_url: OptionalUrlSchema,
  metadata_status: LegacyMetadataStatusSchema,
});

const NumberedLegacyRecommendationSchema =
  LegacyRecommendationBaseSchema.extend({
    episode_number: z.coerce.number().int().positive(),
    episode_official_url: OptionalUrlSchema,
    episode_published_at: OptionalLegacyDateSchema,
  }).readonly();

const UnnumberedLegacyRecommendationSchema =
  LegacyRecommendationBaseSchema.extend({
    episode_number: z.null(),
    episode_official_url: z.string().url(),
    episode_published_at: LegacyDateSchema,
  }).readonly();

const LegacyRecommendationSchema = z.union([
  NumberedLegacyRecommendationSchema,
  UnnumberedLegacyRecommendationSchema,
]);

export const LegacyRootSchema = z
  .object({
    retrieved_at: LegacyDateSchema,
    episodes: z.array(LegacyEpisodeSchema).readonly(),
    recommendations: z.array(LegacyRecommendationSchema).readonly(),
  })
  .readonly();

export type LegacyEpisode = z.infer<typeof LegacyEpisodeSchema>;
export type LegacyEpisodeRecommendationStatus = z.infer<
  typeof LegacyEpisodeRecommendationStatusSchema
>;
export type LegacyMetadataStatus = z.infer<typeof LegacyMetadataStatusSchema>;
export type LegacyRecommendation = z.infer<typeof LegacyRecommendationSchema>;
export type LegacyRoot = z.infer<typeof LegacyRootSchema>;
