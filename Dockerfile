# Stage 1: Install dependencies and run tests
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm test

# Stage 2: Production image (no devDependencies, no test files)
FROM node:20-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

USER node

CMD ["node", "src/index.js"]
