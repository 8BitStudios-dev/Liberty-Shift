# Il server: Supabase

Lo schema sta in [`supabase/schema.sql`](../supabase/schema.sql), pronto da
incollare. Qui c'è il perché delle scelte e la procedura.

## Cosa ci va, e cosa no

| Resta sul telefono | Va sul server |
|---|---|
| turni e OFF personali | le richieste pubblicate |
| preferenze | le disponibilità dichiarate |
| profilo, cognome intero compreso | proposte, accettazioni, rifiuti |
| calendario importato | nome e iniziale del cognome |

Non esiste una tabella dei turni, ed è la decisione che tiene in piedi la
promessa scritta nelle note d'uso. Una richiesta pubblicata **si porta dentro**
il turno che cede (`cedo_data`, `cedo_start`, `cedo_end`), e una proposta il
turno che offre. Caricare tutti i turni sarebbe stato più comodo da scrivere e
avrebbe dato al server il calendario completo di ognuno in cambio di niente.

## Le cinque tabelle

- **`profili`** — la riga pubblica di una persona. Stesso `id` dell'utente di
  Supabase Auth: due identità da tenere allineate sono due identità che prima o
  poi divergono.
- **`richieste`** — la bacheca. `cerco_giorni` sta fuori dal jsonb perché è
  l'unica parte su cui si interroga davvero ("chi tocca questo giorno").
- **`proposte`** — una per persona per richiesta. `accettata_da` è una lista di
  id: l'accordo scatta a due, e due colonne booleane potrebbero raccontare
  stati impossibili.
- **`disponibilita`** — sette booleani per settimana, a partire dal sabato.
- **`ringraziamenti`** — l'unica cosa che resta dopo il cambio.
- **`traguardi_visti`** — una riga per persona: la soglia più alta dei grazie
  già annunciata, perché l'avviso di un traguardo non torni su un telefono
  nuovo. La legge solo il proprietario: dalla soglia si capirebbe quanti
  grazie hai ricevuto, e quello lo vedi solo tu.

## Row Level Security

Attiva su tutte e cinque, e non è un dettaglio: senza, la chiave pubblica
dell'app basterebbe a leggere e riscrivere qualsiasi riga. È il modo in cui i
progetti Supabase vengono svuotati, e non è un caso raro.

Le regole, in italiano:

- si legge solo da autenticati, mai da anonimi;
- i profili sono leggibili da tutti gli iscritti, perché servono i nomi;
- richieste e disponibilità sono una bacheca: le legge chi è entrato, le
  modifica chi le ha scritte. **Eccezione:** una richiesta su cui c'è un
  accordo la vedono solo le due persone e gli admin (`vedi_richiesta()`, vedi
  *La pulizia, il promemoria e gli accordi*);
- **una proposta la vedono le due persone che riguarda, e nessun altro.** È
  l'unica cosa davvero privata fra due colleghi, insieme al messaggio che si
  scambiano;
- nessuno può scrivere una riga a nome di un altro: ogni `insert` verifica che
  l'autore sia chi sta scrivendo;
- un admin fa eccezione su una cosa sola: chiude o rimuove la richiesta di
  chiunque (e le proposte legate). Non tocca nient'altro, e non può diventare
  admin da solo — vedi *I permessi dell'Admin* più sotto.

## Procedura

1. **Nuovo progetto** su [supabase.com](https://supabase.com) → *New project*.
   Regione Europa (Frankfurt o Ireland): i dati sono di persone che lavorano
   qui. Segna la password del database, serve solo a te.
2. **SQL Editor** → *New query* → incolla `supabase/schema.sql` → *Run*. Si può
   rilanciare senza danni ogni volta che cambia: funzioni, trigger e policy si
   ricreano da soli, e le colonne/vincoli nuovi su tabelle già esistenti
   arrivano dalle `alter table` esplicite dentro il file, non dal solo `create
   table if not exists` (che su una tabella già lì non fa niente — vedi
   `CLAUDE.md`).
3. **Verifica che RLS sia davvero attiva**, invece di fidarsi:
   ```sql
   select tablename, rowsecurity
   from pg_tables where schemaname = 'public';
   ```
   Devono essere tutte `true`. Una tabella a `false` è una tabella aperta.
4. **Imposta il codice del negozio**, sempre da SQL Editor:
   ```sql
   insert into public.configurazione (chiave, valore)
   values ('codice_negozio', extensions.crypt('R667', extensions.gen_salt('bf')))
   on conflict (chiave) do update set valore = excluded.valore;
   ```
5. **Authentication ▸ Sign In / Providers ▸ Email**: lascia acceso solo
   *Email* e spegni *Confirm email* — nessuno riceverà mai una mail, e con la
   conferma accesa ogni registrazione prova a mandarne una e va in blocco per
   limite di invio. Le registrazioni restano **aperte**: a filtrare è il
   codice del negozio.
6. **Le due chiavi**, in *Project Settings ▸ API*:
   - `anon` è pubblica per costruzione: finisce nel codice dell'app, e da sola
     non apre niente perché le policy la fermano;
   - `service_role` scavalca ogni policy. **Non deve mai finire nel browser,
     né in questo repository.** Vive nella dashboard e basta.

## Il codice del negozio

Le registrazioni restano **aperte**, e a fare da cancello c'è il codice del
negozio: chi lo sa entra, chi non lo sa no. Otto account da creare a mano
sarebbero mezz'ora di lavoro e una password da consegnare a ognuno; così ogni
collega si registra da solo la prima volta e basta.

La regola che rende la cosa seria: **il codice non sta nell'app.** Se stesse
lì, chi apre il sorgente della pagina lo leggerebbe in dieci secondi. Sul
server c'è la sua impronta bcrypt, nella tabella `configurazione`, che ha RLS
accesa e nessuna policy: dalle API non la legge nessuno, nemmeno chi è
autenticato.

A verificarlo è `iscrivi()`, una funzione `security definer` che gira dentro
il database: riceve il codice, lo confronta con l'impronta e solo allora scrive
la riga in `profili`. Non esiste nessuna policy di inserimento su `profili`,
quindi quella funzione è l'unica porta.

Il codice si imposta da SQL Editor, e cambiarlo è la stessa riga:

```sql
insert into public.configurazione (chiave, valore)
values ('codice_negozio', extensions.crypt('R667', extensions.gen_salt('bf')))
on conflict (chiave) do update set valore = excluded.valore;
```

Va impostato **in maiuscolo**: il client normalizza (trim + maiuscolo) quello
che la persona digita prima di mandarlo, così "r667" funziona quanto "R667".
Un codice impostato minuscolo verrebbe rifiutato sempre, perché il confronto
con l'impronta è byte per byte.

**Cosa protegge e cosa no.** Chiunque abbia il link può creare un account
Supabase: quello resta aperto. Ma senza codice non ottiene un profilo, e senza
profilo non vede niente — `e_membro()` è nelle policy di lettura, e le chiavi
esterne verso `profili` gli impediscono anche solo di scrivere una riga. Resta
un account vuoto in una casa vuota.

Non protegge invece da un collega che passa il codice a qualcun altro: è un
segreto condiviso da otto persone, quindi vale come la serratura di una porta,
non come una cassaforte. Se un giorno gira troppo, si cambia con la riga qui
sopra e si ridà quello nuovo.

## I permessi dell'Admin

3-4 persone per store hanno `admin: true` sul proprio profilo, e possono
chiudere o rimuovere la richiesta di chiunque, oltre a vedere le statistiche
(`#/statistiche` in app). Non possono accettare una proposta al posto di
qualcuno: quella porta resta chiusa, RLS compresa.

**Si diventa admin da SQL Editor, mai dall'app:**

```sql
update public.profili set admin = true where id = '<uuid della persona>';
```

Non esiste apposta un'interfaccia per farlo dall'app (a meno di essere il
SuperAdmin, vedi sotto). Il motivo non è solo di comodo: la policy
`"ognuno modifica il proprio profilo"` lascia scrivere qualsiasi colonna
della propria riga, `admin` compresa, quindi da sola non impedirebbe a un
domani client di promuoversi da solo. A chiuderlo davvero è il trigger
`blocca_scritture_privilegiate`: quando chi scrive arriva con la chiave
`anon`/`authenticated` (cioè il client dell'app), le colonne `admin`,
`super_admin` e `attivo` tornano al valore che avevano prima, qualunque cosa
il client abbia provato a scriverci. Da SQL Editor o dalla funzione
`Amministrazione` (che scrive con `service_role`) il trigger non tocca
niente: sono gli unici due posti da cui quelle colonne si scrivono davvero.

**Una versione precedente controllava il ruolo sbagliato** (`auth.role() is
distinct from 'service_role'` invece di `auth.role() in ('anon',
'authenticated')`): da SQL Editor `auth.role()` è `null`, perché non c'è
nessun JWT di mezzo, e `null is distinct from 'service_role'` è vero — quindi
bloccava anche l'unico posto da cui si dovrebbe poter scrivere queste colonne
a mano. Un `update ... set super_admin = true` tornava "0 rows updated" senza
nessun errore a spiegare perché. Se hai rilanciato lo schema prima di questo
fix e una promozione non ha avuto effetto, riprova adesso.

**Le policy che aprono le due porte che servono davvero:**

- `"un admin chiude o rimuove qualsiasi richiesta"` su `richieste`: un
  `update` è ammesso a chi ha `admin = true` (funzione `e_admin()`, la stessa
  idea di `e_membro()` ma sul campo booleano invece che sull'esistenza della
  riga), su qualunque riga, non solo la propria.
- `"un admin aggiorna qualsiasi proposta"` su `proposte`, per lo stesso
  motivo: chiudere una richiesta rifiuta le proposte ancora aperte su di essa,
  e chi lo fa non è mai una delle due parti coinvolte.

**Due colonne in più su `richieste`**: `chiusa_da_admin` (chi, se non
l'autore) e `admin_motivo` (perché). Un vincolo (`motivo_admin_obbligatorio`)
impedisce di valorizzare la prima lasciando vuota la seconda: la richiesta
sparisce dalla bacheca di chi l'ha pubblicata per mano di qualcun altro, e
deve sempre sapere perché.

Rimuovere una richiesta non è la stessa cosa di chiuderla: ha un suo stato
(`RIMOSSA`), pensato per un contenuto sbagliato o fuori posto, mentre `CHIUSA`
resta l'amministrazione ordinaria. La pulizia periodica tratta le righe
`RIMOSSA` come le altre chiuse: sparite dopo 90 giorni, non prima.

## I permessi del SuperAdmin

Una sola persona per store, e a differenza dell'admin **può agire dall'app**:
promuovere o retrocedere un admin, disattivare o riattivare il profilo di un
collega. `#/iscritti` in app, riservato a chi ha `super_admin: true`.

**Si diventa SuperAdmin solo da SQL Editor, e resta un ruolo, non un
account diverso:**

```sql
update public.profili set super_admin = true where id = '<uuid della persona>';
```

Nessuna interfaccia per farlo dall'app, nemmeno per il SuperAdmin stesso: un
SuperAdmin che potesse nominarne un altro potrebbe passare il ruolo a
chiunque, che è esattamente il problema che l'unicità del ruolo vuole
evitare. Se un giorno serve cambiarlo, si torna qui.

**Come fa, se il client non può scrivere `admin`/`attivo` da solo?** Passa
dalla funzione `supabase/functions/Amministrazione`, che è l'unico posto
dove vive la chiave `service_role` per queste due colonne (mai nel browser,
come `Calendario` per il calendario). La funzione:

1. legge chi ha chiamato dal token che il gateway ha già verificato (lo
   stesso principio di fiducia di `Calendario`);
2. verifica che quella persona abbia `super_admin = true` — con la chiave
   `service_role`, quindi bypassando RLS, perché è lei stessa a doverlo
   controllare prima di agire;
3. rifiuta di agire su chi ha chiamato (niente auto-promozioni né
   auto-disattivazioni per errore: il pannello serve per gli altri);
4. scrive la colonna giusta con `service_role`, l'unica chiave che il
   trigger lascia passare.

**Disattivare non è cancellare.** Un profilo disattivato (`attivo = false`)
perde l'accesso — `e_membro()` lo richiede esplicitamente, quindi ogni
lettura gli si chiude in faccia come a un estraneo senza codice — ma resta
nel database: le sue richieste passate continuano a comparire nelle
statistiche di chi le guarda. È reversibile con un tocco (`riattiva`), a
differenza di cancellare l'account per sempre, che qui non è previsto.

Le note d'uso promettono che i cambi pubblicati non restano per sempre sul
server: `pulizia_periodica()`, pianificata ogni notte alle 03:00 UTC con
`pg_cron`, fa tre cose, in quest'ordine:

1. cancella le richieste ancora aperte ma scadute (il giorno ceduto è passato,
   o lo sono tutti i giorni cercati: la stessa regola di `isExpired`);
2. chiude da sola le richieste con accordo il cui ultimo giorno è passato da
   più di un giorno (il margine serve a ringraziare), e segna la proposta come
   "cambio inserito" così sparisce dalla posta;
3. toglie le richieste chiuse o rimosse da più di 90 giorni e le disponibilità
   di settimane passate da più di 60.

Le proposte se ne vanno da sole con la richiesta, perché la chiave esterna su
`richieste` è `on delete cascade`.

I ringraziamenti non sono toccati: non sono un cambio pubblicato, sono l'unica
cosa pensata per restare dopo che il cambio è fatto.

I due numeri sono un punto di partenza, non una regola del regolamento: si
cambiano nella funzione, in `supabase/schema.sql`, senza toccare il client —
è lo stesso principio di `RULES` lato app, spostato lato server perché qui
riguarda dati che il client non vede più una volta pubblicati.

## Gli account

L'app non chiede l'email, ma Supabase Auth vuole un identificativo. Si genera
internamente nella forma `nome.cognome.<id>@liberty-shift.internal` e non
compare mai nell'interfaccia: è la riga da cui parti per trovare una persona
quando ti chiede di reimpostare la password.

Il dominio è `.internal`, riservato proprio agli usi interni e non
instradabile: lì non arriva posta nemmeno per sbaglio. Il `.local` scelto
all'inizio è stato abbandonato per forza, non per gusto — Supabase lo rifiuta
con `email_address_invalid`.

**Ritrovare l'indirizzo.** La coda casuale la conosce solo il dispositivo
dell'iscrizione, e un dispositivo nuovo non ce l'ha. La funzione
`candidati_accesso(nome_slug, cognome_slug)` la ritrova: si chiama senza
sessione (è proprio quella che manca), accetta solo nomi già ripuliti
(`[a-z0-9-]`, quindi niente caratteri jolly) e restituisce al massimo cinque
indirizzi, dei soli profili attivi. Rivela che una persona con quel nome è
iscritta, che in un negozio di dieci colleghi non è un segreto; senza la
password non si entra, e i tentativi li limita l'accesso di Supabase. La
ripulitura dei nomi è la stessa dell'iscrizione (`slug()` in
`src/core/supabase.js`): se divergessero, "José" si iscriverebbe con un
indirizzo che poi non ritrova.

Cambio password: passa da `PUT /auth/v1/user`, e in app viene rifiutato senza
rete. La password che conta all'ingresso è quella dell'account, quindi
cambiarne solo l'impronta locale lasciava la persona con la password nuova
rifiutata e la vecchia ancora valida.

Password dimenticata: **non** da *Authentication ▸ Users ▸ Reset password*,
che manda un'email a un indirizzo `.internal` dove non arriva niente. La
persona la chiede dall'app (`chiedi_nuova_password`, senza sessione, scrive in
`richieste_password`), e un admin la reimposta dall'app: la funzione
`Amministrazione`, azione `reimposta-password`, genera una password
temporanea e la imposta con la chiave `service_role`. Un admin può farlo solo
se la richiesta ha meno di 48 ore, il SuperAdmin sempre; la richiesta si
cancella appena usata. `richieste_password` la leggono solo admin e
SuperAdmin.

## Il collaudo, fatto contro il server vero

Provato il 7 settembre 2026, non simulato:

| Prova | Esito |
|---|---|
| registrazione con identificativo `.internal` | sessione ottenuta |
| `iscrivi()` con codice sbagliato | 403, «Codice del negozio sbagliato.» |
| `iscrivi()` con il codice giusto | profilo creato |
| iscritto legge i profili e pubblica una richiesta | 200 e 201 |
| **estraneo registrato senza codice** | profili `[]`, bacheca `[]`, scrittura 403 |
| download di un calendario vero dalla funzione | 29 KB, 64 turni letti |
| download da un dominio fuori elenco | rifiutato, «Indirizzo non ammesso» |

L'ultima riga è quella che conta: un account creato senza codice esiste, entra,
e non vede né tocca niente.

## La funzione che scarica il calendario

`supabase/functions/Calendario/index.ts`. Esiste per una ragione sola: il
browser non può leggere l'indirizzo del calendario aziendale, perché il server
di Apple non manda le intestazioni CORS. Senza questa funzione l'unica strada
era chiedere a ognuno di costruirsi un comando nell'app Comandi, e la prima
persona che ci ha provato si è fermata lì.

**Non salva niente**: riceve un indirizzo, scarica, restituisce il testo e
dimentica tutto. Nessuna tabella viene toccata. L'indirizzo resta sul telefono
di chi lo ha inserito, perché è la chiave che apre il suo calendario e sul
server non servirebbe a nessuno.

Accetta solo `https` e solo verso i domini di Apple, iCloud, Google e Outlook.
Senza quell'elenco la funzione diventerebbe un ponte per raggiungere qualsiasi
indirizzo passando dal nostro server, compresi quelli interni della rete di
Supabase, che dall'esterno non si vedono.

Per pubblicarla: **Edge Functions ▸ Deploy a new function ▸ via editor**, nome
`Calendario`, incolla il contenuto del file e pubblica. **La maiuscola conta**:
gli indirizzi delle funzioni distinguono maiuscole e minuscole, e una `c`
minuscola risponde `404 NOT_FOUND` senza spiegare perché. Serve l'accesso di un
utente autenticato, quindi un estraneo non può usarla come proxy.

**`supabase/functions/Amministrazione/index.ts`** si pubblica nello stesso
modo, stessa maiuscola nel nome. Conta l'**indirizzo** (lo *slug*), non il nome
che compare in elenco: l'editor della dashboard ne propone uno suo, tipo
`quick-task`, e lasciandolo la funzione si chiama Amministrazione ma risponde
a un altro indirizzo. L'app chiama `/functions/v1/Amministrazione` e riceve
`Requested function was not found`. Fino al lancio era andata proprio così, con
dentro il modello "hello world" invece del codice: "Gestisci iscritti" non
aveva mai funzionato. Non chiede nessuna chiave da impostare a
mano: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono già nell'ambiente di
ogni Edge Function del progetto, messe lì da Supabase stesso. È proprio
perché vivono solo lì, mai nel codice o nel repository, che questa funzione
può usare `service_role` in sicurezza — a differenza di `Calendario`, che non
ne ha bisogno perché non scrive niente.

## La sessione che scade mentre l'app è aperta

Il token di accesso dura **un'ora**; l'app resta aperta per giorni. La prima
chiamata dopo la scadenza tornava `401`, che il traduttore rendeva con «non hai
accesso a questo dato»: una frase che manda a cercare un permesso mancante
quando il problema era solo un token vecchio.

Ora `chiama()` riconosce quel caso, usa il `refresh_token` per prendere un
token nuovo e **ripete la richiesta una volta sola**. Se anche il rinnovo
fallisce, la sessione morta viene cancellata e il messaggio dice la cosa vera,
cioè di rientrare con la password. Un solo tentativo, mai due: un rifiuto vero
di permessi non deve diventare un giro infinito di rinnovi.

Tre test in `tests/regressioni.test.js` coprono i tre esiti, con un server
finto: rinnovo riuscito, rinnovo fallito, rifiuto vero.

## Due trappole pagate, perché non si ripetano

**Il nome della funzione distingue le maiuscole.** Pubblicata come
`Calendario`, l'indirizzo `/functions/v1/calendario` risponde `404 NOT_FOUND`
senza dire che è questione di una lettera.

**Le funzioni vogliono le chiavi nuove.** Database e accesso accettano ancora
la `anon` in formato JWT; le Edge Functions no, e rispondono «The apikey header
matched no key configured», che sembra un problema di permessi e non lo è. Per
quelle serve la chiave `sb_publishable_…`, che sta in Project Settings ▸ API
Keys ed è pubblica come l'altra.

Una terza, più banale: l'editor della dashboard apre una funzione nuova col
codice di esempio dentro. Se non lo si cancella prima di incollare, la funzione
risponde `Hello` e sembra rotta l'app.

## La bacheca condivisa

Tutto passa da [`src/core/sincronia.js`](../src/core/sincronia.js), che è
l'unico posto a conoscere sia i nomi delle colonne sia la forma delle entità
dell'app. Quando una colonna cambia nome, cambia lì e basta.

**Gli id li genera il telefono.** Una richiesta nasce già con un `uuid`, che è
lo stesso da questa parte e dall'altra. Farselo restituire dal server avrebbe
voluto dire riscrivere l'id e tutti i suoi riferimenti al momento della
risposta, e non poter pubblicare niente senza rete.

**Si scrive prima in locale, poi si manda.** Ogni scrittura entra in una coda
che parte per conto suo. L'app si usa in magazzino, dove il campo va e viene, e
una proposta persa perché in quel momento non c'era linea sarebbe il modo più
veloce per far smettere di fidarsi. L'ordine della coda è sacro: una proposta
che arrivasse prima della sua richiesta verrebbe rifiutata dalla chiave
esterna, quindi al primo rifiuto ci si ferma invece di saltare avanti.

**Un solo svuotamento per volta.** Pubblicare fa partire la coda, e un attimo
dopo può partire anche quella dell'apertura: due giri in parallelo mandavano la
stessa riga due volte, e la seconda restava incastrata a bloccare tutte quelle
dietro. Trovato contro il server vero, non a tavolino.

**Una riga che c'è già è arrivata.** Visto che gli id sono nostri, un `409` non
è un guasto: è il tentativo precedente che era andato a buon fine. Trattarlo da
errore voleva dire non mandare più niente.

**Il turno torna a essere un turno.** Il motore ragiona su turni con un id, non
su tre colonne: scendendo, `cedo_data/start/end` ridiventano un turno vero. Se
è mio e ce l'ho già, si riusa quello invece di crearne un secondo per lo stesso
giorno, che sfalserebbe le ore della settimana e mostrerebbe due righe nel
calendario.

**Io resto io.** Sul telefono sono `u_io` da prima dell'iscrizione, e i miei
turni sono appesi a quell'id. La traduzione fra il mio id del server e quello
di casa avviene in una funzione sola. Della mia riga in `profili` scendono solo
`admin`, `super_admin` e `attivo`: è così che chi viene nominato da SQL Editor
lo scopre, alla prima sincronizzazione.

**Quello che è nato qui resta.** A distinguere le cose scese dal server è il
campo `daServer`: a ogni discesa si butta e si riscrive solo quello che era
sceso.

### Cosa il server non può fare, e perché va bene
Non esiste una tabella dei turni, quindi il server non sa quando lavorano i
colleghi. Ne discende che l'elenco «chi può aiutarmi» non si può calcolare per
una persona vera: per loro l'unico segnale è la **disponibilità dichiarata**,
che infatti viaggia. Al contrario funziona benissimo: «quali richieste posso
risolvere io» si calcola sui miei turni, che sono qui.

Le notifiche dentro l'app restano locali e non attraversano i dispositivi: a
portare l'informazione è la posta, che è costruita sulle proposte e quindi
sincronizza. A telefono chiuso ci pensano le notifiche push, più sotto.

### Il collaudo, contro il server vero
Due dispositivi, due account, il giro completo:

| Prova | Esito |
|---|---|
| Anna pubblica una richiesta | id `uuid`, una sola scrittura |
| Bruno apre l'app | vede la richiesta, il turno ceduto e il nome |
| Bruno propone il suo turno | arriva con messaggio e turno offerto |
| Anna accetta | `ACCORDO` da entrambe le parti |
| la richiesta cambia stato | `ACCORDO` anche per Bruno |
| **estraneo registrato senza codice** | profili `[]`, bacheca `[]` |

## Un turno, un accordo
Il trigger `turno_impegnato` (in `schema.sql`) parte quando una proposta
diventa `ACCORDO` e fa decadere le altre proposte in attesa che usano lo
stesso turno: quelle di chi ha proposto con lo stesso giorno, e quelle che
l'autore della richiesta aveva fatto offrendo il giorno che ora lascia. Sul
server il turno è la coppia (persona, giorno). Le proposte chiuse così hanno
`motivo_decadenza = 'TURNO_IMPEGNATO'`, e `send-push` manda a chi le aveva
ricevute "Proposta non scelta". La funzione è `security definer` perché tocca
proposte di altre persone, che chi accetta non potrebbe modificare.

## Una proposta ritirata
Chi ha fatto una proposta la può ritirare finché l'altra persona non l'ha
accettata: l'app la cancella (policy "si ritira solo la propria proposta").
Il trigger `notifica_proposta` ascolta anche le cancellazioni, e manda a
`send-push` la riga cancellata solo se era ancora `PROPOSTA` o `IN_ATTESA` e a
cancellarla è stato chi l'aveva fatta (`auth.uid() = da_user_id`). Così la
pulizia dei 90 giorni e una richiesta tolta dal suo autore, che cancellano le
proposte a cascata, non fanno partire "Proposta ritirata" a nessuno.

Nel trigger la cancellazione si riconosce come `tg_op not in ('INSERT',
'UPDATE')` invece che col suo nome: scritto così passa anche dal connettore
Supabase, che sulla parola si blocca.

## Uno scambio annullato dopo l'accordo
Quando UKG blocca un cambio già concordato, una delle due parti lo annulla
dall'app: la proposta passa da `ACCORDO` a `RIFIUTATA` con `annullata_il`
valorizzato. La colonna è quello che distingue un annullamento da un rifiuto:
`send-push` scrive "Scambio annullato" all'altra parte (chiunque dei due abbia
annullato), non "Proposta rifiutata" a chi l'aveva fatta.

## La pulizia, il promemoria e gli accordi

**Chi vede una richiesta con un accordo.** La policy di lettura su `richieste`
passa da `vedi_richiesta(id, autore_id)`: se esiste una proposta in `ACCORDO`,
la richiesta la vedono l'autore, chi ha fatto quella proposta e gli admin.
La funzione è `security definer` perché deve guardare le proposte di tutti, e
la policy sulle proposte ne mostra a ciascuno solo due. Decide dalla proposta
in `ACCORDO` e non dallo stato della richiesta: dopo "Cambio inserito" la
richiesta è `CHIUSA`, ma l'accordo che c'è stato non è diventato pubblico.

**Il promemoria.** `promemoria_accordi()` gira ogni mattina alle 08:00 UTC (le
9 o le 10 a Roma). Per ogni accordo non ancora inserito il cui prossimo giorno
cade entro due giorni chiama `send-push` due volte, una per persona, e segna
`promemoria_il` perché non parta una seconda volta. Senza il segreto
`push_webhook` in Vault non fa niente, e non segna niente.

**Perché la pulizia si lancia a mano.** `schema.sql` si rilancia da SQL Editor
(vedi *Procedura*). Il connettore con cui lavora Claude Code chiede una
conferma interattiva per ogni testo che contenga `delete`, e in una sessione
non interattiva non può comparire: la funzione `pulizia_periodica()` quindi
non si può aggiornare da lì, e va incollata da SQL Editor.

## Le notifiche push

Due momenti, e solo due: arriva una proposta (avvisato chi ha pubblicato la
richiesta) e una proposta si chiude con un accordo o un rifiuto (avvisato chi
l'aveva fatta). Chi compie l'azione non riceve mai la notifica della propria
azione, e chi è stato disattivato non ne riceve più.

Il percorso, tutto sul server:

1. il trigger `notifica_proposta` su `proposte` filtra gli eventi che non
   interessano a nessuno e, per gli altri, chiama la funzione con `pg_net`
   senza aspettarla: la proposta si salva anche se il servizio push di Apple
   è lento o giù;
2. la Edge Function `send-push` (pubblicata **senza** verifica JWT: la chiama
   il database, e la protegge il segreto nell'intestazione `x-webhook-secret`)
   sceglie testo e destinatario, cifra il messaggio per ogni dispositivo e lo
   firma con la chiave VAPID;
3. un dispositivo che risponde 404 o 410 ha spento le notifiche o non esiste
   più, e la funzione toglie la sua riga da `push_subscriptions`.

Le risposte della funzione restano per qualche ora in `net._http_response`
(`{"inviate":1,"rimosse":0,"errori":[]}`): è il primo posto dove guardare se
una notifica non arriva, prima ancora dei log.

**I segreti stanno in Vault**, non nei secrets delle Edge Functions:
`push_vapid_pubblica`, `push_vapid_privata`, `push_webhook`. La funzione li
legge con `service_role` da `segreti_push()`, che nessuna chiave dell'app può
chiamare; il trigger legge solo `push_webhook`. Senza `push_webhook` il trigger
non chiama niente e le proposte funzionano come prima. Per cambiare le chiavi:

```sql
select vault.update_secret(id, '<nuovo valore>')
from vault.secrets where name = 'push_vapid_privata';
```

Cambiare la coppia VAPID vuol dire cambiare anche `chiaveVapidPubblica` in
`src/core/config.js`, e tutti i dispositivi dovranno riaccendere le notifiche:
le iscrizioni vecchie sono legate alla chiave vecchia.

**Il mittente VAPID** è l'indirizzo del sito, non un'email: il protocollo
accetta entrambi, e così nessun indirizzo personale arriva ai servizi push.

**Su iPhone** le push esistono da iOS 16.4 e solo per l'app aggiunta alla
schermata Home e aperta da lì. Da Safari le API mancano del tutto: il
riquadro Notifiche lo riconosce e spiega il passaggio invece di dire "non
supportate". Il permesso si chiede solo dentro il tocco sull'interruttore,
mai all'apertura: Safari rifiuta in silenzio una richiesta fatta a freddo.

**Collaudo.** Chromium in modalità incognito (quella dei test automatici) non
supporta la Push API, quindi il collaudo della catena server si fa con
dispositivi finti che puntano a un endpoint di prova: uno che risponde 201
verifica cifratura e firma, uno che risponde 410 verifica la pulizia. Il tocco
vero sull'interruttore va provato su un telefono.

## Cosa manca per collegarlo

1. ~~la prima apertura chiede il codice del negozio, crea l'account e il
   profilo~~ — fatto;
2. ~~`store.js` legge e scrive sul server **le sole cose pubblicate**~~ — fatto;
3. ~~l'accesso passa da Supabase Auth~~ — fatto.

E prima di aprirlo ai colleghi, la domanda del capitolo 27, che con un server
condiviso diventa più netta, non meno: vedi
[`05-decisioni-aperte.md`](05-decisioni-aperte.md).

## Notifiche sulle richieste compatibili

Chi sceglie "richieste compatibili" (Profilo, notifiche) acconsente a mandare al
server i turni dei prossimi 28 giorni (solo data, tipo e orari) e le preferenze.
Stanno in `notifiche_preferenze`: la legge solo il proprietario e `service_role`,
**mai admin né colleghi**. Tornando a "solo proposte dirette" la riga si svuota.

Quando nasce una richiesta, il trigger `notifica_richiesta` chiama `send-push`
con `type: RICHIESTA`; la funzione usa il motore vero (`core/`, copia generata
da `npm run funzioni`) per decidere chi avvisare. Dopo ogni modifica a
`src/core/` va rilanciato `npm run funzioni` e **ripubblicata la funzione**: i
test verificano che le copie siano identiche, non che siano online.
Limiti noti: il server non conosce le preferenze dell'autore, i suoi altri turni
e le richieste altrui, quindi in casi al limite il telefono può rispondere
diversamente. Un calendario non aggiornato da 14 giorni non genera avvisi.
