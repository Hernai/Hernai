# Tesseract.js Assets

Esta carpeta debe contener:

## Archivos requeridos:
- `tesseract.min.js` - Tesseract.js core library
- `worker.min.js` - Web worker
- `eng.traineddata` - English language data (~2MB)
- `spa.traineddata` - Spanish language data (~900KB)
- `ocrb.traineddata` - OCR-B font (para MRZ) (~400KB)

## Descarga:
```bash
# Desde repositorio oficial de Tesseract.js
cd assets/tesseract

# Trained data files
wget https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/eng.traineddata
wget https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/spa.traineddata
wget https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/ocrb.traineddata

# Core files (o cargar desde CDN)
wget https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js
wget https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js
```

## Configuración:
El proyecto puede cargar Tesseract.js desde CDN, pero los archivos .traineddata deben estar locales para funcionar offline.
