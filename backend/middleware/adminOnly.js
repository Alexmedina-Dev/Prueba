function adminOnly(req, res, next) {
  // Solo developer (Alex) puede ver el panel de errores y administración
  if (!req.user || req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Acceso restringido al desarrollador' });
  }
  next();
}

module.exports = adminOnly;