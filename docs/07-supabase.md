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
4. **Authentication ▸ Providers**: lascia acceso solo *Email*, spegni
   *Confirm email* (nessuno riceverà mai una mail) e le registrazioni
   pubbliche. Gli account li crei tu.
5. **Le due chiavi**, in *Project Settings ▸ API*:
   - `anon` è pubblica per costruzione: finisce nel codice dell'app, e da sola
     non apre niente perché le policy la fermano;
   - `service_role` scavalca ogni policy. **Non deve mai finire nel browser,
     né in questo repository.** Vive nella dashboard e basta.

## Gli account

L'app non chiede l'email, ma Supabase Auth vuole un identificativo. Si genera
internamente nella forma `nome.cognome.<id>@liberty-shift.local` e non compare
mai nell'interfaccia: è la riga da cui parti per trovare una persona quando ti
chiede di reimpostare la password.

Password dimenticata: *Authentication ▸ Users ▸* la persona *▸ Reset password*.
È un potere sugli account altrui, e le note d'uso dicono già il limite — si usa
su richiesta dell'interessato e per nient'altro.

## Cosa manca per collegarlo

Lo schema c'è, il client no. Servono tre cose, in quest'ordine:

1. il client Supabase caricato nell'app (una `<script>` da CDN, o incorporato
   nel file unico);
2. `salva()` e `carica()` in `src/core/store.js` che parlano col server invece
   che con `localStorage`, **per le sole cose pubblicate**: turni e preferenze
   restano dove sono;
3. l'accesso che passa da Supabase Auth invece che dall'impronta locale. Per
   chi usa l'app non cambia niente: password, e si entra.

E prima di aprirlo ai colleghi, la domanda del capitolo 27, che con un server
condiviso diventa più netta, non meno: vedi
[`05-decisioni-aperte.md`](05-decisioni-aperte.md).
