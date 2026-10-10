<?php

declare(strict_types=1);

use NETipar\Consent\Log\IpHasher;
use NETipar\Consent\Tests\TestCase;

uses(TestCase::class);

it('hashes addresses of one IPv4 /24 identically', function (): void {
    expect(IpHasher::hash('1.2.3.4'))->toBe(IpHasher::hash('1.2.3.99'))
        ->and(IpHasher::hash('1.2.4.4'))->not->toBe(IpHasher::hash('1.2.3.4'));
});

it('hashes addresses of one IPv6 /48 identically', function (): void {
    expect(IpHasher::hash('2001:db8:abcd:1234::1'))->toBe(IpHasher::hash('2001:db8:abcd:ffff::9'))
        ->and(IpHasher::hash('2001:db8:abce:1234::1'))->not->toBe(IpHasher::hash('2001:db8:abcd:1234::1'));
});

it('treats an IPv4-mapped IPv6 address like the IPv4 address', function (): void {
    expect(IpHasher::hash('::ffff:1.2.3.4'))->toBe(IpHasher::hash('1.2.3.4'));
});

it('returns null for anything that is not an IP address', function (): void {
    expect(IpHasher::hash('garbage'))->toBeNull()
        ->and(IpHasher::hash(null))->toBeNull();
});

it('returns a 64 character hex digest that never contains the address', function (): void {
    $hash = IpHasher::hash('203.0.113.77');

    expect($hash)->toMatch('/^[0-9a-f]{64}$/')
        ->and($hash)->not->toContain('203')
        ->and($hash)->not->toContain('113');
});

it('depends on the application key', function (): void {
    $first = IpHasher::hash('1.2.3.4');
    config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);

    expect(IpHasher::hash('1.2.3.4'))->not->toBe($first);
});
