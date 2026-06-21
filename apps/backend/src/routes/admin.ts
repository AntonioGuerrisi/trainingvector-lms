import { mkdirSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { CourseStatus, Role } from "@prisma/client";
import { z } from "zod";
import { env } from "../config/env.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { invalidateReports } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

mkdirSync(env.UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, env.UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const safeBase = path.basename(file.originalname).replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
    callback(null, `${Date.now()}-${safeBase}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "video/mp4") {
      callback(new HttpError(400, "Only MP4 videos are supported"));
      return;
    }
    callback(null, true);
  }
});

const createCourseSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(3),
  status: z.nativeEnum(CourseStatus).default(CourseStatus.DRAFT)
});

const attachVideoSchema = z.object({
  videoId: z.string().min(1),
  position: z.number().int().positive(),
  gatePrevious: z.boolean().default(true)
});

router.use(authenticate);

router.post(
  "/videos/upload",
  authorize(Role.ADMIN),
  upload.single("video"),
  asyncHandler<AuthedRequest>(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing MP4 file");
    }

    const h5pConfig = req.body.h5pConfig ? JSON.parse(String(req.body.h5pConfig)) : { interactions: [] };
    const video = await prisma.video.create({
      data: {
        title: String(req.body.title ?? req.file.originalname),
        description: String(req.body.description ?? ""),
        sourceUrl: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        durationSeconds: req.body.durationSeconds ? Number(req.body.durationSeconds) : undefined,
        h5pConfig,
        createdById: req.user.id
      }
    });

    await invalidateReports();
    res.status(201).json({ video });
  })
);

router.post(
  "/courses",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = createCourseSchema.parse(req.body);
    const course = await prisma.course.create({
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        createdById: req.user.id
      }
    });

    await invalidateReports();
    res.status(201).json({ course });
  })
);

router.post(
  "/courses/:courseId/videos",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = attachVideoSchema.parse(req.body);
    const courseVideo = await prisma.courseVideo.upsert({
      where: { courseId_videoId: { courseId: req.params.courseId, videoId: input.videoId } },
      update: { position: input.position, gatePrevious: input.gatePrevious },
      create: {
        courseId: req.params.courseId,
        videoId: input.videoId,
        position: input.position,
        gatePrevious: input.gatePrevious
      }
    });

    await invalidateReports();
    res.status(201).json({ courseVideo });
  })
);

export { router as adminRouter };
