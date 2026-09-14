FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY rule-engine /rule-engine
RUN useradd --create-home appuser && chown -R appuser:appuser /app /rule-engine
# Pre-create the PaddleOCR model-cache directory so its ownership (not
# root's) is what gets copied into a fresh named volume mounted here —
# Docker only propagates a mount point's existing content/ownership when
# the path already exists in the image at build time.
RUN mkdir -p /home/appuser/.paddlex && chown -R appuser:appuser /home/appuser/.paddlex
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
