import { Router } from "express";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getCompletedInteractionIds, getRequiredInteractionCompletion } from "../lib/h5p-progress.js";
import { prisma } from "../lib/prisma.js";
import {
  assertVideoUnlocked,
  canAccessCourse,
  getH5PEventsForCourse,
  getCourseOrThrow,
  getProgressForCourse,
  getUserGroupIds,
  isPrivileged,
  serializeCourse,
  standaloneCourseId,
  standaloneVideoId
} from "../lib/course-access.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  asyncHandler<AuthedRequest>(async (req, res) => {
    const groupIds = await getUserGroupIds(req.user.id);
    const where = isPrivileged(req.user.role)
      ? {}
      : {
          status: "PUBLISHED" as const,
          assignments: {
            some: {
              OR: [{ userId: req.user.id }, { groupId: { in: groupIds } }]
            }
          }
        };

    const courses = await prisma.course.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        videos: {
          orderBy: { position: "asc" },
          include: { video: true }
        }
      }
    });

    const coursePayload = await Promise.all(
      courses.map(async (course) => serializeCourse(course, await getProgressForCourse(req.user.id, course.id), await getH5PEventsForCourse(req.user.id, course.id), req.user.role))
    );

    const standaloneAssignments = isPrivileged(req.user.role)
      ? []
      : await prisma.assignment.findMany({
          where: {
            courseId: null,
            videoId: { not: null },
            OR: [{ userId: req.user.id }, { groupId: { in: groupIds } }]
          },
          include: { video: true },
          distinct: ["videoId"]
        });

    const standaloneVideoIds = standaloneAssignments.flatMap((assignment) => (assignment.videoId ? [assignment.videoId] : []));
    const standaloneProgress = standaloneVideoIds.length
      ? await prisma.videoProgress.findMany({
          where: { userId: req.user.id, courseId: null, videoId: { in: standaloneVideoIds } }
        })
      : [];
    const standaloneProgressByVideo = new Map(standaloneProgress.map((progress) => [progress.videoId, progress]));
    const standaloneH5PEvents = standaloneVideoIds.length
      ? await prisma.h5PEvent.findMany({
          where: { userId: req.user.id, courseId: null, videoId: { in: standaloneVideoIds } },
          select: { videoId: true, courseId: true, interactionId: true }
        })
      : [];

    const standalonePayload = standaloneAssignments.flatMap((assignment) => {
      if (!assignment.video || !assignment.videoId) {
        return [];
      }

      const progress = standaloneProgressByVideo.get(assignment.videoId);
      const interactionCompletion = getRequiredInteractionCompletion(assignment.video.h5pConfig, getCompletedInteractionIds(standaloneH5PEvents, assignment.videoId, null));
      const effectivePercent = interactionCompletion?.percent ?? progress?.percent ?? 0;
      const effectiveCompleted = Boolean(progress?.completed && (interactionCompletion?.completed ?? true));
      return [
        {
          id: standaloneCourseId(assignment.videoId),
          title: assignment.video.title,
          description: assignment.video.description,
          status: "PUBLISHED" as const,
          totalVideos: 1,
          completedVideos: effectiveCompleted ? 1 : 0,
          progressPercent: Math.round(effectivePercent),
          videos: [
            {
              id: assignment.video.id,
              title: assignment.video.title,
              description: assignment.video.description,
              sourceUrl: assignment.video.sourceUrl,
              durationSeconds: assignment.video.durationSeconds,
              h5pConfig: assignment.video.h5pConfig,
              position: 1,
              gatePrevious: false,
              locked: false,
              progress: progress
                ? {
                  percent: effectivePercent,
                  completed: effectiveCompleted,
                    watchedSeconds: progress.watchedSeconds,
                    lastPositionSeconds: progress.lastPositionSeconds
                  }
                : {
                    percent: 0,
                    completed: false,
                    watchedSeconds: 0,
                    lastPositionSeconds: 0
                  }
            }
          ]
        }
      ];
    });

    res.json({ courses: [...coursePayload, ...standalonePayload] });
  })
);

router.get(
  "/:courseId",
  asyncHandler<AuthedRequest>(async (req, res) => {
    const standaloneId = standaloneVideoId(req.params.courseId);
    if (standaloneId) {
      const video = await prisma.video.findUnique({ where: { id: standaloneId } });
      if (!video) {
        throw new HttpError(404, "Video not found");
      }

      const progress = await prisma.videoProgress.findFirst({
        where: { userId: req.user.id, videoId: standaloneId, courseId: null }
      });
      const h5pEvents = await prisma.h5PEvent.findMany({
        where: { userId: req.user.id, videoId: standaloneId, courseId: null },
        select: { videoId: true, courseId: true, interactionId: true }
      });
      const interactionCompletion = getRequiredInteractionCompletion(video.h5pConfig, getCompletedInteractionIds(h5pEvents, video.id, null));
      const effectivePercent = interactionCompletion?.percent ?? progress?.percent ?? 0;
      const effectiveCompleted = Boolean(progress?.completed && (interactionCompletion?.completed ?? true));

      res.json({
        course: {
          id: req.params.courseId,
          title: video.title,
          description: video.description,
          status: "PUBLISHED",
          totalVideos: 1,
          completedVideos: effectiveCompleted ? 1 : 0,
          progressPercent: Math.round(effectivePercent),
          videos: [
            {
              id: video.id,
              title: video.title,
              description: video.description,
              sourceUrl: video.sourceUrl,
              durationSeconds: video.durationSeconds,
              h5pConfig: video.h5pConfig,
              position: 1,
              gatePrevious: false,
              locked: false,
              progress: progress
                ? {
                  percent: effectivePercent,
                  completed: effectiveCompleted,
                    watchedSeconds: progress.watchedSeconds,
                    lastPositionSeconds: progress.lastPositionSeconds
                  }
                : {
                    percent: 0,
                    completed: false,
                    watchedSeconds: 0,
                    lastPositionSeconds: 0
                  }
            }
          ]
        }
      });
      return;
    }

    const hasAccess = await canAccessCourse(req.user, req.params.courseId);
    if (!hasAccess) {
      throw new HttpError(403, "Course not assigned");
    }

    const course = await getCourseOrThrow(req.params.courseId);
    const progress = await getProgressForCourse(req.user.id, course.id);
    const h5pEvents = await getH5PEventsForCourse(req.user.id, course.id);
    res.json({ course: serializeCourse(course, progress, h5pEvents, req.user.role) });
  })
);

router.get(
  "/:courseId/videos/:videoId",
  asyncHandler<AuthedRequest>(async (req, res) => {
    await assertVideoUnlocked(req.user, req.params.courseId, req.params.videoId);

    const video = await prisma.video.findUnique({ where: { id: req.params.videoId } });
    if (!video) {
      throw new HttpError(404, "Video not found");
    }

    const progress = await prisma.videoProgress.findFirst({
      where: {
        userId: req.user.id,
        videoId: video.id,
        courseId: standaloneVideoId(req.params.courseId) ? null : req.params.courseId
      }
    });

    res.json({ video, progress });
  })
);

export { router as coursesRouter };
