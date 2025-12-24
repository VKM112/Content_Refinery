FROM php:8.4-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        unzip \
        libpq-dev \
        libzip-dev \
    && docker-php-ext-install pdo pdo_mysql pdo_pgsql zip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY . .

RUN composer install --no-dev --optimize-autoloader \
    && chmod -R 775 storage bootstrap/cache

ENV APP_ENV=production
ENV APP_DEBUG=false

RUN chmod +x /var/www/html/docker-entrypoint.sh

CMD ["/var/www/html/docker-entrypoint.sh"]
