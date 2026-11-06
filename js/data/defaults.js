// Categorie, aree e regole predefinite. Sono generiche (catene e servizi comuni in Italia),
// non contengono nulla di personale. Categorie e aree vengono copiate nell'archivio al primo
// avvio e poi sono modificabili; le regole predefinite restano qui e valgono dopo quelle create dall'utente.

// I colori usano le variabili della palette (--s1 … --s10), così seguono la palette scelta.
export const DEFAULT_AREAS = [
  { id: 'alimentazione', name: 'Alimentazione', icon: 'cart', color: 'var(--s2)' },
  { id: 'casa', name: 'Casa', icon: 'house', color: 'var(--s1)' },
  { id: 'macchina', name: 'Macchina', icon: 'car', color: 'var(--s10)' },
  { id: 'svago', name: 'Svago', icon: 'ticket', color: 'var(--s7)' },
  { id: 'lavoro', name: 'Lavoro', icon: 'briefcase', color: 'var(--s5)' },
  { id: 'salute', name: 'Salute', icon: 'pulse', color: 'var(--s8)' },
  { id: 'abbonamenti', name: 'Abbonamenti', icon: 'repeat', color: 'var(--s3)' },
  { id: 'investimenti', name: 'Investimenti', icon: 'chart', color: 'var(--s4)' },
];

// kind: spesa | entrata | investimento | giroconto | auto (dal segno)
export const DEFAULT_CATEGORIES = [
  { id: 'spesa', name: 'Spesa alimentare', icon: 'cart', color: 'var(--s2)', kind: 'spesa', areaId: 'alimentazione' },
  { id: 'ristoranti', name: 'Ristoranti', icon: 'fork', color: 'var(--s9)', kind: 'spesa', areaId: 'svago' },
  { id: 'bar', name: 'Bar e caffè', icon: 'cup', color: 'var(--s6)', kind: 'spesa', areaId: 'svago' },
  { id: 'alcol', name: 'Alcol', icon: 'wine', color: 'var(--s3)', kind: 'spesa', areaId: 'svago' },
  { id: 'online', name: 'Amazon e online', icon: 'bag', color: 'var(--s4)', kind: 'spesa', areaId: 'svago' },
  { id: 'shopping', name: 'Shopping', icon: 'shirt', color: 'var(--s7)', kind: 'spesa', areaId: 'svago' },
  { id: 'carburante', name: 'Carburante', icon: 'fuel', color: 'var(--s1)', kind: 'spesa', areaId: 'macchina' },
  { id: 'trasporti', name: 'Trasporti e parcheggi', icon: 'parking', color: 'var(--s5)', kind: 'spesa', areaId: 'macchina' },
  { id: 'abbonamenti', name: 'Abbonamenti', icon: 'repeat', color: 'var(--s3)', kind: 'spesa', areaId: 'abbonamenti' },
  { id: 'bollette', name: 'Bollette', icon: 'bolt', color: 'var(--s4)', kind: 'spesa', areaId: 'casa' },
  { id: 'casa', name: 'Casa', icon: 'house', color: 'var(--s1)', kind: 'spesa', areaId: 'casa' },
  { id: 'salute', name: 'Salute', icon: 'pulse', color: 'var(--s8)', kind: 'spesa', areaId: 'salute' },
  { id: 'svago', name: 'Svago', icon: 'ticket', color: 'var(--s7)', kind: 'spesa', areaId: 'svago' },
  { id: 'banca', name: 'Banca e tasse', icon: 'bank', color: 'var(--s10)', kind: 'spesa', areaId: null },
  // Il prelievo sposta soldi dal conto al conto «Contanti»: non è una spesa.
  { id: 'contanti', name: 'Prelievi contanti', icon: 'cash', color: 'var(--s2)', kind: 'giroconto', areaId: null },
  { id: 'investimenti', name: 'Investimenti', icon: 'chart', color: 'var(--s4)', kind: 'investimento', areaId: 'investimenti' },
  { id: 'stipendio', name: 'Stipendio', icon: 'briefcase', color: 'var(--s2)', kind: 'entrata', areaId: null },
  { id: 'rimborsi', name: 'Rimborsi', icon: 'undo', color: 'var(--s5)', kind: 'entrata', areaId: null },
  { id: 'interessi', name: 'Interessi', icon: 'percent', color: 'var(--s4)', kind: 'entrata', areaId: null },
  { id: 'altre-entrate', name: 'Altre entrate', icon: 'plus', color: 'var(--s9)', kind: 'entrata', areaId: null },
  { id: 'giroconto', name: 'Giroconto', icon: 'swap', color: 'var(--s10)', kind: 'giroconto', areaId: null },
  { id: 'nc', name: 'Da classificare', icon: 'question', color: 'var(--s10)', kind: 'auto', areaId: null },
];

// Icone e colori che si possono scegliere per una categoria o area nuova.
export const PICKABLE_ICONS = ['cart', 'fork', 'cup', 'wine', 'bag', 'shirt', 'fuel', 'parking', 'car', 'repeat', 'bolt', 'house', 'pulse', 'ticket', 'bank', 'cash', 'chart', 'briefcase', 'gift', 'paw', 'book', 'plane', 'heart', 'tag', 'users', 'sparkles'];
export const PICKABLE_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)', 'var(--s9)', 'var(--s10)'];

// Regole sulla causale del movimento (scritta dalla banca), valutate per prime.
export const CAUSALE_RULES = [
  { cat: 'stipendio', words: ['EMOLUMENTI', 'STIPENDIO', 'STIPENDI', 'ACCREDITO STIPENDIO'] },
  { cat: 'investimenti', words: ['SOTTOSC. TIT/FONDI', 'SOTTOSCRIZIONE FONDI', 'ACQUISTO TITOLI'] },
  { cat: 'interessi', words: ['INTERESSI', 'INTERESSI CREDITORI'] },
  { cat: 'banca', words: ['COMMISSIONI', 'IMPOSTE E TASSE', 'RECUPERO BOLLI', 'IMPOSTA DI BOLLO', 'CANONE CONTO CORRENTE', 'CANONE', 'ADDEBITI HOME BANKING', 'SPESE', 'COMPETENZE DI CHIUSURA'] },
  { cat: 'contanti', words: ['PRELIEVO', 'PRELIEVO BANCOMAT', 'PRELIEVO ATM'] },
  { cat: 'bollette', words: ['TELEFONO', 'UTENZE', 'UTENZA'] },
];

// Regole sul testo (esercente e descrizione). Parole intere, maiuscole.
export const TEXT_RULES = [
  { cat: 'stipendio', words: ['SALARY', 'ACCREDITO COMPETENZE', 'ACCREDITO STIPENDIO'] },
  { cat: 'investimenti', words: ['RATA PAC', 'SOTTOSCRIZIONE RATA'] },
  { cat: 'contanti', words: ['OPERAZIONE ATM', 'PRELIEVO BANCOMAT'] },
  { cat: 'spesa', words: ['FAMILA', 'CONAD', 'COOP', 'ESSELUNGA', 'LIDL', 'EUROSPIN', 'CARREFOUR', 'PAM', 'PENNY', 'ALDI', 'IPERCOOP', 'BENNET', 'TIGROS', 'DESPAR', 'SPAR', 'INTERSPAR', 'CRAI', 'TODIS', 'NATURASI', 'SIGMA', 'IPER', 'SUPERMERCATO', 'SUPERMERCATI', 'ALIMENTARI', 'MACELLERIA', 'PANETTERIA', 'PANIFICIO', 'FRUTTA', 'MARKET', 'CONVENIENZA MARKET'] },
  { cat: 'ristoranti', words: ['RISTORANTE', 'PIZZERIA', 'TRATTORIA', 'OSTERIA', 'SUSHI', 'MCDONALDS', 'MCDONALD', 'BURGER KING', 'KFC', 'ROADHOUSE', 'AUTOGRILL', 'POKE', 'KEBAB', 'GLOVO', 'DELIVEROO', 'JUST EAT', 'JUSTEAT', 'MYCHEF', 'OLD WILD WEST', 'PIADINERIA', 'BRACERIA', 'TAVOLA CALDA'] },
  { cat: 'bar', words: ['BAR', 'CAFFE', 'CAFFÈ', 'CAFE', 'PASTICCERIA', 'GELATERIA', 'STARBUCKS'] },
  { cat: 'alcol', words: ['ENOTECA', 'BIRRERIA', 'PUB', 'WINE BAR', 'VINERIA', 'COCKTAIL'] },
  { cat: 'carburante', words: ['ENI', 'PV ENI', 'AGIP', 'Q8', 'TAMOIL', 'ESSO', 'SHELL', 'API', 'IP', 'REPSOL', 'TOTALENERGIES', 'CARBURANTI', 'DISTRIBUTORE'] },
  { cat: 'trasporti', words: ['EASYPARK', 'TELEPASS', 'AUTOSTRADE', 'AUTOSTRADA', 'TRENITALIA', 'ITALO', 'PARCHEGGIO', 'PARCHEGGI', 'TAXI', 'UBER', 'FREENOW', 'RYANAIR', 'EASYJET', 'ITA AIRWAYS', 'FLIXBUS', 'MYCICERO'] },
  { cat: 'online', words: ['AMAZON', 'AMZN', 'AMAZON.IT', 'ZALANDO', 'EBAY', 'ALIEXPRESS', 'SHEIN', 'TEMU', 'VINTED'] },
  { cat: 'abbonamenti', words: ['NETFLIX', 'SPOTIFY', 'DISNEY', 'APPLE.COM/BILL', 'ICLOUD', 'YOUTUBE', 'PRIME VIDEO', 'DAZN', 'NOW TV', 'NOWTV', 'SKY', 'CHATGPT', 'OPENAI', 'ANTHROPIC', 'PATREON', 'AUDIBLE', 'GOOGLE STORAGE', 'MICROSOFT', 'ADOBE'] },
  { cat: 'bollette', words: ['ILIAD', 'TIM', 'TELECOM', 'TELECOMITALIA', 'VODAFONE', 'WINDTRE', 'WIND TRE', 'FASTWEB', 'HO MOBILE', 'VERY MOBILE', 'ENEL', 'A2A', 'IREN', 'HERA', 'EDISON', 'ACEA', 'SORGENIA', 'PLENITUDE', 'GAS', 'ENERGIA', 'ACQUEDOTTO', 'BOLLETTA', 'BOLLETTINI'] },
  { cat: 'salute', words: ['FARMACIA', 'PARAFARMACIA', 'ODONTOIATRIA', 'DENTISTA', 'MEDICO', 'MEDICA', 'MEDICAL', 'OSPEDALE', 'AUSL', 'ASL', 'OTTICA', 'LABORATORIO', 'CLINICA', 'POLIAMBULATORIO', 'FISIOTERAPIA'] },
  { cat: 'casa', words: ['IKEA', 'LEROY MERLIN', 'BRICO', 'BRICOMAN', 'OBI', 'MONDO CONVENIENZA', 'MAISONS DU MONDE', 'TECNOMAT', 'ACTION', 'TIGER'] },
  { cat: 'shopping', words: ['LEVIS', 'LEVI', 'ZARA', 'H&M', 'DECATHLON', 'OVS', 'NIKE', 'ADIDAS', 'PRIMARK', 'UNIQLO', 'BERSHKA', 'PULL&BEAR', 'MEDIAWORLD', 'UNIEURO', 'EURONICS', 'FOOT LOCKER', 'SEPHORA', 'DOUGLAS', 'SHOPPING'] },
  { cat: 'svago', words: ['CINEMA', 'KART', 'PALESTRA', 'TEATRO', 'STEAM', 'PLAYSTATION', 'NINTENDO', 'TICKETONE', 'BOWLING', 'PISCINA', 'MUSEO', 'CONCERTO', 'GARDALAND', 'THE SPACE', 'UCI'] },
];
