const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const USERS = [
  { email: 'admin@gmail.com', password: 'admin1234', nombre: 'Administrador' },
  { email: 'taller@gmail.com', password: 'taller1234', nombre: 'Taller MotoVerso' }
];

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' });
  }

  const user = USERS.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = jwt.sign(
    { email: user.email, nombre: user.nombre },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { email: user.email, nombre: user.nombre } });
});

module.exports = router;
