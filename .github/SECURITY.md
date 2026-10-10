# Security Policy

## Supported Versions

We provide security patches for the latest minor release line. Older lines
receive fixes only for Critical / High vulnerabilities at our discretion.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅ Yes             |
| < 1.0   | ❌ No              |

## Reporting a Vulnerability

If you discover a security vulnerability in `netipar/laravel-consent`, please
report it privately. **Do not open a public GitHub issue.**

Two channels:

1. **GitHub Private Vulnerability Reporting** (preferred): use the "Report a
   vulnerability" button at <https://github.com/NETipar/laravel-consent/security/advisories/new>.
2. **Email**: send a description to `dev@netipar.hu` with:
   - A clear description of the issue and its impact
   - Steps to reproduce
   - The affected version(s)
   - Any proof-of-concept code (if applicable)

We will acknowledge your report within 72 hours and provide an estimated
timeline for a fix. Once the issue is resolved, we publish a GitHub
Security Advisory crediting the reporter (unless you request otherwise).

## Disclosure Policy

We follow coordinated disclosure: we publish the advisory only after a
patched release is available on Packagist and npm.

## Hardening Surface

The package treats these as security-relevant boundaries:

- **Cookie parsing** — cookie values are parsed defensively from the raw
  `Cookie` header and never trusted beyond the known category keys.
- **Config JSON** — the client config emitted by `@consentConfig` is
  HEX-escaped (`JSON_HEX_TAG | JSON_HEX_AMP`), so it cannot break out of
  its `<script type="application/json">` element.
- **No inline script** — no inline executable script is emitted, so the
  package needs no CSP nonce.

If you believe one of these surfaces is bypassable, that's a security
issue — report privately as above.
