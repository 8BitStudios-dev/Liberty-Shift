# Prompt da incollare in Claude Code

Apri una chat di Claude Code **dentro il repo Liberty-Shift**, copia questa
cartella nella radice del repo, e incolla il testo qui sotto.

---

Nella radice di questo repo c'è la cartella `handoff_claude_code/`: è un
redesign di Liberty Shift preparato altrove, da applicare qui. Leggi
`handoff_claude_code/README.md` e `handoff_claude_code/MODIFICHE.md` prima di
toccare qualsiasi cosa.

Il vincolo che conta: **è un restyle, non una ristrutturazione.** Sezioni,
pulsanti, flussi, nomi delle classi e comportamento restano quelli che sono.
Cambiano token, dimensioni, colori, leggibilità, le icone al posto delle
emoji, e due sole cose strutturali (una quinta voce nella tabbar, la box
"Proposte ricevute" che esce dal Profilo). Non riscrivere il layout, non
rinominare classi, non "migliorare" quello che non è nella lista.

Cosa fare, in quest'ordine:

1. Copia `handoff_claude_code/file-nuovi/redesign.css` nella radice come
   `redesign.css`, e `handoff_claude_code/file-nuovi/icone.js` come
   `src/ui/icone.js`. Sono file completi: non riscriverli, non riformattarli.
2. Applica i passi 2-6 di `MODIFICHE.md`, uno per volta. Ogni passo ha il
   codice esatto da mettere e dove: usalo così com'è, i commenti compresi —
   sono scritti nello stile del repo, che spiega il *perché* e non il cosa.
3. Il passo 7 è opzionale: **non farlo** se non te lo chiedo. Lascia i
   pallini di stato come sono.
4. Rileggi le trappole note in `CLAUDE.md` e verifica di non averne toccata
   nessuna. In particolare: `sw.js` elenca i file a mano (i due file nuovi
   vanno aggiunti lì, e la versione della cache va incrementata) e le chiavi
   di `localStorage` conservano il vecchio nome `cambio-turno:*`.
5. `npm test`. Deve essere verde prima di qualunque commit: due test
   verificano proprio l'elenco di `sw.js`, e uno le spiegazioni dei match.
6. `npm run build` per controllare che il file unico si costruisca ancora:
   il bundle non ha una cartella `public/` accanto, quindi se un'immagine
   nuova servisse va incorporata nel CSS come data URI — nel redesign non ce
   ne sono, ma il controllo vale la pena.
7. Apri l'app con `npm run dev` e guarda cinque schermate: Home, Bacheca,
   una richiesta aperta, Calendario, Profilo. Confronta con i mockup in
   `handoff_claude_code/mockup/` (apri il file `.dc.html` nel browser).
   Controlla nello specifico:
   - nessuna emoji rimasta nelle cinque schermate;
   - le cinque voci in basso stanno su una riga, "Calendario" non va a capo;
   - il contatore rosso sulla voce Proposte compare solo se qualcosa aspetta
     una risposta;
   - le pill del tipo di cambio stanno su una riga sola dentro il nome;
   - il tema scuro (Impostazioni di sistema, o `data-theme="dark"` sull'html)
     non ha testo grigio su grigio.
8. Commit e push su `main`, come dice `CLAUDE.md`: un commit solo, messaggio
   in italiano, qualcosa come `Redesign: token, densità e icone`. Niente PR.

Se un passo di `MODIFICHE.md` non combacia con il codice che trovi — perché
il file è cambiato dopo il 9 settembre — **fermati e dimmelo** invece di
adattare a intuito: il punto di questo redesign è che ogni valore è stato
scelto, non indovinato.

Alla fine dimmi cosa hai cambiato file per file, e cosa hai lasciato fuori.
