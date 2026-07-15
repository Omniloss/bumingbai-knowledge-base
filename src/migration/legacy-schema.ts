import { z } from "zod";

const LegacyDateSchema = z
  .string()
  .min(1)
  .pipe(z.coerce.date())
  .transform((value) => value.toISOString());

const OptionalUrlSchema = z
  .union([z.string().url(), z.literal("")])
  .optional()
  .default("");

const LegacyEpisodeSchema = z
  .object({
    episode_number: z.coerce.number().int().positive(),
    title: z.string().trim().min(1),
    published_at: LegacyDateSchema,
    duration: z.string().trim().optional().default(""),
    official_url: z.string().url(),
    transcript_url: OptionalUrlSchema,
    guest_or_participants: z.string().trim().optional().default(""),
    recommendation_status: z.string().optional().default(""),
  })
  .readonly();

const LegacyRecommendationSchema = z
  .object({
    episode_number: z.coerce.number().int().positive(),
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
    metadata_status: z.string().optional().default(""),
  })
  .readonly();

export const LegacyRootSchema = z
  .object({
    retrieved_at: LegacyDateSchema,
    episodes: z.array(LegacyEpisodeSchema).readonly(),
    recommendations: z.array(LegacyRecommendationSchema).readonly(),
  })
  .readonly();

export type LegacyEpisode = z.infer<typeof LegacyEpisodeSchema>;
export type LegacyRecommendation = z.infer<typeof LegacyRecommendationSchema>;
export type LegacyRoot = z.infer<typeof LegacyRootSchema>;
