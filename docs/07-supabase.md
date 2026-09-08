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

## Row Level Security

Attiva su tutte e cinque, e non è un dettaglio: senza, la chiave pubblica
dell'app basterebbe a leggere e riscrivere qualsiasi riga. È il modo in cui i
progetti Supabase vengono svuotati, e non è un caso raro.

Le regole, in italiano:

- si legge solo da autenticati, mai da anonimi;
- i profili sono leggibili da tutti gli iscritti, perché servono i nomi;
- richieste e disponibilità sono una bacheca: le legge chi è entrato, le
  modifica chi le ha scritte;
- **una proposta la vedono le due persone che riguarda, e nessun altro.** È
  l'unica cosa davvero privata fra due colleghi, insieme al messaggio che si
  scambiano;
- nessuno può scrivere una riga a nome di un altro: ogni `insert` verifica che
  l'autore sia chi sta scrivendo.

## Procedura

1. **Nuovo progetto** su [supabase.com](https://supabase.com) → *New project*.
   Regione Europa (Frankfurt o Ireland): i dati sono di persone che lavorano
   qui. Segna la password del database, serve solo a te.
2. **SQL Editor** → *New query* → incolla `supabase/schema.sql` → *Run*. Si può
   rilanciare senza danni: ogni oggetto è creato "if not exists" e le policy
   vengono ricreate.
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

## La pulizia periodica

Le note d'uso promettono che i cambi pubblicati non restano per sempre sul
server: `pulizia_periodica()`, pianificata ogni notte con `pg_cron`, cancella
le richieste chiuse o scadute da più di 90 giorni e le disponibilità di
settimane passate da più di 60. Le proposte se ne vanno da sole, perché la
chiave esterna su `richieste` è `on delete cascade`.

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

Cambio password: passa da `PUT /auth/v1/user`, e in app viene rifiutato senza
rete. La password che conta all'ingresso è quella dell'account, quindi
cambiarne solo l'impronta locale lasciava la persona con la password nuova
rifiutata e la vecchia ancora valida.

Password dimenticata: *Authentication ▸ Users ▸* la persona *▸ Reset password*.
È un potere sugli account altrui, e le note d'uso dicono già il limite — si usa
su richiesta dell'interessato e per nient'altro.

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

**Io resto io.** Sul telefono sono `u_lorenzo` da prima che il server
esistesse, e i miei turni sono appesi a quell'id. La traduzione fra il mio id
del server e quello di casa avviene in una funzione sola.

**Le persone inventate restano.** La demo convive con i colleghi veri finché
serve a mostrare l'app. A distinguerle è il campo `daServer`: a ogni discesa si
butta e si riscrive solo quello che era sceso, e le persone inventate non
vengono toccate.

### Cosa il server non può fare, e perché va bene
Non esiste una tabella dei turni, quindi il server non sa quando lavorano i
colleghi. Ne discende che l'elenco «chi può aiutarmi» non si può calcolare per
una persona vera: per loro l'unico segnale è la **disponibilità dichiarata**,
che infatti viaggia. Al contrario funziona benissimo: «quali richieste posso
risolvere io» si calcola sui miei turni, che sono qui.

Le notifiche restano locali e non attraversano i dispositivi. A portare
l'informazione è la posta, che è costruita sulle proposte e quindi sincronizza.

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

## Cosa manca per collegarlo

1. ~~la prima apertura chiede il codice del negozio, crea l'account e il
   profilo~~ — fatto;
2. ~~`store.js` legge e scrive sul server **le sole cose pubblicate**~~ — fatto;
3. ~~l'accesso passa da Supabase Auth~~ — fatto.

E prima di aprirlo ai colleghi, la domanda del capitolo 27, che con un server
condiviso diventa più netta, non meno: vedi
[`05-decisioni-aperte.md`](05-decisioni-aperte.md).
