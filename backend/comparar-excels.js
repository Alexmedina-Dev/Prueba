const XLSX = require('xlsx');

console.log('=== COMPARANDO DOS EXCELS ===\n');

// Leer Excel 1 (APP - con datos nuevos)
const wb1 = XLSX.readFile('C:/MotoVerso/APP/seguimiento de servicios.xlsx');
const ws1Clientes = wb1.Sheets['Clientes'];
const ws1Vehiculos = wb1.Sheets['Vehículos'];
const ws1Servicios = wb1.Sheets['Servicios'];
const ws1Detalle = wb1.Sheets['Detalle_Servicios'];
const ws1Cierres = wb1.Sheets['Cierres Diarios'];

const data1Clientes = XLSX.utils.sheet_to_json(ws1Clientes, {header: 1});
const data1Vehiculos = XLSX.utils.sheet_to_json(ws1Vehiculos, {header: 1});
const data1Servicios = XLSX.utils.sheet_to_json(ws1Servicios, {header: 1});
const data1Detalle = XLSX.utils.sheet_to_json(ws1Detalle, {header: 1});
const data1Cierres = XLSX.utils.sheet_to_json(ws1Cierres, {header: 1});

// Leer Excel 2 (Downloads - base correcta)
const wb2 = XLSX.readFile('C:/Users/alexa/Downloads/Copia de seguimiento de servicios (2).xlsx');
const ws2Clientes = wb2.Sheets['Clientes'];
const ws2Vehiculos = wb2.Sheets['Vehículos'];
const ws2Servicios = wb2.Sheets['Servicios'];
const ws2Detalle = wb2.Sheets['Detalle_Servicios'];
const ws2Cierres = wb2.Sheets['Cierres Diarios'];

const data2Clientes = XLSX.utils.sheet_to_json(ws2Clientes, {header: 1});
const data2Vehiculos = XLSX.utils.sheet_to_json(ws2Vehiculos, {header: 1});
const data2Servicios = XLSX.utils.sheet_to_json(ws2Servicios, {header: 1});
const data2Detalle = XLSX.utils.sheet_to_json(ws2Detalle, {header: 1});
const data2Cierres = XLSX.utils.sheet_to_json(ws2Cierres, {header: 1});

console.log('=== EXCEL 1 (APP/seguimiento de servicios.xlsx) ===');
console.log('Clientes:', data1Clientes.length);
console.log('Vehículos:', data1Vehiculos.length);
console.log('Servicios:', data1Servicios.length);
console.log('Detalle_Servicios:', data1Detalle.length);
console.log('Cierres Diarios:', data1Cierres.length);

console.log('\n=== EXCEL 2 (Downloads/Copia...) ===');
console.log('Clientes:', data2Clientes.length);
console.log('Vehículos:', data2Vehiculos.length);
console.log('Servicios:', data2Servicios.length);
console.log('Detalle_Servicios:', data2Detalle.length);
console.log('Cierres Diarios:', data2Cierres.length);

// Función para obtener IDs únicos de una hoja
function getIDs(data, idColumnIndex) {
  const ids = new Set();
  data.forEach((row, i) => {
    if (i === 0) return; // Skip header
    const id = row[idColumnIndex];
    if (id && String(id).trim() !== '') {
      ids.add(String(id).trim());
    }
  });
  return ids;
}

// Comparar Servicios
const ids1Servicios = getIDs(data1Servicios, 0); // Columna A = ID_Servicio
const ids2Servicios = getIDs(data2Servicios, 0);

const nuevosServicios = [];
ids1Servicios.forEach(id => {
  if (!ids2Servicios.has(id)) {
    nuevosServicios.push(id);
  }
});

console.log('\n=== COMPARACIÓN SERVICIOS ===');
console.log('IDs en Excel 1:', ids1Servicios.size);
console.log('IDs en Excel 2:', ids2Servicios.size);
console.log('Servicios NUEVOS en Excel 1:', nuevosServicios.length);

// Mostrar primeros 10 servicios nuevos
if (nuevosServicios.length > 0) {
  console.log('\nPrimeros 10 servicios nuevos:');
  nuevosServicios.slice(0, 10).forEach((id, i) => {
    // Buscar info del servicio
    const servicio = data1Servicios.find(r => r[0] === id);
    if (servicio) {
      console.log(i+1, ':', id, '- Placa:', servicio[2], '- Fecha:', servicio[1]);
    }
  });
}

// Comparar Clientes por cédula
const cedulas1 = getIDs(data1Clientes, 1); // Columna B = Cédula
const cedulas2 = getIDs(data2Clientes, 1);

const nuevosClientes = [];
cedulas1.forEach(cedula => {
  if (!cedulas2.has(cedula)) {
    nuevosClientes.push(cedula);
  }
});

console.log('\n=== COMPARACIÓN CLIENTES ===');
console.log('Cédulas en Excel 1:', cedulas1.size);
console.log('Cédulas en Excel 2:', cedulas2.size);
console.log('Clientes NUEVOS en Excel 1:', nuevosClientes.length);

// Comparar Vehículos por placa
const placas1 = getIDs(data1Vehiculos, 1); // Columna B = Placa
const placas2 = getIDs(data2Vehiculos, 1);

const nuevosVehiculos = [];
placas1.forEach(placa => {
  if (!placas2.has(placa)) {
    nuevosVehiculos.push(placa);
  }
});

console.log('\n=== COMPARACIÓN VEHÍCULOS ===');
console.log('Placas en Excel 1:', placas1.size);
console.log('Placas en Excel 2:', placas2.size);
console.log('Vehículos NUEVOS en Excel 1:', nuevosVehiculos.length);

// Comparar Cierres por ID_Cierre
const ids1Cierres = getIDs(data1Cierres, 0); // Columna A = ID_Cierre
const ids2Cierres = getIDs(data2Cierres, 0);

const nuevosCierres = [];
ids1Cierres.forEach(id => {
  if (!ids2Cierres.has(id)) {
    nuevosCierres.push(id);
  }
});

console.log('\n=== COMPARACIÓN CIERRES ===');
console.log('IDs en Excel 1:', ids1Cierres.size);
console.log('IDs en Excel 2:', ids2Cierres.size);
console.log('Cierres NUEVOS en Excel 1:', nuevosCierres.length);

// Guardar resultados para uso posterior
const fs = require('fs');
const resultado = {
  fecha: new Date().toISOString(),
  excel1: {
    archivo: 'APP/seguimiento de servicios.xlsx',
    clientes: data1Clientes.length,
    vehiculos: data1Vehiculos.length,
    servicios: data1Servicios.length,
    detalle: data1Detalle.length,
    cierres: data1Cierres.length
  },
  excel2: {
    archivo: 'Downloads/Copia de seguimiento de servicios (2).xlsx',
    clientes: data2Clientes.length,
    vehiculos: data2Vehiculos.length,
    servicios: data2Servicios.length,
    detalle: data2Detalle.length,
    cierres: data2Cierres.length
  },
  nuevos: {
    servicios: nuevosServicios,
    clientes: nuevosClientes,
    vehiculos: nuevosVehiculos,
    cierres: nuevosCierres
  }
};

fs.writeFileSync('C:/MotoVerso/backend/comparacion-excels.json', JSON.stringify(resultado, null, 2));
console.log('\n✅ Comparación guardada en: backend/comparacion-excels.json');