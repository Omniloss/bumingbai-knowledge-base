import type { ValidationIssue } from "./publication.js";
import type { Catalog } from "./schemas/catalog.js";

type ReferenceCheck = {
  readonly entityId: string;
  readonly field: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly exists: boolean;
};

function missingReference(check: ReferenceCheck): ValidationIssue[] {
  return check.exists
    ? []
    : [
        {
          code: "missing_reference",
          entityId: check.entityId,
          message: `${check.field} references missing ${check.targetType} ${check.targetId}`,
        },
      ];
}

export function validateReferences(catalog: Catalog): ValidationIssue[] {
  const episodeIds = new Set(catalog.episodes.map((item) => item.id));
  const personIds = new Set(catalog.people.map((item) => item.id));
  const topicIds = new Set(catalog.topics.map((item) => item.id));
  const workIds = new Set(catalog.works.map((item) => item.id));
  const editionIds = new Set(catalog.editions.map((item) => item.id));
  const allIds = new Set(
    [
      ...catalog.episodes,
      ...catalog.people,
      ...catalog.topics,
      ...catalog.works,
      ...catalog.editions,
      ...catalog.recommendationEvidence,
      ...catalog.imageAssets,
      ...catalog.workRelations,
      ...catalog.providerRecords,
      ...catalog.reviewIssues,
    ].map((entity) => entity.id),
  );
  const checks: ReferenceCheck[] = [];
  for (const episode of catalog.episodes) {
    for (const guestId of episode.guestIds) {
      checks.push({
        entityId: episode.id,
        field: "Episode.guestIds",
        targetType: "Person",
        targetId: guestId,
        exists: personIds.has(guestId),
      });
    }
    for (const topicId of episode.topicIds) {
      checks.push({
        entityId: episode.id,
        field: "Episode.topicIds",
        targetType: "Topic",
        targetId: topicId,
        exists: topicIds.has(topicId),
      });
    }
  }
  for (const work of catalog.works) {
    for (const creatorId of work.creatorIds) {
      checks.push({
        entityId: work.id,
        field: "Work.creatorIds",
        targetType: "Person",
        targetId: creatorId,
        exists: personIds.has(creatorId),
      });
    }
    for (const topicId of work.topicIds) {
      checks.push({
        entityId: work.id,
        field: "Work.topicIds",
        targetType: "Topic",
        targetId: topicId,
        exists: topicIds.has(topicId),
      });
    }
    if (work.seriesId !== undefined)
      checks.push({
        entityId: work.id,
        field: "Work.seriesId",
        targetType: "Work",
        targetId: work.seriesId,
        exists: workIds.has(work.seriesId),
      });
  }
  for (const edition of catalog.editions) {
    checks.push({
      entityId: edition.id,
      field: "Edition.workId",
      targetType: "Work",
      targetId: edition.workId,
      exists: workIds.has(edition.workId),
    });
    for (const translatorId of edition.translatorIds) {
      checks.push({
        entityId: edition.id,
        field: "Edition.translatorIds",
        targetType: "Person",
        targetId: translatorId,
        exists: personIds.has(translatorId),
      });
    }
  }
  for (const evidence of catalog.recommendationEvidence) {
    checks.push({
      entityId: evidence.id,
      field: "RecommendationEvidence.episodeId",
      targetType: "Episode",
      targetId: evidence.episodeId,
      exists: episodeIds.has(evidence.episodeId),
    });
    checks.push({
      entityId: evidence.id,
      field: "RecommendationEvidence.workId",
      targetType: "Work",
      targetId: evidence.workId,
      exists: workIds.has(evidence.workId),
    });
    if (evidence.recommenderId !== undefined)
      checks.push({
        entityId: evidence.id,
        field: "RecommendationEvidence.recommenderId",
        targetType: "Person",
        targetId: evidence.recommenderId,
        exists: personIds.has(evidence.recommenderId),
      });
  }
  for (const image of catalog.imageAssets) {
    checks.push({
      entityId: image.id,
      field: "ImageAsset.workId",
      targetType: "Work",
      targetId: image.workId,
      exists: workIds.has(image.workId),
    });
    if (image.editionId !== undefined)
      checks.push({
        entityId: image.id,
        field: "ImageAsset.editionId",
        targetType: "Edition",
        targetId: image.editionId,
        exists: editionIds.has(image.editionId),
      });
  }
  for (const relation of catalog.workRelations) {
    checks.push({
      entityId: relation.id,
      field: "WorkRelation.fromWorkId",
      targetType: "Work",
      targetId: relation.fromWorkId,
      exists: workIds.has(relation.fromWorkId),
    });
    checks.push({
      entityId: relation.id,
      field: "WorkRelation.toWorkId",
      targetType: "Work",
      targetId: relation.toWorkId,
      exists: workIds.has(relation.toWorkId),
    });
  }
  for (const record of catalog.providerRecords)
    checks.push({
      entityId: record.id,
      field: "ProviderRecord.entityId",
      targetType: "Entity",
      targetId: record.entityId,
      exists: allIds.has(record.entityId),
    });
  for (const issue of catalog.reviewIssues) {
    if (issue.entityId !== undefined)
      checks.push({
        entityId: issue.id,
        field: "ReviewIssue.entityId",
        targetType: "Entity",
        targetId: issue.entityId,
        exists: allIds.has(issue.entityId),
      });
  }
  return checks.flatMap(missingReference);
}
