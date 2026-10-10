@props([
    'categories' => app(\NETipar\Consent\ConsentManager::class)->cookieTable(),
    'only' => null,
    'headings' => __('consent::consent.cookies.headings'),
    'showEmpty' => true,
])
@php
    $sections = collect($categories)
        ->when($only !== null, fn ($sections) => $sections->whereIn('key', (array) $only))
        ->when(! $showEmpty, fn ($sections) => $sections->filter(fn (array $section): bool => $section['cookies'] !== []))
        ->values();
@endphp
<div {{ $attributes }} data-consent-cookie-table>
    @if ($slot->isNotEmpty())
        {{ $slot }}
    @else
        @foreach ($sections as $section)
            <section data-consent-category="{{ $section['key'] }}" data-consent-required="{{ $section['required'] ? 'true' : 'false' }}">
                <h3>{{ $section['label'] }}</h3>
                <p>{{ $section['description'] }}</p>
                @if ($section['cookies'] !== [])
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">{{ $headings['name'] }}</th>
                                <th scope="col">{{ $headings['provider'] }}</th>
                                <th scope="col">{{ $headings['purpose'] }}</th>
                                <th scope="col">{{ $headings['lifetime'] }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach ($section['cookies'] as $cookie)
                                <tr>
                                    <td>{{ $cookie['name'] }}@if ($cookie['domain']) <small>({{ $cookie['domain'] }})</small>@endif</td>
                                    <td>{{ $cookie['provider'] }}</td>
                                    <td>{{ $cookie['purpose'] }}</td>
                                    <td>{{ $cookie['lifetime'] }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                @else
                    <p data-consent-empty></p>
                @endif
            </section>
        @endforeach
    @endif
</div>
