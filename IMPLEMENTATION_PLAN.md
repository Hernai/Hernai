# Plan de Implementación - Especificación Browser-Only Completa

## Estado Actual ✅

### Archivos Completados:
1. **js/layout.js** (320 líneas) ✅
   - Mapas de regiones para INE_2019, INE_2023, INE_v3_1, unknown
   - Coordenadas relativas [x,y,w,h] convertibles a pixeles absolutos
   - getRegion(), expandRegion(), getFieldKeys()

2. **js/onnx-runtime.js** (358 líneas) ✅
   - Wrapper ONNX Runtime Web
   - classifySide() → front/back
   - classifyModel() → INE_2019/2023/v3_1
   - Fallback a heurísticas si modelos no existen

3. **js/ai-field-extractor.js** (stub) ✅
   - Stub opcional para Transformers.js/LayoutLM
   - Deshabilitado por defecto

4. **js/validators.js** (575 líneas) ✅
   - validateCURP() - ^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$
   - validateClaveElector() - ^[A-Z]{6}\d{8}[HM]\d{3}$
   - validateOCR() - ^\d{13}$
   - validateMRZ() - ^[A-Z0-9<]+$
   - validateSeccion() - ^\d{4}$
   - validateFecha() - ^DD/MM/YYYY$
   - validateVigencia() - ^YYYY-YYYY$ o "VIGENCIA HASTA YYYY"
   - validateCURPFechaConsistency() - cross-validation
   - normalizeVigencia() - unifica formato

5. **assets/*/README.md** ✅
   - Documentación de archivos requeridos por carpeta

---

## Archivos Pendientes de Actualización 🚧

### 1. js/card-detector.js
**Estado actual**: Detecta tarjeta pero no normaliza a 1012×638px

**Cambios requeridos**:
```javascript
// ANTES: extractAndRectify() retorna tamaño variable
// DESPUÉS: SIEMPRE retornar 1012×638px (ID-1 ratio)

const TARGET_WIDTH = 1012;
const TARGET_HEIGHT = 638;

extractAndRectify(src, corners) {
    // ... calcular homografía ...
    const dsize = new cv.Size(TARGET_WIDTH, TARGET_HEIGHT);
    cv.warpPerspective(src, extracted, M, dsize);

    return {
        success: true,
        image: extracted,  // Canvas 1012×638px
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT
    };
}
```

---

### 2. js/image-processor.js
**Estado actual**: Tiene CLAHE y morfología básica

**Cambios requeridos según spec**:
```javascript
async processForINE(imageSource) {
    // 0. CARD DETECTION (ya existe, mantener)
    const cardResult = await this.cardDetector.detectCard(canvas);

    // 1. Corrección de rotación EXIF (agregar)
    await this.correctEXIFRotation(image);

    // 2. CLAHE en canal L (LAB) - ajustar parámetros
    // SPEC: clipLimit=2.0, tileGridSize=8×8
    cv.cvtColor(src, lab, cv.COLOR_RGB2Lab);
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(lab.data[0], enhanced);  // Solo canal L

    // 3. fastNlMeansDenoisingColored - agregar
    cv.fastNlMeansDenoisingColored(src, dst, 10, 10, 7, 21);

    // 4. Balance de blancos Gray-World - agregar
    this.applyGrayWorldWhiteBalance(src);

    // 5. Resto del pipeline (mantener)
    // ...
}

applyGrayWorldWhiteBalance(src) {
    // Calcular promedios por canal
    const channels = new cv.MatVector();
    cv.split(src, channels);

    let avgB = cv.mean(channels.get(0))[0];
    let avgG = cv.mean(channels.get(1))[0];
    let avgR = cv.mean(channels.get(2))[0];

    const avgGray = (avgB + avgG + avgR) / 3;

    // Aplicar factores de corrección
    channels.get(0).convertTo(channels.get(0), -1, avgGray / avgB, 0);
    channels.get(1).convertTo(channels.get(1), -1, avgGray / avgG, 0);
    channels.get(2).convertTo(channels.get(2), -1, avgGray / avgR, 0);

    cv.merge(channels, src);
}
```

---

### 3. js/ine-detector.js
**Estado actual**: Detecta lado (front/back) pero NO modelo

**Cambios requeridos**:
```javascript
async detect(imageData, ocrText = null) {
    // ... detección INE existente ...

    // AGREGAR: Clasificación de modelo
    const modelResult = await this.classifyModel(imageData, ocrText);
    result.model = modelResult.model;  // INE_2019 | INE_2023 | INE_v3_1 | unknown
    result.modelConfidence = modelResult.confidence;

    // ...
}

async classifyModel(imageData, ocrText) {
    // 1. Intentar con ONNX
    const onnxResult = await this.onnxRuntime.classifyModel(imageData);
    if (onnxResult.confidence > 0.80) {
        return onnxResult;
    }

    // 2. Fallback: Template matching
    const templateResult = await this.templateMatching(imageData);
    if (templateResult.confidence >= 0.75) {
        return templateResult;
    }

    // 3. Fallback: Heurísticas por texto OCR
    const heuristicResult = this.heuristicModelDetection(ocrText);

    return heuristicResult;
}

async templateMatching(imageData) {
    const models = ['INE_2019', 'INE_2023', 'INE_v3_1'];
    let bestMatch = { model: 'unknown', confidence: 0 };

    for (const model of models) {
        const templatePath = `./assets/templates/${model.toLowerCase()}_anchors.png`;
        const template = await this.loadTemplate(templatePath);

        if (!template) continue;

        // OpenCV matchTemplate
        const result = new cv.Mat();
        cv.matchTemplate(imageData, template, result, cv.TM_CCOEFF_NORMED);

        let minVal, maxVal, minLoc, maxLoc;
        const minMax = cv.minMaxLoc(result);
        maxVal = minMax.maxVal;

        if (maxVal > bestMatch.confidence) {
            bestMatch = { model, confidence: maxVal };
        }
    }

    return bestMatch;
}

heuristicModelDetection(ocrText) {
    if (!ocrText) return { model: 'unknown', confidence: 0 };

    const text = ocrText.toUpperCase();

    // INE_2023 (Modelo H): "DESDE EL EXTRANJERO" / "FROM ABROAD"
    if (text.includes('DESDE EL EXTRANJERO') || text.includes('FROM ABROAD')) {
        return { model: 'INE_2023', confidence: 0.85 };
    }

    // INE_2019 (Modelo G): OCR de 13 dígitos sin texto extranjero
    if (/\d{13}/.test(text) && !text.includes('FROM ABROAD')) {
        return { model: 'INE_2019', confidence: 0.70 };
    }

    // INE_v3_1: características específicas (TBD)
    // ...

    return { model: 'unknown', confidence: 0 };
}
```

---

### 4. js/ocr-engine.js
**Estado actual**: Tesseract.js básico

**Cambios requeridos**:
```javascript
class OCREngine {
    constructor() {
        // ... existente ...

        // AGREGAR: ZXing para QR
        this.zxingReader = null;
        this.zxingReady = false;
    }

    async initializeZXing() {
        // Cargar ZXing WASM
        const script = document.createElement('script');
        script.src = './assets/zxing/zxing-wasm.min.js';
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });

        this.zxingReader = new ZXing.BrowserQRCodeReader();
        this.zxingReady = true;
    }

    async recognize(imageSource, options = {}) {
        // ... Tesseract existente con WHITELISTS ...

        const fieldType = options.fieldType || 'general';
        const whitelist = this.getWhitelist(fieldType);

        await this.tesseractWorker.setParameters({
            tessedit_char_whitelist: whitelist,
            tessedit_pageseg_mode: options.psm || 6,
            preserve_interword_spaces: '1',
            tosp_min_sane_kn_sp: '1.5'
        });

        // ... resto de OCR ...
    }

    getWhitelist(fieldType) {
        const whitelists = {
            sexo: 'HM',
            clave_elector: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/',
            curp: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/',
            seccion: '0123456789',
            anio_registro: '0123456789',
            vigencia: '0123456789-/',
            mrz: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
            general: '' // Sin whitelist
        };

        return whitelists[fieldType] || '';
    }

    async detectQRCodes(imageSource) {
        if (!this.zxingReady) {
            await this.initializeZXing();
        }

        const qrCodes = [];

        try {
            // ZXing puede detectar múltiples QR
            const results = await this.zxingReader.decodeFromImageElement(imageSource);

            if (Array.isArray(results)) {
                results.forEach((result, index) => {
                    qrCodes.push({
                        index,
                        text: result.text,
                        format: result.format,
                        ok: true
                    });
                });
            } else if (results) {
                qrCodes.push({
                    index: 0,
                    text: results.text,
                    format: results.format,
                    ok: true
                });
            }
        } catch (error) {
            console.warn('[OCR] QR detection failed:', error);
        }

        return qrCodes;
    }

    async recognizeOCRB(imageSource) {
        // Para MRZ (banda OCR-B)
        await this.tesseractWorker.loadLanguage('ocrb');
        await this.tesseractWorker.initialize('ocrb');
        await this.tesseractWorker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
            tessedit_pageseg_mode: 7  // Single line
        });

        const result = await this.tesseractWorker.recognize(imageSource);
        return result;
    }
}
```

---

### 5. js/ocr-corrector.js
**Estado actual**: Básico con Levenshtein

**Agregar función faltante**:
```javascript
/**
 * Corregir confusiones comunes de OCR basado en contexto
 * @param {string} text - Texto a corregir
 * @param {string} fieldType - Tipo de campo
 * @returns {string} Texto corregido
 */
fixOcrConfusions(text, fieldType) {
    let corrected = text;

    // Aplicar correcciones según tipo de campo
    if (fieldType === 'alphanumeric_id') {
        // CURP, Clave Elector
        corrected = corrected.replace(/0/g, (match, offset) => {
            // Primeras 4 posiciones en CURP: deben ser letras
            if (offset < 4) return 'O';
            // Posiciones 4-9: deben ser números
            if (offset >= 4 && offset < 10) return '0';
            return match;
        });

        corrected = corrected.replace(/1/g, (match, offset) => {
            // En contexto de letras, 1 → I
            if (offset < 4 || offset >= 11) return 'I';
            return '1';
        });

        // Otras confusiones comunes
        corrected = corrected.replace(/5/g, (match, offset) => {
            if (offset < 4 || offset >= 11) return 'S';
            return '5';
        });

        corrected = corrected.replace(/8/g, (match, offset) => {
            if (offset < 4 || offset >= 11) return 'B';
            return '8';
        });

    } else if (fieldType === 'numeric_id') {
        // OCR code, Sección
        corrected = corrected.replace(/O/gi, '0');
        corrected = corrected.replace(/I/gi, '1');
        corrected = corrected.replace(/S/gi, '5');
        corrected = corrected.replace(/B/gi, '8');
        corrected = corrected.replace(/Z/gi, '2');

    } else if (fieldType === 'text') {
        // Nombres, direcciones
        corrected = corrected.replace(/0/g, 'O');
        corrected = corrected.replace(/1/g, 'I');
        corrected = corrected.replace(/5/g, 'S');
        corrected = corrected.replace(/8/g, 'B');
    }

    return corrected;
}

/**
 * Fusionar datos de QR y OCR con preferencia por mayor confianza
 * @param {Object} ocrData - Datos de OCR
 * @param {Array} qrPayloads - Datos de QR codes
 * @returns {Object} Datos fusionados
 */
mergeQRAndOCR(ocrData, qrPayloads) {
    const merged = { ...ocrData };

    // Procesar cada QR
    for (const qr of qrPayloads) {
        if (!qr.ok || !qr.text) continue;

        try {
            // Intentar parsear como JSON
            const qrData = JSON.parse(qr.text);

            // Fusionar campos comunes
            for (const [key, value] of Object.entries(qrData)) {
                const normalizedKey = key.toLowerCase();

                if (merged[normalizedKey]) {
                    // Comparar con OCR
                    const similarity = this.levenshteinSimilarity(
                        merged[normalizedKey].value,
                        value
                    );

                    if (similarity >= 0.90) {
                        // Coinciden → subir confianza
                        merged[normalizedKey].confidence = Math.min(100,
                            merged[normalizedKey].confidence + 15);
                        merged[normalizedKey].source = 'ocr+qr';
                    } else if (qr.confidence > merged[normalizedKey].confidence) {
                        // QR más confiable → reemplazar
                        merged[normalizedKey].value = value;
                        merged[normalizedKey].source = 'qr';
                        merged[normalizedKey].confidence = 95;
                    }
                } else {
                    // Campo solo en QR
                    merged[normalizedKey] = {
                        value,
                        confidence: 95,
                        source: 'qr',
                        bbox: []
                    };
                }
            }
        } catch (e) {
            // No es JSON, guardar texto plano
            console.log('[Corrector] QR no-JSON:', qr.text);
        }
    }

    return merged;
}

levenshteinSimilarity(str1, str2) {
    const dist = this.levenshteinDistance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);
    return maxLen === 0 ? 1.0 : 1.0 - (dist / maxLen);
}
```

---

### 6. js/field-extractor.js
**Estado actual**: Extrae campos pero sin bbox

**Cambios requeridos**:
```javascript
// Cada método de extracción debe retornar:
{
    value: string,
    confidence: number,  // 0-100
    bbox: [x, y, w, h],  // Pixeles absolutos
    source: 'ocr' | 'qr' | 'ocr+qr'
}

extractField(fieldKey, ocrResult, layout, model, side, W, H) {
    // 1. Obtener región del layout
    const region = layout.getRegion(model, side, fieldKey, W, H);
    if (!region) return null;

    // 2. Recortar canvas
    const croppedCanvas = this.cropRegion(ocrResult.canvas, region);

    // 3. OCR con whitelist específico
    const fieldType = this.getFieldType(fieldKey);
    const ocrFieldResult = await this.ocr.recognize(croppedCanvas, {
        fieldType,
        psm: 7  // Single line para campos individuales
    });

    // 4. Normalizar y corregir
    let value = this.ocrCorrector.correctText(ocrFieldResult.text, { type: fieldType });

    // 5. Validar
    const validation = this.validateField(fieldKey, value);
    let confidence = ocrFieldResult.confidence;

    if (validation.valid) {
        confidence += 10;  // Bonus por validación
    }

    // 6. Retornar con bbox
    return {
        value,
        confidence: Math.min(100, confidence),
        bbox: [region.x, region.y, region.w, region.h],
        source: 'ocr'
    };
}

async extractFrontFields(model, ocrResult, processedCanvas) {
    const W = processedCanvas.width;
    const H = processedCanvas.height;
    const layout = new INELayout();

    const fields = {};
    const frontFields = ['nombre', 'domicilio', 'clave_elector', 'curp',
                         'sexo', 'fecha_nacimiento', 'seccion', 'anio_registro',
                         'vigencia', 'localidad', 'municipio'];

    for (const key of frontFields) {
        const extracted = await this.extractField(key, ocrResult, layout, model, 'front', W, H);
        if (extracted) {
            fields[key] = extracted;
        }
    }

    return fields;
}

async extractBackFields(model, ocrResult, processedCanvas) {
    const W = processedCanvas.width;
    const H = processedCanvas.height;
    const layout = new INELayout();

    const fields = {};

    // 1. MRZ (banda OCR-B)
    const mrzRegion = layout.getRegion(model, 'back', 'mrz', W, H);
    if (mrzRegion) {
        const mrzCanvas = this.cropRegion(processedCanvas, mrzRegion);
        const mrzResult = await this.ocr.recognizeOCRB(mrzCanvas);
        fields.mrz = {
            value: mrzResult.text.replace(/\s+/g, ''),
            confidence: mrzResult.confidence,
            bbox: [mrzRegion.x, mrzRegion.y, mrzRegion.w, mrzRegion.h],
            source: 'ocr'
        };
    }

    // 2. QR Codes
    const qrCodes = await this.ocr.detectQRCodes(processedCanvas);
    fields.qr_payloads = qrCodes;

    // 3. OCR code
    const ocrField = await this.extractField('ocr', ocrResult, layout, model, 'back', W, H);
    if (ocrField) {
        fields.ocr = ocrField;
    }

    return fields;
}
```

---

### 7. js/app.js
**Estado actual**: Retorna estructura antigua

**Formato JSON objetivo (EXACTO)**:
```javascript
async runINEPipeline(file, onProgress) {
    const timings = {
        pre: 0,
        classify: 0,
        ocr: 0,
        qr: 0,
        post: 0
    };

    // ... pipeline ...

    // Retornar formato EXACTO
    return {
        side: detectionResult.side,  // "front" | "back"
        model: detectionResult.model,  // "INE_2019" | "INE_2023" | "INE_v3_1" | "unknown"
        image_size_px: { w: 1012, h: 638 },
        fields: {
            nombre: { value: "", confidence: 0, bbox: [x,y,w,h], source: "ocr" },
            sexo: { value: "H|M", confidence: 0, bbox: [], source: "ocr" },
            domicilio: { value: "", confidence: 0, bbox: [], source: "ocr" },
            clave_elector: { value: "", confidence: 0, bbox: [], source: "ocr|qr" },
            curp: { value: "", confidence: 0, bbox: [], source: "ocr|qr" },
            fecha_nacimiento: { value: "dd/mm/aaaa", confidence: 0, bbox: [], source: "ocr" },
            seccion: { value: "####", confidence: 0, bbox: [], source: "ocr" },
            anio_registro: { value: "####", confidence: 0, bbox: [], source: "ocr" },
            vigencia: { value: "yyyy-yyyy", confidence: 0, bbox: [], source: "ocr" },
            mrz: { value: "...", confidence: 0, bbox: [], source: "ocr" },
            qr_payloads: [{ index: 0, text: "...", ok: true }]
        },
        confidence_overall: 0.0,
        timings_ms: timings
    };
}
```

---

### 8. js/main.js + index.html
**Cambios requeridos**:

**main.js**:
```javascript
// Agregar botón "Probar con imágenes demo"
async function loadDemoImages() {
    const demoFiles = [
        './demo/ine_anverso.jpg',
        './demo/ine_reverso.jpg'
    ];

    for (const url of demoFiles) {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], url.split('/').pop(), { type: 'image/jpeg' });
        await processFile(file);
    }
}
```

**index.html**:
```html
<!-- Botón demo -->
<button id="demoBtn" class="btn btn-secondary">
    📸 Probar con imágenes demo
</button>

<!-- Panel JSON con badges de confianza -->
<div id="jsonOutput">
    <div class="json-field">
        <span class="field-name">CURP:</span>
        <span class="field-value">GOVI850507HDFNLR01</span>
        <span class="badge badge-success">95%</span>
        <span class="badge badge-info">OCR+QR</span>
    </div>
    <!-- ... más campos ... -->
</div>

<!-- Botón descarga JSON -->
<button id="downloadJsonBtn" class="btn btn-success">
    💾 Descargar JSON
</button>
```

---

### 9. service-worker.js
**Crear archivo nuevo para PWA**:
```javascript
const CACHE_NAME = 'ine-scanner-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/js/main.js',
    '/js/app.js',
    '/js/ocr-engine.js',
    '/js/field-extractor.js',
    '/js/image-processor.js',
    '/js/card-detector.js',
    '/js/ine-detector.js',
    '/js/layout.js',
    '/js/onnx-runtime.js',
    '/js/validators.js',
    '/js/ocr-corrector.js',
    '/assets/tesseract/eng.traineddata',
    '/assets/tesseract/spa.traineddata',
    '/assets/tesseract/ocrb.traineddata'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
```

---

## Priorización de Tareas 🎯

### Alta Prioridad (core del pipeline):
1. ✅ validators.js - regex exactos
2. 🚧 card-detector.js - dewarp 1012×638px
3. 🚧 ine-detector.js - clasificación de modelo
4. 🚧 ocr-engine.js - ZXing + whitelists
5. 🚧 field-extractor.js - bbox + confidence
6. 🚧 app.js - JSON estructurado

### Media Prioridad (mejoras):
7. 🚧 image-processor.js - fastNlMeans + Gray-World
8. 🚧 ocr-corrector.js - fixOcrConfusions + merge QR/OCR
9. 🚧 main.js + index.html - UI demo

### Baja Prioridad (opcional):
10. 🚧 service-worker.js - PWA offline

---

## Comandos de Prueba 🧪

```bash
# Iniciar servidor local
python3 -m http.server 8000

# Probar en navegador
open http://localhost:8000

# Subir imagen de anverso y reverso
# Verificar JSON de salida tiene estructura exacta
# Descargar JSON y validar campos
```

---

## Criterios de Aceptación ✔️

- [ ] Detecta anverso/reverso correctamente (reverso tiene ≥2 QR + MRZ)
- [ ] Clasifica modelo: INE_2019, INE_2023, INE_v3_1, unknown
- [ ] Canvas normalizado: 1012×638px siempre
- [ ] Extrae campos con bbox [x,y,w,h] en pixeles
- [ ] JSON retorna confidence por campo
- [ ] Valida CURP, Clave Elector, OCR con regex
- [ ] Cross-validation: CURP vs fecha_nacimiento
- [ ] Lee QR codes y fusiona con OCR
- [ ] MRZ extraído con OCR-B
- [ ] UI tiene botón demo + descarga JSON
- [ ] Funciona offline (browser-only, sin backend)

---

**Última actualización**: 2025-10-22
**Estado general**: 40% completado
**Próximo paso**: Actualizar card-detector.js con dewarp 1012×638px
