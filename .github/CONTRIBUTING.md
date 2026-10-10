# Contributing to laravel-consent

Thanks for considering a contribution. This document outlines the workflow.

## Development setup

```bash
git clone https://github.com/NETipar/laravel-consent.git
cd laravel-consent
composer install
pnpm install
```

## Running checks locally

```bash
# PHP
composer test            # Full validation: analyse + lint:check + test:types + test:unit
composer test:unit       # Pest (parallel)
composer test:types      # Pest type coverage (min 100%)
composer test:coverage   # Pest + coverage
composer analyse         # PHPStan / Larastan
composer lint            # Pint (auto-fix)
composer lint:check      # Pint (check only)

# Workbench (Testbench sandbox app)
composer build           # Build the workbench app
composer serve           # Serve the workbench app locally

# Frontend
pnpm test                # Vitest (frontend specs)
pnpm typecheck           # tsc --noEmit on every package
pnpm -r run build        # Build all 4 npm packages
```

## Code style

- **PHP**: Laravel Pint (`composer lint`). All files declare
  `declare(strict_types=1);` — keep it on every new file.
- **TypeScript**: `tsc --noEmit` must pass on the workspace root. Public
  API additions need both an export from the package's `src/index.ts`
  and a re-export from `packages/{alpine,vue3}/src/index.ts` if it
  belongs in those wrappers.
- All PHP public APIs must have type-safe signatures. Avoid `mixed`
  except at framework boundaries (`config()`, `auth()`).

## Pull request process

1. Fork the repository and create a feature branch from `main`.
2. **Add tests** for the change. New features without test coverage are
   rejected.
3. Update `CHANGELOG.md` under "Unreleased" with a brief description in
   the existing prose-rich style — prefer "why" over "what".
4. Run the local check suite (`composer test` and `pnpm test`).
5. Open a PR. Fill out the PR template completely.
6. The CI pipeline must be green: Pint, PHPStan, Pest matrix (all PHP × Laravel
   combinations), TypeScript typecheck, Vitest, audit (composer + pnpm).

## Reporting bugs

Open an issue using the **Bug report** template. Include:

- Laravel version + PHP version
- Frontend framework (Vue 3 / Alpine / Livewire / none) + version
- A minimal reproduction
- Expected vs actual behaviour

## Security issues

See [SECURITY.md](SECURITY.md). **Do not** report security issues
publicly — use the GitHub Private Vulnerability Reporting flow.

## Releases

The maintainer team handles tagging and publishing. Contributors do not
need to bump versions manually. Releases follow [Semantic
Versioning](https://semver.org/) — while in `0.x`, minor releases (`0.x.0`)
may contain breaking changes; patch releases (`0.x.y`) are bug-fix only.

The release flow is automated:

1. CHANGELOG `## Unreleased` → `## v0.X.Y - YYYY-MM-DD`.
2. `bump-version.sh` updates the 4 npm `package.json` files.
3. A `Release v0.X.Y` commit is pushed to `main`.
4. `gh release create` tags + creates the GitHub Release with the
   CHANGELOG entry as release notes.
5. CI's "Publish npm packages" workflow auto-publishes to npm on the
   `release.published` event.
6. Packagist auto-indexes the new tag via webhook.

## Branch protection (main)

The `main` branch is protected:
- Required status checks: pint, phpstan, audit, js-typecheck, tests (all matrix cells)
- Pull requests require 1 approving review
- Linear history; no force-push
