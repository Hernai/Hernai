# 🚀 Inicio Rápido - HernAI Scanner INE

## ✅ Servidor Iniciado

El servidor está corriendo en: **http://localhost:8000**

---

## 📋 Pasos para Ver la Aplicación

### 1️⃣ Abre tu Navegador

Abre cualquiera de estos navegadores:
- ✅ **Chrome** (recomendado)
- ✅ **Edge**
- ✅ **Firefox**
- ✅ **Safari**

### 2️⃣ Accede a la Aplicación

Ve a esta URL:

```
http://localhost:8000
```

O simplemente copia y pega en la barra de direcciones.

### 3️⃣ Espera la Carga Inicial

La **primera vez** tomará 10-30 segundos mientras descarga los modelos de IA:
- ⏳ Tesseract.js (~2MB)
- ⏳ OpenCV.js (~8MB)
- ⏳ Transformers.js (~20MB si se usa TrOCR)

Verás una barra de progreso indicando "Inicializando motores de IA..."

### 4️⃣ Prueba con Imágenes de INE

**IMPORTANTE**: Necesitas imágenes de una credencial INE (anverso y reverso).

#### Opciones para conseguir imágenes de prueba:

**A) Si tienes tu INE:**
- Toma una foto del anverso (frontal)
- Toma una foto del reverso (posterior)
- No importa la orientación (el sistema las rotará automáticamente)

**B) Si quieres probar sin INE real:**
- Busca en Google: "credencial ine ejemplo" o "ine muestra"
- Descarga imágenes de ejemplo (asegúrate de que sean claras)
- ⚠️ **Nota**: Solo para pruebas, nunca uses INE de otras personas realmente

**C) Generar INE de prueba:**
- Algunos sitios web tienen generadores de INE ficticias para testing

### 5️⃣ Usa la Aplicación

1. **Haz clic en "Anverso (Frontal)"** → Selecciona imagen del frente
2. **Haz clic en "Reverso (Posterior)"** → Selecciona imagen del reverso
3. Verás badges indicando si detectó INE válida
4. **Haz clic en "🚀 Procesar Credencial INE con IA"**
5. Espera 10-30 segundos mientras procesa
6. ¡Explora los resultados en las pestañas!

---

## 🎯 Qué Verás

### Durante el Procesamiento:
```
🔄 Detección de INE... (5%)
🖼️  Mejorando calidad de imágenes... (25%)
📝 Extrayendo texto con OCR... (55%)
✅ Validando datos... (85%)
✨ ¡Completado! (100%)
```

### Resultados:
- **Datos Personales**: CURP, nombre, fecha de nacimiento, sexo
- **Datos Electorales**: Clave de Elector, OCR, vigencia
- **Domicilio**: Estado, municipio, código postal
- **Validación**: ✅/❌ por cada campo
- **Detección IA**: Cómo se detectó la INE
- **JSON Completo**: Descarga los datos

---

## 🎨 Características Destacadas a Probar

### 1. Auto-Rotación
- Sube una imagen rotada (90°, 180°, 270°)
- El sistema la detectará y corregirá automáticamente
- Verás un badge "🔄 Rotada X°"

### 2. OCR Híbrido
- Si la imagen es clara: usará Tesseract (rápido)
- Si es difícil de leer: cambiará automáticamente a TrOCR (IA)
- Verás el método usado en "Detección IA"

### 3. Validación Inteligente
- CURP: verifica formato, fecha válida, edad 18+
- Clave Elector: verifica coherencia con CURP
- Cross-validation entre campos

### 4. Exportar Datos
- **📋 Copiar JSON**: Copia al portapapeles
- **💾 Descargar JSON**: Guarda archivo .json

---

## 🔧 Detener el Servidor

Cuando termines de probar, detén el servidor:

```bash
# En la terminal donde está corriendo:
Ctrl + C

# O busca el proceso:
ps aux | grep python | grep 8000
kill -9 [PID]
```

---

## 🐛 Problemas Comunes

### No carga la página
- ✅ Verifica que el servidor esté corriendo
- ✅ Asegúrate de usar http://localhost:8000 (no http://127.0.0.1:8000)
- ✅ Prueba en modo incógnito

### "Error al inicializar"
- ✅ Verifica tu conexión a internet (primera vez)
- ✅ Recarga la página (Ctrl + F5)
- ✅ Limpia caché del navegador

### "No se detecta INE"
- ✅ Asegúrate de que sean fotos de INE reales
- ✅ Verifica que ambas imágenes estén cargadas
- ✅ Mejora la iluminación/calidad de las fotos

### "Baja confianza OCR"
- ✅ Toma fotos con mejor iluminación
- ✅ Enfoca bien la credencial
- ✅ Evita sombras y reflejos

---

## 📱 Instalar como PWA

Una vez que la aplicación cargue:

1. Busca el ícono de "Instalar" en la barra de direcciones (Chrome)
2. Haz clic en "Instalar HernAI"
3. ¡Ahora tendrás la app en tu escritorio/menú de apps!
4. Funcionará incluso sin internet (después de la primera carga)

---

## 🎉 ¡Disfruta!

Cualquier problema, revisa la consola del navegador (F12 → Console) para ver logs detallados.

---

**Desarrollado con ❤️ usando IA por Claude Code**
