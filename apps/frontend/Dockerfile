FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY scripts/install-version-hook.mjs scripts/install-version-hook.mjs
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm install --workspace @lms/frontend --include-workspace-root=false

COPY apps/frontend apps/frontend
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @lms/frontend

FROM nginx:1.27-alpine
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
