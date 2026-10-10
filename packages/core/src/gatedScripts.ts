import type { ConsentManager } from './types';

const SELECTOR = 'script[type="text/plain"][data-consent]:not([data-consent-activated])';
const SKIPPED_ATTRIBUTES = new Set(['type', 'data-consent', 'data-consent-type', 'data-consent-activated']);

/**
 * Activate `<script type="text/plain" data-consent="…">` elements whose
 * categories are all granted. Returns the number activated.
 *
 * Foreign or malformed markup (unknown category keys, empty `data-consent`)
 * is skipped silently — it must never break the page.
 */
export function activateGatedScripts(manager: ConsentManager, root: ParentNode = document): number {
    const known = new Set(manager.config.categories.map((category) => category.key));
    let count = 0;

    root.querySelectorAll<HTMLScriptElement>(SELECTOR).forEach((el) => {
        const required = (el.getAttribute('data-consent') ?? '').split(/[\s,]+/).filter((key) => key !== '');

        if (required.length === 0 || required.some((key) => !known.has(key))) {
            return;
        }

        if (!required.every((key) => manager.has(key))) {
            return;
        }

        const doc = el.ownerDocument;
        const next = doc.createElement('script');

        for (const attribute of Array.from(el.attributes)) {
            if (!SKIPPED_ATTRIBUTES.has(attribute.name)) {
                next.setAttribute(attribute.name, attribute.value);
            }
        }

        next.type = el.getAttribute('data-consent-type') ?? 'text/javascript';

        // Browsers hide the nonce from getAttribute(); without the copy a
        // nonce-based CSP silently blocks the activated script.
        const nonce = (el as HTMLScriptElement).nonce || el.getAttribute('nonce') || '';
        if (nonce) {
            (next as HTMLScriptElement).nonce = nonce;
            next.setAttribute('nonce', nonce);
        }

        if (el.hasAttribute('src')) {
            // Dynamically inserted scripts are async by default; keep document order unless the author opted in.
            next.async = el.hasAttribute('async');
        } else {
            next.textContent = el.textContent;
        }

        el.setAttribute('data-consent-activated', 'true');
        el.after(next);
        count++;

        // An activated script cannot be undone: a later revoke of one of
        // its categories must trigger the reload (D23).
        required.forEach((key) => manager.markLoaded(key));
    });

    return count;
}
