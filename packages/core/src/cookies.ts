import { parentDomains } from './purge';

export interface CookieWriteOptions {
    maxAgeSeconds: number;
    domain: string | null;
    sameSite: 'Lax' | 'Strict' | 'None';
    /** `null` = auto: `Secure` when the document is served over `https:`. */
    secure: boolean | null;
}

/**
 * Read a cookie value (URI-decoded). Only the first `=` separates name and
 * value, so values containing `=` survive. Returns `null` when absent.
 */
export function readCookie(doc: Document, name: string): string | null {
    for (const part of doc.cookie.split(';')) {
        const separator = part.indexOf('=');
        const key = (separator === -1 ? part : part.slice(0, separator)).trim();

        if (key !== name) {
            continue;
        }

        const raw = separator === -1 ? '' : part.slice(separator + 1).trim();

        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }

    return null;
}

/**
 * Build and write `name=value; Max-Age=…; Path=/; SameSite=…[; Domain=…][; Secure]`.
 * `SameSite=None` always forces `Secure`. Returns the written cookie string.
 */
export function writeCookie(doc: Document, name: string, value: string, options: CookieWriteOptions): string {
    const secure = options.sameSite === 'None'
        || (options.secure === null ? doc.location.protocol === 'https:' : options.secure);

    let cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${options.maxAgeSeconds}; Path=/; SameSite=${options.sameSite}`;

    if (options.domain) {
        cookie += `; Domain=${options.domain}`;
    }

    if (secure) {
        cookie += '; Secure';
    }

    doc.cookie = cookie;

    return cookie;
}

/** Expire a cookie (`Max-Age=0`) on the given domain (`null` = host-only). Returns the written cookie string. */
export function deleteCookie(doc: Document, name: string, domain: string | null): string {
    let cookie = `${name}=; Max-Age=0; Path=/`;

    if (domain) {
        cookie += `; Domain=${domain}`;
    }

    doc.cookie = cookie;

    return cookie;
}

/**
 * Expire a cookie everywhere it could shadow the real one (M1): host-only, on
 * the configured domain, on the current hostname and on every parent domain.
 * A host-only legacy cookie (1.x, or written before `cookie.domain` was set)
 * is read before a Domain cookie of the same name, so deleting only the
 * configured variant would leave the old decision in force.
 */
export function expireEverywhere(doc: Document, name: string, configuredDomain: string | null): void {
    const hostname = doc.location.hostname;
    const normalise = (domain: string): string => domain.replace(/^\./, '');
    const domains = new Map<string, string>();

    for (const domain of [configuredDomain, hostname, ...parentDomains(hostname)]) {
        if (domain !== null && domain !== '' && !domains.has(normalise(domain))) {
            domains.set(normalise(domain), domain);
        }
    }

    deleteCookie(doc, name, null);

    for (const domain of domains.values()) {
        deleteCookie(doc, name, domain);
    }
}
