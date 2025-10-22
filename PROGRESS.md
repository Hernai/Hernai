# Progreso INE Scanner - Actualización

**Fecha**: 2025-10-22
**Progreso**: ~55% completado
**Branch**: `claude/investigate-download-issue-011CUMSwdpkbq9brQBFxHtnk`

---

## ✅ COMPLETADO RECIENTEMENTE

### ine-detector.js (100%) ✅
**Commit**: `1dfc634`

Agregadas todas las funciones de clasificación de modelo:

1. **classifyModel()** - Pipeline completo:
   - ONNX classifier (umbral > 0.80)
   - Template matching (umbral ≥ 0.75)
   - Heurísticas por OCR text

2. **templateMatching()** - OpenCV cv.matchTemplate:
   - Carga anchors desde `assets/templates/`
   - Prueba INE_2019, INE_2023, INE_v3_1
   - Cache de templates

3. **heuristicModelDetection()** - Fallback inteligente:
   - INE_2023: "DESDE EL EXTRANJERO" → 85%
   - INE_2019: OCR 13 dígitos → 70%
   - unknown: default → 0%

4. **loadTemplate()** - Gestión de templates con cache

**Resultado**: `result.model` retorna: `INE_2019` | `INE_2023` | `INE_v3_1` | `unknown`

---

## 🚧 ARCHIVOS RESTANTES (Orden Prioritario)

### Fase 1 - Core Pipeline (45% restante)

#### 1. ocr-engine.js (Siguiente - Alta Prioridad)
**Estado**: 60% → Agregar ZXing + whitelists

```javascript
// AGREGAR:

class OCREngine {
    constructor() {
        this.zxingReader = null;
        this.zxingReady = false;
    }

    async initializeZXing() {
        // Cargar ZXing WASM desde assets/zxing/
        const script = document.createElement('script');
        script.src = './assets/zxing/zxing-wasm.min.js';
        // ...
        this.zxingReader = new ZXing.BrowserMultiFormatReader();
        this.zxingReady = true;
    }

    async detectQRCodes(imageSource) {
        // Detectar hasta 3 QR codes
        // Return: [{index, text, format, ok}]
    }

    getWhitelist(fieldType) {
        return {
            sexo: 'HM',
            clave_elector: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/',
            curp: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/',
            seccion: '0123456789',
            anio_registro: '0123456789',
            vigencia: '0123456789-/',
            mrz: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'
        }[fieldType] || '';
    }

    async recognize(imageSource, options = {}) {
        const fieldType = options.fieldType || 'general';
        const whitelist = this.getWhitelist(fieldType);

        await this.tesseractWorker.setParameters({
            tessedit_char_whitelist: whitelist,
            // ...
        });

        // Si recorte pequeño, upscale x2
        if (canvas.width < 200 || canvas.height < 50) {
            canvas = this.upscale(canvas, 2);
        }

        // OCR...
    }

    async recognizeOCRB(imageSource) {
        // Para MRZ (banda OCR-B)
        await this.tesseractWorker.loadLanguage('ocrb');
        await this.tesseractWorker.initialize('ocrb');
        // whitelist: A-Z0-9<
        // psm: 7 (single line)
    }

    upscale(canvas, factor) {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = canvas.width * factor;
        newCanvas.height = canvas.height * factor;
        const ctx = newCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
        return newCanvas;
    }
}
```

#### 2. field-extractor.js (Actualizar para bbox)
**Estado**: 40% → Retornar `{value, confidence, bbox, source}`

```javascript
async extractField(fieldKey, ocrResult, layout, model, side, W, H) {
    // 1. getRegion() del layout
    const region = layout.getRegion(model, side, fieldKey, W, H);

    // 2. Recortar canvas
    const croppedCanvas = this.cropRegion(canvas, region);

    // 3. OCR con whitelist
    const result = await this.ocr.recognize(croppedCanvas, {
        fieldType: this.getFieldType(fieldKey),
        psm: 7  // Single line
    });

    // 4. Normalizar y validar
    const value = this.ocrCorrector.correctText(result.text, {type: fieldType});
    const validation = this.validateField(fieldKey, value);

    let confidence = result.confidence;
    if (validation.valid) confidence += 10;

    // 5. Retornar con bbox
    return {
        value,
        confidence: Math.min(100, confidence),
        bbox: [region.x, region.y, region.w, region.h],
        source: 'ocr'
    };
}

cropRegion(canvas, region) {
    const temp = document.createElement('canvas');
    temp.width = region.w;
    temp.height = region.h;
    const ctx = temp.getContext('2d');
    ctx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    return temp;
}
```

#### 3. ocr-corrector.js (Agregar fixOcrConfusions + merge)
**Estado**: 80% → Solo faltan 2 métodos

```javascript
fixOcrConfusions(text, fieldType) {
    let corrected = text;

    if (fieldType === 'alphanumeric_id') {
        // Position-based para CURP/Clave
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (i < 4) {
                // Letras
                if (char === '0') corrected = corrected.replace(char, 'O');
                if (char === '1') corrected = corrected.replace(char, 'I');
            } else if (i >= 4 && i < 10) {
                // Números (fecha)
                if (char === 'O') corrected = corrected.replace(char, '0');
                if (char === 'I') corrected = corrected.replace(char, '1');
            }
        }
    } else if (fieldType === 'numeric_id') {
        corrected = corrected.replace(/O/gi, '0');
        corrected = corrected.replace(/I/gi, '1');
        corrected = corrected.replace(/S/gi, '5');
        corrected = corrected.replace(/B/gi, '8');
    }

    return corrected;
}

mergeQRAndOCR(ocrData, qrPayloads) {
    const merged = { ...ocrData };

    for (const qr of qrPayloads) {
        if (!qr.ok) continue;

        try {
            const qrData = JSON.parse(qr.text);

            for (const [key, value] of Object.entries(qrData)) {
                const normalizedKey = key.toLowerCase();

                if (merged[normalizedKey]) {
                    // Comparar similarity
                    const sim = this.levenshteinSimilarity(
                        merged[normalizedKey].value,
                        value
                    );

                    if (sim >= 0.90) {
                        // Boost confidence
                        merged[normalizedKey].confidence += 15;
                        merged[normalizedKey].source = 'ocr+qr';
                    } else if (qr.confidence > merged[normalizedKey].confidence) {
                        // Reemplazar con QR
                        merged[normalizedKey].value = value;
                        merged[normalizedKey].source = 'qr';
                        merged[normalizedKey].confidence = 95;
                    }
                } else {
                    // Solo en QR
                    merged[normalizedKey] = {
                        value, confidence: 95, source: 'qr', bbox: []
                    };
                }
            }
        } catch (e) {
            // No-JSON QR
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

#### 4. app.js (JSON estructurado + timings)
**Estado**: 30% → Actualizar formato de salida

```javascript
async runINEPipeline(file, onProgress) {
    const timings = {
        pre: 0,
        classify: 0,
        ocr: 0,
        qr: 0,
        post: 0
    };

    const t0 = performance.now();

    // ... pipeline ...

    const t1 = performance.now();
    timings.pre = Math.round(t1 - t0);

    // ... clasificación ...
    timings.classify = Math.round(performance.now() - t1);

    // ... OCR ...
    timings.ocr = ...;

    // ... QR ...
    timings.qr = ...;

    // ... post-processing ...
    timings.post = ...;

    // RETORNAR FORMATO EXACTO:
    return {
        side: "front" | "back",
        model: "INE_2019" | "INE_2023" | "INE_v3_1" | "unknown",
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
            mrz: { value: "", confidence: 0, bbox: [], source: "ocr" },
            qr_payloads: [{ index: 0, text: "...", ok: true }]
        },
        confidence_overall: 0.0,
        timings_ms: timings
    };
}
```

---

### Fase 2 - Anti-Fraude (0%)

Ver `IMPLEMENTATION_PLAN.md` para código completo de:
1. dedupe-hash.js
2. antifraud-moire.js
3. antifraud-ela.js
4. link-front-back.js
5. face-match.js

---

### Fase 3 - UI (0%)

1. index.html - Botón demo, badges, descarga JSON
2. main.js - loadDemoImages(), downloadJSON()
3. service-worker.js - PWA offline

---

## 📊 Progreso Actualizado

| Archivo | Estado | % |
|---------|--------|---|
| layout.js | ✅ | 100 |
| onnx-runtime.js | ✅ | 100 |
| ai-field-extractor.js | ✅ | 100 |
| validators.js | ✅ | 100 |
| card-detector.js | ✅ | 100 |
| image-processor.js | ✅ | 100 |
| **ine-detector.js** | **✅** | **100** |
| ocr-engine.js | 🔶 | 60 |
| field-extractor.js | 🔶 | 40 |
| ocr-corrector.js | 🔶 | 80 |
| app.js | 🔶 | 30 |
| dedupe-hash.js | ❌ | 0 |
| antifraud-moire.js | ❌ | 0 |
| antifraud-ela.js | ❌ | 0 |
| link-front-back.js | ❌ | 0 |
| face-match.js | ❌ | 0 |
| index.html | ❌ | 0 |
| main.js | ❌ | 0 |
| service-worker.js | ❌ | 0 |
| **TOTAL** | **🔶** | **55%** |

---

## 🎯 Siguientes Pasos

1. **Completar ocr-engine.js** (ZXing + whitelists)
2. **Actualizar field-extractor.js** (bbox + confidence)
3. **Completar ocr-corrector.js** (2 métodos faltantes)
4. **Actualizar app.js** (JSON + timings)
5. **Commit Fase 1 completa**
6. **Iniciar Fase 2** (anti-fraude)
7. **Fase 3** (UI)

---

**Commits recientes**:
- `1dfc634` - ine-detector.js completo ✅
- `be736bf` - card-detector + image-processor ✅
- `db00bee` - validators ✅
- `cefe8a9` - infraestructura ✅
