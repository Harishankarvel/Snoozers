# AURA-AV Decision Support Backend Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install essential system dependencies for computer vision and networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Set default port
ENV PORT=8000
EXPOSE 8000

# Run FastAPI with Uvicorn
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
