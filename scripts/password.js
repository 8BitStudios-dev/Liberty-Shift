// Genera l'impronta di una password, da incollare in RULES.accesso.impronta.
//
//   node scripts/password.js "la mia password"
//
// La password in chiaro non va scritta da nessuna parte nel progetto: si dice
// a voce a chi deve entrare, e nel codice resta solo questa impronta.

import { impronta } from '../src/core/accesso.js';

const password = process.argv.slice(2).join(' ');
if (!password.trim()) {
  console.error('Uso: node scripts/password.js "la password"');
  process.exit(1);
}

console.log(`impronta: '${impronta(password)}',`);
console.log('\nIncollala in src/core/rules.js, dentro RULES.accesso.');
