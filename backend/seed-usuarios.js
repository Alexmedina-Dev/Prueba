require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');

const usuarios = [
  { nombre: 'Nury Hernández', email: 'repuestoshannasmotos@gmail.com', role: 'admin', puede_cerrar_caja: true, acceso_excel: true, password: 'nury1234' },
  { nombre: 'Alex Medina', email: 'alexandermedi53h@gmail.com', role: 'developer', puede_cerrar_caja: true, acceso_excel: true, password: 'alex1234' },
  { nombre: 'Don Mauricio', email: 'motoversotaller@gmail.com', role: 'operador', puede_cerrar_caja: true, acceso_excel: false, password: 'mauricio1234' },
  { nombre: 'Ana Najar', email: 'ana@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'ana1234' },
  { nombre: 'Steven', email: 'steven@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'steven1234' },
  { nombre: 'Erika', email: 'erika@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'erika1234' },
  { nombre: 'Hanna', email: 'hanna@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'hanna1234' },
  { nombre: 'Cecilia', email: 'cecilia@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'cecilia1234' }
];

async function seed() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        nombre VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'developer', 'operador') DEFAULT 'operador',
        puede_cerrar_caja BOOLEAN DEFAULT FALSE,
        acceso_excel BOOLEAN DEFAULT FALSE,
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    for (const u of usuarios) {
      const hash = bcrypt.hashSync(u.password, 10);
      await pool.execute(`
        INSERT INTO usuarios (email, nombre, password_hash, role, puede_cerrar_caja, acceso_excel, activo)
        VALUES (?, ?, ?, ?, ?, ?, TRUE)
        ON DUPLICATE KEY UPDATE
          nombre = VALUES(nombre),
          password_hash = VALUES(password_hash),
          role = VALUES(role),
          puede_cerrar_caja = VALUES(puede_cerrar_caja),
          acceso_excel = VALUES(acceso_excel),
          activo = TRUE
      `, [u.email, u.nombre, hash, u.role, u.puede_cerrar_caja, u.acceso_excel]);
      console.log(`✅ Usuario ${u.email} insertado/actualizado`);
    }

    console.log('🎉 Seed completado');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en seed:', err.message);
    process.exit(1);
  }
}

seed();
