/**
 * HernAI - Main Application
 * Orchestrates all components for INE scanning with AI
 */

class HernAI {
    constructor() {
        this.ocr = new OCREngine();
        this.detector = new INEDetector();
        this.processor = new ImageProcessor();
        this.extractor = new FieldExtractor();
        this.aiExtractor = new AIFieldExtractor();  // AI-powered field extraction

        this.state = {
            frontImage: null,
            backImage: null,
            processedFront: null,
            processedBack: null,
            ocrResultFront: null,
            ocrResultBack: null,
            detectionFront: null,
            detectionBack: null,
            extractedData: null,
            validationResults: null
        };

        this.isInitialized = false;
        this.initializationProgress = 0;
    }

    /**
     * Initialize all components
     */
    async initialize(onProgress = null) {
        if (this.isInitialized) {
            console.log('[HernAI] Already initialized');
            return;
        }

        console.log('[HernAI] Initializing application...');
        const startTime = performance.now();

        try {
            // Step 1: Initialize ImageProcessor (fast)
            if (onProgress) onProgress({ component: 'image-processor', progress: 0 });
            this.initializationProgress = 10;
            await this.processor.initialize();
            console.log('[HernAI] Image processor initialized');

            // Step 2: Initialize INE Detector (fast)
            if (onProgress) onProgress({ component: 'ine-detector', progress: 0 });
            this.initializationProgress = 20;
            await this.detector.initialize();
            console.log('[HernAI] INE detector initialized');

            // Step 3: Initialize OCR engines (slow - Tesseract + Transformers)
            if (onProgress) onProgress({ component: 'ocr-engine', progress: 0 });
            this.initializationProgress = 30;

            await this.ocr.initialize((progress) => {
                if (onProgress) {
                    onProgress({
                        component: 'ocr-engine',
                        stage: progress.stage,
                        progress: progress.progress
                    });
                }
            });
            console.log('[HernAI] OCR engine initialized');

            // Step 4: Initialize AI Field Extractor
            if (onProgress) onProgress({ component: 'ai-extractor', progress: 0 });
            this.initializationProgress = 80;
            await this.aiExtractor.initialize();
            console.log('[HernAI] AI field extractor initialized');

            this.initializationProgress = 100;
            this.isInitialized = true;

            const initTime = performance.now() - startTime;
            console.log(`[HernAI] Application initialized in ${initTime.toFixed(2)}ms`);

            if (onProgress) onProgress({ component: 'complete', progress: 100 });

        } catch (error) {
            console.error('[HernAI] Initialization failed:', error);
            throw new Error('Error al inicializar la aplicación: ' + error.message);
        }
    }

    /**
     * Process INE images (front and back)
     */
    async processINE(frontImage, backImage, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Aplicación no inicializada. Llama a initialize() primero.');
        }

        console.log('[HernAI] Starting INE processing...');
        const startTime = performance.now();

        const config = {
            onProgress: options.onProgress || null,
            detectOnly: options.detectOnly || false,
            skipValidation: options.skipValidation || false,
            useAI: options.useAI !== false,
            ...options
        };

        try {
            const { onProgress } = config;

            // STEP 1: Detect INE (fast check)
            if (onProgress) onProgress({ stage: 'detection', progress: 5, message: 'Detectando si son credenciales INE...' });

            const quickDetectionFront = await this.detector.detect(frontImage, null);
            const quickDetectionBack = await this.detector.detect(backImage, null);

            if (!quickDetectionFront.isINE || !quickDetectionBack.isINE) {
                const nonINE = !quickDetectionFront.isINE ? 'frontal' : 'reverso';
                throw new Error(`La imagen ${nonINE} no parece ser una credencial INE válida. Confianza: ${quickDetectionFront.isINE ? quickDetectionBack.confidence : quickDetectionFront.confidence}%`);
            }

            console.log('[HernAI] INE detected - Front:', quickDetectionFront.confidence + '%', 'Back:', quickDetectionBack.confidence + '%');

            if (config.detectOnly) {
                return {
                    detected: true,
                    frontDetection: quickDetectionFront,
                    backDetection: quickDetectionBack
                };
            }

            // STEP 2: Process images with INE-optimized pipeline (deskewing, morphology, etc.)
            if (onProgress) onProgress({ stage: 'processing', progress: 15, message: 'Mejorando calidad con IA (preprocesamiento avanzado)...' });

            const processedFront = await this.processor.processForINE(frontImage);

            if (onProgress) onProgress({ stage: 'processing', progress: 25, message: 'Procesando reverso con pipeline optimizado...' });

            const processedBack = await this.processor.processForINE(backImage);

            this.state.processedFront = processedFront;
            this.state.processedBack = processedBack;

            console.log('[HernAI] Images processed successfully');

            // STEP 3: OCR on front
            if (onProgress) onProgress({ stage: 'ocr', progress: 35, message: 'Extrayendo texto del anverso con OCR...' });

            const ocrResultFront = await this.ocr.recognize(processedFront.dataURL, {
                useAI: config.useAI,
                forceAI: false
            });

            this.state.ocrResultFront = ocrResultFront;
            console.log('[HernAI] Front OCR complete:', ocrResultFront.method, ocrResultFront.confidence + '%');

            // STEP 4: OCR on back
            if (onProgress) onProgress({ stage: 'ocr', progress: 55, message: 'Extrayendo texto del reverso con OCR...' });

            const ocrResultBack = await this.ocr.recognize(processedBack.dataURL, {
                useAI: config.useAI,
                forceAI: false
            });

            this.state.ocrResultBack = ocrResultBack;
            console.log('[HernAI] Back OCR complete:', ocrResultBack.method, ocrResultBack.confidence + '%');

            // STEP 5: Re-validate with OCR text
            if (onProgress) onProgress({ stage: 'validation', progress: 75, message: 'Validando credenciales INE...' });

            const detectionFront = await this.detector.detect(frontImage, ocrResultFront.text);
            const detectionBack = await this.detector.detect(backImage, ocrResultBack.text);

            this.state.detectionFront = detectionFront;
            this.state.detectionBack = detectionBack;

            console.log('[HernAI] Final detection - Front:', detectionFront.confidence + '%', detectionFront.side);
            console.log('[HernAI] Final detection - Back:', detectionBack.confidence + '%', detectionBack.side);

            // STEP 6: Extract fields using improved extraction with layout analysis
            if (onProgress) onProgress({ stage: 'extraction', progress: 85, message: 'Extrayendo campos con IA...' });

            // Use traditional extractor with all the improvements (name parsing, vigencia ranges, etc.)
            const extractedData = this.extractor.extract(ocrResultFront.data, ocrResultBack.data);

            // NOTE: AI extractor with layout analysis and semantic matching is also available
            // Can be used for validation or fallback: await this.aiExtractor.extract(ocrResultFront.data, ocrResultBack.data);

            this.state.extractedData = extractedData;

            console.log('[HernAI] Fields extracted successfully');

            // STEP 7: Validate data
            if (!config.skipValidation) {
                if (onProgress) onProgress({ stage: 'validation', progress: 95, message: 'Validando datos extraídos...' });

                const validationResults = INEValidators.validateINEData(extractedData);
                this.state.validationResults = validationResults;

                console.log('[HernAI] Validation complete:', validationResults.valid ? 'VALID' : 'INVALID');
            }

            const totalTime = performance.now() - startTime;

            // STEP 8: Build final result
            const result = {
                success: true,
                data: {
                    ...extractedData,
                    detection: {
                        front: detectionFront,
                        back: detectionBack
                    },
                    validation: this.state.validationResults,
                    ocr_stats: {
                        front: {
                            method: ocrResultFront.method,
                            confidence: ocrResultFront.confidence,
                            processingTime: ocrResultFront.processingTime
                        },
                        back: {
                            method: ocrResultBack.method,
                            confidence: ocrResultBack.confidence,
                            processingTime: ocrResultBack.processingTime
                        }
                    }
                },
                processingTime: totalTime,
                timestamp: new Date().toISOString()
            };

            if (onProgress) onProgress({ stage: 'complete', progress: 100, message: '¡Procesamiento completado!' });

            console.log(`[HernAI] Processing complete in ${totalTime.toFixed(2)}ms`);

            return result;

        } catch (error) {
            console.error('[HernAI] Processing failed:', error);
            throw error;
        }
    }

    /**
     * Export data to JSON
     */
    exportJSON(data = null) {
        const exportData = data || this.state.extractedData;
        if (!exportData) {
            throw new Error('No hay datos para exportar');
        }

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Download JSON file
     */
    downloadJSON(filename = null) {
        const json = this.exportJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const defaultFilename = `ine_${Date.now()}.json`;
        const finalFilename = filename || defaultFilename;

        const a = document.createElement('a');
        a.href = url;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('[HernAI] JSON downloaded:', finalFilename);
    }

    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Clear state
     */
    clearState() {
        this.state = {
            frontImage: null,
            backImage: null,
            processedFront: null,
            processedBack: null,
            ocrResultFront: null,
            ocrResultBack: null,
            detectionFront: null,
            detectionBack: null,
            extractedData: null,
            validationResults: null
        };
        console.log('[HernAI] State cleared');
    }

    /**
     * Cleanup resources
     */
    async terminate() {
        console.log('[HernAI] Terminating application...');

        if (this.ocr) {
            await this.ocr.terminate();
        }

        if (this.detector) {
            this.detector.clearCache();
        }

        this.clearState();
        this.isInitialized = false;

        console.log('[HernAI] Application terminated');
    }
}

// Initialize app globally
let app = null;

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('[HernAI] DOM loaded, initializing...');

        // Initialize app
        app = new HernAI();

        // Show initialization progress
        updateStatus('Inicializando motores de IA...', 0);

        try {
            await app.initialize((progress) => {
                const message = {
                    'image-processor': 'Cargando procesador de imágenes...',
                    'ine-detector': 'Cargando detector de INE...',
                    'ocr-engine': `Cargando OCR (${progress.stage})...`,
                    'complete': '¡Listo para escanear!'
                }[progress.component] || 'Inicializando...';

                updateStatus(message, progress.progress || 0);
            });

            console.log('[HernAI] App ready');
            updateStatus('✓ Sistema listo para escanear INE', 100);

            // Enable process button
            const btnProcess = document.getElementById('btnProcess');
            if (btnProcess) {
                btnProcess.disabled = !app.state.frontImage || !app.state.backImage;
            }

        } catch (error) {
            console.error('[HernAI] Initialization error:', error);
            updateStatus('❌ Error al inicializar: ' + error.message, 0);
            alert('Error al inicializar la aplicación. Por favor recarga la página.');
        }
    });

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('[PWA] Service Worker registered:', registration.scope);
                })
                .catch(error => {
                    console.error('[PWA] Service Worker registration failed:', error);
                });
        });
    }
}

/**
 * Helper functions for UI updates
 */

function updateStatus(message, progress) {
    const statusElement = document.getElementById('initStatus');
    const progressElement = document.getElementById('initProgress');

    if (statusElement) {
        statusElement.textContent = message;
    }

    if (progressElement) {
        progressElement.style.width = progress + '%';
        progressElement.textContent = Math.round(progress) + '%';
    }
}

function updateProcessingProgress(stage, progress, message) {
    const progressSection = document.getElementById('progressSection');
    const statusMessage = document.getElementById('statusMessage');
    const progressFill = document.getElementById('progressFill');

    if (progressSection) {
        progressSection.classList.add('show');
    }

    if (statusMessage) {
        statusMessage.textContent = message;
    }

    if (progressFill) {
        progressFill.style.width = progress + '%';
        progressFill.textContent = Math.round(progress) + '%';
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HernAI;
}
