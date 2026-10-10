import type { ConsentCategory } from './types';

/**
 * Every suffix of `hostname` with at least two labels, longest first:
 * `www.netipar.hu` → `['www.netipar.hu', 'netipar.hu']`; `localhost` → `[]`.
 * A public-suffix candidate (`co.uk`) is harmlessly rejected by the browser.
 */
export function parentDomains(hostname: string): string[] {
    const labels = hostname.split('.').filter((label) => label !== '');
    const domains: string[] = [];

    for (let index = 0; index <= labels.length - 2; index++) {
        domains.push(labels.slice(index).join('.'));
    }

    return domains;
}

function matches(name: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
        return name.startsWith(pattern.slice(0, -1));
    }

    return name === pattern;
}

/**
 * D23 complete withdrawal: expire every first-party cookie matching the
 * category's `cookies` patterns (exact name, or prefix when the pattern ends
 * in `*`). Each match is written without `Domain`, then with the hostname and
 * every registrable parent (GA sets `_ga*` on the parent domain). Required
 * categories are never purged. Returns the deleted names (deduplicated).
 */
export function purgeCategoryCookies(
    doc: Document,
    category: ConsentCategory,
    write: (cookieString: string) => void = (cookieString) => {
        doc.cookie = cookieString;
    },
): string[] {
    if (category.required || category.cookies.length === 0) {
        return [];
    }

    const names = doc.cookie
        .split(';')
        .map((part) => part.split('=')[0].trim())
        .filter((name) => name !== '');

    const hostname = doc.location.hostname;
    const domains = [...new Set([hostname, ...parentDomains(hostname)].filter((domain) => domain !== ''))];
    const deleted: string[] = [];

    for (const name of names) {
        if (deleted.includes(name) || !category.cookies.some((pattern) => matches(name, pattern))) {
            continue;
        }

        write(`${name}=; Max-Age=0; Path=/`);

        for (const domain of domains) {
            write(`${name}=; Max-Age=0; Path=/; Domain=${domain}`);
        }

        deleted.push(name);
    }

    return deleted;
}
