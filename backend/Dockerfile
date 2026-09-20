FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Migrate before serving. docker-compose has always done this through a command
# override, so only the deployed image was missing it — production came up with
# an empty database and every request touching a table returned a 500.
# Alembic takes a lock on its version table, so a second instance starting at the
# same time waits rather than racing.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
