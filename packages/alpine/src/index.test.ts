import { Window as HappyWindow } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsentConfig } from '@netipar/consent-core';
import type { AlpineLike, ConsentBannerComponent, ConsentStore } from './index';

interface DialogStub {
    open: boolean;
    showModal: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
}

type Banner = ConsentBannerComponent & {
    $refs: Record<string, unknown>;
    $watch: ReturnType<typeof vi.fn>;
};

function makeConfig(): ConsentConfig {
    return {
        version: '2026-10',
        cookie: { name: '__cookie_consent', versionName: '__cookie_consent_v', lifetimeDays: 365, domain: null, sameSite: 'Lax', secure: null },
        categories: [
            { key: 'necessary', required: true, label: 'Necessary', description: 'Required', cookies: [] },
            { key: 'analytics', required: false, label: 'Analytics', description: 'Stats', cookies: ['_ga'] },
            { key: 'marketing', required: false, label: 'Marketing', description: 'Ads', cookies: ['_gcl_au'] },
        ],
        texts: {
            title: 'title',
            description: 'description',
            policy: 'policy',
            acceptAll: 'Accept all',
            rejectAll: 'Reject all',
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
    };
}

/** `store(name)` returns the very object `store(name, value)` saved — mutations through the captured literal would be invisible to a real Alpine proxy, so the adapter must always re-read via `store(name)`. */
function fakeAlpine() {
    const stores = new Map<string, object>();
    const factories = new Map<string, (...args: never[]) => object>();
    const storeFn = vi.fn((name: string, value?: object) => {
        if (value === undefined) {
            return stores.get(name);
        }

        stores.set(name, { ...value });

        return undefined;
    });

    const alpine = {
        data: (name: string, factory: (...args: never[]) => object) => {
            factories.set(name, factory);
        },
        store: storeFn as unknown as AlpineLike['store'],
    } satisfies AlpineLike;

    return {
        alpine,
        store: () => stores.get('consent') as ConsentStore,
        banner: (): Banner => {
            const component = (factories.get('consentBanner') as () => object)() as Banner;
            component.$refs = {};
            component.$watch = vi.fn();

            return component;
        },
    };
}

function makeDialog(): DialogStub {
    const dialog: DialogStub = {
        open: false,
        showModal: vi.fn(() => {
            dialog.open = true;
        }),
        close: vi.fn(() => {
            dialog.open = false;
        }),
    };

    return dialog;
}

describe('registerConsent', () => {
    let happy: HappyWindow;
    let doc: Document;

    const load = async () => {
        vi.resetModules();

        return (await import('./index')).registerConsent;
    };

    const setup = async (config: ConsentConfig = makeConfig()) => {
        const registerConsent = await load();
        const fake = fakeAlpine();
        const manager = registerConsent(fake.alpine, config, { document: doc, window: happy as unknown as Window, log: false });

        return { ...fake, manager };
    };

    beforeEach(() => {
        vi.useFakeTimers();
        happy = new HappyWindow({ url: 'http://localhost:3000/' });
        doc = happy.document as unknown as Document;
    });

    afterEach(async () => {
        await happy.happyDOM.close();
        vi.useRealTimers();
    });

    it('exposes the texts and categories from config on the store (D14)', async () => {
        const { store } = await setup();

        expect(store().texts.acceptAll).toBe('Accept all');
        expect(store().categories[1].label).toBe('Analytics');
    });

    it('reflects the initial undecided state', async () => {
        const { store } = await setup();

        expect(store()).toMatchObject({ granted: ['necessary'], decided: false, promptOpen: true, settingsOpen: false });
        expect(store().has('necessary')).toBe(true);
        expect(store().has('analytics')).toBe(false);
    });

    it('registers a consentBanner factory that returns a fresh component per call', async () => {
        const { banner } = await setup();

        expect(banner()).not.toBe(banner());
        expect(banner().selection).not.toBe(banner().selection);
    });

    it('acceptAll() via the component updates the store through Alpine.store', async () => {
        const { banner, store } = await setup();
        const component = banner();

        expect(component.open).toBe(true);

        component.acceptAll();

        expect(store().granted).toEqual(['necessary', 'analytics', 'marketing']);
        expect(store().decided).toBe(true);
        expect(store().promptOpen).toBe(false);
        expect(component.open).toBe(false);
        expect(doc.cookie).toContain('__cookie_consent=necessary%2Canalytics%2Cmarketing');
    });

    it('rejectAll() keeps only required categories', async () => {
        const { banner, store } = await setup();

        banner().rejectAll();

        expect(store()).toMatchObject({ granted: ['necessary'], decided: true, promptOpen: false });
    });

    it('mirrors withdraw() back to an undecided store', async () => {
        const { store } = await setup();

        store().acceptAll();
        store().withdraw();

        expect(store()).toMatchObject({ granted: ['necessary'], decided: false, promptOpen: true });
    });

    it('dismissPrompt() hides the prompt without deciding', async () => {
        const { store } = await setup();

        store().dismissPrompt();

        expect(store()).toMatchObject({ decided: false, promptOpen: false });
    });

    it('mirrors a decision made outside the component (manager.sync from another tab)', async () => {
        const { store, manager } = await setup();

        doc.cookie = '__cookie_consent=necessary%2Canalytics; Path=/';
        doc.cookie = '__cookie_consent_v=2026-10; Path=/';
        manager.sync();

        expect(store()).toMatchObject({ granted: ['necessary', 'analytics'], decided: true, promptOpen: false });
    });

    it('starts the selection with optional keys off and required keys on', async () => {
        const { banner } = await setup();
        const component = banner();

        component.init();

        expect(component.selection).toEqual({ necessary: true, analytics: false, marketing: false });
        expect(component.isRequired('necessary')).toBe(true);
        expect(component.isRequired('analytics')).toBe(false);
    });

    it('starts the selection from the current grants once a decision exists', async () => {
        const { banner, manager } = await setup();

        manager.save(['analytics']);
        const component = banner();
        component.init();

        expect(component.selection).toEqual({ necessary: true, analytics: true, marketing: false });
    });

    it('toggle() flips optional categories and ignores required ones', async () => {
        const { banner } = await setup();
        const component = banner();
        component.init();

        component.toggle('analytics');
        component.toggle('necessary');

        expect(component.selection).toEqual({ necessary: true, analytics: true, marketing: false });

        component.toggle('analytics');

        expect(component.selection.analytics).toBe(false);
    });

    it('save() persists the selected keys, always including required ones', async () => {
        const { banner, store } = await setup();
        const component = banner();
        component.init();

        component.selection.analytics = true;
        component.save();

        expect(doc.cookie).toContain('__cookie_consent=necessary%2Canalytics');
        expect(doc.cookie).not.toContain('marketing');
        expect(store().granted).toEqual(['necessary', 'analytics']);
        expect(store().decided).toBe(true);
    });

    it('openSettings() opens the store and the settingsOpen watcher shows the dialog', async () => {
        const { banner, store } = await setup();
        const component = banner();
        const dialog = makeDialog();
        component.$refs.settings = dialog;
        component.init();

        const watcher = component.$watch.mock.calls[0];
        expect(watcher[0]).toBe('settingsOpen');

        component.openSettings();

        expect(store().settingsOpen).toBe(true);
        expect(component.settingsOpen).toBe(true);

        (watcher[1] as (open: boolean) => void)(true);

        expect(dialog.showModal).toHaveBeenCalledTimes(1);
        expect(dialog.open).toBe(true);
    });

    it('showDialog() does not reopen an already open dialog', async () => {
        const { banner } = await setup();
        const component = banner();
        const dialog = makeDialog();
        dialog.open = true;
        component.$refs.settings = dialog;

        component.showDialog();

        expect(dialog.showModal).not.toHaveBeenCalled();
    });

    it('closeSettings() closes the dialog via the watcher, restores focus and resets the selection', async () => {
        const { banner, store } = await setup();
        const component = banner();
        const dialog = makeDialog();
        const opener = doc.createElement('button');
        doc.body.appendChild(opener);
        opener.focus();
        component.$refs.settings = dialog;
        component.init();
        const watcher = component.$watch.mock.calls[0][1] as (open: boolean) => void;

        component.openSettings();
        watcher(true);
        component.toggle('analytics');
        expect(component.lastTrigger).toBe(opener);

        doc.body.appendChild(doc.createElement('input')).focus();
        component.closeSettings();

        expect(store().settingsOpen).toBe(false);

        watcher(false);

        expect(dialog.close).toHaveBeenCalledTimes(1);
        expect(dialog.open).toBe(false);
        expect(component.selection.analytics).toBe(false);
        expect(doc.activeElement).toBe(opener);
        expect(component.lastTrigger).toBeNull();
    });

    it('restores focus and refreshes the selection when settings are opened via the store (footer reopen control)', async () => {
        const { banner, store } = await setup();
        const component = banner();
        const dialog = makeDialog();
        const footerButton = doc.createElement('button');
        doc.body.appendChild(footerButton);
        footerButton.focus();
        component.$refs.settings = dialog;
        component.init();
        const watcher = component.$watch.mock.calls[0][1] as (open: boolean) => void;
        component.selection.analytics = true;

        store().openSettings();
        watcher(true);

        expect(dialog.showModal).toHaveBeenCalledTimes(1);
        expect(component.lastTrigger).toBe(footerButton);
        expect(component.selection.analytics).toBe(false);

        doc.body.appendChild(doc.createElement('input')).focus();
        component.closeSettings();
        watcher(false);

        expect(doc.activeElement).toBe(footerButton);
        expect(component.lastTrigger).toBeNull();
    });

    describe('opener and focus return (F21 / F22)', () => {
        const prepare = async () => {
            const env = await setup();
            const component = env.banner();
            const dialog = makeDialog();
            const prompt = doc.createElement('section');
            doc.body.appendChild(prompt);
            component.$refs.settings = dialog;
            component.$refs.prompt = prompt;
            component.init();
            const watcher = component.$watch.mock.calls[0][1] as (open: boolean) => void;

            return { ...env, component, dialog, prompt, watcher };
        };

        it('openSettings(el) takes the explicit opener although the body is focused (Safari)', async () => {
            const { component, watcher, prompt } = await prepare();
            const opener = doc.createElement('button');
            prompt.appendChild(opener);
            (doc.activeElement as HTMLElement).blur();

            component.openSettings(opener);
            watcher(true);

            expect(component.lastTrigger).toBe(opener);
        });

        it('openSettings(event) unwraps the currentTarget of a bare x-on:click="openSettings"', async () => {
            const { component, prompt } = await prepare();
            const opener = doc.createElement('button');
            prompt.appendChild(opener);

            component.openSettings({ currentTarget: opener } as unknown as Event);

            expect(component.lastTrigger).toBe(opener);
        });

        it('$store.consent.openSettings(el) hands the opener to the banner component', async () => {
            const { component, store, watcher } = await prepare();
            const footer = doc.createElement('button');
            doc.body.appendChild(footer);
            (doc.activeElement as HTMLElement).blur();

            store().openSettings(footer);
            watcher(true);

            expect(component.lastTrigger).toBe(footer);
        });

        it('returns focus to [data-consent-focus-return] when the decision hid the opener inside the prompt', async () => {
            const { component, store, watcher, prompt } = await prepare();
            const opener = doc.createElement('button');
            prompt.appendChild(opener);
            const footer = doc.createElement('button');
            footer.setAttribute('data-consent-focus-return', '');
            doc.body.appendChild(footer);

            component.openSettings(opener);
            watcher(true);
            component.save();
            expect(store().promptOpen).toBe(false);
            watcher(false);

            expect(doc.activeElement).toBe(footer);
        });

        it('returns focus to the hook when the opener sits under a [hidden] ancestor', async () => {
            const { component, watcher, prompt } = await prepare();
            const opener = doc.createElement('button');
            prompt.setAttribute('hidden', '');
            prompt.appendChild(opener);
            const footer = doc.createElement('button');
            footer.setAttribute('data-consent-focus-return', '');
            doc.body.appendChild(footer);

            component.openSettings(opener);
            watcher(true);
            watcher(false);

            expect(doc.activeElement).toBe(footer);
        });

        it('returns focus to the hook when the opener was removed from the document', async () => {
            const { component, watcher } = await prepare();
            const opener = doc.createElement('button');
            doc.body.appendChild(opener);
            const footer = doc.createElement('button');
            footer.setAttribute('data-consent-focus-return', '');
            doc.body.appendChild(footer);

            component.openSettings(opener);
            watcher(true);
            opener.remove();
            watcher(false);

            expect(doc.activeElement).toBe(footer);
        });

        it('leaves focus alone when the opener is gone and no hook exists', async () => {
            const { component, watcher } = await prepare();
            const opener = doc.createElement('button');
            doc.body.appendChild(opener);
            const bystander = doc.createElement('input');
            doc.body.appendChild(bystander);

            component.openSettings(opener);
            watcher(true);
            opener.remove();
            bystander.focus();
            watcher(false);

            expect(doc.activeElement).toBe(bystander);
        });

        it('still returns focus to a visible opener on cancel', async () => {
            const { component, watcher, prompt } = await prepare();
            const opener = doc.createElement('button');
            prompt.appendChild(opener);

            component.openSettings(opener);
            watcher(true);
            doc.body.appendChild(doc.createElement('input')).focus();
            component.closeSettings();
            watcher(false);

            expect(doc.activeElement).toBe(opener);
        });
    });

    it('closeSettings() is idempotent when the native close event follows a programmatic close', async () => {
        const { banner, store } = await setup();
        const component = banner();
        const dialog = makeDialog();
        component.$refs.settings = dialog;
        component.init();
        const watcher = component.$watch.mock.calls[0][1] as (open: boolean) => void;

        component.openSettings();
        watcher(true);
        component.closeSettings();
        watcher(false);
        // The dialog's native `close` event fires now, after the dialog is already closed.
        component.closeSettings();

        expect(store().settingsOpen).toBe(false);
        expect(dialog.close).toHaveBeenCalledTimes(1);
        expect(() => component.hideDialog()).not.toThrow();
    });

    it('closeSettings() from an Escape-closed dialog (no opener) does not throw', async () => {
        const { banner, store } = await setup();
        const component = banner();
        component.$refs.settings = makeDialog();
        component.init();

        store().openSettings();

        expect(() => component.closeSettings()).not.toThrow();
        expect(() => component.hideDialog()).not.toThrow();
    });

    it('saving from the settings dialog closes it', async () => {
        const { banner, store } = await setup();
        const component = banner();
        const dialog = makeDialog();
        component.$refs.settings = dialog;
        component.init();
        const watcher = component.$watch.mock.calls[0][1] as (open: boolean) => void;

        component.openSettings();
        watcher(true);
        component.selection.marketing = true;
        component.save();

        expect(store()).toMatchObject({ granted: ['necessary', 'marketing'], settingsOpen: false, promptOpen: false });

        watcher(false);

        expect(dialog.open).toBe(false);
        expect(component.selection).toEqual({ necessary: true, analytics: false, marketing: true });
    });

    it('focuses the prompt only the first time it opens per page lifetime', async () => {
        const { banner } = await setup();
        const first = banner();
        const second = banner();
        const prompt = { focus: vi.fn() };
        const again = { focus: vi.fn() };
        first.$refs.prompt = prompt;
        second.$refs.prompt = again;

        first.init();
        second.init();

        expect(prompt.focus).toHaveBeenCalledTimes(1);
        expect(again.focus).not.toHaveBeenCalled();
    });

    it('does not focus the prompt when a decision already exists', async () => {
        const { banner, manager } = await setup();
        manager.acceptAll();
        const component = banner();
        const prompt = { focus: vi.fn() };
        component.$refs.prompt = prompt;

        component.init();

        expect(prompt.focus).not.toHaveBeenCalled();
    });

    it('returns the manager', async () => {
        const { manager } = await setup();

        expect(manager.config.version).toBe('2026-10');
    });
});
