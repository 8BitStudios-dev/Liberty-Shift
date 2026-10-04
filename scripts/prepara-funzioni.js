// Copia nella funzione send-push il motore che gira anche sul telefono.
//
// Una Edge Function si pubblica da sola, senza il resto del repository: il
// motore che decide le compatibilità deve starle accanto. Copiarlo a mano
// vorrebbe dire due versioni che prima o poi divergono, e una notifica che
// l'app poi non conferma. Questo script è l'unico modo in cui i file in
// `supabase/functions/send-push/core/` cambiano, e un test verifica che
// siano identici agli originali.
//
// Dopo averlo lanciato la funzione va ripubblicata (vedi docs/07-supabase.md).

import { copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** I moduli che la funzione importa, direttamente o no. L'ordine non conta. */
export const MODULI_FUNZIONE = ['rules.js', 'time.js', 'model.js', 'engine.js', 'compatibili.js'];
export const CARTELLA_FUNZIONE = join('supabase', 'functions', 'send-push', 'core');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(join(RADICE, CARTELLA_FUNZIONE), { recursive: true });
  for (const nome of MODULI_FUNZIONE) {
    await copyFile(join(RADICE, 'src', 'core', nome), join(RADICE, CARTELLA_FUNZIONE, nome));
  }
  console.log(`Copiati ${MODULI_FUNZIONE.length} moduli in ${CARTELLA_FUNZIONE}`);
}
