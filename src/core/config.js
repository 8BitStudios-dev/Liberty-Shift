// Le coordinate del server.
//
// La chiave `anon` è pubblica per costruzione: finisce nel codice dell'app e
// da sola non apre niente, perché a fermarla ci sono le policy di riga scritte
// in supabase/schema.sql. La chiave `service_role`, che invece scavalca ogni
// policy, non deve mai comparire qui né in nessun altro file del repository.
//
// Finché questi due campi sono vuoti l'app funziona come ha sempre funzionato:
// tutto nel browser, persone inventate. Riempirli è l'interruttore.

export const SERVER = {
  url: 'https://daerebtkibgmtyvznfvu.supabase.co',

  /**
   * La chiave pubblicabile, per le Edge Functions.
   *
   * Supabase ha due generazioni di chiavi. Database e accesso accettano ancora
   * la `anon` qui sotto, ma le funzioni no: rispondono
   * «The apikey header matched no key configured», che è un modo oscuro per
   * dire "questa chiave è della generazione sbagliata". Sta in
   * Project Settings ▸ API Keys e comincia per `sb_publishable_`.
   *
   * È pubblica quanto l'altra: senza una sessione non apre niente.
   */
  chiavePubblicabile: 'sb_publishable_7zoKcK51OdsBKUgNZLI2Qw_DVvnVQeH',
  /**
   * La chiave pubblica VAPID delle notifiche push. Pubblica davvero: il
   * browser la consegna al servizio push del telefono, che la usa per
   * riconoscere i messaggi firmati dalla nostra chiave privata. Quella sta in
   * Vault sul server, e solo lì.
   */
  chiaveVapidPubblica: 'BID0iZcecaccRRQh1c49CrIQfIS7Orn_9KGp8dS5OXGXSOxmzTYAkF8ezYtdfAyaD7LM9EvMozT4zVALO3F80H8',
  /**
   * La chiave pubblica con cui il telefono cifra i turni che manda per le
   * notifiche compatibili (vedi `cifratura.js`). Pubblica davvero: serve solo
   * a cifrare. La privata, che decifra, sta nel Vault (`turni_chiave_privata`)
   * e la legge solo la funzione `send-push`.
   */
  chiaveTurniPubblica: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA34Qwz0t5tjKOzbtyk9BDcAMy5aULLHEv3V286rhz7r/LHYIreix14ma+VDL+Y7VQmJrDhrn1qceC46gxSAxC9PM6BZgGhH+hN3ZtycNamHUyVercbHEQ32IItIO6XychbLazvdGHJOj+/fINZIZCdbiFjdXkS6l06j/CVkj3rHl2joPPsOCI9IEdjB5s3PbIRXStWSV5I+zTOSJDCws9e0TTwjnA/TsZBWyIWz8IKQRikFtJyTcJTkv2VQhDJCIICHn1CwpHf+NR+atHOXfR71PUfjpjiyG8IGcSnnrVMpRw70cwoJ6P9spvY3fjd4ip0TMDnlVJYZgGv3NSWu9lgwIDAQAB',
  chiaveAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhZXJlYnRraWJnbXR5dnpuZnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3ODE4NzAsImV4cCI6MjEwNDM1Nzg3MH0.icOOSXRX6k3jYmyj66NQg_EMDs5cvvY5etzEvJ7xQfY',
};

/** Il server c'è solo quando ha entrambe le coordinate. */
export function serverConfigurato() {
  return Boolean(SERVER.url && SERVER.chiaveAnon);
}

/**
 * Il numero di versione, in fondo alle Impostazioni.
 *
 * Serve a capire al volo se un telefono ha preso l'ultima pubblicazione. Le
 * ultime cifre sono il numero della cache in `sw.js`, che cambia a ogni
 * pubblicazione: un test controlla che i due vadano insieme, così non si
 * può alzare l'uno e dimenticare l'altro.
 */
export const VERSIONE_APP = '1.0.068';
