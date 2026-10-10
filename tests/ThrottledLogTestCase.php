<?php

declare(strict_types=1);

namespace NETipar\Consent\Tests;

class ThrottledLogTestCase extends LogTestCase
{
    protected function logOverrides(): array
    {
        return ['route' => ['throttle' => 2]];
    }
}
