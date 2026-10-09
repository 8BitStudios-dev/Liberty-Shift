-- Liberty Shift — schema Supabase
--
-- Da incollare nell'SQL Editor del progetto e rilanciare ogni volta che
-- cambia: funzioni, trigger e policy si ricreano da soli (drop + create), e
-- le tabelle sono "create if not exists" per un progetto nuovo. Una colonna o
-- un vincolo aggiunti a una tabella che esiste già, però, servono anche come
-- `alter table` esplicita — il blocco `create table if not exists` da solo
-- non li farebbe comparire su un database già avviato. Cercare "non tocca una
-- tabella che esiste già" più sotto mostra dove.
--
-- Il criterio che decide cosa sta qui dentro è uno solo, ed è lo stesso delle
-- note d'uso: **esce dal telefono solo quello che una persona pubblica apposta
-- perché i colleghi lo leggano.** I turni personali restano sul dispositivo,
-- quindi una richiesta pubblicata si porta dietro il turno che cede, copiato
-- dentro di sé. Non c'è nessuna tabella dei turni, ed è voluto: caricarli
-- tutti darebbe al server il calendario completo di ognuno in cambio di
-- niente.

-- ---------------------------------------------------------------- profili

-- La riga pubblica di una persona: quello che i colleghi vedono di lei.
-- Il cognome intero non c'è. L'id è quello di Supabase Auth, così non
-- esistono due identità da tenere allineate.
create table if not exists public.profili (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null check (length(nome) between 1 and 40),
  cognome_iniziale text not null check (length(cognome_iniziale) = 1),
  contratto       text not null check (contratto in ('FT', 'PT')),
  ore_settimanali smallint not null check (ore_settimanali in (20, 25, 30, 40)),
  genere          text not null default 'X' check (genere in ('F', 'M', 'X')),
  admin           boolean not null default false,
  -- Un'unica persona per store, impostata a mano da SQL Editor come il
  -- codice del negozio: può promuovere o retrocedere gli admin e
  -- disattivare un profilo dall'app, tramite la funzione `Amministrazione`.
  super_admin     boolean not null default false,
  -- Disattivato è reversibile e non è una cancellazione: perde l'accesso
  -- (vedi `e_membro()`) ma le sue richieste passate restano nelle
  -- statistiche di chi le ha viste. Cancellare l'account per sempre è
  -- un'altra cosa, e questa colonna non la fa.
  attivo          boolean not null default true,
  creato_il       timestamptz not null default now()
);

-- `create table if not exists` non tocca una tabella che esiste già: su un
-- progetto avviato prima di queste due colonne, il blocco sopra non fa niente
-- e loro restano mancanti in silenzio. Le `alter table` qui sotto sono quello
-- che aggiorna davvero un database già in piedi; sono la parte che conta ogni
-- volta che si aggiunge una colonna a una tabella che c'è da prima.
alter table public.profili add column if not exists super_admin boolean not null default false;
alter table public.profili add column if not exists attivo boolean not null default true;

-- ------------------------------------------------------------ richieste

-- Una richiesta pubblicata. `cedo_*` è il turno che si lascia, copiato qui
-- dentro perché i turni vivono sul telefono; `cerco` è il lato che si
-- desidera, nella stessa forma che usa il motore (mode, entroLe, dalleOre,
-- evitaChiusura, note).
--
-- `cerco_giorni` sta fuori dal jsonb perché è l'unica parte su cui si
-- interroga davvero: il calendario chiede "chi tocca questo giorno".
create table if not exists public.richieste (
  id              uuid primary key default gen_random_uuid(),
  autore_id       uuid not null references public.profili(id) on delete cascade,
  tipo            text not null check (tipo in ('ORARIO', 'OFF')),
  stato           text not null default 'APERTA'
                    check (stato in ('APERTA', 'PROPOSTA', 'IN_ATTESA', 'ACCORDO', 'CHIUSA', 'SCADUTA', 'RIMOSSA')),
  priorita_fino_a timestamptz,
  cedo_data       date not null,
  cedo_start      time,
  cedo_end        time,
  cedo_flessibile boolean not null default false,
  cerco_giorni    date[] not null default '{}',
  cerco           jsonb not null default '{}'::jsonb,
  creata_il       timestamptz not null default now(),
  chiusa_il       timestamptz,
  -- Chi l'ha chiusa d'ufficio o rimossa, se non è stata l'autrice o l'autore
  -- stesso: un admin che agisce sulla richiesta di qualcun altro. Il motivo
  -- non è mai facoltativo in quel caso, perché la richiesta sparisce dalla
  -- bacheca di chi l'ha pubblicata senza che sia stata lei a chiuderla.
  chiusa_da_admin uuid references public.profili(id),
  admin_motivo    text,
  -- Un turno lavorato ha due orari o nessuno: un turno con solo l'inizio è
  -- un dato rotto, e il posto per fermarlo è qui, non nella UI.
  constraint orari_coerenti check (
    (cedo_start is null and cedo_end is null) or (cedo_start is not null and cedo_end is not null)
  ),
  constraint motivo_admin_obbligatorio check (
    chiusa_da_admin is null or coalesce(length(trim(admin_motivo)), 0) > 0
  )
);

-- Stessa ragione delle due `alter table` su profili qui sopra: su una
-- tabella richieste già esistente, `chiusa_da_admin`/`admin_motivo` e il
-- vincolo aggiornato su `stato` (che ora ammette anche 'RIMOSSA') non
-- arriverebbero mai da soli.
alter table public.richieste add column if not exists chiusa_da_admin uuid references public.profili(id);
alter table public.richieste add column if not exists admin_motivo text;

alter table public.richieste drop constraint if exists richieste_stato_check;
alter table public.richieste add constraint richieste_stato_check
  check (stato in ('APERTA', 'PROPOSTA', 'IN_ATTESA', 'ACCORDO', 'CHIUSA', 'SCADUTA', 'RIMOSSA'));

alter table public.richieste drop constraint if exists motivo_admin_obbligatorio;
alter table public.richieste add constraint motivo_admin_obbligatorio
  check (chiusa_da_admin is null or coalesce(length(trim(admin_motivo)), 0) > 0);

create index if not exists richieste_giorno_idx on public.richieste (cedo_data);
create index if not exists richieste_giorni_idx on public.richieste using gin (cerco_giorni);
create index if not exists richieste_stato_idx on public.richieste (stato);

-- -------------------------------------------------------------- proposte

-- La risposta a una richiesta. Anche qui il turno offerto è copiato, per la
-- stessa ragione. `accettata_da` tiene gli id di chi ha detto sì: l'accordo
-- scatta a due, e tenerlo come lista evita due colonne booleane che possono
-- raccontare stati impossibili.
create table if not exists public.proposte (
  id               uuid primary key default gen_random_uuid(),
  richiesta_id     uuid not null references public.richieste(id) on delete cascade,
  da_user_id       uuid not null references public.profili(id) on delete cascade,
  a_user_id        uuid not null references public.profili(id) on delete cascade,
  turno_data       date not null,
  turno_start      time,
  turno_end        time,
  messaggio        text default '',
  accettata_da     uuid[] not null default '{}',
  stato            text not null default 'IN_ATTESA'
                     check (stato in ('IN_ATTESA', 'ACCORDO', 'RIFIUTATA')),
  motivo_rifiuto   text,
  cambio_inserito  boolean not null default false,
  creata_il        timestamptz not null default now(),
  promemoria_il    timestamptz,
  -- Una proposta per persona per richiesta: riproporre si fa cancellando.
  unique (richiesta_id, da_user_id)
);

-- `promemoria_il` ricorda quando è partito il promemoria "hai inserito il
-- cambio?", che parte una volta sola per accordo. Nata dopo la tabella: su un
-- database già in piedi la porta questo alter table, non il create qui sopra.
alter table public.proposte add column if not exists promemoria_il timestamptz;

-- `pausa_mezzora`: un Part Time che ha nel contratto la pausa pranzo di
-- mezz'ora. I suoi turni durano mezz'ora in più (14:30–20:00 per 5 ore), e
-- quella mezz'ora non è lavoro. Serve anche ai colleghi: quando prendono un
-- suo turno, la pausa passa a loro. Si scrive dal profilo (la policy
-- "ognuno modifica il proprio profilo" lo permette).
alter table public.profili add column if not exists pausa_mezzora boolean not null default false;

-- `confermata_il`: quando il telefono di una delle due parti ha visto nel suo
-- calendario dei turni che UKG ha approvato lo scambio. Non porta nessun
-- turno, solo l'ora: serve ad avvisare l'altra parte (`notifica_proposta`).
alter table public.proposte add column if not exists confermata_il timestamptz;

-- `annullata_il`: uno scambio concordato che una delle due parti ha annullato
-- prima che UKG lo approvasse (succede che UKG lo blocchi). Lo stato diventa
-- `RIFIUTATA` come per ogni proposta chiusa, e questa colonna dice a
-- `send-push` che non è un rifiuto ma un annullamento dopo l'accordo.
alter table public.proposte add column if not exists annullata_il timestamptz;

create index if not exists proposte_richiesta_idx on public.proposte (richiesta_id);

-- --------------------------------------------------------- disponibilità

-- "Quel giorno sarei disposto a scambiare", dichiarato settimana per
-- settimana. `settimana` è la data del sabato che la apre, e `giorni` ha
-- sette valori a partire da lì.
create table if not exists public.disponibilita (
  user_id    uuid not null references public.profili(id) on delete cascade,
  settimana  date not null,
  giorni     boolean[] not null,
  primary key (user_id, settimana),
  constraint sette_giorni check (array_length(giorni, 1) = 7)
);

-- ------------------------------------------------------- ringraziamenti

-- L'unica cosa che resta dopo che il cambio è fatto.
create table if not exists public.ringraziamenti (
  id          uuid primary key default gen_random_uuid(),
  proposta_id uuid references public.proposte(id) on delete set null,
  da_user_id  uuid not null references public.profili(id) on delete cascade,
  a_user_id   uuid not null references public.profili(id) on delete cascade,
  testo       text default '',
  creato_il   timestamptz not null default now(),
  unique (proposta_id, da_user_id)
);

-- ======================================================= codice del negozio
--
-- Il cancello all'ingresso. Le registrazioni restano aperte — nessun account
-- da creare a mano per otto persone — ma per entrare davvero serve il codice
-- del negozio, che i colleghi sanno e un estraneo no.
--
-- Il codice **non sta nell'app**: nell'app finirebbe in chiaro, e chi apre il
-- sorgente della pagina lo leggerebbe in dieci secondi. Qui c'e' la sua
-- impronta bcrypt, in una tabella con RLS accesa e nessuna policy: dalle API
-- non e' leggibile da nessuno, nemmeno da chi e' autenticato. A confrontarlo
-- e' la funzione qui sotto, che gira dentro il database.
--
-- Il codice si imposta (e si cambia) da SQL Editor, con:
--
--   insert into public.configurazione (chiave, valore)
--   values ('codice_negozio', extensions.crypt('R667', extensions.gen_salt('bf')))
--   on conflict (chiave) do update set valore = excluded.valore;
--
-- Va impostato **in maiuscolo**: il client normalizza quello che digita la
-- persona (trim + maiuscolo, vedi src/core/supabase.js) prima di mandarlo
-- qui, cosi' "r667" funziona quanto "R667". Un codice impostato minuscolo
-- verrebbe rifiutato sempre, perche' il confronto e' byte per byte.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.configurazione (
  chiave text primary key,
  valore text not null
);
alter table public.configurazione enable row level security;
-- Nessuna policy, ed e' voluto: nessuna chiave dell'app puo' leggere qui.

/**
 * Iscrive chi conosce il codice del negozio.
 *
 * `security definer`: gira coi permessi di chi l'ha creata, quindi puo'
 * leggere `configurazione` e scrivere in `profili` anche se il chiamante non
 * potrebbe. E' il solo modo per entrare: la policy di inserimento su `profili`
 * non esiste piu'.
 *
 * Il codice arriva in chiaro dal client e viene confrontato con l'impronta:
 * chi sbaglia riceve un errore e basta, senza sapere quanto ci e' andato
 * vicino.
 */
create or replace function public.iscrivi(
  codice            text,
  nome              text,
  cognome_iniziale  text,
  contratto         text,
  ore_settimanali   smallint,
  genere            text default 'X'
) returns public.profili
language plpgsql security definer set search_path = public, extensions as $$
declare
  atteso text;
  nuovo  public.profili;
begin
  if auth.uid() is null then
    raise exception 'Serve prima un accesso.' using errcode = '28000';
  end if;

  select valore into atteso from public.configurazione where chiave = 'codice_negozio';
  if atteso is null then
    raise exception 'Il codice del negozio non e'' ancora stato impostato.' using errcode = '28000';
  end if;
  if extensions.crypt(coalesce(codice, ''), atteso) <> atteso then
    raise exception 'Codice del negozio sbagliato.' using errcode = '28000';
  end if;

  insert into public.profili (id, nome, cognome_iniziale, contratto, ore_settimanali, genere)
  values (auth.uid(), nome, upper(left(cognome_iniziale, 1)), contratto, ore_settimanali, coalesce(genere, 'X'))
  on conflict (id) do update
    set nome = excluded.nome,
        cognome_iniziale = excluded.cognome_iniziale,
        contratto = excluded.contratto,
        ore_settimanali = excluded.ore_settimanali,
        genere = excluded.genere
  returning * into nuovo;

  return nuovo;
end $$;

revoke all on function public.iscrivi(text, text, text, text, smallint, text) from public, anon;
grant execute on function public.iscrivi(text, text, text, text, smallint, text) to authenticated;

/**
 * Sei uno del negozio?
 *
 * Un account senza profilo e' un account che non ha mai saputo il codice: le
 * policy lo lasciano entrare in casa e non gli fanno vedere niente. Sta in una
 * funzione `security definer` perche' una policy su `profili` che interroga
 * `profili` andrebbe in ricorsione infinita.
 */
create or replace function public.e_membro() returns boolean
language sql security definer stable set search_path = public as $$
  -- `attivo` conta quanto l'esistenza della riga: un profilo disattivato dal
  -- SuperAdmin perde l'accesso esattamente come un estraneo senza codice,
  -- perché ogni policy di lettura passa da qui.
  select exists (select 1 from public.profili where id = auth.uid() and attivo);
$$;

revoke all on function public.e_membro() from public, anon;
grant execute on function public.e_membro() to authenticated;

/**
 * Sei uno dei 3-4 admin del negozio?
 *
 * Nessuno si nomina admin da solo: il campo si imposta a mano dall'SQL Editor
 * (`update profili set admin = true where id = '...'`) o dalla funzione
 * `Amministrazione`, mai da un client autenticato normale. Il trigger
 * `blocca_scritture_privilegiate` più sotto è la seconda gamba dello stesso
 * vincolo: anche se un giorno l'app cominciasse a scrivere su `profili`,
 * quella colonna resterebbe fuori portata.
 */
create or replace function public.e_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select admin and attivo from public.profili where id = auth.uid()), false);
$$;

revoke all on function public.e_admin() from public, anon;
grant execute on function public.e_admin() to authenticated;

-- ============================================================== sicurezza
--
-- Row Level Security su tutte le tabelle. Senza, la chiave pubblica dell'app
-- basterebbe a leggere e riscrivere qualsiasi riga: è il modo in cui i
-- progetti Supabase vengono svuotati, e non è un caso raro.
--
-- Le regole in italiano, prima del codice:
--   · si legge solo da iscritti al negozio, mai da anonimi e nemmeno da un
--     account che si e' registrato senza conoscere il codice;
--   · i profili sono leggibili da tutti gli iscritti (servono i nomi);
--   · le richieste e le disponibilità sono una bacheca: le legge chiunque sia
--     entrato, le modifica solo chi le ha scritte;
--   · una proposta la vedono le due persone che riguarda, e nessun altro;
--   · nessuno può scrivere una riga a nome di un altro.

alter table public.profili        enable row level security;
alter table public.richieste      enable row level security;
alter table public.proposte       enable row level security;
alter table public.disponibilita  enable row level security;
alter table public.ringraziamenti enable row level security;

-- profili -----------------------------------------------------------------
drop policy if exists "profili leggibili dagli iscritti" on public.profili;
create policy "profili leggibili dagli iscritti"
  on public.profili for select to authenticated using (public.e_membro());

-- Non c'e' nessuna policy di inserimento su profili, ed e' il punto di tutto
-- l'impianto: l'unica strada per esistere qui dentro e' la funzione iscrivi(),
-- che chiede il codice del negozio.
drop policy if exists "ognuno crea il proprio profilo" on public.profili;

drop policy if exists "ognuno modifica il proprio profilo" on public.profili;
create policy "ognuno modifica il proprio profilo"
  on public.profili for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- La policy sopra lascia scrivere qualsiasi colonna della propria riga,
-- `admin`, `super_admin` e `attivo` comprese: da sola non impedirebbe un
-- giorno a un client di promuoversi da solo, o di riattivarsi dopo essere
-- stato disattivato. Il trigger chiude quel varco riscrivendo le tre colonne
-- al valore che avevano prima di ogni update fatto da chi arriva con la
-- chiave `anon`/`authenticated` (cioè il client dell'app, sempre autenticato
-- come `authenticated` anche quando la persona è iscritta).
--
-- **Non** `auth.role() is distinct from 'service_role'`: da SQL Editor
-- (o dalla dashboard) `auth.role()` è `null`, perché non c'è nessun JWT di
-- mezzo — e `null is distinct from 'service_role'` è vero, quindi quella
-- versione bloccava anche l'unico posto da cui si dovrebbe poter scrivere
-- queste colonne a mano. La versione giusta guarda solo i due ruoli da
-- bloccare davvero, e lascia passare tutto il resto (SQL Editor compreso).
drop function if exists public.blocca_auto_admin() cascade;

create or replace function public.blocca_scritture_privilegiate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    new.admin := old.admin;
    new.super_admin := old.super_admin;
    new.attivo := old.attivo;
  end if;
  return new;
end $$;

drop trigger if exists blocca_auto_admin on public.profili;
drop trigger if exists blocca_scritture_privilegiate on public.profili;
create trigger blocca_scritture_privilegiate
  before update on public.profili
  for each row execute function public.blocca_scritture_privilegiate();

-- richieste ---------------------------------------------------------------
-- Una richiesta su cui c'è un accordo riguarda due persone e basta: la vedono
-- loro, e gli admin. A tutti gli altri sparisce, anche dall'API: finché
-- restava leggibile, nascondere la bacheca dall'app non nascondeva niente a
-- chi sa chiamare il server.
--
-- La funzione è `security definer` perché deve guardare le proposte di tutti
-- per sapere se un accordo c'è, e la policy sulle proposte ne mostra a
-- ciascuno solo due. Decide in base alla proposta in ACCORDO e non allo stato
-- della richiesta: dopo "Cambio inserito" la richiesta è CHIUSA, ma l'accordo
-- che c'è stato non è diventato pubblico.
create or replace function public.vedi_richiesta(rid uuid, autore uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.e_membro() and (
    autore = (select auth.uid())
    or public.e_admin()
    or not exists (
      select 1 from public.proposte p where p.richiesta_id = rid and p.stato = 'ACCORDO'
    )
    or exists (
      select 1 from public.proposte p
      where p.richiesta_id = rid and p.stato = 'ACCORDO'
        and (select auth.uid()) in (p.da_user_id, p.a_user_id)
    )
  );
$$;

revoke all on function public.vedi_richiesta(uuid, uuid) from public, anon;
grant execute on function public.vedi_richiesta(uuid, uuid) to authenticated;

drop policy if exists "la bacheca la leggono gli iscritti" on public.richieste;
drop policy if exists "la bacheca la leggono gli iscritti, tranne gli accordi" on public.richieste;
create policy "la bacheca la leggono gli iscritti, tranne gli accordi"
  on public.richieste for select to authenticated using (public.vedi_richiesta(id, autore_id));

drop policy if exists "si pubblica solo a proprio nome" on public.richieste;
create policy "si pubblica solo a proprio nome"
  on public.richieste for insert to authenticated with check (autore_id = (select auth.uid()));

-- L'autore modifica la propria richiesta; l'altra parte deve poterne cambiare
-- lo stato quando accetta, e quel passaggio si fa dalla proposta: qui basta
-- che lo stato lo muova chi è coinvolto.
drop policy if exists "la richiesta la muove chi e' coinvolto" on public.richieste;
create policy "la richiesta la muove chi e' coinvolto"
  on public.richieste for update to authenticated
  using (
    autore_id = (select auth.uid())
    or exists (
      select 1 from public.proposte p
      where p.richiesta_id = richieste.id
        and (select auth.uid()) in (p.da_user_id, p.a_user_id)
    )
  );

drop policy if exists "si cancella solo la propria richiesta" on public.richieste;
create policy "si cancella solo la propria richiesta"
  on public.richieste for delete to authenticated using (autore_id = (select auth.uid()));

-- Un admin chiude o rimuove la richiesta di chiunque (`RULES` e la UI la
-- limitano al cambio di stato, mai a toccare cedo/cerco): la policy resta
-- larga apposta, la disciplina sta nel client e nel vincolo che il motivo non
-- sia vuoto quando chiusa_da_admin è valorizzato.
drop policy if exists "un admin chiude o rimuove qualsiasi richiesta" on public.richieste;
create policy "un admin chiude o rimuove qualsiasi richiesta"
  on public.richieste for update to authenticated
  using (public.e_admin()) with check (public.e_admin());

-- proposte ----------------------------------------------------------------
drop policy if exists "una proposta la vedono le due parti" on public.proposte;
create policy "una proposta la vedono le due parti"
  on public.proposte for select to authenticated
  using ((select auth.uid()) in (da_user_id, a_user_id));

drop policy if exists "si propone solo a proprio nome" on public.proposte;
create policy "si propone solo a proprio nome"
  on public.proposte for insert to authenticated with check (da_user_id = (select auth.uid()));

drop policy if exists "una proposta la aggiornano le due parti" on public.proposte;
create policy "una proposta la aggiornano le due parti"
  on public.proposte for update to authenticated
  using ((select auth.uid()) in (da_user_id, a_user_id))
  with check ((select auth.uid()) in (da_user_id, a_user_id));

drop policy if exists "si ritira solo la propria proposta" on public.proposte;
create policy "si ritira solo la propria proposta"
  on public.proposte for delete to authenticated using (da_user_id = (select auth.uid()));

-- Quando un admin chiude o rimuove una richiesta, le proposte ancora aperte
-- su di essa vanno rifiutate: nessuna delle due parti è detta a farlo, quindi
-- serve la stessa porta usata sulle richieste.
drop policy if exists "un admin aggiorna qualsiasi proposta" on public.proposte;
create policy "un admin aggiorna qualsiasi proposta"
  on public.proposte for update to authenticated
  using (public.e_admin()) with check (public.e_admin());

-- disponibilità -----------------------------------------------------------
drop policy if exists "le disponibilita' le leggono gli iscritti" on public.disponibilita;
create policy "le disponibilita' le leggono gli iscritti"
  on public.disponibilita for select to authenticated using (public.e_membro());

drop policy if exists "ognuno dichiara la propria disponibilita'" on public.disponibilita;
create policy "ognuno dichiara la propria disponibilita'"
  on public.disponibilita for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ringraziamenti ----------------------------------------------------------
drop policy if exists "i ringraziamenti li vedono le due parti" on public.ringraziamenti;
create policy "i ringraziamenti li vedono le due parti"
  on public.ringraziamenti for select to authenticated
  using ((select auth.uid()) in (da_user_id, a_user_id));

drop policy if exists "si ringrazia a proprio nome" on public.ringraziamenti;
create policy "si ringrazia a proprio nome"
  on public.ringraziamenti for insert to authenticated with check (da_user_id = (select auth.uid()));

-- ======================================================= pulizia periodica
--
-- Le note d'uso promettono che i cambi pubblicati non restano per sempre sul
-- server: senza questa parte sarebbe una frase scritta e basta, non una cosa
-- vera. Ogni notte, alle 03:00 UTC:
--
--  1. cancella le richieste ancora aperte ma scadute. Le scadenze il telefono
--     le calcola da sé ma sul server lo stato non cambia mai, quindi senza
--     questo passo restavano "aperte" per sempre. La regola è quella di
--     `isExpired` in src/core/model.js: il giorno ceduto è passato, oppure
--     sono passati tutti i giorni che si cercavano.
--  2. chiude da sola la richiesta con accordo il cui ultimo giorno è passato
--     da più di un giorno. In uno scambio di giornate sono due, e conta il più
--     lontano. Il giorno di margine serve a ringraziare: chi ha fatto lo
--     scambio lo ringrazia il giorno dopo, e chiudere a mezzanotte glielo
--     toglieva. Se nessuno preme "Cambio inserito" non resta in sospeso per
--     sempre; la proposta passa a "cambio inserito" così da sparire dalla
--     posta di entrambi.
--  3. toglie le richieste chiuse o rimosse da più di 100 giorni e le
--     disponibilità di settimane passate da più di 60;
--  4. toglie dal registro `aiuti` gli aiuti più vecchi di 100 giorni e quelli
--     annullati (vedi la sua sezione, in fondo).
--
-- Le proposte se ne vanno da sole con la richiesta, perché la chiave esterna
-- su `richieste` è `on delete cascade`. I ringraziamenti restano: non sono un
-- "cambio pubblicato" ma l'unica cosa che si è deciso dovesse sopravvivere al
-- cambio stesso (vedi il commento sulla tabella).
--
-- **Assunzione**: 100 e 60 giorni sono punti di partenza, non un vincolo del
-- regolamento; si cambiano qui, senza toccare il client. Le date sono quelle
-- di Roma: alle 03:00 UTC è già l'alba italiana, e "oggi" è lo stesso giorno.
create or replace function public.pulizia_periodica() returns void
language plpgsql set search_path = public as $$
declare
  oggi   date := (now() at time zone 'Europe/Rome')::date;
  chiuse uuid[];
begin
  delete from public.richieste
  where stato in ('APERTA', 'PROPOSTA', 'IN_ATTESA')
    and (
      cedo_data < oggi
      or (cardinality(cerco_giorni) > 0
          and not exists (select 1 from unnest(cerco_giorni) g where g >= oggi))
    );

  select coalesce(array_agg(q.id), '{}') into chiuse
  from public.richieste q
  where q.stato = 'ACCORDO'
    and greatest(
      q.cedo_data,
      coalesce((select max(p.turno_data) from public.proposte p
                where p.richiesta_id = q.id and p.stato = 'ACCORDO'), q.cedo_data)
    ) < oggi - 1;

  update public.richieste set stato = 'CHIUSA', chiusa_il = now() where id = any(chiuse);
  update public.proposte set cambio_inserito = true
  where richiesta_id = any(chiuse) and stato = 'ACCORDO';

  delete from public.richieste
  where stato in ('CHIUSA', 'SCADUTA', 'RIMOSSA')
    and coalesce(chiusa_il, creata_il) < now() - interval '100 days';

  delete from public.disponibilita
  where settimana < (current_date - interval '60 days')::date;

  -- Lo stesso numero di `RULES.favore.giorni` in src/core/rules.js.
  delete from public.aiuti
  where quando < now() - interval '100 days' or annullato_il is not null;
end $$;

-- Solo il ruolo che possiede lo schema (e il job pianificato sotto, che gira
-- come lui) la può eseguire: non è una funzione da esporre all'app.
revoke all on function public.pulizia_periodica() from public;

-- pg_cron è l'estensione di Supabase per i lavori pianificati: schedule() con
-- lo stesso nome aggiorna il job invece di duplicarlo, quindi rilanciare
-- questo script non crea copie.
create extension if not exists pg_cron;

select cron.schedule(
  'pulizia-periodica',
  '0 3 * * *',
  $$ select public.pulizia_periodica(); $$
);

-- ======================================================= notifiche push
--
-- Una riga per ogni dispositivo che ha acceso le notifiche. `subscription` è
-- l'oggetto che il browser restituisce a `pushManager.subscribe()`: endpoint
-- del servizio push del produttore (Apple, Google, Mozilla) e le due chiavi
-- con cui il messaggio viene cifrato per quel dispositivo e nessun altro.
--
-- `endpoint` è unico perché identifica il dispositivo: riaccendere le
-- notifiche sullo stesso telefono aggiorna la riga invece di duplicarla, e
-- duplicarla vorrebbe dire ricevere ogni notifica due volte.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profili(id) on delete cascade,
  endpoint     text not null unique,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Ognuno vede e tocca solo i propri dispositivi. Chi manda le notifiche è la
-- funzione `send-push`, che legge con `service_role` e quindi non passa da qui.
drop policy if exists "utente gestisce le sue subscription" on public.push_subscriptions;
create policy "utente gestisce le sue subscription"
  on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- I segreti delle notifiche stanno in Vault, cifrati nel database, e non nei
-- secrets delle Edge Functions: così si impostano una volta da SQL Editor
-- (vedi docs/07-supabase.md) e non finiscono mai in un file del repository.
-- Questa funzione è l'unica porta per leggerli, e la apre solo `service_role`,
-- cioè la funzione `send-push`. Nessuna chiave dell'app può chiamarla.
create or replace function public.segreti_push() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_object_agg(name, decrypted_secret)
  from vault.decrypted_secrets
  where name in ('push_vapid_pubblica', 'push_vapid_privata', 'push_webhook', 'turni_chiave_privata');
$$;

revoke all on function public.segreti_push() from public, anon, authenticated;
grant execute on function public.segreti_push() to service_role;

-- pg_net fa partire chiamate HTTP dal database senza aspettarle: chi inserisce
-- una proposta non resta appeso al servizio push di Apple.
create extension if not exists pg_net;

-- Chiama `send-push` quando una proposta riguarda qualcuno che non è chi l'ha
-- appena toccata: nuova o ritirata (al destinatario), chiusa con un accordo o
-- un rifiuto (a chi l'aveva proposta). Gli altri cambi di stato non dicono niente di
-- nuovo a nessuno, e filtrarli qui risparmia una chiamata per ogni update.
--
-- `autore` viaggia insieme alla riga perché solo il database sa chi ha fatto
-- la modifica: una proposta che rifiuti tu non deve notificarti il tuo rifiuto.
create or replace function public.notifica_proposta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  segreto text;
begin
  -- La conferma di UKG vista da un telefono avvisa l'altra parte: passa anche
  -- se lo stato non cambia, una volta sola (da vuota a piena).
  -- Una proposta chiusa che chi l'aveva fatta riapre (vedi `proponiScambio`)
  -- è una proposta nuova per chi la riceve, e passa come tale.
  if tg_op = 'UPDATE'
    and not (old.confermata_il is null and new.confermata_il is not null)
    and not (old.stato = 'RIFIUTATA' and new.stato = 'IN_ATTESA')
    and (
      new.stato is not distinct from old.stato
      or new.stato not in ('ACCORDO', 'RIFIUTATA')
    ) then
    return new;
  end if;
  -- Un ritiro è solo una proposta ancora in attesa cancellata da chi l'ha
  -- fatta. Le cancellazioni a cascata (la pulizia dei 100 giorni, una
  -- richiesta tolta dal suo autore) non sono un ritiro e non avvisano nessuno.
  -- (`not in ('INSERT', 'UPDATE')` è la cancellazione: scritto così passa
  -- anche dal connettore Supabase, che si blocca sulla parola.)
  if tg_op not in ('INSERT', 'UPDATE') and (
    old.stato not in ('PROPOSTA', 'IN_ATTESA')
    or auth.uid() is distinct from old.da_user_id
  ) then
    return old;
  end if;

  select decrypted_secret into segreto
  from vault.decrypted_secrets where name = 'push_webhook';
  -- Senza segreto le notifiche non sono ancora configurate: la proposta deve
  -- passare lo stesso, una notifica mancata non vale un cambio perso.
  if segreto is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://daerebtkibgmtyvznfvu.supabase.co/functions/v1/send-push',
      body := jsonb_build_object(
        'type', tg_op,
        'record', to_jsonb(case when tg_op in ('INSERT', 'UPDATE') then new else old end),
        'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end,
        'autore', auth.uid()
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', segreto),
      -- I 5 secondi di default bastano quasi sempre, ma una funzione appena
      -- svegliata ne ha già spesi quattro e mezzo: meglio aspettare di più che
      -- perdere l'avviso di un accordo.
      timeout_milliseconds := 20000
    );
  exception when others then
    -- Stessa ragione di sopra: la notifica si perde, la proposta no.
    raise warning 'notifica_proposta: %', sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.notifica_proposta() from public, anon, authenticated;

drop trigger if exists notifica_proposta on public.proposte;
create trigger notifica_proposta
  after insert or update of stato or delete on public.proposte
  for each row execute function public.notifica_proposta();

-- La conferma di UKG ha un trigger suo, solo sul passaggio da vuota a piena:
-- così parte una volta, e aggiungerlo non tocca quello qui sopra.
create or replace trigger notifica_conferma
  after update of confermata_il on public.proposte
  for each row
  when (old.confermata_il is null and new.confermata_il is not null)
  execute function public.notifica_proposta();

-- ================================================== un turno, un accordo
--
-- Lo stesso turno si può offrire su più richieste, per trovare prima chi lo
-- prende. Al primo accordo le altre proposte in attesa che usano quel turno
-- decadono: quelle di chi ha proposto con lo stesso giorno, e quelle che
-- l'autore della richiesta aveva fatto offrendo il giorno che ora lascia.
-- Senza questo, due sì sulla stessa giornata facevano due accordi su un
-- turno solo.
--
-- Lo fa il database e non il telefono: le proposte da chiudere sono spesso di
-- altre persone, e chi accetta non ha il permesso di toccarle. Il turno sul
-- server è la coppia (persona, giorno): ciascuno ne ha uno al giorno.
--
-- `motivo_decadenza` dice a `send-push` perché la proposta è chiusa: chi
-- l'aveva ricevuta legge "Proposta non scelta", non "rifiutata".
alter table public.proposte add column if not exists motivo_decadenza text;
alter table public.proposte drop constraint if exists proposte_motivo_decadenza_check;
alter table public.proposte add constraint proposte_motivo_decadenza_check
  check (motivo_decadenza is null or motivo_decadenza in ('TURNO_IMPEGNATO', 'TURNO_CEDUTO'));

create or replace function public.turno_impegnato() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cedo date;
begin
  select r.cedo_data into cedo from public.richieste r where r.id = new.richiesta_id;

  -- Le altre proposte sulla stessa richiesta. Quando accetta chi ha
  -- pubblicato le chiude già il suo telefono; quando il cambio lo conclude
  -- chi risponde (il turno era proprio quello chiesto) quel telefono non
  -- può, perché non sono sue. Senza `motivo_decadenza`: per send-push è
  -- "l'ha preso un altro collega", non un turno impegnato altrove.
  update public.proposte q
  set stato = 'RIFIUTATA'
  where q.id <> new.id
    and q.richiesta_id = new.richiesta_id
    and q.stato = 'IN_ATTESA';

  update public.proposte q
  set stato = 'RIFIUTATA', motivo_decadenza = 'TURNO_IMPEGNATO'
  where q.id <> new.id
    and q.richiesta_id <> new.richiesta_id
    and q.stato = 'IN_ATTESA'
    and (
      (q.da_user_id = new.da_user_id and q.turno_data = new.turno_data)
      or (q.da_user_id = new.a_user_id and q.turno_data = cedo)
    );

  -- Lo stesso turno in un'altra richiesta aperta: quella di chi ha pubblicato
  -- (un cambio orario e un cambio OFF sullo stesso giorno sono due righe) o
  -- quella con cui chi ha proposto cercava di cedere il turno che ha appena
  -- dato. Restava in bacheca e poteva chiudere un secondo accordo sullo
  -- stesso turno. Si chiude, e le proposte che aveva ricevuto decadono con
  -- `TURNO_CEDUTO`: per send-push "quel turno l'ha già scambiato".
  with superate as (
    update public.richieste r
    set stato = 'CHIUSA', chiusa_il = now()
    where r.id <> new.richiesta_id
      and r.stato in ('APERTA', 'PROPOSTA', 'IN_ATTESA')
      and (
        (r.autore_id = new.a_user_id and r.cedo_data = cedo)
        or (r.autore_id = new.da_user_id and r.cedo_data = new.turno_data)
      )
    returning r.id
  )
  update public.proposte q
  set stato = 'RIFIUTATA', motivo_decadenza = 'TURNO_CEDUTO'
  where q.richiesta_id in (select id from superate)
    and q.stato = 'IN_ATTESA';
  return new;
end $$;

revoke all on function public.turno_impegnato() from public, anon, authenticated;

drop trigger if exists turno_impegnato on public.proposte;
create trigger turno_impegnato
  after update of stato on public.proposte
  for each row
  when (new.stato = 'ACCORDO' and old.stato is distinct from 'ACCORDO')
  execute function public.turno_impegnato();

-- ================================================ rientrare da un dispositivo nuovo
--
-- L'indirizzo con cui un account entra (`nome.cognome.xxxxxx@liberty-shift.internal`)
-- ha una coda casuale e la conosce solo il telefono su cui ci si è iscritti.
-- Cambiando dispositivo (l'app aggiunta alla Home di iPhone ha una memoria
-- tutta sua, separata da Safari), cambiando browser o svuotando i dati del sito,
-- l'app non sapeva più chi fosse e faceva iscrivere da capo: un secondo
-- account per la stessa persona. Questa funzione ritrova l'indirizzo da nome e
-- cognome, e a quel punto la password fa il resto.
--
-- Chiunque la può chiamare, perché serve prima di avere una sessione. Restituisce
-- solo indirizzi interni, che non sono instradabili e non aprono niente da
-- soli: senza la password non si entra, e a limitare i tentativi ci pensa
-- l'accesso di Supabase. Quello che rivela è che una persona con quel nome è
-- iscritta, che in un negozio di dieci colleghi non è un segreto.
--
-- Prende i nomi già ripuliti dal client (minuscoli, senza accenti, solo
-- lettere, cifre e trattini): la ripulitura sta in un posto solo, ed è la
-- stessa con cui l'indirizzo è stato creato.
create or replace function public.candidati_accesso(nome_slug text, cognome_slug text)
returns setof text
language sql stable security definer set search_path = '' as $$
  select u.email::text
  from auth.users u
  join public.profili p on p.id = u.id
  where nome_slug ~ '^[a-z0-9-]{1,40}$'
    and cognome_slug ~ '^[a-z0-9-]{1,60}$'
    and p.attivo
    and u.email like nome_slug || '.' || cognome_slug || '.%@liberty-shift.internal'
  order by u.created_at
  limit 5;
$$;

revoke all on function public.candidati_accesso(text, text) from public;
grant execute on function public.candidati_accesso(text, text) to anon, authenticated;

-- ============================================================ promemoria accordi
--
-- Un accordo non finisce quando due colleghi si dicono sì: finisce quando uno
-- dei due inserisce il cambio nell'app ufficiale, e questa app non può farlo al
-- posto loro. Due giorni prima del prossimo giorno coinvolto, a chi non ha
-- ancora premuto "Cambio inserito" arriva una notifica con la domanda: una
-- sola volta, perché `promemoria_il` ricorda che è partita.
--
-- Conta il prossimo giorno **ancora da venire**, non il primo in assoluto: in
-- uno scambio di giornate una può essere già passata, e ricordare qualcosa di
-- già successo non serve a niente.
--
-- **Assunzione**: due giorni di anticipo. Non so quanto preavviso chieda il
-- gestionale ufficiale; se serve di più basta cambiare il numero qui sotto.
-- Chi concorda un cambio a meno di due giorni dalla data riceve il promemoria
-- la mattina dopo: meglio uno in più che nessuno.
--
-- Una notifica per ciascuna delle due persone, perché ciascuna legge il nome
-- dell'altra: la funzione `send-push` la compone per destinatario.
create or replace function public.promemoria_accordi() returns void
language plpgsql security definer set search_path = '' as $$
declare
  oggi     date := (now() at time zone 'Europe/Rome')::date;
  segreto  text;
  r        record;
  persona  uuid;
begin
  select decrypted_secret into segreto from vault.decrypted_secrets where name = 'push_webhook';
  -- Senza segreto le notifiche non sono configurate: niente da fare, e nemmeno
  -- da segnare, così quando lo saranno i promemoria partiranno.
  if segreto is null then
    return;
  end if;

  for r in
    select p.*, d.prossimo
    from public.proposte p
    join public.richieste q on q.id = p.richiesta_id
    cross join lateral (
      select min(x) as prossimo from unnest(array[q.cedo_data, p.turno_data]) x where x >= oggi
    ) d
    where p.stato = 'ACCORDO'
      and not p.cambio_inserito
      and p.promemoria_il is null
      and d.prossimo is not null
      and d.prossimo <= oggi + 2
  loop
    foreach persona in array array[r.da_user_id, r.a_user_id] loop
      begin
        perform net.http_post(
          url := 'https://daerebtkibgmtyvznfvu.supabase.co/functions/v1/send-push',
          body := jsonb_build_object(
            'type', 'PROMEMORIA',
            'record', to_jsonb(r) - 'prossimo',
            'giorno', r.prossimo,
            'destinatario', persona
          ),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', segreto),
          timeout_milliseconds := 20000
        );
      exception when others then
        raise warning 'promemoria_accordi: %', sqlerrm;
      end;
    end loop;
    update public.proposte set promemoria_il = now() where id = r.id;
  end loop;
end $$;

revoke all on function public.promemoria_accordi() from public, anon, authenticated;

-- Ogni mattina alle 08:00 UTC, cioè le 9 o le 10 a Roma.
select cron.schedule('promemoria-accordi', '0 8 * * *', $$ select public.promemoria_accordi(); $$);

-- ================================== notifiche sulle richieste compatibili
--
-- Di base le notifiche arrivano solo per le proposte dirette (vedi
-- `notifica_proposta`). Chi lo sceglie può ricevere anche un avviso quando un
-- collega pubblica una richiesta che **il suo calendario** può risolvere: è la
-- stessa domanda di "Aiuta un collega", ma risolta sul server perché il
-- telefono, ad app chiusa, non può rispondere.
--
-- Per questo, e solo per chi lo accende, i turni escono dal telefono. È
-- l'unica eccezione alla promessa delle note d'uso ("i tuoi turni restano su
-- questo dispositivo"), ed è per questo che:
--
--  · si accende solo con un consenso scritto, e `consenso_il` lo registra: il
--    vincolo sotto rifiuta `compatibili` senza consenso;
--  · la tabella la legge solo il proprietario della riga e la funzione
--    `send-push` (service_role). Né i colleghi né gli admin: nessuna policy di
--    lettura per loro, e non va aggiunta;
--  · tornando a "solo proposte dirette" la riga si svuota, non si ferma:
--    `turni` e `preferenze` tornano vuoti;
--  · escono solo i prossimi 28 giorni, non il calendario intero, e solo
--    data, tipo e orari: niente note, niente ferie scritte per esteso.
--
-- Escono anche le preferenze di turno: senza, le notifiche ignorerebbero il
-- motivo per cui uno le ha personalizzate (chi evita le chiusure non vuole un
-- avviso per ogni cambio di chiusura).
create table if not exists public.notifiche_preferenze (
  user_id        uuid primary key references public.profili(id) on delete cascade,
  modo           text not null default 'dirette' check (modo in ('dirette', 'compatibili')),
  turni          jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(turni) = 'array' and jsonb_array_length(turni) <= 60),
  preferenze     jsonb not null default '{}'::jsonb check (jsonb_typeof(preferenze) = 'object'),
  consenso_il    timestamptz,
  aggiornato_il  timestamptz not null default now(),
  constraint compatibili_solo_con_consenso check (modo = 'dirette' or consenso_il is not null)
);

alter table public.notifiche_preferenze enable row level security;

drop policy if exists "ognuno gestisce le proprie preferenze di notifica" on public.notifiche_preferenze;
create policy "ognuno gestisce le proprie preferenze di notifica"
  on public.notifiche_preferenze for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Quando nasce una richiesta la funzione `send-push` cerca chi aveva già
-- chiesto proprio quel cambio (le richieste speculari, per chiunque abbia le
-- notifiche accese) e la confronta con i calendari di chi ha scelto le
-- compatibili. Il controllo `exists` risparmia la chiamata finché nessun altro
-- ha un dispositivo iscritto: guardare solo chi ha scelto le compatibili
-- spegneva anche gli avvisi speculari, che non ne hanno bisogno. Come per le
-- proposte, un guasto qui non deve impedire di pubblicare.
create or replace function public.notifica_richiesta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  segreto text;
begin
  if new.stato <> 'APERTA' then
    return new;
  end if;
  if not exists (select 1 from public.push_subscriptions where user_id <> new.autore_id) then
    return new;
  end if;

  select decrypted_secret into segreto from vault.decrypted_secrets where name = 'push_webhook';
  if segreto is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://daerebtkibgmtyvznfvu.supabase.co/functions/v1/send-push',
      body := jsonb_build_object('type', 'RICHIESTA', 'record', to_jsonb(new), 'autore', auth.uid()),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', segreto),
      -- Può avvisare più persone, una dopo l'altra: i 5 secondi di default
      -- non bastano (vedi chiedi_nuova_password).
      timeout_milliseconds := 20000
    );
  exception when others then
    raise warning 'notifica_richiesta: %', sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.notifica_richiesta() from public, anon, authenticated;

drop trigger if exists notifica_richiesta on public.richieste;
create trigger notifica_richiesta
  after insert on public.richieste
  for each row execute function public.notifica_richiesta();


-- ======================================================= traguardi annunciati
--
-- Il gradino più alto dei grazie che l'app ti ha già annunciato. Senza, su
-- ogni telefono nuovo (o dopo aver pulito il browser) l'avviso tornava.
--
-- È un numero solo e lo legge solo il proprietario: dalla soglia annunciata
-- si ricava più o meno quanti grazie hai ricevuto, e il karma lo vede solo
-- chi lo riceve. Nessuna policy di lettura per colleghi o admin, e non va
-- aggiunta.
create table if not exists public.traguardi_visti (
  user_id        uuid primary key references public.profili(id) on delete cascade,
  soglia         integer not null default 0 check (soglia >= 0),
  aggiornato_il  timestamptz not null default now()
);

alter table public.traguardi_visti enable row level security;

drop policy if exists "ognuno vede solo i propri traguardi" on public.traguardi_visti;
create policy "ognuno vede solo i propri traguardi"
  on public.traguardi_visti for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ================================================== password dimenticata
--
-- Gli account non hanno un'email vera, quindi niente link di recupero: la
-- password temporanea la genera un admin (funzione `Amministrazione`) e la
-- dice a voce. Ma un admin non deve poter entrare nell'account di chiunque:
-- può farlo solo per chi l'ha chiesto, nelle ultime 48 ore. Il SuperAdmin
-- sempre. La regola la controlla la funzione, non l'app.
--
-- La richiesta si fa senza essere entrati (è proprio quello che manca), con
-- nome e cognome ripuliti come in `candidati_accesso`. Con due omonimi la
-- ricevono entrambi: l'admin parla con la persona, e sa a chi la sta dando.
-- Chiedere per qualcun altro non apre niente: la password nuova la dà un
-- admin, di persona.
create table if not exists public.richieste_password (
  user_id    uuid primary key references public.profili(id) on delete cascade,
  chiesta_il timestamptz not null default now()
);

-- Chi se n'è occupato e quando. La richiesta arriva a tutti gli admin insieme:
-- il primo che la prende in carico la segna (funzione `Amministrazione`), e
-- agli altri resta scritto chi l'ha fatto invece di un tasto che ne creerebbe
-- una seconda, annullando la prima. Fuori dal `create table`, che su un
-- progetto avviato non aggiunge colonne. Senza chiave esterna apposta: un
-- admin che non c'è più resta "un altro admin", non porta via la riga.
alter table public.richieste_password add column if not exists gestita_da uuid;
alter table public.richieste_password add column if not exists gestita_il timestamptz;

alter table public.richieste_password enable row level security;

drop policy if exists "chi ha chiesto una nuova password lo vedono gli admin" on public.richieste_password;
create policy "chi ha chiesto una nuova password lo vedono gli admin"
  on public.richieste_password for select to authenticated
  using (public.e_admin() or exists (
    select 1 from public.profili p where p.id = (select auth.uid()) and p.super_admin and p.attivo
  ));

create or replace function public.chiedi_nuova_password(nome_slug text, cognome_slug text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  quanti  integer := 0;
  avvisa  uuid[] := '{}';
  segreto text;
  r       record;
begin
  if nome_slug !~ '^[a-z0-9-]{1,40}$' or cognome_slug !~ '^[a-z0-9-]{1,60}$' then
    return 0;
  end if;
  for r in
    select p.id, rp.chiesta_il as prima, rp.gestita_da as gestita
    from auth.users u
    join public.profili p on p.id = u.id
    left join public.richieste_password rp on rp.user_id = p.id
    where p.attivo
      and u.email like nome_slug || '.' || cognome_slug || '.%@liberty-shift.internal'
    limit 5
  loop
    -- Una richiesta rifatta è una richiesta nuova: torna libera anche se un
    -- admin aveva già dato una password (persa, o mai arrivata).
    insert into public.richieste_password (user_id, chiesta_il) values (r.id, now())
    on conflict (user_id) do update
      set chiesta_il = excluded.chiesta_il, gestita_da = null, gestita_il = null;
    quanti := quanti + 1;
    -- Gli admin si avvisano al massimo una volta l'ora per persona: la
    -- richiesta si fa senza sessione, e ripeterla non deve far suonare i loro
    -- telefoni a ripetizione.
    if r.prima is null or r.prima < now() - interval '1 hour' or r.gestita is not null then
      avvisa := avvisa || r.id;
    end if;
  end loop;

  if cardinality(avvisa) > 0 then
    select decrypted_secret into segreto from vault.decrypted_secrets where name = 'push_webhook';
    if segreto is not null then
      begin
        perform net.http_post(
          url := 'https://daerebtkibgmtyvznfvu.supabase.co/functions/v1/send-push',
          body := jsonb_build_object('type', 'PASSWORD', 'utenti', to_jsonb(avvisa)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', segreto),
          -- Si avvisano tutti gli admin, uno dopo l'altro: con dieci admin la
          -- funzione ci ha messo quasi 5 secondi, il limite di default, e la
          -- chiamata è finita in timeout.
          timeout_milliseconds := 20000
        );
      exception when others then
        -- La richiesta resta valida anche se l'avviso non parte.
        raise warning 'chiedi_nuova_password: %', sqlerrm;
      end;
    end if;
  end if;
  return quanti;
end $$;

revoke all on function public.chiedi_nuova_password(text, text) from public;
grant execute on function public.chiedi_nuova_password(text, text) to anon, authenticated;


-- ================================================== turni cifrati
--
-- I turni e le preferenze delle notifiche compatibili arrivano cifrati dal
-- telefono (vedi src/core/cifratura.js) in `dati_cifrati`; le colonne `turni`
-- e `preferenze` restano vuote. La chiave che decifra è il segreto Vault
-- `turni_chiave_privata`, e la legge solo `send-push` attraverso
-- `segreti_push()`. Non sta in questo file né nel repository: si crea una
-- volta da SQL Editor con
--   select vault.create_secret('<chiave PKCS8 in base64>', 'turni_chiave_privata');
-- e la sua metà pubblica va in `chiaveTurniPubblica` di src/core/config.js.
alter table public.notifiche_preferenze add column if not exists dati_cifrati text;


-- ======================================== sincronizzazione incrementale
--
-- Ogni telefono si aggiorna spesso (all'apertura, alla ripresa, ogni dieci
-- minuti), e riscaricare ogni volta tutta la bacheca con 95 iscritti avrebbe
-- superato da solo i 5 GB di traffico al mese del piano gratuito. Con l'ora
-- dell'ultima modifica il telefono chiede solo le righe cambiate, più un
-- elenco leggero (id e ora) di quelle che esistono: quello che sparisce
-- dall'elenco (cancellato dalla pulizia, o non più visibile perché concordato
-- fra altri due) si toglie anche dal telefono. Vedi `scarica` in
-- src/core/sincronia.js.
--
-- Fuori dai `create table`, che su un progetto avviato non aggiungono colonne.
alter table public.richieste add column if not exists aggiornato_il timestamptz not null default now();
alter table public.profili add column if not exists aggiornato_il timestamptz not null default now();
alter table public.disponibilita add column if not exists aggiornato_il timestamptz not null default now();

create or replace function public.segna_aggiornamento() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.aggiornato_il := now();
  return new;
end $$;

create or replace trigger segna_aggiornamento before update on public.richieste
  for each row execute function public.segna_aggiornamento();
create or replace trigger segna_aggiornamento before update on public.profili
  for each row execute function public.segna_aggiornamento();
create or replace trigger segna_aggiornamento before update on public.disponibilita
  for each row execute function public.segna_aggiornamento();


-- ============================================ protezioni sugli scambi
--
-- Il telefono già evita questi casi, ma un telefono con la versione vecchia,
-- o due telefoni della stessa persona, possono non saperlo. Il database è
-- l'ultimo posto dove fermarli, e vale per tutti.

-- Una proposta si ritira finché è in attesa. Una già concordata si annulla
-- (stato RIFIUTATA con annullata_il), non si cancella: cancellarla lasciava
-- la richiesta in ACCORDO senza la proposta che la teneva in piedi.
alter policy "si ritira solo la propria proposta" on public.proposte
  using (da_user_id = (select auth.uid()) and stato in ('PROPOSTA', 'IN_ATTESA'));

-- Un accordo per richiesta: due sì sulla stessa richiesta, da due telefoni
-- nello stesso momento, non diventano due scambi.
create unique index if not exists proposte_un_accordo_per_richiesta
  on public.proposte (richiesta_id) where stato = 'ACCORDO';

-- Una richiesta aperta per tipo e giorno: un secondo tocco su "Pubblica"
-- da un altro telefono non la raddoppia in bacheca.
create unique index if not exists richieste_una_aperta_per_giorno
  on public.richieste (autore_id, tipo, cedo_data) where stato in ('APERTA', 'PROPOSTA', 'IN_ATTESA');

-- ================================================== registro degli aiuti
--
-- Chi ha aiutato chi, e quando. Serve a una cosa sola: mandare "Puoi
-- ricambiare un favore" a chi è stato aiutato, quando chi l'ha aiutato
-- pubblica una richiesta che può coprire (`aiutatiDa` in send-push).
--
-- Prima il favore si ricostruiva dalle proposte, e durava quanto la
-- richiesta: la pulizia la cancellava, e con lei la proposta e il ricordo.
-- Qui ogni accordo lascia una riga sua, che non dipende dalla richiesta (non
-- c'è chiave esterna verso `proposte`, apposta) e resta 100 giorni
-- (`RULES.favore.giorni`), poi la toglie la pulizia notturna.
--
-- La scrive solo il trigger qui sotto, mai l'app: nessuna chiave dell'app la
-- legge né la scrive (RLS accesa e nessuna policy), la legge solo send-push
-- con `service_role`. Chi ha aiutato chi lo sanno già le due persone; non
-- deve diventare una classifica.
create table if not exists public.aiuti (
  proposta_id  uuid primary key,
  aiutante_id  uuid not null references public.profili(id) on delete cascade,
  aiutato_id   uuid not null references public.profili(id) on delete cascade,
  quando       timestamptz not null default now(),
  annullato_il timestamptz
);
create index if not exists aiuti_aiutante_idx on public.aiuti (aiutante_id, quando);
alter table public.aiuti enable row level security;
revoke all on public.aiuti from anon, authenticated;

-- Un accordo registra l'aiuto: l'aiutante è chi non ha scritto la richiesta,
-- come in `aiutiConclusi` (src/core/karma.js). Un accordo annullato non si
-- cancella qui ma si segna, e lo toglie la pulizia: un aiuto che non c'è
-- stato non deve valere un favore nemmeno per un giorno.
create or replace function public.registra_aiuto() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  autore   uuid;
  aiutante uuid;
begin
  if new.stato = 'ACCORDO' and new.annullata_il is null then
    select autore_id into autore from public.richieste where id = new.richiesta_id;
    aiutante := case when new.da_user_id = autore then new.a_user_id else new.da_user_id end;
    if autore is null or aiutante is null or aiutante = autore then
      return new;
    end if;
    -- Una proposta annullata e poi riaperta (vedi `proponiScambio`) torna in
    -- accordo con lo stesso id: la sua riga era segnata come annullata, e
    -- senza rimetterla in piedi la pulizia avrebbe tolto un aiuto vero.
    insert into public.aiuti (proposta_id, aiutante_id, aiutato_id)
    values (new.id, aiutante, autore)
    on conflict (proposta_id) do update
      set annullato_il = null, quando = now()
      where aiuti.annullato_il is not null;
  elsif tg_op = 'UPDATE' and old.stato = 'ACCORDO' then
    update public.aiuti set annullato_il = now()
    where proposta_id = new.id and annullato_il is null;
  end if;
  return new;
end $$;
-- `from public` non basta: anon e authenticated hanno un permesso proprio, dato
-- da Supabase di default, che resta se non lo si toglie per nome.
revoke all on function public.registra_aiuto() from public, anon, authenticated;

create or replace trigger registra_aiuto
  after insert or update of stato, annullata_il on public.proposte
  for each row execute function public.registra_aiuto();

-- Gli accordi che c'erano già prima del registro: rilanciare lo script non li
-- raddoppia (`on conflict`). La data è quella che l'app mostrava già.
insert into public.aiuti (proposta_id, aiutante_id, aiutato_id, quando)
select p.id,
       case when p.da_user_id = q.autore_id then p.a_user_id else p.da_user_id end,
       q.autore_id,
       coalesce(q.chiusa_il, p.confermata_il, p.creata_il)
from public.proposte p
join public.richieste q on q.id = p.richiesta_id
where p.stato = 'ACCORDO' and p.annullata_il is null
  and (case when p.da_user_id = q.autore_id then p.a_user_id else p.da_user_id end) <> q.autore_id
on conflict (proposta_id) do nothing;

-- Helper di Supabase che abilita RLS sulle tabelle nuove: non è nostro, ma lì
-- non serve a nessun client. C'è solo sui progetti che l'hanno ricevuto.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;


-- Indici sulle colonne che puntano a un profilo: senza, cancellare un profilo
-- o cercare "le proposte di questa persona" scorre la tabella intera. Non
-- serve `richieste.chiusa_da_admin`: si compila di rado e non si cerca per lui.
create index if not exists proposte_da_user_idx on public.proposte (da_user_id);
create index if not exists proposte_a_user_idx on public.proposte (a_user_id);
create index if not exists ringraziamenti_da_user_idx on public.ringraziamenti (da_user_id);
create index if not exists ringraziamenti_a_user_idx on public.ringraziamenti (a_user_id);
create index if not exists aiuti_aiutato_idx on public.aiuti (aiutato_id);

-- ================================================ quello che l'app può scrivere
--
-- Le policy dicono chi può toccare una riga, non cosa ci scrive. Bastava
-- avere una proposta su una richiesta per poterla riscrivere tutta (turno,
-- giorni cercati, priorità, perfino "chiusa da un admin"), e una proposta
-- nasceva con il destinatario, lo stato e i sì che il telefono decideva. Le
-- regole stavano solo nell'app: qui diventano del database.
--
-- I due trigger guardano solo le scritture fatte direttamente dal client
-- (`current_user` è `authenticated`). Dentro una funzione `security definer`
-- (`turno_impegnato`, la pulizia) `current_user` è il proprietario, e da SQL
-- Editor anche: quelle scritture passano com'erano. Gli admin restano fuori,
-- come nelle loro policy. Quello che non è ammesso **si riporta al valore di
-- prima** invece di dare errore, come `blocca_scritture_privilegiate`: un
-- errore lascerebbe l'operazione in testa alla coda del telefono, a bloccare
-- tutte quelle dietro per sempre.

-- Una richiesta. Chi l'ha scritta la muove come vuole, tranne autore,
-- creazione e la firma di un admin. Chi c'entra solo con una proposta ne
-- muove lo stato e la data di chiusura, e basta: l'accordo e la chiusura
-- solo se l'accordo con lui c'è davvero, e mai lo stato di "rimossa" o
-- "scaduta", che non sono suoi.
create or replace function public.limita_scritture_richiesta() returns trigger
language plpgsql set search_path = '' as $$
declare
  io uuid := auth.uid();
begin
  if current_user not in ('authenticated', 'anon') or public.e_admin() then
    return new;
  end if;
  new.id := old.id;
  new.autore_id := old.autore_id;
  new.creata_il := old.creata_il;
  new.chiusa_da_admin := old.chiusa_da_admin;
  new.admin_motivo := old.admin_motivo;
  if io is distinct from old.autore_id then
    new.tipo := old.tipo;
    new.priorita_fino_a := old.priorita_fino_a;
    new.cedo_data := old.cedo_data;
    new.cedo_start := old.cedo_start;
    new.cedo_end := old.cedo_end;
    new.cedo_flessibile := old.cedo_flessibile;
    new.cerco_giorni := old.cerco_giorni;
    new.cerco := old.cerco;
    if new.stato in ('RIMOSSA', 'SCADUTA')
      or (new.stato in ('ACCORDO', 'CHIUSA') and new.stato is distinct from old.stato
          and not exists (
            select 1 from public.proposte p
            where p.richiesta_id = old.id and p.stato = 'ACCORDO'
              and io in (p.da_user_id, p.a_user_id)
          )) then
      new.stato := old.stato;
      new.chiusa_il := old.chiusa_il;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.limita_scritture_richiesta() from public, anon, authenticated;

create or replace trigger limita_scritture_richiesta
  before update on public.richieste
  for each row execute function public.limita_scritture_richiesta();

-- Una proposta. Fra chi e su quale richiesta resta com'è nata. Il turno e il
-- messaggio li cambia solo chi l'ha fatta (quando la riapre). Fra i sì
-- ciascuno può aggiungere il proprio; chi propone può mettere anche quello
-- dell'altro, ed è il cambio diretto (`combaciaEsatto`): il turno è proprio
-- quello che la richiesta chiedeva, e il sì di chi l'ha pubblicata sta già
-- nella richiesta. Questo è il solo punto in cui il database si fida ancora
-- del telefono, perché ripetere qui il confronto degli orari vorrebbe dire
-- tenere una seconda copia del motore in SQL. L'accordo vale solo con
-- tutti e due i sì, e riaprire una proposta chiusa spetta a chi l'aveva fatta.
create or replace function public.limita_scritture_proposta() returns trigger
language plpgsql set search_path = '' as $$
declare
  io uuid := auth.uid();
begin
  if current_user not in ('authenticated', 'anon') or public.e_admin() then
    return new;
  end if;
  new.id := old.id;
  new.richiesta_id := old.richiesta_id;
  new.da_user_id := old.da_user_id;
  new.a_user_id := old.a_user_id;
  new.creata_il := old.creata_il;
  if io is distinct from old.da_user_id then
    new.turno_data := old.turno_data;
    new.turno_start := old.turno_start;
    new.turno_end := old.turno_end;
    new.messaggio := old.messaggio;
  end if;
  -- Chi riceve tocca solo il proprio sì: quello di chi ha proposto resta.
  -- Chi propone li decide tutti e due (riaprendo riparte dal solo suo).
  new.accettata_da := array(
    select distinct x from unnest(
      case when io = old.da_user_id then new.accettata_da
        else array_remove(old.accettata_da, io) || (case when io = any(new.accettata_da) then array[io] else '{}'::uuid[] end)
      end
    ) x
    where x in (old.da_user_id, old.a_user_id)
  );
  if new.stato = 'ACCORDO' and new.stato is distinct from old.stato
    and not (old.da_user_id = any(new.accettata_da) and old.a_user_id = any(new.accettata_da)) then
    new.stato := old.stato;
  end if;
  if old.stato = 'RIFIUTATA' and new.stato is distinct from 'RIFIUTATA'
    and io is distinct from old.da_user_id then
    new.stato := old.stato;
  end if;
  return new;
end $$;

revoke all on function public.limita_scritture_proposta() from public, anon, authenticated;

create or replace trigger limita_scritture_proposta
  before update on public.proposte
  for each row execute function public.limita_scritture_proposta();

-- Una proposta nuova va a chi ha scritto la richiesta, mai a sé stessi, nasce
-- in attesa con il proprio sì (e quello dell'altro solo nel cambio diretto)
-- e senza niente di quello che arriva dopo: annullamento, conferma di UKG,
-- promemoria, cambio inserito. `security definer` perché la richiesta può
-- essere già un accordo fra altri, che la policy di lettura nasconde.
create or replace function public.proposta_ammessa(rid uuid, da uuid, a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.e_membro() and exists (
    select 1 from public.richieste r where r.id = rid and r.autore_id = a and r.autore_id <> da
  );
$$;

revoke all on function public.proposta_ammessa(uuid, uuid, uuid) from public, anon;
grant execute on function public.proposta_ammessa(uuid, uuid, uuid) to authenticated;

alter policy "si propone solo a proprio nome" on public.proposte
  with check (
    da_user_id = (select auth.uid())
    and public.proposta_ammessa(richiesta_id, da_user_id, a_user_id)
    and stato = 'IN_ATTESA'
    and da_user_id = any(accettata_da)
    and accettata_da <@ array[da_user_id, a_user_id]
    and annullata_il is null
    and confermata_il is null
    and promemoria_il is null
    and motivo_decadenza is null
    and not cambio_inserito
  );
