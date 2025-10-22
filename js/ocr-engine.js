/**
 * Motor OCR Híbrido para HernAI
 * Combina Tesseract.js (rápido) con Transformers.js TrOCR (preciso para casos difíciles)
 */

class OCREngine {
    constructor() {
        this.tesseractWorker = null;
        this.transformersModel = null;
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
            this.tesseractWorker = await Tesseract.createWorker(this.config.tesseract.lang, 1, {
                logger: (m) => {
                    if (onProgress && m.status === 'recognizing text') {
                        onProgress(m.progress * 100);
                    }
                }
            });

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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OCREngine;
}
