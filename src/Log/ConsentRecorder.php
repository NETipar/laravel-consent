<?php

declare(strict_types=1);

namespace NETipar\Consent\Log;

use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use NETipar\Consent\Config\ConsentConfig;
use NETipar\Consent\Models\ConsentLog;

final class ConsentRecorder
{
    private const int USER_ID_LENGTH = 64;

    public function __construct(private readonly ConsentConfig $config) {}

    /**
     * Idempotent per `event_id`: replaying an event returns the stored row untouched.
     *
     * @param  array<string, mixed>  $validated
     */
    public function record(array $validated, Request $request): ConsentLog
    {
        $eventId = Str::lower(Arr::string($validated, 'event_id'));

        return ConsentLog::query()->createOrFirst(
            ['event_id' => $eventId],
            [
                'consent_id' => Str::lower(Arr::string($validated, 'consent_id')),
                'action' => $validated['action'],
                'granted' => $this->config->normaliseGranted($validated['granted']),
                'version' => $validated['version'],
                'url' => $this->pathname($validated['url'] ?? null),
                'ip_hash' => $this->config->logStoreIp ? IpHasher::hash($request->ip()) : null,
                'user_agent' => $this->config->logStoreUserAgent ? Str::limit(mb_scrub((string) $request->userAgent(), 'UTF-8'), $this->config->logUserAgentMaxLength, '') : null,
                'user_id' => $this->userId($request),
                'created_at' => now(),
            ],
        );
    }

    /**
     * Only the path is proof-relevant; query strings and fragments may carry personal data.
     */
    private function pathname(mixed $url): ?string
    {
        if (! is_string($url)) {
            return null;
        }

        return parse_url($url, PHP_URL_PATH) ?: '/';
    }

    private function userId(Request $request): ?string
    {
        if (! $this->config->logStoreUserId) {
            return null;
        }

        $identifier = $request->user()?->getAuthIdentifier();

        if (! is_scalar($identifier)) {
            return null;
        }

        $identifier = (string) $identifier;

        // The column is string(64): a longer custom identifier is not stored rather than failing the request.
        return mb_strlen($identifier) <= self::USER_ID_LENGTH ? $identifier : null;
    }
}
