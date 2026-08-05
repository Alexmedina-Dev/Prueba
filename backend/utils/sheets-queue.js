let colaOcupada = false;
const cola = [];
const MAX_COLA_SIZE = 50; // Límite para evitar memory leaks

function encolarSync(syncFn, datos, estado) {
  // Si la cola está llena, descartar el sync más antiguo
  if (cola.length >= MAX_COLA_SIZE) {
    console.warn('[Sheets Queue] ⚠️ Cola llena, descartando sync más antiguo');
    cola.shift();
  }
  cola.push({ syncFn, datos, estado });
  procesarCola();
}

async function procesarCola() {
  if (colaOcupada || cola.length === 0) return;
  colaOcupada = true;
  const { syncFn, datos, estado } = cola.shift();

  let intentos = 0;
  const maxIntentos = 3;
  while (intentos < maxIntentos) {
    try {
      await syncFn(datos, estado);
      break;
    } catch (err) {
      intentos++;
      const esCuota = err.message && err.message.includes('Quota exceeded');
      if (esCuota && intentos < maxIntentos) {
        await new Promise(r => setTimeout(r, 2000 * intentos)); // 2s, luego 4s
      } else {
        break; // syncSheets ya loguea el error internamente
      }
    }
  }

  colaOcupada = false;
  procesarCola();
}

module.exports = { encolarSync };
