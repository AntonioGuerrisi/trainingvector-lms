import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signToken, verifyPassword } from "../lib/auth.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmNewPassword: z.string().min(8)
}).refine((input) => input.newPassword === input.confirmNewPassword, {
  message: "New password confirmation does not match",
  path: ["confirmNewPassword"]
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const credentials = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: credentials.email } });

    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: safeUser, token: signToken(safeUser) });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler<AuthedRequest>(async (req, res) => {
    res.json({ user: req.user });
  })
);

router.put(
  "/password",
  authenticate,
  asyncHandler<AuthedRequest>(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new HttpError(401, "Current password is incorrect");
    }

    if (await verifyPassword(input.newPassword, user.passwordHash)) {
      throw new HttpError(400, "New password must be different from the current password");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash }
    });

    res.json({ changed: true });
  })
);

export { router as authRouter };
