/**
 * FaceMatch - Face Matching (OPCIONAL)
 * Compara rostro de la foto con el rostro en la credencial
 * Usa face-api.js si está disponible, sino usa comparación básica
 */

class FaceMatch {
    constructor() {
        this.faceApi = null;
        this.isInitialized = false;
        this.modelsLoaded = false;

        // Thresholds para matching
        this.thresholds = {
            high_confidence: 0.6,    // > 0.6 = alta confianza de match
            medium_confidence: 0.4,  // 0.4-0.6 = confianza media
            low_confidence: 0.3      // < 0.3 = no match
        };
    }

    /**
     * Inicializa face-api.js si está disponible
     */
    async initialize() {
        if (this.isInitialized) return;

        console.log('[FaceMatch] Initializing face matching...');

        try {
            // Verificar si face-api.js está disponible
            if (typeof faceapi === 'undefined') {
                console.warn('[FaceMatch] face-api.js not available, using fallback');
                this.isInitialized = true;
                return;
            }

            this.faceApi = faceapi;

            // Cargar modelos (si están disponibles)
            const modelPath = './assets/models/face-api';

            try {
                await Promise.all([
                    this.faceApi.nets.tinyFaceDetector.loadFromUri(modelPath),
                    this.faceApi.nets.faceLandmark68Net.loadFromUri(modelPath),
                    this.faceApi.nets.faceRecognitionNet.loadFromUri(modelPath)
                ]);

                this.modelsLoaded = true;
                console.log('[FaceMatch] face-api.js models loaded');

            } catch (modelError) {
                console.warn('[FaceMatch] Could not load face-api models:', modelError.message);
                this.modelsLoaded = false;
            }

            this.isInitialized = true;

        } catch (error) {
            console.warn('[FaceMatch] Initialization failed:', error.message);
            this.isInitialized = true; // Continue with fallback
        }
    }

    /**
     * Compara dos rostros
     * @param {HTMLCanvasElement|HTMLImageElement} faceImage1 - Primera imagen con rostro
     * @param {HTMLCanvasElement|HTMLImageElement} faceImage2 - Segunda imagen con rostro
     * @returns {Promise<Object>} Resultado de comparación
     */
    async compareFaces(faceImage1, faceImage2) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        console.log('[FaceMatch] Comparing faces...');

        // Si face-api.js está disponible, usar detección avanzada
        if (this.faceApi && this.modelsLoaded) {
            return await this.compareFacesAdvanced(faceImage1, faceImage2);
        } else {
            // Fallback: comparación básica por histograma/estructura
            return await this.compareFacesBasic(faceImage1, faceImage2);
        }
    }

    /**
     * Comparación avanzada usando face-api.js
     */
    async compareFacesAdvanced(image1, image2) {
        try {
            // Detectar rostros y obtener descriptores
            const detections1 = await this.faceApi
                .detectSingleFace(image1, new this.faceApi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            const detections2 = await this.faceApi
                .detectSingleFace(image2, new this.faceApi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detections1 || !detections2) {
                return {
                    match: false,
                    similarity: 0,
                    confidence: 0,
                    method: 'face-api',
                    error: 'Could not detect faces in one or both images'
                };
            }

            // Calcular distancia euclidiana entre descriptores
            const descriptor1 = detections1.descriptor;
            const descriptor2 = detections2.descriptor;

            const distance = this.euclideanDistance(descriptor1, descriptor2);

            // Convertir distancia a similitud (0-1)
            // face-api: distance < 0.6 = same person
            const similarity = Math.max(0, 1 - distance);

            const match = distance < this.thresholds.high_confidence;
            const confidence = this.classifyConfidence(similarity);

            console.log(`[FaceMatch] face-api distance: ${distance.toFixed(3)}, similarity: ${similarity.toFixed(3)}`);

            return {
                match: match,
                similarity: Math.round(similarity * 1000) / 1000,
                confidence: confidence,
                distance: Math.round(distance * 1000) / 1000,
                method: 'face-api',
                detections: {
                    face1_confidence: detections1.detection.score,
                    face2_confidence: detections2.detection.score
                }
            };

        } catch (error) {
            console.error('[FaceMatch] Advanced comparison failed:', error);

            // Fallback a comparación básica
            return await this.compareFacesBasic(image1, image2);
        }
    }

    /**
     * Comparación básica usando histogramas y estructura
     * Fallback cuando face-api.js no está disponible
     */
    async compareFacesBasic(image1, image2) {
        try {
            const canvas1 = this.ensureCanvas(image1);
            const canvas2 = this.ensureCanvas(image2);

            // 1. Redimensionar a tamaño común
            const resized1 = this.resize(canvas1, 128, 128);
            const resized2 = this.resize(canvas2, 128, 128);

            // 2. Convertir a escala de grises
            const gray1 = this.toGrayscale(resized1);
            const gray2 = this.toGrayscale(resized2);

            // 3. Calcular histogramas
            const hist1 = this.calculateHistogram(gray1);
            const hist2 = this.calculateHistogram(gray2);

            // 4. Comparar histogramas usando chi-squared
            const histSimilarity = this.compareHistograms(hist1, hist2);

            // 5. Comparar estructura usando SSIM simplificado
            const structuralSimilarity = this.compareStructure(gray1, gray2);

            // 6. Combinar ambas métricas
            const combinedSimilarity = (histSimilarity * 0.3) + (structuralSimilarity * 0.7);

            const match = combinedSimilarity > this.thresholds.medium_confidence;
            const confidence = this.classifyConfidence(combinedSimilarity);

            console.log(`[FaceMatch] Basic comparison: ${combinedSimilarity.toFixed(3)}`);

            return {
                match: match,
                similarity: Math.round(combinedSimilarity * 1000) / 1000,
                confidence: confidence,
                method: 'basic',
                metrics: {
                    histogram_similarity: Math.round(histSimilarity * 1000) / 1000,
                    structural_similarity: Math.round(structuralSimilarity * 1000) / 1000
                }
            };

        } catch (error) {
            console.error('[FaceMatch] Basic comparison failed:', error);

            return {
                match: false,
                similarity: 0,
                confidence: 'unknown',
                method: 'basic',
                error: error.message
            };
        }
    }

    /**
     * Extrae región del rostro del canvas INE
     * @param {HTMLCanvasElement} ineCanvas - Canvas de INE completo (1012×638)
     * @param {string} side - 'front' or 'back'
     * @returns {HTMLCanvasElement} Región del rostro
     */
    extractFaceRegion(ineCanvas, side = 'front') {
        if (side !== 'front') {
            throw new Error('Face only exists on front side');
        }

        // Región aproximada del rostro en INE anverso
        // Basado en layout típico (porcentajes del canvas 1012×638)
        const W = 1012;
        const H = 638;

        const faceRegion = {
            x: Math.round(W * 0.05),  // 5% desde la izquierda
            y: Math.round(H * 0.20),  // 20% desde arriba
            w: Math.round(W * 0.25),  // 25% del ancho
            h: Math.round(H * 0.50)   // 50% de la altura
        };

        // Recortar región
        const temp = document.createElement('canvas');
        temp.width = faceRegion.w;
        temp.height = faceRegion.h;
        const ctx = temp.getContext('2d');

        ctx.drawImage(
            ineCanvas,
            faceRegion.x, faceRegion.y, faceRegion.w, faceRegion.h,
            0, 0, faceRegion.w, faceRegion.h
        );

        return temp;
    }

    // ========================================================================
    // HELPERS: Distance & Similarity
    // ========================================================================

    /**
     * Distancia euclidiana entre vectores
     */
    euclideanDistance(vec1, vec2) {
        let sum = 0;
        for (let i = 0; i < vec1.length; i++) {
            const diff = vec1[i] - vec2[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    /**
     * Calcular histograma de imagen en escala de grises
     */
    calculateHistogram(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const histogram = new Array(256).fill(0);

        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i]; // Ya está en grayscale
            histogram[gray]++;
        }

        // Normalizar
        const total = canvas.width * canvas.height;
        for (let i = 0; i < 256; i++) {
            histogram[i] /= total;
        }

        return histogram;
    }

    /**
     * Comparar histogramas usando Chi-Squared
     */
    compareHistograms(hist1, hist2) {
        let chiSquared = 0;

        for (let i = 0; i < 256; i++) {
            const sum = hist1[i] + hist2[i];
            if (sum > 0) {
                const diff = hist1[i] - hist2[i];
                chiSquared += (diff * diff) / sum;
            }
        }

        // Convertir chi-squared a similitud (0-1)
        // Menor chi-squared = más similar
        const similarity = 1 / (1 + chiSquared);

        return similarity;
    }

    /**
     * Comparar estructura (SSIM simplificado)
     */
    compareStructure(canvas1, canvas2) {
        const ctx1 = canvas1.getContext('2d');
        const ctx2 = canvas2.getContext('2d');

        const data1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height).data;
        const data2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height).data;

        // Calcular diferencia promedio
        let sumDiff = 0;
        let count = 0;

        for (let i = 0; i < data1.length; i += 4) {
            const pixel1 = data1[i];
            const pixel2 = data2[i];
            const diff = Math.abs(pixel1 - pixel2);
            sumDiff += diff;
            count++;
        }

        const avgDiff = sumDiff / count;

        // Convertir diferencia a similitud
        const similarity = 1 - (avgDiff / 255);

        return Math.max(0, similarity);
    }

    /**
     * Clasificar nivel de confianza
     */
    classifyConfidence(similarity) {
        if (similarity >= this.thresholds.high_confidence) {
            return 'high';
        } else if (similarity >= this.thresholds.medium_confidence) {
            return 'medium';
        } else if (similarity >= this.thresholds.low_confidence) {
            return 'low';
        } else {
            return 'very_low';
        }
    }

    // ========================================================================
    // HELPERS: Image Processing
    // ========================================================================

    ensureCanvas(imageSource) {
        if (imageSource instanceof HTMLCanvasElement) {
            return imageSource;
        }

        const canvas = document.createElement('canvas');
        canvas.width = imageSource.width || imageSource.naturalWidth;
        canvas.height = imageSource.height || imageSource.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageSource, 0, 0);
        return canvas;
    }

    toGrayscale(canvas) {
        const temp = document.createElement('canvas');
        temp.width = canvas.width;
        temp.height = canvas.height;
        const ctx = temp.getContext('2d');

        ctx.drawImage(canvas, 0, 0);
        const imageData = ctx.getImageData(0, 0, temp.width, temp.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = data[i + 1] = data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);
        return temp;
    }

    resize(canvas, width, height) {
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const ctx = temp.getContext('2d');
        ctx.drawImage(canvas, 0, 0, width, height);
        return temp;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FaceMatch;
}
