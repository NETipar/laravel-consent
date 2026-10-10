<?php

declare(strict_types=1);

namespace NETipar\Consent\Http\Controllers;

use Illuminate\Http\Response;
use NETipar\Consent\Http\Requests\StoreConsentLogRequest;
use NETipar\Consent\Log\ConsentRecorder;

final class StoreConsentLogController
{
    public function __invoke(StoreConsentLogRequest $request, ConsentRecorder $recorder): Response
    {
        $recorder->record($request->validated(), $request);

        return response()->noContent();
    }
}
