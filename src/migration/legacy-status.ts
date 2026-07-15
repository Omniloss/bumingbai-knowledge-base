import type { PublicationStatus } from "../domain/schemas/primitives.js";
import { LegacyStatusMappingError } from "./legacy-error.js";
import type {
  LegacyEpisodeRecommendationStatus,
  LegacyMetadataStatus,
} from "./legacy-schema.js";

export const LEGACY_REVIEW_REASONS = {
  CREATOR_MISSING: "旧记录没有可确认的创作者",
  EDITION_CONFLICT: "同一 ISBN 的版本信息冲突",
  METADATA_RAW_ONLY: "旧记录仅保留节目原文，书目信息需要人工核验",
  METADATA_STATUS_MISSING: "旧记录缺少书目元数据状态",
  METADATA_STATUS_UNKNOWN: "旧记录包含未知的书目元数据状态",
  RECOMMENDATION_STATUS_MISSING: "节目缺少正式推荐状态",
  RECOMMENDATION_STATUS_UNKNOWN: "节目包含未知的正式推荐状态",
  RECOMMENDATION_UNMARKED: "官方节目简介未标记该记录为正式推荐",
  TITLE_CONFLICT: "同一原名和创作者对应多个标题",
  TITLE_UNCONFIRMED: "旧记录标题无法从推荐原文中确认",
} as const;

export type LegacyReviewReason =
  (typeof LEGACY_REVIEW_REASONS)[keyof typeof LEGACY_REVIEW_REASONS];

export type MigrationConfidence =
  | {
      readonly kind: "confirmed";
      readonly verificationStatus: "partially_verified";
      readonly publicationStatus: "public";
    }
  | {
      readonly kind: "withheld";
      readonly verificationStatus: "pending_verification";
      readonly publicationStatus: "withheld";
    };

export type StatusReview = {
  readonly reason: LegacyReviewReason;
  readonly candidates: readonly string[];
};

export type StatusDecision = {
  readonly confidence: MigrationConfidence;
  readonly review: StatusReview | undefined;
};

export const CONFIRMED_CONFIDENCE: MigrationConfidence = {
  kind: "confirmed",
  verificationStatus: "partially_verified",
  publicationStatus: "public",
};

export const WITHHELD_CONFIDENCE: MigrationConfidence = {
  kind: "withheld",
  verificationStatus: "pending_verification",
  publicationStatus: "withheld",
};

function assertNever(value: never): never {
  throw new LegacyStatusMappingError(value);
}

export function decideRecommendationStatus(
  status: LegacyEpisodeRecommendationStatus,
): StatusDecision {
  switch (status.kind) {
    case "explicit":
      return { confidence: CONFIRMED_CONFIDENCE, review: undefined };
    case "unmarked":
      return {
        confidence: WITHHELD_CONFIDENCE,
        review: {
          reason: LEGACY_REVIEW_REASONS.RECOMMENDATION_UNMARKED,
          candidates: [status.raw],
        },
      };
    case "missing":
      return {
        confidence: WITHHELD_CONFIDENCE,
        review: {
          reason: LEGACY_REVIEW_REASONS.RECOMMENDATION_STATUS_MISSING,
          candidates: [],
        },
      };
    case "unknown":
      return {
        confidence: WITHHELD_CONFIDENCE,
        review: {
          reason: LEGACY_REVIEW_REASONS.RECOMMENDATION_STATUS_UNKNOWN,
          candidates: [status.raw],
        },
      };
    default:
      return assertNever(status);
  }
}

export function decideMetadataStatus(
  status: LegacyMetadataStatus,
): StatusDecision {
  switch (status.kind) {
    case "fetched_link":
      return { confidence: CONFIRMED_CONFIDENCE, review: undefined };
    case "raw_only":
      return {
        confidence: WITHHELD_CONFIDENCE,
        review: {
          reason: LEGACY_REVIEW_REASONS.METADATA_RAW_ONLY,
          candidates: [status.raw],
        },
      };
    case "missing":
      return {
        confidence: WITHHELD_CONFIDENCE,
        review: {
          reason: LEGACY_REVIEW_REASONS.METADATA_STATUS_MISSING,
          candidates: [],
        },
      };
    case "unknown":
      return {
        confidence: WITHHELD_CONFIDENCE,
        review: {
          reason: LEGACY_REVIEW_REASONS.METADATA_STATUS_UNKNOWN,
          candidates: [status.raw],
        },
      };
    default:
      return assertNever(status);
  }
}

export function combineConfidence(
  left: MigrationConfidence,
  right: MigrationConfidence,
): MigrationConfidence {
  switch (left.kind) {
    case "confirmed":
      switch (right.kind) {
        case "confirmed":
          return CONFIRMED_CONFIDENCE;
        case "withheld":
          return WITHHELD_CONFIDENCE;
        default:
          return assertNever(right);
      }
    case "withheld":
      return WITHHELD_CONFIDENCE;
    default:
      return assertNever(left);
  }
}

export function strongestConfidence(
  left: MigrationConfidence,
  right: MigrationConfidence,
): MigrationConfidence {
  switch (left.kind) {
    case "confirmed":
      return CONFIRMED_CONFIDENCE;
    case "withheld":
      switch (right.kind) {
        case "confirmed":
          return CONFIRMED_CONFIDENCE;
        case "withheld":
          return WITHHELD_CONFIDENCE;
        default:
          return assertNever(right);
      }
    default:
      return assertNever(left);
  }
}

export function confidenceFromPublicationStatus(
  status: PublicationStatus,
): MigrationConfidence {
  switch (status) {
    case "public":
      return CONFIRMED_CONFIDENCE;
    case "withheld":
      return WITHHELD_CONFIDENCE;
    default:
      return assertNever(status);
  }
}
