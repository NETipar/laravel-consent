import { getCurrentScope, inject, onScopeDispose, type Ref, shallowRef } from 'vue';
import {
    type ConsentCategory,
    ConsentError,
    type ConsentManager,
    type ConsentTexts,
} from '@netipar/consent-core';
import { type OpenerArgument, pendingOpeners, toElement } from './opener';
import { ConsentKey } from './plugin';

export interface UseConsent {
    manager: ConsentManager;
    /** D14: strings resolved server-side for the request locale. */
    texts: ConsentTexts;
    categories: ConsentCategory[];
    granted: Ref<readonly string[]>;
    decided: Ref<boolean>;
    promptOpen: Ref<boolean>;
    settingsOpen: Ref<boolean>;
    has: (category: string) => boolean;
    acceptAll: () => void;
    rejectAll: () => void;
    save: (categories: string[]) => void;
    withdraw: () => void;
    /** `opener`: the control that opened the dialog (`$event.currentTarget`) — focus returns to it; Safari does not focus clicked buttons. */
    openSettings: (opener?: OpenerArgument) => void;
    closeSettings: () => void;
    dismissPrompt: () => void;
}

/**
 * Reactive view of the consent manager provided by `createConsentPlugin`.
 * Subscriptions are released with the calling effect scope.
 */
export function useConsent(): UseConsent {
    const manager = inject(ConsentKey, null);

    if (manager === null) {
        throw new ConsentError('consent: install createConsentPlugin first');
    }

    const state = manager.state();
    const ui = manager.ui();

    const granted = shallowRef<readonly string[]>(state.granted);
    const decided = shallowRef(state.decided);
    const promptOpen = shallowRef(ui.promptOpen);
    const settingsOpen = shallowRef(ui.settingsOpen);

    const refreshState = (): void => {
        const current = manager.state();

        granted.value = current.granted;
        decided.value = current.decided;
    };

    const detachers = [
        manager.onChange(refreshState),
        manager.onUi((next) => {
            promptOpen.value = next.promptOpen;
            settingsOpen.value = next.settingsOpen;
            refreshState();
        }),
    ];

    if (getCurrentScope()) {
        onScopeDispose(() => detachers.forEach((detach) => detach()));
    }

    return {
        manager,
        texts: manager.config.texts,
        categories: manager.config.categories,
        granted,
        decided,
        promptOpen,
        settingsOpen,
        has: (category) => manager.has(category),
        acceptAll: () => manager.acceptAll(),
        rejectAll: () => manager.rejectAll(),
        save: (categories) => manager.save(categories),
        withdraw: () => manager.withdraw(),
        openSettings: (opener) => {
            const element = toElement(opener);

            if (element) {
                pendingOpeners.set(manager, element);
            }

            manager.openSettings();
        },
        closeSettings: () => manager.closeSettings(),
        dismissPrompt: () => manager.dismissPrompt(),
    };
}
