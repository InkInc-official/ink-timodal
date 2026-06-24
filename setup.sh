#!/bin/bash
# ── Ink Timodal セットアップスクリプト ──────────────
set -e

echo ""
echo "🖤 Ink Timodal セットアップ"
echo "================================"
echo ""

# ── 必要なコマンドの確認 ──────────────────────────
if ! command -v docker &> /dev/null; then
    echo "❌ Dockerがインストールされていません。"
    echo "   https://docs.docker.com/get-docker/ からインストールしてください。"
    exit 1
fi

echo "✅ Docker が見つかりました。"
echo ""

# ── ユーザー入力 ──────────────────────────────────
echo "📋 以下の情報を入力してください。"
echo ""
echo "【DuckDNSの無料ドメイン取得方法】"
echo "  1. https://www.duckdns.org にアクセス"
echo "  2. GitHubなどでログイン"
echo "  3. サブドメイン名を入力して「add domain」をクリック"
echo "  4. ページ上部のtokenをコピー"
echo ""

read -p "DuckDNSのサブドメイン名（例: ink-timodal）: " SUBDOMAIN
DOMAIN="${SUBDOMAIN}.duckdns.org"

read -p "DuckDNSのトークン: " DUCKDNS_TOKEN

read -p "メールアドレス（Let's Encrypt通知用）: " EMAIL

echo ""
echo "以下の設定で進めます："
echo "  ドメイン  : https://${DOMAIN}"
echo "  トークン  : ${DUCKDNS_TOKEN:0:8}..."
echo "  メール    : ${EMAIL}"
echo ""
read -p "よろしいですか？ [y/N]: " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "キャンセルしました。"
    exit 0
fi

# ── .env生成 ──────────────────────────────────────
cat > .env << ENVEOF
DOMAIN=${DOMAIN}
DUCKDNS_TOKEN=${DUCKDNS_TOKEN}
EMAIL=${EMAIL}
ENVEOF
echo "✅ .env を生成しました。"

# ── フォルダ作成 ──────────────────────────────────
mkdir -p data certbot/conf certbot/www nginx/conf.d ollama
echo "✅ フォルダを作成しました。"

# ── Nginx設定（HTTP・証明書取得用） ─────────────────
cat > nginx/conf.d/app.conf << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
NGINXEOF
echo "✅ Nginx設定（HTTP）を作成しました。"

# ── Dockerビルド・起動（Nginxのみ） ────────────────
echo ""
echo "🚀 Nginxを起動します..."
docker compose up -d nginx app

sleep 3

# ── DuckDNSにTXTレコードを登録 ─────────────────────
echo ""
echo "🔐 Let's Encrypt証明書を取得します..."
echo "   DuckDNSにTXTレコードを登録中..."

# DNS-01チャレンジ用の自動化
docker compose run --rm certbot certonly \
    --manual \
    --preferred-challenges dns \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --manual-auth-hook "/etc/letsencrypt/renewal-hooks/auth/duckdns.sh" \
    -d "${DOMAIN}" || {
    echo ""
    echo "⚠️  自動取得に失敗しました。手動で取得します..."
    echo ""
    echo "以下のコマンドを実行して証明書を取得してください："
    echo ""
    echo "  docker compose run --rm certbot certonly \\"
    echo "    --manual --preferred-challenges dns \\"
    echo "    --email ${EMAIL} --agree-tos --no-eff-email \\"
    echo "    -d ${DOMAIN}"
    echo ""
    echo "表示されたTXTレコードを以下のURLで登録してください："
    echo "  https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&txt=<TXTの値>"
    echo ""
}

# ── Nginx設定（HTTPS） ────────────────────────────
if [ -f "certbot/conf/live/${DOMAIN}/fullchain.pem" ]; then
    cat > nginx/conf.d/app.conf << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://app:8020;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF
    echo "✅ Nginx設定（HTTPS）を更新しました。"

    # ── 全サービス起動 ────────────────────────────
    echo ""
    echo "🚀 全サービスを起動します..."
    docker compose up -d
    docker compose exec nginx nginx -s reload

    echo ""
    echo "✅ セットアップ完了！"
    echo ""
    echo "🖤 Ink Timodal が起動しました："
    echo "   https://${DOMAIN}"
    echo ""
    echo "💡 Ollamaモデルをダウンロードする場合："
    echo "   docker compose exec ollama ollama pull gemma2:9b"
    echo ""
else
    echo ""
    echo "⚠️  証明書が見つかりません。"
    echo "   手動で証明書を取得してから以下を実行してください："
    echo "   ./setup.sh"
fi
