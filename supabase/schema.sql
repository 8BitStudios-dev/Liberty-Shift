-- Liberty Shift — schema Supabase
--
-- Da incollare nell'SQL Editor del progetto e lanciare una volta sola.
-- È scritto per essere rilanciabile: ogni oggetto è creato "if not exists" e
-- le policy vengono ricreate, così correggere una riga non obbliga a buttare
-- il database.
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
  creato_il       timestamptz not null default now()
);

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
                    check (stato in ('APERTA', 'PROPOSTA', 'IN_ATTESA', 'ACCORDO', 'CHIUSA', 'SCADUTA')),
  priorita_fino_a timestamptz,
  cedo_data       date not null,
  cedo_start      time,
  cedo_end        time,
  cedo_flessibile boolean not null default false,
  cerco_giorni    date[] not null default '{}',
  cerco           jsonb not null default '{}'::jsonb,
  creata_il       timestamptz not null default now(),
  chiusa_il       timestamptz,
  -- Un turno lavorato ha due orari o nessuno: un turno con solo l'inizio è
  -- un dato rotto, e il posto per fermarlo è qui, non nella UI.
  constraint orari_coerenti check (
    (cedo_start is null and cedo_end is null) or (cedo_start is not null and cedo_end is not null)
  )
);

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
  -- Una proposta per persona per richiesta: riproporre si fa cancellando.
  unique (richiesta_id, da_user_id)
);

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

-- ============================================================== sicurezza
--
-- Row Level Security su tutte le tabelle. Senza, la chiave pubblica dell'app
-- basterebbe a leggere e riscrivere qualsiasi riga: è il modo in cui i
-- progetti Supabase vengono svuotati, e non è un caso raro.
--
-- Le regole in italiano, prima del codice:
--   · si legge solo da autenticati, mai da anonimi;
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
  on public.profili for select to authenticated using (true);

drop policy if exists "ognuno crea il proprio profilo" on public.profili;
create policy "ognuno crea il proprio profilo"
  on public.profili for insert to authenticated with check (id = auth.uid());

drop policy if exists "ognuno modifica il proprio profilo" on public.profili;
create policy "ognuno modifica il proprio profilo"
  on public.profili for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- richieste ---------------------------------------------------------------
drop policy if exists "la bacheca la leggono gli iscritti" on public.richieste;
create policy "la bacheca la leggono gli iscritti"
  on public.richieste for select to authenticated using (true);

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

-- disponibilità -----------------------------------------------------------
drop policy if exists "le disponibilita' le leggono gli iscritti" on public.disponibilita;
create policy "le disponibilita' le leggono gli iscritti"
  on public.disponibilita for select to authenticated using (true);

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
