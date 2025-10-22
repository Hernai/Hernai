/**
 * onnx-runtime.js - Wrapper para ONNX Runtime Web
 *
 * Provee inferencia para modelos ONNX:
 * - side_cls.onnx: Clasificador de lado (front/back)
 * - ine_model_cls.onnx: Clasificador de modelo (INE_2019, INE_2023, INE_v3_1)
 *
 * NOTA: Si los archivos .onnx no están presentes, usa fallbacks heurísticos.
 */

class ONNXRuntime {
    constructor() {
        this.isInitialized = false;
        this.ort = null; // ONNX Runtime Web instance
        this.sessions = {
            sideClassifier: null,
            modelClassifier: null
        };

        this.config = {
            sideModelPath: './assets/onnx/side_cls.onnx',
            modelClassifierPath: './assets/onnx/ine_model_cls.onnx',
            inputSize: 224, // MobileNetV3 típico
            useFallback: true // Si true, usa heurísticas si falla ONNX
        };

        // Clases para clasificadores
        this.classes = {
            side: ['front', 'back'],
            model: ['INE_2019', 'INE_2023', 'INE_v3_1', 'unknown']
        };
    }

    /**
     * Inicializar ONNX Runtime Web
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('[ONNX] Already initialized');
            return;
        }

        console.log('[ONNX] Initializing ONNX Runtime Web...');

        try {
            // Intentar cargar ONNX Runtime desde CDN
            if (typeof ort === 'undefined') {
                console.warn('[ONNX] ONNX Runtime no encontrado, cargando desde CDN...');
                await this.loadORTFromCDN();
            }

            this.ort = ort;

            // Cargar modelos si existen
            await this.loadModels();

            this.isInitialized = true;
            console.log('[ONNX] Initialized successfully');

        } catch (error) {
            console.error('[ONNX] Initialization failed:', error);
            console.warn('[ONNX] Usando modo fallback (heurísticas)');
            this.config.useFallback = true;
            this.isInitialized = true; // Marcar como inicializado de todos modos
        }
    }

    /**
     * Cargar ONNX Runtime desde CDN
     */
    async loadORTFromCDN() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort.min.js';
            script.onload = () => {
                console.log('[ONNX] Runtime cargado desde CDN');
                resolve();
            };
            script.onerror = () => {
                reject(new Error('No se pudo cargar ONNX Runtime desde CDN'));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Cargar modelos ONNX
     */
    async loadModels() {
        console.log('[ONNX] Loading models...');

        // Intentar cargar clasificador de lado
        try {
            const response = await fetch(this.config.sideModelPath);
            if (response.ok) {
                const modelBuffer = await response.arrayBuffer();
                this.sessions.sideClassifier = await this.ort.InferenceSession.create(modelBuffer);
                console.log('[ONNX] ✅ side_cls.onnx loaded');
            } else {
                console.warn('[ONNX] ⚠️ side_cls.onnx no encontrado, usando fallback');
            }
        } catch (error) {
            console.warn('[ONNX] ⚠️ Error loading side_cls.onnx:', error.message);
        }

        // Intentar cargar clasificador de modelo
        try {
            const response = await fetch(this.config.modelClassifierPath);
            if (response.ok) {
                const modelBuffer = await response.arrayBuffer();
                this.sessions.modelClassifier = await this.ort.InferenceSession.create(modelBuffer);
                console.log('[ONNX] ✅ ine_model_cls.onnx loaded');
            } else {
                console.warn('[ONNX] ⚠️ ine_model_cls.onnx no encontrado, usando fallback');
            }
        } catch (error) {
            console.warn('[ONNX] ⚠️ Error loading ine_model_cls.onnx:', error.message);
        }
    }

    /**
     * Clasificar lado de la credencial (front/back)
     * @param {HTMLCanvasElement|HTMLImageElement} imageElement
     * @returns {Promise<{side: string, confidence: number}>}
     */
    async classifySide(imageElement) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Si hay modelo ONNX, usarlo
        if (this.sessions.sideClassifier) {
            try {
                return await this.runSideClassifier(imageElement);
            } catch (error) {
                console.error('[ONNX] Error en clasificador de lado:', error);
                console.warn('[ONNX] Fallback a heurística');
            }
        }

        // Fallback: retornar 'unknown' para que ine-detector use heurísticas
        console.log('[ONNX] Usando fallback heurístico para lado');
        return { side: 'unknown', confidence: 0 };
    }

    /**
     * Clasificar modelo de INE
     * @param {HTMLCanvasElement|HTMLImageElement} imageElement
     * @returns {Promise<{model: string, confidence: number}>}
     */
    async classifyModel(imageElement) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Si hay modelo ONNX, usarlo
        if (this.sessions.modelClassifier) {
            try {
                return await this.runModelClassifier(imageElement);
            } catch (error) {
                console.error('[ONNX] Error en clasificador de modelo:', error);
                console.warn('[ONNX] Fallback a heurística');
            }
        }

        // Fallback: retornar 'unknown' para que se use template matching
        console.log('[ONNX] Usando fallback (template matching para modelo)');
        return { model: 'unknown', confidence: 0 };
    }

    /**
     * Ejecutar clasificador de lado
     */
    async runSideClassifier(imageElement) {
        console.log('[ONNX] Running side classifier...');

        // Preprocesar imagen
        const tensor = await this.preprocessImage(imageElement);

        // Inferencia
        const feeds = { input: tensor };
        const results = await this.sessions.sideClassifier.run(feeds);

        // Obtener output (típicamente 'output' o 'logits')
        const outputName = this.sessions.sideClassifier.outputNames[0];
        const output = results[outputName];

        // Softmax y obtener clase con mayor confianza
        const probabilities = this.softmax(output.data);
        const maxIdx = probabilities.indexOf(Math.max(...probabilities));

        return {
            side: this.classes.side[maxIdx] || 'unknown',
            confidence: probabilities[maxIdx]
        };
    }

    /**
     * Ejecutar clasificador de modelo
     */
    async runModelClassifier(imageElement) {
        console.log('[ONNX] Running model classifier...');

        // Preprocesar imagen
        const tensor = await this.preprocessImage(imageElement);

        // Inferencia
        const feeds = { input: tensor };
        const results = await this.sessions.modelClassifier.run(feeds);

        // Obtener output
        const outputName = this.sessions.modelClassifier.outputNames[0];
        const output = results[outputName];

        // Softmax y obtener clase
        const probabilities = this.softmax(output.data);
        const maxIdx = probabilities.indexOf(Math.max(...probabilities));

        return {
            model: this.classes.model[maxIdx] || 'unknown',
            confidence: probabilities[maxIdx]
        };
    }

    /**
     * Preprocesar imagen para modelo ONNX
     * @param {HTMLCanvasElement|HTMLImageElement} imageElement
     * @returns {ort.Tensor}
     */
    async preprocessImage(imageElement) {
        // Crear canvas temporal
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = this.config.inputSize;
        canvas.height = this.config.inputSize;

        // Dibujar imagen redimensionada
        ctx.drawImage(imageElement, 0, 0, this.config.inputSize, this.config.inputSize);

        // Obtener datos de imagen
        const imageData = ctx.getImageData(0, 0, this.config.inputSize, this.config.inputSize);
        const { data, width, height } = imageData;

        // Convertir a tensor [1, 3, H, W] con normalización ImageNet
        const redArray = [];
        const greenArray = [];
        const blueArray = [];

        for (let i = 0; i < data.length; i += 4) {
            // Normalización ImageNet: (x/255 - mean) / std
            redArray.push((data[i] / 255 - 0.485) / 0.229);
            greenArray.push((data[i + 1] / 255 - 0.456) / 0.224);
            blueArray.push((data[i + 2] / 255 - 0.406) / 0.225);
        }

        // Concatenar canales en formato CHW
        const floatArray = Float32Array.from([...redArray, ...greenArray, ...blueArray]);

        // Crear tensor ONNX
        return new this.ort.Tensor('float32', floatArray, [1, 3, height, width]);
    }

    /**
     * Aplicar softmax a logits
     * @param {Float32Array} logits
     * @returns {number[]}
     */
    softmax(logits) {
        const maxLogit = Math.max(...logits);
        const scores = Array.from(logits).map(l => Math.exp(l - maxLogit));
        const sum = scores.reduce((a, b) => a + b, 0);
        return scores.map(s => s / sum);
    }

    /**
     * Liberar recursos
     */
    async dispose() {
        if (this.sessions.sideClassifier) {
            await this.sessions.sideClassifier.release();
            this.sessions.sideClassifier = null;
        }
        if (this.sessions.modelClassifier) {
            await this.sessions.modelClassifier.release();
            this.sessions.modelClassifier = null;
        }
        console.log('[ONNX] Resources released');
    }
}

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ONNXRuntime;
}
