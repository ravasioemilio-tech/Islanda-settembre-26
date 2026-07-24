# Islanda On The Road — app da viaggio

App offline (PWA) con tappe, orari, priorità, budget e note del viaggio in Islanda.
Nessun server da mantenere: gira interamente nel browser, i dati che inserisci
(spese, note, tappe completate) restano salvati **sul telefono/tablet**.

## Come pubblicarla (5 minuti, gratis, senza usare il tuo PC come server)

### Opzione consigliata: GitHub Pages

1. Vai su https://github.com e crea un account gratuito (se non lo hai già)
2. Clicca "New repository" → dagli un nome, es. `islanda-2026` → crealo (va bene anche privato)
3. Nella pagina del repository, clicca "Add file" → "Upload files"
4. Trascina dentro **tutti gli 8 file** di questo zip (index.html, app.js, style.css,
   data.js, manifest.json, sw.js, icon-192.png, icon-512.png) → "Commit changes"
5. Vai su "Settings" (del repository) → "Pages" (nel menu a sinistra)
6. In "Branch" seleziona `main` e cartella `/ (root)` → "Save"
7. Dopo 1-2 minuti, GitHub ti mostra l'indirizzo pubblico, tipo:
   `https://tuonome.github.io/islanda-2026/`

Quell'indirizzo è ospitato dai server di GitHub — non dipende dal tuo PC,
dalla tua connessione di casa o da nessuno che deve "riavviare" niente.

### Sul telefono, prima di partire (mentre hai ancora campo/wifi)

1. Apri quell'indirizzo con il browser del telefono (Safari su iPhone, Chrome su Android)
2. Aspetta che la pagina si carichi completamente una volta
3. Menu del browser → **"Aggiungi a schermata Home"** (iPhone) o **"Installa app"** (Android)
4. Da quel momento l'app è installata come una vera app, con la sua icona, e
   funziona **anche a zero campo**, perché ha già salvato tutto localmente

Ripeti questo passaggio "apri e aggiungi a Home" su ogni telefono di chi userà l'app
(ognuno avrà i propri dati salvati separatamente sul proprio telefono).

### Alternativa ancora più semplice (senza account)

Se non vuoi creare un account GitHub, puoi usare **Netlify Drop**:
https://app.netlify.com/drop — trascini la cartella con questi file, e in pochi
secondi ottieni un link pubblico gratuito, senza registrazione. È leggermente
meno definitivo di GitHub Pages (il link può scadere se non crei un account),
ma perfetto per un test rapido.

## Uso da PC (fino alla partenza) e poi da tablet

L'app riconosce automaticamente se la stai usando con mouse (PC) o a tocco
(tablet/telefono) e cambia aspetto di conseguenza — non devi fare nulla:

- **Da PC**: vista comoda a schermo intero, tappe disposte su più colonne,
  menu e pulsante "+ Aggiungi spesa" in alto.
- **Da tablet/telefono**: la vista compatta "a card", ottimizzata per lo
  schermo piccolo e il tocco, con la barra in basso.

I dati (spese, note, tappe completate) restano salvati nel browser del
dispositivo che stai usando — se inserisci qualcosa dal PC e poi passi al
tablet, il tablet parte "vuoto" (nessuna sincronizzazione automatica tra
dispositivi). Se hai già inserito dati dal PC che vuoi portarti dietro, usa il
pulsante "Esporta" nella scheda Info prima di cambiare dispositivo.

## Orari calcolati in automatico

Per ogni tappa l'app mostra ora **partenza e arrivo calcolati** (es. "🕗 08:00 → 08:40"),
esattamente come nel file Excel. Toccando "✏️ orari" su una tappa puoi correggere
i minuti di guida e di visita: tutte le tappe successive di quel giorno si
ricalcolano automaticamente, e in alto viene aggiornata anche la **partenza
mattutina** e l'**arrivo previsto in serata** dell'intera giornata. La
partenza mattutina di ogni giorno è modificabile liberamente (di default 8:00).

## Aggiornare l'app quando aggiorno l'Excel

Da ora in poi, ogni volta che mi chiedi di aggiornare il file Excel del
programma, aggiorno in automatico anche `data.js` di questa app con gli
stessi dati (tappe, orari, priorità, costi, pernottamenti). Ti basterà
ricaricare quel singolo file su GitHub (stesso procedimento "Upload files",
sovrascrive il vecchio) — le spese e le note che hai già inserito sul tablet
restano intatte, perché vivono separatamente nel browser del dispositivo, non
nel file `data.js`.

## Aggiornare i dati del viaggio (es. quando pianifichiamo i Giorni 7-14)

Il file `data.js` contiene tutte le tappe, i pernottamenti e le categorie di
spesa. Quando aggiungeremo altri giorni, ti darò un `data.js` aggiornato:
basta ricaricarlo su GitHub (stesso procedimento "Upload files", sovrascrive
il vecchio) — le spese e le note che hai già inserito sul telefono **non
vengono toccate**, restano salvate separatamente.

⚠ Se aggiorni i file dopo che l'app è già stata "installata" su un telefono,
potrebbe servire cambiare `CACHE_NAME` in `sw.js` (es. da `v1` a `v2`) perché
il telefono veda la nuova versione — te lo ricordo quando arriva il momento.

## Cosa fa l'app

- **Giorni**: tappe di ogni giornata con orari, km, priorità (🟢🟡🔴), costi
  parcheggio/ingresso, note di viaggio; checkbox per segnare le tappe fatte;
  campo note personali per ogni tappa (salvato mentre scrivi)
- **Budget**: tasto "+ Spesa" per registrare al volo una spesa (categoria,
  importo, giorno, nota), con riepilogo totale e per persona (÷6)
- **Info**: elenco di tutti i 14 pernottamenti del viaggio
- **Backup**: pulsante per esportare un file JSON con tutte le spese e note
  inserite (utile da fare ogni tanto, così hai una copia anche se il telefono
  si rompe o si perde)
