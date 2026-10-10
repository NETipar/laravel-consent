<?php

declare(strict_types=1);

namespace NETipar\Consent\Cookies;

use Illuminate\Http\Request;
use NETipar\Consent\Config\ConsentConfig;
use NETipar\Consent\ConsentDecision;

/**
 * Reads the consent cookies from the raw `Cookie` header only. The encrypted
 * cookie bag is deliberately ignored: EncryptCookies nulls cookies written by JS.
 */
final class ConsentCookieReader
{
    public function __construct(private readonly ConsentConfig $config) {}

    public function read(Request $request): ConsentDecision
    {
        $pairs = $this->pairs($request);
        $cookies = $this->firstByName($pairs);

        // With a shared `cookie.domain` the package never writes a host-only cookie, so a second value
        // cookie is a legacy/foreign host-only copy shadowing the real one. Which is newer cannot be
        // told from the header: treat it as no decision until the JS core has cleaned it up.
        if ($this->config->domain !== null && $this->occurrences($pairs, $this->config->cookieName) > 1) {
            return ConsentDecision::none();
        }

        $value = $cookies[$this->config->cookieName] ?? null;

        if ($value === null) {
            return ConsentDecision::none();
        }

        $known = $this->config->keys();
        $granted = [];
        foreach (explode(',', $value) as $part) {
            $part = trim($part);

            if ($part !== '' && in_array($part, $known, true) && ! in_array($part, $granted, true)) {
                $granted[] = $part;
            }
        }

        return new ConsentDecision($granted, $cookies[$this->config->versionCookieName] ?? null);
    }

    /**
     * A single cookie value from the raw header, or null when absent.
     */
    public function readRaw(Request $request, string $name): ?string
    {
        return $this->firstByName($this->pairs($request))[$name] ?? null;
    }

    /**
     * @param  list<array{string, string}>  $pairs
     * @return array<string, string>
     */
    private function firstByName(array $pairs): array
    {
        $cookies = [];

        foreach ($pairs as [$name, $value]) {
            if (! array_key_exists($name, $cookies)) {
                $cookies[$name] = $value;
            }
        }

        return $cookies;
    }

    /**
     * @param  list<array{string, string}>  $pairs
     */
    private function occurrences(array $pairs, string $name): int
    {
        return count(array_filter($pairs, static fn (array $pair): bool => $pair[0] === $name));
    }

    /**
     * Every well-formed `name=value` pair of the raw header, in the order the browser sent them.
     *
     * @return list<array{string, string}>
     */
    private function pairs(Request $request): array
    {
        $header = implode(';', array_filter($request->headers->all('cookie'), is_string(...)));
        $pairs = [];

        foreach (explode(';', $header) as $pair) {
            if (! str_contains($pair, '=')) {
                continue;
            }

            [$name, $value] = explode('=', $pair, 2);
            $name = trim($name);

            if ($name !== '') {
                $pairs[] = [$name, urldecode(trim($value, " \t\""))];
            }
        }

        return $pairs;
    }
}
