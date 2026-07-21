import { z } from "zod";

export const EpisodeIdSchema = z
  .string()
  .regex(/^episode_[a-f0-9]{12}$/)
  .brand<"EpisodeId">();
export const PersonIdSchema = z
  .string()
  .regex(/^person_[a-f0-9]{12}$/)
  .brand<"PersonId">();
export const TopicIdSchema = z
  .string()
  .regex(/^topic_[a-f0-9]{12}$/)
  .brand<"TopicId">();
export const WorkIdSchema = z
  .string()
  .regex(/^work_[a-f0-9]{12}$/)
  .brand<"WorkId">();
export const EditionIdSchema = z
  .string()
  .regex(/^edition_[a-f0-9]{12}$/)
  .brand<"EditionId">();
export const RecommendationEvidenceIdSchema = z
  .string()
  .regex(/^evidence_[a-f0-9]{12}$/)
  .brand<"RecommendationEvidenceId">();
export const ImageAssetIdSchema = z
  .string()
  .regex(/^image_[a-f0-9]{12}$/)
  .brand<"ImageAssetId">();
export const WorkRelationIdSchema = z
  .string()
  .regex(/^relation_[a-f0-9]{12}$/)
  .brand<"WorkRelationId">();
export const ProviderRecordIdSchema = z
  .string()
  .regex(/^provider_[a-f0-9]{12}$/)
  .brand<"ProviderRecordId">();
export const ReviewIssueIdSchema = z
  .string()
  .regex(/^issue_[a-f0-9]{12}$/)
  .brand<"ReviewIssueId">();

export const EntityIdSchema = z.union([
  EpisodeIdSchema,
  PersonIdSchema,
  TopicIdSchema,
  WorkIdSchema,
  EditionIdSchema,
  RecommendationEvidenceIdSchema,
  ImageAssetIdSchema,
  WorkRelationIdSchema,
  ProviderRecordIdSchema,
  ReviewIssueIdSchema,
]);

export const IsoDateSchema = z.string().datetime();
export const UrlSchema = z.string().url();

export const VerificationStatusSchema = z.enum([
  "verified",
  "partially_verified",
  "pending_verification",
  "rejected",
]);

export const PublicationStatusSchema = z.enum(["public", "withheld"]);
export const SourceKindSchema = z.enum([
  "official_episode",
  "official_transcript",
  "official_rss",
  "provider_api",
  "publisher",
  "library_catalog",
  "external_reference",
  "manual_review",
]);

export const SourceRefSchema = z
  .object({
    kind: SourceKindSchema,
    url: UrlSchema,
    retrievedAt: IsoDateSchema,
    locator: z.string().min(1).optional(),
  })
  .readonly();

export type EpisodeId = z.infer<typeof EpisodeIdSchema>;
export type PersonId = z.infer<typeof PersonIdSchema>;
export type TopicId = z.infer<typeof TopicIdSchema>;
export type WorkId = z.infer<typeof WorkIdSchema>;
export type EditionId = z.infer<typeof EditionIdSchema>;
export type RecommendationEvidenceId = z.infer<
  typeof RecommendationEvidenceIdSchema
>;
export type ImageAssetId = z.infer<typeof ImageAssetIdSchema>;
export type WorkRelationId = z.infer<typeof WorkRelationIdSchema>;
export type ProviderRecordId = z.infer<typeof ProviderRecordIdSchema>;
export type ReviewIssueId = z.infer<typeof ReviewIssueIdSchema>;
export type EntityId = z.infer<typeof EntityIdSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
