FROM python:3.12-slim

# Prevent Python from writing .pyc files
# and ensure logs appear immediately
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install LibreOffice and required system dependencies
RUN apt-get update && apt-get install -y \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-liberation \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# Application directory
WORKDIR /app

# Install Python dependencies first
# This allows Docker to cache this layer
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app ./app
COPY main.py .

# Create temporary workspace
RUN mkdir -p /app/temp

# Expose FastAPI port
EXPOSE 8000

# Start application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]