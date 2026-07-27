const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM usuarios WHERE email = ? AND activo = TRUE',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = rows[0];
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const debeCambiar = Boolean(user.debe_cambiar_password);
    
    const token = jwt.sign(
      {
        email: user.email,
        nombre: user.nombre,
        role: user.role,
        puede_cerrar_caja: Boolean(user.puede_cerrar_caja),
        acceso_excel: Boolean(user.acceso_excel),
        debe_cambiar_password: debeCambiar
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        email: user.email,
        nombre: user.nombre,
        role: user.role,
        puede_cerrar_caja: Boolean(user.puede_cerrar_caja),
        acceso_excel: Boolean(user.acceso_excel),
        debe_cambiar_password: debeCambiar
      }
    });
  } catch (e) {
    console.error('POST /login error:', e.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// POST /api/auth/change-password — cambiar contraseña del usuario autenticado
router.post('/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva contraseña son requeridas' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM usuarios WHERE email = ? AND activo = TRUE',
      [req.user.email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = rows[0];
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    await pool.execute(
      'UPDATE usuarios SET password_hash = ?, debe_cambiar_password = FALSE WHERE email = ?',
      [newHash, req.user.email]
    );

    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (e) {
    console.error('POST /change-password error:', e.message);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

// POST /api/auth/register — crear nuevo usuario (solo admin)
router.post('/auth/register', authMiddleware, adminOnly, async (req, res) => {
  const { email, nombre, password, role, puede_cerrar_caja, acceso_excel } = req.body;

  if (!email || !nombre || !password) {
    return res.status(400).json({ error: 'Email, nombre y password son requeridos' });
  }

  const validRoles = ['admin', 'developer', 'operador'];
  const userRole = validRoles.includes(role) ? role : 'operador';

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    await pool.execute(`
      INSERT INTO usuarios (email, nombre, password_hash, role, puede_cerrar_caja, acceso_excel)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      email,
      nombre,
      passwordHash,
      userRole,
      puede_cerrar_caja === true ? 1 : 0,
      acceso_excel === true ? 1 : 0
    ]);

    res.json({ ok: true, mensaje: 'Usuario creado correctamente' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    console.error('POST /auth/register error:', e.message);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// POST /api/log-client-error — recibir errores del frontend con stack trace completo
router.post('/log-client-error', async (req, res) => {
  const { mensaje, stack, archivo, linea, funcion, contexto, url, userAgent } = req.body;
  
  try {
    await pool.execute(
      `INSERT INTO logs_errores 
       (tipo, ruta, metodo, mensaje, stack_trace, datos_request, usuario, ip_cliente, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        'ERROR_CLIENT_DETAIL',
        url || 'frontend',
        'CLIENT',
        mensaje ? mensaje.substring(0, 1000) : null,
        JSON.stringify({ stack, archivo, linea, funcion, contexto }).substring(0, 2000),
        JSON.stringify({ userAgent, url }).substring(0, 1000),
        'frontend',
        req.ip || req.connection.remoteAddress
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Error guardando log cliente:', e.message);
    res.status(500).json({ error: 'No se pudo guardar el log' });
  }
});

module.exports = router;
