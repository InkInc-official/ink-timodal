# ── Ink Timodal セットアップスクリプト（Windows版） ──
# 実行方法: PowerShellを管理者として開き
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🖤 Ink Timodal セットアップ（Windows版）" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""

# ── Dockerの確認 ──────────────────────────────────
try {
    docker --version | Out-Null
    Write-Host "✅ Docker が見つかりました。" -ForegroundColor Green
} catch {
    Write-Host "❌ Dockerがインストールされていません。" -ForegroundColor Red
    Write-Host "   https://docs.docker.com/desktop/install/windows-install/"
    exit 1
}

Write-Host ""

# ── ユーザー入力 ──────────────────────────────────
Write-Host "📋 以下の情報を入力してください。" -ForegroundColor Cyan
Write-Host ""
Write-Host "【DuckDNSの無料ドメイン取得方法】"
Write-Host "  1. https://www.duckdns.org にアクセス"
Write-Host "  2. GitHubなどでログイン"
Write-Host "  3. サブドメイン名を入力して「add domain」をクリック"
Write-Host "  4. ページ上部のtokenをコピー"
Write-Host ""

$subdomain = Read-Host "DuckDNSのサブドメイン名（例: ink-timodal）"
$domain    = "${subdomain}.duckdns.org"
$token     = Read-Host "DuckDNSのトークン"
$email     = Read-Host "メールアドレス（Let's Encrypt通知用）"

Write-Host ""
Write-Host "以下の設定で進めます：" -ForegroundColor Yellow
Write-Host "  ドメイン  : https://$domain"
Write-Host "  トークン  : $($token.Substring(0, [Math]::Min(8, $token.Length)))..."
Write-Host "  メール    : $email"
Write-Host ""
$confirm = Read-Host "よろしいですか？ [y/N]"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "キャンセルしました。"
    exit 0
}

# ── .env生成 ──────────────────────────────────────
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$envContent = "DOMAIN=$domain`nDUCKDNS_TOKEN=$token`nEMAIL=$email"
[System.IO.File]::WriteAllText("$PWD\.env", $envContent, $utf8NoBom)
Write-Host "✅ .env を生成しました。" -ForegroundColor Green

# ── フォルダ作成 ──────────────────────────────────
@("data", "certbot\conf", "certbot\www", "nginx\conf.d", "ollama") | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ | Out-Null }
}
Write-Host "✅ フォルダを作成しました。" -ForegroundColor Green

# ── Nginx設定（HTTP・証明書取得用） ─────────────────
$nginxHttp = "server {`r`n    listen 80;`r`n    server_name $domain;`r`n`r`n    location /.well-known/acme-challenge/ {`r`n        root /var/www/certbot;`r`n    }`r`n`r`n    location / {`r`n        return 301 https://`$host`$request_uri;`r`n    }`r`n}"
[System.IO.File]::WriteAllText("$PWD\nginx\conf.d\app.conf", $nginxHttp, $utf8NoBom)
Write-Host "✅ Nginx設定（HTTP）を作成しました。" -ForegroundColor Green

# ── Dockerビルド・起動 ────────────────────────────
Write-Host ""
Write-Host "🚀 Nginxとアプリを起動します..." -ForegroundColor Cyan
docker compose up -d nginx app
Start-Sleep -Seconds 3

# ── Let's Encrypt証明書取得 ───────────────────────
Write-Host ""
Write-Host "🔐 Let's Encrypt証明書を取得します..." -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  以下の手順で証明書を取得してください：" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. 別のPowerShellウィンドウで以下を実行："
Write-Host ""
Write-Host "   docker compose run --rm certbot certonly ``" -ForegroundColor White
Write-Host "     --manual --preferred-challenges dns ``" -ForegroundColor White
Write-Host "     --email $email --agree-tos --no-eff-email ``" -ForegroundColor White
Write-Host "     -d $domain" -ForegroundColor White
Write-Host ""
Write-Host "2. 表示されたTXTレコードの値をコピーする"
Write-Host ""
Write-Host "3. 別のPowerShellで以下を実行（<TXT値>を置き換える）："
Write-Host ""
Write-Host "   Invoke-WebRequest -Uri ``" -ForegroundColor White
Write-Host "     ""https://www.duckdns.org/update?domains=$subdomain&token=$token&txt=<TXT値>"" ``" -ForegroundColor White
Write-Host "     -UseBasicParsing" -ForegroundColor White
Write-Host ""
Write-Host "4. OKと表示されたらEnterを押す"
Write-Host ""
Read-Host "証明書の取得が完了したらEnterを押してください"

# ── Nginx設定（HTTPS版）に更新 ────────────────────
$certPath = "certbot\conf\live\$domain\fullchain.pem"
if (Test-Path $certPath) {
    $nginxHttps = "server {`r`n    listen 80;`r`n    server_name $domain;`r`n`r`n    location /.well-known/acme-challenge/ {`r`n        root /var/www/certbot;`r`n    }`r`n`r`n    location / {`r`n        return 301 https://`$host`$request_uri;`r`n    }`r`n}`r`n`r`nserver {`r`n    listen 443 ssl;`r`n    server_name $domain;`r`n`r`n    ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;`r`n    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;`r`n`r`n    ssl_protocols TLSv1.2 TLSv1.3;`r`n    ssl_ciphers HIGH:!aNULL:!MD5;`r`n`r`n    location / {`r`n        proxy_pass http://app:8020;`r`n        proxy_set_header Host `$host;`r`n        proxy_set_header X-Real-IP `$remote_addr;`r`n        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;`r`n        proxy_set_header X-Forwarded-Proto `$scheme;`r`n    }`r`n}"
    [System.IO.File]::WriteAllText("$PWD\nginx\conf.d\app.conf", $nginxHttps, $utf8NoBom)
    Write-Host "✅ Nginx設定（HTTPS）を更新しました。" -ForegroundColor Green

    # 全サービス起動
    Write-Host ""
    Write-Host "🚀 全サービスを起動します..." -ForegroundColor Cyan
    docker compose up -d
    docker compose exec nginx nginx -s reload

    Write-Host ""
    Write-Host "✅ セットアップ完了！" -ForegroundColor Green
    Write-Host ""
    Write-Host "🖤 Ink Timodal が起動しました：" -ForegroundColor Magenta
    Write-Host "   https://$domain" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💡 Ollamaモデルをダウンロードする場合（AI機能を使うなら）：" -ForegroundColor Yellow
    Write-Host "   docker compose exec ollama ollama pull gemma2:9b"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "⚠️  証明書が見つかりません。" -ForegroundColor Yellow
    Write-Host "   証明書取得後に再度 .\setup.ps1 を実行してください。"
}
