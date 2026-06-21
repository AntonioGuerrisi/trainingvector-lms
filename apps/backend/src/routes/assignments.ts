import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../lib/http.js";
import { invalidateReports } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

const assignmentSchema = z
  .object({
    courseId: z.string().optional(),
    videoId: z.string().optional(),
    userId: z.string().optional(),
    groupId: z.string().optional(),
    dueAt: z.string().datetime().optional(),
    notes: z.string().optional()
  })
  .refine((value) => Boolean(value.courseId) !== Boolean(value.videoId), "Assign either a course or a video")
  .refine((value) => Boolean(value.userId) !== Boolean(value.groupId), "Assign either a user or a group");

router.use(authenticate, authorize(Role.PROFESSOR, Role.ADMIN));

router.post(
  "/",
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = assignmentSchema.parse(req.body);
    const assignment = await prisma.assignment.create({
      data: {
        courseId: input.courseId,
        videoId: input.videoId,
        userId: input.userId,
        groupId: input.groupId,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        notes: input.notes,
        assignedById: req.user.id
      }
    });

    await invalidateReports();
    res.status(201).json({ assignment });
  })
);

export { router as assignmentsRouter };
