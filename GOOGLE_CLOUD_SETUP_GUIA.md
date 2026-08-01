# Guía: Configurar Google Cloud para MotoVerso en Producción

> **Para:** Nury (repuestoshannasmotos@gmail.com)  
> **Objetivo:** Conectar MotoVerso a Google Sheets API para sincronizar datos en producción.  
> **Hosting:** Seenode  
> **Tiempo estimado:** 20-30 minutos

---

## Resumen Rápido

MotoVerso necesita 3 variables para conectarse a Google Sheets:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `GOOGLE_CLIENT_EMAIL` | Email de la "Service Account" | `motoverso-sheets@motoverso-test-502500.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Clave privada del archivo JSON | `-----BEGIN PRIVATE KEY-----\nMIIE...` |
| `SHEET_ID` | ID del Google Sheet de producción | `1B2M2Y8AsgTpgAmY7PhC...` |

---

## Opción A: Usar el Proyecto Existente (Más Rápido — 5 minutos)

Ya existe un proyecto de Google Cloud (`motoverso-test-502500`) con la API habilitada y una Service Account creada. **Técnicamente funciona perfectamente para producción.**

### ¿Qué necesitas?
1. Que Alex te pase las 3 variables de entorno actuales (las tiene en su archivo `.env` local).
2. Crear tu **Google Sheet de producción** y compartirlo con la Service Account.
3. Configurar las variables en Seenode.

### Ventajas
- No necesitas crear nada en Google Cloud Console.
- No necesitas entender conceptos técnicos de Google Cloud.
- Funciona igual que un proyecto nuevo.

### Desventaja
- La Service Account está en el proyecto de Alex. Si algún día necesitas regenerar la clave, dependerías de él. **Para un taller de motos, esto no es un problema práctico.**

---

## Opción B: Crear Proyecto Nuevo en tu Cuenta (Más Control — 20 minutos)

Si prefieres que todo esté bajo tu control y tu Gmail (`repuestoshannasmotos@gmail.com`), sigue esta opción.

---

### Paso 1: Crear Proyecto en Google Cloud Console

1. Ve a [https://console.cloud.google.com](https://console.cloud.google.com) e inicia sesión con `repuestoshannasmotos@gmail.com`.
2. En la barra superior, haz clic en el selector de proyectos (donde dice "Select a project").
3. Haz clic en **"New Project"**.
4. Escribe el nombre: `motoverso-produccion`
5. Haz clic en **"Create"**.

> **Nota:** No te preocupes por el ID del proyecto; Google genera uno automático.

---

### Paso 2: Habilitar Google Sheets API

1. En el menú lateral (hamburguesa ☰), ve a **"APIs & Services" → "Library"**.
2. En la barra de búsqueda, escribe: `Google Sheets API`
3. Haz clic en **"Google Sheets API"** en los resultados.
4. Haz clic en el botón **"Enable"**.
5. Repite el proceso para `Google Drive API` (opcional pero recomendado para ver permisos).

> **Costo:** Google Sheets API es **gratuita** para uso normal. No necesitas tarjeta de crédito ni activar facturación para esta funcionalidad.

---

### Paso 3: Crear una Service Account

1. Ve a **"APIs & Services" → "Credentials"** (en el menú lateral).
2. Haz clic en **"+ Create Credentials"** (botón azul arriba).
3. Selecciona **"Service Account"**.
4. En **"Service Account Name"**, escribe: `MotoVerso Sheets`
5. En **"Service Account ID"**, se autocompletará algo como `motoverso-sheets`.
6. En **"Description"**, escribe: `Cuenta de servicio para sincronizar datos con Google Sheets desde MotoVerso`
7. Haz clic en **"Create and Continue"**.
8. En la pantalla de permisos (opcional), no necesitas cambiar nada. Haz clic en **"Continue"**.
9. En la pantalla de "Grant users access", no necesitas hacer nada. Haz clic en **"Done"**.

---

### Paso 4: Descargar el Archivo de Credenciales JSON

1. Ahora estás en la lista de "Service Accounts". Haz clic en el email que acabas de crear (ej: `motoverso-sheets@motoverso-produccion-123456.iam.gserviceaccount.com`).
2. Ve a la pestaña **"Keys"**.
3. Haz clic en **"Add Key" → "Create New Key"**.
4. Selecciona formato **"JSON"**.
5. Haz clic en **"Create"**.
6. **Un archivo `.json` se descargará automáticamente a tu computadora.** Guárdalo en un lugar seguro. Su nombre será algo como `motoverso-produccion-123456-abc123.json`.

> **⚠️ IMPORTANTE:** Este archivo contiene la clave privada. No lo compartas por WhatsApp público ni lo subas a internet. Solo Alex lo necesita para configurar el servidor.

---

## Paso 5: Crear y Compartir el Google Sheet de Producción

1. Ve a [https://sheets.new](https://sheets.new) o abre Google Drive y crea una nueva hoja de cálculo.
2. Ponle un nombre claro, por ejemplo: `MotoVerso - Registro de Servicios`.
3. **Obtener el SHEET_ID:** Mira la URL del navegador. Se ve así:
   ```
   https://docs.google.com/spreadsheets/d/1B2M2Y8AsgTpgAmY7PhCfi6X7fH3z7JqK/edit
   ```
   El SHEET_ID es la parte larga entre `/d/` y `/edit`:
   ```
   1B2M2Y8AsgTpgAmY7PhCfi6X7fH3z7JqK
   ```
   **Copia y guarda este ID.**
4. Comparte la hoja con la Service Account:
   - Haz clic en el botón **"Share"** (arriba derecha).
   - En "Add people", pega el email de la Service Account (el del Paso 3, ej: `motoverso-sheets@motoverso-produccion-123456.iam.gserviceaccount.com`).
   - Asigna permiso **"Editor"** (debe poder escribir).
   - Desmarca la casilla "Notify people" (no es necesario notificar a una cuenta de servicio).
   - Haz clic en **"Share"**.

> **Nota sobre las hojas internas:** MotoVerso sincroniza datos en hojas llamadas `Clientes`, `Vehículos`, `Servicios`, `Detalle_Servicios` y `Cierres Diarios`. Puedes crear estas hojas manualmente dentro del documento, o MotoVerso las creará/llenará automáticamente al enviar datos.

---

## Paso 6: Obtener las Variables para el Archivo .env

### A) GOOGLE_CLIENT_EMAIL
Es el email de la Service Account. Lo encontraste en el Paso 3.

Ejemplo:
```
motoverso-sheets@motoverso-produccion-123456.iam.gserviceaccount.com
```

### B) GOOGLE_PRIVATE_KEY
Abre el archivo JSON descargado (Paso 4) con el Bloc de Notas o cualquier editor de texto. Busca la clave llamada `"private_key"`. Se verá así:

```json
{
  "type": "service_account",
  "project_id": "motoverso-produccion-123456",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "motoverso-sheets@motoverso-produccion-123456.iam.gserviceaccount.com",
  ...
}
```

**Copia TODO el valor de `"private_key"`**, incluyendo las comillas. Es una sola línea muy larga que usa `\n` para representar los saltos de línea.

### C) SHEET_ID
Es el ID que copiaste del URL en el Paso 5.

---

## Paso 7: Configurar Variables en Seenode

1. Inicia sesión en tu panel de **Seenode**.
2. Busca la sección de **Variables de Entorno** o **Environment Variables** (generalmente en la configuración de la aplicación Node.js).
3. Agrega las siguientes variables:

```env
GOOGLE_CLIENT_EMAIL=motoverso-sheets@TU_PROYECTO.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTU_CLAVE_AQUI_MUY_LARGA...\n-----END PRIVATE KEY-----\n"
SHEET_ID=1B2M2Y8AsgTpgAmY7PhCfi6X7fH3z7JqK
```

> **⚠️ IMPORTANTE — Formato de la Private Key:**
> - La clave DEBE ir entre comillas dobles `"` en el archivo `.env`.
> - Los saltos de línea DEBEN estar como `\n` (dos barras invertidas + n), NO como saltos reales de línea.
> - El código de MotoVerso se encarga de convertir `\n` en saltos de línea reales automáticamente.
>
> **Ejemplo correcto:**
> ```env
> GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQE...\n-----END PRIVATE KEY-----\n"
> ```
>
> **Ejemplo INCORRECTO:**
> ```env
> GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
> MIIEvQIBADANBgkqhkiG9w0BAQE...
> -----END PRIVATE KEY-----
> ```

4. Guarda los cambios.
5. **Reinicia/redeploya la aplicación** en Seenode para que lea las nuevas variables.

---

## Paso 8: Verificar que Funciona

1. Abre MotoVerso en producción.
2. Crea o edita un servicio.
3. Guarda los cambios.
4. Ve a tu Google Sheet (`MotoVerso - Registro de Servicios`).
5. Deberías ver los datos aparecer en la hoja `Servicios` (y posiblemente `Clientes`, `Vehículos`, `Detalle_Servicios`).

Si no aparecen inmediatamente, espera 10-30 segundos (puede haber una pequeña demora por la cola de sincronización).

---

## Checklist Final para Nury

- [ ] **Opción A:** Pedir a Alex las credenciales actuales  
  **O**  
  **Opción B:** Crear proyecto `motoverso-produccion` en Google Cloud Console
- [ ] **Opción B:** Habilitar Google Sheets API y Google Drive API
- [ ] **Opción B:** Crear Service Account `MotoVerso Sheets`
- [ ] **Opción B:** Descargar archivo JSON de credenciales
- [ ] Crear Google Sheet de producción y copiar el **SHEET_ID**
- [ ] Compartir el Sheet con el email de la Service Account (como **Editor**)
- [ ] Copiar `GOOGLE_CLIENT_EMAIL` del Google Cloud Console (o pedirlo a Alex)
- [ ] Copiar `GOOGLE_PRIVATE_KEY` del archivo JSON (o pedirlo a Alex)
- [ ] Configurar las 3 variables en **Seenode**
- [ ] Reiniciar la app en Seenode
- [ ] Probar creando un servicio y verificando que aparece en el Google Sheet

---

## FAQs

### ¿Necesito pagar algo en Google Cloud?
**No.** Google Sheets API tiene cuota gratuita muy generosa (500 requests/100 segundos). Para el uso de un taller de motos, nunca llegarás al límite.

### ¿Qué pasa si pierdo el archivo JSON?
Puedes generar uno nuevo: ve a Google Cloud Console → IAM & Admin → Service Accounts → selecciona la cuenta → Keys → Add Key → Create New Key. El archivo anterior dejará de funcionar automáticamente.

### ¿Puedo usar el mismo Google Sheet que usaba antes en Excel?
Si ya tienes una hoja de cálculo en Google Sheets con datos históricos, puedes usarla. Solo compártela con la Service Account como Editor. MotoVerso agregará nuevas filas y actualizará existentes sin borrar datos antiguos que no estén relacionados con los servicios activos. **Pero recomendamos empezar con una hoja nueva limpia para evitar conflictos de formato.**

### ¿Qué hago si los datos no aparecen en el Sheet?
1. Verifica que el email de la Service Account tiene permiso de **Editor** en el Sheet.
2. Verifica que el `SHEET_ID` es correcto (sin espacios ni comillas extra).
3. Verifica que `GOOGLE_PRIVATE_KEY` está entre comillas dobles y usa `\n`.
4. Revisa los logs de errores en Seenode (si la app reporta error de autenticación, es problema de la private key).
5. Pregunta a Alex para revisar juntos.

### ¿Es seguro compartir el Google Sheet con una "Service Account"?
Sí. Una Service Account no es una persona; es un "robot" que solo puede leer/escribir en los Sheets que le compartas. No tiene acceso a tu Gmail, Drive ni otros datos personales.

---

## Resumen de Variables para Alex

Alex necesita este formato exacto para configurar el servidor:

```env
# Google Sheets API
GOOGLE_CLIENT_EMAIL=motoverso-sheets@motoverso-produccion-XXXXXX.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQE...\n...muchos caracteres...\n-----END PRIVATE KEY-----\n"
SHEET_ID=1B2M2Y8AsgTpgAmY7PhCfi6X7fH3z7JqK
```

**Instrucciones para Alex:**
- Cuando pegues la `GOOGLE_PRIVATE_KEY` en el panel de Seenode, asegúrate de que incluya las comillas dobles al inicio y al final.
- Si el panel de Seenode no permite saltos de línea, escríbela como una sola línea con `\n`.

---

**¿Preguntas? Contacta a Alex Medina para ayuda técnica.**
