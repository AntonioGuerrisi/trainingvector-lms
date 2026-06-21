import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { adminRouter } from "./routes/admin.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { authRouter } from "./routes/auth.js";
import { coursesRouter } from "./routes/courses.js";
import { directoryRouter } from "./routes/directory.js";
import { progressRouter } from "./routes/progress.js";
import { reportsRouter } from "./routes/reports.js";
import { errorHandler, notFound } from "./middleware/error.js";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));

app.get("/api/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  const cache = redis.status;
  res.json({ status: "ok", cache });
});

app.use("/api/auth", authRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/progress", progressRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/directory", directoryRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`LMS backend listening on http://localhost:${env.PORT}`);
});