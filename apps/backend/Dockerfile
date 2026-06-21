FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/backend/prisma apps/backend/prisma
RUN npm install --workspace @lms/backend --include-workspace-root=false

COPY apps/backend apps/backend
RUN npm run build -w @lms/backend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend apps/backend

WORKDIR /app/apps/backend
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
