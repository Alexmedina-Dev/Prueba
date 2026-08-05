const XLSX = require('xlsx');

// Leer el Excel
const wb = XLSX.readFile('C:/MotoVerso/APP/seguimiento de servicios.xlsx');

// Obtener la hoja Clientes
const ws = wb.Sheets['Clientes'];

// Verificar que hay en A1
console.log('Valor actual en A1:', ws['A1']);

// Cambiar el header de A1 a 'ID_Servicio'
ws['A1'] = { t: 's', v: 'ID_Servicio' };

// Guardar el Excel modificado
XLSX.writeFile(wb, 'C:/MotoVerso/APP/seguimiento de servicios.xlsx');

console.log('Header A1 cambiado correctamente');
console.log('Nuevo valor en A1:', ws['A1']);