import FormularioNovedad from './FormularioNovedad.jsx';
import { useConsultorOutlet } from './useConsultorOutlet.js';

export default function ConsultorNovedadesPage() {
  const { me, refreshMe } = useConsultorOutlet();
  return <FormularioNovedad consultorSession={me} onSessionChange={refreshMe} />;
}
