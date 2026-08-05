require('dotenv').config();
const { google } = require('googleapis');

async function findQHR72E() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;
  
  // Get all vehiculos (in chunks)
  let allRows = [];
  let startRow = 1;
  let hasMore = true;
  
  while (hasMore && startRow < 2000) {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Vehículos!A${startRow}:D${startRow + 499}`
    });
    
    const rows = result.data.values || [];
    if (rows.length === 0) {
      hasMore = false;
    } else {
      allRows = allRows.concat(rows);
      startRow += 500;
    }
  }
  
  console.log('=== TOTAL FILAS VEHICULOS ===');
  console.log(allRows.length);
  
  // Find QHR72E
  const qhrRows = allRows.filter(r => r[1] === 'QHR72E');
  console.log('\n=== QHR72E ENCONTRADO ===');
  console.log('Total:', qhrRows.length, 'veces');
  qhrRows.forEach((r, i) => {
    console.log('Fila:', i+1, JSON.stringify(r));
  });
  
  // Check all duplicates
  const placaCount = {};
  allRows.forEach(r => {
    if (r[1] && r[1] !== 'Placa') {
      placaCount[r[1]] = (placaCount[r[1]] || 0) + 1;
    }
  });
  
  const dups = Object.entries(placaCount).filter(([k,v]) => v > 1);
  console.log('\n=== TODOS LOS DUPLICADOS ===');
  console.log('Total placas duplicadas:', dups.length);
  dups.slice(0, 20).forEach(([placa, count]) => {
    console.log(placa, ':', count, 'veces');
  });
}

findQHR72E();