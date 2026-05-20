import { useOutletContext } from 'react-router-dom';

/** Contexto del layout `/consultor`: `{ me, refreshMe }`. */
export function useConsultorOutlet() {
  return useOutletContext();
}
