require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function debugFormulas() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('=== DEBUG DE FÓRMULAS ===\n');

  // Leer fórmulas exactas de B3 y B4
  const formulas = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B3:B4',
    valueRenderOption: 'FORMULA'
  });

  console.log('📋 Fórmulas actuales:');
  (formulas.data.values || []).forEach((r, i) => {
    console.log(`  B${i+3}: ${r[0] || '(vacío)'}`);
  });

  // Verificar qué hay en Servicios para QHR72E (columna B = fecha)
  console.log('\n🔍 Verificando datos de QHR72E en hoja Servicios:');
  const serv = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Servicios!A2:C5000'
  });
  const rows = serv.data.values || [];
  const qhrRows = rows.filter(r => String(r[2] || '').trim().toUpperCase() === 'QHR72E');
  console.log(`  Encontrados: ${qhrRows.length} servicios`);
  qhrRows.forEach((r, i) => {
    console.log(`    #${i+1}: ID=${r[0]}, Fecha=${r[1]}`);
  });

  // Verificar Vehículos y Clientes
  console.log('\n🔍 Verificando Vehículos para QHR72E:');
  const veh = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Vehículos!A2:C5000'
  });
  const vRows = veh.data.values || [];
  const vMatch = vRows.find(r => String(r[1] || '').toUpperCase() === 'QHR72E');
  if (vMatch) {
    console.log(`  Encontrado: ${JSON.stringify(vMatch)}`);
    const cedula = vMatch[2];
    console.log(`  Cédula: "${cedula}" (tipo: ${typeof cedula})`);

    console.log('\n🔍 Verificando Clientes por cédula:');
    const cli = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Clientes!A2:C5000'
    });
    const cRows = cli.data.values || [];
    // Buscar como texto exacto
    const cMatchText = cRows.find(r => String(r[1] || '').trim() === String(cedula).trim());
    // Buscar como número
    const cMatchNum = cRows.find(r => Number(r[1]) === Number(cedula));
    console.log(`  Match por texto exacto: ${cMatchText ? 'SÍ - ' + JSON.stringify(cMatchText) : 'NO'}`);
    console.log(`  Match por número: ${cMatchNum ? 'SÍ - ' + JSON.stringify(cMatchNum) : 'NO'}`);
  } else {
    console.log('  ❌ QHR72E NO encontrada en Vehículos');
  }
}

debugFormulas().catch(e => console.error('Error:', e.message));
