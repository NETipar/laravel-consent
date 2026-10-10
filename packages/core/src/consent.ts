import { expireEverywhere } from './cookies';
import { Emitter } from './emitter';
import { activateGatedScripts } from './gatedScripts';
import { attachGoogle } from './google';
import { attachLog } from './log';
import { purgeCategoryCookies } from './purge';
import { readState, undecidedState, writeState } from './state';
import { CHANGE_EVENT, ConsentError } from './types';
import type {
    ConsentAction,
    ConsentChangeListener,
    ConsentConfig,
    ConsentManager,
    ConsentState,
    ConsentUi,
    ConsentUiListener,
    CreateConsentOptions,
} from './types';

function sameDecision(a: ConsentState, b: ConsentState): boolean {
    return a.decided === b.decided && a.granted.join(',') === b.granted.join(',');
}

function freezeState(state: ConsentState): ConsentState {
    return Object.freeze({ ...state, granted: Object.freeze([...state.granted]) });
}

/**
 * Create the consent state machine for one page lifetime.
 *
 * Transition order (PLAN §3.5, D23): write consent cookies → purge the cookies
 * of removed categories → `onChange` (Google, then log, then app listeners) +
 * `consent:change` → gated scripts → reload-on-revoke on `setTimeout(0)`.
 * `sync()` applies the same purge + reload rule to changes made in another tab (D37).
 */
export function createConsent(config: ConsentConfig, options: CreateConsentOptions = {}): ConsentManager {
    const doc = options.document ?? (typeof document === 'undefined' ? undefined : document);

    if (doc === undefined) {
        throw new ConsentError('consent: no document available');
    }

    const win: Window | null = options.window ?? doc.defaultView ?? (typeof window === 'undefined' ? null : window);
    const customWriter = options.writeCookie;
    const write = customWriter ? (cookieString: string) => customWriter(doc, cookieString) : undefined;
    const gatedScriptsEnabled = options.gatedScripts !== false;

    const changeListeners = new Emitter<Parameters<ConsentChangeListener>>();
    const uiListeners = new Emitter<Parameters<ConsentUiListener>>();
    const loadedCategories = new Set<string>();
    const detachers: Array<() => void> = [];

    let current = freezeState(readState(config, doc, write));
    let ui: ConsentUi = { promptOpen: !current.decided, settingsOpen: false };
    /** `dismissPrompt()` for this page view; a plain variable, reset only by a full page load or an explicit transition. */
    let dismissed = false;

    const findCategory = (key: string) => config.categories.find((category) => category.key === key);

    const setUi = (next: ConsentUi): void => {
        if (next.promptOpen === ui.promptOpen && next.settingsOpen === ui.settingsOpen) {
            return;
        }

        ui = next;
        uiListeners.emit({ ...ui });
    };

    const notify = (next: ConsentState, previous: ConsentState, action: ConsentAction): void => {
        changeListeners.emit(next, previous, action);

        const EventConstructor = doc.defaultView?.CustomEvent ?? CustomEvent;
        doc.dispatchEvent(new EventConstructor(CHANGE_EVENT, { detail: { state: next, previous, action } }));
    };

    const activate = (root: ParentNode): void => {
        if (gatedScriptsEnabled) {
            activateGatedScripts(manager, root);
        }
    };

    const reload = (): void => {
        if (options.reload) {
            options.reload();

            return;
        }

        win?.location.reload();
    };

    /** D23: purge the cookies of every category granted in `previous` but not in `next`; returns the removed keys. */
    const purgeRemoved = (previous: ConsentState, next: ConsentState): string[] => {
        const removed = previous.granted.filter((key) => !next.granted.includes(key));

        for (const key of removed) {
            const category = findCategory(key);

            if (category) {
                purgeCategoryCookies(doc, category, write);
            }
        }

        return removed;
    };

    /** D23/D37: loaded third-party code cannot be unloaded → reload after listeners finish. */
    const reloadIfLoadedRevoked = (removed: readonly string[]): void => {
        if (config.reloadOnRevoke && removed.some((key) => loadedCategories.has(key))) {
            setTimeout(reload, 0);
        }
    };

    const transition = (granted: readonly string[] | null, action: ConsentAction): void => {
        const previous = current;
        let next: ConsentState;

        if (granted === null) {
            expireEverywhere(doc, config.cookie.name, config.cookie.domain);
            expireEverywhere(doc, config.cookie.versionName, config.cookie.domain);
            next = undecidedState(config, null);
        } else {
            next = writeState(config, doc, granted);
        }

        const removed = purgeRemoved(previous, next);

        current = freezeState(next);
        dismissed = false;
        setUi({ promptOpen: !current.decided, settingsOpen: false });

        if (!sameDecision(previous, current)) {
            notify(current, previous, action);
        }

        activate(doc);
        reloadIfLoadedRevoked(removed);
    };

    const onNavigated = (): void => manager.sync();

    const onVisibilityChange = (): void => {
        if (doc.visibilityState === 'visible') {
            manager.sync();
        }
    };

    const onPageShow = (event: Event): void => {
        if ((event as PageTransitionEvent).persisted) {
            manager.sync();
        }
    };

    const manager: ConsentManager = {
        config,

        state: () => current,

        ui: () => ({ ...ui }),

        has(category: string): boolean {
            const known = findCategory(category);

            if (!known) {
                throw new ConsentError(`consent: unknown category "${category}"`);
            }

            return known.required || current.granted.includes(category);
        },

        hasDecision: () => current.decided,

        acceptAll(): void {
            transition(config.categories.map((category) => category.key), 'accept_all');
        },

        rejectAll(): void {
            transition([], 'reject_all');
        },

        save(categories: readonly string[]): void {
            transition(categories, 'save');
        },

        withdraw(): void {
            transition(null, 'withdraw');
        },

        openSettings(): void {
            setUi({ ...ui, settingsOpen: true });
        },

        closeSettings(): void {
            setUi({ ...ui, settingsOpen: false });
        },

        dismissPrompt(): void {
            dismissed = true;
            setUi({ ...ui, promptOpen: false });
        },

        onChange: (listener) => changeListeners.add(listener),

        onUi: (listener) => uiListeners.add(listener),

        sync(root?: ParentNode): void {
            const previous = current;
            const next = readState(config, doc, write);
            // D37: a revoke made in another tab is handled like a local one — purge, then reload if loaded here.
            const removed = purgeRemoved(previous, next);

            current = freezeState(next);
            setUi({ ...ui, promptOpen: !current.decided && !dismissed });

            if (!sameDecision(previous, current)) {
                notify(current, previous, 'sync');
            }

            activate(root ?? doc);
            reloadIfLoadedRevoked(removed);
        },

        markLoaded(category: string): void {
            loadedCategories.add(category);
        },

        destroy(): void {
            doc.removeEventListener('livewire:navigated', onNavigated);
            doc.removeEventListener('visibilitychange', onVisibilityChange);
            win?.removeEventListener('pageshow', onPageShow);

            for (const detach of detachers.splice(0)) {
                detach();
            }

            changeListeners.clear();
            uiListeners.clear();
        },
    };

    if (options.google !== false && config.google !== null) {
        detachers.push(attachGoogle(manager, win ?? undefined));
    }

    if (options.log !== false && config.log !== null) {
        detachers.push(attachLog(manager, options));
    }

    if (options.syncOnLivewireNavigate !== false) {
        doc.addEventListener('livewire:navigated', onNavigated);
    }

    if (options.syncOnVisibility !== false) {
        doc.addEventListener('visibilitychange', onVisibilityChange);
        win?.addEventListener('pageshow', onPageShow);
    }

    activate(doc);

    return manager;
}
