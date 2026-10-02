FROM python:3.12-slim
RUN useradd --create-home agent && mkdir /workspace && chown agent /workspace
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py .
USER agent
ENV PYTHONUNBUFFERED=1
# Idle until given a task: docker compose exec researcher python agent.py "..."
CMD ["sleep", "infinity"]
