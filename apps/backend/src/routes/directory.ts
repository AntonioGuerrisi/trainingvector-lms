import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorize(Role.PROFESSOR, Role.ADMIN));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [users, groups, videos] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" } }),
      prisma.group.findMany({ include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } }),
      prisma.video.findMany({ select: { id: true, title: true, description: true, sourceUrl: true }, orderBy: { createdAt: "desc" } })
    ]);

    res.json({ users, groups, videos });
  })
);

export { router as directoryRouter };
