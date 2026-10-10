import type { ConsentConfig, CreateConsentOptions } from '@netipar/consent-core';
import { createConsentPlugin } from '../plugin';

let counter = 0;

/** Hungarian strings on purpose: proves the UI renders server-resolved texts only (D14). */
export function makeConfig(overrides: Partial<ConsentConfig> = {}): ConsentConfig {
    counter += 1;

    return {
        version: '2026-10',
        cookie: {
            // Unique per test: the global happy-dom cookie jar is shared across tests.
            name: `__cookie_consent_${counter}`,
            versionName: `__cookie_consent_v_${counter}`,
            lifetimeDays: 365,
            domain: null,
            sameSite: 'Lax',
            secure: null,
        },
        categories: [
            { key: 'necessary', required: true, label: 'Szükséges', description: 'Az oldal működéséhez kell', cookies: [] },
            { key: 'analytics', required: false, label: 'Analitika', description: 'Statisztika', cookies: ['_ga'] },
            { key: 'marketing', required: false, label: 'Marketing', description: 'Hirdetések', cookies: ['_gcl_au'] },
        ],
        texts: {
            title: 'Sütiket használunk',
            description: 'Csak a hozzájárulásoddal használunk elemző és marketing sütiket.',
            policy: 'Süti tájékoztató',
            acceptAll: 'Mindet elfogadom',
            rejectAll: 'Mindet elutasítom',
            settings: 'Beállítások',
            settingsTitle: 'Süti beállítások',
            settingsIntro: 'Válaszd ki, mit engedélyezel.',
            save: 'Mentés',
            cancel: 'Mégse',
        },
        reloadOnRevoke: true,
        log: null,
        policyUrl: '/sutik',
        google: null,
        ...overrides,
    };
}

export const quietOptions: CreateConsentOptions = { log: false, google: false, gatedScripts: false };

export function plugin(config: ConsentConfig = makeConfig(), options: CreateConsentOptions = {}) {
    return createConsentPlugin(config, { ...quietOptions, ...options });
}
