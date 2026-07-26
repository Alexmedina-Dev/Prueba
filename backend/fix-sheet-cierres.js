require('dotenv').config();
const pool = require('./db');
const { google } = require('googleapis');

async function fixSheet() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;

  // 1. Leer MySQL
  const [mysqlRows] = await pool.execute(
    'SELECT idCierre, fecha, tecnico, cantidad_servicios, total_facturado FROM cierres_diarios ORDER BY fecha, tecnico'
  );
  console.log(`MySQL: ${mysqlRows.length} cierres`);

  // Formatear fechas
  const allRows = mysqlRows.map(r => {
    let fechaStr;
    if (r.fecha instanceof Date) {
      const y = r.fecha.getFullYear();
      const m = String(r.fecha.getMonth() + 1).padStart(2, '0');
      const d = String(r.fecha.getDate()).padStart(2, '0');
      fechaStr = `${y}-${m}-${d}`;
    } else {
      fechaStr = String(r.fecha).split('T')[0];
    }
    return [r.idCierre, fechaStr, r.tecnico, r.cantidad_servicios, r.total_facturado];
  });

  // 2. Estrategia: crear una hoja nueva, copiar header, escribir todo, borrar la vieja, renombrar
  // Primero, eliminar la hoja vieja
  const ssInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const oldSheet = ssInfo.data.sheets.find(s => s.properties.title === 'Cierres Diarios');

  // Crear hoja temporal
  const tempResp = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { addSheet: { properties: { title: 'Cierres_Temp' } } }
      ]
    }
  });
  const tempSheetId = tempResp.data.replies[0].addSheet.properties.sheetId;

  // Escribir header
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Cierres_Temp!A1:E1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['ID_Cierre', 'Fecha', 'ID_Técnico', 'Cantidad_Servicios', 'Total_Facturado']] }
  });

  // Escribir todos los datos
  const BATCH = 100;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Cierres_Temp!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: batch }
    });
    console.log(`  Escritas ${Math.min(i + BATCH, allRows.length)} / ${allRows.length}`);
  }

  // Verificar hoja temporal
  const tempData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Cierres_Temp!A:E'
  });
  const tempCount = (tempData.data.values || []).length - 1;
  console.log(`\nHoja temporal: ${tempCount} cierres`);

  // Eliminar hoja vieja y renombrar temporal
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { deleteSheet: { sheetId: oldSheet.properties.sheetId } },
        { updateSheetProperties: { properties: { sheetId: tempSheetId, title: 'Cierres Diarios' }, fields: 'title' } }
      ]
    }
  });

  // Verificar
  const finalSheet = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Cierres Diarios!A:E'
  });
  const finalRows = (finalSheet.data.values || []).slice(1);
  const finalIds = new Set(finalRows.map(r => r[0]));

  console.log(`\n=== RESULTADO FINAL ===`);
  console.log(`MySQL: ${mysqlRows.length} cierres`);
  console.log(`Sheet: ${finalRows.length} cierres`);
  console.log(`IDs únicos Sheet: ${finalIds.size}`);
  console.log(`Iguales: ${mysqlRows.length === finalRows.length ? '✅ SI' : '❌ NO'}`);

  const badIds = finalRows.filter(r => !/^CIE-\d+$/.test(r[0]));
  if (badIds.length > 0) {
    console.log(`Formatos incorrectos: ${badIds.length}`);
    badIds.forEach(r => console.log(`  ${r[0]}`));
  }

  await pool.end();
  process.exit(0);
}

fixSheet().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
