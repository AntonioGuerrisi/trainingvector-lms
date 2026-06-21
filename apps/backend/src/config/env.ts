import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(configDir, "../../../../.env") });
config({ path: path.resolve(configDir, "../../.env") });
config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("postgresql://lms:lms@localhost:5432/lms?schema=public"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16).default("change-me-in-development-only"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("uploads")
});

export const env = envSchema.parse(process.env);

process.env.NODE_ENV = env.NODE_ENV;
process.env.PORT = String(env.PORT);
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.REDIS_URL = env.REDIS_URL;
process.env.JWT_SECRET = env.JWT_SECRET;
process.env.CORS_ORIGIN = env.CORS_ORIGIN;
process.env.UPLOAD_DIR = env.UPLOAD_DIR;
