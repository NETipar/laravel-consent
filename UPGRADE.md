# Upgrade Guide

Migration notes for breaking changes.

## From v0.2.x to v0.3.0

Nothing to do unless you switch Google Consent Mode to Advanced: without `google.mode` (or with `'basic'`) the package behaves as in v0.2.0, and a `google` block published before v0.3.0 keeps working. Clear the compiled views once after updating (`php artisan view:clear`, or your usual `view:cache` in the deploy), because `@consentConfig` now compiles differently.

To switch to Advanced (`'mode' => 'advanced'` in `config/consent.php`):

1. Update `@netipar/consent-core` (and `-alpine` / `-vue3`) to 0.3.0 together with the Composer package. An older JS core ignores the mode and the inline script, and would send a second `consent default` and load `gtag.js` a second time.
2. Move `@consentConfig` to the **top of `<head>`**, before every script that pushes to `dataLayer`. In an Inertia app add it to the root view (`resources/views/app.blade.php`) as well.
3. With a nonce-based CSP pass the nonce: `@consentConfig($nonce)`. An app that calls `Vite::useCspNonce()` needs no argument.
4. Remove any hand-written gtag.js or GTM snippet (and the GTM `<noscript>` iframe) from the layout.
5. In the GTM container give every non-Google tag (Meta Pixel, Hotjar, …) **Require additional consent** in its Consent Settings — the container now runs before the decision, and that gating is the container owner's job.
6. Turn on `ads_data_redaction`, and say in your cookie policy that Google receives requests before consent.

## From netipar/cookie-consent 1.x

`netipar/laravel-consent` is a new package, not a 2.0 of `netipar/cookie-consent`: the namespace, the config, the markup and the behaviour all change. The 1.x line stays untouched. Plan for roughly an hour.

### What changes in behaviour

- **Opt-in instead of pre-checked.** 1.x pre-checked every category and had no "Reject all". Now nothing optional is granted until the visitor decides, and rejecting is as prominent as accepting.
- **`check_cookie_consent()` returned `true` when there was no cookie** (an opt-out default). `Consent::allows()` returns `false` until a valid decision exists (opt-in). Review every call site: code that used to run for first-time visitors now waits for consent.
- **The package no longer injects HTML.** The 1.x middleware appended its view before `</body>` and read `$_COOKIE`. You now place `<x-consent::banner />` yourself, and the server reads the raw `Cookie` header.
- **The package ships no CSS and no public assets.** The look is yours.
- **Everyone is asked again once.** The value cookie format is compatible — the same name `__cookie_consent`, a comma-separated category list — but the new package also needs the version cookie `__cookie_consent_v`. Legacy visitors have no version cookie, so they have no valid decision; the JS core deletes the legacy value cookie on first sight — host-only, on the configured `cookie.domain` and on every parent domain, so a 1.x copy cannot survive next to the new `Domain` cookie, and a stale version cookie is deleted together with it (which also stops other readers such as `laravel-office-leads` from honouring it) — and shows the prompt. This is by design: the 1.x consent was given with pre-checked boxes.

### Steps

**1. Remove the old package first.** Both packages publish under the tags `consent-config` and `consent-lang`, so installing the new one next to the old one makes `vendor:publish --tag=consent-config` publish both.

```bash
composer remove netipar/cookie-consent
```

Then delete what the old package left behind:

| Remove | Where |
|---|---|
| Service provider | `bootstrap/providers.php` or `config/app.php`, if you registered it by hand |
| Middleware `Netipar\CookieConsent\CookieConsentMiddleware` | `bootstrap/app.php` or `app/Http/Kernel.php` |
| Config | `config/cookie-consent.php` |
| Published views | `resources/views/vendor/cookie-consent/` |
| Published assets | `public/vendor/cookie-consent/` (tracked in git? `git rm -r` it) |
| Published translations | `resources/lang/vendor/cookie-consent/` (or `lang/vendor/cookie-consent/`) |
| Asset imports | any `import` of the old `cookie-consent.js` / `_bubble.scss` from your bundle |

**2. Install the new package.**

```bash
composer require netipar/laravel-consent
php artisan vendor:publish --tag=consent-config
npm install @netipar/consent-core @netipar/consent-alpine   # or @netipar/consent-vue3
```

**3. Translate the config.**

| 1.x (`config/cookie-consent.php`) | `config/consent.php` |
|---|---|
| `enabled` / `COOKIE_CONSENT_ENABLED` | none — render `<x-consent::banner />` or not |
| `cookie_name` | `cookie.name` |
| `cookie_lifetime` | `cookie.lifetime_days` (env `CONSENT_LIFETIME_DAYS`) |
| `cookie_values` (`preferences`, `analytics`, `marketing`) | `categories`: add a required `necessary` category and list the optional ones; keep `preferences` only if you still use it. A category's cookies go in its `cookies` list |
| `more_info` | `policy_url` (URL, `[locale => url]` map, or route name) |
| `cookie_color`, `button_color` | your own CSS / Tailwind classes |
| `ignored_paths` | include the component only in the layouts where it belongs |

Set a `version` and bump it whenever the policy changes. If you set `cookie.domain` to share the decision across subdomains, set it from the start: change `cookie.domain` only together with a `version` bump, otherwise cookies written on the old scope can shadow the new ones. With `cookie.domain` set, a host-only copy of the value, version or id cookie is never honoured: the JS core expires it before reading (the visitor is asked once more, and a host-only consent id is replaced by a fresh one, so that visitor's log history starts a new id), and the server treats duplicate value cookies as "no decision".

**4. Wire the layout and the JavaScript** as in the [README quickstart](README.md#5-minute-quickstart-blade-and-livewire): `@consentConfig` in `<head>`, `<x-consent::banner />` before `</body>`, `registerConsent(Alpine, readConsentConfig())` before Alpine starts. Add a footer control that calls `$store.consent.openSettings($el)` so visitors can change their mind.

**5. Replace the helper calls.**

```php
// 1.x
if (check_cookie_consent('analytics')) { … }

// laravel-consent
use NETipar\Consent\Facades\Consent;

if (Consent::allows('analytics')) { … }
```

In Blade, `@consent('analytics') … @else … @endconsent` replaces the manual check. Move third-party scripts (analytics, ads, embeds) to [`type="text/plain" data-consent="…"`](README.md#gating-third-party-scripts), or let [`google.tags`](README.md#google-consent-mode-v2) load Google's tags after consent; remove any hand-written `gtag.js` snippet.

**6. Re-check what you integrated with.** If you use `netipar/laravel-office-leads`, nothing needs to change (same cookie and category); you may bind it explicitly, see [Interop](README.md#interop-with-laravel-office-leads). List your cookies per category (`cookies`) so a withdrawal deletes them, see [Complete withdrawal](README.md#complete-withdrawal).

**7. Deploy and verify.** Visit the site in a clean profile: the prompt shows, no Google request is made before "Accept all", and after "Reject all" no `_ga*` / `_gcl_*` cookie remains.
