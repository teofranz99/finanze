// Le sezioni dell'app. `phase` indica in quale fase del progetto vengono costruite.
export const SECTIONS = [
  {
    id: 'home', title: 'Home', icon: 'house', color: '#007AFF', phase: 1,
    features: [],
  },
  {
    id: 'movimenti', title: 'Movimenti', icon: 'arrows', color: '#34C759', phase: 2,
    features: [
      'Import di estratti conto CSV, Excel e PDF di qualsiasi banca',
      'Categorie, aree e tag con regole automatiche',
      'Spostamento e divisione dei movimenti',
      'Budget per area e per categoria',
    ],
  },
  {
    id: 'abbonamenti', title: 'Abbonamenti', icon: 'repeat', color: '#AF52DE', phase: 4,
    features: [
      'Riconoscimento automatico dei pagamenti ricorrenti',
      'Avvisi prima del rinnovo con Calendario o Promemoria',
      'Costo mensile e annuale di tutti gli abbonamenti',
    ],
  },
  {
    id: 'investimenti', title: 'Investimenti', icon: 'chart', color: '#FF9500', phase: 6,
    features: [
      'PAC, azioni ed ETF con quotazioni aggiornate',
      'Guadagno o perdita in euro e in percentuale',
      'Conti deposito e interessi maturati',
    ],
  },
  {
    id: 'fondi', title: 'Fondi e spese condivise', short: 'Fondi', icon: 'users', color: '#30B0C7', phase: 5,
    features: [
      'Fondi vincolati: soldi sul conto che non sono tuoi',
      'Casse comuni e spese divise con altre persone',
      'Chi deve cosa a chi',
    ],
  },
  {
    id: 'documenti', title: 'Documenti', icon: 'folder', color: '#5856D6', phase: 7,
    features: [
      'Cartelle per categoria con ricerca libera',
      'Bollette, buste paga e garanzie',
      'Consumi della luce divisi per fasce F1, F2 e F3',
    ],
  },
  {
    id: 'desideri', title: 'Lista desideri', short: 'Desideri', icon: 'heart', color: '#FF2D55', phase: 9,
    features: [
      'Prodotti con immagini, prezzi e storico',
      '«Se lo compro»: quanto resta nello spendibile',
      'Prezzo in ore di lavoro',
    ],
  },
  {
    id: 'scadenze', title: 'Scadenze', icon: 'calendar', color: '#FF3B30', phase: 4,
    features: [
      'Scadenzario di bollo, assicurazione, revisione e garanzie',
      'Resi e documenti personali',
      'Promemoria per caricare gli estratti conto',
    ],
  },
  {
    id: 'report', title: 'Report e Claude', short: 'Report', icon: 'sparkles', color: '#D97757', phase: 8,
    features: [
      'Riepilogo per il 730 e riepilogo di fine anno',
      'Chat con Claude sui tuoi dati',
      'Claude lavora solo quando lo chiedi tu',
    ],
  },
  {
    id: 'auto', title: 'Auto', icon: 'car', color: '#8E8E93', phase: 9,
    features: [
      'Spese, documenti e scadenze della macchina',
      'Chilometri, consumo medio e costo al chilometro',
      'Costo totale annuo',
    ],
  },
];

const byId = new Map(SECTIONS.map((s) => [s.id, s]));
export const sectionById = (id) => byId.get(id);
