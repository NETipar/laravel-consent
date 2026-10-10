<?php

declare(strict_types=1);

namespace NETipar\Consent;

use Illuminate\Support\Str;
use NETipar\Consent\CookieTable\CookieEntry;

final readonly class Category
{
    /**
     * @param  list<CookieEntry>  $cookies  The cookies (or trailing-wildcard patterns) this category sets.
     */
    public function __construct(
        public string $key,
        public bool $required,
        public array $cookies = [],
    ) {}

    public function label(): string
    {
        return $this->translate('label') ?? Str::headline($this->key);
    }

    public function description(): string
    {
        return $this->translate('description') ?? '';
    }

    /**
     * Every cookie name or wildcard pattern, listed or not: the payload of `clientConfig()['categories'][].cookies`.
     *
     * @return list<string>
     */
    public function cookieNames(): array
    {
        return array_map(static fn (CookieEntry $entry): string => $entry->name, $this->cookies);
    }

    /**
     * Only the rich entries: what the cookie table shows.
     *
     * @return list<CookieEntry>
     */
    public function listedCookies(): array
    {
        return array_values(array_filter($this->cookies, static fn (CookieEntry $entry): bool => $entry->listed));
    }

    private function translate(string $field): ?string
    {
        $key = "consent::consent.categories.{$this->key}.{$field}";
        $line = trans($key);

        return is_string($line) && $line !== $key ? $line : null;
    }
}
