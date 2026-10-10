import { deleteCookie, expireEverywhere, readCookie, writeCookie } from './cookies';
import { LOG_FAILED_EVENT } from './types';
import type { ConsentAction, ConsentManager, CreateConsentOptions } from './types';

/** RFC 4122 v4 from `crypto.getRandomValues` for runtimes without `crypto.randomUUID`. */
function randomUuidV4(cryptoApi: Crypto): string {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function defaultUuid(): string {
    const cryptoApi = globalThis.crypto;

    return typeof cryptoApi.randomUUID === 'function' ? cryptoApi.randomUUID() : randomUuidV4(cryptoApi);
}

/**
 * D26 consent-log transport. Subscribes to `onChange` and POSTs every explicit
 * decision (never `'sync'`) to `config.log.endpoint`, fire-and-forget with
 * `keepalive` so it survives the reload-on-revoke. A failed POST dispatches
 * `consent:log-failed` on the document; nothing is retried or thrown — the
 * cookies stay authoritative. Returns a detach function.
 */
export function attachLog(manager: ConsentManager, options: CreateConsentOptions = {}): () => void {
    const log = manager.config.log;

    if (log === null || options.log === false) {
        return () => {};
    }

    const doc = options.document ?? document;
    const win = options.window ?? doc.defaultView ?? (typeof window === 'undefined' ? null : window);
    const uuid = options.uuid ?? defaultUuid;
    const { cookie, version } = manager.config;

    const fail = (action: ConsentAction, error: unknown): void => {
        const EventConstructor = doc.defaultView?.CustomEvent ?? CustomEvent;

        doc.dispatchEvent(new EventConstructor(LOG_FAILED_EVENT, { detail: { action, error } }));
    };

    const ensureConsentId = (): string => {
        if (cookie.domain !== null) {
            // M1b: a host-only id cookie is a legacy leftover (and would be read before the Domain cookie).
            deleteCookie(doc, log.idCookieName, null);
        }

        const existing = readCookie(doc, log.idCookieName);

        if (existing !== null && existing !== '') {
            return existing;
        }

        const created = uuid();

        writeCookie(doc, log.idCookieName, created, {
            maxAgeSeconds: cookie.lifetimeDays * 86400,
            domain: cookie.domain,
            sameSite: cookie.sameSite,
            secure: cookie.secure,
        });

        return created;
    };

    /**
     * Laravel decrypts `X-XSRF-TOKEN` (the encrypted cookie value) but reads the
     * plain `<meta>` token only from `X-CSRF-TOKEN` — send exactly the one we have.
     */
    const csrfHeaders = (): Record<string, string> => {
        const cookieToken = readCookie(doc, 'XSRF-TOKEN');

        if (cookieToken !== null && cookieToken !== '') {
            return { 'X-XSRF-TOKEN': cookieToken };
        }

        const metaToken = doc.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';

        return metaToken === '' ? {} : { 'X-CSRF-TOKEN': metaToken };
    };

    return manager.onChange((state, _previous, action) => {
        if (action === 'sync') {
            return;
        }

        const consentId = ensureConsentId();
        const body = JSON.stringify({
            event_id: uuid(),
            consent_id: consentId,
            action,
            granted: [...state.granted],
            version,
            url: doc.location.pathname,
        });

        try {
            const send = options.fetch ?? win?.fetch.bind(win);

            if (send === undefined) {
                throw new Error('consent: no fetch available');
            }

            send(log.endpoint, {
                method: 'POST',
                credentials: 'same-origin',
                keepalive: true,
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...csrfHeaders(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body,
            })
                .then(
                    (response) => {
                        if (!response.ok) {
                            fail(action, new Error(`consent: log request failed with HTTP ${response.status}`));
                        }
                    },
                    (error: unknown) => fail(action, error),
                );
        } catch (error) {
            fail(action, error);
        }

        if (action === 'withdraw') {
            expireEverywhere(doc, log.idCookieName, cookie.domain);
        }
    });
}
