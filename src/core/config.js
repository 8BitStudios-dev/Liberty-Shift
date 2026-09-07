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
  url: '',
  chiaveAnon: '',
};

/** Il server c'è solo quando ha entrambe le coordinate. */
export function serverConfigurato() {
  return Boolean(SERVER.url && SERVER.chiaveAnon);
}
