/**
 * HernAI - Main Application
 * Orchestrates all components for INE scanning with AI
 */

class HernAI {
    constructor() {
        this.ocr = new OCREngine();
        this.cardDetector = new CardDetector();
        this.detector = new INEDetector();
        this.processor = new ImageProcessor();
        this.extractor = new FieldExtractor();
        this.aiExtractor = new AIFieldExtractor();  // AI-powered field extraction

        // Anti-fraud modules (Fase 2)
        this.dedupeHash = new DedupeHash();
        this.antiFraudMoire = new AntiFraudMoire();
        this.antiFraudELA = new AntiFraudELA();
        this.linkFrontBack = new LinkFrontBack();
        this.faceMatch = new FaceMatch();

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

            // Step 1.5: Initialize CardDetector (fast)
            if (onProgress) onProgress({ component: 'card-detector', progress: 0 });
            await this.cardDetector.initialize();
            console.log('[HernAI] Card detector initialized');

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

            // Show detailed confidence including side detection
            const frontConfidenceStr = detectionFront.sideConfidence
                ? `${detectionFront.confidence}% (INE) + ${detectionFront.sideConfidence}% (${detectionFront.side})`
                : `${detectionFront.confidence}% (${detectionFront.side})`;
            const backConfidenceStr = detectionBack.sideConfidence
                ? `${detectionBack.confidence}% (INE) + ${detectionBack.sideConfidence}% (${detectionBack.side})`
                : `${detectionBack.confidence}% (${detectionBack.side})`;

            console.log('[HernAI] 📊 Image 1:', frontConfidenceStr);
            console.log('[HernAI] 📊 Image 2:', backConfidenceStr);

            // AUTO-CORRECT: Intercambiar imágenes si están al revés
            let finalFrontImage = frontImage;
            let finalBackImage = backImage;
            let finalFrontOCR = ocrResultFront;
            let finalBackOCR = ocrResultBack;
            let finalFrontDetection = detectionFront;
            let finalBackDetection = detectionBack;

            // Caso 1: Primera imagen es REVERSO y segunda es ANVERSO → INTERCAMBIAR
            if (detectionFront.side === 'back' && detectionBack.side === 'front') {
                console.log('[HernAI] 🔄 Auto-corrigiendo: Imágenes intercambiadas (primera=reverso, segunda=anverso)');
                finalFrontImage = backImage;
                finalBackImage = frontImage;
                finalFrontOCR = ocrResultBack;
                finalBackOCR = ocrResultFront;
                finalFrontDetection = detectionBack;
                finalBackDetection = detectionFront;
            }
            // Caso 2: Ambas detectadas correctamente
            else if (detectionFront.side === 'front' && detectionBack.side === 'back') {
                console.log('[HernAI] ✅ Imágenes en orden correcto (primera=anverso, segunda=reverso)');
            }
            // Caso 3: Mismo lado 2 veces - RECHAZAR
            else if (detectionFront.side === detectionBack.side && detectionFront.side !== 'unknown') {
                throw new Error(
                    `❌ Subiste el MISMO lado 2 veces (ambas son ${detectionFront.side === 'front' ? 'ANVERSO' : 'REVERSO'}). ` +
                    `Por favor sube UNA foto del ANVERSO y UNA del REVERSO.`
                );
            }
            // Caso 4: No pudimos detectar un lado - INTENTAR CONTINUAR
            else if (detectionFront.side === 'unknown' || detectionBack.side === 'unknown') {
                console.warn('[HernAI] ⚠️ No se pudo determinar el lado con certeza, intentando continuar...');

                // Si una es unknown pero la otra está clara, intentar inferir
                if (detectionFront.side === 'unknown' && detectionBack.side === 'front') {
                    // La segunda es anverso, entonces la primera debe ser reverso
                    console.log('[HernAI] 🔄 Infiriendo: segunda=anverso, entonces primera=reverso');
                    finalFrontImage = backImage;
                    finalBackImage = frontImage;
                    finalFrontOCR = ocrResultBack;
                    finalBackOCR = ocrResultFront;
                    finalFrontDetection = detectionBack;
                    finalBackDetection = detectionFront;
                } else if (detectionFront.side === 'unknown' && detectionBack.side === 'back') {
                    // La segunda es reverso, entonces la primera debe ser anverso
                    console.log('[HernAI] ✅ Infiriendo: segunda=reverso, entonces primera=anverso');
                } else if (detectionFront.side === 'front' && detectionBack.side === 'unknown') {
                    // La primera es anverso, entonces la segunda debe ser reverso
                    console.log('[HernAI] ✅ Infiriendo: primera=anverso, entonces segunda=reverso');
                } else if (detectionFront.side === 'back' && detectionBack.side === 'unknown') {
                    // La primera es reverso, entonces la segunda debe ser anverso
                    console.log('[HernAI] 🔄 Infiriendo: primera=reverso, entonces segunda=anverso');
                    finalFrontImage = backImage;
                    finalBackImage = frontImage;
                    finalFrontOCR = ocrResultBack;
                    finalBackOCR = ocrResultFront;
                    finalFrontDetection = detectionBack;
                    finalBackDetection = detectionFront;
                } else {
                    // Ambas unknown - continuar con orden original y esperar que funcione
                    console.warn('[HernAI] ⚠️ Ambos lados desconocidos, usando orden original');
                }
            }

            // Actualizar state con imágenes corregidas
            this.state.detectionFront = finalFrontDetection;
            this.state.detectionBack = finalBackDetection;
            this.state.ocrResultFront = finalFrontOCR;
            this.state.ocrResultBack = finalBackOCR;

            console.log('[HernAI] ✅ Lados finales - Anverso:', finalFrontDetection.side, 'Reverso:', finalBackDetection.side);

            // STEP 6: Extract fields using improved extraction with layout analysis
            if (onProgress) onProgress({ stage: 'extraction', progress: 85, message: 'Extrayendo campos con IA...' });

            // Use traditional extractor with CORRECTED images
            const extractedData = this.extractor.extract(finalFrontOCR.data, finalBackOCR.data);

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
     * Run browser-only INE pipeline (new spec-compliant method)
     * Processes a single INE image (front OR back) and returns structured JSON
     *
     * @param {File|Blob|HTMLImageElement} imageFile - Input image
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Object>} Structured result with bbox, confidence, timings
     */
    async runINEPipeline(imageFile, onProgress = null) {
        if (!this.isInitialized) {
            throw new Error('Application not initialized. Call initialize() first.');
        }

        console.log('[HernAI] Starting browser-only INE pipeline...');

        const timings = {
            pre: 0,
            classify: 0,
            ocr: 0,
            qr: 0,
            post: 0
        };

        try {
            // ============================================================
            // PHASE 1: PREPROCESSING
            // ============================================================
            const t0 = performance.now();
            if (onProgress) onProgress({ stage: 'preprocessing', progress: 5 });

            // Load image
            const imageElement = await this.loadImageElement(imageFile);

            // Detect and rectify card
            const cardDetection = await this.cardDetector.detectCard(imageElement);
            if (!cardDetection.success) {
                throw new Error('Could not detect card boundaries');
            }

            // Process with CLAHE, denoising, white balance
            const processedCanvas = cardDetection.image; // Already 1012×638px from card-detector
            const W = 1012, H = 638;

            timings.pre = Math.round(performance.now() - t0);
            console.log(`[HernAI] ✓ Preprocessing: ${timings.pre}ms`);

            // ============================================================
            // PHASE 2: CLASSIFICATION (Side + Model)
            // ============================================================
            const t1 = performance.now();
            if (onProgress) onProgress({ stage: 'classification', progress: 15 });

            // Get full OCR text for classification (not field-specific yet)
            const fullOCRResult = await this.ocr.recognize(processedCanvas);

            // Classify side (front/back)
            const sideResult = await this.detector.classifySide(processedCanvas, fullOCRResult.text);
            const side = sideResult.side; // 'front' or 'back'

            // Classify model (INE_2019, INE_2023, INE_v3_1, unknown)
            const modelResult = await this.detector.classifyModel(processedCanvas, fullOCRResult.text);
            const model = modelResult.model;

            timings.classify = Math.round(performance.now() - t1);
            console.log(`[HernAI] ✓ Classification: ${timings.classify}ms - Side=${side}, Model=${model}`);

            // ============================================================
            // PHASE 3: OCR (Field-by-field extraction)
            // ============================================================
            const t2 = performance.now();
            if (onProgress) onProgress({ stage: 'ocr', progress: 35 });

            // Initialize instances if not already in constructor
            const layout = new Layout();
            const ocrCorrector = new OCRCorrector();
            await ocrCorrector.initialize();

            // Extract fields based on side
            let fields = {};
            if (side === 'front') {
                fields = await this.extractor.extractFrontFields(model, processedCanvas, this.ocr, layout);
            } else if (side === 'back') {
                fields = await this.extractor.extractBackFields(model, processedCanvas, this.ocr, layout);
            } else {
                // Unknown side - try both?
                console.warn('[HernAI] Unknown side, attempting back extraction');
                fields = await this.extractor.extractBackFields(model, processedCanvas, this.ocr, layout);
            }

            timings.ocr = Math.round(performance.now() - t2);
            console.log(`[HernAI] ✓ OCR: ${timings.ocr}ms - Extracted ${Object.keys(fields).length} fields`);

            // ============================================================
            // PHASE 4: QR CODE DETECTION
            // ============================================================
            const t3 = performance.now();
            if (onProgress) onProgress({ stage: 'qr', progress: 75 });

            let qrPayloads = [];
            try {
                qrPayloads = await this.ocr.detectQRCodes(processedCanvas);
                console.log(`[HernAI] ✓ Detected ${qrPayloads.length} QR codes`);
            } catch (err) {
                console.warn('[HernAI] QR detection failed:', err);
                qrPayloads = [];
            }

            timings.qr = Math.round(performance.now() - t3);

            // ============================================================
            // PHASE 5: POST-PROCESSING (Merge QR + OCR, validate)
            // ============================================================
            const t4 = performance.now();
            if (onProgress) onProgress({ stage: 'postprocessing', progress: 85 });

            // Merge QR data with OCR
            if (qrPayloads.length > 0) {
                fields = this.extractor.mergeQRWithOCR(fields, qrPayloads);
            }

            // Calculate overall confidence
            const fieldConfidences = Object.values(fields)
                .filter(f => f && typeof f.confidence === 'number')
                .map(f => f.confidence);

            const confidence_overall = fieldConfidences.length > 0
                ? fieldConfidences.reduce((a, b) => a + b, 0) / fieldConfidences.length
                : 0;

            timings.post = Math.round(performance.now() - t4);
            console.log(`[HernAI] ✓ Post-processing: ${timings.post}ms`);

            // ============================================================
            // PHASE 6: BUILD RESULT
            // ============================================================
            const result = {
                side: side,
                model: model,
                image_size_px: { w: W, h: H },
                fields: {
                    ...fields,
                    qr_payloads: qrPayloads  // Include QR raw data
                },
                confidence_overall: Math.round(confidence_overall * 10) / 10,
                timings_ms: timings
            };

            if (onProgress) onProgress({ stage: 'complete', progress: 100 });

            const totalTime = Object.values(timings).reduce((a, b) => a + b, 0);
            console.log(`[HernAI] ✓ Pipeline complete: ${totalTime}ms`);

            return result;

        } catch (error) {
            console.error('[HernAI] Pipeline failed:', error);
            throw error;
        }
    }

    /**
     * Load an image file/blob as HTMLImageElement
     * @param {File|Blob|HTMLImageElement} source - Image source
     * @returns {Promise<HTMLImageElement>}
     */
    async loadImageElement(source) {
        if (source instanceof HTMLImageElement) {
            return source;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));

            if (source instanceof Blob || source instanceof File) {
                const url = URL.createObjectURL(source);
                img.src = url;
            } else if (typeof source === 'string') {
                img.src = source;
            } else {
                reject(new Error('Invalid image source'));
            }
        });
    }

    /**
     * Run complete INE pipeline with anti-fraud detection
     * Processes BOTH front and back images with full fraud detection
     *
     * @param {File|Blob|HTMLImageElement} frontImage - Front image
     * @param {File|Blob|HTMLImageElement} backImage - Back image
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Object>} Complete result with anti-fraud signals
     */
    async runINEPipelineWithAntiFraud(frontImage, backImage, onProgress = null) {
        if (!this.isInitialized) {
            throw new Error('Application not initialized. Call initialize() first.');
        }

        console.log('[HernAI] Starting complete INE pipeline with anti-fraud...');

        const timings = {
            pre: 0,
            classify: 0,
            ocr: 0,
            qr: 0,
            post: 0,
            antifraud: 0,
            link: 0
        };

        try {
            // ============================================================
            // PHASE 1-5: Process front and back individually
            // ============================================================
            if (onProgress) onProgress({ stage: 'processing_front', progress: 5 });

            const t0 = performance.now();
            const frontResult = await this.runINEPipeline(frontImage, (p) => {
                if (onProgress) onProgress({ stage: `front_${p.stage}`, progress: 5 + (p.progress * 0.35) });
            });
            const frontTime = performance.now() - t0;

            if (onProgress) onProgress({ stage: 'processing_back', progress: 45 });

            const t1 = performance.now();
            const backResult = await this.runINEPipeline(backImage, (p) => {
                if (onProgress) onProgress({ stage: `back_${p.stage}`, progress: 45 + (p.progress * 0.35) });
            });
            const backTime = performance.now() - t1;

            console.log(`[HernAI] Front processed in ${frontTime.toFixed(0)}ms, Back in ${backTime.toFixed(0)}ms`);

            // ============================================================
            // PHASE 6: ANTI-FRAUD DETECTION
            // ============================================================
            if (onProgress) onProgress({ stage: 'antifraud', progress: 85 });

            const t2 = performance.now();

            // 6.1 Duplicate detection (compare front vs back)
            const duplicateCheck = await this.dedupeHash.compareImages(
                frontResult._canvas || frontImage,
                backResult._canvas || backImage
            );

            // 6.2 Moiré detection (recapture detection)
            const moireFront = await this.antiFraudMoire.detectMoire(frontImage);
            const moireBack = await this.antiFraudMoire.detectMoire(backImage);

            // 6.3 Error Level Analysis (tampering detection)
            const elaFront = await this.antiFraudELA.analyzeELA(frontImage);
            const elaBack = await this.antiFraudELA.analyzeELA(backImage);

            timings.antifraud = Math.round(performance.now() - t2);
            console.log(`[HernAI] Anti-fraud analysis: ${timings.antifraud}ms`);

            // ============================================================
            // PHASE 7: CROSS-VALIDATION (Front ↔ Back)
            // ============================================================
            if (onProgress) onProgress({ stage: 'cross_validation', progress: 92 });

            const t3 = performance.now();

            const crossValidation = this.linkFrontBack.validateCrossConsistency(
                frontResult,
                backResult
            );

            timings.link = Math.round(performance.now() - t3);
            console.log(`[HernAI] Cross-validation: ${timings.link}ms`);

            // ============================================================
            // PHASE 8: BUILD COMPLETE RESULT
            // ============================================================
            if (onProgress) onProgress({ stage: 'building_result', progress: 96 });

            // Combinar fields de ambos lados
            const combinedFields = {
                ...frontResult.fields,
                ...backResult.fields
            };

            // Calcular confidence overall combinado
            const allConfidences = [
                ...Object.values(frontResult.fields).filter(f => f && typeof f.confidence === 'number').map(f => f.confidence),
                ...Object.values(backResult.fields).filter(f => f && typeof f.confidence === 'number').map(f => f.confidence)
            ];

            const confidence_overall = allConfidences.length > 0
                ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
                : 0;

            // Calcular score total de anti-fraude (0-100)
            const antiFraudScore = this.calculateAntiFraudScore({
                duplicate: duplicateCheck,
                moire_front: moireFront,
                moire_back: moireBack,
                ela_front: elaFront,
                ela_back: elaBack,
                cross_validation: crossValidation
            });

            // Determinar riesgo general
            const overallRisk = this.classifyOverallRisk(antiFraudScore);

            // Resultado completo
            const result = {
                front: frontResult,
                back: backResult,
                combined_fields: combinedFields,
                confidence_overall: Math.round(confidence_overall * 10) / 10,
                cross_validation: crossValidation,
                antifraud: {
                    score: antiFraudScore,
                    risk_level: overallRisk,
                    signals: {
                        duplicate_detection: {
                            is_duplicate: duplicateCheck.is_duplicate,
                            similarity: duplicateCheck.similarity_score,
                            classification: duplicateCheck.classification
                        },
                        moire_detection: {
                            front: {
                                has_moire: moireFront.has_moire,
                                score: moireFront.moire_score,
                                risk: moireFront.risk_level
                            },
                            back: {
                                has_moire: moireBack.has_moire,
                                score: moireBack.moire_score,
                                risk: moireBack.risk_level
                            }
                        },
                        tampering_detection: {
                            front: {
                                is_manipulated: elaFront.is_manipulated,
                                score: elaFront.manipulation_score,
                                risk: elaFront.risk_level
                            },
                            back: {
                                is_manipulated: elaBack.is_manipulated,
                                score: elaBack.manipulation_score,
                                risk: elaBack.risk_level
                            }
                        }
                    }
                },
                timings_ms: {
                    front_total: Math.round(frontTime),
                    back_total: Math.round(backTime),
                    antifraud: timings.antifraud,
                    cross_validation: timings.link,
                    total: Math.round(frontTime + backTime + timings.antifraud + timings.link)
                }
            };

            if (onProgress) onProgress({ stage: 'complete', progress: 100 });

            console.log(`[HernAI] Complete pipeline: ${result.timings_ms.total}ms, Anti-fraud score: ${antiFraudScore}, Risk: ${overallRisk}`);

            return result;

        } catch (error) {
            console.error('[HernAI] Pipeline with anti-fraud failed:', error);
            throw error;
        }
    }

    /**
     * Calcula score de anti-fraude (0-100)
     * 100 = sin fraude, 0 = alto riesgo de fraude
     */
    calculateAntiFraudScore(signals) {
        let score = 100;

        // Penalizar por duplicados (mismo anverso y reverso = ERROR GRAVE)
        if (signals.duplicate.is_duplicate) {
            score -= 80; // Penalización severa
        } else if (signals.duplicate.is_similar) {
            score -= 30;
        }

        // Penalizar por moiré (recaptura)
        if (signals.moire_front.has_moire) {
            score -= signals.moire_front.moire_score * 40;
        }
        if (signals.moire_back.has_moire) {
            score -= signals.moire_back.moire_score * 40;
        }

        // Penalizar por manipulación (ELA)
        if (signals.ela_front.is_manipulated) {
            score -= signals.ela_front.manipulation_score * 0.3;
        }
        if (signals.ela_back.is_manipulated) {
            score -= signals.ela_back.manipulation_score * 0.3;
        }

        // Penalizar por inconsistencias cruzadas
        if (!signals.cross_validation.is_consistent) {
            score -= (100 - signals.cross_validation.consistency_score) * 0.5;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Clasificar riesgo general
     */
    classifyOverallRisk(score) {
        if (score >= 80) return 'low';
        if (score >= 60) return 'medium';
        if (score >= 40) return 'high';
        return 'critical';
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
