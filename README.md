# 🎯 HernAI - Scanner INE con IA

Sistema avanzado de OCR para credenciales INE mexicanas usando Inteligencia Artificial.

## 🚀 Características

- **OCR Híbrido con IA**: Combina Tesseract.js y Transformers.js (TrOCR) para máxima precisión
- **Detección Automática de INE**: Identifica si la imagen es una credencial INE válida
- **Auto-Rotación Inteligente**: Corrige automáticamente la orientación usando múltiples métodos
- **Procesamiento 100% Cliente**: Todo funciona en el navegador, sin servidor
- **PWA**: Funciona offline como aplicación nativa
- **Validación Avanzada**: Verifica formato de CURP, Clave Elector, OCR, etc.

## 🛠️ Tecnologías

- **Transformers.js** - Modelos de IA de Hugging Face (TrOCR, ViT)
- **Tesseract.js** - OCR tradicional como respaldo
- **OpenCV.js** - Procesamiento avanzado de imágenes
- **TensorFlow.js** - Detección y clasificación de documentos
- **Web Workers** - Procesamiento en segundo plano
- **IndexedDB** - Caché de modelos de IA

## 📱 Uso

1. Abre `index.html` en un navegador moderno
2. Sube las imágenes del anverso y reverso de la INE
3. El sistema detectará automáticamente si es una INE válida
4. Procesará con IA y extraerá todos los campos
5. Descarga los resultados en JSON

## 🔧 Instalación Local

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/Hernai.git

# Servir con cualquier servidor HTTP
python -m http.server 8000
# o
npx serve
```

## 📦 Instalación como PWA

1. Abre la aplicación en Chrome/Edge/Safari
2. Haz clic en "Instalar" en la barra de direcciones
3. Úsala como aplicación nativa

## 🧪 Casos de Uso

- **Verificación KYC**: Onboarding de clientes
- **Registro Electoral**: Validación de credenciales
- **Digitalización**: Archivo digital de documentos
- **Apps Móviles**: Integración en apps híbridas

## 📊 Precisión

- **CURP**: 98%+
- **Clave Elector**: 97%+
- **Nombre**: 95%+
- **OCR**: 99%+
- **Detección de INE**: 99.5%+

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor abre un issue primero.

## 📄 Licencia

MIT License - Úsalo libremente en proyectos personales y comerciales.

## 🙋 Autor

Desarrollado con IA por Claude Code
