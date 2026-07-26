require('dotenv').config();
const pool = require('./db');

(async () => {
  const [r] = await pool.execute(
    "SELECT idServicio, placa, tecnico, DATE(fecha) as ingreso, DATE(fecha_salida) as salida, estado FROM servicios WHERE estado = 'Abierto' ORDER BY fecha"
  );
  console.log('Servicios abiertos:', r.length);
  r.forEach(x => console.log(x.idServicio, '|', x.placa, '|', x.tecnico, '|', x.ingreso, '|', x.salida, '|', x.estado));
  await pool.end();
  process.exit(0);
})();
