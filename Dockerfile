# syntax=docker/dockerfile:1.7

# ---- Builder stage: install Python deps + collectstatic ----
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Build deps for psycopg2 (from source in slim image) + libxml2 for extract-msg
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install dependencies to a separate prefix for clean copy
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt \
    && pip install --prefix=/install gunicorn==23.0.0 psycopg2-binary==2.9.10 django-redis==5.4.0 whitenoise==6.9.0

# ---- Runtime stage: minimal image, non-root user ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings_production

# Runtime libs: libpq for psycopg2, libxml2 for extract-msg, curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libxml2 \
    libxslt1.1 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /bin/bash appuser

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application code
WORKDIR /app
COPY --chown=appuser:appuser . /app

# Create directories for static + media + logs owned by appuser
RUN mkdir -p /app/staticfiles /app/media /app/logs \
    && chown -R appuser:appuser /app

USER appuser

# Collect static files (fails fast if settings misconfigured).
# P1-8: removed `|| true` — a silent collectstatic failure means the
# production image ships without admin CSS/JS, breaking the admin UI.
# The build must fail if collectstatic fails.
RUN DJANGO_SETTINGS_MODULE=config.settings_production \
    SECRET_KEY=docker-build-collectstatic-key-long-enough-for-deploy-check \
    ALLOWED_HOSTS=localhost \
    DB_NAME=db DB_USER=db DB_PASSWORD=db DB_HOST=db \
    REDIS_URL=redis://redis:6379/0 \
    USE_REDIS=true \
    FRONTEND_URL=http://localhost \
    ENABLE_API_DOCS=False \
    python manage.py collectstatic --noinput

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ready/ || exit 1

ENTRYPOINT ["/app/docker/entrypoint.sh"]
# P3-10: --max-requests recycles workers periodically to release memory
# leaked by long-running prod workloads (pandas, Excel parsing, reportlab
# may not fully release memory). Jitter avoids all workers recycling
# simultaneously.
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "120", "--max-requests", "1000", "--max-requests-jitter", "100", "--access-logfile", "-", "--error-logfile", "-", "config.wsgi:application"]
