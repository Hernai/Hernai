/**
 * AntiFraudMoire - Detección de Patrones Moiré
 * Usa FFT (Fast Fourier Transform) para detectar patrones repetitivos
 * que indican recaptura de pantalla o foto de foto
 */

class AntiFraudMoire {
    constructor() {
        this.thresholds = {
            low_risk: 0.15,      // < 0.15 = bajo riesgo
            medium_risk: 0.30,   // 0.15-0.30 = riesgo medio
            high_risk: 0.50      // > 0.50 = alto riesgo de moiré
        };
    }

    /**
     * Analiza imagen en busca de patrones moiré
     * @param {HTMLCanvasElement|HTMLImageElement} imageSource
     * @returns {Promise<Object>} Análisis de moiré
     */
    async detectMoire(imageSource) {
        try {
            console.log('[AntiFraudMoire] Starting moiré detection...');

            const canvas = this.ensureCanvas(imageSource);

            // 1. Convertir a escala de grises
            const grayscale = this.toGrayscale(canvas);

            // 2. Redimensionar a tamaño manejable (256×256) para FFT
            const resized = this.resize(grayscale, 256, 256);

            // 3. Aplicar FFT 2D
            const fftResult = this.computeFFT2D(resized);

            // 4. Analizar espectro de frecuencias
            const analysis = this.analyzeFrequencySpectrum(fftResult);

            // 5. Detectar picos periódicos (indicador de moiré)
            const periodicPeaks = this.detectPeriodicPeaks(fftResult);

            // 6. Calcular score de moiré (0-1)
            const moireScore = this.calculateMoireScore(analysis, periodicPeaks);

            // 7. Clasificar riesgo
            const riskLevel = this.classifyRisk(moireScore);

            console.log(`[AntiFraudMoire] Moiré score: ${moireScore.toFixed(3)}, Risk: ${riskLevel}`);

            return {
                has_moire: moireScore > this.thresholds.low_risk,
                moire_score: Math.round(moireScore * 1000) / 1000,
                risk_level: riskLevel,
                confidence: Math.round(Math.min(100, moireScore * 200)),
                analysis: {
                    periodic_peaks: periodicPeaks.count,
                    peak_strength: periodicPeaks.maxStrength,
                    frequency_concentration: analysis.concentration,
                    high_frequency_ratio: analysis.highFreqRatio
                }
            };

        } catch (error) {
            console.error('[AntiFraudMoire] Detection failed:', error);
            return {
                has_moire: false,
                moire_score: 0,
                risk_level: 'unknown',
                confidence: 0,
                error: error.message
            };
        }
    }

    /**
     * Calcula FFT 2D (Discrete Fourier Transform)
     * Implementación usando algoritmo de Cooley-Tukey
     */
    computeFFT2D(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        const width = canvas.width;
        const height = canvas.height;

        // Extraer valores de luminancia
        const real = new Float32Array(width * height);
        const imag = new Float32Array(width * height);

        for (let i = 0; i < width * height; i++) {
            real[i] = pixels[i * 4]; // Canal R (grayscale)
            imag[i] = 0;
        }

        // Aplicar FFT a cada fila
        for (let y = 0; y < height; y++) {
            const rowReal = real.slice(y * width, (y + 1) * width);
            const rowImag = imag.slice(y * width, (y + 1) * width);

            this.fft1D(rowReal, rowImag);

            // Copiar resultado
            for (let x = 0; x < width; x++) {
                real[y * width + x] = rowReal[x];
                imag[y * width + x] = rowImag[x];
            }
        }

        // Aplicar FFT a cada columna
        for (let x = 0; x < width; x++) {
            const colReal = new Float32Array(height);
            const colImag = new Float32Array(height);

            for (let y = 0; y < height; y++) {
                colReal[y] = real[y * width + x];
                colImag[y] = imag[y * width + x];
            }

            this.fft1D(colReal, colImag);

            // Copiar resultado
            for (let y = 0; y < height; y++) {
                real[y * width + x] = colReal[y];
                imag[y * width + x] = colImag[y];
            }
        }

        // Calcular magnitud (espectro de potencia)
        const magnitude = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }

        return {
            width,
            height,
            real,
            imag,
            magnitude
        };
    }

    /**
     * FFT 1D usando algoritmo de Cooley-Tukey
     * In-place FFT, modifica los arrays directamente
     */
    fft1D(real, imag) {
        const n = real.length;

        // Bit-reversal permutation
        let j = 0;
        for (let i = 0; i < n - 1; i++) {
            if (i < j) {
                // Swap
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }

            let k = n >> 1;
            while (k <= j) {
                j -= k;
                k >>= 1;
            }
            j += k;
        }

        // Cooley-Tukey decimation-in-time radix-2 FFT
        for (let len = 2; len <= n; len <<= 1) {
            const angle = -2 * Math.PI / len;
            const wlenReal = Math.cos(angle);
            const wlenImag = Math.sin(angle);

            for (let i = 0; i < n; i += len) {
                let wReal = 1;
                let wImag = 0;

                for (let k = 0; k < len / 2; k++) {
                    const evenIdx = i + k;
                    const oddIdx = i + k + len / 2;

                    const tReal = wReal * real[oddIdx] - wImag * imag[oddIdx];
                    const tImag = wReal * imag[oddIdx] + wImag * real[oddIdx];

                    real[oddIdx] = real[evenIdx] - tReal;
                    imag[oddIdx] = imag[evenIdx] - tImag;
                    real[evenIdx] += tReal;
                    imag[evenIdx] += tImag;

                    const nextWReal = wReal * wlenReal - wImag * wlenImag;
                    const nextWImag = wReal * wlenImag + wImag * wlenReal;
                    wReal = nextWReal;
                    wImag = nextWImag;
                }
            }
        }
    }

    /**
     * Analiza el espectro de frecuencias
     */
    analyzeFrequencySpectrum(fftResult) {
        const { magnitude, width, height } = fftResult;

        // Calcular estadísticas del espectro
        let sum = 0;
        let maxMag = 0;
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // Área de bajas frecuencias (centro)
        let lowFreqSum = 0;
        let lowFreqCount = 0;

        // Área de altas frecuencias (bordes)
        let highFreqSum = 0;
        let highFreqCount = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const mag = magnitude[y * width + x];
                sum += mag;
                maxMag = Math.max(maxMag, mag);

                // Distancia desde el centro
                const dx = x - centerX;
                const dy = y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < Math.min(width, height) / 4) {
                    lowFreqSum += mag;
                    lowFreqCount++;
                } else if (dist > Math.min(width, height) / 3) {
                    highFreqSum += mag;
                    highFreqCount++;
                }
            }
        }

        const avgMag = sum / (width * height);
        const lowFreqAvg = lowFreqCount > 0 ? lowFreqSum / lowFreqCount : 0;
        const highFreqAvg = highFreqCount > 0 ? highFreqSum / highFreqCount : 0;

        // Ratio de altas frecuencias (indicador de patrones finos)
        const highFreqRatio = lowFreqAvg > 0 ? highFreqAvg / lowFreqAvg : 0;

        // Concentración de energía (indicador de periodicidad)
        const concentration = maxMag / avgMag;

        return {
            avgMagnitude: avgMag,
            maxMagnitude: maxMag,
            concentration: concentration,
            highFreqRatio: highFreqRatio,
            lowFreqAvg: lowFreqAvg,
            highFreqAvg: highFreqAvg
        };
    }

    /**
     * Detecta picos periódicos en el espectro
     * Los patrones moiré crean picos característicos
     */
    detectPeriodicPeaks(fftResult) {
        const { magnitude, width, height } = fftResult;

        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // Umbral adaptativo
        let sum = 0;
        for (let i = 0; i < magnitude.length; i++) {
            sum += magnitude[i];
        }
        const avg = sum / magnitude.length;
        const threshold = avg * 3; // Picos deben ser 3× el promedio

        // Buscar picos fuera del centro (DC component)
        const peaks = [];
        const minDistFromCenter = Math.min(width, height) / 8;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dx = x - centerX;
                const dy = y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Ignorar centro y muy cerca del centro
                if (dist < minDistFromCenter) continue;

                const mag = magnitude[y * width + x];

                if (mag > threshold) {
                    peaks.push({
                        x: x,
                        y: y,
                        magnitude: mag,
                        distance: dist,
                        angle: Math.atan2(dy, dx)
                    });
                }
            }
        }

        // Ordenar por magnitud
        peaks.sort((a, b) => b.magnitude - a.magnitude);

        // Detectar simetría (indicador de moiré)
        let symmetricPairs = 0;
        for (let i = 0; i < Math.min(10, peaks.length); i++) {
            const peak = peaks[i];

            // Buscar pico simétrico (opuesto al centro)
            const targetX = 2 * centerX - peak.x;
            const targetY = 2 * centerY - peak.y;

            for (let j = i + 1; j < peaks.length; j++) {
                const otherPeak = peaks[j];
                const dx = targetX - otherPeak.x;
                const dy = targetY - otherPeak.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 5) {
                    symmetricPairs++;
                    break;
                }
            }
        }

        return {
            count: peaks.length,
            maxStrength: peaks.length > 0 ? peaks[0].magnitude / avg : 0,
            symmetricPairs: symmetricPairs,
            topPeaks: peaks.slice(0, 5)
        };
    }

    /**
     * Calcula score de moiré (0-1)
     */
    calculateMoireScore(analysis, periodicPeaks) {
        let score = 0;

        // Factor 1: Número de picos periódicos (0-0.3)
        const peakFactor = Math.min(0.3, periodicPeaks.count / 50);
        score += peakFactor;

        // Factor 2: Fuerza de picos (0-0.3)
        const strengthFactor = Math.min(0.3, periodicPeaks.maxStrength / 30);
        score += strengthFactor;

        // Factor 3: Pares simétricos (0-0.2)
        const symmetryFactor = Math.min(0.2, periodicPeaks.symmetricPairs / 5);
        score += symmetryFactor;

        // Factor 4: Ratio de altas frecuencias (0-0.2)
        const highFreqFactor = Math.min(0.2, analysis.highFreqRatio / 2);
        score += highFreqFactor;

        return Math.min(1.0, score);
    }

    /**
     * Clasificar nivel de riesgo
     */
    classifyRisk(score) {
        if (score < this.thresholds.low_risk) {
            return 'low';
        } else if (score < this.thresholds.medium_risk) {
            return 'medium';
        } else if (score < this.thresholds.high_risk) {
            return 'high';
        } else {
            return 'critical';
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
    module.exports = AntiFraudMoire;
}
