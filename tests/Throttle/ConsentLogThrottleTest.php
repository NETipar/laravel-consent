<?php

declare(strict_types=1);

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Str;

it('rate limits the log endpoint per IP', function (): void {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $payload = fn (): array => [
        'event_id' => (string) Str::uuid(),
        'consent_id' => (string) Str::uuid(),
        'action' => 'accept_all',
        'granted' => ['analytics'],
        'version' => '1',
    ];

    $this->postJson('/consent/log', $payload())->assertNoContent();
    $this->postJson('/consent/log', $payload())->assertNoContent();
    $this->postJson('/consent/log', $payload())->assertTooManyRequests();
});
