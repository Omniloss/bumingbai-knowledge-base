import { z } from "zod";
import {
  EditionSchema,
  EpisodeSchema,
  ImageAssetSchema,
  PersonSchema,
  ProviderRecordSchema,
  RecommendationEvidenceSchema,
  ReviewIssueSchema,
  TopicSchema,
  WorkRelationSchema,
  WorkSchema,
} from "./entities.js";
import { IsoDateSchema } from "./primitives.js";

const CatalogObjectSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: IsoDateSchema,
  episodes: z.array(EpisodeSchema).readonly(),
  people: z.array(PersonSchema).readonly(),
  topics: z.array(TopicSchema).readonly(),
  works: z.array(WorkSchema).readonly(),
  editions: z.array(EditionSchema).readonly(),
  recommendationEvidence: z.array(RecommendationEvidenceSchema).readonly(),
  imageAssets: z.array(ImageAssetSchema).readonly(),
  workRelations: z.array(WorkRelationSchema).readonly(),
  providerRecords: z.array(ProviderRecordSchema).readonly(),
  reviewIssues: z.array(ReviewIssueSchema).readonly(),
});

export const CatalogSchema = CatalogObjectSchema.readonly();

export const CatalogMetaSchema = CatalogObjectSchema.pick({
  schemaVersion: true,
  generatedAt: true,
}).readonly();

export type Catalog = z.infer<typeof CatalogSchema>;
export type Episode = z.infer<typeof EpisodeSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Work = z.infer<typeof WorkSchema>;
export type Edition = z.infer<typeof EditionSchema>;
export type RecommendationEvidence = z.infer<
  typeof RecommendationEvidenceSchema
>;
export type ImageAsset = z.infer<typeof ImageAssetSchema>;
export type WorkRelation = z.infer<typeof WorkRelationSchema>;
export type ProviderRecord = z.infer<typeof ProviderRecordSchema>;
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
