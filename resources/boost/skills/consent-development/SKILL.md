---
name: consent-development
description: >
  Integrate cookie consent into a Laravel application with the
  netipar/laravel-consent package: categories and the versioned consent cookie,
  the Consent facade and @consent directive, the unstyled Blade banner with the
  Alpine/Livewire adapter or the Vue 3 adapter, gated third-party scripts,
  Google Consent Mode v2, complete withdrawal, the optional consent log and the
  cookie table.
license: MIT
metadata:
  author: NETipar
---

# Consent — Laravel integration

Use this skill when a Laravel application needs GDPR-style cookie consent:
opt-in categories, a banner the application styles itself, server-side checks,
gated third-party scripts or Google Consent Mode v2.

## Primary Goal

Apply the `netipar/laravel-consent` public API in the smallest correct way:
categories and their cookies in `config/consent.php`, one banner, one adapter,
every optional script behind a category. The package ships no CSS; never
re-implement what it already provides (cookie handling, texts, purge).

## Workflow

### 1. Install

```bash
composer require netipar/laravel-consent
php artisan vendor:publish --tag=consent-config
npm install @netipar/consent-core @netipar/consent-alpine   # Blade/Livewire
npm install @netipar/consent-core @netipar/consent-vue3     # Inertia/Vue 3
```

### 2. Configure categories

In `config/consent.php`: set `version`, keep or edit `categories`, and list the
cookies each optional category sets so withdrawal can delete them:

```php
'analytics' => [
    'required' => false,
    'cookies' => ['_ga', '_ga_*', '_gid'],
],
```

A rich entry (`['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => '…', 'lifetime' => 'P2Y']`)
is purged **and** shown in the cookie table. A block defined in the published
config (`cookie`, `categories`, `log`, `google`) replaces the package default
entirely, so keep it complete.

### 3. Place the directive and the component

```blade
<head>@consentConfig</head>
<body>… <x-consent::banner class="…" /></body>
```

Customise with the default slot (keep `id="consent-title"` and
`id="consent-description"`) and the `settings` slot (keep
`id="consent-settings-title"`); inside them call `acceptAll()`, `rejectAll()`,
`openSettings()`, `closeSettings()`, `save()` and bind checkboxes with
`x-model="selection['<key>']"`.

### 4. Register the adapter

Alpine/Livewire, before Alpine starts:

```js
import { registerConsent } from '@netipar/consent-alpine';
import { readConsentConfig } from '@netipar/consent-core';

registerConsent(Alpine, readConsentConfig());
```

Vue: share `Consent::clientConfig()` as the Inertia prop `consent`, then
`app.use(createConsentPlugin(props.initialPage.props.consent))`. Slot props of
`<ConsentBanner>` are raw refs: use `promptOpen.value`, `settingsOpen.value`.
Add a reopen control: `$store.consent.openSettings($el)` (mark it `data-consent-focus-return`) or
`useConsent().openSettings()`.

### 5. Gate scripts and server output

```html
<script type="text/plain" data-consent="marketing" src="https://example.com/x.js"></script>
```

```blade
@consent('marketing') … @else … @endconsent
```

```php
Consent::allows('analytics');
```

For Google tags configure `google.tags` (`['id' => 'G-…', 'category' => 'analytics']`)
and remove any hand-written `gtag.js` snippet: the package loads it after
consent (Consent Mode v2 Basic).

### 6. Optional: consent log and cookie table

```dotenv
CONSENT_LOG_ENABLED=true
```

```bash
php artisan migrate
```

```php
Schedule::command('model:prune', ['--model' => [\NETipar\Consent\Models\ConsentLog::class]])->daily();
```

Render the declared cookies on the policy page with `<x-consent::cookie-table />`
(Vue: `Consent::cookieTable()` as a prop for `<ConsentCookieTable>`).

### 7. Test

```php
$this->withHeader('Cookie', '__cookie_consent=necessary%2Cmarketing; __cookie_consent_v=1')
    ->get('/')
    ->assertSee('…');
```

The version must equal `consent.version`. Config changes in tests need a fresh
manager (the `ConsentManager` singleton caches its config).

## References

### Facade `NETipar\Consent\Facades\Consent`

| Method | Returns |
|---|---|
| `allows(string $category, ?Request $request = null)` | `bool`; `false` without a valid decision, `true` for required categories; throws `UnknownCategoryException` for an unknown key |
| `granted()` | `list<string>`, required keys always included |
| `hasDecision()` / `decision()` | `bool` / `ConsentDecision { granted, version }` |
| `categories()` | `list<Category>` (`key`, `required`, `label()`, `description()`) |
| `policyUrl()` / `texts()` | resolved policy URL / banner strings for the current locale |
| `clientConfig()` | the locale-resolved array printed by `@consentConfig` — never cache it across locales |
| `cookieTable()` | categories with their rich cookies, translated |
| `consentId()` / `history($consentId)` | consent log lookups; `history()` throws `LogDisabledException` when the log is off |

### Directives and components

- `@consent('x') … @else … @endconsent`, `@unlessconsent('x')`, `@elseconsent('x')` (argument required — **never a bare `@elseconsent`**; keep whitespace before `@else` / `@endconsent`).
- `@consentConfig` — prints the JSON script the JS core reads.
- `<x-consent::banner>` — attributes `title`, `description`, `:policy-url`, `policy-label`; slots: default, `settings`.
- `<x-consent::cookie-table>` — props `:categories`, `:only` (bound list), `headings`, `:show-empty`; optional slot.

### Config keys

`version`, `cookie.{name,version_name,lifetime_days,domain,same_site,secure}`,
`categories.<key>.{required,cookies}`, `reload_on_revoke`, `policy_url`,
`google.{tags,signals,ads_data_redaction,url_passthrough}`,
`log.{enabled,table,connection,retention_days,route,id_cookie_name,store_ip,store_user_agent,user_agent_max_length,store_user_id}`.
Env: `CONSENT_COOKIE`, `CONSENT_COOKIE_VERSION`, `CONSENT_LIFETIME_DAYS`,
`CONSENT_LOG_ENABLED`, `CONSENT_LOG_RETENTION_DAYS`, `CONSENT_COOKIE_ID`.

### Publish tags

`consent-config`, `consent-views`, `consent-lang`, `consent-migrations`.

### JavaScript

- `@netipar/consent-core`: `createConsent`, `readConsentConfig`, `activateGatedScripts`, `CHANGE_EVENT` (`consent:change`), `LOG_FAILED_EVENT` (`consent:log-failed`).
- `@netipar/consent-alpine`: `registerConsent(Alpine, config)` → `Alpine.store('consent')` (`granted`, `decided`, `promptOpen`, `settingsOpen`, `texts`, `categories`, `has()`, `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()`, `openSettings()`, `closeSettings()`, `dismissPrompt()`) and `Alpine.data('consentBanner')`.
- `@netipar/consent-vue3`: `createConsentPlugin`, `useConsent`, `ConsentBanner`, `ConsentCookieTable`.

### Gated script attributes

`data-consent="a b"` (space or comma separated, all must be granted),
`data-consent-type="module"`, optional `nonce`, `src`, `async`, `defer`.

## Examples

Reject must be as prominent as accept (same element and variant):

```blade
<x-consent::banner class="fixed bottom-4 right-4 rounded-xl bg-white p-5 shadow-xl">
    <h2 id="consent-title">We use cookies</h2>
    <p id="consent-description">Analytics and marketing only with your consent.</p>
    <button type="button" x-on:click="acceptAll()" class="btn">Accept all</button>
    <button type="button" x-on:click="rejectAll()" class="btn">Reject all</button>
    <button type="button" x-on:click="openSettings($el)" class="btn-outline">Settings</button>
</x-consent::banner>
```

Bind the existing office-leads attribution to the same decision:

```php
OfficeLeads::resolveAttributionConsentUsing(fn ($request) => Consent::allows('marketing', $request));
```

## Anti-Patterns

- Hand-mirroring category labels or banner texts in JavaScript — use `Alpine.store('consent').texts` / the Vue `texts`, which the server already resolved per locale.
- Loading gtag outside the package wiring (a layout snippet, GTM on scroll): it runs before consent. Configure `google.tags`.
- Wrapping consent in `@env('production')`: the behaviour must be identical everywhere; keep `google.tags` empty locally instead.
- Reading `$_COOKIE` or `$request->cookie()` for the decision — `EncryptCookies` hides JS-written cookies; use `Consent::allows()`.
- Forgetting the `cookies` list for a category that sets cookies: withdrawal then leaves them behind.
- Caching `Consent::clientConfig()` or the cookie table across locales or requests.
- A bare `@elseconsent`, or `@else` / `@endconsent` glued to the previous token.
- Using `.value`-less slot props in Vue templates (`promptOpen` instead of `promptOpen.value`).
- Binding `has()` in Alpine expressions expecting reactivity — read `$store.consent.granted` there.
- Changing `log.table` / `log.connection` after the migration ran, or enabling the log after `migrate` and expecting the table.
- Making "Reject all" a text link or a weaker button.
