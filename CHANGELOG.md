# Changelog

All notable changes to `netipar/laravel-consent` will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). See [UPGRADE.md](UPGRADE.md) for migration notes.

## Unreleased

### Added

- Versioned consent cookie contract: `__cookie_consent` (comma-separated granted categories, compatible with `netipar/laravel-office-leads`) plus `__cookie_consent_v`; a decision is valid only for the current config `version`, and the server reads the raw `Cookie` header.
- Validated, typed `config/consent.php` (`ConsentConfig`) with categories, cookie attributes, `CONSENT_LIFETIME_DAYS`, `policy_url` as a string, a `[locale => url]` map or a route name.
- Server-side API: the `Consent` facade (`allows()`, `granted()`, `hasDecision()`, `decision()`, `categories()`, `policyUrl()`, `texts()`, `clientConfig()`), the `@consent` / `@unlessconsent` Blade conditionals and the `@consentConfig` directive.
- Unstyled `<x-consent::banner>` Blade component with default and `settings` slots, `title` / `description` / `policy-url` / `policy-label` attributes and the shared accessibility contract.
- `@netipar/consent-core`: framework-free JS core (`createConsent`, `readConsentConfig`, `activateGatedScripts`, events `consent:change` and `consent:log-failed`).
- `@netipar/consent-alpine`: `registerConsent()` with the `consent` Alpine store and the `consentBanner` data component, Livewire navigation aware.
- `@netipar/consent-vue3`: `createConsentPlugin()`, `useConsent()` and the renderless `ConsentBanner` component.
- Gated third-party scripts: `<script type="text/plain" data-consent="…">` with `src`, module type, several categories and CSP nonce support.
- Google Consent Mode v2 Basic: `google.tags`, `google.signals`, `ads_data_redaction` and `url_passthrough`; tags load only after consent, later grants send `consent update` and a late `config`.
- Complete withdrawal: per-category `cookies` lists (exact names and `_ga_*` style prefixes) deleted on host and parent domains on every revoking transition and on a stale version, plus `reload_on_revoke`.
- Translatable UI texts in `de`, `en`, `es`, `fr` and `hu`, resolved per request into `clientConfig()['texts']` so Blade, Alpine and Vue render the same strings; publishable via `consent-lang`.
- Optional consent log (`log.*`, `CONSENT_LOG_ENABLED`): publishable migration (`consent-migrations`), `POST /consent/log` with `web` middleware, throttling and `event_id` idempotency, HMAC-hashed truncated IP, `Consent::history()` / `Consent::consentId()` and a prunable `ConsentLog` model driven by `log.retention_days`.
- Cookie table: rich `cookies` entries (provider, translatable purpose, ISO 8601 lifetime), `Consent::cookieTable()`, `<x-consent::cookie-table>` and the Vue `ConsentCookieTable` component.
- Bilingual documentation (`docs/en`, `docs/hu`), a cookbook in `examples/`, an upgrade guide from `netipar/cookie-consent` 1.x and the bundled Laravel Boost skill `consent-development`.
