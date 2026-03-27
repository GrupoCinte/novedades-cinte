import { Link } from 'react-router-dom';
import { NUCLEO_ITEMS } from '../navigation';

export default function NucleoPage() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-black text-white mb-2">Núcleo compartido</h1>
      <p className="text-slate-400 mb-8">
        Capa transversal que alimenta los tres portales. Contenido informativo para planeación.
      </p>
      <ul className="space-y-4">
        {NUCLEO_ITEMS.map((item) => (
          <li
            key={item.title}
            className="rounded-xl border border-slate-700 bg-slate-900/50 p-5"
          >
            <h2 className="font-bold text-white mb-1">{item.title}</h2>
            <p className="text-sm text-slate-400">{item.desc}</p>
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
