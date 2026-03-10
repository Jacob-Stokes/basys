# Stage 1: Build TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Build tools needed for node-pty native compilation
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# node-pty needs native build tools at install time
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

# Clean up build tools but keep libraries node-pty needs at runtime
RUN apk del python3 make g++

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Install Claude Code CLI via native installer
# Alpine needs: curl, libgcc, libstdc++, ripgrep, bash, git
RUN apk add --no-cache curl libgcc libstdc++ ripgrep bash git \
    && curl -fsSL https://claude.ai/install.sh | bash \
    && mkdir -p /root/.claude \
    && echo '{"env":{"USE_BUILTIN_RIPGREP":"0"}}' > /root/.claude/settings.json

# Ensure claude is in PATH
ENV PATH="/root/.local/bin:${PATH}"

# Default working directory for terminal sessions
RUN mkdir -p /workspace

EXPOSE 4001

CMD ["npm", "start"]
