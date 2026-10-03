FROM python:3.12-slim
# uid 1000 matches the first user on Raspberry Pi OS / most Linux hosts, so the bind-mounted
# workspace is writable there as well as on macOS.
RUN useradd --uid 1000 --create-home agent && mkdir /workspace && chown agent /workspace
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py .
COPY skills ./skills
USER agent
ENV PYTHONUNBUFFERED=1
# Idle until given a task: docker compose exec researcher python agent.py "..."
CMD ["sleep", "infinity"]
