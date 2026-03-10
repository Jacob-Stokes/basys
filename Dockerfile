# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ .

ENV VITE_API_URL=""
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
RUN npm install

COPY backend/ .
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine

WORKDIR /app

# Install build tools to compile native modules (better-sqlite3), then clean up
RUN apk add --no-cache python3 make g++

# Copy package files and install production dependencies fresh
COPY backend/package*.json ./
RUN npm install --omit=dev && apk del python3 make g++

# Runtime deps for Claude Agent SDK (spawns subprocess, needs bash/git)
RUN apk add --no-cache libgcc libstdc++ bash git

# Copy compiled TypeScript output
COPY --from=backend-builder /app/backend/dist ./dist

# Copy frontend build into public/ for Express to serve
COPY --from=frontend-builder /app/frontend/dist ./public

RUN mkdir -p /data

ENV DATABASE_URL=file:/data/harada.db

EXPOSE 3001

CMD ["npm", "start"]
