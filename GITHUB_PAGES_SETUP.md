# 🌐 Configurar GitHub Pages - Guía Paso a Paso

## ✅ Requisitos Previos

- Tu proyecto debe estar en GitHub
- Todos los archivos deben estar pusheados

---

## 📋 Pasos para Activar GitHub Pages

### 1️⃣ Ve a tu Repositorio en GitHub

Abre tu navegador y ve a:
```
https://github.com/[tu-usuario]/Hernai
```

### 2️⃣ Entra a Settings (Configuración)

- Haz clic en la pestaña **"Settings"** (arriba a la derecha)
- Si no la ves, asegúrate de tener permisos de administrador del repo

### 3️⃣ Busca la Sección "Pages"

- En el menú lateral izquierdo, busca **"Pages"** (abajo en la sección "Code and automation")
- Haz clic en **"Pages"**

### 4️⃣ Configura la Fuente (Source)

En la sección **"Build and deployment"**:

**Source:**
- Selecciona: **"Deploy from a branch"**

**Branch:**
- Selecciona la rama: `claude/investigate-download-issue-011CUMSwdpkbq9brQBFxHtnk`
- Carpeta: `/ (root)`
- Haz clic en **"Save"**

### 5️⃣ Espera el Despliegue

- GitHub comenzará a construir tu sitio automáticamente
- Puede tardar 1-5 minutos
- Verás un mensaje: **"Your site is live at..."**

### 6️⃣ ¡Listo! Accede a tu Aplicación

Tu URL será:
```
https://[tu-usuario].github.io/Hernai/
```

Por ejemplo, si tu usuario es `juanperez`:
```
https://juanperez.github.io/Hernai/
```

---

## 🎯 Verificar el Despliegue

Después de ~2-5 minutos:

1. Ve a la URL de GitHub Pages
2. Deberías ver la aplicación HernAI cargando
3. Espera que se carguen los motores de IA (10-30 seg primera vez)
4. ¡Listo para escanear INE!

---

## 🔧 Solución de Problemas

### ❌ "404 - Page not found"

**Causas comunes:**
- El despliegue aún no terminó (espera 5 minutos más)
- La rama seleccionada es incorrecta
- El archivo `index.html` no está en la raíz

**Solución:**
1. Ve a Settings → Pages
2. Verifica que la rama sea: `claude/investigate-download-issue-011CUMSwdpkbq9brQBFxHtnk`
3. Verifica que la carpeta sea: `/ (root)`
4. Haz clic en "Save" nuevamente

### ❌ "Error al inicializar"

**Causa:**
- Los archivos JavaScript no se cargan por CORS

**Solución:**
- GitHub Pages debería manejar esto automáticamente
- Si persiste, verifica en la consola del navegador (F12)

### ❌ La página carga pero no funciona el OCR

**Causa:**
- Los CDN de Tesseract.js u OpenCV.js pueden estar bloqueados

**Solución:**
- Verifica tu conexión a internet
- Revisa la consola del navegador (F12) para errores
- Intenta en modo incógnito

---

## 🎨 Personalizar tu Sitio

### Cambiar el Dominio

Si quieres usar un dominio personalizado:

1. Ve a Settings → Pages
2. En "Custom domain" ingresa tu dominio (ej: `scanner-ine.com`)
3. Configura los DNS de tu dominio para apuntar a GitHub Pages
4. Sigue las instrucciones de GitHub

### Forzar HTTPS

1. Ve a Settings → Pages
2. Marca la casilla: **"Enforce HTTPS"**
3. Esto hará tu sitio más seguro

---

## 📊 Monitorear el Despliegue

### Ver el Estado de las Builds

1. Ve a la pestaña **"Actions"** de tu repositorio
2. Verás los workflows de "pages-build-deployment"
3. Puedes ver logs y errores aquí

### Redesplegar Manualmente

Si haces cambios:

1. Haz commit y push de tus cambios
2. GitHub Pages redesplegará automáticamente
3. Espera 1-5 minutos para ver los cambios

---

## 🌟 Ventajas de GitHub Pages

✅ **Gratis:** Hosting completamente gratuito
✅ **Rápido:** CDN global de GitHub
✅ **Automático:** Se actualiza con cada push
✅ **HTTPS:** SSL/TLS incluido gratis
✅ **Sin servidor:** No necesitas mantener nada

---

## 📱 Compartir tu Aplicación

Una vez desplegada, puedes compartir la URL con cualquiera:

```
https://[tu-usuario].github.io/Hernai/
```

La aplicación funcionará en cualquier navegador moderno y procesará las INE **100% en el cliente** (privado y seguro).

---

## 🔐 Privacidad

**Importante:** Aunque la aplicación es pública en internet, TODO el procesamiento de las imágenes INE ocurre en el navegador del usuario. No se envía ningún dato a servidores externos.

✅ **100% Procesamiento Cliente**
✅ **No se almacenan imágenes**
✅ **No se envían datos a ningún servidor**
✅ **Todo funciona offline después de la primera carga**

---

## 📖 Recursos Adicionales

- [Documentación oficial de GitHub Pages](https://docs.github.com/es/pages)
- [Solución de problemas GitHub Pages](https://docs.github.com/es/pages/getting-started-with-github-pages/troubleshooting-custom-domains-and-github-pages)

---

## ✨ ¡Ya Está!

Tu aplicación HernAI estará disponible públicamente y lista para escanear credenciales INE con IA.

**URL típica:** `https://[tu-usuario].github.io/Hernai/`

---

Desarrollado con ❤️ usando IA por Claude Code
