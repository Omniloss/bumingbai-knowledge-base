import { z } from "zod";
import {
  EditionIdSchema,
  EntityIdSchema,
  EpisodeIdSchema,
  ImageAssetIdSchema,
  IsoDateSchema,
  PersonIdSchema,
  ProviderRecordIdSchema,
  PublicationStatusSchema,
  RecommendationEvidenceIdSchema,
  ReviewIssueIdSchema,
  SourceRefSchema,
  TopicIdSchema,
  VerificationStatusSchema,
  WorkIdSchema,
  WorkRelationIdSchema,
} from "./primitives.js";

const BaseEntityShape = {
  slug: z.string().min(1),
  verificationStatus: VerificationStatusSchema,
  publicationStatus: PublicationStatusSchema,
  sources: z.array(SourceRefSchema).readonly(),
} as const;

export const EpisodeSchema = z
  .object({
    id: EpisodeIdSchema,
    ...BaseEntityShape,
    number: z.number().int().positive().nullable(),
    title: z.string().min(1),
    publishedAt: IsoDateSchema,
    duration: z.string().min(1).optional(),
    officialUrl: z.string().url(),
    transcriptUrl: z.string().url().optional(),
    guestIds: z.array(PersonIdSchema).readonly(),
    topicIds: z.array(TopicIdSchema).readonly(),
  })
  .readonly();

export const PersonSchema = z
  .object({
    id: PersonIdSchema,
    ...BaseEntityShape,
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).readonly(),
    roles: z
      .array(z.enum(["guest", "host", "author", "director", "translator"]))
      .readonly(),
  })
  .readonly();

export const TopicSchema = z
  .object({
    id: TopicIdSchema,
    ...BaseEntityShape,
    name: z.string().min(1),
    description: z.string().min(1),
    aliases: z.array(z.string().min(1)).readonly(),
  })
  .readonly();

export const WorkSchema = z
  .object({
    id: WorkIdSchema,
    ...BaseEntityShape,
    title: z.string().min(1),
    originalTitle: z.string().min(1).optional(),
    mediaType: z.enum([
      "book",
      "film",
      "television",
      "documentary",
      "podcast",
      "other",
    ]),
    creatorIds: z.array(PersonIdSchema).readonly(),
    year: z.number().int().min(1000).max(2100).optional(),
    topicIds: z.array(TopicIdSchema).readonly(),
    genres: z.array(z.string().min(1)).readonly(),
    regions: z.array(z.string().min(1)).readonly(),
    seriesId: WorkIdSchema.optional(),
  })
  .readonly();

export const EditionSchema = z
  .object({
    id: EditionIdSchema,
    ...BaseEntityShape,
    workId: WorkIdSchema,
    language: z.string().min(2),
    region: z.string().min(2).optional(),
    title: z.string().min(1),
    translatorIds: z.array(PersonIdSchema).readonly(),
    publisher: z.string().min(1).optional(),
    publishedAt: z.string().min(4).optional(),
    isbn: z.string().min(10).optional(),
    translationAssessment: z
      .object({
        status: z.enum(["unverified", "verified"]),
        summary: z.string().min(1),
        sources: z.array(SourceRefSchema).readonly(),
      })
      .readonly(),
  })
  .readonly();

export const RecommendationEvidenceSchema = z
  .object({
    id: RecommendationEvidenceIdSchema,
    episodeId: EpisodeIdSchema,
    workId: WorkIdSchema,
    recommenderId: PersonIdSchema.optional(),
    rawText: z.string().min(1),
    source: SourceRefSchema,
    verificationStatus: VerificationStatusSchema,
    publicationStatus: PublicationStatusSchema,
  })
  .readonly();

export const ImageAssetSchema = z
  .object({
    id: ImageAssetIdSchema,
    workId: WorkIdSchema,
    editionId: EditionIdSchema.optional(),
    role: z.enum(["hero", "edition", "fallback"]),
    editionRole: z.enum(["original", "translated", "regional", "generated"]),
    handling: z.enum(["hotlink_only", "mirror_allowed", "display_prohibited"]),
    url: z.union([
      z
        .string()
        .url()
        .regex(/^https:\/\//u),
      z.string().regex(/^\/(?![/\\])[^\\\s]+$/u),
    ]),
    sourcePageUrl: z.union([
      z.string().url(),
      z.string().regex(/^site-generated:[a-z-]+$/u),
    ]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    license: z.string().min(1),
    attribution: z.string(),
    lastVerifiedAt: IsoDateSchema,
    broken: z.boolean(),
  })
  .readonly();

export const WorkRelationSchema = z
  .object({
    id: WorkRelationIdSchema,
    fromWorkId: WorkIdSchema,
    toWorkId: WorkIdSchema,
    kind: z.enum([
      "same_creator",
      "same_series",
      "same_episode",
      "similar",
      "editorial",
    ]),
    score: z.number().min(0).max(1).optional(),
    reasons: z.array(z.string().min(1)).min(1).readonly(),
    sources: z.array(SourceRefSchema).readonly(),
  })
  .readonly();

export const ProviderRecordSchema = z
  .object({
    id: ProviderRecordIdSchema,
    provider: z.enum([
      "open_library",
      "tmdb",
      "wikidata",
      "commons",
      "workers_ai",
      "google_books",
    ]),
    entityId: EntityIdSchema,
    externalId: z.string().min(1),
    retrievedAt: IsoDateSchema,
    normalizedHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .readonly();

export const ReviewIssueSchema = z
  .object({
    id: ReviewIssueIdSchema,
    entityId: EntityIdSchema.optional(),
    field: z.string().min(1),
    reason: z.string().min(1),
    candidates: z.array(z.string()).readonly(),
    source: SourceRefSchema,
    status: z.enum(["open", "resolved", "dismissed"]),
  })
  .readonly();
