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
  chiaveAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhZXJlYnRraWJnbXR5dnpuZnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3ODE4NzAsImV4cCI6MjEwNDM1Nzg3MH0.icOOSXRX6k3jYmyj66NQg_EMDs5cvvY5etzEvJ7xQfY',
};

/** Il server c'è solo quando ha entrambe le coordinate. */
export function serverConfigurato() {
  return Boolean(SERVER.url && SERVER.chiaveAnon);
}
