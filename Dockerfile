FROM node:20-slim AS builder

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and prisma schema (needed for postinstall prisma generate)
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma/ prisma/

# Install all dependencies (postinstall runs prisma generate; @swc/core downloads native binary)
RUN npm install --legacy-peer-deps

# Copy rest of backend source code
COPY backend/src/ ./src/
COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json backend/build.js ./

# Build NestJS
RUN npm run build

# --- Production stage ---
FROM node:20-slim AS runner

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

ENV NODE_ENV=production

EXPOSE 3001

CMD ["sh", "-c", "./node_modules/.bin/prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss || true; node dist/main"]
