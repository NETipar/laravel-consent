<?php

declare(strict_types=1);

return [
    'version' => '1',                       // bump → every visitor is re-prompted
    'cookie' => [
        'name' => env('CONSENT_COOKIE', '__cookie_consent'),
        'version_name' => env('CONSENT_COOKIE_VERSION', '__cookie_consent_v'),
        'lifetime_days' => (int) env('CONSENT_LIFETIME_DAYS', 365),
        'domain' => null,
        'same_site' => 'Lax',               // Lax|Strict|None
        'secure' => null,                   // null = auto (https), true, false
    ],
    'categories' => [                       // order = display order; keys [a-z0-9_-]+
        // 'cookies': what this category sets. Each entry is EITHER a plain string (name or prefix pattern
        // ending in `*` — purge-only, not listed in the cookie table) OR a rich array:
        //   ['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => 'consent::consent.cookies.ga' | 'literal' | ['hu' => '…', 'en' => '…'],
        //    'lifetime' => 'P2Y' /* ISO 8601 duration or 'session' */, 'domain' => '.example.com' /* optional */]
        // Purge uses `name` of every entry of a NON-required category on every transition that removes the category.
        // Required categories MAY list cookies (for the table) — they are never purged.
        'necessary' => ['required' => true, 'cookies' => []],
        'analytics' => ['required' => false, 'cookies' => []],
        'marketing' => ['required' => false, 'cookies' => []],
    ],
    'log' => [                              // proof of consent (GDPR Art. 7(1)); everything below is inert while enabled=false
        'enabled' => (bool) env('CONSENT_LOG_ENABLED', false),
        'table' => 'consent_logs',
        'connection' => null,               // null = default connection
        'retention_days' => (int) env('CONSENT_LOG_RETENTION_DAYS', 365), // pruned by `model:prune --model=NETipar\\Consent\\Models\\ConsentLog`; must be >= cookie.lifetime_days
        'route' => ['prefix' => 'consent', 'middleware' => ['web'], 'throttle' => 30 /* per minute per IP */],
        'id_cookie_name' => env('CONSENT_COOKIE_ID', '__cookie_consent_id'),
        'store_ip' => true,                 // HMAC(app.key) of the /24 (IPv4) or /48 (IPv6) truncated address
        'store_user_agent' => true,         // raw, truncated to `user_agent_max_length`
        'user_agent_max_length' => 255,     // int 1..255 — the `user_agent` column is string(255); do not raise it without widening the column first
        'store_user_id' => true,            // only when a user is authenticated
    ],
    'reload_on_revoke' => true,             // loaded third-party tags cannot be unloaded → full reload after a revoke that affected a loaded category
    'policy_url' => null,                   // string URL | [locale => URL] | route name (resolved per request)
    'google' => [
        'tags' => [],                       // [['id' => 'G-XXXX', 'category' => 'analytics'], ['id' => 'AW-XXXX', 'category' => 'marketing']]
        'signals' => [                      // Consent Mode v2 signal → category
            'analytics_storage' => 'analytics',
            'ad_storage' => 'marketing',
            'ad_user_data' => 'marketing',
            'ad_personalization' => 'marketing',
        ],
        'ads_data_redaction' => false,
        'url_passthrough' => false,
    ],
];
