import type { ConsentManager } from '@netipar/consent-core';

/** An element, or the DOM event of a bare `@click="openSettings"` (its `currentTarget` is used). */
export type OpenerArgument = HTMLElement | Event | null;

export function toElement(opener: OpenerArgument | undefined): HTMLElement | null {
    if (opener === undefined || opener === null) {
        return null;
    }

    return 'currentTarget' in opener ? (opener.currentTarget as HTMLElement | null) : opener;
}

/**
 * Openers handed to `useConsent().openSettings(opener)` by controls outside
 * `<ConsentBanner>`; the banner consumes it when the dialog opens.
 */
export const pendingOpeners = new WeakMap<ConsentManager, HTMLElement>();
