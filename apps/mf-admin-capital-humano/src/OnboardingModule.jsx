/**
 * Compatibilidad: el módulo Onboarding maestro se fusionó con Capital Humano (Monitor n8n)
 * en un único módulo `CapitalHumanoModule` accesible en `/admin/capital-humano`.
 *
 * Este archivo se mantiene como re-export para no romper imports legados.
 */
import CapitalHumanoModule from './CapitalHumanoModule.jsx';
export { userHasOnboardingPanel } from './onboarding/onboardingAccess.js';
export default CapitalHumanoModule;
