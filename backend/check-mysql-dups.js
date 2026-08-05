require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkMySQL() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motoverso'
  });

  // Check QHR72E in MySQL
  const [vehiculos] = await connection.execute(
    'SELECT idServicio, placa, cedula_cliente, modelo FROM vehiculos WHERE placa = ?',
    ['QHR72E']
  );
  
  console.log('=== QHR72E EN MySQL ===');
  console.log('Total:', vehiculos.length);
  vehiculos.forEach((v, i) => {
    console.log('Registro', i+1, ':', JSON.stringify(v));
  });

  // Check all duplicates in MySQL
  const [dups] = await connection.execute(
    'SELECT placa, COUNT(*) as count FROM vehiculos GROUP BY placa HAVING count > 1 LIMIT 20'
  );
  
  console.log('\n=== DUPLICADOS EN MySQL ===');
  console.log('Total placas duplicadas:', dups.length);
  dups.forEach(d => {
    console.log(d.placa, ':', d.count, 'veces');
  });
  
  await connection.end();
}

checkMySQL();