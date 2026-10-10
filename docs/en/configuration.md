# Configuration reference

> 🇭🇺 Magyar változat: [docs/hu/configuration.md](../hu/configuration.md)

Every key in `config/consent.php` is validated into a typed `ConsentConfig`
when the service provider boots — a wrong-typed or out-of-range value fails
fast with the offending key (`InvalidConfigurationException`). Publish the
config with:

```bash
php artisan vendor:publish --tag=consent-config
```

## Keys

### Version and cookies

| Key | Default | Notes |
|---|---|---|
| `version` | `'1'` | Non-empty string. Bump it (`'2026-10'`) and every visitor is asked again: the stored version no longer matches, so the old decision is ignored and the old value cookie is deleted by the JS core. |
| `cookie.name` | `__cookie_consent` | Value cookie. Env: `CONSENT_COOKIE`. Pattern `^[A-Za-z0-9_\-]+$`. |
| `cookie.version_name` | `__cookie_consent_v` | Version cookie. Env: `CONSENT_COOKIE_VERSION`. Same pattern. |
| `cookie.lifetime_days` | `365` | Integer `1..730`. Env: `CONSENT_LIFETIME_DAYS`. Becomes `Max-Age` of every cookie the package writes. |
| `cookie.domain` | `null` | `null` = host-only cookie, or a host name such as `example.com` / `.example.com` (letters, digits, hyphens and dots; an optional leading dot) to share the decision across subdomains. Anything else throws an `InvalidConfigurationException`. Change it only together with a `version` bump. |
| `cookie.same_site` | `Lax` | `Lax`, `Strict` or `None`. |
| `cookie.secure` | `null` | `null` = automatic (`Secure` when the page is served over `https:`), or `true` / `false`. |

### Categories

```php
'categories' => [
    'necessary' => ['required' => true, 'cookies' => []],
    'analytics' => ['required' => false, 'cookies' => []],
    'marketing' => ['required' => false, 'cookies' => []],
],
```

| Key | Default | Notes |
|---|---|---|
| `categories` | `necessary`, `analytics`, `marketing` | Non-empty map. The order is the display order. Keys match `^[a-z0-9_-]+$`; at least one category must have `required => true`. |
| `categories.<key>.required` | `false` | A required category is always granted, its checkbox is rendered `checked disabled`, and its cookies are never purged. |
| `categories.<key>.cookies` | `[]` | The cookies this category sets — see below. |

The category label and description are read from the lang files
(`consent::consent.categories.<key>.label` / `.description`). The package ships
text for `necessary`, `functional`, `analytics` and `marketing`. For any other
key the label falls back to the headlined key (`my_category` becomes
`My Category`) and the description is empty — add the strings in a published
lang file (see [Texts and languages](#texts-and-languages)).

#### Cookie entries

Each item of `cookies` is **either** a plain string **or** a rich array.

| Form | Example | Used for |
|---|---|---|
| Plain string | `'_ga'`, `'_ga_*'` | Purge only. A trailing `*` makes it a prefix pattern. Not listed in the cookie table. |
| Rich array | `['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => '…', 'lifetime' => 'P2Y']` | Purge **and** the cookie table (`Consent::cookieTable()`). |

Rich entry keys:

| Key | Required | Notes |
|---|---|---|
| `name` | yes | Cookie name or prefix pattern (`^[A-Za-z0-9_\-]+\*?$`). Unique within the category, counting plain and rich forms together. |
| `provider` | no | String, at most 120 characters. |
| `purpose` | no | A literal string, a lang key (`'cookies.ga'` or `'consent::consent.cookies.ga'` — used when the translation exists), or a `[locale => text]` map. With a map the current locale wins, then `app.fallback_locale`, then the first entry. |
| `lifetime` | no | `'session'`, or an ISO 8601 duration such as `P2Y`, `P90D`, `PT24H`. Rendered in the unit as written and localised by Carbon: `P90D` → "90 days" / "90 nap", `P13M` → "13 months", `P2W` → "2 weeks". `'session'` uses `consent::consent.cookies.session`. |
| `domain` | no | `null` or a string; shown next to the name in the table. |

```php
'analytics' => [
    'required' => false,
    'cookies' => [
        ['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => ['hu' => 'Látogatók megkülönböztetése', 'en' => 'Distinguishes visitors'], 'lifetime' => 'P2Y', 'domain' => '.example.com'],
        '_ga_*',   // purged on revocation, not listed
        '_gid',
    ],
],
```

Required categories may list cookies too (they appear in the table and are
never purged).

### Withdrawal and policy

| Key | Default | Notes |
|---|---|---|
| `reload_on_revoke` | `true` | Boolean. Loaded third-party tags cannot be unloaded, so after a revoke that affected a category something **was loaded for** (a gated script ran, a Google tag was configured), the page reloads once. See the README section "Complete withdrawal". |
| `policy_url` | `null` | `null`, a string, or a `[locale => url]` map. A string that names a registered route (`'cookie-policy'`) becomes `route('cookie-policy')`; any other string is used verbatim. A map picks `app()->getLocale()`, then `app.fallback_locale`, then `null`. Resolved per request. |

### Google Consent Mode v2 (Basic)

| Key | Default | Notes |
|---|---|---|
| `google.tags` | `[]` | List of `['id' => 'G-XXXX', 'category' => 'analytics']`. `id` matches `^(G\|AW\|GT\|DC\|UA)-[A-Z0-9\-]+$`; `category` must exist and must **not** be required. Empty list = Google is off and `clientConfig()['google']` is `null`. |
| `google.signals` | `analytics_storage → analytics`, `ad_storage`, `ad_user_data`, `ad_personalization → marketing` | Exactly these four keys; every value is an existing category. |
| `google.ads_data_redaction` | `false` | Boolean. Sends `gtag('set', 'ads_data_redaction', true)` before the loader. |
| `google.url_passthrough` | `false` | Boolean. Sends `gtag('set', 'url_passthrough', true)` before the loader. |

### Consent log

Everything under `log` is inert while `log.enabled` is `false`.

| Key | Default | Notes |
|---|---|---|
| `log.enabled` | `false` | Env: `CONSENT_LOG_ENABLED`. When `false` the route is not registered (404), the migration is not loaded, `clientConfig()['log']` is `null` and the JS core never POSTs or creates the id cookie. |
| `log.table` | `consent_logs` | Pattern `^[a-z_][a-z0-9_]{0,35}$` (at most 36 characters, so the generated index names fit MySQL's 64-character limit). Read when the migration runs and by the model — **do not change it after migrating**. |
| `log.connection` | `null` | `null` = default database connection. Like the table, it must not change after migrating. |
| `log.retention_days` | `365` | Integer `1..3650`, **at least** `cookie.lifetime_days` (the proof must outlive the consent it proves). Env: `CONSENT_LOG_RETENTION_DAYS`. Used by `ConsentLog::prunable()`. |
| `log.route.prefix` | `consent` | The endpoint is `/<prefix>/log`. Fixed at boot. |
| `log.route.middleware` | `['web']` | List of strings. `web` carries the session and CSRF protection the endpoint relies on. Fixed at boot. |
| `log.route.throttle` | `30` | Requests per minute per IP, integer `1..1000`. Fixed at boot. |
| `log.id_cookie_name` | `__cookie_consent_id` | The necessary cookie that holds the consent id. Env: `CONSENT_COOKIE_ID`. Cookie-name pattern. |
| `log.store_ip` | `true` | Store `ip_hash` (HMAC-SHA256 with the app key over the /24 IPv4 or /48 IPv6 prefix). `false` = `null`. |
| `log.store_user_agent` | `true` | Store the raw user agent, scrubbed to valid UTF-8 and then truncated to `user_agent_max_length`. `false` = `null`. |
| `log.user_agent_max_length` | `255` | **Optional.** Integer `1..255` (the column is `string(255)`; widen the column before raising the limit). An absent key means `255`; a present but invalid value throws. |
| `log.store_user_id` | `true` | Store `Auth::id()` as a string when a user is authenticated. An identifier longer than 64 characters is stored as `null` (the request still succeeds). |

## Merging and validation

The service provider uses `mergeConfigFrom`, which is **shallow**: it merges
only the top-level keys. As soon as your published `config/consent.php`
defines a top-level block — `cookie`, `categories`, `log`, `google` — that block
replaces the package default **entirely**, so it has to be complete, including
the nested `log.route` and `google.signals`. An incomplete block fails at boot
with the missing key in the message. (`log.user_agent_max_length` is the one
optional key.) Keep the published file as the single source and edit it in
place.

The consent log route, its middleware and its rate limit are registered once
at boot; after changing them, restart the application (and clear the config
cache). Table and connection are read by the migration and the model — pick them before the first `migrate` and leave them alone afterwards.

## Texts and languages

The package ships `de`, `en`, `es`, `fr` and `hu` with a formal register. All
banner copy comes from `lang/<locale>/consent.php`:

```php
'banner' => [
    'title', 'description', 'policy', 'accept_all', 'reject_all',
    'settings', 'settings_title', 'settings_intro', 'save', 'cancel',
],
'categories' => ['necessary' => ['label', 'description'], /* … */],
'cookies' => ['headings' => ['name', 'provider', 'purpose', 'lifetime'], 'session' => '…'],
```

Override per project:

```bash
php artisan vendor:publish --tag=consent-lang   # → lang/vendor/consent/{locale}/consent.php
```

Laravel merges a published file over the package lines, so the override file
may contain only the keys you change. The JS adapters render the same strings: the server
resolves them for the request locale and hands them over in `clientConfig()`.

## The client config

`Consent::clientConfig()` (printed by `@consentConfig`) is the JSON document
the JS core reads. It is built per request and resolved for the current locale.

```json
{
  "version": "2026-10",
  "cookie": {
    "name": "__cookie_consent",
    "versionName": "__cookie_consent_v",
    "lifetimeDays": 365,
    "domain": null,
    "sameSite": "Lax",
    "secure": null
  },
  "categories": [
    { "key": "necessary", "required": true, "label": "Necessary", "description": "…", "cookies": [] },
    { "key": "analytics", "required": false, "label": "Analytics", "description": "…", "cookies": ["_ga", "_ga_*", "_gid"] }
  ],
  "texts": {
    "title": "We use cookies",
    "description": "…",
    "policy": "Cookie policy",
    "acceptAll": "Accept all",
    "rejectAll": "Reject all",
    "settings": "Settings",
    "settingsTitle": "Cookie settings",
    "settingsIntro": "…",
    "save": "Save selection",
    "cancel": "Cancel"
  },
  "reloadOnRevoke": true,
  "log": { "endpoint": "/consent/log", "idCookieName": "__cookie_consent_id" },
  "policyUrl": "/cookie-policy",
  "google": {
    "tags": [{ "id": "G-XXXXXXX", "category": "analytics" }],
    "signals": {
      "analytics_storage": "analytics",
      "ad_storage": "marketing",
      "ad_user_data": "marketing",
      "ad_personalization": "marketing"
    },
    "adsDataRedaction": false,
    "urlPassthrough": false
  }
}
```

- `categories[].cookies` is the flat list of names and patterns (the purge
  input). The rich metadata lives in `Consent::cookieTable()`, not here.
- `log` is `null` when `log.enabled` is `false`; the endpoint is relative so it
  always matches the host the visitor is on. A custom `log.route.prefix`
  changes it.
- `google` is `null` when `google.tags` is empty.
- Never cache the document across locales or requests.

A known limitation: `texts` are resolved on the server per request and
snapshotted when the JS manager is created. A client-side-only locale switch
without a page render keeps the previous strings until the next full render or
re-initialisation.

## Environment variables

| Variable | Config key |
|---|---|
| `CONSENT_COOKIE` | `cookie.name` |
| `CONSENT_COOKIE_VERSION` | `cookie.version_name` |
| `CONSENT_LIFETIME_DAYS` | `cookie.lifetime_days` |
| `CONSENT_LOG_ENABLED` | `log.enabled` |
| `CONSENT_LOG_RETENTION_DAYS` | `log.retention_days` |
| `CONSENT_COOKIE_ID` | `log.id_cookie_name` |
