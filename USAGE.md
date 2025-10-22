# 📖 Guía de Uso - HernAI Scanner INE

## 🚀 Inicio Rápido

### Opción 1: Servidor Local

1. **Instala un servidor HTTP local**:
   ```bash
   # Con Python 3
   python -m http.server 8000

   # Con Node.js (npx)
   npx serve

   # Con PHP
   php -S localhost:8000
   ```

2. **Abre en el navegador**:
   ```
   http://localhost:8000
   ```

3. **Espera a que se carguen los motores de IA** (primera vez puede tardar ~10-30 segundos)

4. **¡Listo para escanear!**

### Opción 2: Despliegue en Servidor Web

1. Sube todos los archivos a tu servidor web
2. Asegúrate de que el servidor sirva con HTTPS (requerido para PWA)
3. Accede desde cualquier navegador moderno

### Opción 3: GitHub Pages (Gratis)

1. Haz push del proyecto a GitHub
2. Ve a Settings → Pages
3. Selecciona la rama `main` como fuente
4. Tu app estará disponible en `https://tu-usuario.github.io/Hernai`

## 📱 Instalación como PWA (App Nativa)

1. Abre la aplicación en Chrome, Edge o Safari
2. Busca el icono de "Instalar" en la barra de direcciones
3. Haz clic en "Instalar HernAI"
4. ¡Ahora puedes usarla como app nativa, incluso offline!

## 🎯 Cómo Usar

### Paso 1: Cargar Imágenes

1. Haz clic en "Anverso (Frontal)" y selecciona la foto del frente de la INE
2. Haz clic en "Reverso (Posterior)" y selecciona la foto del reverso
3. Las imágenes pueden estar en cualquier orientación (se corrigen automáticamente)
4. Verás un badge de detección indicando si son INE válidas

### Paso 2: Procesar

1. Haz clic en "🚀 Procesar Credencial INE con IA"
2. Espera mientras el sistema:
   - Detecta que son INE válidas
   - Mejora la calidad de las imágenes
   - Extrae texto con OCR híbrido (Tesseract + TrOCR)
   - Valida los campos
3. El proceso toma ~10-30 segundos dependiendo de la calidad

### Paso 3: Revisar Resultados

Explora las pestañas:

- **Datos Personales**: CURP, nombre, fecha de nacimiento, sexo
- **Datos Electorales**: Clave de Elector, OCR, CIC, vigencia
- **Domicilio**: Código postal, estado, municipio
- **Validación**: Errores y advertencias encontradas
- **Detección IA**: Info sobre cómo se detectaron las INE
- **JSON Completo**: Todos los datos en formato JSON

### Paso 4: Exportar

- **Copiar JSON**: Copia los datos al portapapeles
- **Descargar JSON**: Descarga un archivo .json

## 🤖 Tecnologías Utilizadas

### OCR Híbrido

El sistema usa dos motores de OCR:

1. **Tesseract.js** (rápido): Se usa primero para velocidad
2. **Transformers.js (TrOCR)** (IA avanzada): Se usa automáticamente cuando Tesseract tiene baja confianza (<70%)

### Detección de INE

Usa múltiples métodos:

- **Patrones regex**: Detecta CURP, Clave de Elector, OCR, etc.
- **Palabras clave**: Busca "INSTITUTO", "ELECTORAL", "MEXICO", etc.
- **Análisis visual**: Verifica colores, aspecto ratio, resolución
- **Confianza combinada**: Genera score de 0-100%

### Procesamiento de Imágenes (OpenCV.js)

- **Auto-rotación**: Detecta orientación con Hough Transform
- **Corrección de perspectiva**: Endereza documentos torcidos
- **Mejora de contraste**: CLAHE (Histogram Equalization)
- **Reducción de ruido**: Non-Local Means Denoising
- **Binarización**: Adaptive thresholding para mejor OCR

## 🔧 Configuración Avanzada

### Modificar Umbrales de Confianza

Edita `js/ocr-engine.js`:

```javascript
this.config = {
    thresholds: {
        lowConfidence: 70,  // Cambiar para usar IA más/menos
        retryConfidence: 50 // Cambiar para reintentar OCR
    }
};
```

### Desactivar IA (Solo Tesseract)

En `js/main.js`, cambia:

```javascript
const result = await app.processINE(
    app.state.frontImage,
    app.state.backImage,
    {
        useAI: false  // Desactiva TrOCR
    }
);
```

### Modo Solo Detección (Sin OCR)

```javascript
const result = await app.processINE(
    app.state.frontImage,
    app.state.backImage,
    {
        detectOnly: true  // Solo detecta, no extrae campos
    }
);
```

## ⚠️ Limitaciones y Consideraciones

### Calidad de Imagen

- **Resolución mínima**: 400x250 píxeles
- **Iluminación**: Buena iluminación uniforme
- **Nitidez**: Evitar imágenes borrosas
- **Reflejo**: Evitar reflejos en la credencial

### Compatibilidad de Navegadores

- ✅ Chrome 90+
- ✅ Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ❌ IE11 (no soportado)

### Rendimiento

- **Primera carga**: ~10-30 segundos (descarga modelos de IA)
- **Cargas posteriores**: ~5-10 segundos (modelos en caché)
- **RAM recomendada**: 4GB+
- **CPU**: Moderna (2015+)

### Privacidad

- ✅ **100% Cliente**: Todo se procesa en tu navegador
- ✅ **Sin servidor**: No se envían datos a ningún servidor
- ✅ **Sin almacenamiento**: No se guardan imágenes ni datos
- ✅ **Offline**: Funciona sin internet (después de primera carga)

## 🐛 Solución de Problemas

### "Error al inicializar"

1. Recarga la página (Ctrl+F5)
2. Verifica tu conexión a internet (primera vez)
3. Limpia caché del navegador
4. Usa un navegador actualizado

### "No se detecta INE"

1. Verifica que sea una credencial INE mexicana
2. Asegúrate de cargar anverso Y reverso
3. Mejora la iluminación de las fotos
4. Rota la imagen manualmente antes de cargar

### "Baja confianza OCR"

1. Toma fotos con mejor iluminación
2. Enfoca bien la credencial
3. Evita sombras y reflejos
4. Usa cámara de alta resolución

### "Campos no detectados"

1. Verifica que la credencial sea legible
2. Limpia la credencial física
3. Toma foto más cerca (pero enfocada)
4. Intenta con diferentes ángulos

## 📊 Interpretación de Resultados

### Confianza

- **Alta (90-100%)**: Verde - Muy confiable
- **Media (70-89%)**: Amarillo - Revisar manualmente
- **Baja (<70%)**: Rojo - Probablemente incorrecto

### Validación

- **✓ Válido**: El formato del campo es correcto
- **✗ Inválido**: El formato no cumple con las reglas de INE

### Campos Obligatorios

- CURP
- Nombre completo
- Clave de Elector
- Código OCR (en modelos G y H)
- Año de emisión
- Vigencia
- Estado
- Sección

## 🔐 Seguridad

### Datos Sensibles

- Nunca compartas los JSON con datos personales públicamente
- Usa HTTPS siempre (especialmente en producción)
- No almacenes datos sin consentimiento

### Validación

Este sistema **NO VALIDA** contra la lista nominal del INE. Solo verifica:

1. Formato correcto de campos
2. Coherencia entre campos (CURP vs Clave Elector)
3. Validez de checksums internos

Para validación real contra lista nominal, necesitas:
- API oficial del INE
- Proceso de verificación legal
- Autorización gubernamental

## 📞 Soporte

- **Reportar bugs**: [GitHub Issues](https://github.com/tu-usuario/Hernai/issues)
- **Sugerencias**: [GitHub Discussions](https://github.com/tu-usuario/Hernai/discussions)
- **Documentación**: [README.md](README.md)

## 📄 Licencia

MIT License - Libre para uso personal y comercial.

---

Desarrollado con ❤️ usando IA por Claude Code
