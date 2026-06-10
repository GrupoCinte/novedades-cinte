import { createContext, useCallback, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'cinte_ui_theme';
/** Evento mismo-tab para sincronizar tema entre shell y remotes MFE (contextos duplicados). */
export const CINTE_UI_THEME_EVENT = 'cinte-ui-theme-change';

/** @typedef {'dark' | 'light'} UiTheme */

const UiThemeContext = createContext(null);

function readStoredTheme() {
    try {
        const v = String(localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
        if (v === 'light' || v === 'dark') return v;
    } catch {
        /* ignore */
    }
    return 'dark';
}

let themeSnapshot = readStoredTheme();
const themeListeners = new Set();

function applyThemeToDocument(theme) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('cinte-ui-light', theme === 'light');
}

function notifyThemeListeners() {
    themeListeners.forEach((listener) => listener());
}

function publishTheme(next) {
    const t = next === 'light' ? 'light' : 'dark';
    if (themeSnapshot === t) {
        applyThemeToDocument(t);
        return;
    }
    themeSnapshot = t;
    try {
        localStorage.setItem(STORAGE_KEY, t);
    } catch {
        /* ignore */
    }
    applyThemeToDocument(t);
    notifyThemeListeners();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CINTE_UI_THEME_EVENT, { detail: t }));
    }
}

function subscribeTheme(onStoreChange) {
    themeListeners.add(onStoreChange);
    const onStorage = (event) => {
        if (event.key != null && event.key !== STORAGE_KEY) return;
        themeSnapshot = readStoredTheme();
        applyThemeToDocument(themeSnapshot);
        onStoreChange();
    };
    const onThemeEvent = () => {
        themeSnapshot = readStoredTheme();
        applyThemeToDocument(themeSnapshot);
        onStoreChange();
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('storage', onStorage);
        window.addEventListener(CINTE_UI_THEME_EVENT, onThemeEvent);
    }
    return () => {
        themeListeners.delete(onStoreChange);
        if (typeof window !== 'undefined') {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(CINTE_UI_THEME_EVENT, onThemeEvent);
        }
    };
}

function getThemeSnapshot() {
    return themeSnapshot;
}

/** Solo tests: reinicia store global entre casos. */
export function resetUiThemeForTests() {
    themeSnapshot = 'dark';
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
    applyThemeToDocument('dark');
    notifyThemeListeners();
}

if (typeof document !== 'undefined') {
    applyThemeToDocument(themeSnapshot);
}

export function useUiTheme() {
    const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 'dark');

    const setTheme = useCallback((/** @type {UiTheme} */ next) => {
        publishTheme(next);
    }, []);

    const toggleTheme = useCallback(() => {
        publishTheme(theme === 'light' ? 'dark' : 'light');
    }, [theme]);

    return useMemo(
        () => ({ theme, setTheme, toggleTheme }),
        [theme, setTheme, toggleTheme]
    );
}

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {boolean} [props.syncDocumentLightClass] — obsoleto; el documento siempre se sincroniza vía store global.
 */
export function UiThemeProvider({ children, syncDocumentLightClass: _syncDocumentLightClass = false }) {
    const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 'dark');

    const setTheme = useCallback((/** @type {UiTheme} */ next) => {
        publishTheme(next);
    }, []);

    const toggleTheme = useCallback(() => {
        publishTheme(theme === 'light' ? 'dark' : 'light');
    }, [theme]);

    const value = useMemo(
        () => ({ theme, setTheme, toggleTheme }),
        [theme, setTheme, toggleTheme]
    );

    return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>;
}
