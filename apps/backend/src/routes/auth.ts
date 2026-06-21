import { Router } from "express";
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

export { router as authRouter };
