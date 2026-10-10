export { createConsent } from './consent';
export { readConsentConfig } from './config';
export { activateGatedScripts } from './gatedScripts';
export { attachGoogle } from './google';
export { attachLog } from './log';
export { purgeCategoryCookies } from './purge';
export { readState } from './state';
export { CHANGE_EVENT, ConsentError, LOG_FAILED_EVENT } from './types';
export type {
    ConsentAction,
    ConsentCategory,
    ConsentConfig,
    ConsentManager,
    ConsentState,
    ConsentTexts,
    ConsentUi,
    CookieTableCategory,
    CookieTableEntry,
    CreateConsentOptions,
    GoogleSignal,
    GoogleTag,
} from './types';
