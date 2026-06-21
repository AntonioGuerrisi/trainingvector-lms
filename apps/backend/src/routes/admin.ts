import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { CourseStatus, Prisma, Role } from "@prisma/client";
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

const updateCourseSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(3),
  status: z.nativeEnum(CourseStatus)
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(Role)
});

const updateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.nativeEnum(Role)
});

const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(8),
  confirmNewPassword: z.string().min(8)
}).refine((input) => input.newPassword === input.confirmNewPassword, {
  message: "New password confirmation does not match",
  path: ["confirmNewPassword"]
});

const managedUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true
} satisfies Prisma.UserSelect;

const createGroupSchema = z.object({
  name: z.string().min(2)
});

const addGroupMemberSchema = z.object({
  userId: z.string().min(1),
  roleLabel: z.string().optional()
});

const h5pInteractionSchema = z.object({
  id: z.string().min(1),
  time: z.number().min(0),
  type: z.string().min(1).default("popup"),
  title: z.string().min(1),
  prompt: z.string().min(1)
});

const h5pConfigSchema = z.object({
  interactions: z.array(h5pInteractionSchema).default([])
});

const updateVideoSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  durationSeconds: z.number().int().positive().nullable().optional(),
  h5pConfig: h5pConfigSchema.default({ interactions: [] })
});

const deleteVideosSchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(100)
});

const attachVideoSchema = z.object({
  videoId: z.string().min(1),
  position: z.number().int().positive(),
  gatePrevious: z.boolean().default(true)
});

async function removeUploadedVideoFile(sourceUrl: string) {
  if (!sourceUrl.startsWith("/uploads/")) {
    return;
  }

  await unlink(path.join(env.UPLOAD_DIR, path.basename(sourceUrl))).catch(() => undefined);
}

router.use(authenticate);

router.post(
  "/users",
  authorize(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role
      },
      select: managedUserSelect
    });

    await invalidateReports();
    res.status(201).json({ user });
  })
);

router.put(
  "/users/:userId",
  authorize(Role.ADMIN),
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = updateUserSchema.parse(req.body);
    const { userId } = req.params;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true }
    });

    if (!existingUser) {
      throw new HttpError(404, "User not found");
    }

    if (userId === req.user.id && input.role !== Role.ADMIN) {
      throw new HttpError(400, "Administrators cannot change their own role");
    }

    if (existingUser.role === Role.ADMIN && input.role !== Role.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) {
        throw new HttpError(400, "At least one administrator account must remain");
      }
    }

    const emailConflict = await prisma.user.findFirst({
      where: { email: input.email, id: { not: userId } },
      select: { id: true }
    });

    if (emailConflict) {
      throw new HttpError(409, "Email is already assigned to another user");
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        email: input.email,
        role: input.role
      },
      select: managedUserSelect
    });

    await invalidateReports();
    res.json({ user });
  })
);

router.delete(
  "/users/:userId",
  authorize(Role.ADMIN),
  asyncHandler<AuthedRequest>(async (req, res) => {
    const { userId } = req.params;

    if (userId === req.user.id) {
      throw new HttpError(400, "Administrators cannot delete their own account");
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true }
    });

    if (!existingUser) {
      throw new HttpError(404, "User not found");
    }

    if (existingUser.role === Role.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) {
        throw new HttpError(400, "At least one administrator account must remain");
      }
    }

    const deletedUser = await prisma.user.delete({
      where: { id: userId },
      select: { id: true }
    });

    await invalidateReports();
    res.json({ deletedUserId: deletedUser.id });
  })
);

router.put(
  "/users/:userId/password",
  authorize(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = resetUserPasswordSchema.parse(req.body);
    const { userId } = req.params;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!existingUser) {
      throw new HttpError(404, "User not found");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: managedUserSelect
    });

    res.json({ user });
  })
);

router.post(
  "/groups",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = createGroupSchema.parse(req.body);
    const group = await prisma.group.create({ data: { name: input.name } });

    await invalidateReports();
    res.status(201).json({ group });
  })
);

router.post(
  "/groups/:groupId/members",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = addGroupMemberSchema.parse(req.body);
    const membership = await prisma.groupMembership.upsert({
      where: { userId_groupId: { userId: input.userId, groupId: req.params.groupId } },
      update: { roleLabel: input.roleLabel },
      create: {
        userId: input.userId,
        groupId: req.params.groupId,
        roleLabel: input.roleLabel
      }
    });

    await invalidateReports();
    res.status(201).json({ membership });
  })
);

router.post(
  "/videos/upload",
  authorize(Role.PROFESSOR, Role.ADMIN),
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

router.put(
  "/videos/:videoId",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = updateVideoSchema.parse(req.body);
    const existingVideo = await prisma.video.findUnique({
      where: { id: req.params.videoId },
      select: { id: true }
    });

    if (!existingVideo) {
      throw new HttpError(404, "Video not found");
    }

    const video = await prisma.video.update({
      where: { id: req.params.videoId },
      data: {
        title: input.title,
        description: input.description,
        durationSeconds: input.durationSeconds,
        h5pConfig: input.h5pConfig as Prisma.InputJsonValue
      }
    });

    await invalidateReports();
    res.json({ video });
  })
);

router.delete(
  "/videos",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = deleteVideosSchema.parse(req.body);
    const videos = await prisma.video.findMany({
      where: { id: { in: input.videoIds } },
      select: { id: true, sourceUrl: true }
    });

    if (videos.length === 0) {
      throw new HttpError(404, "No videos found");
    }

    const deletedVideoIds = videos.map((video) => video.id);
    await prisma.video.deleteMany({ where: { id: { in: deletedVideoIds } } });
    await Promise.all(videos.map((video) => removeUploadedVideoFile(video.sourceUrl)));

    await invalidateReports();
    res.json({ deletedVideoIds });
  })
);

router.put(
  "/videos/:videoId/h5p",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = h5pConfigSchema.parse(req.body);
    const video = await prisma.video.update({
      where: { id: req.params.videoId },
      data: { h5pConfig: input as Prisma.InputJsonValue }
    });

    await invalidateReports();
    res.json({ video });
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

router.put(
  "/courses/:courseId",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = updateCourseSchema.parse(req.body);
    const existingCourse = await prisma.course.findUnique({
      where: { id: req.params.courseId },
      select: { id: true }
    });

    if (!existingCourse) {
      throw new HttpError(404, "Course not found");
    }

    const course = await prisma.course.update({
      where: { id: req.params.courseId },
      data: input
    });

    await invalidateReports();
    res.json({ course });
  })
);

router.delete(
  "/courses/:courseId",
  authorize(Role.PROFESSOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const existingCourse = await prisma.course.findUnique({
      where: { id: req.params.courseId },
      select: { id: true }
    });

    if (!existingCourse) {
      throw new HttpError(404, "Course not found");
    }

    const course = await prisma.course.delete({
      where: { id: req.params.courseId },
      select: { id: true }
    });

    await invalidateReports();
    res.json({ deletedCourseId: course.id });
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
