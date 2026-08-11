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

## Foto dei luoghi

Aprendo la descrizione di una tappa, l'app cerca automaticamente una foto su
**Wikipedia** (fonte con licenza libera, adatta a questo uso) e la mostra in
alto al testo. Un paio di cose da sapere:

- La prima volta serve connessione internet per scaricare la foto; dopo di
  che resta salvata nella cache del telefono e si vede anche offline.
- **Non tutte le tappe hanno una foto**: circa 36 delle 59 con descrizione
  (le più famose e conosciute) ce l'hanno; per i luoghi molto minori o senza
  una voce Wikipedia affidabile, l'app mostra solo il testo, senza inventare
  un'immagine sbagliata.
- **Consiglio pratico**: prima di partire, mentre sei ancora su wifi/PC, apri
  ogni scheda giorno e tocca via via tutte le tappe con l'icona ℹ️ — così le
  foto restano già scaricate in cache e le hai disponibili offline durante il
  viaggio, senza dover aspettare il caricamento sul posto (dove magari non
  c'è campo).

## Scheda dettagliata di ogni tappa

Ogni tappa ha ora un pulsante ben visibile **"📖 Scheda"** in alto a destra
(oltre a poter toccare direttamente il titolo). Si apre una scheda a schermo
intero con foto, badge di priorità/tempi/costi, descrizione completa e le
note pratiche in sezioni separate.

**Puoi modificare o integrare la descrizione**: dentro la scheda, tocca
"✏️ Modifica" per aprire un'area di testo precompilata con il testo attuale
— scrivi pure sopra, aggiungi dettagli, o riscrivila da zero, poi "Salva".
Le tue modifiche restano salvate sul dispositivo (come le note personali) e
sostituiscono il testo originale ovunque nell'app. Il link "↺ Ripristina
originale" torna al testo che ti avevo preparato io, se cambi idea. Funziona
anche per le tappe che non avevano ancora una descrizione.

**Puoi modificare o integrare anche le note pratiche** allo stesso modo:
tocca "✏️ Modifica" sopra "📝 Note pratiche" — utile per aggiungere dettagli
raccolti da chi è già stato in quel posto (strada sterrata, serve il 4x4,
tratti con guadi importanti, ecc.), con lo stesso salvataggio locale e
possibilità di ripristino.

## Suggerire una località non ancora inserita

Nella scheda **Info**, sezione **"💡 Suggerisci una località"**: chiunque
può scrivere una proposta libera (nome del posto e perché interessa) e
salvarla sul proprio dispositivo. Stesso identico meccanismo delle
priorità: si sceglie il proprio nome, si esporta un file
`islanda-suggerimenti-NOME.json`, lo si manda a chi raccoglie le proposte —
che carica ogni file ricevuto e vede l'elenco completo di tutti i
suggerimenti, persona per persona, per valutare come integrarli nel
viaggio.

## Raccogliere le priorità di tutti i 6 partecipanti

Ogni persona modifica la priorità delle tappe sul proprio telefono (come
spiegato sopra) — resta lì, sul suo dispositivo. Per raccoglierle tutte e
decidere il programma definitivo, nella scheda **Info** trovi ora
**"📊 Raccogliere le priorità di tutti"**, in tre passi:

1. **Ognuno esporta le proprie scelte**: sceglie il proprio nome da un menu
   a tendina e tocca "⬇️ Esporta" — si scarica un piccolo file
   `islanda-priorita-NOME.json`. Lo manda a chi raccoglie le risposte
   (tipicamente tu) via WhatsApp, email, come preferite.
2. **Tu carichi ogni file ricevuto**: tocchi "Carica un file ricevuto",
   selezioni il file .json ricevuto — l'app lo legge e lo aggiunge al
   confronto (puoi caricarne quanti ne vuoi, uno alla volta).
3. **Confronto tappa per tappa**: appare un elenco di tutte le tappe su cui
   qualcuno ha espresso una preferenza diversa da quella di base. Ogni riga
   mostra prima un chip grigio **"Partenza: ..."** (il valore originale,
   quello impostato nell'Excel), poi un chip colorato per ogni persona che
   l'ha cambiata (es. "Marco: 🟢 Imperdibile", "Giusi: 🔴 Da evitare").
   **Toccando un chip qualsiasi applichi subito quella scelta alle tue
   proprie tappe** (anche "Partenza", per tornare al valore originale) —
   così decidi tu, tappa per tappa, guardando cosa hanno scelto gli altri
   rispetto a cosa c'era già, e il programma
   definitivo si costruisce direttamente sul tuo dispositivo.

Il pulsante "↺ Cancella tutte" nella sezione 2 rimuove tutte le risposte
caricate, se vuoi ricominciare il confronto da capo.

## Nascondere o eliminare una tappa

In cima a ogni giornata, sotto l'orario di partenza, trovi ora
**"🙈 Nascondi questa tappa"** dentro ogni scheda (in fondo, sotto le note
personali). Quando nascondi una tappa:
- **Sparisce dalla lista** del giorno
- **Il suo tempo (guida + visita) non conta più** nel totale della giornata
- **Gli orari di tutte le tappe successive si ricalcolano** automaticamente,
  esattamente come quando modifichi i minuti a mano con "✏️ orari"

Le tappe nascoste non sono perse: in cima alla giornata trovi
"🙈 N tappa/e nascosta/e — mostra", che apre un elenco con un tasto
"👁️ Mostra di nuovo" per ciascuna, se cambi idea.

**Un limite onesto da sapere**: il tempo di guida "recuperato" per la tappa
successiva a quella nascosta era originariamente calcolato per il tragitto
specifico da quella tappa nascosta — non per il tragitto diretto dalla
tappa precedente. Per la maggior parte delle tappe (punti vicini sulla
stessa strada) la differenza è minima, ma se saltate una vera deviazione,
il tempo potrebbe essere leggermente approssimato.

## Aggiungere una nuova tappa

In cima a ogni giornata trovi anche **"➕ Aggiungi tappa in fondo alla
giornata"**: inserisci nome, minuti di guida e minuti di visita (te lo
chiede l'app passo passo), e la tappa viene aggiunta alla fine
dell'itinerario di quel giorno, con i suoi orari calcolati di conseguenza.

**Limite attuale**: le tappe aggiunte vanno sempre **in fondo alla
giornata**, non si possono inserire in un punto preciso in mezzo alle
altre — se ti serve un ordine diverso, sposta gli orari a mano con
"✏️ orari" sulle tappe coinvolte. Le tappe che aggiungi tu si riconoscono
dal badge "➕ Aggiunta da te" e possono essere **eliminate del tutto**
(tasto "🗑️ Elimina questa tappa" al posto di "Nascondi", visto che per
queste non c'è un dato originale a cui tornare).

## Scheda pernottamento arricchita

In Info → Pernottamenti, ogni scheda ora mette in risalto il **nome della
struttura** (titolo grande), con la **località** subito sotto, e mostra
tutte le informazioni pratiche disponibili (camere, bagno, cucina,
colazione, orari di check-in/out, parcheggio, WiFi, contatto) — solo i
campi effettivamente compilati vengono mostrati.

- **📷 Foto**: puoi caricare una foto della struttura dal tuo dispositivo
  (compressa automaticamente); "🗑️ Rimuovi foto" per toglierla
- **🗺️ Google Maps**: link diretto come prima
- **📝 Note**: un campo di testo libero, vuoto di default — scrivici pure
  subito quello che vuoi (indicazioni, codice del cancello, promemoria),
  oppure lascialo per dopo e incollaci le info dal tuo Excel quando è
  definitivo. Si salva automaticamente quando esci dal campo.

## 🔄 Spese sincronizzate tra dispositivi (test in corso)

Le spese della cassa comune ora possono sincronizzarsi in tempo reale tra
più dispositivi tramite Firebase (progetto "viaggio-in-islanda"). Nella
scheda **Budget**, in alto, un'etichetta indica lo stato:

- 🟢 **Spese sincronizzate con gli altri dispositivi** — funziona, ogni
  spesa che inserisci (o elimini) compare automaticamente su tutti i
  dispositivi collegati
- 🟡 **Connessione in corso** — sta ancora collegandosi, aspetta un attimo
- ⚪ **Solo locale** — Firebase non è raggiungibile in questo momento
  (es. offline): le spese restano comunque salvate sul dispositivo e si
  sincronizzano da sole non appena torna la connessione

**Tutto il resto dell'app** (descrizioni, foto, priorità, note, posizioni,
orari) **resta locale a ogni dispositivo come prima** — solo le spese
condivise passano da Firebase, perché sono l'unica cosa che ha senso vedere
uguale su tutti i telefoni.

Se il file `firebase-config.js` non viene caricato (es. lo dimentichi
quando aggiorni gli altri file su GitHub), l'app continua a funzionare
normalmente ma torna al salvataggio solo locale delle spese, senza dare
errori.

## Backup completo: esportare e reimportare tutto

Nella scheda **Info**, sezione "Dati e backup":

- **"⬇️ Esporta tutto (backup JSON)"**: scarica un file con **tutto** quello
  che hai personalizzato su questo dispositivo — spese, note personali,
  descrizioni modificate, priorità cambiate, foto caricate, orari
  aggiustati, quote della carta comune, tutto.
- **"⬆️ Importa un backup"**: se devi pulire la cache del browser (o hai
  cambiato dispositivo), carica qui il file esportato in precedenza —
  l'app ti chiede conferma e poi ripristina tutto esattamente come era.

**Consiglio pratico**: prendi l'abitudine di esportare un backup ogni tanto
mentre lavori, soprattutto prima di fare pulizie di cache per problemi
tecnici — così non rischi mai di perdere il lavoro fatto.

## Aprire una tappa in Google Maps

Ogni scheda dettagliata (e ogni scheda di pernottamento in Info) ha ora un
pulsante **"🗺️ Apri in Google Maps"**: parte la navigazione verso quel
posto usando la tua posizione attuale come partenza, senza dover digitare
nulla. Dove disponibile, usa il nome della voce Wikipedia collegata (più
preciso per la geolocalizzazione); altrimenti usa il nome della tappa.

## Più posizioni nella stessa nota (link cliccabili)

Il campo "Posizione" accetta un solo punto per volta, ma capita di avere
**due possibilità di arrivo** (es. due parcheggi diversi). Soluzione: scrivi
entrambe le coordinate direttamente dentro le **note pratiche**, così come
le copi da Google Maps (es. `63.7796, -18.1684`) — **non serve costruire
nessun link a mano**: l'app riconosce automaticamente le coppie di
coordinate nel testo e le trasforma da sola in link cliccabili verso Google
Maps. Riconosce anche eventuali link http/https scritti per intero, se
preferisci incollare quelli.

Esempio di nota:
*"Parcheggio principale: 63.7796, -18.1684 — se pieno, secondo parcheggio:
63.7801, -18.1700"*

→ diventano entrambi automaticamente cliccabili, senza scrivere altro.

Funziona anche nella descrizione e nell'anteprima della nota sulla card.

## Impostare una posizione precisa (es. il parcheggio esatto)

A volte il link automatico a Google Maps porta in una zona generica invece
che al punto esatto (es. l'ingresso di un parcheggio specifico). Dentro la
scheda dettagliata, sopra il pulsante "🗺️ Apri in Google Maps" trovi ora
"✏️ Modifica posizione". Puoi incollare:

- **Coordinate GPS precise** (es. `64.1466, -21.9426`)
- **Un link di Google Maps** copiato direttamente dall'app (apri Google
  Maps, tieni premuto sul punto esatto finché non compare un pin, poi tocca
  "Condividi" per copiare il link)

**Come trovare le coordinate esatte**: apri Google Maps, tieni premuto sul
punto preciso che ti interessa (es. l'ingresso del parcheggio) finché non
compare un pin rosso — le coordinate compaiono in basso nella scheda del
posto, oppure tocca "Condividi" per avere direttamente il link.

Come per gli altri campi, resta salvato sul dispositivo con possibilità di
ripristino alla posizione calcolata automaticamente.

## Modificare la foto di una tappa

Dentro la scheda dettagliata, sopra la foto trovi ora **"📷 Foto"** con
"✏️ Modifica". Tre modi per cambiarla:

1. **Link diretto a un'immagine**: trovi una foto online, tasto destro →
   "Copia indirizzo immagine" → incolla nel campo → Salva
2. **Nome di una voce Wikipedia diversa**: se la foto automatica è sbagliata
   (es. una chiesa che condivide il nome con un'altra più famosa in
   un'altra zona d'Islanda), scrivi il titolo giusto
3. **📁 Carica una foto dal tuo dispositivo**: se hai già uno scatto tuo sul
   telefono/PC, usa il pulsante di caricamento file sotto il campo di
   testo — l'app la ridimensiona e comprime automaticamente prima di
   salvarla, per non riempire lo spazio del dispositivo

Come per gli altri campi, resta salvata sul dispositivo con "↺ Ripristina
originale" per tornare indietro.

**Nota sullo spazio disponibile**: le foto caricate dal dispositivo restano
salvate localmente nel browser (non su un server), quindi occupano un po'
di spazio ogni volta — l'app comprime automaticamente per limitarlo, ma se
carichi tantissime foto proprie potresti in teoria esaurire lo spazio
riservato dal browser al sito. Se succede, l'app te lo segnala con un
messaggio invece di fallire silenziosamente.

**Foto condivise su Firestore**: la stessa migrazione avviene anche per
le foto salvate sul database condiviso — al primo dispositivo che apre
l'app con questi file aggiornati e con connessione a Firestore, le foto
dei giorni "sicuri" vengono spostate alla nuova chiave anche lì, e da
quel momento tornano visibili su tutti i dispositivi (non serve rifarlo
su ognuno).

**Causa radice risolta**: alcuni nomi di tappa contengono il carattere "/"
(es. "notte 1/2"), che Firestore non accetta dentro l'identificativo di un
documento — questo bloccava il salvataggio delle foto per quelle tappe
specifiche, indipendentemente dalla migrazione. Ora l'app usa sempre un
identificativo "reso sicuro" per il documento, mentre il nome vero (con
tutti i suoi caratteri originali) resta salvato come campo dentro al
documento stesso — così funziona con qualunque nome, senza eccezioni.

## Cercare una località senza scorrere giorno per giorno

In alto trovi ora **"🔍 Cerca una località"** (icona lente sul telefono, testo esteso sul desktop): scrivi anche solo qualche lettera del nome e vedi subito i risultati da **tutti i giorni**, non solo quello aperto — ignora maiuscole e accenti. Tocca un risultato: ti porta dritto al giorno giusto e apre subito la scheda di quella tappa.

## Riordinare le tappe di un giorno (imperdibili prima, facoltative dove vuoi)

Su ogni tappa trovi ora due frecce **▲▼** accanto al pallino di spunta:
spostano la tappa su o giù nell'ordine del giorno. Utile per mettere in
fila prima le 🟢 Imperdibili e poi decidere tu, una per una, in che punto
inserire le 🟡 Facoltative rispetto al percorso — gli orari si ricalcolano
automaticamente col nuovo ordine, esattamente come quando nascondi una
tappa. Il nuovo ordine è sincronizzato tramite Firestore: resta permanente
e uguale su ogni dispositivo.

**Nota**: ho scelto le frecce invece del trascinamento perché il "drag"
vero è spesso poco affidabile su telefono/tablet dentro un browser (tocchi
e scroll della pagina tendono a confliggere). Le frecce ottengono lo
stesso risultato in modo più solido — se dopo averle provate preferisci
comunque il trascinamento, fammelo sapere e vediamo come implementarlo.

## Anche le modifiche alle tappe sono ora permanenti (Firestore)

Descrizione, note pratiche, posizione Maps e orari personalizzati **di
ogni tappa** passano anche loro da Firestore — stesso trattamento dei
pernottamenti. Da ora, tutto il lavoro che farai su descrizioni/note/
posizioni delle ~150 tappe **non può più andare perso** con una pulizia
della cache, ed è automaticamente uguale su ogni dispositivo.

**La 🎯 Priorità fa eccezione, di proposito**: resta personale per ogni
dispositivo, così ognuno dei 6 partecipanti può segnare le proprie
preferenze in autonomia senza sovrascrivere quelle degli altri — è
pensata per essere raccolta e confrontata con la funzione
"📊 Raccogliere le priorità di tutti" in Info, non per essere già
condivisa in tempo reale. Una volta decisa la versione definitiva insieme,
si può eventualmente rendere condivisa anche quella.

Come per i pernottamenti: se compare un avviso "questa modifica NON è
stata condivisa", il dato resta comunque sul tuo dispositivo ma non si è
salvato su Firestore in quel momento — segnalamelo se càpita spesso.

## I dati dei pernottamenti sono ora permanenti (Firestore)

Camere, bagno, cucina, colazione, orari, parcheggio, WiFi, contatto e note
di ogni pernottamento **non sono più solo locali**: passano anche loro da
Firestore, esattamente come spese e foto. Da ora, una pulizia della cache
del browser **non li cancella più** — restano salvati per sempre e sono
identici su ogni dispositivo che apre l'app.

Se compare un avviso "questi dati NON sono stati condivisi" mentre
compili, significa che il salvataggio su Firestore è fallito per quella
singola modifica (es. connessione assente in quel momento): il dato resta
comunque sul tuo dispositivo, ma segnalamelo se capita spesso.

## Le tue modifiche ora sono al sicuro da future ristrutturazioni

Fino a poco fa, le modifiche a una tappa (descrizione, note, priorità,
foto...) erano collegate alla sua **posizione numerica** nel giorno.
Aggiungere o togliere una tappa in mezzo alle altre spostava tutte quelle
successive, e le modifiche restavano attaccate alla posizione sbagliata.
Ora sono collegate al **nome della tappa**: anche aggiungendo o
riordinando altre tappe intorno, tutto quello che scrivi resta sempre
agganciato al posto giusto.

**Recupero automatico**: al primo avvio dopo questo aggiornamento, l'app
recupera da sola le modifiche già fatte nei giorni che non sono mai stati
ristrutturati (Arrivo, 1, 2, 4, 5, 10, 11, 12, 13, 14). Per i giorni 3, 6,
7, 8 e 9 — cambiati più volte nel tempo — non è possibile risalire con
certezza a dove fosse ogni tappa quando hai scritto il testo, quindi
**quei giorni vanno controllati a mano**: qualcosa potrebbe essere ancora
lì ma spostato sulla tappa vicina, altro potrebbe non esserci più.

## Modificare il nome della struttura

Il nome della struttura è ora tra i campi modificabili di "🏨 Informazioni
struttura" (sia nella scheda dettagliata della tappa "X (pernottamento)"
sia in Info → Pernottamenti): tocca "✏️ Modifica" e trovi "🏨 Nome
struttura" come primo campo del form. Utile se una prenotazione cambia
struttura o se vuoi correggere un nome.

## Modificare la priorità di una tappa

Dentro la scheda dettagliata trovi ora anche **"🎯 Priorità"**: tre chip
(🟢 Imperdibile, 🟡 Facoltativa, 🔴 Da evitare) — tocca quella che vuoi per
cambiarla all'istante, senza bisogno di un tasto "Salva" a parte. Utile per
quando i tuoi 5 compagni di viaggio ti diranno cosa vogliono vedere e cosa
no: aggiorni la priorità direttamente nell'app invece di dover rifare
l'Excel. Come per descrizione e note, resta salvata sul dispositivo — se
tocchi di nuovo la priorità originale, torna semplicemente quella di
partenza senza lasciare alcuna modifica residua.

## Descrizioni dei luoghi

Toccando il nome di una tappa (evidenziato dall'icona ℹ️) si apre una breve
descrizione: cosa rende speciale quel luogo, un po' di storia o geologia,
curiosità. Le ho scritte da zero dopo aver verificato le informazioni su più
fonti (islandafacile.it, guidetoiceland.is, Wikipedia e altri articoli di
viaggio) — non sono testi copiati, ma un riassunto originale pensato per
essere letto in pochi secondi sul posto.

## Spesa personale divisa con alcuni partecipanti

Per il caso "usciamo in pochi a cena, pago io con la mia carta, ma va divisa
solo tra chi c'era": nel modulo "Nuova spesa" → tipo **"👤 Spesa
personale"** → **"Pagato da"** (chi ha messo la carta) → compare
**"Dividere con alcuni partecipanti"**: spunta la casella, poi seleziona
chi altro era presente — chi ha pagato parte già selezionato per comodità,
ma **puoi togliere anche lui** se il caso è "ho anticipato io ma la spesa
non mi riguarda" (es. un regalo per gli altri): in quel caso gli viene
restituito l'intero importo, diviso solo tra le persone rimaste
selezionate. Nell'elenco spese, questa voce compare con l'etichetta
"👥 diviso con N (nomi)".

## Registrare i pagamenti già fatti (chi ti ha già ridato i soldi)

Nella scheda **Budget**, sotto "💰 Saldi tra chi ha anticipato di tasca
propria", trovi **"💸 Registra un pagamento già fatto"**. Usalo quando
qualcuno ti ridà (in contanti, bonifico, ecc.) quello che ti doveva —
**non è una spesa**, è solo l'aggiornamento del saldo tra due persone.

Esempio pratico: paghi 1200€ per una cena di gruppo, ognuno degli altri 5
ti deve 200€. Se 2 di loro te li ridanno e 3 no, registri 2 pagamenti
("Giusi → Emilio, 200€" e "Marco → Emilio, 200€"): i saldi si aggiornano
subito, e vedi chiaramente che restano ancora 3 persone che ti devono
200€ a testa — invece di dover tenere il conto a mente o rischiare di
dimenticarti chi ha già pagato.

I pagamenti registrati compaiono in un elenco sotto ai saldi, con la
possibilità di eliminarli (✕) se inseriti per errore. Sono sincronizzati
tramite Firestore come le spese: permanenti e uguali su ogni dispositivo.

## Cassa comune con carta prepagata e saldi tra i partecipanti

Nella scheda **Info** trovi "Partecipanti al viaggio" (6 nomi già inseriti,
modificabili) e una nuova sezione **"💳 Carta comune"** dove registrare le
quote versate da ciascuno sulla carta prepagata condivisa a inizio viaggio.

Quando registri una spesa, scegli prima il **tipo**:
- **🤝 Cassa comune** → poi scegli **come è stata pagata**:
  - **💳 Carta comune**: normale, la maggior parte dei casi. Scala l'importo
    dal saldo residuo della carta, non genera nessun debito tra le persone.
  - **👤 Anticipato da una persona**: da usare solo nei casi eccezionali (la
    carta non funziona, chi ce l'ha non è presente, ecc.). In questo caso
    scegli anche chi ha anticipato: quella spesa entra nel calcolo dei saldi.
- **👤 Spesa personale**: resta solo di chi l'ha pagata, non tocca né la
  carta né i saldi comuni.

Nella scheda **Budget** trovi ora due sezioni separate:
- **💳 Carta comune**: quote versate, speso dalla carta, saldo residuo — così
  sai sempre se e quando la carta va ricaricata
- **💰 Saldi tra chi ha anticipato di tasca propria**: la lista "chi deve
  dare quanto a chi", calcolata **solo** sulle spese anticipate di persona
  (quelle pagate con la carta non generano debiti, perché sono già soldi
  comuni)

Nella scheda **Budget** trovi anche **"👤 Riepilogo per persona"**: una riga
per ciascuno dei 6 partecipanti con il totale delle sue spese personali e un
contatore 🧾 che conta quante spese ha registrato in tutto (personali +
quelle di cassa comune anticipate di tasca sua) — utile per un colpo d'occhio
su chi sta usando di più l'app o chi ha più spese da tenere a mente. Le spese
pagate con la carta comune non vengono attribuite a nessuno in particolare,
quindi non alzano il contatore di nessuno.

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
- **Budget**: tasto "＋ Aggiungi spesa" in alto (sotto le tab dei giorni) per registrare al volo una spesa (categoria,
  importo, giorno, nota), con riepilogo totale e per persona (÷6)
- **Info**: elenco di tutti i 14 pernottamenti del viaggio
- **Backup**: pulsante per esportare un file JSON con tutte le spese e note
  inserite (utile da fare ogni tanto, così hai una copia anche se il telefono
  si rompe o si perde)
