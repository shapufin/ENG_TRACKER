# syntax=docker/dockerfile:1.7

# ---- Builder: install deps + build production bundle ----
FROM node:22-slim AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Build-time API URL; runtime uses VITE_API_URL env if provided
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Runtime: nginx serves static bundle ----
# nginx has no Debian "-slim" variant (unlike node/python) — only the
# default Debian image or an "-alpine"/"-alpine-slim" variant exist, so
# `nginx:1.27-slim` was never a real tag and this build failed at pull.
FROM nginx:1.27-alpine-slim AS runtime

# Remove default nginx config + static site
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config: SPA fallback + API proxy + security headers
COPY docker/nginx.conf /etc/nginx/conf.d/app.conf

# Copy built assets
COPY --from=builder /build/dist /usr/share/nginx/html

# Install wget for the healthcheck (the alpine-slim variant does not
# include it). Without this the healthcheck exits 127 and Docker marks
# the container permanently unhealthy (P0-7 addendum). Alpine uses apk,
# not apt-get.
RUN apk add --no-cache wget

# Run as non-root (nginx unprivileged user)
USER 101:101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/ || exit 1
