#!/bin/sh
set -e
source ~/.bashrc
# 启动nginx并检查
echo "Starting nginx..."
nginx -c /etc/nginx/mcpez.conf
if [ $? -ne 0 ]; then
    echo "Failed to start nginx"
    exit 1
fi

# 启动主应用
echo "Starting application..."
cd /data/app
uv run uvicorn mcpez.main:app

sleep infinity