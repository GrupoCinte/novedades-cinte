import { ArrowLeft, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUiTheme } from '../../UiThemeContext.jsx';

const PORTAL_BACKGROUND = {
  backgroundImage:
    'linear-gradient(135deg, rgba(248,250,252,0.94) 0%, rgba(224,242,254,0.82) 100%), url(/assets/banner-cinte-admin.png)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundAttachment: 'fixed'
};

const PORTAL_BACKGROUND_DARK = {
  backgroundImage:
    'linear-gradient(135deg, rgba(4,20,30,0.88) 0%, rgba(0,77,135,0.55) 100%), url(/assets/banner-cinte-admin.png)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundAttachment: 'fixed'
};

/**
 * Punto de entrada del módulo consultor de actividades.
 *
 * La estructura queda aislada para incorporar posteriormente las vistas de
 * registro, consulta y seguimiento de tiempo sin alterar el hub consultor.
 */
export default function MisActividadesModule() {
  const { theme } = useUiTheme();
  const isLight = theme === 'light';

  return (
    <section
      className={`relative flex min-h-[100dvh] min-h-screen w-full flex-col overflow-x-hidden overflow-y-auto font-body ${
        isLight ? 'text-slate-800' : 'text-slate-200'
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={isLight ? PORTAL_BACKGROUND : PORTAL_BACKGROUND_DARK}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute inset-0 z-0 backdrop-blur-[1px] ${
          isLight ? 'bg-white/50' : 'bg-[#04141E]/50'
        }`}
        aria-hidden
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div
          className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl backdrop-blur-md sm:p-10 ${
            isLight
              ? 'border-slate-200 bg-white/95 text-slate-800'
              : 'border-white/15 bg-[#04141E]/85 text-slate-200'
          }`}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className={`mb-5 flex h-14 w-14 items-center justify-center rounded-xl border sm:h-16 sm:w-16 ${
                isLight
                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                  : 'border-[#65BCF7]/25 bg-[#2F7BB8]/14 text-[#a8dcff]'
              }`}
            >
              <Clock3 className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.75} aria-hidden />
            </div>

            <h1
              className={`font-heading text-2xl font-extrabold sm:text-3xl ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              Mis actividades
            </h1>
            <p
              className={`mt-3 max-w-xl text-sm leading-relaxed sm:text-base ${
                isLight ? 'text-slate-600' : 'text-[#9fb3c8]'
              }`}
            >
              Este módulo será el punto de entrada para gestionar tus actividades y tu tiempo de trabajo.
            </p>

            <Link
              to="/consultor"
              className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2F7BB8] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#25649a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#65BCF7]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver al portal consultor
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
