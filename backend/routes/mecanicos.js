const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /api/mecanicos - listar todos los mecánicos activos
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nombre, activo FROM mecanicos WHERE activo = TRUE ORDER BY nombre'
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /mecanicos error:', e.message);
    res.status(500).json({ error: 'Error al obtener mecánicos' });
  }
});

// POST /api/mecanicos - agregar nuevo mecánico
router.post('/', authMiddleware, async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'Nombre requerido' });
  }

  try {
    await pool.execute(
      'INSERT INTO mecanicos (nombre) VALUES (?)',
      [nombre.trim()]
    );
    res.json({ ok: true, mensaje: `Mecánico ${nombre} agregado` });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El mecánico ya existe' });
    }
    console.error('POST /mecanicos error:', e.message);
    res.status(500).json({ error: 'Error al agregar mecánico' });
  }
});

// DELETE /api/mecanicos/:nombre - eliminar (soft delete)
router.delete('/:nombre', authMiddleware, async (req, res) => {
  const { nombre } = req.params;
  
  try {
    const [result] = await pool.execute(
      'UPDATE mecanicos SET activo = FALSE WHERE nombre = ?',
      [nombre]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mecánico no encontrado' });
    }
    
    res.json({ ok: true, mensaje: `Mecánico ${nombre} eliminado` });
  } catch (e) {
    console.error('DELETE /mecanicos error:', e.message);
    res.status(500).json({ error: 'Error al eliminar mecánico' });
  }
});

module.exports = router;