require('dotenv').config();
const pool = require('./db');
(async () => {
  // Remove test services
  await pool.execute("DELETE FROM servicios WHERE idServicio LIKE 'SRV-b9df95d4%'");
  console.log('Servicios de prueba eliminados');
  
  // Verify no orphaned LLL33L
  const [rows] = await pool.execute(
    "SELECT idServicio, placa, estado FROM servicios WHERE placa = 'LLL33L' AND estado = 'Abierto'"
  );
  console.log('LLL33L abiertos ahora:', rows.length);
  await pool.end();
  process.exit(0);
})();
