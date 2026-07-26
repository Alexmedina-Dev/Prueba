function adminOnly(req, res, next) {
  // TEMPORAL: sin restricción de rol para pruebas en local
  // TODO: restaurar antes de producción — descomentar la línea de abajo
  // if (!req.user || req.user.role !== 'admin') {
  //   return res.status(403).json({ error: 'Acceso restringido a administradores' });
  // }
  next();
}

module.exports = adminOnly;