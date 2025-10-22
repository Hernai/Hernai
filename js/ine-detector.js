/**
 * Detector Automático de Credencial INE
 * Usa IA y patrones para identificar si una imagen es una credencial INE válida
 */

class INEDetector {
    constructor() {
        this.isInitialized = false;
        this.onnxRuntime = null;  // Para clasificadores ML
        this.templateCache = new Map();  // Cache de templates cargados

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

            // Initialize ONNX Runtime for model classification
            if (typeof ONNXRuntime !== 'undefined') {
                this.onnxRuntime = new ONNXRuntime();
                await this.onnxRuntime.initialize();
                console.log('[INE-Detector] ONNX Runtime initialized');
            } else {
                console.warn('[INE-Detector] ONNX Runtime not available, using fallbacks');
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
                const sideResult = this.determineSide(ocrText, patternScore.matches);
                result.side = sideResult.side;
                result.sideConfidence = sideResult.sideConfidence;
                result.frontScore = sideResult.frontScore;
                result.backScore = sideResult.backScore;

                // IMPORTANT: Adjust overall confidence based on side detection
                // If we're confident about the side, boost overall confidence
                if (sideResult.sideConfidence > 0) {
                    // Blend: 70% original confidence + 30% side confidence
                    const blendedConfidence = (finalConfidence * 0.7) + (sideResult.sideConfidence * 0.3);
                    result.confidence = Math.round(blendedConfidence);
                    console.log(`[INE-Detector] 📊 Confidence adjusted: ${Math.round(finalConfidence)}% → ${result.confidence}% (side: ${sideResult.sideConfidence}%)`);
                }

                // Classify INE model (INE_2019, INE_2023, INE_v3_1, unknown)
                const modelResult = await this.classifyModel(imageData, ocrText, patternScore.matches);
                result.model = modelResult.model;
                result.modelConfidence = modelResult.confidence;
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
     * Returns object with side and confidence
     */
    determineSide(ocrText, patternMatches) {
        const normalizedText = this.normalizeText(ocrText);
        let frontScore = 0;
        let backScore = 0;

        // CRITICAL: OCR code (13 dígitos) SOLO está en reverso
        if (patternMatches.OCR && patternMatches.OCR.length > 0) {
            backScore += 50;  // Peso MUY alto - es indicador definitivo de reverso
            console.log('[INE-Detector] 🔴 OCR code found (+50) → REVERSO');
        }

        // CRITICAL: Clave Elector está SOLO en reverso
        if (patternMatches.CLAVE_ELECTOR) {
            backScore += 40;
            console.log('[INE-Detector] 🔴 Clave Elector found (+40) → REVERSO');
        }

        // Reverso: Keywords
        if (normalizedText.includes('VIGENCIA')) {
            backScore += 15;
            console.log('[INE-Detector] 🔴 VIGENCIA found (+15)');
        }
        if (normalizedText.includes('EMISION')) {
            backScore += 15;
            console.log('[INE-Detector] 🔴 EMISION found (+15)');
        }
        if (normalizedText.includes('REGISTRO')) {
            backScore += 10;
            console.log('[INE-Detector] 🔴 REGISTRO found (+10)');
        }

        // CRITICAL: CURP puede estar en anverso o reverso dependiendo del modelo
        // Pero DOMICILIO solo está en anverso
        if (normalizedText.includes('DOMICILIO') || normalizedText.includes('DIRECCION')) {
            frontScore += 40;
            console.log('[INE-Detector] 🟢 DOMICILIO found (+40) → ANVERSO');
        }

        // Anverso: Keywords
        if (normalizedText.includes('NOMBRE')) {
            frontScore += 20;
            console.log('[INE-Detector] 🟢 NOMBRE found (+20)');
        }
        if (normalizedText.includes('APELLIDO')) {
            frontScore += 20;
            console.log('[INE-Detector] 🟢 APELLIDO found (+20)');
        }
        if (normalizedText.includes('SEXO')) {
            frontScore += 15;
            console.log('[INE-Detector] 🟢 SEXO found (+15)');
        }
        if (normalizedText.includes('EDAD')) {
            frontScore += 15;
            console.log('[INE-Detector] 🟢 EDAD found (+15)');
        }
        if (normalizedText.includes('LOCALIDAD')) {
            frontScore += 10;
            console.log('[INE-Detector] 🟢 LOCALIDAD found (+10)');
        }
        if (normalizedText.includes('MUNICIPIO')) {
            frontScore += 10;
            console.log('[INE-Detector] 🟢 MUNICIPIO found (+10)');
        }
        if (normalizedText.includes('SECCION')) {
            frontScore += 10;
            console.log('[INE-Detector] 🟢 SECCION found (+10)');
        }

        // Si tiene CURP pero no tiene OCR ni Clave Elector, probablemente es anverso
        if (patternMatches.CURP && !patternMatches.OCR && !patternMatches.CLAVE_ELECTOR) {
            frontScore += 20;
            console.log('[INE-Detector] 🟢 CURP solo (sin OCR/Clave) (+20) → likely ANVERSO');
        }

        console.log(`[INE-Detector] ⚖️ Side scores - ANVERSO: ${frontScore}, REVERSO: ${backScore}`);

        // Calcular confianza basada en la diferencia de scores
        let side = 'unknown';
        let sideConfidence = 0;
        const totalScore = frontScore + backScore;
        const maxScore = Math.max(frontScore, backScore);

        // Decidir lado con umbral mínimo
        if (frontScore > backScore && frontScore >= 20) {
            side = 'front';
            sideConfidence = Math.min(100, (frontScore / Math.max(totalScore, 100)) * 150);
        } else if (backScore > frontScore && backScore >= 20) {
            side = 'back';
            sideConfidence = Math.min(100, (backScore / Math.max(totalScore, 100)) * 150);
        } else {
            // Si no podemos decidir, verificar indicadores definitivos
            if (patternMatches.OCR) {
                side = 'back';
                sideConfidence = 95;  // Muy alta confianza
                console.log('[INE-Detector] ✅ OCR code = DEFINITIVO REVERSO (95%)');
            } else if (normalizedText.includes('DOMICILIO')) {
                side = 'front';
                sideConfidence = 90;  // Alta confianza
                console.log('[INE-Detector] ✅ DOMICILIO = DEFINITIVO ANVERSO (90%)');
            } else {
                console.warn('[INE-Detector] ⚠️ Cannot determine side confidently', {
                    frontScore,
                    backScore,
                    hasOCR: !!patternMatches.OCR,
                    hasClave: !!patternMatches.CLAVE_ELECTOR,
                    hasCURP: !!patternMatches.CURP
                });
            }
        }

        console.log(`[INE-Detector] ✅ DECISION: ${side.toUpperCase()} (confianza: ${sideConfidence.toFixed(1)}%)`);

        return {
            side,
            sideConfidence: Math.round(sideConfidence),
            frontScore,
            backScore
        };
    }

    /**
     * Classify INE model with ONNX + template matching + heuristics
     * @param {*} imageData - Image to classify
     * @param {string} ocrText - OCR text from image
     * @param {Object} patternMatches - Pattern matches from OCR
     * @returns {Promise<{model: string, confidence: number}>}
     */
    async classifyModel(imageData, ocrText, patternMatches) {
        console.log('[INE-Detector] Classifying INE model...');

        // Step 1: Try ONNX classifier first
        if (this.onnxRuntime) {
            try {
                const onnxResult = await this.onnxRuntime.classifyModel(imageData);
                if (onnxResult.confidence > 0.80) {
                    console.log(`[INE-Detector] ✅ ONNX classified as ${onnxResult.model} (${(onnxResult.confidence * 100).toFixed(1)}%)`);
                    return { model: onnxResult.model, confidence: onnxResult.confidence * 100 };
                } else {
                    console.log(`[INE-Detector] ⚠️ ONNX confidence too low (${(onnxResult.confidence * 100).toFixed(1)}%), trying fallbacks`);
                }
            } catch (error) {
                console.warn('[INE-Detector] ONNX classification failed:', error.message);
            }
        }

        // Step 2: Template matching with anchors
        const templateResult = await this.templateMatching(imageData);
        if (templateResult.confidence >= 0.75) {
            console.log(`[INE-Detector] ✅ Template matching: ${templateResult.model} (${(templateResult.confidence * 100).toFixed(1)}%)`);
            return { model: templateResult.model, confidence: templateResult.confidence * 100 };
        }

        // Step 3: Heuristic detection from OCR text
        const heuristicResult = this.heuristicModelDetection(ocrText, patternMatches);
        console.log(`[INE-Detector] Using heuristic: ${heuristicResult.model} (${heuristicResult.confidence.toFixed(1)}%)`);

        return heuristicResult;
    }

    /**
     * Template matching using OpenCV with anchor images
     * @param {*} imageData - Image to match
     * @returns {Promise<{model: string, confidence: number}>}
     */
    async templateMatching(imageData) {
        console.log('[INE-Detector] Running template matching with anchors...');

        if (typeof cv === 'undefined' || !cv.Mat) {
            console.warn('[INE-Detector] OpenCV not available for template matching');
            return { model: 'unknown', confidence: 0 };
        }

        const models = ['ine_2019', 'ine_2023', 'ine_v3_1'];
        let bestMatch = { model: 'unknown', confidence: 0 };

        try {
            // Load source image
            const srcCanvas = typeof imageData === 'string'
                ? await this.imageToCanvas(imageData)
                : imageData;

            const src = cv.imread(srcCanvas);
            const srcGray = new cv.Mat();
            cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY);

            // Try each model's anchors
            for (const modelName of models) {
                const templatePath = `./assets/templates/${modelName}_anchors.png`;
                const template = await this.loadTemplate(templatePath, modelName);

                if (!template) {
                    console.log(`[INE-Detector] No template found for ${modelName}, skipping`);
                    continue;
                }

                // Template matching
                const result = new cv.Mat();
                const mask = new cv.Mat();

                try {
                    cv.matchTemplate(srcGray, template, result, cv.TM_CCOEFF_NORMED, mask);

                    // Find max value
                    const minMax = cv.minMaxLoc(result);
                    const maxVal = minMax.maxVal;

                    console.log(`[INE-Detector] ${modelName}: match score = ${(maxVal * 100).toFixed(1)}%`);

                    if (maxVal > bestMatch.confidence) {
                        // Map filename to spec model names
                        const modelMap = {
                            'ine_2019': 'INE_2019',
                            'ine_2023': 'INE_2023',
                            'ine_v3_1': 'INE_v3_1'
                        };

                        bestMatch = {
                            model: modelMap[modelName] || 'unknown',
                            confidence: maxVal
                        };
                    }
                } finally {
                    result.delete();
                    mask.delete();
                }

                template.delete();
            }

            srcGray.delete();
            src.delete();

        } catch (error) {
            console.error('[INE-Detector] Template matching error:', error);
        }

        return bestMatch;
    }

    /**
     * Heuristic model detection from OCR text
     * @param {string} ocrText - OCR text
     * @param {Object} patternMatches - Pattern matches
     * @returns {{model: string, confidence: number}}
     */
    heuristicModelDetection(ocrText, patternMatches) {
        if (!ocrText) {
            return { model: 'unknown', confidence: 0 };
        }

        const text = this.normalizeText(ocrText);

        // INE_2023 (Modelo H) - Indicador más específico
        if (text.includes('DESDE EL EXTRANJERO') || text.includes('FROM ABROAD')) {
            return { model: 'INE_2023', confidence: 85 };
        }

        // INE_2019 (Modelo G) - OCR de 13 dígitos sin texto de extranjero
        if (patternMatches.OCR && patternMatches.OCR.length > 0) {
            const hasOCR13 = patternMatches.OCR.some(ocr => ocr.length === 13);
            if (hasOCR13 && !text.includes('FROM ABROAD')) {
                return { model: 'INE_2019', confidence: 70 };
            }
        }

        // Modelo F (antiguo) - Tiene CIC en lugar de OCR
        if (patternMatches.CIC && !patternMatches.OCR) {
            return { model: 'INE_2019', confidence: 60 };  // Mapear F a 2019 genérico
        }

        // INE_v3_1 - Características específicas (placeholder)
        // TODO: Agregar indicadores específicos de v3.1 cuando se conozcan

        // Default: unknown
        return { model: 'unknown', confidence: 0 };
    }

    /**
     * Load template image from path
     * @param {string} path - Path to template image
     * @param {string} modelName - Model name for caching
     * @returns {Promise<cv.Mat|null>}
     */
    async loadTemplate(path, modelName) {
        // Check cache first
        if (this.templateCache.has(modelName)) {
            return this.templateCache.get(modelName).clone();
        }

        try {
            const response = await fetch(path);
            if (!response.ok) {
                return null;
            }

            const blob = await response.blob();
            const img = await this.loadImage(blob);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const template = cv.imread(canvas);
            const templateGray = new cv.Mat();
            cv.cvtColor(template, templateGray, cv.COLOR_RGBA2GRAY);

            // Cache the grayscale template
            this.templateCache.set(modelName, templateGray.clone());

            template.delete();

            return templateGray;

        } catch (error) {
            console.warn(`[INE-Detector] Failed to load template ${path}:`, error.message);
            return null;
        }
    }

    /**
     * Helper: Convert image to canvas
     */
    async imageToCanvas(imageSource) {
        const img = await this.loadImage(imageSource);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return canvas;
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
