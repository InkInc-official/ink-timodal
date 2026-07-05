#!/bin/bash
# ホスト→コンテナへの完全同期
CONTAINER="ink-timodal-app-1"
DIR="/home/hp/InkTools/ink-timodal"

docker cp $DIR/frontend/app.js $CONTAINER:/app/frontend/app.js
docker cp $DIR/frontend/index.html $CONTAINER:/app/frontend/index.html
docker cp $DIR/frontend/style.css $CONTAINER:/app/frontend/style.css
docker cp $DIR/main.py $CONTAINER:/app/main.py
docker cp $DIR/database.py $CONTAINER:/app/database.py

echo "同期完了 $(date)"
