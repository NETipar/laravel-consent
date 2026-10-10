<?php

declare(strict_types=1);

namespace NETipar\Consent\Config;

use NETipar\Consent\Category;
use NETipar\Consent\CookieTable\CookieEntry;
use NETipar\Consent\Exceptions\InvalidConfigurationException;

final readonly class ConsentConfig
{
    private const string COOKIE_NAME_PATTERN = '/^[A-Za-z0-9_\-]+$/';

    private const string DOMAIN_PATTERN = '/^\.?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/';

    private const string COOKIE_PATTERN = '/^[A-Za-z0-9_\-]+\*?$/';

    private const string LIFETIME_PATTERN = '/^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/';

    private const string CATEGORY_PATTERN = '/^[a-z0-9_-]+$/';

    /** Max 36 chars: the longest generated index name appends 28, and MySQL caps identifiers at 64. */
    private const string TABLE_PATTERN = '/^[a-z_][a-z0-9_]{0,35}$/';

    private const string TAG_PATTERN = '/^(G|AW|GT|DC|UA)-[A-Z0-9\-]+$/';

    /** @var list<string> */
    private const array SAME_SITE = ['Lax', 'Strict', 'None'];

    /** @var list<string> */
    private const array SIGNALS = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];

    /**
     * @param  list<Category>  $categories
     * @param  string|array<string, string>|null  $policyUrl
     * @param  list<array{id: string, category: string}>  $googleTags
     * @param  array<string, string>  $googleSignals
     * @param  list<string>  $logRouteMiddleware
     */
    public function __construct(
        public string $version,
        public string $cookieName,
        public string $versionCookieName,
        public int $lifetimeDays,
        public ?string $domain,
        public string $sameSite,
        public ?bool $secure,
        public array $categories,
        public bool $reloadOnRevoke,
        public string|array|null $policyUrl,
        public array $googleTags,
        public array $googleSignals,
        public bool $adsDataRedaction,
        public bool $urlPassthrough,
        public bool $logEnabled,
        public string $logTable,
        public ?string $logConnection,
        public int $logRetentionDays,
        public string $logRoutePrefix,
        public array $logRouteMiddleware,
        public int $logThrottlePerMinute,
        public string $logIdCookieName,
        public bool $logStoreIp,
        public bool $logStoreUserAgent,
        public int $logUserAgentMaxLength,
        public bool $logStoreUserId,
    ) {}

    /**
     * @param  array<array-key, mixed>  $config
     *
     * @throws InvalidConfigurationException
     */
    public static function fromArray(array $config): self
    {
        $version = $config['version'] ?? null;

        if (! is_string($version) || trim($version) === '') {
            throw InvalidConfigurationException::forKey('version', 'must be a non-empty string.');
        }

        $cookie = self::section($config, 'cookie');
        $cookieName = self::matching($cookie, 'cookie.name', 'name', self::COOKIE_NAME_PATTERN);
        $versionCookieName = self::matching($cookie, 'cookie.version_name', 'version_name', self::COOKIE_NAME_PATTERN);
        $lifetimeDays = self::integer($cookie, 'cookie.lifetime_days', 'lifetime_days', 1, 730);
        $domain = self::nullableString($cookie, 'cookie.domain', 'domain');

        if ($domain !== null && preg_match(self::DOMAIN_PATTERN, $domain) !== 1) {
            throw InvalidConfigurationException::forKey('cookie.domain', 'must be null or a host name such as "example.com" or ".example.com".');
        }

        $sameSite = $cookie['same_site'] ?? null;

        if (! is_string($sameSite) || ! in_array($sameSite, self::SAME_SITE, true)) {
            throw InvalidConfigurationException::forKey('cookie.same_site', 'must be one of: '.implode(', ', self::SAME_SITE).'.');
        }

        $secure = $cookie['secure'] ?? null;

        if ($secure !== null && ! is_bool($secure)) {
            throw InvalidConfigurationException::forKey('cookie.secure', 'must be null or a boolean.');
        }

        $categories = self::categories($config);
        $known = array_map(static fn (Category $category): string => $category->key, $categories);
        $optional = array_values(array_map(
            static fn (Category $category): string => $category->key,
            array_filter($categories, static fn (Category $category): bool => ! $category->required),
        ));

        $google = self::section($config, 'google');
        $log = self::section($config, 'log');
        $route = self::section($log, 'log.route', 'route');

        $logRetentionDays = self::integer($log, 'log.retention_days', 'retention_days', 1, 3650);

        if ($logRetentionDays < $lifetimeDays) {
            throw InvalidConfigurationException::forKey('log.retention_days', 'must be greater than or equal to consent.cookie.lifetime_days ('.$lifetimeDays.'): the proof has to outlive the consent it proves.');
        }

        return new self(
            version: $version,
            cookieName: $cookieName,
            versionCookieName: $versionCookieName,
            lifetimeDays: $lifetimeDays,
            domain: $domain,
            sameSite: $sameSite,
            secure: $secure,
            categories: $categories,
            reloadOnRevoke: self::boolean($config, 'reload_on_revoke', 'reload_on_revoke'),
            policyUrl: self::policyUrl($config['policy_url'] ?? null),
            googleTags: self::googleTags($google, $known, $optional),
            googleSignals: self::googleSignals($google, $known),
            adsDataRedaction: self::boolean($google, 'google.ads_data_redaction', 'ads_data_redaction'),
            urlPassthrough: self::boolean($google, 'google.url_passthrough', 'url_passthrough'),
            logEnabled: self::boolean($log, 'log.enabled', 'enabled'),
            logTable: self::matching($log, 'log.table', 'table', self::TABLE_PATTERN),
            logConnection: self::nullableString($log, 'log.connection', 'connection'),
            logRetentionDays: $logRetentionDays,
            logRoutePrefix: self::string($route, 'log.route.prefix', 'prefix'),
            logRouteMiddleware: self::stringList($route, 'log.route.middleware', 'middleware'),
            logThrottlePerMinute: self::integer($route, 'log.route.throttle', 'throttle', 1, 1000),
            logIdCookieName: self::matching($log, 'log.id_cookie_name', 'id_cookie_name', self::COOKIE_NAME_PATTERN),
            logStoreIp: self::boolean($log, 'log.store_ip', 'store_ip'),
            logStoreUserAgent: self::boolean($log, 'log.store_user_agent', 'store_user_agent'),
            logUserAgentMaxLength: array_key_exists('user_agent_max_length', $log)
                ? self::integer($log, 'log.user_agent_max_length', 'user_agent_max_length', 1, 255)
                : 255,
            logStoreUserId: self::boolean($log, 'log.store_user_id', 'store_user_id'),
        );
    }

    public function category(string $key): ?Category
    {
        foreach ($this->categories as $category) {
            if ($category->key === $key) {
                return $category;
            }
        }

        return null;
    }

    /**
     * @return list<string>
     */
    public function requiredKeys(): array
    {
        return array_values(array_map(
            static fn (Category $category): string => $category->key,
            array_filter($this->categories, static fn (Category $category): bool => $category->required),
        ));
    }

    /**
     * Required categories are always granted; the result follows the config order and drops unknown keys.
     *
     * @return list<string>
     */
    public function normaliseGranted(mixed $granted): array
    {
        $granted = is_array($granted) ? $granted : [];
        $required = $this->requiredKeys();

        return array_values(array_filter(
            $this->keys(),
            static fn (string $key): bool => in_array($key, $required, true) || in_array($key, $granted, true),
        ));
    }

    /**
     * @return list<string>
     */
    public function keys(): array
    {
        return array_map(static fn (Category $category): string => $category->key, $this->categories);
    }

    /**
     * @param  array<array-key, mixed>  $config
     * @return list<Category>
     */
    private static function categories(array $config): array
    {
        $raw = $config['categories'] ?? null;

        if (! is_array($raw) || $raw === []) {
            throw InvalidConfigurationException::forKey('categories', 'must be a non-empty array.');
        }

        $categories = [];
        $hasRequired = false;

        foreach ($raw as $key => $definition) {
            if (! is_string($key) || preg_match(self::CATEGORY_PATTERN, $key) !== 1) {
                throw InvalidConfigurationException::forKey('categories.'.$key, 'key must match '.self::CATEGORY_PATTERN.'.');
            }

            if (! is_array($definition)) {
                throw InvalidConfigurationException::forKey("categories.{$key}", 'must be an array.');
            }

            $required = $definition['required'] ?? false;

            if (! is_bool($required)) {
                throw InvalidConfigurationException::forKey("categories.{$key}.required", 'must be a boolean.');
            }

            $hasRequired = $hasRequired || $required;
            $categories[] = new Category($key, $required, self::cookies($definition['cookies'] ?? [], $key));
        }

        if (! $hasRequired) {
            throw InvalidConfigurationException::forKey('categories', 'needs at least one category with required => true.');
        }

        return $categories;
    }

    /**
     * @return list<CookieEntry>
     */
    private static function cookies(mixed $raw, string $category): array
    {
        $path = "categories.{$category}.cookies";

        if (! is_array($raw)) {
            throw InvalidConfigurationException::forKey($path, 'must be a list of cookie names or cookie definitions.');
        }

        $cookies = [];
        $names = [];
        $index = 0;

        foreach ($raw as $entry) {
            $entryPath = "{$path}.{$index}";

            if (is_array($entry)) {
                $name = self::richCookie($entry, $entryPath);
            } elseif (is_string($entry) && preg_match(self::COOKIE_PATTERN, $entry) === 1) {
                $name = $entry;
            } else {
                throw InvalidConfigurationException::forKey($path, 'entries must be cookie names (optionally ending in a single trailing "*" wildcard) or arrays with a "name".');
            }

            if (in_array($name, $names, true)) {
                throw InvalidConfigurationException::forKey($path, "lists \"{$name}\" more than once.");
            }

            $names[] = $name;
            $cookies[] = CookieEntry::fromConfig($entry);
            $index++;
        }

        return $cookies;
    }

    /**
     * Validates a rich cookie entry and returns its name.
     *
     * @param  array<array-key, mixed>  $entry
     */
    private static function richCookie(array $entry, string $path): string
    {
        $name = $entry['name'] ?? null;

        if (! is_string($name) || preg_match(self::COOKIE_PATTERN, $name) !== 1) {
            throw InvalidConfigurationException::forKey("{$path}.name", 'must match '.self::COOKIE_PATTERN.'.');
        }

        $provider = $entry['provider'] ?? null;

        if ($provider !== null && (! is_string($provider) || mb_strlen($provider) > 120)) {
            throw InvalidConfigurationException::forKey("{$path}.provider", 'must be a string of at most 120 characters.');
        }

        $purpose = $entry['purpose'] ?? null;

        if ($purpose !== null && ! is_string($purpose) && ! self::isLocaleMap($purpose)) {
            throw InvalidConfigurationException::forKey("{$path}.purpose", 'must be a string (lang key or text) or a non-empty [locale => text] array.');
        }

        $lifetime = $entry['lifetime'] ?? null;

        if ($lifetime !== null && (! is_string($lifetime) || ($lifetime !== 'session' && preg_match(self::LIFETIME_PATTERN, $lifetime) !== 1))) {
            throw InvalidConfigurationException::forKey("{$path}.lifetime", 'must be "session" or an ISO 8601 duration such as P2Y, P90D or PT24H.');
        }

        $domain = $entry['domain'] ?? null;

        if ($domain !== null && ! is_string($domain)) {
            throw InvalidConfigurationException::forKey("{$path}.domain", 'must be null or a string.');
        }

        return $name;
    }

    private static function isLocaleMap(mixed $value): bool
    {
        if (! is_array($value) || $value === []) {
            return false;
        }

        foreach ($value as $locale => $text) {
            if (! is_string($locale) || ! is_string($text)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @return string|array<string, string>|null
     */
    private static function policyUrl(mixed $raw): string|array|null
    {
        if ($raw === null || is_string($raw)) {
            return $raw;
        }

        if (! is_array($raw) || $raw === []) {
            throw InvalidConfigurationException::forKey('policy_url', 'must be null, a string, or a non-empty [locale => url] array.');
        }

        $urls = [];
        foreach ($raw as $locale => $url) {
            if (! is_string($locale) || ! is_string($url)) {
                throw InvalidConfigurationException::forKey('policy_url', 'must map string locales to string URLs.');
            }

            $urls[$locale] = $url;
        }

        return $urls;
    }

    /**
     * @param  array<array-key, mixed>  $google
     * @param  list<string>  $known
     * @param  list<string>  $optional
     * @return list<array{id: string, category: string}>
     */
    private static function googleTags(array $google, array $known, array $optional): array
    {
        $raw = $google['tags'] ?? null;

        if (! is_array($raw)) {
            throw InvalidConfigurationException::forKey('google.tags', 'must be an array.');
        }

        $tags = [];
        foreach ($raw as $tag) {
            $id = is_array($tag) ? ($tag['id'] ?? null) : null;
            $category = is_array($tag) ? ($tag['category'] ?? null) : null;

            if (! is_string($id) || preg_match(self::TAG_PATTERN, $id) !== 1) {
                throw InvalidConfigurationException::forKey('google.tags', 'each tag needs an "id" like G-XXXX, AW-XXXX, GT-XXXX, DC-XXXX or UA-XXXX.');
            }

            if (! is_string($category) || ! in_array($category, $known, true)) {
                throw InvalidConfigurationException::forKey('google.tags', "tag \"{$id}\" refers to an unknown category.");
            }

            if (! in_array($category, $optional, true)) {
                throw InvalidConfigurationException::forKey('google.tags', "tag \"{$id}\" cannot use the required category \"{$category}\": gate it on an optional category.");
            }

            $tags[] = ['id' => $id, 'category' => $category];
        }

        return $tags;
    }

    /**
     * @param  array<array-key, mixed>  $google
     * @param  list<string>  $known
     * @return array<string, string>
     */
    private static function googleSignals(array $google, array $known): array
    {
        $raw = $google['signals'] ?? null;

        if (! is_array($raw)) {
            throw InvalidConfigurationException::forKey('google.signals', 'must be an array.');
        }

        $signals = [];
        foreach (self::SIGNALS as $signal) {
            $category = $raw[$signal] ?? null;

            if ($category === null) {
                throw InvalidConfigurationException::forKey('google.signals', "is missing the \"{$signal}\" signal.");
            }

            if (! is_string($category) || ! in_array($category, $known, true)) {
                throw InvalidConfigurationException::forKey("google.signals.{$signal}", 'must refer to an existing category.');
            }

            $signals[$signal] = $category;
        }

        if (count($raw) !== count(self::SIGNALS)) {
            throw InvalidConfigurationException::forKey('google.signals', 'must contain exactly: '.implode(', ', self::SIGNALS).'.');
        }

        return $signals;
    }

    /**
     * @param  array<array-key, mixed>  $parent
     * @return array<array-key, mixed>
     */
    private static function section(array $parent, string $path, ?string $key = null): array
    {
        $value = $parent[$key ?? $path] ?? null;

        if (! is_array($value)) {
            throw InvalidConfigurationException::forKey($path, 'must be an array.');
        }

        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $parent
     */
    private static function string(array $parent, string $path, string $key): string
    {
        $value = $parent[$key] ?? null;

        if (! is_string($value)) {
            throw InvalidConfigurationException::forKey($path, 'must be a string.');
        }

        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $parent
     */
    private static function nullableString(array $parent, string $path, string $key): ?string
    {
        $value = $parent[$key] ?? null;

        if ($value !== null && ! is_string($value)) {
            throw InvalidConfigurationException::forKey($path, 'must be null or a string.');
        }

        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $parent
     */
    private static function matching(array $parent, string $path, string $key, string $pattern): string
    {
        $value = $parent[$key] ?? null;

        if (! is_string($value) || preg_match($pattern, $value) !== 1) {
            throw InvalidConfigurationException::forKey($path, 'must match '.$pattern.'.');
        }

        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $parent
     */
    private static function integer(array $parent, string $path, string $key, int $min, int $max): int
    {
        $value = $parent[$key] ?? null;

        if (! is_int($value) || $value < $min || $value > $max) {
            throw InvalidConfigurationException::forKey($path, "must be an integer between {$min} and {$max}.");
        }

        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $parent
     */
    private static function boolean(array $parent, string $path, string $key): bool
    {
        $value = $parent[$key] ?? null;

        if (! is_bool($value)) {
            throw InvalidConfigurationException::forKey($path, 'must be a boolean.');
        }

        return $value;
    }

    /**
     * @param  array<array-key, mixed>  $parent
     * @return list<string>
     */
    private static function stringList(array $parent, string $path, string $key): array
    {
        $value = $parent[$key] ?? null;

        if (! is_array($value) || ! array_is_list($value)) {
            throw InvalidConfigurationException::forKey($path, 'must be a list of strings.');
        }

        foreach ($value as $item) {
            if (! is_string($item)) {
                throw InvalidConfigurationException::forKey($path, 'must be a list of strings.');
            }
        }

        /** @var list<string> $value */
        return $value;
    }
}
