require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function debugQHR72E() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  // Traer TODA la hoja Servicios (A=ID, B=Fecha, C=Placa, F=Repuestos, G=Servicios, J=Total)
  console.log('Leyendo hoja Servicios...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Servicios!A2:J5000'
  });

  const rows = res.data.values || [];
  console.log(`Total filas en Servicios: ${rows.length}`);

  // Filtrar solo QHR72E
  const qhrRows = rows.filter(r => String(r[2] || '').trim().toUpperCase() === 'QHR72E');
  console.log(`\n🔍 Servicios encontrados para QHR72E: ${qhrRows.length}`);

  qhrRows.forEach((r, i) => {
    console.log(`\n--- Servicio #${i + 1} (fila ${rows.indexOf(r) + 2}) ---`);
    console.log('  ID (A):', r[0] || 'N/A');
    console.log('  Fecha (B):', r[1] || 'N/A');
    console.log('  Placa (C):', r[2] || 'N/A');
    console.log('  Repuestos (F):', (r[5] || '').substring(0, 60) + '...');
    console.log('  Servicios (G):', (r[6] || '').substring(0, 60) + '...');
    console.log('  Total (J):', r[9] || '0');
  });

  console.log('\n📊 Resumen:');
  console.log(`  COUNTIF(C2:C5000, "QHR72E") debería dar: ${qhrRows.length}`);
  console.log(`  Último servicio (fila más abajo): #${qhrRows.length}`);
  if (qhrRows.length > 0) {
    const ultimo = qhrRows[qhrRows.length - 1];
    console.log(`  Último - Repuestos: ${(ultimo[5] || '').substring(0, 60)}`);
    console.log(`  Último - Servicios: ${(ultimo[6] || '').substring(0, 60)}`);
    console.log(`  Último - Total: ${ultimo[9] || '0'}`);
  }
}

debugQHR72E().catch(e => {
  console.error('❌ Error:', e.message);
});
