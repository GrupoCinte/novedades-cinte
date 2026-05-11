import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'cinte_ui_theme';

/** @typedef {'dark' | 'light'} UiTheme */

const UiThemeContext = createContext({
    theme: 'dark',
    setTheme: () => {},
    toggleTheme: () => {}
});

function readStoredTheme() {
    try {
        const v = String(localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
        if (v === 'light' || v === 'dark') return v;
    } catch {
        /* ignore */
    }
    return 'dark';
}

export function UiThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => readStoredTheme());

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            /* ignore */
        }
    }, [theme]);

    const setTheme = useCallback((/** @type {UiTheme} */ next) => {
        setThemeState(next === 'light' ? 'light' : 'dark');
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeState((t) => (t === 'light' ? 'dark' : 'light'));
    }, []);

    const value = useMemo(
        () => ({ theme, setTheme, toggleTheme }),
        [theme, setTheme, toggleTheme]
    );

    return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>;
}

export function useUiTheme() {
    return useContext(UiThemeContext);
}
