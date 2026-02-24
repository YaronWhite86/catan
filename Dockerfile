# Stage 1: Build the client
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production image
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Built client from stage 1
COPY --from=build /app/dist ./dist

# Server source (runs via tsx at runtime)
COPY server/ ./server/

# Engine, AI, and shared modules imported by the server
COPY src/engine/ ./src/engine/
COPY src/ai/ ./src/ai/
COPY src/shared/ ./src/shared/

EXPOSE 3001

CMD ["npm", "run", "server:start"]
