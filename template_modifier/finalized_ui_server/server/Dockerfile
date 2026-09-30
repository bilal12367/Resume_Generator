FROM python:3.12-slim

WORKDIR /app

# Install system dependencies, build tools, and MySQL C client libraries required for compiling mysqlclient
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy uv binary from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency definition files
COPY pyproject.toml requirements.txt ./

# Install Python packages into container environment using uv
RUN uv pip install --system --no-cache -r requirements.txt

# Install Playwright Chromium browser and system dependencies
RUN playwright install chromium --with-deps || true

# Copy application source code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
