require('dotenv').config();
const pool = require('./db');
const { google } = require('googleapis');

async function syncAllCierres() {
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

  const mysqlMap = new Map();
  mysqlRows.forEach(r => {
    const key = `${r.fecha}|${r.tecnico}`;
    mysqlMap.set(key, r);
  });

  // 2. Leer Sheet
  const sheetData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Cierres Diarios!A:E'
  });
  const sheetRows = (sheetData.data.values || []).slice(1); // quitar header
  console.log(`Sheet: ${sheetRows.length} cierres`);

  const sheetMap = new Map();
  sheetRows.forEach(r => {
    const key = `${r[1]}|${r[2]}`;
    sheetMap.set(key, r);
  });

  // 3. Cierres en MySQL pero NO en Sheet → agregar al Sheet
  const paraSheet = [];
  for (const [key, row] of mysqlMap) {
    if (!sheetMap.has(key)) {
      paraSheet.push([
        row.idCierre,
        row.fecha,
        row.tecnico,
        row.cantidad_servicios,
        row.total_facturado
      ]);
    }
  }

  if (paraSheet.length > 0) {
    console.log(`\nAgregando ${paraSheet.length} cierres al Sheet...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Cierres Diarios!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: paraSheet }
    });
    console.log('✅ Cierres agregados al Sheet');
  } else {
    console.log('\nNo hay cierres faltantes en el Sheet');
  }

  // 4. Cierres en Sheet pero NO en MySQL → insertar en MySQL
  let insertados = 0;
  for (const [key, row] of sheetMap) {
    if (!mysqlMap.has(key)) {
      const idCierre = row[0];
      const fecha = row[1];
      const tecnico = row[2];
      const cantidad = parseInt(row[3]) || 0;
      const total = parseInt(row[4]) || 0;

      try {
        await pool.execute(`
          INSERT INTO cierres_diarios (idCierre, fecha, tecnico, cantidad_servicios, total_facturado)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE idCierre = VALUES(idCierre)
        `, [idCierre, fecha, tecnico, cantidad, total]);
        insertados++;
        console.log(`  Insertado en MySQL: ${idCierre} | ${fecha} | ${tecnico}`);
      } catch (e) {
        console.error(`  Error insertando ${idCierre}: ${e.message}`);
      }
    }
  }

  if (insertados > 0) {
    console.log(`\n✅ ${insertados} cierres insertados en MySQL`);
  } else {
    console.log('\nNo hay cierres faltantes en MySQL');
  }

  // 5. Resumen final
  const [finalCount] = await pool.execute('SELECT COUNT(*) as total FROM cierres_diarios');
  const sheetFinal = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Cierres Diarios!A:E'
  });
  const sheetFinalCount = (sheetFinal.data.values || []).length - 1;

  console.log('\n========================================');
  console.log('RESUMEN FINAL');
  console.log(`MySQL: ${finalCount[0].total} cierres`);
  console.log(`Sheet: ${sheetFinalCount} cierres`);
  console.log(`Iguales: ${finalCount[0].total === sheetFinalCount ? '✅ SI' : '❌ NO'}`);
  console.log('========================================');

  await pool.end();
  process.exit(0);
}

syncAllCierres().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
