// Preferenze di spendibile, budget e previsione (settings/plan).
import * as S from '../store.js';

export const DEFAULT_PLAN = {
  subtractFixed: false,  // togli dallo spendibile le uscite fisse ancora da pagare nel mese
  fundsInTotal: true,    // mostra i fondi vincolati nel patrimonio totale (fetta a parte)
  warnPct: 80,           // avviso quando un budget arriva a questa percentuale
};

export const planSettings = () => ({ ...DEFAULT_PLAN, ...(S.get('settings', 'plan') || {}) });
export const updatePlanSettings = (patch) => S.put('settings', 'plan', { ...(S.get('settings', 'plan') || {}), ...patch });
