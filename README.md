# Finanze

Web app personale per entrate, uscite, abbonamenti, documenti e investimenti.
Local-first: i dati restano cifrati sul dispositivo (IndexedDB), senza server e senza account.

Il brief completo è in `Progetto Finanze Personali – brief per Claude Code.docx`.

## Stato

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | Fondamenta e sicurezza: PWA, design, barra personalizzabile, cifratura, sblocco con Face ID e password, chiave di recupero, backup cifrato, palette | fatta |
| 2 | Movimenti: import PDF Banca di Piacenza (pdf.js), categorie, aree, regole, swipe, divisione, tag, Home con dati veri | fatta |
| 3 | BPER, Revolut, CSV universale con modelli, giroconti, contanti, ciambella del patrimonio | fatta |
| 4 | Abbonamenti (riconoscimento, proposti, avvisi), scadenzario, documenti personali, promemoria estratti conto, avvisi nel Calendario (file .ics) | fatta |
| 5 | Fondi vincolati e casse comuni (saldo reale, rendiconto PDF/CSV, ricevute), spese divise e «chi deve cosa», budget per area e categoria, accantonamenti, previsione di fine mese | **fatta, da provare** |
| 6–10 | Vedi il brief | da fare |

## Scelte tecniche

- **Niente build e niente dipendenze**: HTML, CSS e JavaScript moderno (moduli ES). Si pubblica così com'è su GitHub Pages. Nessuna libreria esterna da aggiornare o di cui fidarsi.
- **Cifratura** (Web Crypto, `js/crypto.js`, `js/vault.js`):
  - una chiave dati casuale AES-256-GCM cifra ogni record e il backup;
  - la chiave dati è protetta da: password principale (PBKDF2-SHA256, 600.000 iterazioni), chiave di recupero (160 bit casuali), passkey Face ID (WebAuthn con estensione PRF);
  - in memoria resta solo mentre l'app è sbloccata; il blocco ricarica la pagina.
- **Backup** (`js/backup.js`): un file `.json` cifrato. «Salva backup» lo salva con il foglio di condivisione (iPhone) o con «Salva con nome» (computer). «Aggiorna file» lo unisce: vince la modifica più recente.
- **Offline**: `sw.js` mette in cache tutti i file dell'app. Quando si pubblica una nuova versione, aumentare `VERSION` in `sw.js` e aggiungere eventuali file nuovi alla lista `ASSETS`.
- **Avvisi** (`js/reminders.js`): senza server non ci sono notifiche push. Ogni avviso è un file calendario `.ics` (evento con notifica, `VALARM`) che l'iPhone aggiunge al Calendario con un tocco; quelli che si ripetono usano `RRULE`. Titoli minimi, senza importi. Comandi Rapidi è stato provato e tolto: su iOS 26 l'azione «Aggiungi promemoria» rifiutava l'orario dell'avviso.
- **Soldi non miei e quote** (`js/data/model.js` › `myParts`): i movimenti pagati con un fondo vincolato, i versamenti nel fondo e i rimborsi di spese divise non contano nelle entrate e uscite; di una spesa divisa conta solo la mia quota. Lo spendibile (`js/data/plan.js`) toglie dai saldi i fondi vincolati, gli accantonamenti e, se scelto, le uscite fisse ancora da pagare nel mese.
- **Ricevute** (`js/data/files.js`): foto ridotte a 1600 px e PDF fino a 6 MB, salvati cifrati come gli altri dati (e quindi anche nel backup).
- **Sicurezza della pagina**: Content-Security-Policy restrittiva in `index.html` (solo script locali, nessuna connessione esterna per ora). Il testo inserito nelle pagine passa sempre dal template `html``…``, che fa l'escape.

## Provare sul computer

Serve Python (già installato):

```bash
python tools/serve.py
```

Poi apri http://localhost:5173. Sul computer Face ID non c'è: si usa la password (o Windows Hello, se il browser supporta il PRF).

## Cosa NON pubblicare

La cartella `esempi/` contiene estratti conto veri, usati solo in locale per costruire i lettori dei file. Non va mai caricata su GitHub, come il `.docx` del brief. Si caricano solo `css`, `icons`, `js`, `index.html`, `manifest.webmanifest`, `sw.js` (e se serve `README.md`). Il file `.gitignore` le esclude già, se un giorno si userà git.

## Provare su iPhone

Face ID e l'installazione richiedono HTTPS, quindi serve pubblicare l'app (solo il codice, nessun dato):

1. Crea un account su github.com, poi un repository (anche privato, con GitHub Pages attivo; per i repository privati serve un piano a pagamento, altrimenti usa un repository pubblico: dentro non c'è nessun dato).
2. Carica tutti i file di questa cartella con «Add file › Upload files» (trascinandoli), **tranne** il file `.docx` del brief e la cartella `.claude`.
3. In Settings › Pages scegli «Deploy from a branch», branch `main`, cartella `/ (root)`.
4. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/<repository>/`.
5. Su iPhone aprila in Safari › Condividi › **Aggiungi alla schermata Home**.

Per Face ID serve iOS 18 o successivo.

## Struttura

```
index.html            pagina unica, CSP, icone
manifest.webmanifest  installazione come app
sw.js                 funzionamento offline
css/app.css           stile (chiaro/scuro, vetro smerigliato, animazioni)
icons/                icone (rigenerabili con python tools/make_icons.py)
js/
  main.js             avvio: configurazione guidata o sblocco
  app.js              barra delle sezioni e navigazione
  crypto.js vault.js  cifratura e chiavi
  db.js store.js      IndexedDB e dati in memoria
  passkey.js          Face ID (WebAuthn PRF)
  backup.js           backup cifrato e unione
  autolock.js         blocco automatico
  settings.js         impostazioni (cifrate, sincronizzate col backup)
  sections.js         elenco delle sezioni
  ui/                 componenti (pagina, elenchi, fogli, password, icone)
  views/              schermate
tools/serve.py        server locale
```
