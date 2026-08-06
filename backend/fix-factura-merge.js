require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function fixFacturaMerge() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Obtener sheetId
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === 'GENERAR FACTURA');
  if (!sheet) {
    console.error('❌ Hoja "GENERAR FACTURA" no encontrada');
    return;
  }
  const sheetId = sheet.properties.sheetId;
  console.log('✅ sheetId:', sheetId);

  // 2. Limpiar todo A1:B15
  console.log('🧹 Limpiando A1:B15...');
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!A1:B15'
  });

  // 3. Fórmulas
  const fFecha = '=IFERROR(LEFT(INDEX(FILTER(Servicios!B2:B5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)),FIND(\",\",INDEX(FILTER(Servicios!B2:B5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)))-1),\"\")';
  const fCliente = '=IFERROR(INDEX(Clientes!C:C,MATCH(TEXT(INDEX(Vehículos!C:C,MATCH(B2,Vehículos!B:B,0)),\"0\"),Clientes!B:B,0)),\"\")';
  const fRepuestos = '=\"REPUESTOS:\"&CHAR(10)&IFERROR(INDEX(FILTER(Servicios!F2:F5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)),\"\")';
  const fServicios = '=\"SERVICIO:\"&CHAR(10)&IFERROR(INDEX(FILTER(Servicios!G2:G5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)),\"\")';
  const fTotal = '=IFERROR(INDEX(FILTER(Servicios!J2:J5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)),0)';

  // 4. Escribir datos base (A1:B10)
  const data = [
    ['MOTOVERSO', ''],           // A1:B1
    ['Placa:', 'QHR72E'],        // A2:B2
    ['Fecha Salida:', fFecha],   // A3:B3
    ['Cliente:', fCliente],      // A4:B4
    [fRepuestos, ''],            // A5:B5 → merge
    ['', ''],                     // A6:B6 → vacío
    [fServicios, ''],            // A7:B7 → merge
    ['', ''],                     // A8:B8
    ['', ''],                     // A9:B9
    ['TOTAL A PAGAR:', fTotal]   // A10:B10
  ];

  console.log('📝 Escribiendo datos...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!A1:B10',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: data }
  });

  // 5. Aplicar formato: merges, wrap, bold, borders
  console.log('🎨 Aplicando formato...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        // Merge A1:B1 (MOTOVERSO)
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: 'MERGE_ALL' } },
        // Merge A5:B5 (REPUESTOS)
        { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: 'MERGE_ALL' } },
        // Merge A7:B7 (SERVICIO)
        { mergeCells: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: 'MERGE_ALL' } },

        // MOTOVERSO: bold, 14pt, centered
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)' } },

        // Labels bold (Placa, Fecha, Cliente, Total)
        { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { repeatCell: { range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },

        // Border verde B2:B4
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },

        // REPUESTOS merge: wrap text, top align
        { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },

        // SERVICIO merge: wrap text, top align
        { repeatCell: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },

        // TOTAL border
        { updateBorders: { range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },

        // Columnas: A=200, B=400
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 400 }, fields: 'pixelSize' } }
      ]
    }
  });

  console.log('⏳ Esperando evaluación de fórmulas...');
  await new Promise(r => setTimeout(r, 6000));

  // 6. Verificar
  const check = async (cell) => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `GENERAR FACTURA!${cell}` });
    return (r.data.values || [])[0]?.[0] || '';
  };

  console.log('\n✅ RESULTADO FINAL:');
  console.log('Placa (B2):', await check('B2'));
  console.log('Fecha (B3):', await check('B3'));
  console.log('Cliente (B4):', await check('B4'));
  console.log('Repuestos (A5):', (await check('A5')).substring(0, 80));
  console.log('Servicios (A7):', (await check('A7')).substring(0, 80));
  console.log('Total (B10):', await check('B10'));

  console.log('\n🎉 Factura actualizada con celdas mergeadas');
}

fixFacturaMerge().catch(e => {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
});
