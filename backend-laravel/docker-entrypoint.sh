#!/usr/bin/env sh
set -e

php artisan migrate --force || true
php artisan config:clear || true
php artisan cache:clear || true

exec php artisan serve --host 0.0.0.0 --port "${PORT:-8000}"
