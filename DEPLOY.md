# 🚀 Guía de Despliegue MotoVerso

## Variables de Entorno Requeridas

Configurar en el panel de Seenode (o el hosting que uses):

```env
# Base de Datos MySQL (credenciales de Seenode o proveedor externo)
DB_HOST=your-mysql-host.seenode.io
DB_PORT=3306
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password
DB_NAME=motoverso

# Seguridad
JWT_SECRET=your-super-secret-jwt-key-change-this

# Google Cloud / Sheets API
GOOGLE_CLIENT_EMAIL=id-motoverso-sheets@motoverso-produccion.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQC8fqyz1eOSnVWV\nBwo57VWNUG9o1CWBQhG5q1jaaYOep/MpZizzbyKVH5p3yxWgvcHuEHuXycWW6hGD\naUYszGpejxF7xmKsjCDjaV69WW63Cjp2q0fSIBwDufEO6VpZv0+s6aEBgV0J8WjU\nqyhA8HxQ9wxiQ1gU2srvOgkDUvbZR3TMl/qrI7aEtFjlFjLKjRmf1cc8kIDUqROa\nYN//cBiGg+0Sg5wDWvcIjRvcWZI5vPLK0t8shMZ0zPlX3tK81aS4qfFGQW4vDGmF\nTZRLJo238EGD1SDEK7lse6ACx/iRRvE8iaDjxqbehk3E2awZ+n/SVys4fvpOEsX2\n0CHemN+9AgMBAAECgf8yb7LGa/T4xiCgP8H8vgSmS1+ELT/b1lHn3HFp/9G4Ijhu\nW2irupEGVe5/H1gqKpw5ly967gJw3zDQeNrOIeRUaPPEqtC8WsJyFz/Caqu1TodW\nOX5+OxlD5f0agFYsrYQkQF9Uh8jdYDssrJ+YwMCC6Zfmsx5edizW1jCTMx/aA08t\nzn3PCxYGnUe5YxSWByQQ8h0Go8/NBv8j+MpqSmNWRVtIHnvv2h4FoRtem5Dd6Fkr\nWRc3XnISEN+OVUIpAMeUSWCLP1k4tOFauIer0Yv6s7o+ftG6R7Q09IEuYMB+eTHr\nWotY6bzV9a8QArB/Xg1uph6YNkxEg/Oe8TF+g/8CgYEA3WLhFu53gNWuCFtBCmTQ\nlkBEKrahZ1D0CiOAk4DOqrrIqvV2rNDRPfSggiNUGbKsX4VjtFEVYmpY76u40I7/\nHwT18L8/wVY6bNqkDBQ9+4xpHKaAUjds/xGgGreGkgi+NGyPxZV//tvRbzM5UrOg\nvAedNFgJANgGgMz6Xh67m+cCgYEA2fdLve7+0mOH+VEmPQ2BvPLdja4Y0NwiLFc6\nP9Ym1fYdkkRh5aUivyeOsCZ3sozFBtZzzS+sczdBy416yiVi5LGWRG4/vcfMAC0W\nWAjCYldx0PplYzSMh/N9TLnxTNnpMu+Pe0Fa5L6y7W9D2G97Noa0Kkm7g9BwWxPO\n/AuyUrsCgYA9wdmctgUsMW+M8TfhmGH/qAncCHpaAeEx+tlhTGtagSR9XGAwsUfN\nirJD22sYiBlBxEoeAQiAHb6VjUfPFjThCFc7Q36bhlxiBVQB8puf0nl3/pKJXODQ\nq+1BEFL95hns2kf6yZ7iAKSjK2O/oD2MwGNmolYbOrTf1rQaq5XPQKBgQCFWLNv\nyW0ADYA8WRcJtt+uVu6QJPhtnp8RfXPXZg5wS5efylISCksNowe6YG5OP6yyGDTU\nTNw1yJJqE24RiXnM65BA4SoB0t/NI8hNp140h8bL0MSCQr3O1nnLnN4w5Ae077ZZ\n84vF8ZzJgY6CNQGuRA6o6F7dr4FtVtsEe6tmzQKBgCaM4HZyrwZO4raEo4482anM\nGhIM5SvbmGfvU7fpKdO8MfMQ1OLHscgXYiJfTTqvwBanCN+awCwqNTzbbNPkio7U\ntpV8x3rjAQCV5Ecm1w/9IERMyruvwcd1kRpJSQiRusBiuj3Jl2io7yFqpdezhe2V\nBTOJ/41vyD3wEa94Ts06\n-----END PRIVATE KEY-----\n
GOOGLE_PROJECT_ID=motoverso-produccion
SHEET_ID=1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q

# Dominios permitidos (CORS)
ALLOWED_ORIGINS=https://www.motoverso.app,https://prueba.seenode.app

# Entorno
NODE_ENV=production
PORT=3000
```

## 🔑 Cómo obtener el GOOGLE_PRIVATE_KEY

1. Abrí el archivo `motoverso-produccion-ec14d77e818f.json`
2. Copiá el valor del campo `private_key`
3. Pegalo en la variable `GOOGLE_PRIVATE_KEY`
4. IMPORTANTE: Reemplazá todos los `\n` literales por saltos de línea reales

### Formato correcto:
```
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQC8fqyz1eOSnVWV
...
BTOJ/41vyD3wEa94Ts06
-----END PRIVATE KEY-----
```

## 🗄️ Base de Datos

### Migrar datos de local a producción:

1. Exportar tu MySQL local:
```bash
mysqldump -u root motoverso > motoverso-backup.sql
```

2. Importar en MySQL de Seenode:
```bash
mysql -h your-host -u your-user -p motoverso < motoverso-backup.sql
```

### Crear usuarios iniciales:

Ejecutar `node deploy-setup.js` una sola vez después de crear la base de datos.

## 🚀 Comandos en Seenode

- **Start command:** `npm start`
- **Build command:** `npm install`
- **Root directory:** `backend/`

## ⚠️ Notas de Seguridad

- NUNCA subas `.env` a GitHub
- NUNCA subas el archivo JSON de credenciales de Google
- Cambiá `JWT_SECRET` por algo único y seguro
- En producción, `ALLOWED_ORIGINS` restringe qué dominios pueden acceder
