import type { ConsentManager, GoogleContainer, GoogleSignal, GoogleTag } from './types';

type Signals = Record<GoogleSignal, 'granted' | 'denied'>;

/**
 * What the first Advanced load sent on this page: the signals and granted
 * categories of the last `consent default` / `update`, the configured gtag ids and the loaded
 * container ids. Written by the inline bootstrap of `@consentConfig`
 * (resources/js/google-advanced.js) or by the core, whichever runs first.
 */
interface GoogleBootMarker {
    signals: Signals;
    /** Missing in a marker written by an older inline script. */
    granted?: readonly string[];
    tags: string[];
    containers: string[];
}

/** Window property of the boot marker; resources/js/google-advanced.js uses the same name. */
export const GOOGLE_BOOT_MARKER = '__netiparConsentGoogle';

type GtagWindow = Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [GOOGLE_BOOT_MARKER]?: GoogleBootMarker;
};

/** Upper bound for the idle deferral of the first load, so a busy page cannot delay tags indefinitely. */
const IDLE_TIMEOUT_MS = 2000;

const SIGNAL_KEYS: readonly GoogleSignal[] = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];

const LOADER_ORIGIN = 'https://www.googletagmanager.com';

/**
 * Google Consent Mode v2 wiring (PLAN §3.5, D2) for gtag.js tags and Google
 * Tag Manager containers, in one of two modes (`google.mode`):
 *
 * - **Basic** (default): nothing is loaded while no tag's category and no
 *   container's categories are granted. On the first grant (deferred to an
 *   idle callback) one shared `dataLayer` receives `consent default` with the
 *   four v2 signals and the `set` calls, then the loaders: gtag.js (with `js` +
 *   `config` per granted tag) and, per eligible container, the `gtm.start`
 *   push and `gtm.js`.
 * - **Advanced**: the same sequence runs on every page load whatever the
 *   decision — before one, `consent default` sends all four signals
 *   `denied` — plus an event-less `consent_granted` push when a container
 *   exists; every tag and container loads, the signals gate them. The inline
 *   bootstrap of `@consentConfig` normally sent it already: its boot marker is
 *   adopted and only a differing decision is sent, as `consent update`.
 *   Without the marker the core loads synchronously, with no idle deferral.
 *
 * Later changes send `consent update`, push the `updateEvent` (once a
 * container is loaded), `config` newly eligible tags and load containers that became eligible —
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
    // Missing = a server older than v0.3.0, which only knew Basic.
    const advanced = google.mode === 'advanced';
    // The event exists for GTM triggers; a gtag-only setup keeps its v0.1 dataLayer unchanged.
    const updateEvent = containers.length > 0 ? (google.updateEvent === undefined ? 'consent_update' : google.updateEvent) : null;

    /** `consent default` + `set` calls were sent: the first load happened. */
    let defaulted = false;
    let gtagLoaded = false;
    let scheduled = false;
    let detached = false;
    const configured = new Set<string>();
    const loadedContainers = new Set<string>();

    const signals = (): Signals => {
        const result = {} as Signals;

        for (const key of SIGNAL_KEYS) {
            result[key] = manager.has(google.signals[key]) ? 'granted' : 'denied';
        }

        return result;
    };

    /** Advanced: every tag, the signals gate it. Basic: only tags whose category is granted. */
    const eligibleTags = (): GoogleTag[] => (advanced ? [...google.tags] : google.tags.filter((tag) => manager.has(tag.category)));

    /** Advanced: every container not loaded yet. Basic: those with any of their categories granted. */
    const pendingContainers = (): GoogleContainer[] => containers.filter(
        (container) => !loadedContainers.has(container.id) && (advanced || container.categories.some((key) => manager.has(key))),
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

    /** Advanced only: records what was sent, so a later boot on this page adopts it instead of loading again. */
    const publish = (sent: Signals): void => {
        if (advanced) {
            gwin[GOOGLE_BOOT_MARKER] = {
                signals: sent,
                granted: [...manager.state().granted],
                tags: [...configured],
                containers: [...loadedContainers],
            };
        }
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
            if (!configured.has(tag.id)) {
                gtag('config', tag.id);
                configured.add(tag.id);
            }

            // Advanced configures a tag before its category is granted: it counts as loaded once granted (D23).
            if (manager.has(tag.category)) {
                manager.markLoaded(tag.category);
            }
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

    /** `consent update`, then (once a container is loaded) the reset and the update event. */
    const sendUpdate = (sent: Signals): void => {
        ensureStubs()('consent', 'update', sent);

        // Only once a container is on the page, so a gtag-only page collects no events for a container that loads later.
        // A further container loading in this same change still sees this event when it replays the dataLayer.
        if (updateEvent !== null && loadedContainers.size > 0) {
            // GTM merges a pushed array into the previous one index by index (Data Layer Variable, Version 2):
            // without the reset a narrowed list would still read as the wider one (cf. Google's `ecommerce: null`).
            dataLayer().push({ consent_granted: null });
            dataLayer().push({ event: updateEvent, consent_granted: [...manager.state().granted] });
        }
    };

    const load = (): void => {
        scheduled = false;

        if (detached || defaulted) {
            return;
        }

        // Re-evaluated at run time: consent may have been revoked while the load was deferred.
        const tags = eligibleTags();

        if (tags.length === 0 && pendingContainers().length === 0) {
            return;
        }

        const gtag = ensureStubs();
        const sent = signals();

        gtag('consent', 'default', sent);

        if (google.adsDataRedaction) {
            gtag('set', 'ads_data_redaction', true);
        }

        if (google.urlPassthrough) {
            gtag('set', 'url_passthrough', true);
        }

        // Advanced: the GTM Data Layer Variable reads the real state on a plain page load, not only after a change.
        if (advanced && updateEvent !== null) {
            dataLayer().push({ consent_granted: [...manager.state().granted] });
        }

        defaulted = true;

        loadTags(tags);
        loadContainers();
        publish(sent);
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
            if (advanced) {
                // The order guarantee: no idle deferral, the default goes out before the app can push.
                load();
            } else if (eligibleTags().length > 0 || pendingContainers().length > 0) {
                schedule();
            }

            return;
        }

        const sent = signals();

        sendUpdate(sent);
        loadTags(eligibleTags());
        loadContainers();
        publish(sent);
    };

    /**
     * The inline bootstrap (or an earlier core on this page) already sent the default and the loaders:
     * take them over, report the loaded categories (D23) and send an update only for a differing decision
     * (a host-only shadow cookie the core purged, a decision made in another tab meanwhile).
     */
    const adopt = (marker: GoogleBootMarker): void => {
        defaulted = true;
        gtagLoaded = marker.tags.length > 0;
        marker.tags.forEach((id) => configured.add(id));
        marker.containers.forEach((id) => loadedContainers.add(id));

        const sent = signals();
        const granted = manager.state().granted.join(',');

        if (SIGNAL_KEYS.some((key) => marker.signals[key] !== sent[key]) || (marker.granted !== undefined && marker.granted.join(',') !== granted)) {
            sendUpdate(sent);
        }

        loadTags(eligibleTags());
        loadContainers();
        publish(sent);
    };

    const unsubscribe = manager.onChange(apply);
    const marker = gwin[GOOGLE_BOOT_MARKER];

    if (marker !== undefined) {
        adopt(marker);
    } else {
        apply();
    }

    return () => {
        detached = true;
        unsubscribe();
    };
}
