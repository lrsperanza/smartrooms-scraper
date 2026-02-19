# syntax=docker/dockerfile:1

# Official Playwright image already includes browser binaries + system deps.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Install only production dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app source.
COPY smartrooms-healthcheck.js ./smartrooms-healthcheck.js

ENV NODE_ENV=production
ENV HEADLESS=true

# This container is intended for Cloud Run Jobs (one-off execution).
CMD ["node", "smartrooms-healthcheck.js"]
