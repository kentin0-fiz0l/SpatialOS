FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY addon.py ./
COPY watchdog_proxy ./watchdog_proxy
ENV PYTHONUNBUFFERED=1
EXPOSE 8080 8790
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8790/healthz')"
CMD ["mitmdump", "-s", "addon.py", "--set", "watchdog_config=/config/watchdog.yaml", \
     "--set", "watchdog_devices=/config/devices.yaml", \
     "--set", "confdir=/certs", "--listen-port", "8080", "--set", "flow_detail=0"]
