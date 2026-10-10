<?php

declare(strict_types=1);

use NETipar\Consent\CookieTable\CookieEntry;

it('matches a trailing wildcard as a prefix, mirroring the JS purge rule', function (): void {
    $entry = CookieEntry::fromConfig('_ga_*');

    expect($entry->matches('_ga_ABC'))->toBeTrue()
        ->and($entry->matches('_ga_'))->toBeTrue()
        ->and($entry->matches('_ga'))->toBeFalse()
        ->and($entry->matches('x_ga_ABC'))->toBeFalse();
});

it('matches a plain name exactly', function (): void {
    $entry = CookieEntry::fromConfig(['name' => '_ga']);

    expect($entry->matches('_ga'))->toBeTrue()
        ->and($entry->matches('_ga_ABC'))->toBeFalse()
        ->and($entry->matches('_gaa'))->toBeFalse();
});

it('lists rich entries only', function (): void {
    expect(CookieEntry::fromConfig('_ga')->listed)->toBeFalse()
        ->and(CookieEntry::fromConfig(['name' => '_ga'])->listed)->toBeTrue();
});
