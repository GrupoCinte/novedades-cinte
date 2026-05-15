import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ClipboardCheck, FileText, Palmtree } from 'lucide-react';
import UserAccountMenu from './UserAccountMenu.jsx';
import { buildCsrfHeaders } from './cognitoAuth.js';
import { useConsultorOutlet } from './useConsultorOutlet.js';
import { useUiTheme } from './UiThemeContext.jsx';

function resolveWelcomeName(me) {
  const u = me && typeof me === 'object' ? me : {};
  const name = String(u.name || '').trim();
  if (name) {
    const token = name.split(/\s+/)[0] || name;
    if (token.includes('@')) return token.split('@')[0] || 'Usuario';
    return token;
  }
  const email = String(u.email || '').trim().toLowerCase();
  if (email.includes('@')) return email.split('@')[0];
  return 'Usuario';
}

/** Tarjetas modo oscuro / claro (alineado visualmente con AdminPortalHome). */
function cardVisuals(key, isLight) {
  const map = {
    novedades: {
      dark: {
        shell:
          'border border-[#65BCF7]/18 bg-gradient-to-br from-[#2F7BB8]/10 via-[#0b2844]/18 to-[#04141E]/28 shadow-[0_8px_36px_-10px_rgba(0,0,0,0.35)] hover:border-[#65BCF7]/34 hover:shadow-[0_14px_48px_-8px_rgba(47,123,184,0.28)]',
        bar: 'bg-[#2F7BB8]/90',
        iconWrap: 'border border-[#65BCF7]/25 bg-[#2F7BB8]/14 text-[#a8dcff] backdrop-blur-md',
        title: 'text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] group-hover:text-[#a8dcff]',
        desc: 'text-slate-100/88 drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]',
        cta: 'text-[#a8dcff]'
      },
      light: {
        shell:
          'border border-sky-200/38 bg-gradient-to-br from-white/28 via-sky-50/22 to-blue-50/26 shadow-[0_8px_36px_-12px_rgba(14,116,188,0.12)] hover:border-sky-300/55 hover:shadow-[0_14px_44px_-10px_rgba(14,116,188,0.18)]',
        bar: 'bg-[#2F7BB8]',
        iconWrap: 'border border-sky-300/45 bg-sky-100/40 text-[#1e5a8a] backdrop-blur-md',
        title: 'text-slate-900 group-hover:text-[#2F7BB8]',
        desc: 'text-slate-700/92',
        cta: 'text-[#2F7BB8]'
      }
    },
    vacaciones: {
      dark: {
        shell:
          'border border-emerald-500/20 bg-gradient-to-br from-emerald-900/15 via-[#062018]/20 to-[#04141E]/28 shadow-[0_8px_36px_-10px_rgba(0,0,0,0.35)] hover:border-emerald-400/35 hover:shadow-[0_14px_48px_-8px_rgba(16,185,129,0.2)]',
        bar: 'bg-emerald-600/90',
        iconWrap: 'border border-emerald-400/25 bg-emerald-900/25 text-emerald-200 backdrop-blur-md',
        title: 'text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] group-hover:text-emerald-200',
        desc: 'text-slate-100/88',
        cta: 'text-emerald-200'
      },
      light: {
        shell:
          'border border-emerald-200/45 bg-gradient-to-br from-white/26 via-emerald-50/22 to-teal-50/22 shadow-[0_8px_36px_-12px_rgba(16,185,129,0.1)] hover:border-emerald-300/55 hover:shadow-[0_14px_44px_-10px_rgba(16,185,129,0.14)]',
        bar: 'bg-emerald-600',
        iconWrap: 'border border-emerald-300/50 bg-emerald-100/45 text-emerald-900 backdrop-blur-md',
        title: 'text-slate-900 group-hover:text-emerald-700',
        desc: 'text-slate-700/92',
        cta: 'text-emerald-700'
      }
    },
    examenes: {
      dark: {
        shell:
          'border border-violet-500/20 bg-gradient-to-br from-violet-900/15 via-[#1a1030]/20 to-[#04141E]/28 shadow-[0_8px_36px_-10px_rgba(0,0,0,0.35)] hover:border-violet-400/35',
        bar: 'bg-violet-600/90',
        iconWrap: 'border border-violet-400/25 bg-violet-900/25 text-violet-200 backdrop-blur-md',
        title: 'text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] group-hover:text-violet-200',
        desc: 'text-slate-100/88',
        cta: 'text-violet-200'
      },
      light: {
        shell:
          'border border-violet-200/45 bg-gradient-to-br from-white/26 via-violet-50/22 to-purple-50/20 shadow-[0_8px_36px_-12px_rgba(124,58,237,0.08)] hover:border-violet-300/55 hover:shadow-[0_14px_44px_-10px_rgba(124,58,237,0.12)]',
        bar: 'bg-violet-600',
        iconWrap: 'border border-violet-300/50 bg-violet-100/45 text-violet-900 backdrop-blur-md',
        title: 'text-slate-900 group-hover:text-violet-700',
        desc: 'text-slate-700/92',
        cta: 'text-violet-700'
      }
    },
    documentacion: {
      dark: {
        shell:
          'border border-amber-500/18 bg-gradient-to-br from-amber-900/12 via-[#2a2010]/18 to-[#04141E]/28 shadow-[0_8px_36px_-10px_rgba(0,0,0,0.35)] hover:border-amber-400/32',
        bar: 'bg-amber-600/90',
        iconWrap: 'border border-amber-400/25 bg-amber-900/20 text-amber-100 backdrop-blur-md',
        title: 'text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] group-hover:text-amber-100',
        desc: 'text-slate-100/88',
        cta: 'text-amber-100'
      },
      light: {
        shell:
          'border border-amber-200/45 bg-gradient-to-br from-white/28 via-amber-50/22 to-orange-50/18 shadow-[0_8px_36px_-12px_rgba(217,119,6,0.1)] hover:border-amber-300/55 hover:shadow-[0_14px_44px_-10px_rgba(217,119,6,0.12)]',
        bar: 'bg-amber-600',
        iconWrap: 'border border-amber-300/50 bg-amber-100/45 text-amber-950 backdrop-blur-md',
        title: 'text-slate-900 group-hover:text-amber-800',
        desc: 'text-slate-700/92',
        cta: 'text-amber-800'
      }
    }
  };
  const mode = isLight ? 'light' : 'dark';
  return map[key]?.[mode] || map.novedades[mode];
}

const MODULE_CARDS = [
  {
    key: 'novedades',
    title: 'Novedades',
    description: 'Radica solicitudes de novedades laborales.',
    path: '/consultor/novedades',
    CardIcon: Briefcase
  },
  {
    key: 'vacaciones',
    title: 'Ausencias y vacaciones',
    description: 'Consulta tu resumen y solicita ausencias o vacaciones desde un solo lugar.',
    path: '/consultor/vacaciones',
    CardIcon: Palmtree
  },
  {
    key: 'examenes',
    title: 'Exámenes y Evaluaciones',
    description: 'Evaluaciones y seguimiento de desempeño.',
    path: '/consultor/examenes-evaluaciones',
    CardIcon: ClipboardCheck
  },
  {
    key: 'documentacion',
    title: 'Documentación',
    description: 'Biblioteca de documentos y lineamientos.',
    path: '/consultor/documentacion',
    CardIcon: FileText
  }
];

export default function ConsultorPortalHome() {
  const navigate = useNavigate();
  const { me, refreshMe } = useConsultorOutlet();
  const { theme } = useUiTheme();
  const isLight = theme === 'light';
  const firstName = useMemo(() => resolveWelcomeName(me), [me]);

  const heroBgStyle = useMemo(
    () =>
      isLight
        ? {
            backgroundImage:
              'linear-gradient(135deg, rgba(248,250,252,0.94) 0%, rgba(224,242,254,0.82) 100%), url(/assets/banner-cinte-admin.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed'
          }
        : {
            backgroundImage:
              'linear-gradient(135deg, rgba(4,20,30,0.88) 0%, rgba(0,77,135,0.55) 100%), url(/assets/banner-cinte-admin.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed'
          },
    [isLight]
  );

  const onLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: buildCsrfHeaders({})
      });
    } catch {
      /* ignore */
    }
    await refreshMe();
    navigate('/', { replace: true });
  }, [navigate, refreshMe]);

  const auth = useMemo(() => ({ user: me, claims: me }), [me]);

  const ringCard = isLight ? 'ring-slate-200/80' : 'ring-white/[0.1]';

  return (
    <section
      className={`relative flex min-h-[100dvh] min-h-screen w-full flex-col overflow-x-hidden overflow-y-auto font-body ${
        isLight ? 'text-slate-800' : 'text-slate-200'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 z-0" style={heroBgStyle} aria-hidden />
      <div
        className={`pointer-events-none absolute inset-0 z-0 backdrop-blur-[2px] ${
          isLight ? 'bg-white/45' : 'bg-[#04141E]/40'
        }`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute inset-0 z-0 bg-gradient-to-t ${
          isLight ? 'from-slate-200/85 via-white/25 to-transparent' : 'from-black/80 via-black/20 to-transparent'
        }`}
        aria-hidden
      />

      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col px-3 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 md:px-10">
        {/*
          Móvil: menú (hamburguesa) anclado arriba a la derecha; logo centrado con padding lateral para no solaparse.
          md+: misma fila que antes (logo + menú expandido).
        */}
        <header className="relative shrink-0 md:flex md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="absolute right-0 top-0 z-30 md:static md:z-auto md:order-2 md:shrink-0 md:self-start md:pt-0.5">
            <UserAccountMenu
              auth={auth}
              onLogout={onLogout}
              surface="banner"
              notificationCount={0}
              collapseToolbarOnMobile
            />
          </div>
          <div className="flex min-w-0 flex-col items-center gap-2 px-11 text-center sm:px-14 md:order-1 md:px-0 md:pt-0.5">
            {/*
              Misma caja que AdminPortalHome; el PNG claro suele llevar más «aire» en el lienzo → object-contain lo deja más chico.
              En tema claro un scale compensa para igualar el tamaño visual al logo oscuro.
            */}
            <div className="mx-auto flex h-[4.35rem] w-[min(100%,11.875rem)] max-w-full items-center justify-center overflow-visible px-1 py-1 sm:h-[4.65rem] sm:w-[min(100%,13.125rem)] sm:px-1.5 sm:py-1.5 md:h-[5rem] md:w-[min(100%,14.375rem)]">
              <img
                src={isLight ? '/assets/logo-cinte-header-light.png' : '/assets/logo-cinte-header.png'}
                alt="CINTE"
                className={`h-full w-full object-contain object-center drop-shadow-lg ${
                  isLight ? 'origin-center scale-[1.72] sm:scale-[1.63] md:scale-[1.55]' : ''
                }`}
              />
            </div>
            <p
              className={`w-full max-w-[min(100%,280px)] shrink-0 font-heading text-[10px] font-extrabold uppercase leading-snug tracking-wide drop-shadow-md sm:text-xs ${
                isLight ? 'text-[#004D87]' : 'text-white'
              }`}
            >
              Portal Consultores y Staff
            </p>
          </div>
        </header>

        {/*
          Sin justify-center en móvil: si el contenido es alto, centrar el bloque entero subía el saludo y se montaba sobre el encabezado.
        */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-3 py-5 text-center sm:gap-4 sm:py-8 md:justify-center md:py-10">
          <h1
            className={`w-full font-heading text-2xl font-extrabold drop-shadow-md sm:text-3xl md:text-4xl ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            {`¡Bienvenid@, ${firstName}!`}
          </h1>
          <h2
            className={`w-full text-center font-heading text-[10px] font-black uppercase tracking-[0.2em] drop-shadow-md sm:text-xs ${
              isLight ? 'text-[#004D87]' : 'text-white'
            }`}
          >
            Módulos
          </h2>
          <div className="mx-auto flex w-full max-w-6xl flex-col items-stretch gap-3 px-1 pb-1 sm:gap-4 md:flex-row md:flex-nowrap md:items-stretch md:justify-center md:gap-3">
            {MODULE_CARDS.map((card) => {
              const v = cardVisuals(card.key, isLight);
              const IconEl = card.CardIcon;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => navigate(card.path)}
                  className={`group relative mx-auto flex h-auto w-full max-w-md flex-col items-center overflow-hidden rounded-xl px-3 py-3 text-center shadow-lg backdrop-blur-3xl backdrop-saturate-150 transition-all duration-200 hover:-translate-y-0.5 sm:rounded-2xl sm:px-4 sm:py-4 md:mx-0 md:max-w-sm md:flex-1 md:basis-0 md:min-w-0 md:py-5 ring-1 ring-inset [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.05)] ${ringCard} ${v.shell}`}
                >
                  <span
                    className={`absolute left-0 top-0 h-full w-1 rounded-l-xl sm:w-1.5 sm:rounded-l-2xl ${v.bar}`}
                    aria-hidden
                  />
                  <div className="flex w-full flex-col items-center px-1 sm:px-2">
                    <div
                      className={`mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border sm:mb-3 sm:h-12 sm:w-12 sm:rounded-xl md:h-14 md:w-14 ${v.iconWrap}`}
                    >
                      <IconEl size={24} strokeWidth={1.75} className="opacity-95" />
                    </div>
                    <h3
                      className={`line-clamp-2 w-full font-heading text-sm font-bold leading-tight sm:text-base md:text-lg ${v.title}`}
                    >
                      {card.title}
                    </h3>
                    <p
                      className={`mt-1 line-clamp-4 w-full text-[11px] leading-snug sm:mt-2 sm:text-xs md:text-sm ${v.desc}`}
                    >
                      {card.description}
                    </p>
                    <span
                      className={`mt-3 shrink-0 text-[9px] font-bold uppercase tracking-wide sm:mt-4 sm:text-[10px] md:text-xs ${v.cta}`}
                    >
                      Entrar →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
