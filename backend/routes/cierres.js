const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const syncSheets = require('../utils/sync-sheets');

// POST /api/cierres/generar
router.post('/generar', auth, async (req, res) => {
  try {
    const { fecha, tecnico } = req.body;

    if (!fecha || !tecnico) {
      return res.status(400).json({ error: 'Fecha y técnico requeridos' });
    }

    // Buscar servicios cerrados por fecha_salida y técnico
    const [servicios] = await pool.execute(`
      SELECT idServicio, fecha_salida
      FROM servicios
      WHERE estado = 'Cerrado'
        AND DATE(fecha_salida) = ?
        AND tecnico = ?
    `, [fecha, tecnico]);

    if (servicios.length === 0) {
      return res.status(404).json({ error: 'No hay servicios cerrados para ese técnico y fecha' });
    }

    const idsServicio = servicios.map(s => s.idServicio);
    const placeholders = idsServicio.map(() => '?').join(',');

    // Sumar MO pura desde detalle_servicios, excluyendo tipo 'Terceros'
    const [totales] = await pool.execute(`
      SELECT COALESCE(SUM(subtotal), 0) AS total_mano_obra
      FROM detalle_servicios
      WHERE idServicio IN (${placeholders})
        AND tipo = 'Mano de Obra'
    `, idsServicio);

    const totalFacturado = totales[0].total_mano_obra;

    // Generar idCierre único
    const idCierre = `CIE-${fecha.replace(/-/g, '')}-${tecnico.substring(0, 3).toUpperCase()}-${Date.now()}`;

    // Upsert en cierres_diarios
    await pool.execute(`
      INSERT INTO cierres_diarios
        (idCierre, fecha, tecnico, cantidad_servicios, total_facturado)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        cantidad_servicios = VALUES(cantidad_servicios),
        total_facturado = VALUES(total_facturado)
    `, [idCierre, fecha, tecnico, servicios.length, totalFacturado]);

    // Insertar relación cierre-servicios en cierre_servicios
    for (const idSrv of idsServicio) {
      await pool.execute(`
        INSERT INTO cierre_servicios (idCierre, idServicio)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE idServicio = idServicio
      `, [idCierre, idSrv]);
    }

    // Sync Cierres Diarios a Google Sheets
    syncSheets({ 
      idCierre, 
      fecha, 
      tecnico, 
      cantidad_servicios: servicios.length, 
      total_facturado: totalFacturado 
    }, 'CierreDiario');

    res.json({
      ok: true,
      idCierre,
      fecha,
      tecnico,
      cantidad_servicios: servicios.length,
      total_facturado: totalFacturado,
      servicios: idsServicio
    });
  } catch (e) {
    console.error('POST /cierres/generar error:', e.message);
    res.status(500).json({ error: 'Error al generar cierre: ' + e.message });
  }
});

module.exports = router;
