<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use NETipar\Consent\Http\Controllers\StoreConsentLogController;

Route::post('log', StoreConsentLogController::class)
    ->middleware('throttle:consent-log')
    ->name('consent.log');
