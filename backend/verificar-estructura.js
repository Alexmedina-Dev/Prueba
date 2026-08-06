require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function verificarEstructura() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('=== VERIFICANDO ESTRUCTURA DE HOJAS ===\n');

  // 1. Headers de Clientes
  console.log('📋 HOJA "Clientes" - Primeras 3 filas:');
  const clientes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Clientes!A1:E3'
  });
  (clientes.data.values || []).forEach((r, i) => {
    console.log(`  Fila ${i+1}: ${JSON.stringify(r)}`);
  });

  // 2. Headers de Vehículos
  console.log('\n📋 HOJA "Vehículos" - Primeras 3 filas:');
  const vehiculos = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Vehículos!A1:E3'
  });
  (vehiculos.data.values || []).forEach((r, i) => {
    console.log(`  Fila ${i+1}: ${JSON.stringify(r)}`);
  });

  // 3. Buscar QHR72E en Vehículos
  console.log('\n🔍 Buscando QHR72E en Vehículos:');
  const vData = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Vehículos!A2:E5000'
  });
  const vRows = vData.data.values || [];
  const vMatch = vRows.filter(r => String(r[1] || '').toUpperCase() === 'QHR72E');
  if (vMatch.length > 0) {
    vMatch.forEach((r, i) => {
      console.log(`  Fila encontrada: ${JSON.stringify(r)}`);
      console.log(`    A(idServicio)=${r[0]}, B(placa)=${r[1]}, C(cedula)=${r[2]}, D(modelo)=${r[3]}, E(kilometraje)=${r[4]}`);
    });
  } else {
    console.log('  ❌ QHR72E NO encontrada en Vehículos');
  }

  // 4. Buscar cliente por cédula
  const cedulaQHR = vMatch[0]?.[2];
  if (cedulaQHR) {
    console.log(`\n🔍 Buscando cliente con cédula "${cedulaQHR}" en Clientes:`);
    const cData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Clientes!A2:E5000'
    });
    const cRows = cData.data.values || [];
    const cMatch = cRows.filter(r => String(r[1] || '').trim() === String(cedulaQHR).trim());
    if (cMatch.length > 0) {
      cMatch.forEach((r, i) => {
        console.log(`  Fila encontrada: ${JSON.stringify(r)}`);
        console.log(`    A(idServicio)=${r[0]}, B(cedula)=${r[1]}, C(nombre)=${r[2]}, D(tel)=${r[3]}, E(correo)=${r[4]}`);
      });
    } else {
      console.log('  ❌ Cliente NO encontrado');
      // Mostrar algunas filas de ejemplo para debug
      console.log('\n  📄 Primeras 5 filas de Clientes para referencia:');
      cRows.slice(0, 5).forEach((r, i) => {
        console.log(`    Fila ${i+2}: ${JSON.stringify(r)}`);
      });
    }
  }
}

verificarEstructura().catch(e => {
  console.error('❌ Error:', e.message);
});
