import { Link } from 'react-router-dom';
import { AUTO_ITEMS } from '../navigation';

export default function AutomatizacionPage() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-black text-white mb-2">Automatización iterativa</h1>
      <p className="text-slate-400 mb-8">
        Evolución continua sobre el núcleo. Mock de conceptos; sin integraciones reales.
      </p>
      <ul className="space-y-4">
        {AUTO_ITEMS.map((item) => (
          <li
            key={item.title}
            className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-5"
          >
            <h2 className="font-bold text-amber-100 mb-1">{item.title}</h2>
            <p className="text-sm text-amber-200/70">{item.desc}</p>
          </li>
        ))}
      </ul>
      <p className="mt-10">
        <Link to="/ecosistema" className="text-sky-400 hover:text-sky-300 text-sm">
          ← Volver al hub
        </Link>
      </p>
    </div>
  );
}
