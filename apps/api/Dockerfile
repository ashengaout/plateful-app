# Multi-stage build for better caching and smaller final image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for workspace setup
COPY package.json package-lock.json* ./
COPY turbo.json* ./
COPY tsconfig.json ./

# Copy shared package
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

# Copy API package
COPY apps/api/package.json ./apps/api/
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/server.ts ./apps/api/
COPY apps/api/dev-server.ts ./apps/api/
COPY apps/api/api ./apps/api/api
COPY apps/api/lib ./apps/api/lib
COPY apps/api/services ./apps/api/services
COPY apps/api/utils ./apps/api/utils

# Install all dependencies (workspace will handle hoisting)
RUN npm ci --legacy-peer-deps

# Build shared package first
WORKDIR /app/packages/shared
RUN npm run build

# Build API
WORKDIR /app
RUN npm run build --workspace=api

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files for workspace setup
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install only production dependencies (workspace will hoist to root node_modules)
RUN npm ci --production --legacy-peer-deps --omit=dev

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Ensure @plateful/shared is accessible in node_modules (workspace hoisting should handle this, but ensure it's there)
RUN mkdir -p ./node_modules/@plateful && \
    rm -rf ./node_modules/@plateful/shared && \
    mkdir -p ./node_modules/@plateful/shared && \
    cp -r ./packages/shared/dist ./node_modules/@plateful/shared/ && \
    cp ./packages/shared/package.json ./node_modules/@plateful/shared/ && \
    node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('./node_modules/@plateful/shared/package.json')); pkg.main='./dist/index.js'; pkg.types='./dist/index.d.ts'; fs.writeFileSync('./node_modules/@plateful/shared/package.json', JSON.stringify(pkg, null, 2));"

WORKDIR /app/apps/api

# Set default PORT (Azure App Service will override this)
ENV PORT=8080

# Expose port (Azure App Service uses PORT env var, default to 8080)
EXPOSE 8080

# Start the server
CMD ["node", "dist/apps/api/server.js"]

