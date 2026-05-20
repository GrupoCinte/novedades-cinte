import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useUiTheme } from './UiThemeContext.jsx';

export default function ConsultorModulePlaceholder({ title }) {
  const { theme } = useUiTheme();
  const isLight = theme === 'light';

  const heroStyle = isLight
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
      };

  return (
    <section
      className={`relative flex min-h-[100dvh] min-h-screen w-full flex-col overflow-x-hidden overflow-y-auto font-body ${
        isLight ? 'text-slate-800' : 'text-slate-200'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 z-0" style={heroStyle} aria-hidden />
      <div
        className={`pointer-events-none absolute inset-0 z-0 backdrop-blur-[1px] ${
          isLight ? 'bg-white/50' : 'bg-[#04141E]/50'
        }`}
        aria-hidden
      />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div
          className={`w-full max-w-lg rounded-2xl border px-8 py-10 text-center shadow-2xl backdrop-blur-md ${
            isLight
              ? 'border-slate-200 bg-white/95 text-slate-800'
              : 'border-white/15 bg-[#04141E]/80 text-slate-200'
          }`}
        >
          <h1
            className={`font-heading text-xl font-bold md:text-2xl ${isLight ? 'text-slate-900' : 'text-white'}`}
          >
            {title}
          </h1>
          <p className={`mt-4 font-body text-sm ${isLight ? 'text-slate-600' : 'text-[#9fb3c8]'}`}>
            Estamos trabajando en este módulo. Próximamente disponible.
          </p>
          <Link
            to="/consultor"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-[#2F7BB8] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#25649a]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {`Volver al inicio`}
          </Link>
        </div>
      </div>
    </section>
  );
}
