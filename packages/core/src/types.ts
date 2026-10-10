/**
 * Public contract of `@netipar/consent-core` (PLAN §3.5). The JSON shape of
 * `ConsentConfig` is produced server-side by `Consent::clientConfig()`.
 */

export type GoogleSignal = 'analytics_storage' | 'ad_storage' | 'ad_user_data' | 'ad_personalization';

export interface ConsentCategory {
    key: string;
    required: boolean;
    label: string;
    description: string;
    /** Cookie names or prefix patterns ending in `*` — deleted when the category is revoked (D23). */
    cookies: string[];
}

export type ConsentTexts = {
    title: string;
    description: string;
    policy: string;
    acceptAll: string;
    rejectAll: string;
    settings: string;
    settingsTitle: string;
    settingsIntro: string;
    save: string;
    cancel: string;
};

export interface GoogleTag {
    id: string;
    category: string;
}

export interface ConsentConfig {
    version: string;
    cookie: {
        name: string;
        versionName: string;
        lifetimeDays: number;
        domain: string | null;
        sameSite: 'Lax' | 'Strict' | 'None';
        /** `null` = auto: `Secure` when the page is served over `https:`. */
        secure: boolean | null;
    };
    categories: ConsentCategory[];
    texts: ConsentTexts;
    reloadOnRevoke: boolean;
    /** D26 — `null` when the consent log is disabled. */
    log: { endpoint: string; idCookieName: string } | null;
    policyUrl: string | null;
    google: {
        tags: GoogleTag[];
        signals: Record<GoogleSignal, string>;
        adsDataRedaction: boolean;
        urlPassthrough: boolean;
    } | null;
}

export interface ConsentState {
    decided: boolean;
    granted: readonly string[];
    version: string | null;
}

/** `'sync'` = an external / cookie-driven change detected by `sync()`; never logged. */
export type ConsentAction = 'accept_all' | 'reject_all' | 'save' | 'withdraw' | 'sync';

export interface CookieTableEntry {
    name: string;
    provider: string | null;
    purpose: string | null;
    lifetime: string | null;
    domain: string | null;
}

/** Shape of `Consent::cookieTable()` (D27). */
export interface CookieTableCategory {
    key: string;
    label: string;
    description: string;
    required: boolean;
    cookies: CookieTableEntry[];
}

export interface ConsentUi {
    promptOpen: boolean;
    settingsOpen: boolean;
}

export type ConsentChangeListener = (state: ConsentState, previous: ConsentState, action: ConsentAction) => void;

export type ConsentUiListener = (ui: ConsentUi) => void;

export interface ConsentManager {
    readonly config: ConsentConfig;
    state(): ConsentState;
    ui(): ConsentUi;
    /** Required → true; unknown → throws `ConsentError`. */
    has(category: string): boolean;
    hasDecision(): boolean;
    acceptAll(): void;
    rejectAll(): void;
    save(categories: readonly string[]): void;
    withdraw(): void;
    openSettings(): void;
    closeSettings(): void;
    /** Hide the prompt for this page view only; writes no cookie. */
    dismissPrompt(): void;
    onChange(listener: ConsentChangeListener): () => void;
    onUi(listener: ConsentUiListener): () => void;
    /** Re-read cookies, re-evaluate the UI, activate gated scripts under `root`. */
    sync(root?: ParentNode): void;
    /** D23: something that cannot be unloaded ran for this category (gated script, Google tag). */
    markLoaded(category: string): void;
    destroy(): void;
}

export interface CreateConsentOptions {
    document?: Document;
    window?: Window;
    /** Default: `() => window.location.reload()` (D23 reload-on-revoke). */
    reload?: () => void;
    /** D26 log transport; default `window.fetch`. */
    fetch?: typeof fetch;
    /** Default `crypto.randomUUID`. */
    uuid?: () => string;
    /** Default true. */
    log?: boolean;
    /** Default true. */
    gatedScripts?: boolean;
    /** Default true. */
    google?: boolean;
    /** Default true. */
    syncOnLivewireNavigate?: boolean;
    /**
     * Default true. Re-read the cookies when the tab becomes visible and on a
     * bfcache restore (`pageshow` with `persisted`), so a decision made in
     * another tab (revoke → purge, reload) is noticed without a navigation.
     */
    syncOnVisibility?: boolean;
    /**
     * Writer used for the D23 cookie purge deletions (default: `doc.cookie = s`).
     * Test seam — happy-dom's `document.cookie` setter cannot be spied on reliably.
     * Covers purge deletions only, not consent/version/id cookie writes.
     *
     * @internal
     */
    writeCookie?: (doc: Document, cookieString: string) => void;
}

export class ConsentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConsentError';
    }
}

/** `CustomEvent` dispatched on `document`; detail: `{ state, previous, action }`. */
export const CHANGE_EVENT = 'consent:change';

/** D26: `CustomEvent` dispatched on `document`; detail: `{ action, error }`. The UI never waits for the log. */
export const LOG_FAILED_EVENT = 'consent:log-failed';
