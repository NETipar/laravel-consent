import type { ConsentManager, GoogleContainer, GoogleSignal, GoogleTag } from './types';

type GtagWindow = Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
};

/** Upper bound for the idle deferral of the first load, so a busy page cannot delay tags indefinitely. */
const IDLE_TIMEOUT_MS = 2000;

const SIGNAL_KEYS: readonly GoogleSignal[] = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];

const LOADER_ORIGIN = 'https://www.googletagmanager.com';

/**
 * Google Consent Mode v2 **Basic** wiring (PLAN §3.5, D2) for gtag.js tags and
 * Google Tag Manager containers. Nothing is loaded while no tag's category and
 * no container's categories are granted. On the first grant one shared
 * `dataLayer` receives `consent default` with the four v2 signals and the
 * `set` calls, then the loaders: gtag.js (with `js` + `config` per granted tag)
 * and, per eligible container, the `gtm.start` push and `gtm.js`.
 *
 * Later changes send `consent update`, push the `updateEvent` (once a
 * container is loaded), `config` newly granted tags and load containers that became eligible —
 * each loader at most once. Every granted category something was loaded for is
 * reported via `manager.markLoaded()`, so revoking it triggers the D23 reload.
 * Without a window (SSR) it does nothing. Returns a detach function.
 */
export function attachGoogle(
    manager: ConsentManager,
    win: Window | undefined = typeof window === 'undefined' ? undefined : window,
): () => void {
    const google = manager.config.google;

    if (google === null || win === undefined) {
        return () => {};
    }

    const gwin = win as GtagWindow;
    const doc = win.document;
    const containers: readonly GoogleContainer[] = google.containers ?? [];
    // The event exists for GTM triggers; a gtag-only setup keeps its v0.1 dataLayer unchanged.
    const updateEvent = containers.length > 0 ? (google.updateEvent === undefined ? 'consent_update' : google.updateEvent) : null;

    /** `consent default` + `set` calls were sent: the first load happened. */
    let defaulted = false;
    let gtagLoaded = false;
    let scheduled = false;
    let detached = false;
    const configured = new Set<string>();
    const loadedContainers = new Set<string>();

    const signals = (): Record<GoogleSignal, 'granted' | 'denied'> => {
        const result = {} as Record<GoogleSignal, 'granted' | 'denied'>;

        for (const key of SIGNAL_KEYS) {
            result[key] = manager.has(google.signals[key]) ? 'granted' : 'denied';
        }

        return result;
    };

    const grantedTags = (): GoogleTag[] => google.tags.filter((tag) => manager.has(tag.category));

    const pendingContainers = (): GoogleContainer[] => containers.filter(
        (container) => !loadedContainers.has(container.id) && container.categories.some((key) => manager.has(key)),
    );

    const dataLayer = (): unknown[] => {
        gwin.dataLayer = gwin.dataLayer || [];

        return gwin.dataLayer;
    };

    const ensureStubs = (): ((...args: unknown[]) => void) => {
        dataLayer();

        if (!gwin.gtag) {
            gwin.gtag = function gtag(): void {
                // gtag.js requires the real `arguments` object, not a rest array.
                // eslint-disable-next-line prefer-rest-params
                (gwin.dataLayer as unknown[]).push(arguments);
            };
        }

        return gwin.gtag;
    };

    const inject = (src: string): void => {
        const script = doc.createElement('script');
        script.async = true;
        script.src = src;
        (doc.head ?? doc.documentElement).appendChild(script);
    };

    const loadTags = (tags: GoogleTag[]): void => {
        if (tags.length === 0) {
            return;
        }

        const gtag = ensureStubs();

        if (!gtagLoaded) {
            inject(`${LOADER_ORIGIN}/gtag/js?id=${encodeURIComponent(tags[0].id)}`);
            gtag('js', new Date());
            gtagLoaded = true;
        }

        for (const tag of tags) {
            if (configured.has(tag.id)) {
                continue;
            }

            gtag('config', tag.id);
            configured.add(tag.id);
            manager.markLoaded(tag.category);
        }
    };

    const loadContainers = (): void => {
        for (const container of pendingContainers()) {
            const src = `${LOADER_ORIGIN}/gtm.js?id=${encodeURIComponent(container.id)}`;

            // Another consent manager on this document already loaded it: never a second container instance.
            if (!Array.from(doc.querySelectorAll('script[src]')).some((el) => el.getAttribute('src') === src)) {
                dataLayer().push({ 'gtm.start': Date.now(), event: 'gtm.js' });
                inject(src);
            }

            loadedContainers.add(container.id);
        }

        // A loaded container gates its tags on the signals: every granted category of it counts as loaded (D23).
        for (const container of containers) {
            if (loadedContainers.has(container.id)) {
                container.categories.filter((key) => manager.has(key)).forEach((key) => manager.markLoaded(key));
            }
        }
    };

    const load = (): void => {
        scheduled = false;

        if (detached || defaulted) {
            return;
        }

        // Re-evaluated at run time: consent may have been revoked while the load was deferred.
        const tags = grantedTags();

        if (tags.length === 0 && pendingContainers().length === 0) {
            return;
        }

        const gtag = ensureStubs();

        gtag('consent', 'default', signals());

        if (google.adsDataRedaction) {
            gtag('set', 'ads_data_redaction', true);
        }

        if (google.urlPassthrough) {
            gtag('set', 'url_passthrough', true);
        }

        defaulted = true;

        loadTags(tags);
        loadContainers();
    };

    const schedule = (): void => {
        if (scheduled) {
            return;
        }

        scheduled = true;

        if (typeof win.requestIdleCallback === 'function') {
            win.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
        } else {
            setTimeout(load, 0);
        }
    };

    const apply = (): void => {
        if (detached) {
            return;
        }

        if (!defaulted) {
            if (grantedTags().length > 0 || pendingContainers().length > 0) {
                schedule();
            }

            return;
        }

        ensureStubs()('consent', 'update', signals());

        // Only once a container is on the page, so a gtag-only page collects no events for a container that loads later.
        // A further container loading in this same change still sees this event when it replays the dataLayer.
        if (updateEvent !== null && loadedContainers.size > 0) {
            // GTM merges a pushed array into the previous one index by index (Data Layer Variable, Version 2):
            // without the reset a narrowed list would still read as the wider one (cf. Google's `ecommerce: null`).
            dataLayer().push({ consent_granted: null });
            dataLayer().push({ event: updateEvent, consent_granted: [...manager.state().granted] });
        }

        loadTags(grantedTags());
        loadContainers();
    };

    const unsubscribe = manager.onChange(apply);

    apply();

    return () => {
        detached = true;
        unsubscribe();
    };
}
