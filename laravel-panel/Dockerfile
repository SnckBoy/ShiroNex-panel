FROM php:8.3-cli

WORKDIR /var/www/html

RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip libzip-dev \
    && docker-php-ext-install pdo_mysql mbstring zip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY composer.json composer.lock ./
RUN composer install --no-interaction --prefer-dist --no-progress --no-dev

COPY . .
RUN mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views bootstrap/cache \
    && chmod -R ug+rw storage bootstrap/cache

EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
