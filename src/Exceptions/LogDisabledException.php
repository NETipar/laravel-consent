<?php

declare(strict_types=1);

namespace NETipar\Consent\Exceptions;

final class LogDisabledException extends ConsentException
{
    public static function disabled(): self
    {
        return new self('The consent log is disabled. Set consent.log.enabled to true to record and read consent events.');
    }
}
