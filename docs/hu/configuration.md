# Konfigurációs referencia

> 🇬🇧 English version: [docs/en/configuration.md](../en/configuration.md)

A `config/consent.php` minden kulcsa a service provider indulásakor típusos
`ConsentConfig`-gá validálódik — a rossz típusú vagy tartományon kívüli érték
azonnal, a hibás kulcs megnevezésével bukik (`InvalidConfigurationException`).
A config publikálása:

```bash
php artisan vendor:publish --tag=consent-config
```

## Kulcsok

### Verzió és sütik

| Kulcs | Alapérték | Megjegyzés |
|---|---|---|
| `version` | `'1'` | Nem üres string. Ha megemeli (`'2026-10'`), minden látogatót újra megkérdez a rendszer: a tárolt verzió nem egyezik, ezért a régi döntés érvénytelen, a régi érték-sütit pedig a JS mag törli. |
| `cookie.name` | `__cookie_consent` | Az érték-süti. Env: `CONSENT_COOKIE`. Minta: `^[A-Za-z0-9_\-]+$`. |
| `cookie.version_name` | `__cookie_consent_v` | A verzió-süti. Env: `CONSENT_COOKIE_VERSION`. Ugyanaz a minta. |
| `cookie.lifetime_days` | `365` | Egész szám, `1..730`. Env: `CONSENT_LIFETIME_DAYS`. A csomag által írt összes süti `Max-Age`-je. |
| `cookie.domain` | `null` | `null` = host-only süti, vagy egy gazdagépnév (pl. `example.com` / `.example.com`; betűk, számjegyek, kötőjel és pont, opcionális kezdő ponttal), amellyel a döntés az aldomainek között is érvényes. Minden más `InvalidConfigurationException`-t dob. A `cookie.domain`-t csak a `version` emelésével együtt módosítsa. |
| `cookie.same_site` | `Lax` | `Lax`, `Strict` vagy `None`. |
| `cookie.secure` | `null` | `null` = automatikus (`Secure`, ha az oldal `https:`-en érkezik), vagy `true` / `false`. |

### Kategóriák

```php
'categories' => [
    'necessary' => ['required' => true, 'cookies' => []],
    'analytics' => ['required' => false, 'cookies' => []],
    'marketing' => ['required' => false, 'cookies' => []],
],
```

| Kulcs | Alapérték | Megjegyzés |
|---|---|---|
| `categories` | `necessary`, `analytics`, `marketing` | Nem üres map. A sorrend a megjelenítési sorrend. A kulcsok illeszkednek a `^[a-z0-9_-]+$` mintára; legalább egy kategóriának `required => true` kell legyen. |
| `categories.<key>.required` | `false` | A kötelező kategória mindig engedélyezett, jelölőnégyzete `checked disabled`, sütiit pedig soha nem törli a rendszer. |
| `categories.<key>.cookies` | `[]` | A kategória által beállított sütik — lásd lentebb. |

A kategória címkéjét és leírását a nyelvi fájlok adják
(`consent::consent.categories.<key>.label` / `.description`). A csomag a
`necessary`, `functional`, `analytics` és `marketing` kulcshoz szállít szöveget.
Bármely más kulcsnál a címke a kulcsból képzett cím (`my_category` →
`My Category`), a leírás üres — a szövegeket publikált nyelvi fájlban adhatja
meg (lásd [Szövegek és nyelvek](#szövegek-és-nyelvek)).

#### Süti-bejegyzések

A `cookies` minden eleme **vagy** sima string, **vagy** gazdag tömb.

| Forma | Példa | Mire jó |
|---|---|---|
| Sima string | `'_ga'`, `'_ga_*'` | Csak törléshez. A záró `*` előtag-mintát jelent. A süti-táblázatban nem szerepel. |
| Gazdag tömb | `['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => '…', 'lifetime' => 'P2Y']` | Törlés **és** süti-táblázat (`Consent::cookieTable()`). |

A gazdag bejegyzés kulcsai:

| Kulcs | Kötelező | Megjegyzés |
|---|---|---|
| `name` | igen | Süti neve vagy előtag-minta (`^[A-Za-z0-9_\-]+\*?$`). Kategórián belül egyedi, a sima és a gazdag forma együtt számít. |
| `provider` | nem | String, legfeljebb 120 karakter. |
| `purpose` | nem | Szöveg, nyelvi kulcs (`'cookies.ga'` vagy `'consent::consent.cookies.ga'` — ha van hozzá fordítás, azt használja), vagy `[locale => szöveg]` map. Map esetén az aktuális nyelv nyer, utána az `app.fallback_locale`, végül az első elem. |
| `lifetime` | nem | `'session'`, vagy ISO 8601 időtartam (`P2Y`, `P90D`, `PT24H`). A megadott mértékegységben jelenik meg, Carbon honosítja: `P90D` → „90 nap” / „90 days”, `P13M` → „13 hónap”, `P2W` → „2 hét”. A `'session'` a `consent::consent.cookies.session` szöveget használja. |
| `domain` | nem | `null` vagy string; a táblázatban a név mellett látszik. |

```php
'analytics' => [
    'required' => false,
    'cookies' => [
        ['name' => '_ga', 'provider' => 'Google Analytics', 'purpose' => ['hu' => 'Látogatók megkülönböztetése', 'en' => 'Distinguishes visitors'], 'lifetime' => 'P2Y', 'domain' => '.example.com'],
        '_ga_*',   // visszavonáskor törlődik, a táblázatban nem szerepel
        '_gid',
    ],
],
```

A kötelező kategóriák is listázhatnak sütiket (megjelennek a táblázatban, de
soha nem törlődnek).

### Visszavonás és irányelv

| Kulcs | Alapérték | Megjegyzés |
|---|---|---|
| `reload_on_revoke` | `true` | Boolean. A betöltött külső címkék nem távolíthatók el, ezért ha a visszavont kategóriához **töltődött be valami** (lefutott egy tiltott script, beállítottak egy Google címkét), az oldal egyszer újratölt. Lásd a README „Complete withdrawal” szakaszát. |
| `policy_url` | `null` | `null`, string vagy `[locale => url]` map. Az a string, amely egy létező route nevét adja (`'cookie-policy'`), `route('cookie-policy')`-vé alakul; minden más string változatlanul marad. A map az `app()->getLocale()`, majd az `app.fallback_locale` szerint választ, különben `null`. Kérésenként oldódik fel. |

### Google Consent Mode v2 (Basic)

| Kulcs | Alapérték | Megjegyzés |
|---|---|---|
| `google.tags` | `[]` | `['id' => 'G-XXXX', 'category' => 'analytics']` elemek listája. Az `id` illeszkedik a `^(G\|AW\|GT\|DC\|UA)-[A-Z0-9\-]+$` mintára; a `category` létező és **nem** kötelező kategória kell legyen. Üres lista = a Google ki van kapcsolva, a `clientConfig()['google']` `null`. |
| `google.signals` | `analytics_storage → analytics`, `ad_storage`, `ad_user_data`, `ad_personalization → marketing` | Pontosan ez a négy kulcs; minden érték létező kategória. |
| `google.ads_data_redaction` | `false` | Boolean. A betöltő előtt `gtag('set', 'ads_data_redaction', true)` fut. |
| `google.url_passthrough` | `false` | Boolean. A betöltő előtt `gtag('set', 'url_passthrough', true)` fut. |

### Hozzájárulási napló

A `log` alatti minden beállítás hatástalan, amíg a `log.enabled` `false`.

| Kulcs | Alapérték | Megjegyzés |
|---|---|---|
| `log.enabled` | `false` | Env: `CONSENT_LOG_ENABLED`. `false` esetén a route nincs regisztrálva (404), a migráció nem töltődik be, a `clientConfig()['log']` `null`, és a JS mag nem küld kérést, azonosító-sütit sem hoz létre. |
| `log.table` | `consent_logs` | Minta: `^[a-z_][a-z0-9_]{0,35}$` (legfeljebb 36 karakter, hogy a generált indexnevek beleférjenek a MySQL 64 karakteres korlátjába). A migráció és a modell olvassa — **migrálás után ne módosítsa**. |
| `log.connection` | `null` | `null` = alapértelmezett adatbáziskapcsolat. A táblához hasonlóan migrálás után ezt sem szabad módosítani. |
| `log.retention_days` | `365` | Egész szám, `1..3650`, és **legalább** a `cookie.lifetime_days` (a bizonyítéknak túl kell élnie a bizonyított hozzájárulást). Env: `CONSENT_LOG_RETENTION_DAYS`. A `ConsentLog::prunable()` használja. |
| `log.route.prefix` | `consent` | A végpont `/<prefix>/log`. Induláskor rögzül. |
| `log.route.middleware` | `['web']` | Stringek listája. A `web` adja a végpont által használt munkamenetet és CSRF-védelmet. Induláskor rögzül. |
| `log.route.throttle` | `30` | Kérés/perc IP-nként, egész szám, `1..1000`. Induláskor rögzül. |
| `log.id_cookie_name` | `__cookie_consent_id` | A hozzájárulás-azonosítót tároló, szükséges süti. Env: `CONSENT_COOKIE_ID`. Süti-név minta. |
| `log.store_ip` | `true` | Az `ip_hash` tárolása (HMAC-SHA256 az app kulccsal, a /24-es IPv4 vagy /48-as IPv6 előtagon). `false` = `null`. |
| `log.store_user_agent` | `true` | A nyers user agent tárolása, érvényes UTF-8-ra tisztítva, majd a `user_agent_max_length`-re csonkolva. `false` = `null`. |
| `log.user_agent_max_length` | `255` | **Opcionális.** Egész szám, `1..255` (az oszlop `string(255)`; a korlát emelése előtt az oszlopot kell szélesíteni). Hiányzó kulcs = `255`; megadott, de érvénytelen érték hibát dob. |
| `log.store_user_id` | `true` | Az `Auth::id()` tárolása stringként, ha a felhasználó be van jelentkezve. A 64 karakternél hosszabb azonosító `null`-ként kerül tárolásra (a kérés ettől még sikeres). |

## Összefésülés és validáció

A service provider `mergeConfigFrom`-ot használ, amely **sekély**: csak a
legfelső szintű kulcsokat fésüli össze. Amint a publikált `config/consent.php`
definiál egy legfelső szintű blokkot — `cookie`, `categories`, `log`, `google` —,
az **teljes egészében** felváltja a csomag alapértelmezését, ezért teljesnek kell
lennie, a beágyazott `log.route` és `google.signals` blokkokkal együtt. A
hiányos blokk induláskor bukik, az üzenet a hiányzó kulcsot nevezi meg.
(A `log.user_agent_max_length` az egyetlen opcionális kulcs.) A publikált fájlt
tekintse az egyetlen forrásnak, és helyben szerkessze.

A hozzájárulási napló route-ja, middleware-je és rate limitje egyszer, induláskor
regisztrálódik; módosításuk után indítsa újra az alkalmazást (és ürítse a
config-gyorsítótárat). A táblát és a kapcsolatot a migráció és a modell olvassa —
az első `migrate` előtt válassza meg őket, utána ne változtassa.

## Szövegek és nyelvek

A csomag `de`, `en`, `es`, `fr` és `hu` nyelvet tartalmaz, magázó
hangnemben. A banner minden szövege a `lang/<locale>/consent.php`-ből jön:

```php
'banner' => [
    'title', 'description', 'policy', 'accept_all', 'reject_all',
    'settings', 'settings_title', 'settings_intro', 'save', 'cancel',
],
'categories' => ['necessary' => ['label', 'description'], /* … */],
'cookies' => ['headings' => ['name', 'provider', 'purpose', 'lifetime'], 'session' => '…'],
```

Projektenkénti felülírás:

```bash
php artisan vendor:publish --tag=consent-lang   # → lang/vendor/consent/{locale}/consent.php
```

A Laravel a publikált fájlt a csomag sorai fölé fésüli, ezért a felülíró
fájlba elég csak a módosítani kívánt kulcsokat tenni. A JS adapterek
ugyanezeket a szövegeket jelenítik meg: a szerver a kérés nyelvére oldja fel
őket, és a `clientConfig()`-ban adja át.

## A kliens-config

A `Consent::clientConfig()` (amit a `@consentConfig` kiír) a JS mag által
olvasott JSON-dokumentum. Kérésenként épül, és az aktuális nyelvre van
feloldva.

```json
{
  "version": "2026-10",
  "cookie": {
    "name": "__cookie_consent",
    "versionName": "__cookie_consent_v",
    "lifetimeDays": 365,
    "domain": null,
    "sameSite": "Lax",
    "secure": null
  },
  "categories": [
    { "key": "necessary", "required": true, "label": "Szükséges", "description": "…", "cookies": [] },
    { "key": "analytics", "required": false, "label": "Analitika", "description": "…", "cookies": ["_ga", "_ga_*", "_gid"] }
  ],
  "texts": {
    "title": "Sütiket használunk",
    "description": "…",
    "policy": "Süti tájékoztató",
    "acceptAll": "Összes elfogadása",
    "rejectAll": "Összes elutasítása",
    "settings": "Beállítások",
    "settingsTitle": "Süti beállítások",
    "settingsIntro": "…",
    "save": "Kijelöltek mentése",
    "cancel": "Mégsem"
  },
  "reloadOnRevoke": true,
  "log": { "endpoint": "/consent/log", "idCookieName": "__cookie_consent_id" },
  "policyUrl": "/suti-kezeles",
  "google": {
    "tags": [{ "id": "G-XXXXXXX", "category": "analytics" }],
    "signals": {
      "analytics_storage": "analytics",
      "ad_storage": "marketing",
      "ad_user_data": "marketing",
      "ad_personalization": "marketing"
    },
    "adsDataRedaction": false,
    "urlPassthrough": false
  }
}
```

- A `categories[].cookies` a nevek és minták lapos listája (a törlés
  bemenete). A gazdag metaadat a `Consent::cookieTable()`-ben él, nem itt.
- A `log` `null`, ha a `log.enabled` `false`; a végpont relatív, így mindig
  egyezik azzal a hosttal, amelyen a látogató éppen jár. Egyedi
  `log.route.prefix` megváltoztatja.
- A `google` `null`, ha a `google.tags` üres.
- A dokumentumot soha ne gyorsítótárazza nyelvek vagy kérések között.

Ismert korlát: a `texts` szerveroldalon, kérésenként oldódik fel, és a JS
manager létrehozásakor rögzül. A csak kliensoldali nyelvváltás oldalrenderelés
nélkül a korábbi szövegeket tartja meg a következő teljes renderelésig vagy
újrainicializálásig.

## Környezeti változók

| Változó | Config kulcs |
|---|---|
| `CONSENT_COOKIE` | `cookie.name` |
| `CONSENT_COOKIE_VERSION` | `cookie.version_name` |
| `CONSENT_LIFETIME_DAYS` | `cookie.lifetime_days` |
| `CONSENT_LOG_ENABLED` | `log.enabled` |
| `CONSENT_LOG_RETENTION_DAYS` | `log.retention_days` |
| `CONSENT_COOKIE_ID` | `log.id_cookie_name` |
