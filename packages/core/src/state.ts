import { deleteCookie, expireEverywhere, readCookie, writeCookie } from './cookies';
import { purgeCategoryCookies } from './purge';
import type { ConsentConfig, ConsentState } from './types';

export function requiredKeys(config: ConsentConfig): string[] {
    return config.categories.filter((category) => category.required).map((category) => category.key);
}

/** Known keys of `keys` plus every required key, in config category order. */
export function normalizeGranted(config: ConsentConfig, keys: readonly string[]): string[] {
    return config.categories
        .filter((category) => category.required || keys.includes(category.key))
        .map((category) => category.key);
}

export function undecidedState(config: ConsentConfig, version: string | null): ConsentState {
    return { decided: false, granted: requiredKeys(config), version };
}

/**
 * Read the consent decision from the cookies (PLAN §3.1). A decision is valid
 * only when the value cookie exists AND the version cookie equals the config
 * version. A value cookie with a missing/stale version is deleted (server
 * readers must stop honouring it) and every optional category's cookies are
 * purged (D23). For a valid decision, the cookies of every non-granted optional
 * category are purged on each read (D48). With `cookie.domain` set, host-only copies of both cookies are
 * expired first (M1b). `write` is forwarded to the purge (test seam).
 */
export function readState(
    config: ConsentConfig,
    doc: Document,
    write?: (cookieString: string) => void,
): ConsentState {
    if (config.cookie.domain !== null) {
        // M1b: with a domain configured the package never writes host-only cookies, so a host-only copy is a legacy
        // leftover that a sibling subdomain could not delete — and it would be read before the Domain cookie.
        deleteCookie(doc, config.cookie.name, null);
        deleteCookie(doc, config.cookie.versionName, null);
    }

    const value = readCookie(doc, config.cookie.name);
    const version = readCookie(doc, config.cookie.versionName);

    if (value === null) {
        return undecidedState(config, version);
    }

    if (version !== config.version) {
        expireEverywhere(doc, config.cookie.name, config.cookie.domain);
        expireEverywhere(doc, config.cookie.versionName, config.cookie.domain);

        for (const category of config.categories) {
            if (!category.required) {
                purgeCategoryCookies(doc, category, write);
            }
        }

        return undecidedState(config, version);
    }

    const keys = value.split(',').map((key) => key.trim()).filter((key) => key !== '');

    const granted = normalizeGranted(config, keys);

    // D48: housekeeping for decided visitors — optional categories that are not granted never keep cookies
    // (a tag loaded before the decision, another tab, a cookie that survived an old purge). D43: undecided
    // visitors are never touched, and nothing was loaded for these categories, so no reload follows.
    for (const category of config.categories) {
        if (!category.required && !granted.includes(category.key)) {
            purgeCategoryCookies(doc, category, write);
        }
    }

    return { decided: true, granted, version };
}

/**
 * Write both consent cookies. The value cookie lists the granted keys in
 * config category order (required ones always included). Returns the new state.
 */
export function writeState(config: ConsentConfig, doc: Document, granted: readonly string[]): ConsentState {
    const keys = normalizeGranted(config, granted);
    const options = {
        maxAgeSeconds: config.cookie.lifetimeDays * 86400,
        domain: config.cookie.domain,
        sameSite: config.cookie.sameSite,
        secure: config.cookie.secure,
    };

    if (config.cookie.domain !== null) {
        // M1: clear a host-only shadow (legacy / pre-domain-change) that would be read before the Domain cookie.
        expireEverywhere(doc, config.cookie.name, config.cookie.domain);
        expireEverywhere(doc, config.cookie.versionName, config.cookie.domain);
    }

    writeCookie(doc, config.cookie.name, keys.join(','), options);
    writeCookie(doc, config.cookie.versionName, config.version, options);

    return { decided: true, granted: keys, version: config.version };
}
