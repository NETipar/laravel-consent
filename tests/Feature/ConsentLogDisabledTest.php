<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schema;
use NETipar\Consent\Exceptions\LogDisabledException;
use NETipar\Consent\Facades\Consent;

it('does not register the log route', function (): void {
    $this->postJson('/consent/log', [])->assertNotFound();
});

it('throws from history() while the log is disabled', function (): void {
    Consent::history('0b2f5d4e-8f55-4b1f-a8c4-2f5f8f0a6c11');
})->throws(LogDisabledException::class);

it('has no log block in the client config', function (): void {
    expect(Consent::clientConfig()['log'])->toBeNull();
});

it('does not load the migration', function (): void {
    $this->artisan('migrate')->assertSuccessful();

    expect(Schema::hasTable('consent_logs'))->toBeFalse();
});
