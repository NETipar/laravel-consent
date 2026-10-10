<?php

declare(strict_types=1);

namespace NETipar\Consent\CookieTable;

use Carbon\CarbonInterval;
use Illuminate\Support\Facades\Lang;
use NETipar\Consent\Category;

/**
 * Builds the locale-resolved cookie table (D27) from the configured categories.
 *
 * Every category is included, in config order; a category without listed
 * (rich) cookies has `cookies => []` so the consumer can still render its heading.
 */
final class CookieTableBuilder
{
    /**
     * @param  list<Category>  $categories
     */
    public function __construct(private readonly array $categories) {}

    /**
     * @return list<array{key: string, label: string, description: string, required: bool, cookies: list<array{name: string, provider: ?string, purpose: ?string, lifetime: ?string, domain: ?string}>}>
     */
    public function build(string $locale, string $fallbackLocale): array
    {
        return array_map(fn (Category $category): array => [
            'key' => $category->key,
            'label' => $category->label(),
            'description' => $category->description(),
            'required' => $category->required,
            'cookies' => array_map(fn (CookieEntry $entry): array => [
                'name' => $entry->name,
                'provider' => $entry->provider,
                'purpose' => $this->purpose($entry->purpose, $locale, $fallbackLocale),
                'lifetime' => $this->lifetime($entry->lifetime, $locale),
                'domain' => $entry->domain,
            ], $category->listedCookies()),
        ], $this->categories);
    }

    /**
     * @param  string|array<string, string>|null  $purpose
     */
    private function purpose(string|array|null $purpose, string $locale, string $fallbackLocale): ?string
    {
        if (is_array($purpose)) {
            return $purpose[$locale] ?? $purpose[$fallbackLocale] ?? ($purpose === [] ? null : reset($purpose));
        }

        if ($purpose === null) {
            return null;
        }

        if (Lang::has($purpose, $locale)) {
            $line = trans($purpose, [], $locale);

            return is_string($line) ? $line : $purpose;
        }

        return $purpose;
    }

    private function lifetime(?string $lifetime, string $locale): ?string
    {
        if ($lifetime === null) {
            return null;
        }

        if ($lifetime === 'session') {
            $line = trans('consent::consent.cookies.session', [], $locale);

            return is_string($line) ? $line : $lifetime;
        }

        // Carbon folds days into weeks ("12 weeks 6 days" for P90D); skipping weeks keeps the units as written.
        // Only an ISO duration that itself uses weeks (P2W) renders them.
        $interval = CarbonInterval::make($lifetime);

        // Older Carbon types locale() as `static|string` (getter/setter), so guard before formatting.
        $localized = $interval?->locale($locale);

        if (! $localized instanceof CarbonInterval) {
            return null;
        }

        return $localized->forHumans([
            'parts' => 2,
            'short' => false,
            'skip' => str_contains($lifetime, 'W') ? [] : ['weeks'],
        ]);
    }
}
