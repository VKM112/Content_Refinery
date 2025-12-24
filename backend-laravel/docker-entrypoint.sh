#!/usr/bin/env sh
set -e

php artisan migrate --force || true
php artisan config:clear || true
php artisan cache:clear || true

article_count="$(php artisan tinker --execute="echo \\App\\Models\\Article::count();" 2>/dev/null | tr -d '\r\n')"
if [ "${article_count}" = "0" ]; then
  php artisan scrape:beyondchats --count=5 || true
fi

exec php artisan serve --host 0.0.0.0 --port "${PORT:-8000}"
