let colaOcupada = false;
const cola = [];

function encolarSync(syncFn, datos, estado) {
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
