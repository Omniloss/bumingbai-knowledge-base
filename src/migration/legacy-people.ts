import { createSlug, createStableId } from "../domain/id.js";
import type { Person } from "../domain/schemas/catalog.js";
import type { PersonId, SourceRef } from "../domain/schemas/primitives.js";
import { appendSource } from "./legacy-shared.js";
import {
  confidenceFromPublicationStatus,
  type MigrationConfidence,
  strongestConfidence,
} from "./legacy-status.js";

export type PeopleIndex = ReadonlyMap<PersonId, Person>;

type PeopleRequest = {
  readonly names: readonly string[];
  readonly role: Person["roles"][number];
  readonly source: SourceRef;
  readonly confidence: MigrationConfidence;
};

type PeopleResult = {
  readonly people: PeopleIndex;
  readonly ids: readonly PersonId[];
};

export function includePeople(
  people: PeopleIndex,
  request: PeopleRequest,
): PeopleResult {
  const initial: PeopleResult = { people, ids: [] };
  return request.names.reduce<PeopleResult>((state, name) => {
    const id = createStableId("person", name);
    const existing = state.people.get(id);
    const confidence = existing
      ? strongestConfidence(
          confidenceFromPublicationStatus(existing.publicationStatus),
          request.confidence,
        )
      : request.confidence;
    const person: Person = existing
      ? {
          ...existing,
          roles: existing.roles.includes(request.role)
            ? existing.roles
            : [...existing.roles, request.role],
          sources: appendSource(existing.sources, request.source),
          verificationStatus: confidence.verificationStatus,
          publicationStatus: confidence.publicationStatus,
        }
      : {
          id,
          slug: `${createSlug(name)}-${id.slice(-6)}`,
          name,
          aliases: [],
          roles: [request.role],
          verificationStatus: confidence.verificationStatus,
          publicationStatus: confidence.publicationStatus,
          sources: [request.source],
        };
    const updatedPeople: PeopleIndex = new Map([
      ...state.people,
      [id, person] as const,
    ]);
    return {
      people: updatedPeople,
      ids: [...state.ids, id],
    };
  }, initial);
}
