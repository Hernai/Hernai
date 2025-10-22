/**
 * Detector Automático de Credencial INE
 * Usa IA y patrones para identificar si una imagen es una credencial INE válida
 */

class INEDetector {
    constructor() {
        this.isInitialized = false;
        this.config = {
            // Patrones regex para campos de INE
            patterns: {
                CURP: /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/g,
                CLAVE_ELECTOR: /[A-Z]{6}\d{8}[HM]\d{3}/g,
                OCR: /\d{13}/g,
                CIC: /\d{9}/g,
                REGISTRO_FEDERAL: /\d{10}/g,
                CODIGO_POSTAL: /\d{5}/g,
                ANIO: /20\d{2}/g,
            },
            // Palabras clave que debe contener una INE
            keywords: {
                required: [
                    'MEXICO',
                    'ELECTORAL',
                    'INSTITUTO',
                    'NACIONAL',
                    'CREDENCIAL',
                    'ELECTOR'
                ],
                optional: [
                    'INE',
                    'FEDERAL',
                    'VIGENCIA',
                    'DOMICILIO',
                    'CURP',
                    'CLAVE',
                    'REGISTRO'
                ]
            },
            // Umbrales de confianza (ajustados para detectar INEs reales)
            thresholds: {
                minimumConfidence: 35,  // Reducido a 35 para ser más sensible
                patternMatchWeight: 0.45,  // Mayor peso a patrones (CURP, OCR, etc.)
                keywordMatchWeight: 0.30,  // Mayor peso a keywords importantes
                visualFeaturesWeight: 0.25  // Menor peso a características visuales
            },
            // Características visuales de INE
            visualFeatures: {
                expectedColors: ['#8B1538', '#006341', '#FFFFFF'], // Vino, verde, blanco
                aspectRatio: { min: 1.3, max: 2.0 }, // Más permisivo: 1.5-1.7 → 1.3-2.0
                minResolution: { width: 300, height: 180 }  // Más permisivo: 400x250 → 300x180
            }
        };
        this.detectionCache = new Map();
    }

    /**
     * Initialize the detector
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('[INE-Detector] Already initialized');
            return;
        }

        console.log('[INE-Detector] Initializing INE detector...');

        try {
            // Pre-compile regex patterns for performance
            this.compiledPatterns = {};
            for (const [key, pattern] of Object.entries(this.config.patterns)) {
                this.compiledPatterns[key] = new RegExp(pattern.source, pattern.flags);
            }

            this.isInitialized = true;
            console.log('[INE-Detector] Detector initialized successfully');
        } catch (error) {
            console.error('[INE-Detector] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Detect if an image is a valid INE credential
     */
    async detect(imageData, ocrText = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        console.log('[INE-Detector] Starting INE detection...');
        const startTime = performance.now();

        try {
            // Create cache key
            const cacheKey = this.getCacheKey(imageData);
            if (this.detectionCache.has(cacheKey)) {
                console.log('[INE-Detector] Using cached result');
                return this.detectionCache.get(cacheKey);
            }

            const result = {
                isINE: false,
                confidence: 0,
                side: 'unknown', // 'front', 'back', or 'unknown'
                model: 'unknown', // 'F', 'G', 'H', etc.
                reasons: [],
                details: {
                    patternMatches: {},
                    keywordMatches: [],
                    visualFeatures: {},
                    ocrConfidence: 0
                }
            };

            // Step 1: Visual analysis
            const visualScore = await this.analyzeVisualFeatures(imageData);
            result.details.visualFeatures = visualScore;

            // Step 2: Pattern matching (if OCR text available)
            let patternScore = { score: 0, matches: {}, confidence: 0 };
            if (ocrText) {
                patternScore = this.analyzePatterns(ocrText);
                result.details.patternMatches = patternScore.matches;
                result.details.ocrConfidence = patternScore.confidence;
            }

            // Step 3: Keyword matching (if OCR text available)
            let keywordScore = { score: 0, matches: [] };
            if (ocrText) {
                keywordScore = this.analyzeKeywords(ocrText);
                result.details.keywordMatches = keywordScore.matches;
            }

            // Step 4: Calculate final confidence
            const weights = this.config.thresholds;
            let finalConfidence =
                (patternScore.score * weights.patternMatchWeight) +
                (keywordScore.score * weights.keywordMatchWeight) +
                (visualScore.score * weights.visualFeaturesWeight);

            // Bonus: Si no hay texto OCR pero las características visuales son fuertes,
            // dar más peso a lo visual (probablemente el OCR aún no ha corrido)
            if (!ocrText || ocrText.trim().length < 50) {
                if (visualScore.score >= 70) {
                    // Si las características visuales son muy buenas, aumentar confianza
                    finalConfidence = Math.max(finalConfidence, visualScore.score * 0.75);
                    result.reasons.push('⚠️ OCR pendiente, evaluación basada en características visuales');
                }
            }

            // Bonus: Si detectamos patrones clave (CURP o Clave Elector), alta confianza
            if (patternScore.matches.CURP || patternScore.matches.CLAVE_ELECTOR) {
                finalConfidence = Math.max(finalConfidence, 80);
            }

            result.confidence = Math.round(finalConfidence);
            result.isINE = finalConfidence >= weights.minimumConfidence;

            // Step 5: Determine side (front/back)
            if (ocrText && result.isINE) {
                result.side = this.determineSide(ocrText, patternScore.matches);
                result.model = this.determineModel(ocrText, patternScore.matches);
            }

            // Step 6: Add reasons
            result.reasons = this.generateReasons(result);

            const processingTime = performance.now() - startTime;
            result.processingTime = processingTime;

            console.log(`[INE-Detector] Detection complete in ${processingTime.toFixed(2)}ms`);
            console.log(`[INE-Detector] Result: ${result.isINE ? 'INE VÁLIDA' : 'NO ES INE'} (${result.confidence}%)`);

            // Cache result
            this.detectionCache.set(cacheKey, result);

            return result;

        } catch (error) {
            console.error('[INE-Detector] Detection failed:', error);
            throw new Error('Error en detección de INE: ' + error.message);
        }
    }

    /**
     * Analyze visual features of the image
     */
    async analyzeVisualFeatures(imageData) {
        console.log('[INE-Detector] Analyzing visual features...');

        try {
            const image = await this.loadImage(imageData);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = image.width;
            canvas.height = image.height;
            ctx.drawImage(image, 0, 0);

            const features = {
                resolution: { width: image.width, height: image.height },
                aspectRatio: image.width / image.height,
                dominantColors: [],
                score: 0
            };

            let score = 0;

            // Check resolution (más permisivo)
            if (image.width >= this.config.visualFeatures.minResolution.width &&
                image.height >= this.config.visualFeatures.minResolution.height) {
                score += 35;  // Aumentado de 30 a 35
            } else if (image.width >= 200 && image.height >= 120) {
                // Aún dar puntos parciales para resoluciones menores pero aceptables
                score += 20;
            }

            // Check aspect ratio (más permisivo)
            const ar = features.aspectRatio;
            if (ar >= this.config.visualFeatures.aspectRatio.min &&
                ar <= this.config.visualFeatures.aspectRatio.max) {
                score += 40;
            } else if (ar >= 1.0 && ar <= 2.5) {
                // Dar puntos parciales para aspect ratios cercanos
                score += 25;
            }

            // Analyze dominant colors (simplified)
            const imageData_pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const colorAnalysis = this.analyzeDominantColors(imageData_pixels);
            features.dominantColors = colorAnalysis.colors;

            // Check if INE colors are present (peso aumentado)
            if (this.hasINEColors(colorAnalysis.colors)) {
                score += 35;  // Aumentado de 30 a 35
            }

            features.score = score;
            return features;

        } catch (error) {
            console.error('[INE-Detector] Visual analysis failed:', error);
            return { score: 0, error: error.message };
        }
    }

    /**
     * Analyze OCR patterns
     */
    analyzePatterns(ocrText) {
        console.log('[INE-Detector] Analyzing patterns...');

        const normalizedText = this.normalizeText(ocrText);
        const matches = {};
        let totalMatches = 0;
        let confidence = 0;

        // Check each pattern with AGGRESSIVE weighting for important fields
        for (const [key, pattern] of Object.entries(this.compiledPatterns)) {
            const found = normalizedText.match(pattern);
            if (found) {
                matches[key] = found;
                totalMatches++;

                // Weight critical INE patterns VERY heavily
                if (key === 'CURP') {
                    confidence += 45;  // CURP es el más importante
                } else if (key === 'CLAVE_ELECTOR') {
                    confidence += 40;  // Clave elector casi igual de importante
                } else if (key === 'OCR') {
                    confidence += 35;  // OCR code muy importante
                } else if (key === 'CIC') {
                    confidence += 25;  // CIC para modelos viejos
                } else if (key === 'ANIO') {
                    confidence += 15;  // Años ayudan pero menos
                } else {
                    confidence += 10;  // Otros patrones
                }
            }
        }

        // Boost adicional si tiene múltiples patrones clave
        const criticalPatterns = ['CURP', 'CLAVE_ELECTOR', 'OCR'].filter(k => matches[k]);
        if (criticalPatterns.length >= 2) {
            confidence += 20;  // Bonus por tener 2+ campos críticos
        }

        // Normalize confidence to 0-100
        confidence = Math.min(100, confidence);

        return {
            matches,
            count: totalMatches,
            score: confidence,
            confidence
        };
    }

    /**
     * Analyze keyword presence with smart matching
     */
    analyzeKeywords(ocrText) {
        console.log('[INE-Detector] Analyzing keywords with AI matching...');

        const normalizedText = this.normalizeText(ocrText);
        const matches = [];
        let score = 0;
        let requiredCount = 0;
        let optionalCount = 0;

        // Check for critical keyword combinations (muy importante)
        if (normalizedText.includes('INE') || normalizedText.includes('INSTITUTO NACIONAL ELECTORAL')) {
            score += 40;  // INE keyword es crítico
            matches.push({ keyword: 'INE/INSTITUTO', type: 'critical' });
        }

        // Check for "MEXICO" (casi todas las INEs lo tienen)
        if (normalizedText.includes('MEXICO') || normalizedText.includes('MÉXICO')) {
            score += 30;
            matches.push({ keyword: 'MEXICO', type: 'critical' });
        }

        // Check for "CREDENCIAL" or "ELECTORAL" or "ELECTOR"
        if (normalizedText.includes('CREDENCIAL') || normalizedText.includes('ELECTORAL') || normalizedText.includes('ELECTOR')) {
            score += 25;
            matches.push({ keyword: 'CREDENCIAL/ELECTORAL', type: 'required' });
        }

        // Check required keywords (flexible matching)
        for (const keyword of this.config.keywords.required) {
            if (normalizedText.includes(keyword)) {
                matches.push({ keyword, type: 'required' });
                requiredCount++;
                score += 5;  // Bonus adicional por cada keyword
            }
        }

        // Check optional keywords
        for (const keyword of this.config.keywords.optional) {
            if (normalizedText.includes(keyword)) {
                matches.push({ keyword, type: 'optional' });
                optionalCount++;
                score += 3;  // Bonus menor por keywords opcionales
            }
        }

        // Normalize score to 0-100
        score = Math.min(100, score);

        return {
            matches,
            requiredCount,
            optionalCount,
            score
        };
    }

    /**
     * Determine which side of the INE (front or back)
     */
    determineSide(ocrText, patternMatches) {
        const normalizedText = this.normalizeText(ocrText);
        let frontScore = 0;
        let backScore = 0;

        // CRITICAL: OCR code (13 dígitos) SOLO está en reverso
        if (patternMatches.OCR && patternMatches.OCR.length > 0) {
            backScore += 50;  // Peso MUY alto - es indicador definitivo de reverso
            console.log('[INE-Detector] OCR code found → REVERSO');
        }

        // CRITICAL: Clave Elector está SOLO en reverso
        if (patternMatches.CLAVE_ELECTOR) {
            backScore += 40;
            console.log('[INE-Detector] Clave Elector found → REVERSO');
        }

        // Reverso: Keywords
        if (normalizedText.includes('VIGENCIA')) {
            backScore += 15;
        }
        if (normalizedText.includes('EMISION')) {
            backScore += 15;
        }
        if (normalizedText.includes('REGISTRO')) {
            backScore += 10;
        }

        // CRITICAL: CURP puede estar en anverso o reverso dependiendo del modelo
        // Pero DOMICILIO solo está en anverso
        if (normalizedText.includes('DOMICILIO') || normalizedText.includes('DIRECCION')) {
            frontScore += 40;
            console.log('[INE-Detector] DOMICILIO found → ANVERSO');
        }

        // Anverso: Keywords
        if (normalizedText.includes('NOMBRE')) {
            frontScore += 20;
        }
        if (normalizedText.includes('APELLIDO')) {
            frontScore += 20;
        }
        if (normalizedText.includes('SEXO')) {
            frontScore += 15;
        }
        if (normalizedText.includes('EDAD')) {
            frontScore += 15;
        }

        // Si tiene CURP pero no tiene OCR ni Clave Elector, probablemente es anverso
        if (patternMatches.CURP && !patternMatches.OCR && !patternMatches.CLAVE_ELECTOR) {
            frontScore += 20;
        }

        console.log(`[INE-Detector] Side scores - Front: ${frontScore}, Back: ${backScore}`);

        // Decidir con umbral mínimo
        if (frontScore > backScore && frontScore >= 20) {
            return 'front';
        } else if (backScore > frontScore && backScore >= 20) {
            return 'back';
        }

        // Si no podemos decidir, retornar 'unknown' pero con más info
        console.warn('[INE-Detector] Cannot determine side confidently', {
            frontScore,
            backScore,
            hasOCR: !!patternMatches.OCR,
            hasClave: !!patternMatches.CLAVE_ELECTOR,
            hasCURP: !!patternMatches.CURP
        });

        // Si tiene OCR, es definitivamente reverso
        if (patternMatches.OCR) return 'back';
        // Si tiene DOMICILIO, es definitivamente anverso
        if (normalizedText.includes('DOMICILIO')) return 'front';

        return 'unknown';
    }

    /**
     * Determine INE model (F, G, H, etc.)
     */
    determineModel(ocrText, patternMatches) {
        const normalizedText = this.normalizeText(ocrText);

        // Model H indicators (most recent)
        if (normalizedText.includes('DESDE EL EXTRANJERO') ||
            normalizedText.includes('FROM ABROAD')) {
            return 'H (con foto)';
        }

        // Model G indicators
        if (patternMatches.OCR && patternMatches.OCR[0] && patternMatches.OCR[0].length === 13) {
            return 'G o H';
        }

        // Model F indicators
        if (patternMatches.CIC) {
            return 'F';
        }

        return 'G o superior (estimado)';
    }

    /**
     * Generate human-readable reasons for detection result
     */
    generateReasons(result) {
        const reasons = [];

        if (result.isINE) {
            if (result.details.patternMatches.CURP) {
                reasons.push('✓ CURP válida detectada');
            }
            if (result.details.patternMatches.CLAVE_ELECTOR) {
                reasons.push('✓ Clave de Elector válida detectada');
            }
            if (result.details.patternMatches.OCR) {
                reasons.push('✓ Código OCR detectado');
            }
            if (result.details.keywordMatches.length > 0) {
                reasons.push(`✓ ${result.details.keywordMatches.length} palabras clave encontradas`);
            }
            if (result.details.visualFeatures.score > 50) {
                reasons.push('✓ Características visuales coinciden');
            }
            if (result.side !== 'unknown') {
                reasons.push(`✓ Lado identificado: ${result.side === 'front' ? 'Anverso' : 'Reverso'}`);
            }
        } else {
            if (!result.details.patternMatches.CURP) {
                reasons.push('✗ No se detectó CURP válida');
            }
            if (!result.details.patternMatches.CLAVE_ELECTOR) {
                reasons.push('✗ No se detectó Clave de Elector');
            }
            if (result.details.keywordMatches.length < 3) {
                reasons.push('✗ Pocas palabras clave de INE encontradas');
            }
            if (result.details.visualFeatures.score < 30) {
                reasons.push('✗ Características visuales no coinciden');
            }
        }

        return reasons;
    }

    /**
     * Helper: Load image from various sources
     */
    loadImage(source) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;

            if (typeof source === 'string') {
                img.src = source;
            } else if (source instanceof HTMLImageElement) {
                resolve(source);
            } else if (source instanceof Blob) {
                img.src = URL.createObjectURL(source);
            } else {
                reject(new Error('Unsupported image source type'));
            }
        });
    }

    /**
     * Helper: Analyze dominant colors
     */
    analyzeDominantColors(imageData) {
        const data = imageData.data;
        const colorMap = new Map();
        const sampleRate = 10; // Sample every 10th pixel for performance

        for (let i = 0; i < data.length; i += 4 * sampleRate) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const hex = this.rgbToHex(r, g, b);

            colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }

        // Get top 5 colors
        const sortedColors = Array.from(colorMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([color, count]) => ({ color, count }));

        return { colors: sortedColors };
    }

    /**
     * Helper: Check if INE colors are present (más permisivo)
     */
    hasINEColors(dominantColors) {
        // Buscar tonos característicos de INE con rangos más amplios
        let hasWineRed = false;
        let hasGreenOrGold = false;
        let hasDarkColors = false;

        for (const { color } of dominantColors) {
            const rgb = this.hexToRgb(color);
            if (!rgb) continue;

            // Check for maroon/wine color (más permisivo)
            if (rgb.r > 80 && rgb.g < 100 && rgb.b < 100) {
                hasWineRed = true;
            }
            // Check for green or gold tones
            if ((rgb.r < 100 && rgb.g > 60) || (rgb.r > 150 && rgb.g > 120)) {
                hasGreenOrGold = true;
            }
            // Check for any dark colors (texto, fotos)
            if (rgb.r < 60 && rgb.g < 60 && rgb.b < 60) {
                hasDarkColors = true;
            }
        }

        // Si tiene al menos un color característico Y colores oscuros, probablemente es INE
        return (hasWineRed || hasGreenOrGold) && hasDarkColors;
    }

    /**
     * Helper: Normalize text for analysis
     */
    normalizeText(text) {
        return text
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Helper: RGB to Hex
     */
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = Math.round(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    /**
     * Helper: Hex to RGB
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    /**
     * Helper: Generate cache key
     */
    getCacheKey(imageData) {
        // Simple hash based on image data URL
        const dataUrl = typeof imageData === 'string' ? imageData : imageData.src;
        return dataUrl ? dataUrl.substring(0, 100) : Date.now().toString();
    }

    /**
     * Clear detection cache
     */
    clearCache() {
        this.detectionCache.clear();
        console.log('[INE-Detector] Cache cleared');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = INEDetector;
}
