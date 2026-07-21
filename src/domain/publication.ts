import { validateReferences } from "./references.js";
import type { Catalog, RecommendationEvidence } from "./schemas/catalog.js";

export type ValidationIssue = {
  readonly code:
    | "duplicate_id"
    | "missing_reference"
    | "unsupported_translation_assessment"
    | "public_work_without_evidence";
  readonly entityId: string;
  readonly message: string;
};

export type PublishableEntity = {
  readonly publicationStatus: "public" | "withheld";
  readonly verificationStatus:
    | "verified"
    | "partially_verified"
    | "pending_verification"
    | "rejected";
};

const ISSUE_PRIORITY = {
  duplicate_id: 0,
  missing_reference: 1,
  unsupported_translation_assessment: 2,
  public_work_without_evidence: 3,
} as const satisfies Record<ValidationIssue["code"], number>;

export function canPublishRecommendation(
  evidence: RecommendationEvidence,
): boolean {
  return (
    evidence.publicationStatus === "public" &&
    (evidence.verificationStatus === "verified" ||
      evidence.verificationStatus === "partially_verified") &&
    (evidence.source.kind === "official_episode" ||
      evidence.source.kind === "official_transcript" ||
      evidence.source.kind === "official_rss")
  );
}

export function isPublicEntity(entity: PublishableEntity): boolean {
  return (
    entity.publicationStatus === "public" &&
    (entity.verificationStatus === "verified" ||
      entity.verificationStatus === "partially_verified")
  );
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function validateCatalog(catalog: Catalog): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [...validateReferences(catalog)];

  const entityCollections: readonly (readonly {
    readonly id: string;
  }[])[] = [
    catalog.episodes,
    catalog.people,
    catalog.topics,
    catalog.works,
    catalog.editions,
    catalog.recommendationEvidence,
    catalog.imageAssets,
    catalog.workRelations,
    catalog.providerRecords,
    catalog.reviewIssues,
  ];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const entities of entityCollections) {
    for (const entity of entities) {
      if (seenIds.has(entity.id)) duplicateIds.add(entity.id);
      seenIds.add(entity.id);
    }
  }
  for (const entityId of duplicateIds) {
    issues.push({
      code: "duplicate_id",
      entityId,
      message: `Catalog contains duplicate entity ID ${entityId}`,
    });
  }

  for (const edition of catalog.editions) {
    if (
      edition.translationAssessment.status === "verified" &&
      edition.translationAssessment.sources.length === 0
    ) {
      issues.push({
        code: "unsupported_translation_assessment",
        entityId: edition.id,
        message: "Verified translation assessment requires at least one source",
      });
    }
  }

  for (const work of catalog.works) {
    const hasPublishableEvidence = catalog.recommendationEvidence.some(
      (evidence) =>
        evidence.workId === work.id && canPublishRecommendation(evidence),
    );
    if (work.publicationStatus === "public" && !hasPublishableEvidence) {
      issues.push({
        code: "public_work_without_evidence",
        entityId: work.id,
        message: "Public Work requires publishable recommendation evidence",
      });
    }
  }

  return issues.toSorted((left, right) => {
    const priorityDifference =
      ISSUE_PRIORITY[left.code] - ISSUE_PRIORITY[right.code];
    if (priorityDifference !== 0) return priorityDifference;
    const entityDifference = compareText(left.entityId, right.entityId);
    if (entityDifference !== 0) return entityDifference;
    return compareText(left.message, right.message);
  });
}
