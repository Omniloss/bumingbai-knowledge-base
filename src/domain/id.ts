import { createHash } from "node:crypto";
import {
  type EditionId,
  EditionIdSchema,
  type EpisodeId,
  EpisodeIdSchema,
  type ImageAssetId,
  ImageAssetIdSchema,
  type PersonId,
  PersonIdSchema,
  type ProviderRecordId,
  ProviderRecordIdSchema,
  type RecommendationEvidenceId,
  RecommendationEvidenceIdSchema,
  type ReviewIssueId,
  ReviewIssueIdSchema,
  type TopicId,
  TopicIdSchema,
  type WorkId,
  WorkIdSchema,
  type WorkRelationId,
  WorkRelationIdSchema,
} from "./schemas/primitives.js";

type EntityIdByPrefix = {
  readonly edition: EditionId;
  readonly episode: EpisodeId;
  readonly evidence: RecommendationEvidenceId;
  readonly image: ImageAssetId;
  readonly issue: ReviewIssueId;
  readonly person: PersonId;
  readonly provider: ProviderRecordId;
  readonly relation: WorkRelationId;
  readonly topic: TopicId;
  readonly work: WorkId;
};

type KnownEntityPrefix = keyof EntityIdByPrefix;

export function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll("，", ",")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function createStableId<Prefix extends KnownEntityPrefix>(
  prefix: Prefix,
  ...parts: string[]
): EntityIdByPrefix[Prefix];
export function createStableId(prefix: string, ...parts: string[]): string;
export function createStableId(prefix: string, ...parts: string[]): string {
  const identity = parts.map(normalizeIdentityText).join("\u001f");
  const digest = createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 12);
  const id = `${prefix}_${digest}`;

  switch (prefix) {
    case "edition":
      return EditionIdSchema.parse(id);
    case "episode":
      return EpisodeIdSchema.parse(id);
    case "evidence":
      return RecommendationEvidenceIdSchema.parse(id);
    case "image":
      return ImageAssetIdSchema.parse(id);
    case "issue":
      return ReviewIssueIdSchema.parse(id);
    case "person":
      return PersonIdSchema.parse(id);
    case "provider":
      return ProviderRecordIdSchema.parse(id);
    case "relation":
      return WorkRelationIdSchema.parse(id);
    case "topic":
      return TopicIdSchema.parse(id);
    case "work":
      return WorkIdSchema.parse(id);
    default:
      return id;
  }
}

export function createSlug(value: string): string {
  return normalizeIdentityText(value)
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}
