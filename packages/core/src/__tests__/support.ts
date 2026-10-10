import { Window as HappyWindow } from 'happy-dom';
import { vi } from 'vitest';
import type { ConsentConfig } from '../types';

export interface TestEnv {
    win: Window;
    doc: Document;
    /** Cookie names currently in the jar. */
    names(): string[];
    /** Dispatch a plain DOM event on the document (e.g. `livewire:navigated`). */
    dispatch(type: string): void;
    close(): Promise<void>;
}

/**
 * A fresh, isolated happy-dom window per test (own URL, own cookie jar).
 *
 * happy-dom quirk: `Max-Age=0` sets `expires = Date.now()` and expiry is a
 * strict `<` check, so a deleted cookie lingers as `name=` until the clock
 * moves. Tests run on fake timers and call `tick()` before asserting on the jar.
 */
export function makeEnv(url = 'http://localhost:3000/'): TestEnv {
    const happy = new HappyWindow({ url });
    const win = happy as unknown as Window;
    const doc = happy.document as unknown as Document;

    return {
        win,
        doc,
        names: () => doc.cookie.split(';').map((part) => part.split('=')[0].trim()).filter((name) => name !== ''),
        dispatch: (type) => {
            doc.dispatchEvent(new happy.Event(type) as unknown as Event);
        },
        close: () => happy.happyDOM.close(),
    };
}

/** Advance the fake clock past the current millisecond (and run due timers). */
export function tick(): void {
    vi.advanceTimersByTime(1);
}

export function makeConfig(overrides: Partial<ConsentConfig> = {}): ConsentConfig {
    return {
        version: '2026-10',
        cookie: {
            name: '__cookie_consent',
            versionName: '__cookie_consent_v',
            lifetimeDays: 365,
            domain: null,
            sameSite: 'Lax',
            secure: null,
        },
        categories: [
            { key: 'necessary', required: true, label: 'Necessary', description: 'Required', cookies: [] },
            { key: 'analytics', required: false, label: 'Analytics', description: 'Stats', cookies: ['_ga', '_ga_*', '_gid'] },
            { key: 'marketing', required: false, label: 'Marketing', description: 'Ads', cookies: ['_gcl_au', '_gcl_*'] },
        ],
        texts: {
            title: 'title',
            description: 'description',
            policy: 'policy',
            acceptAll: 'acceptAll',
            rejectAll: 'rejectAll',
            settings: 'settings',
            settingsTitle: 'settingsTitle',
            settingsIntro: 'settingsIntro',
            save: 'save',
            cancel: 'cancel',
        },
        reloadOnRevoke: true,
        log: null,
        policyUrl: '/cookies',
        google: null,
        ...overrides,
    };
}

/** Seed raw cookies (`a=1; b=2`) into the jar. */
export function seedCookies(doc: Document, cookies: string): void {
    for (const pair of cookies.split(';')) {
        doc.cookie = `${pair.trim()}; Path=/`;
    }
}
