# Integrációs útmutató

> 🇬🇧 English version: [docs/en/integration.md](../en/integration.md)

A csomag viselkedést és akadálymentességi bekötést ad, stílust soha. Amit a
képernyőn lát, az az Ön saját markupja (Tailwind, shadcn-vue, sima CSS). Válassza
az alkalmazásához illő stacket:

- [Blade és Livewire (Alpine)](#blade-és-livewire-alpine)
- [Inertia és Vue 3](#inertia-és-vue-3)
- [Egyszerű JavaScript](#egyszerű-javascript)

A további szakaszok minden stackre érvényesek.

## Blade és Livewire (Alpine)

### Telepítés és bekötés

```bash
composer require netipar/laravel-consent
php artisan vendor:publish --tag=consent-config
npm install @netipar/consent-core @netipar/consent-alpine
```

Layout:

```blade
<head>
    …
    @consentConfig
</head>
<body>
    …
    <x-consent::banner />
</body>
```

A `@consentConfig` egy `<script type="application/json" id="consent-config">`
elemet ír ki a `Consent::clientConfig()` tartalmával. A típus nem futtatható,
ezért CSP nonce sem kell hozzá.

`resources/js/app.js` — az adaptert az Alpine indítása **előtt** regisztrálja.

Ha a Livewire csomagolja az Alpine-t (Livewire 3 és újabb):

```js
import { Alpine, Livewire } from '../../vendor/livewire/livewire/dist/livewire.esm';
import { registerConsent } from '@netipar/consent-alpine';
import { readConsentConfig } from '@netipar/consent-core';

registerConsent(Alpine, readConsentConfig());
Livewire.start();
```

Sima Alpine-nal:

```js
import Alpine from 'alpinejs';
import { registerConsent } from '@netipar/consent-alpine';
import { readConsentConfig } from '@netipar/consent-core';

registerConsent(Alpine, readConsentConfig());
Alpine.start();
```

A `registerConsent(Alpine, config, options?)` létrehozza a managert, regisztrálja
az `Alpine.store('consent')` store-t és az `Alpine.data('consentBanner')`
komponenst, és visszaadja a managert. Az `options` a core
[`CreateConsentOptions`](#egyszerű-javascript) típusa.

Lábléc-vezérlő, amely újranyitja a beállításokat:

```blade
<button type="button" data-consent-focus-return x-data x-on:click="$store.consent.openSettings($el)">Süti beállítások</button>
```

### A banner komponens

A `<x-consent::banner>` egy stílus nélküli első réteget és egy natív
`<dialog>`-ot ad a beállításokhoz, `<div x-data="consentBanner" data-consent-root>`
burkolóban. Ha érvényes döntés van, a szerver `hidden` attribútumot tesz az első
rétegre, így nincs villanás; ezt utána az Alpine tartja szinkronban.

| Attribútum | Alapérték | Megjegyzés |
|---|---|---|
| `title` | `consent::consent.banner.title` | Az alapértelmezett prompt címsora. |
| `description` | `consent::consent.banner.description` | Az alapértelmezett prompt bekezdése. |
| `policy-url` | `Consent::policyUrl()` | A link célja; `null` esetén nincs link. Kötéshez: `:policy-url="…"`. |
| `policy-label` | `consent::consent.banner.policy` | A link szövege. |
| bármi más (`class`, `id`, `data-*`) | — | Az első réteg `<section>` elemére kerül. |

A gombfeliratok és a beállítások szövegei mindig a nyelvi fájlokból jönnek,
ezért nyelvváltáskor külön teendő nélkül cserélődnek.

#### Slotok

Az alapértelmezett markup kiindulópont. Mindkét réteg lecserélhető:

- Az **alapértelmezett slot** az első réteg (`<section>`) tartalmát váltja le.
  Tartsa meg az `id="consent-title"` és `id="consent-description"` azonosítót a
  címsoron és a bekezdésen: a section `aria-labelledby` / `aria-describedby`
  attribútuma ezekre mutat.
- A **`settings` slot** (`<x-slot:settings>`) a `<dialog>` tartalmát váltja le.
  Attribútumai (`class`, …) a `<dialog>` elemre kerülnek. Tartsa meg az
  `id="consent-settings-title"` azonosítót a címsoron: a dialog
  `aria-labelledby` attribútuma erre mutat.

Mindkét slotban elérhető a `consentBanner` Alpine scope (lásd
[az Alpine API-t](#alpine-api)), így a gombok közvetlenül hívhatják az
`acceptAll()`, `rejectAll()`, `openSettings()`, `closeSettings()` és `save()`
függvényeket. A kategóriákon a manager segítségével iterálhat végig:

```blade
@php($categories = app(\NETipar\Consent\ConsentManager::class)->categories())

<x-consent::banner class="fixed inset-x-3 bottom-3 rounded-xl bg-white p-5 shadow-xl sm:max-w-md">
    <h2 id="consent-title" class="text-lg font-semibold">Sütiket használunk</h2>
    <p id="consent-description" class="mt-2 text-sm text-gray-600">Analitikai és marketing sütiket csak a hozzájárulásával használunk.</p>
    <div class="mt-4 flex gap-2">
        <button type="button" x-on:click="acceptAll()" class="rounded bg-black px-4 py-2 text-white">Összes elfogadása</button>
        <button type="button" x-on:click="rejectAll()" class="rounded bg-black px-4 py-2 text-white">Összes elutasítása</button>
        <button type="button" x-on:click="openSettings($el)" class="rounded border px-4 py-2">Beállítások</button>
    </div>

    <x-slot:settings class="m-auto w-full max-w-lg rounded-xl p-6 backdrop:bg-black/60">
        <h2 id="consent-settings-title" class="text-lg font-semibold">Süti beállítások</h2>
        <ul class="mt-4 space-y-3">
            @foreach ($categories as $category)
                <li>
                    <label class="flex items-start gap-2">
                        <input type="checkbox" x-model="selection['{{ $category->key }}']" @disabled($category->required)>
                        <span>
                            <span class="font-medium">{{ $category->label() }}</span>
                            <span class="block text-sm text-gray-600">{{ $category->description() }}</span>
                        </span>
                    </label>
                </li>
            @endforeach
        </ul>
        <div class="mt-6 flex justify-end gap-2">
            <button type="button" x-on:click="closeSettings()" class="rounded border px-4 py-2">Mégsem</button>
            <button type="button" x-on:click="save()" class="rounded bg-black px-4 py-2 text-white">Kijelöltek mentése</button>
        </div>
    </x-slot:settings>
</x-consent::banner>
```

Az „Összes elutasítása” gomb legyen vizuálisan ugyanolyan hangsúlyos, mint az
„Összes elfogadása” — lásd az [Akadálymentesség](#akadálymentesség) szakaszt.

### Alpine API

Az `Alpine.store('consent')` a manager reaktív tükre:

| Tag | Típus | Megjegyzés |
|---|---|---|
| `granted` | `string[]` | Az engedélyezett kategóriák kulcsai (a kötelezők mindig benne vannak). |
| `decided` | `boolean` | Van érvényes döntés. |
| `promptOpen` | `boolean` | Az első réteg látszik. |
| `settingsOpen` | `boolean` | A beállítások dialogja nyitva van. |
| `texts` | `ConsentTexts` | Szerveroldalon feloldott szövegek (`title`, `acceptAll`, …) kézzel írt markuphoz. |
| `categories` | `ConsentCategory[]` | `key`, `required`, `label`, `description`, `cookies`. |
| `has(key)` | `boolean` | Kötelező kategóriára `true`; ismeretlen kulcsra `ConsentError`. |
| `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()` | | A döntés írása. A `withdraw()` mindkét sütit törli, és újra megjeleníti a promptot. |
| `openSettings()`, `closeSettings()` | | A `closeSettings()` soha nem ment. |
| `dismissPrompt()` | | Csak erre az oldalmegtekintésre rejti el a promptot; nem ír sütit. |

`x-data="consentBanner"` (ezt használja a Blade komponens; kézzel írt markupban is használhatja):

| Tag | Megjegyzés |
|---|---|
| `selection` | `Record<string, boolean>`, a jelölőnégyzetekhez `x-model`-lel kötve. A kötelező kategóriák `true`-k; az opcionálisak a tárolt döntésből indulnak (döntés nélkül `false`). |
| `open`, `settingsOpen` | Reaktív getterek a prompthoz és a dialoghoz. |
| `isRequired(key)`, `toggle(key)` | A `toggle` figyelmen kívül hagyja a kötelező kategóriákat. |
| `acceptAll()`, `rejectAll()` | |
| `save()` | Azokat a kulcsokat menti, amelyeknek a `selection` bejegyzése `true`. |
| `openSettings(opener?)`, `closeSettings()` | Nyitáskor megjegyzi a nyitó elemet, záráskor visszaadja neki a fókuszt (lásd [Fókusz visszaadása](#fókusz-visszaadása)). A nyitót adja át kifejezetten: `x-on:click="openSettings($el)"`. |

A komponens birtokolja a dialogot: az `x-ref="settings"` elemen hívja a
`showModal()` / `close()` metódust, a dialog záródásakor visszaállítja a
`selection`-t (az Escape és a Mégsem soha nem ment), és az `x-ref="prompt"`
elemre az első megjelenéskor teszi a fókuszt — Livewire-navigációnál soha többé.

Saját Alpine markupját a store-ra kapuzhatja. Kötésekben a `granted`-et
olvassa: a store reaktív része ez, a `has()` sima metódushívás, és magától nem
értékelődik újra.

```blade
<div x-data x-show="$store.consent.granted.includes('marketing')">…</div>
```

## Inertia és Vue 3

### Telepítés és a plugin regisztrálása

```bash
composer require netipar/laravel-consent
php artisan vendor:publish --tag=consent-config
npm install @netipar/consent-core @netipar/consent-vue3
```

Ossza meg a kliens-configot (kérésenként oldódik fel, így a nyelv helyes):

```php
// app/Http/Middleware/HandleInertiaRequests.php
use NETipar\Consent\Facades\Consent;

public function share(Request $request): array
{
    return [
        ...parent::share($request),
        'consent' => fn () => Consent::clientConfig(),
    ];
}
```

A plugint a **kliens** belépési pontjában telepítse:

```ts
import { createApp, h } from 'vue';
import { createInertiaApp } from '@inertiajs/vue3';
import { createConsentPlugin, type ConsentConfig } from '@netipar/consent-vue3';

createInertiaApp({
    setup({ el, App, props, plugin }) {
        createApp({ render: () => h(App, props) })
            .use(plugin)
            .use(createConsentPlugin(props.initialPage.props.consent as ConsentConfig))
            .mount(el);
    },
});
```

SSR-biztos: a szerveren (nincs `document`, pl. Inertia SSR) a plugin egy
inert managert ad — nem döntött, a prompt nyitva, minden művelet no-op —, így a
`<ConsentBanner>` és a `useConsent()` kivétel nélkül renderel, és a szerveroldali
markup tartalmazza a promptot. A consent UI érdemben kliensoldali: a böngésző
létrehozza az igazi managert, a banner pedig mountoláskor elrejti a promptot
azoknak, akik már döntöttek. A plugin az app lecsatolásakor megsemmisíti a managert.

A már döntött látogatónak a szerveroldali HTML még a nyitott promptot
tartalmazza: a `<ConsentBanner>` mountoláskor újra beállítja a `hidden`-t, és a
Vue ilyenkor csak fejlesztői módban hydration attribútum-eltérés figyelmeztetést
írhat. Ha a slotban saját markupot renderel, a `hidden`-t mountolás után kösse
maga (vagy csomagolja a bannert kliensoldali határba).

### ConsentBanner

A `<ConsentBanner>` renderless. Slot nélkül ugyanazt a stílus nélküli szerkezetet
rendereli, mint a Blade nézet (a szövegek a szerveroldalon feloldott `texts`-ből
és a kategóriák `label` / `description` mezőiből jönnek). Alapértelmezett scoped
slottal mindent a kezébe ad:

| Slot prop | Típus |
|---|---|
| `texts`, `categories`, `manager` | sima értékek (`ConsentTexts`, `ConsentCategory[]`, `ConsentManager`) |
| `granted`, `decided`, `promptOpen`, `settingsOpen` | **ref-ek** |
| `selection` | reaktív `Record<string, boolean>` |
| `has(key)`, `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()`, `dismissPrompt()` | függvények |
| `openSettings(opener?)`, `closeSettings()` | függvények (megjegyzik és visszaadják a fókuszt, visszaállítják a `selection`-t). A nyitót adja át kifejezetten: `@click="openSettings($event.currentTarget)"` (a puszta `@click="openSettings"` is működik: az esemény `currentTarget`-jét használja). |
| `toggle(key)`, `saveSelection()` | függvények (a `toggle` figyelmen kívül hagyja a kötelező kategóriákat) |
| `promptRef`, `dialogRef` | template ref-ek, `:ref`-fel kösse őket |

> A Vue sablonok a slot propokat **nem** csomagolják ki automatikusan. A ref-eket
> `.value`-val olvassa: `v-if="promptOpen.value"`, `:open="settingsOpen.value"`.

Kösse a `promptRef`-et (`tabindex="-1"`-gyel), hogy a prompt az első
megjelenéskor fókuszt kapjon. A `dialogRef`-et csak natív `<dialog>` esetén
kösse; a komponenskönyvtárbeli dialog a `settingsOpen.value` alapján nyílik.

shadcn-vue dialog a beállítások rétegéhez (a dialog adja a fókuszcsapdát, az
Escape-et és a hátteret):

```vue
<script setup lang="ts">
import { ConsentBanner } from '@netipar/consent-vue3';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
</script>

<template>
    <ConsentBanner
        v-slot="{ texts, categories, promptOpen, settingsOpen, selection, acceptAll, rejectAll, openSettings, closeSettings, toggle, saveSelection, promptRef }"
    >
        <section
            v-if="promptOpen.value"
            :ref="promptRef"
            role="dialog"
            aria-modal="false"
            aria-labelledby="consent-title"
            aria-describedby="consent-description"
            tabindex="-1"
            class="fixed inset-x-3 bottom-3 rounded-xl border bg-background p-5 shadow-xl sm:max-w-md"
        >
            <h2 id="consent-title" class="text-lg font-semibold">{{ texts.title }}</h2>
            <p id="consent-description" class="mt-2 text-sm text-muted-foreground">{{ texts.description }}</p>
            <div class="mt-4 flex gap-2">
                <Button @click="acceptAll">{{ texts.acceptAll }}</Button>
                <Button @click="rejectAll">{{ texts.rejectAll }}</Button>
                <Button variant="outline" @click="openSettings">{{ texts.settings }}</Button>
            </div>
        </section>

        <Dialog :open="settingsOpen.value" @update:open="(open: boolean) => !open && closeSettings()">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle id="consent-settings-title">{{ texts.settingsTitle }}</DialogTitle>
                    <DialogDescription>{{ texts.settingsIntro }}</DialogDescription>
                </DialogHeader>
                <ul class="space-y-3">
                    <li v-for="category in categories" :key="category.key" class="flex items-start gap-3">
                        <Checkbox
                            :id="`consent-category-${category.key}`"
                            :model-value="selection[category.key]"
                            :disabled="category.required"
                            @update:model-value="toggle(category.key)"
                        />
                        <label :for="`consent-category-${category.key}`">
                            <span class="font-medium">{{ category.label }}</span>
                            <span class="block text-sm text-muted-foreground">{{ category.description }}</span>
                        </label>
                    </li>
                </ul>
                <DialogFooter>
                    <Button variant="outline" @click="closeSettings">{{ texts.cancel }}</Button>
                    <Button @click="saveSelection">{{ texts.save }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </ConsentBanner>
</template>
```

Egyszer csatolja a layoutban. A beállítások bárhonnan újranyithatók a
composable-lel (alább), például a láblécben:

```vue
<script setup lang="ts">
import { useConsent } from '@netipar/consent-vue3';

const { openSettings } = useConsent();
</script>

<template>
    <button type="button" @click="openSettings">Süti beállítások</button>
</template>
```

### useConsent()

A `useConsent()` a plugin által biztosított managert injektálja (`ConsentError`-t
dob, ha a plugin nincs telepítve), és ezt adja vissza:

| Tag | Megjegyzés |
|---|---|
| `manager` | A `ConsentManager` (lásd [Egyszerű JavaScript](#egyszerű-javascript)). |
| `texts`, `categories` | Szerveroldalon feloldott szövegek és kategóriák. |
| `granted`, `decided`, `promptOpen`, `settingsOpen` | Ref-ek (`shallowRef`), minden változáskor frissülnek; az előfizetések a hívó effect scope-pal együtt szűnnek meg. |
| `has(key)` | Kötelező kategóriára `true`; ismeretlen kulcsra hibát dob. |
| `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()` | |
| `openSettings()`, `closeSettings()`, `dismissPrompt()` | |

```ts
const { has, granted } = useConsent();

if (has('marketing')) {
    // …
}
```

## Egyszerű JavaScript

Az `@netipar/consent-core` keretrendszermentes:

```ts
import { createConsent, readConsentConfig, CHANGE_EVENT, LOG_FAILED_EVENT } from '@netipar/consent-core';

const consent = createConsent(readConsentConfig());

consent.onChange((state, previous, action) => {
    console.debug(action, state.granted);
});

document.addEventListener(CHANGE_EVENT, (event) => {
    const { state, previous, action } = (event as CustomEvent).detail;
});

document.addEventListener(LOG_FAILED_EVENT, (event) => {
    console.warn('consent log failed', (event as CustomEvent).detail);
});
```

A `createConsent(config, options?)` egy `ConsentManager`-t ad vissza:

| Tag | Megjegyzés |
|---|---|
| `config` | A `ConsentConfig`. |
| `state()` | `{ decided, granted, version }`. |
| `ui()` | `{ promptOpen, settingsOpen }`. |
| `has(key)`, `hasDecision()` | A `has` ismeretlen kulcsra hibát dob. |
| `acceptAll()`, `rejectAll()`, `save(keys)`, `withdraw()` | A `save` a kötelező kategóriákat és a megadott ismert opcionális kulcsokat engedélyezi. |
| `openSettings()`, `closeSettings()`, `dismissPrompt()` | |
| `onChange(listener)`, `onUi(listener)` | Leiratkozó függvényt adnak vissza. Az `onChange` `(state, previous, action)` paramétereket kap; az `action` `accept_all`, `reject_all`, `save`, `withdraw` vagy `sync`. |
| `sync(root?)` | Újraolvassa a sütiket (egy másik lapon is dönthettek), újraértékeli a promptot, és aktiválja a `root` alatti kapuzott scripteket. Automatikusan fut a `livewire:navigated` eseményre, valamint — hogy egy másik lapon történt visszavonás ennél a lapnál is törölje a sütiket — amikor a lap láthatóvá válik (`visibilitychange`), és bfcache-visszaállításkor (`pageshow`, `persisted`). |
| `markLoaded(category)` | Jelzi a managernek, hogy egy kategóriához olyasmi futott le, ami nem távolítható el (a kapuzott scriptek és a Google használja; lásd [újratöltés visszavonáskor](../../README.md#complete-withdrawal)). |
| `destroy()` | Eltávolítja a figyelőket. |

Az `onChange` és a `consent:change` esemény csak akkor fut, ha az engedélyezett
halmaz vagy a `decided` jelző ténylegesen változik; az „Összes elfogadása”
kétszeri megnyomása egyetlen esemény. A `sync` `sync` akcióval jelenik meg, és
soha nem naplózódik.

A `CreateConsentOptions` (mind opcionális): `document`, `window`,
`reload` (alapértelmezés: `() => window.location.reload()`), `fetch` és `uuid`
(a napló szállítása), valamint a `log`, `gatedScripts`, `google`,
`syncOnLivewireNavigate`, `syncOnVisibility` kapcsolók (mind alapból `true`).

Minden átmenetnél a sorrend: a sütik írása, az eltávolított kategóriák sütiinek
törlése, a figyelők értesítése (először a Google, utána a napló, utána a
sajátjai) és a `consent:change` elküldése, a kapuzott scriptek aktiválása,
végül — `setTimeout(0)`-n — szükség esetén az újratöltés.

A `createConsent` és a `readConsentConfig(doc?, id?)` mellett a core exportálja
az `activateGatedScripts`, `attachGoogle`, `attachLog`, `purgeCategoryCookies`,
`readState`, `ConsentError`, `CHANGE_EVENT`, `LOG_FAILED_EVENT` értékeket és a
`ConsentAction`, `ConsentCategory`, `ConsentConfig`, `ConsentManager`,
`ConsentState`, `ConsentTexts`, `ConsentUi`, `CookieTableCategory`,
`CookieTableEntry`, `CreateConsentOptions`, `GoogleSignal`, `GoogleTag`
típusokat. Az adapterek újraexportálják a `readConsentConfig`-ot (Alpine) és a
fő típusokat.

## Scriptek kapuzása

Bármely külső scriptet visszatarthat, amíg a kategóriája engedélyezett nem
lesz: állítsa a típusát `text/plain`-re:

```html
<script type="text/plain" data-consent="marketing" nonce="{{ $nonce }}">
    // csak a "marketing" engedélyezése után fut
</script>

<script type="text/plain" data-consent="analytics" src="https://example.com/widget.js" async></script>

<script type="text/plain" data-consent="analytics marketing" data-consent-type="module">
    import '/js/tracking.js';
</script>
```

- A `data-consent` kategóriakulcsokat sorol szóközzel vagy vesszővel elválasztva;
  **mindegyiknek** engedélyezettnek kell lennie. Ismeretlen kulcs vagy üres
  érték soha nem aktiválja a scriptet.
- Aktiváláskor a csomag új `<script>` elemet hoz létre, átmásol minden
  attribútumot a `type` és a `data-consent*` kivételével (a `src`, `async`,
  `defer` és a CSP `nonce` is megy), a `type`-ot a `data-consent-type`-ra állítja
  (alapértelmezés `text/javascript`), átmásolja a beágyazott kódot, és az
  eredeti után szúrja be, amelyet `data-consent-activated="true"` jelöl. Egy
  script soha nem fut kétszer.
- A dinamikusan beszúrt scriptek alapból aszinkronok, ezért a csomag az `async`-et
  az eredeti tag értékére állítja: a `src` scriptek megtartják a dokumentum
  szerinti sorrendet, kivéve ha az eredeti tagen van `async`.
- A scripteket betöltéskor, minden döntés után, a `livewire:navigated`
  eseményre és a `manager.sync(root)` hívásra vizsgálja át a rendszer — ha Ön
  szúr be markupot, hívja meg ezt (vagy az `activateGatedScripts(manager, root)`
  függvényt).

Szerveroldalon a `@consent` kapuzza a Blade kimenetet:

```blade
@consent('marketing')
    <iframe src="https://www.youtube.com/embed/…" loading="lazy"></iframe>
@else
    <p>Engedélyezze a marketing sütiket a videó megtekintéséhez.</p>
@endconsent
```

Elérhető még: `@unlessconsent('marketing') … @endconsent` és
`@elseconsent('analytics')` (argumentummal). Soha ne írjon argumentum nélküli
`@elseconsent`-et: futásidőben hibát dob, mert a direktívának kell a kategória.
Használjon `@else`-t, és az `@else` és az `@endconsent` elé tegyen szóközt vagy
sortörést. A szerver a döntést csak az oldal renderelésekor látja, így aki az
oldalon dönt, a `@consent` tartalmát csak a következő kérésnél látja; azonnali
reakciót igénylő tartalomhoz kapuzott scriptet használjon.

## Google Consent Mode v2

A `config/consent.php`-ban írja le a címkéket és szükség esetén a jelzéseket:

```php
'google' => [
    'tags' => [
        ['id' => 'G-XXXXXXX', 'category' => 'analytics'],
        ['id' => 'AW-XXXXXXXXX', 'category' => 'marketing'],
    ],
    'signals' => [
        'analytics_storage' => 'analytics',
        'ad_storage' => 'marketing',
        'ad_user_data' => 'marketing',
        'ad_personalization' => 'marketing',
    ],
    'ads_data_redaction' => false,
    'url_passthrough' => false,
],
```

Ez a **Basic** mód: hozzájárulás előtt semmi nem töltődik be a Google-től.

1. Amíg egyetlen címke kategóriája sincs engedélyezve, nem megy kérés, és nem kerül script az oldalra.
2. Amikor egy címke kategóriája először engedélyezetté válik — a döntéskor, vagy egy már érvényes döntéssel érkező oldalbetöltéskor —, a mag definiálja a `gtag`-ot, elküldi a `consent default` hívást a négy jelzéssel (kategóriájuk szerint `granted` vagy `denied`), opcionálisan a `set ads_data_redaction` és `url_passthrough` hívást, beszúrja a `gtag/js?id=<az első engedélyezett címke>` scriptet (`requestIdleCallback`-kel halasztva, `setTimeout` tartalékkal), lefuttatja a `js`, majd minden engedélyezett címkére a `config` hívást.
3. Egy későbbi engedélyezés `consent update` és a most engedélyezetté vált címkékre `config` hívást küld.
4. A visszavonás `consent update` hívást küld az elvesztett jelzésekkel `denied` értékkel. A betöltött címkék nem távolíthatók el, ezért a kategória sütii törlődnek, és — `reload_on_revoke` esetén — az oldal egyszer újratölt.

**Takarítás minden oldalbetöltéskor.** Amint a látogató döntött, a JS mag eltávolítja minden nem engedélyezett, nem kötelező kategória beállított sütijeit (`categories.*.cookies`, pontos név és `előtag*` minta, a hoston és minden szülő domainen) — az első oldalbetöltéskor és minden újraszinkronizáláskor (Livewire-navigáció, a fül újra láthatóvá válása, bfcache-visszaállítás), nem csak a visszavonás pillanatában. Így a döntés előtt betöltött címke vagy egy másik fül, amely tovább írta a `_ga*` sütiket, nem hagyhat maradványt. A még nem döntött látogatóhoz nem nyúl (döntés előtt semmi nem törlődik), a kötelező kategóriák sütijeit soha nem törli, és ez a takarítás sosem tölt újra oldalt, mert egy nem engedélyezett kategóriához nem töltődött be semmi.

Ne tegyen a layoutba saját `gtag.js` snippetet; az a hozzájárulás előtt betöltődne.
A CSP-ben engedélyezze azokat a hosztokat, amelyeket a Google a termékeihez
dokumentál (lásd a [Google áttekintését](https://business.safety.google/adscookies/)).

Egy konverziós hívás védelméhez használja a store-t (Alpine) vagy a `has()`-t:

```js
if (Alpine.store('consent').has('marketing') && typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', { send_to: 'AW-XXXXXXXXX/abc' });
}
```

## Süti-táblázat

A configban deklarált sütiket a szabályzat-oldalon jelenítse meg, hogy az oldal
ne térhessen el a valóságtól. Csak a gazdag `cookies` bejegyzések szerepelnek
(lásd a [konfigurációs referenciát](configuration.md#süti-bejegyzések)).

```blade
<x-consent::cookie-table />
```

| Prop | Alapérték | Megjegyzés |
|---|---|---|
| `categories` | `Consent::cookieTable()` | Azonos alakú saját adattal felülírható. |
| `:only` | `null` | Kategóriakulcsok **kötött** listája: `:only="['analytics', 'marketing']"`. Egyetlen string (`only="analytics"`) is működik. |
| `headings` | `__('consent::consent.cookies.headings')` | Tömb `name`, `provider`, `purpose`, `lifetime` kulccsal. |
| `:show-empty` | `true` | `false` esetén elrejti a sütit nem listázó kategóriákat. |

A szakaszok a config sorrendjét követik, a sütik nélküli kategóriákat is
beleértve (egy üres `<p data-consent-empty>` jelzi őket). A gyökér mindig
`<div data-consent-cookie-table>`; a tartalék markupban nincs class, de minden
`<section>` hordozza a `data-consent-category` és `data-consent-required`
attribútumot, így CSS-ből stílusozható — vagy a gyökér teljes tartalmát slottal
cserélheti:

```blade
<x-consent::cookie-table class="space-y-8" :only="['analytics', 'marketing']">
    @foreach (Consent::cookieTable() as $section)
        @continue($section['cookies'] === [])
        <section>
            <h3 class="text-lg font-semibold">{{ $section['label'] }}</h3>
            <p>{{ $section['description'] }}</p>
            <ul>
                @foreach ($section['cookies'] as $cookie)
                    <li>{{ $cookie['name'] }} — {{ $cookie['provider'] }}, {{ $cookie['lifetime'] }}: {{ $cookie['purpose'] }}</li>
                @endforeach
            </ul>
        </section>
    @endforeach
</x-consent::cookie-table>
```

Egy szakasz alakja: `['key', 'label', 'description', 'required', 'cookies' => [['name', 'provider', 'purpose', 'lifetime', 'domain'], …]]`,
ahol a `provider`, `purpose`, `lifetime` és `domain` lehet `null`. Minden érték
már az aktuális nyelvre van fordítva.

Vue: a táblázatot és a fejléceket Inertia propként adja át.

```php
return Inertia::render('Legal/Cookies', [
    'cookieTable' => Consent::cookieTable(),
    'cookieHeadings' => __('consent::consent.cookies.headings'),
]);
```

```vue
<script setup lang="ts">
import { ConsentCookieTable, type CookieTableCategory, type CookieTableHeadings } from '@netipar/consent-vue3';

defineProps<{ cookieTable: CookieTableCategory[]; cookieHeadings: CookieTableHeadings }>();
</script>

<template>
    <ConsentCookieTable :categories="cookieTable" :headings="cookieHeadings" :only="['analytics']" />
</template>
```

Propok: `categories` és `headings` (kötelező), `only` (`string[]`, alapból mind),
`showEmpty` (alapból `true`). Az alapértelmezett scoped slot a szűrt
`categories` és a `headings` értéket kapja; a `div[data-consent-cookie-table]`
gyökér megmarad, és az olyan attribútumok, mint a `class`, a gyökérelemre kerülnek.

## Akadálymentesség

Az alapértelmezett markup (Blade és Vue) egyetlen szerződést követ; a markup
lecserélésekor is tartsa meg:

- Az első réteg `<section role="dialog" aria-modal="false" aria-labelledby="consent-title" aria-describedby="consent-description" tabindex="-1">`. Nem modális, nincs fókuszcsapda — az oldal használható marad —, és az első megjelenéskor egyszer kap fókuszt.
- A beállítások rétege natív `<dialog aria-labelledby="consent-settings-title">`, `showModal()`-lal nyitva: a böngésző adja a fókuszcsapdát, az Escape-et és a hátteret. Az Escape és a Mégsem **mentés nélkül** zár, a fókusz pedig visszatér a nyitó vezérlőre (lásd [Fókusz visszaadása](#fókusz-visszaadása)).
- Minden vezérlő `<button type="button">`. A kötelező kategória jelölőnégyzete `checked disabled`; az opcionálisak a döntésig jelöletlenek.
- Az „Összes elfogadása” és az „Összes elutasítása” ugyanolyan elemfajta, méret és variáns. Az elutasítás soha nem lehet szöveges link vagy vizuálisan gyengébb.
- Legyen állandó újranyitó vezérlő (lábléc-gomb, amely a `$store.consent.openSettings($el)`-t vagy a `useConsent().openSettings()`-et hívja; jelölje `data-consent-focus-return`-nel): a hozzájárulás visszavonásának ugyanolyan könnyűnek kell lennie, mint megadásának.

### Fókusz visszaadása

A beállítások dialogjának záródásakor a fókusz a nyitó vezérlőre tér vissza.
Két dolog számít:

- **A nyitót adja át kifejezetten.** A Safari (és a macOS-es Firefox) nem
  fókuszál egy megkattintott `<button>`-t, ezért ott a `document.activeElement`
  a `<body>`, és a tartalék semmit sem talál. Használja az
  `x-on:click="openSettings($el)"` alakot (Alpine; az alap Blade nézet ezt
  teszi), a komponensen kívüli újranyitó vezérlőnél a
  `$store.consent.openSettings($el)`-t, Vue-ban az
  `@click="openSettings($event.currentTarget)"`-et. Argumentum nélkül a
  fókuszált elemet használja.
- **`[data-consent-focus-return]`.** Ha a nyitó eltűnt — jellemzően a promptban
  lévő Beállítások gomb, amelyet a „Mentés” épp elrejtett —, a fókusz az első
  ilyen attribútumú elemre kerül, például a lábléc újranyitó gombjára; ilyen
  elem nélkül a fókuszt békén hagyja.

```html
<button type="button" data-consent-focus-return x-data x-on:click="$store.consent.openSettings($el)">Süti beállítások</button>
```
