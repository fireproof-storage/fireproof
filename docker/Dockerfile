# Fireproof Cloud - Multi-target Docker Build
#
# Targets:
#   cloud-backend  - Wrangler dev with R2 storage
#   dashboard      - Dashboard frontend + API
#   todo-app       - 3rd-party example application (nginx)
#
# Usage:
#   docker build --target cloud-backend -t fireproof-cloud-backend .
#   docker build --target dashboard -t fireproof-dashboard .
#   docker build --target todo-app -t fireproof-todo-app .

# -- Shared base --
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm fetch
COPY . .
RUN pnpm install --prefer-offline --no-frozen-lockfile

# -- Cloud Backend --
FROM base AS cloud-backend
RUN mkdir -p /app/.wrangler/state
COPY docker/cloud-backend-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8909
CMD ["/entrypoint.sh"]

# -- Dashboard --
FROM base AS dashboard
RUN npm install -g tsx
ARG VITE_CLERK_PUBLISHABLE_KEY=pk_test_c2luY2VyZS1jaGVldGFoLTMwLmNsZXJrLmFjY291bnRzLmRldiQ
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
WORKDIR /app/dashboard/frontend
RUN pnpm run build:vite
WORKDIR /app
ENV STATIC_DIR=/app/dashboard/frontend/dist/static/client
ENV DB_PATH=/app/data/sqlite.db
ENV PORT=7370
RUN mkdir -p /app/data
EXPOSE 7370
CMD sh -c "cd /app/dashboard/backend && DASH_FP_TEST_SQL_URL=file://${DB_PATH} \
  pnpm exec drizzle-kit push --config ./drizzle.libsql.config.ts && \
  cd /app && tsx dashboard/backend/node-serve.ts"

# -- Todo App builder --
FROM base AS todo-builder
ARG VITE_DASHBOARD_URI=http://localhost:8080/fp/cloud/api/token
ARG VITE_TOKEN_API_URI=http://localhost:8080/api
ARG VITE_CLOUD_BACKEND_URL=fpcloud://localhost:8080?protocol=ws
ENV VITE_DASHBOARD_URI=${VITE_DASHBOARD_URI}
ENV VITE_TOKEN_API_URI=${VITE_TOKEN_API_URI}
ENV VITE_CLOUD_BACKEND_URL=${VITE_CLOUD_BACKEND_URL}
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app/cloud/3rd-party
RUN pnpm exec vite build

# -- Todo App production --
FROM nginx:alpine AS todo-app
COPY --from=todo-builder /app/cloud/3rd-party/dist /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; \
  location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
