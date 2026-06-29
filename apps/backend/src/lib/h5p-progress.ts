import { Prisma } from "@prisma/client";

export type RequiredInteraction = {
  id: string;
  time: number;
  type: string;
};

export type H5PEventReference = {
  videoId: string;
  courseId: string | null;
  interactionId: string | null;
};

export function getRequiredInteractions(h5pConfig: Prisma.JsonValue | null): RequiredInteraction[] {
  if (!h5pConfig || typeof h5pConfig !== "object" || Array.isArray(h5pConfig)) {
    return [];
  }

  const interactions = (h5pConfig as { interactions?: unknown }).interactions;
  if (!Array.isArray(interactions)) {
    return [];
  }

  return interactions.flatMap((interaction) => {
    if (!interaction || typeof interaction !== "object" || Array.isArray(interaction)) {
      return [];
    }

    const candidate = interaction as { id?: unknown; time?: unknown; type?: unknown };
    if (typeof candidate.type !== "string" || typeof candidate.id !== "string" || typeof candidate.time !== "number" || !Number.isFinite(candidate.time)) {
      return [];
    }

    return [{ id: candidate.id, time: candidate.time, type: candidate.type }];
  });
}

export function getCompletedInteractionIds(events: H5PEventReference[], videoId: string, courseId: string | null) {
  return new Set(
    events.flatMap((event) => (event.videoId === videoId && event.courseId === courseId && event.interactionId ? [event.interactionId] : []))
  );
}

export function getRequiredInteractionCompletion(h5pConfig: Prisma.JsonValue | null, completedInteractionIds: Set<string>) {
  const requiredInteractions = getRequiredInteractions(h5pConfig);
  if (requiredInteractions.length === 0) {
    return null;
  }

  const completedCount = requiredInteractions.filter((interaction) => completedInteractionIds.has(interaction.id)).length;

  return {
    completedCount,
    totalCount: requiredInteractions.length,
    percent: Math.round((completedCount / requiredInteractions.length) * 100),
    completed: completedCount === requiredInteractions.length
  };
}