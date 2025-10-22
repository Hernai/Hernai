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
            // Umbrales de confianza
            thresholds: {
                minimumConfidence: 70,
                patternMatchWeight: 0.4,
                keywordMatchWeight: 0.3,
                visualFeaturesWeight: 0.3
            },
            // Características visuales de INE
            visualFeatures: {
                expectedColors: ['#8B1538', '#006341', '#FFFFFF'], // Vino, verde, blanco
                aspectRatio: { min: 1.5, max: 1.7 }, // Aprox 85.6mm x 53.98mm
                minResolution: { width: 400, height: 250 }
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
            let patternScore = 0;
            if (ocrText) {
                patternScore = this.analyzePatterns(ocrText);
                result.details.patternMatches = patternScore.matches;
                result.details.ocrConfidence = patternScore.confidence;
            }

            // Step 3: Keyword matching (if OCR text available)
            let keywordScore = 0;
            if (ocrText) {
                keywordScore = this.analyzeKeywords(ocrText);
                result.details.keywordMatches = keywordScore.matches;
            }

            // Step 4: Calculate final confidence
            const weights = this.config.thresholds;
            const finalConfidence =
                (patternScore.score * weights.patternMatchWeight) +
                (keywordScore.score * weights.keywordMatchWeight) +
                (visualScore.score * weights.visualFeaturesWeight);

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

            // Check resolution
            if (image.width >= this.config.visualFeatures.minResolution.width &&
                image.height >= this.config.visualFeatures.minResolution.height) {
                score += 30;
            }

            // Check aspect ratio
            const ar = features.aspectRatio;
            if (ar >= this.config.visualFeatures.aspectRatio.min &&
                ar <= this.config.visualFeatures.aspectRatio.max) {
                score += 40;
            }

            // Analyze dominant colors (simplified)
            const imageData_pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const colorAnalysis = this.analyzeDominantColors(imageData_pixels);
            features.dominantColors = colorAnalysis.colors;

            // Check if INE colors are present
            if (this.hasINEColors(colorAnalysis.colors)) {
                score += 30;
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

        // Check each pattern
        for (const [key, pattern] of Object.entries(this.compiledPatterns)) {
            const found = normalizedText.match(pattern);
            if (found) {
                matches[key] = found;
                totalMatches++;

                // Weight important patterns more
                if (key === 'CURP' || key === 'CLAVE_ELECTOR' || key === 'OCR') {
                    confidence += 30;
                } else {
                    confidence += 10;
                }
            }
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
     * Analyze keyword presence
     */
    analyzeKeywords(ocrText) {
        console.log('[INE-Detector] Analyzing keywords...');

        const normalizedText = this.normalizeText(ocrText);
        const matches = [];
        let requiredCount = 0;
        let optionalCount = 0;

        // Check required keywords
        for (const keyword of this.config.keywords.required) {
            if (normalizedText.includes(keyword)) {
                matches.push({ keyword, type: 'required' });
                requiredCount++;
            }
        }

        // Check optional keywords
        for (const keyword of this.config.keywords.optional) {
            if (normalizedText.includes(keyword)) {
                matches.push({ keyword, type: 'optional' });
                optionalCount++;
            }
        }

        // Calculate score
        const requiredPercentage = (requiredCount / this.config.keywords.required.length) * 100;
        const optionalPercentage = (optionalCount / this.config.keywords.optional.length) * 100;
        const score = (requiredPercentage * 0.7) + (optionalPercentage * 0.3);

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

        // Front side indicators
        const frontIndicators = [
            'NOMBRE',
            'DOMICILIO',
            'FOTOGRAFIA',
            normalizedText.includes('CURP') && patternMatches.CURP,
            normalizedText.includes('CLAVE') && !normalizedText.includes('ELECTOR')
        ];

        // Back side indicators
        const backIndicators = [
            'CLAVE DE ELECTOR',
            'CLAVE ELECTOR',
            'VIGENCIA',
            'EMISION',
            'REGISTRO FEDERAL',
            patternMatches.CLAVE_ELECTOR,
            patternMatches.OCR && patternMatches.OCR.length > 0
        ];

        const frontScore = frontIndicators.filter(Boolean).length;
        const backScore = backIndicators.filter(Boolean).length;

        if (frontScore > backScore) {
            return 'front';
        } else if (backScore > frontScore) {
            return 'back';
        }

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
     * Helper: Check if INE colors are present
     */
    hasINEColors(dominantColors) {
        // Simplificado: buscar tonos rojos/vino y verdes
        for (const { color } of dominantColors) {
            const rgb = this.hexToRgb(color);
            // Check for maroon/wine color (high R, low G, low B)
            if (rgb.r > 100 && rgb.g < 80 && rgb.b < 80) {
                return true;
            }
            // Check for green (low R, high G, low B)
            if (rgb.r < 80 && rgb.g > 80 && rgb.b < 80) {
                return true;
            }
        }
        return false;
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
