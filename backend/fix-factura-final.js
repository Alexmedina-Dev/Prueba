require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function cleanAndFix() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('1️⃣ Limpiando fórmulas viejas de B5:B12...');
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B5:B12'
  });

  // Fórmulas correctas: INDEX + FILTER + COUNTIF (último servicio únicamente)
  const formulas = [
    // B5 - Repuestos (último servicio)
    '=IFERROR(INDEX(FILTER(Servicios!F2:F5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)),"")',
    // B6 - vacío (la celda B5 se expande con wrap)
    '',
    // B7 - Servicios/Mano de Obra (último servicio)
    '=IFERROR(INDEX(FILTER(Servicios!G2:G5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)),"")',
    // B8 - vacío (la celda B7 se expande con wrap)
    '',
    // B9 - vacío (respiro)
    '',
    // B10 - Total a pagar (último servicio)
    '=IFERROR(INDEX(FILTER(Servicios!J2:J5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)),0)',
    // B11 - vacío
    '',
    // B12 - vacío
    ''
  ];

  console.log('2️⃣ Escribiendo fórmulas correctas...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B5:B12',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: formulas.map(f => [f]) }
  });

  await new Promise(r => setTimeout(r, 5000));

  // Verificar
  console.log('3️⃣ Verificando resultados...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!A2:B12'
  });

  console.log('\n=== RESULTADO FINAL ===');
  const rows = res.data.values || [];
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    const label = r[0] || '';
    const value = r[1] || '';
    console.log(`Fila ${rowNum}: ${label.padEnd(20)} | ${value.substring(0, 50)}`);
  });

  // Leer valores evaluados individualmente
  const check = async (cell) => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `GENERAR FACTURA!${cell}` });
    return (r.data.values || [])[0]?.[0] || '';
  };

  console.log('\n=== VALORES EVALUADOS (QHR72E) ===');
  console.log('Placa (B2):', await check('B2'));
  console.log('Fecha (B3):', await check('B3'));
  console.log('Cliente (B4):', await check('B4'));
  console.log('Repuestos (B5):', (await check('B5')).substring(0, 60));
  console.log('Servicios (B7):', (await check('B7')).substring(0, 60));
  console.log('Total (B10):', await check('B10'));
}

cleanAndFix().catch(e => {
  console.error('❌ Error:', e.message);
});
