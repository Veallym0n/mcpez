
FROM alpine:latest

RUN apk update
RUN apk add bash openresty openrc python3 py3-pip sqlite pipx nodejs npm 
RUN pipx install uv 
RUN pipx ensurepath
ENV PATH="/root/.local/bin:$PATH"
RUN mkdir -p /data/app
WORKDIR /data/app
RUN uv venv
RUN uv pip install tornado fastapi uvicorn sqlmodel httpx httpx-sse 
RUN mkdir -p /var/run/mcpez
COPY ./mcpeasy-entrypoint.sh /mcpeasy-entrypoint.sh
COPY mcpez_ngx.conf /etc/nginx/mcpez.conf
COPY ./bin /data/app/bin 
COPY ./mcpez /data/app/mcpez
COPY ./webui /data/app/webui
RUN chmod +x /mcpeasy-entrypoint.sh 
ENTRYPOINT ["/mcpeasy-entrypoint.sh"]