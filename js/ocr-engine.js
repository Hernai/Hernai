/**
 * Motor OCR Híbrido para HernAI
 * Combina Tesseract.js (rápido) con Transformers.js TrOCR (preciso para casos difíciles)
 */

class OCREngine {
    constructor() {
        this.tesseractWorker = null;
        this.transformersModel = null;
        this.zxingReader = null;
        this.zxingReady = false;
        this.isInitialized = false;
        this.config = {
            tesseract: {
                lang: 'spa',
                oem: 3, // LSTM OCR Engine
                psm: 3, // Automatic page segmentation
            },
            transformers: {
                model: 'Xenova/trocr-small-printed', // TrOCR for printed text
                quantized: true, // Use quantized model for faster inference
            },
            thresholds: {
                lowConfidence: 70, // Below this, use AI fallback
                retryConfidence: 50, // Below this, retry with preprocessing
            }
        };
        this.stats = {
            tesseractCalls: 0,
            transformersCalls: 0,
            averageConfidence: 0,
            totalProcessingTime: 0
        };
    }

    /**
     * Initialize OCR engines
     */
    async initialize(onProgress = null) {
        if (this.isInitialized) {
            console.log('[OCR] Already initialized');
            return;
        }

        console.log('[OCR] Initializing OCR engines...');
        const startTime = performance.now();

        try {
            // Initialize Tesseract (fast, loads first)
            if (onProgress) onProgress({ stage: 'tesseract', progress: 0 });
            await this.initializeTesseract((progress) => {
                if (onProgress) onProgress({ stage: 'tesseract', progress });
            });

            // Initialize Transformers.js (slower, loads in background)
            if (onProgress) onProgress({ stage: 'transformers', progress: 0 });
            await this.initializeTransformers((progress) => {
                if (onProgress) onProgress({ stage: 'transformers', progress });
            });

            this.isInitialized = true;
            const loadTime = performance.now() - startTime;
            console.log(`[OCR] Engines initialized in ${loadTime.toFixed(2)}ms`);

            if (onProgress) onProgress({ stage: 'complete', progress: 100 });
        } catch (error) {
            console.error('[OCR] Initialization failed:', error);
            throw new Error('No se pudieron inicializar los motores OCR: ' + error.message);
        }
    }

    /**
     * Initialize Tesseract.js
     */
    async initializeTesseract(onProgress = null) {
        try {
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js no está cargado');
            }

            console.log('[OCR] Loading Tesseract.js...');

            // Create worker with Tesseract.js v5 API
            // NOTE: Even simple logger functions cause DataCloneError in Workers
            // Skip logger completely - Tesseract v5 handles logging internally
            this.tesseractWorker = await Tesseract.createWorker();

            // Load and initialize language
            await this.tesseractWorker.loadLanguage(this.config.tesseract.lang);
            await this.tesseractWorker.initialize(this.config.tesseract.lang);

            await this.tesseractWorker.setParameters({
                tessedit_pageseg_mode: this.config.tesseract.psm,
                tessedit_ocr_engine_mode: this.config.tesseract.oem,
                preserve_interword_spaces: '1',  // Preservar espacios entre palabras
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚabcdefghijklmnñopqrstuvwxyzáéíóú0123456789 .,-/',
                // Parámetros adicionales para mejorar detección de espacios
                tosp_min_sane_kn_sp: '1.5',  // Espacio mínimo entre palabras (más sensible)
                tosp_old_to_method: '0',  // Usar nuevo método de detección de espacios
                tosp_old_to_bug_fix: '1',  // Activar fix de bugs de espacios
            });

            console.log('[OCR] Tesseract.js loaded successfully');
        } catch (error) {
            console.error('[OCR] Tesseract initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize Transformers.js (TrOCR)
     */
    async initializeTransformers(onProgress = null) {
        try {
            if (typeof pipeline === 'undefined') {
                console.warn('[OCR] Transformers.js no disponible, continuando solo con Tesseract');
                return;
            }

            console.log('[OCR] Loading Transformers.js TrOCR model...');

            // Load TrOCR model pipeline
            const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.10.0');

            this.transformersModel = await pipeline(
                'image-to-text',
                this.config.transformers.model,
                {
                    quantized: this.config.transformers.quantized,
                    progress_callback: (progress) => {
                        if (onProgress) {
                            onProgress(progress.progress || 0);
                        }
                    }
                }
            );

            console.log('[OCR] Transformers.js TrOCR model loaded successfully');
        } catch (error) {
            console.warn('[OCR] Transformers.js initialization failed (no fatal):', error);
            // No es fatal, podemos continuar solo con Tesseract
        }
    }

    /**
     * Perform OCR with hybrid approach
     */
    async recognize(imageData, options = {}) {
        if (!this.isInitialized) {
            throw new Error('OCR engine no inicializado. Llama a initialize() primero.');
        }

        const startTime = performance.now();
        console.log('[OCR] Starting recognition...');

        const config = {
            useAI: options.useAI !== false, // Default true
            forceAI: options.forceAI || false, // Force AI even if Tesseract is confident
            rectangles: options.rectangles || null, // Specific regions to OCR
            ...options
        };

        try {
            // Step 1: Try Tesseract first (fast)
            const tesseractResult = await this.recognizeWithTesseract(imageData, config);
            this.stats.tesseractCalls++;

            // Step 2: Evaluate confidence
            const avgConfidence = this.calculateAverageConfidence(tesseractResult);
            console.log(`[OCR] Tesseract confidence: ${avgConfidence.toFixed(2)}%`);

            // Step 3: Decide if AI fallback is needed
            const needsAIFallback = config.forceAI ||
                (config.useAI && avgConfidence < this.config.thresholds.lowConfidence);

            if (needsAIFallback && this.transformersModel) {
                console.log('[OCR] Low confidence, using AI fallback with TrOCR...');
                const aiResult = await this.recognizeWithTransformers(imageData, config);
                this.stats.transformersCalls++;

                // Merge results (prefer AI for low-confidence words)
                const mergedResult = this.mergeResults(tesseractResult, aiResult);

                const processingTime = performance.now() - startTime;
                this.stats.totalProcessingTime += processingTime;

                return {
                    text: mergedResult.text,
                    confidence: mergedResult.confidence,
                    data: mergedResult,
                    method: 'hybrid',
                    processingTime,
                    stats: this.getStats()
                };
            }

            // Step 4: Return Tesseract result if confident
            const processingTime = performance.now() - startTime;
            this.stats.totalProcessingTime += processingTime;

            return {
                text: tesseractResult.text,
                confidence: avgConfidence,
                data: tesseractResult,
                method: 'tesseract',
                processingTime,
                stats: this.getStats()
            };

        } catch (error) {
            console.error('[OCR] Recognition failed:', error);
            throw new Error('Error en reconocimiento OCR: ' + error.message);
        }
    }

    /**
     * Recognize with Tesseract.js
     */
    async recognizeWithTesseract(imageData, config) {
        console.log('[OCR] Running Tesseract OCR...');

        const options = {
            rectangle: config.rectangle || undefined
        };

        const { data } = await this.tesseractWorker.recognize(imageData, options);

        return {
            text: data.text,
            confidence: data.confidence,
            words: data.words.map(w => ({
                text: w.text,
                confidence: w.confidence,
                bbox: w.bbox
            })),
            lines: data.lines.map(l => ({
                text: l.text,
                confidence: l.confidence,
                bbox: l.bbox
            })),
            paragraphs: data.paragraphs.map(p => ({
                text: p.text,
                confidence: p.confidence,
                bbox: p.bbox
            }))
        };
    }

    /**
     * Recognize with Transformers.js (TrOCR)
     */
    async recognizeWithTransformers(imageData, config) {
        console.log('[OCR] Running TrOCR (Transformers.js)...');

        if (!this.transformersModel) {
            throw new Error('Modelo TrOCR no disponible');
        }

        // Convert image data to format expected by Transformers.js
        const imageUrl = typeof imageData === 'string' ? imageData : imageData.src;

        const result = await this.transformersModel(imageUrl, {
            max_new_tokens: 200,
            num_beams: 4,
            temperature: 0.1
        });

        return {
            text: result[0].generated_text,
            confidence: result[0].score ? result[0].score * 100 : 85, // Convert to percentage
            words: [], // TrOCR doesn't provide word-level data
            lines: [{
                text: result[0].generated_text,
                confidence: result[0].score ? result[0].score * 100 : 85
            }],
            paragraphs: []
        };
    }

    /**
     * Merge Tesseract and Transformers results intelligently
     */
    mergeResults(tesseractData, transformersData) {
        console.log('[OCR] Merging Tesseract and TrOCR results...');

        // If Transformers has higher confidence, prefer it
        if (transformersData.confidence > tesseractData.confidence) {
            return {
                text: transformersData.text,
                confidence: transformersData.confidence,
                words: transformersData.words,
                lines: transformersData.lines,
                method: 'transformers-preferred'
            };
        }

        // Otherwise, use Tesseract but enhance low-confidence words with AI
        const enhancedWords = tesseractData.words.map(word => {
            if (word.confidence < this.config.thresholds.lowConfidence) {
                // Mark for potential AI enhancement
                return { ...word, needsAI: true };
            }
            return word;
        });

        return {
            text: tesseractData.text,
            confidence: tesseractData.confidence,
            words: enhancedWords,
            lines: tesseractData.lines,
            method: 'tesseract-enhanced'
        };
    }

    /**
     * Calculate average confidence from OCR result
     */
    calculateAverageConfidence(ocrData) {
        if (!ocrData.words || ocrData.words.length === 0) {
            return ocrData.confidence || 0;
        }

        const totalConfidence = ocrData.words.reduce((sum, word) => sum + word.confidence, 0);
        return totalConfidence / ocrData.words.length;
    }

    /**
     * Detect and correct image orientation
     */
    async detectOrientation(imageData) {
        if (!this.tesseractWorker) {
            throw new Error('Tesseract worker not initialized');
        }

        console.log('[OCR] Detecting image orientation...');

        try {
            // Use Tesseract's OSD (Orientation and Script Detection)
            const osdWorker = await Tesseract.createWorker('osd');
            const { data } = await osdWorker.detect(imageData);
            await osdWorker.terminate();

            return {
                angle: data.orientation_degrees || 0,
                confidence: data.orientation_confidence || 0,
                script: data.script || 'Latin',
                needsRotation: data.orientation_degrees !== 0
            };
        } catch (error) {
            console.error('[OCR] Orientation detection failed:', error);
            return {
                angle: 0,
                confidence: 0,
                script: 'Unknown',
                needsRotation: false
            };
        }
    }

    /**
     * Get OCR statistics
     */
    getStats() {
        return {
            ...this.stats,
            averageProcessingTime: this.stats.tesseractCalls > 0
                ? this.stats.totalProcessingTime / (this.stats.tesseractCalls + this.stats.transformersCalls)
                : 0
        };
    }

    /**
     * Terminate workers and free resources
     */
    async terminate() {
        console.log('[OCR] Terminating OCR engines...');

        if (this.tesseractWorker) {
            await this.tesseractWorker.terminate();
            this.tesseractWorker = null;
        }

        if (this.transformersModel) {
            // Transformers.js models are automatically garbage collected
            this.transformersModel = null;
        }

        this.isInitialized = false;
        console.log('[OCR] OCR engines terminated');
    }

    /**
     * Initialize ZXing for QR code detection
     */
    async initializeZXing() {
        if (this.zxingReady) {
            console.log('[OCR] ZXing already initialized');
            return;
        }

        console.log('[OCR] Initializing ZXing for QR detection...');

        try {
            // Intentar cargar ZXing desde assets locales o CDN
            if (typeof ZXing === 'undefined') {
                console.log('[OCR] ZXing not loaded, attempting to load from CDN...');
                await this.loadZXingFromCDN();
            }

            // Crear reader multi-formato (QR, DataMatrix, etc.)
            if (typeof ZXing !== 'undefined' && ZXing.BrowserMultiFormatReader) {
                this.zxingReader = new ZXing.BrowserMultiFormatReader();
                this.zxingReady = true;
                console.log('[OCR] ✅ ZXing initialized successfully');
            } else {
                console.warn('[OCR] ⚠️ ZXing not available, QR detection disabled');
            }
        } catch (error) {
            console.error('[OCR] ZXing initialization failed:', error);
            console.warn('[OCR] Continuing without QR detection');
        }
    }

    /**
     * Load ZXing from CDN
     */
    async loadZXingFromCDN() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@latest/umd/index.min.js';
            script.onload = () => {
                console.log('[OCR] ZXing loaded from CDN');
                resolve();
            };
            script.onerror = () => {
                reject(new Error('Failed to load ZXing from CDN'));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Detect QR codes in image (up to 3 codes)
     * @param {HTMLImageElement|HTMLCanvasElement|string} imageSource
     * @returns {Promise<Array<{index: number, text: string, format: string, ok: boolean}>>}
     */
    async detectQRCodes(imageSource) {
        if (!this.zxingReady) {
            await this.initializeZXing();
        }

        if (!this.zxingReady) {
            console.warn('[OCR] ZXing not available, returning empty QR list');
            return [];
        }

        console.log('[OCR] Detecting QR codes...');
        const qrCodes = [];

        try {
            // Convertir a elemento de imagen si es necesario
            let imageElement = imageSource;
            if (typeof imageSource === 'string') {
                imageElement = await this.loadImage(imageSource);
            } else if (imageSource instanceof HTMLCanvasElement) {
                imageElement = await this.canvasToImage(imageSource);
            }

            // Decodificar (ZXing puede detectar múltiples códigos)
            try {
                const result = await this.zxingReader.decodeFromImageElement(imageElement);
                if (result) {
                    qrCodes.push({
                        index: 0,
                        text: result.getText(),
                        format: result.getBarcodeFormat(),
                        ok: true
                    });
                    console.log(`[OCR] ✅ QR code detected: ${result.getText().substring(0, 50)}...`);
                }
            } catch (err) {
                // No QR encontrado, esto es normal
                console.log('[OCR] No QR codes detected in image');
            }

            // TODO: Para detectar múltiples QR codes, se necesitaría escanear diferentes regiones
            // Por ahora retornamos el primero encontrado

        } catch (error) {
            console.error('[OCR] QR detection error:', error);
        }

        return qrCodes;
    }

    /**
     * Get OCR whitelist for specific field type
     * @param {string} fieldType - Type of field (sexo, clave_elector, curp, seccion, etc.)
     * @returns {string} Whitelist characters
     */
    getWhitelist(fieldType) {
        const whitelists = {
            sexo: 'HM',
            clave_elector: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/',
            curp: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/',
            seccion: '0123456789',
            anio_registro: '0123456789',
            vigencia: '0123456789-/',
            mrz: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
            ocr_code: '0123456789',
            general: '' // Sin whitelist
        };

        return whitelists[fieldType] || '';
    }

    /**
     * Recognize text with field-specific whitelist
     * @param {*} imageData
     * @param {Object} options - {fieldType, psm, useAI, ...}
     * @returns {Promise<{text: string, confidence: number, method: string}>}
     */
    async recognizeWithWhitelist(imageData, options = {}) {
        const fieldType = options.fieldType || 'general';
        const psm = options.psm || 6; // Default: Assume uniform block of text
        // Usar whitelist de options si existe, sino obtener del fieldType
        const whitelist = options.whitelist || (fieldType !== null ? this.getWhitelist(fieldType) : '');

        console.log(`[OCR] Recognizing with PSM=${psm}, whitelist: ${whitelist ? whitelist.substring(0, 30) + (whitelist.length > 30 ? '...' : '') : 'none'}`);

        // Configurar whitelist y PSM si se especificó
        if (whitelist) {
            await this.tesseractWorker.setParameters({
                tessedit_char_whitelist: whitelist,
                tessedit_pageseg_mode: psm
            });
        } else {
            await this.tesseractWorker.setParameters({
                tessedit_pageseg_mode: psm
            });
        }

        // Procesar imagen (upscale si es pequeña)
        let processedImage = imageData;
        if (imageData instanceof HTMLCanvasElement) {
            const canvas = imageData;
            if (canvas.width < 200 || canvas.height < 50) {
                console.log(`[OCR] Image too small (${canvas.width}×${canvas.height}), upscaling x2...`);
                processedImage = this.upscaleCanvas(canvas, 2);
            }
        }

        // Ejecutar OCR
        const result = await this.recognize(processedImage, options);

        // Restaurar configuración por defecto
        if (whitelist) {
            await this.tesseractWorker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚabcdefghijklmnñopqrstuvwxyzáéíóú0123456789 .,-/'
            });
        }

        return result;
    }

    /**
     * Recognize MRZ (Machine Readable Zone) with OCR-B trained data
     * @param {*} imageSource - Image containing MRZ
     * @returns {Promise<{text: string, confidence: number, method: string}>}
     */
    async recognizeOCRB(imageSource) {
        console.log('[OCR] Recognizing MRZ with OCR-B...');

        try {
            // Intentar usar OCR-B trained data si está disponible
            try {
                await this.tesseractWorker.loadLanguage('ocrb');
                await this.tesseractWorker.initialize('ocrb');
                console.log('[OCR] ✅ OCR-B language loaded');
            } catch (err) {
                console.warn('[OCR] ⚠️ OCR-B not available, using eng with MRZ whitelist');
                await this.tesseractWorker.loadLanguage('eng');
                await this.tesseractWorker.initialize('eng');
            }

            // Configurar para MRZ
            await this.tesseractWorker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
                tessedit_pageseg_mode: 7, // Treat image as single text line
                preserve_interword_spaces: '0' // MRZ no tiene espacios
            });

            // Ejecutar OCR
            const { data } = await this.tesseractWorker.recognize(imageSource);

            // Restaurar a español
            await this.tesseractWorker.loadLanguage('spa');
            await this.tesseractWorker.initialize('spa');
            await this.tesseractWorker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚabcdefghijklmnñopqrstuvwxyzáéíóú0123456789 .,-/',
                tessedit_pageseg_mode: this.config.tesseract.psm
            });

            return {
                text: data.text.trim(),
                confidence: data.confidence || 0,
                method: 'tesseract_ocrb'
            };

        } catch (error) {
            console.error('[OCR] MRZ recognition failed:', error);
            return { text: '', confidence: 0, method: 'failed' };
        }
    }

    /**
     * Upscale canvas using INTER_CUBIC interpolation
     * @param {HTMLCanvasElement} canvas
     * @param {number} factor - Scale factor (e.g., 2 for 2x)
     * @returns {HTMLCanvasElement}
     */
    upscaleCanvas(canvas, factor) {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = canvas.width * factor;
        newCanvas.height = canvas.height * factor;

        const ctx = newCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high'; // Cubic interpolation
        ctx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);

        console.log(`[OCR] Upscaled ${canvas.width}×${canvas.height} → ${newCanvas.width}×${newCanvas.height}`);
        return newCanvas;
    }

    /**
     * Helper: Convert canvas to image element
     */
    canvasToImage(canvas) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = canvas.toDataURL('image/png');
        });
    }

    /**
     * Helper: Load image from source
     */
    loadImage(source) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;

            if (typeof source === 'string') {
                img.src = source;
            } else if (source instanceof Blob) {
                img.src = URL.createObjectURL(source);
            } else {
                reject(new Error('Unsupported image source'));
            }
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OCREngine;
}
