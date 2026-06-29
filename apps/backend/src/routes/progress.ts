import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertVideoUnlocked } from "../lib/course-access.js";
import { getCompletedInteractionIds, getRequiredInteractionCompletion } from "../lib/h5p-progress.js";
import { asyncHandler } from "../lib/http.js";
import { invalidateReports } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

const progressSchema = z.object({
  videoId: z.string().min(1),
  courseId: z.string().min(1).optional(),
  watchedSeconds: z.number().min(0),
  lastPositionSeconds: z.number().min(0),
  percent: z.number().min(0).max(100),
  completed: z.boolean().optional()
});

const h5pEventSchema = z.object({
  videoId: z.string().min(1),
  courseId: z.string().min(1).optional(),
  interactionId: z.string().optional(),
  type: z.string().min(1),
  score: z.number().optional(),
  maxScore: z.number().optional(),
  payload: z.record(z.unknown()).default({})
});

router.use(authenticate);

router.post(
  "/video",
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = progressSchema.parse(req.body);
    await assertVideoUnlocked(req.user, input.courseId, input.videoId);

    const courseId = input.courseId?.startsWith("standalone:") ? null : input.courseId ?? null;

    const video = await prisma.video.findUnique({
      where: { id: input.videoId },
      select: { durationSeconds: true, h5pConfig: true }
    });

    const h5pEvents = await prisma.h5PEvent.findMany({
      where: { userId: req.user.id, videoId: input.videoId, courseId },
      select: { videoId: true, courseId: true, interactionId: true }
    });
    const completedInteractionIds = getCompletedInteractionIds(h5pEvents, input.videoId, courseId);
    const interactionCompletion = getRequiredInteractionCompletion(video?.h5pConfig ?? null, completedInteractionIds);
    const hasCompletedRequiredInteractions = interactionCompletion?.completed ?? true;
    const requestedCompleted = input.completed ?? input.percent >= 95;
    const completed = requestedCompleted && hasCompletedRequiredInteractions;
    const existingProgress = await prisma.videoProgress.findFirst({
      where: { userId: req.user.id, videoId: input.videoId, courseId }
    });

    const interactionCappedPercent = interactionCompletion?.percent ?? input.percent;
    const percent = hasCompletedRequiredInteractions && !interactionCompletion ? Math.max(existingProgress?.percent ?? 0, interactionCappedPercent) : interactionCappedPercent;
    const interactionCappedWatchedSeconds = !hasCompletedRequiredInteractions && video?.durationSeconds
      ? Math.min(input.watchedSeconds, (video.durationSeconds * percent) / 100)
      : input.watchedSeconds;

    const data = {
      watchedSeconds: hasCompletedRequiredInteractions ? Math.max(existingProgress?.watchedSeconds ?? 0, interactionCappedWatchedSeconds) : interactionCappedWatchedSeconds,
      lastPositionSeconds: input.lastPositionSeconds,
      percent,
      completed,
      completedAt: completed ? new Date() : null
    };

    const progress = existingProgress
      ? await prisma.videoProgress.update({ where: { id: existingProgress.id }, data })
      : await prisma.videoProgress.create({
          data: {
            ...data,
            userId: req.user.id,
            videoId: input.videoId,
            courseId
          }
        });

    await invalidateReports();
    res.json({ progress });
  })
);

router.post(
  "/h5p-event",
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = h5pEventSchema.parse(req.body);
    await assertVideoUnlocked(req.user, input.courseId, input.videoId);
    const courseId = input.courseId?.startsWith("standalone:") ? null : input.courseId ?? null;

    const event = await prisma.h5PEvent.create({
      data: {
        userId: req.user.id,
        videoId: input.videoId,
        courseId,
        interactionId: input.interactionId,
        type: input.type,
        score: input.score,
        maxScore: input.maxScore,
        payload: input.payload as Prisma.InputJsonValue
      }
    });

    await invalidateReports();
    res.status(201).json({ event });
  })
);

export { router as progressRouter };
