import type { ConsentManager, GoogleSignal, GoogleTag } from './types';

type GtagWindow = Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
};

/** Upper bound for the idle deferral of the gtag loader, so a busy page cannot delay tags indefinitely. */
const IDLE_TIMEOUT_MS = 2000;

const SIGNAL_KEYS: readonly GoogleSignal[] = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];

/**
 * Google Consent Mode v2 **Basic** wiring (PLAN §3.5, D2): nothing is loaded
 * while no tag's category is granted; once one is, the gtag loader is injected
 * with the four v2 signals as the default. Later changes send `consent update`
 * and `config` newly granted tags. Loaded tags are marked via
 * `manager.markLoaded()` so revoking them triggers the D23 reload.
 * Returns a detach function.
 */
export function attachGoogle(manager: ConsentManager, win: Window = window): () => void {
    const gwin = win as GtagWindow;
    const doc = win.document;
    const google = manager.config.google;

    if (google === null) {
        return () => {};
    }

    let loaded = false;
    let scheduled = false;
    let detached = false;
    const configured = new Set<string>();

    const signals = (): Record<GoogleSignal, 'granted' | 'denied'> => {
        const result = {} as Record<GoogleSignal, 'granted' | 'denied'>;

        for (const key of SIGNAL_KEYS) {
            result[key] = manager.has(google.signals[key]) ? 'granted' : 'denied';
        }

        return result;
    };

    const grantedTags = (): GoogleTag[] => google.tags.filter((tag) => manager.has(tag.category));

    const ensureStubs = (): ((...args: unknown[]) => void) => {
        gwin.dataLayer = gwin.dataLayer || [];

        if (!gwin.gtag) {
            gwin.gtag = function gtag(): void {
                // gtag.js requires the real `arguments` object, not a rest array.
                // eslint-disable-next-line prefer-rest-params
                (gwin.dataLayer as unknown[]).push(arguments);
            };
        }

        return gwin.gtag;
    };

    const configure = (tags: GoogleTag[]): void => {
        const gtag = ensureStubs();

        for (const tag of tags) {
            if (configured.has(tag.id)) {
                continue;
            }

            gtag('config', tag.id);
            configured.add(tag.id);
            manager.markLoaded(tag.category);
        }
    };

    const load = (): void => {
        scheduled = false;

        if (detached || loaded) {
            return;
        }

        // Re-evaluated at run time: consent may have been revoked while the load was deferred.
        const tags = grantedTags();

        if (tags.length === 0) {
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

        const script = doc.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tags[0].id)}`;
        (doc.head ?? doc.documentElement).appendChild(script);

        gtag('js', new Date());
        configure(tags);

        loaded = true;
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

        const tags = grantedTags();

        if (!loaded) {
            if (tags.length > 0) {
                schedule();
            }

            return;
        }

        ensureStubs()('consent', 'update', signals());
        configure(tags);
    };

    const unsubscribe = manager.onChange(apply);

    apply();

    return () => {
        detached = true;
        unsubscribe();
    };
}
