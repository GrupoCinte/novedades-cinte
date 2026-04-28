import { useUiTheme } from './UiThemeContext.jsx';

/**
 * Clases compartidas para módulos admin (shell + sidebars + lienzo principal).
 * Usar `useModuleTheme()` en la raíz de cada módulo y combinar con `className`.
 */
export function useModuleTheme() {
    const { theme, setTheme, toggleTheme } = useUiTheme();
    const L = theme === 'light';

    return {
        theme,
        setTheme,
        toggleTheme,
        isLight: L,
        /** Contenedor raíz del módulo */
        shell: L
            ? 'flex h-full w-full overflow-hidden font-body bg-slate-100 text-slate-800'
            : 'flex h-full w-full overflow-hidden font-body bg-[#04141E] text-slate-200',
        /** Panel lateral (móvil y escritorio): fondo + borde derecho */
        aside: L
            ? 'bg-white border-r border-slate-200 shadow-xl text-slate-800'
            : 'bg-[#0b1e30] border-r border-[#1a3a56]/50 shadow-2xl',
        asideHeaderBorder: L ? 'border-b border-slate-200' : 'border-b border-[#1a3a56]/50',
        asideFooterBorder: L ? 'border-t border-slate-200' : 'border-t border-[#1a3a56]/50',
        scrim: L ? 'bg-black/30' : 'bg-black/50',
        /** Botón flotante menú hamburguesa */
        menuFab: L
            ? 'rounded-lg bg-white border border-slate-300 text-slate-800 shadow-lg hover:bg-slate-50'
            : 'rounded-lg bg-[#0b1e30] border border-[#1a3a56] text-slate-200 shadow-lg',
        /** Botón cerrar / chevron en cabecera del sidebar */
        sidebarIconBtn: L
            ? 'rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
            : 'rounded-lg bg-[#04141E] border border-[#1a3a56] text-slate-300 hover:text-white hover:bg-[#0f2942]/60',
        /** “Inicio portal” u outline neutro */
        navOutline: L
            ? 'rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100'
            : 'rounded-xl border border-[#1a3a56]/60 text-slate-400 hover:text-slate-200 hover:bg-[#0f2942]/50',
        email: L ? 'text-slate-600' : 'text-slate-300',
        /** Lienzo principal (área de trabajo) */
        mainCanvas: L
            ? 'flex-1 min-w-0 min-h-0 overflow-y-auto bg-slate-100 text-slate-800'
            : 'flex-1 min-w-0 min-h-0 overflow-y-auto bg-[#04141E] text-slate-200',
        /** Cabecera superior tipo directorio */
        topBar: L ? 'border-b border-slate-200 bg-white/90' : 'border-b border-[#1a3a56] bg-[#04141E]/90',
        /** Fondo del área de trabajo (sin flex; combinar con padding del módulo) */
        canvasBg: L ? 'bg-slate-100 text-slate-800' : 'bg-[#04141E] text-slate-200',
        /** Ítems de nav lateral inactivos (sin activo) */
        navInactive: L ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-[#0f2942]/60',
        /** Separador sutil pie de bloque en sidebar */
        borderSubtle: L ? 'border-slate-200' : 'border-slate-700/50',
        /** inputs / selects en formularios de módulo */
        field: L
            ? 'rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/40'
            : 'rounded border border-[#1a3a56] bg-[#04141E] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#2F7BB8] focus:outline-none focus:ring-1 focus:ring-[#2F7BB8]/40',
        /** Campo en modo manual (cotizador) */
        fieldManual: L
            ? 'w-full rounded border border-amber-500/50 bg-amber-50/40 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30'
            : 'w-full rounded border border-amber-500/40 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/25',
        labelMuted: L ? 'text-slate-500' : 'text-[#9fb3c8]',
        headingAccent: L ? 'text-sky-700' : 'text-[#65BCF7]',
        /** Nav tipo Directorio (acento cyan) */
        navAccentActive: L
            ? 'bg-sky-600 text-white shadow-[0_4px_12px_rgba(2,132,199,0.25)]'
            : 'bg-[#65BCF7] text-[#04141E] shadow-[0_4px_12px_rgba(101,188,247,0.25)]',
        navAccentInactive: L
            ? 'border border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            : 'border border-transparent text-slate-300 hover:bg-[#0f2942]/60 hover:text-white',
        /** Botón secundario en pie de sidebar (ej. cambiar clave) */
        sidebarActionBtn: L
            ? 'rounded-lg border border-slate-200 px-3 py-2 text-xs font-body font-semibold text-slate-700 transition-all hover:bg-slate-100'
            : 'rounded-lg border border-[#1a3a56] px-3 py-2 text-xs font-body font-semibold text-slate-300 transition-all hover:bg-[#0f2942]/60 hover:text-white',
        /** Tarjeta / panel principal (cotizador, bloques similares) */
        cardPanel: L
            ? 'rounded-xl border border-slate-200 bg-white p-4 font-body text-slate-800'
            : 'rounded-xl border border-[#1a3a56] bg-[#0b1e30] p-4 font-body text-slate-200',
        /** Bloque anidado dentro de un panel */
        subPanel: L
            ? 'rounded border border-slate-200 bg-slate-50 p-3 text-slate-800'
            : 'rounded border border-[#1a3a56] bg-[#04141E]/50 p-3 text-slate-200',
        /** Fila o bloque con fondo intermedio (tablas, perfiles) */
        insetWell: L
            ? 'rounded-lg border border-slate-200 bg-slate-100/80'
            : 'rounded-lg border border-slate-600 bg-slate-900/50',
        /** Contenedor de sección tipo cotizador (página completa) */
        cotizadorCanvas: L
            ? 'h-full w-full bg-slate-100 text-slate-800 p-4 md:p-6 overflow-y-auto pb-8 font-body'
            : 'h-full w-full bg-[#0f172a] text-slate-200 p-4 md:p-6 overflow-y-auto pb-8 font-body',
        ghostBtn: L
            ? 'rounded border border-slate-300 px-3 py-2 text-slate-700 transition-colors hover:bg-slate-200'
            : 'rounded border border-slate-600 px-3 py-2 text-slate-200 transition-colors hover:bg-slate-800',
        tableHeadRow: L ? 'border-b border-slate-200 text-slate-500' : 'border-b border-slate-700 text-slate-400',
        tableBodyRow: L ? 'border-b border-slate-200 text-slate-800' : 'border-b border-slate-800 text-slate-200',
        panelTitle: L ? 'font-heading font-bold text-slate-900' : 'font-heading font-bold text-white',
        /** Contenedor de tabla tipo directorio */
        tableSurface: L
            ? 'overflow-x-auto rounded-lg border border-slate-200 bg-white'
            : 'overflow-x-auto rounded-lg border border-[#1a3a56]',
        tableThead: L ? 'bg-slate-100 text-slate-600' : 'bg-[#0b1e30] text-[#9fb3c8]',
        tableRowBorder: L ? 'border-t border-slate-200' : 'border-t border-[#1a3a56]',
        /** Barra secundaria (paginación, resumen) */
        barInset: L
            ? 'rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-600'
            : 'rounded-lg border border-[#1a3a56] bg-[#0b1e30]/40 px-3 py-2 text-xs text-[#9fb3c8]',
        /** Botón secundario compacto (paginación) */
        compactBtn: L
            ? 'rounded border border-slate-300 px-3 py-1 text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40'
            : 'rounded border border-[#1a3a56] px-3 py-1 transition-colors hover:bg-[#0f2942]/60 disabled:opacity-40',
        /** Botón “muted” (ej. ordenar) */
        softBtn: L
            ? 'rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-slate-100'
            : 'rounded-md border border-[#1a3a56] px-2 py-1 text-xs font-semibold text-[#65BCF7] hover:bg-[#0f2942]/80',
        /** Acción outline (cancelar en modal) */
        outlineBtn: L
            ? 'rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50'
            : 'rounded-md border border-[#1a3a56] px-4 py-2 text-sm text-slate-200 hover:bg-[#0f2942]/50',
        /** Botón barra de filtros / secundario relleno */
        toolbarBtn: L
            ? 'rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800 hover:bg-slate-200'
            : 'rounded-md border border-[#1a3a56] bg-[#0f2942] px-3 py-2 text-sm text-slate-200 hover:bg-[#0f2942]/80',
    };
}

/**
 * Login, recuperación y cambio de contraseña (sobre `main` con tema global).
 */
export function useAuthSurface() {
    const { theme } = useUiTheme();
    const L = theme === 'light';

    return {
        isLight: L,
        loginGradient: L
            ? "linear-gradient(135deg, rgba(248,250,252,0.94) 0%, rgba(186,230,253,0.82) 100%), url('/img/bg-login-cinte.png')"
            : "linear-gradient(135deg, rgba(4,20,30,0.65) 0%, rgba(0,77,135,0.45) 100%), url('/img/bg-login-cinte.png')",
        loginScrim: L
            ? 'pointer-events-none absolute inset-0 bg-white/40 backdrop-blur-[2px]'
            : 'pointer-events-none absolute inset-0 bg-[#04141E]/25 backdrop-blur-[2px]',
        loginCard: L
            ? 'relative max-h-[min(100dvh-2rem,calc(100vh-2rem))] w-full max-w-md overflow-hidden overflow-y-auto rounded-2xl border border-sky-200/90 bg-white/93 p-8 font-body text-slate-900 shadow-xl ring-1 ring-slate-200/70 backdrop-blur-2xl backdrop-saturate-150 md:p-12'
            : 'relative max-h-[min(100dvh-2rem,calc(100vh-2rem))] w-full max-w-md overflow-hidden overflow-y-auto rounded-2xl border border-[#65BCF7]/50 bg-[#04141E]/22 p-8 font-body shadow-[0_0_32px_rgba(101,188,247,0.28),0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-[#65BCF7]/25 backdrop-blur-2xl backdrop-saturate-150 md:p-12',
        authCard: L
            ? 'bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl p-8 md:p-12 w-full max-w-md shadow-xl relative overflow-hidden font-body text-slate-900'
            : 'bg-[#04141E]/90 backdrop-blur-xl border border-[#1a3a56] rounded-2xl p-8 md:p-12 w-full max-w-md shadow-2xl relative overflow-hidden font-body',
        authInput: L
            ? 'w-full bg-white border border-slate-300 text-slate-900 p-3 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 transition-all placeholder:text-slate-400 [color-scheme:light]'
            : 'w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 rounded-xl focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a]',
        authInputTight: L
            ? 'w-full bg-white border border-slate-300 text-slate-900 p-3 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 transition-all placeholder:text-slate-400 [color-scheme:light]'
            : 'w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 rounded-lg focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a]',
        authLabel: L
            ? 'text-xs font-bold text-slate-600 uppercase tracking-wider font-body'
            : 'text-xs font-bold text-[#9fb3c8] uppercase tracking-wider font-body',
        authTitle: L
            ? 'font-heading text-xl font-bold text-slate-900 md:text-2xl'
            : 'font-heading text-xl font-bold text-white md:text-2xl',
        authSubtitle: L
            ? 'text-slate-600 text-sm font-subtitle font-extralight'
            : 'text-[#9fb3c8] text-sm font-subtitle font-extralight',
        eyeBtn: L ? 'text-slate-500 hover:text-slate-800' : 'text-[#9fb3c8] hover:text-white',
        authIconTile: L
            ? 'bg-sky-50 border border-sky-200 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4'
            : 'bg-[#0b1e30]/80 border border-[#1a3a56] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
        challengePanel: L
            ? 'mt-2 p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-3'
            : 'mt-2 p-4 rounded-xl border border-[#1a3a56] bg-[#0b1e30]/60 flex flex-col gap-3',
        challengeHeading: L ? 'text-sm text-slate-700 font-semibold font-subtitle' : 'text-sm text-[#9fb3c8] font-semibold font-subtitle',
        linkAccent: L ? 'text-sm text-sky-700 hover:underline font-body' : 'text-sm text-[#65BCF7] hover:underline font-body',
        backLink: L ? 'text-sm text-slate-600 hover:text-slate-900 flex items-center gap-2' : 'text-sm text-[#9fb3c8] hover:text-white flex items-center gap-2',
        msgBox: L
            ? 'bg-slate-100 border border-slate-300 text-slate-700 text-sm p-3 rounded-lg'
            : 'bg-[#1a2b3b] border border-[#1a3a56] text-[#9fb3c8] text-sm p-3 rounded-lg',
        h1Card: L ? 'text-2xl font-bold text-slate-900 mb-2 font-heading' : 'text-2xl font-bold text-white mb-2 font-heading',
        userIcon: L ? 'text-slate-500' : 'text-[#4a6f8f]',
        lockIcon: L ? 'text-slate-500' : 'text-[#466683]',
    };
}
