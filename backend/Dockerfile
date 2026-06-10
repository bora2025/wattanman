FROM node:20-slim AS builder

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and prisma schema first (needed for postinstall prisma generate)
COPY package.json package-lock.json ./
COPY prisma/schema.prisma prisma/schema.prisma

# Install all dependencies (postinstall runs prisma generate with schema available)
RUN npm install --legacy-peer-deps

# Copy rest of source code
COPY . .

# Build NestJS
RUN npm run build

# --- Production stage ---
FROM node:20-slim AS runner

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only what's needed for production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production

EXPOSE 3001

CMD ["sh", "-c", "./node_modules/.bin/prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss || true; node prisma/seed-prod.js; node dist/main"]
