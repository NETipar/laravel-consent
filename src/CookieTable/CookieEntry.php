<?php

declare(strict_types=1);

namespace NETipar\Consent\CookieTable;

use Illuminate\Support\Str;

/**
 * One `cookies` entry of a category: a plain string (purge-only) or a rich array (listed in the cookie table).
 *
 * The shape is validated by `ConsentConfig`; `fromConfig()` only normalises a validated entry.
 */
final readonly class CookieEntry
{
    /**
     * @param  string  $name  Cookie name, or a prefix pattern ending in a single `*`.
     * @param  bool  $listed  True for rich entries: only those appear in the cookie table.
     * @param  string|array<string, string>|null  $purpose  Lang key, literal text or a [locale => text] map.
     * @param  string|null  $lifetime  `session` or an ISO 8601 duration such as `P2Y`.
     */
    public function __construct(
        public string $name,
        public bool $listed,
        public ?string $provider = null,
        public string|array|null $purpose = null,
        public ?string $lifetime = null,
        public ?string $domain = null,
    ) {}

    /**
     * @param  string|array<array-key, mixed>  $entry
     */
    public static function fromConfig(string|array $entry): self
    {
        if (is_string($entry)) {
            return new self($entry, false);
        }

        $purpose = $entry['purpose'] ?? null;

        return new self(
            name: self::text($entry['name'] ?? null) ?? '',
            listed: true,
            provider: self::text($entry['provider'] ?? null),
            purpose: is_array($purpose) ? self::localeMap($purpose) : self::text($purpose),
            lifetime: self::text($entry['lifetime'] ?? null),
            domain: self::text($entry['domain'] ?? null),
        );
    }

    /**
     * Whether a browser cookie falls under this entry: exact name, or prefix when the
     * name ends in `*`. Mirrors the JS purge rule (`matches()` in `purge.ts`).
     */
    public function matches(string $cookieName): bool
    {
        if (Str::endsWith($this->name, '*')) {
            return Str::startsWith($cookieName, substr($this->name, 0, -1));
        }

        return $cookieName === $this->name;
    }

    /**
     * @param  array<array-key, mixed>  $map
     * @return array<string, string>
     */
    private static function localeMap(array $map): array
    {
        $texts = [];

        foreach ($map as $locale => $text) {
            if (is_string($text)) {
                $texts[(string) $locale] = $text;
            }
        }

        return $texts;
    }

    private static function text(mixed $value): ?string
    {
        return is_string($value) ? $value : null;
    }
}
