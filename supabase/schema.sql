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

revoke all on function public.iscrivi(text, text, text, text, smallint, text) from public;
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

revoke all on function public.e_membro() from public;
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

revoke all on function public.e_admin() from public;
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
  using (id = auth.uid()) with check (id = auth.uid());

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
language plpgsql as $$
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
  on public.richieste for insert to authenticated with check (autore_id = auth.uid());

-- L'autore modifica la propria richiesta; l'altra parte deve poterne cambiare
-- lo stato quando accetta, e quel passaggio si fa dalla proposta: qui basta
-- che lo stato lo muova chi è coinvolto.
drop policy if exists "la richiesta la muove chi e' coinvolto" on public.richieste;
create policy "la richiesta la muove chi e' coinvolto"
  on public.richieste for update to authenticated
  using (
    autore_id = auth.uid()
    or exists (
      select 1 from public.proposte p
      where p.richiesta_id = richieste.id
        and auth.uid() in (p.da_user_id, p.a_user_id)
    )
  );

drop policy if exists "si cancella solo la propria richiesta" on public.richieste;
create policy "si cancella solo la propria richiesta"
  on public.richieste for delete to authenticated using (autore_id = auth.uid());

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
  using (auth.uid() in (da_user_id, a_user_id));

drop policy if exists "si propone solo a proprio nome" on public.proposte;
create policy "si propone solo a proprio nome"
  on public.proposte for insert to authenticated with check (da_user_id = auth.uid());

drop policy if exists "una proposta la aggiornano le due parti" on public.proposte;
create policy "una proposta la aggiornano le due parti"
  on public.proposte for update to authenticated
  using (auth.uid() in (da_user_id, a_user_id))
  with check (auth.uid() in (da_user_id, a_user_id));

drop policy if exists "si ritira solo la propria proposta" on public.proposte;
create policy "si ritira solo la propria proposta"
  on public.proposte for delete to authenticated using (da_user_id = auth.uid());

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
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ringraziamenti ----------------------------------------------------------
drop policy if exists "i ringraziamenti li vedono le due parti" on public.ringraziamenti;
create policy "i ringraziamenti li vedono le due parti"
  on public.ringraziamenti for select to authenticated
  using (auth.uid() in (da_user_id, a_user_id));

drop policy if exists "si ringrazia a proprio nome" on public.ringraziamenti;
create policy "si ringrazia a proprio nome"
  on public.ringraziamenti for insert to authenticated with check (da_user_id = auth.uid());

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
--  2. chiude da sola la richiesta con accordo il cui ultimo giorno è passato.
--     In uno scambio di giornate sono due, e conta il più lontano. Se nessuno
--     preme "Cambio inserito" non resta in sospeso per sempre; la proposta
--     passa a "cambio inserito" così da sparire dalla posta di entrambi.
--  3. toglie le richieste chiuse o rimosse da più di 90 giorni e le
--     disponibilità di settimane passate da più di 60.
--
-- Le proposte se ne vanno da sole con la richiesta, perché la chiave esterna
-- su `richieste` è `on delete cascade`. I ringraziamenti restano: non sono un
-- "cambio pubblicato" ma l'unica cosa che si è deciso dovesse sopravvivere al
-- cambio stesso (vedi il commento sulla tabella).
--
-- **Assunzione**: 90 e 60 giorni sono punti di partenza, non un vincolo del
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
    ) < oggi;

  update public.richieste set stato = 'CHIUSA', chiusa_il = now() where id = any(chiuse);
  update public.proposte set cambio_inserito = true
  where richiesta_id = any(chiuse) and stato = 'ACCORDO';

  delete from public.richieste
  where stato in ('CHIUSA', 'SCADUTA', 'RIMOSSA')
    and coalesce(chiusa_il, creata_il) < now() - interval '90 days';

  delete from public.disponibilita
  where settimana < (current_date - interval '60 days')::date;
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
  where name in ('push_vapid_pubblica', 'push_vapid_privata', 'push_webhook');
$$;

revoke all on function public.segreti_push() from public, anon, authenticated;
grant execute on function public.segreti_push() to service_role;

-- pg_net fa partire chiamate HTTP dal database senza aspettarle: chi inserisce
-- una proposta non resta appeso al servizio push di Apple.
create extension if not exists pg_net;

-- Chiama `send-push` quando una proposta riguarda qualcuno che non è chi l'ha
-- appena toccata: nuova (al destinatario) o chiusa con un accordo o un rifiuto
-- (a chi l'aveva proposta). Gli altri cambi di stato non dicono niente di
-- nuovo a nessuno, e filtrarli qui risparmia una chiamata per ogni update.
--
-- `autore` viaggia insieme alla riga perché solo il database sa chi ha fatto
-- la modifica: una proposta che rifiuti tu non deve notificarti il tuo rifiuto.
create or replace function public.notifica_proposta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  segreto text;
begin
  if tg_op = 'UPDATE' and (
    new.stato is not distinct from old.stato
    or new.stato not in ('ACCORDO', 'RIFIUTATA')
  ) then
    return new;
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
        'record', to_jsonb(new),
        'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end,
        'autore', auth.uid()
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', segreto)
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
  after insert or update of stato on public.proposte
  for each row execute function public.notifica_proposta();

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
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', segreto)
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
