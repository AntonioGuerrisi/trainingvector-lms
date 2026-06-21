import { Router } from "express";
import { Role } from "@prisma/client";
import { cached } from "../lib/redis.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorize(Role.PROFESSOR, Role.ADMIN));

router.get(
  "/overview",
  asyncHandler<AuthedRequest>(async (_req, res) => {
    const overview = await cached("reports:overview", 60, async () => {
      const [courses, videos, learners, completedViews, progressRows, h5pEvents] = await Promise.all([
        prisma.course.count(),
        prisma.video.count(),
        prisma.user.count({ where: { role: Role.STUDENT } }),
        prisma.videoProgress.count({ where: { completed: true } }),
        prisma.videoProgress.findMany({ select: { percent: true } }),
        prisma.h5PEvent.count()
      ]);

      const averageProgress = progressRows.length === 0
        ? 0
        : Math.round(progressRows.reduce((sum, progress) => sum + progress.percent, 0) / progressRows.length);

      return { courses, videos, learners, completedViews, averageProgress, h5pEvents };
    });

    res.json({ overview });
  })
);

router.get(
  "/courses/:courseId",
  asyncHandler<AuthedRequest>(async (req, res) => {
    const course = await prisma.course.findUnique({
      where: { id: req.params.courseId },
      include: {
        videos: { include: { video: true }, orderBy: { position: "asc" } },
        assignments: { include: { user: true, group: { include: { members: { include: { user: true } } } } } }
      }
    });

    if (!course) {
      throw new HttpError(404, "Course not found");
    }

    const progress = await prisma.videoProgress.findMany({
      where: { courseId: course.id },
      include: { user: { select: { id: true, name: true, email: true } }, video: { select: { id: true, title: true } } },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ course, progress });
  })
);

router.get(
  "/progress",
  asyncHandler<AuthedRequest>(async (_req, res) => {
    const progress = await prisma.videoProgress.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        video: { select: { id: true, title: true } },
        course: { select: { id: true, title: true } }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ progress });
  })
);

export { router as reportsRouter };
