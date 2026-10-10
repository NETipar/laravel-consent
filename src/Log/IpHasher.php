<?php

declare(strict_types=1);

namespace NETipar\Consent\Log;

/**
 * Keyed hash of a truncated client address: /24 for IPv4, /48 for IPv6. The raw
 * address is never stored, and records from one network still correlate.
 */
final class IpHasher
{
    public static function hash(?string $ip): ?string
    {
        if ($ip === null || filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return null;
        }

        $packed = inet_pton($ip);

        if ($packed === false) {
            return null;
        }

        // IPv4-mapped IPv6 (::ffff:a.b.c.d) is the same host as a.b.c.d.
        if (strlen($packed) === 16 && str_starts_with($packed, str_repeat("\0", 10)."\xff\xff")) {
            $packed = substr($packed, 12);
        }

        $truncated = strlen($packed) === 4
            ? substr($packed, 0, 3)."\0"
            : substr($packed, 0, 6).str_repeat("\0", 10);

        return hash_hmac('sha256', $truncated, self::key());
    }

    private static function key(): string
    {
        $key = config('app.key');
        $key = is_string($key) ? $key : '';

        if (str_starts_with($key, 'base64:')) {
            $decoded = base64_decode(substr($key, 7), true);

            return $decoded === false ? $key : $decoded;
        }

        return $key;
    }
}
