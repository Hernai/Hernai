/**
 * AntiFraudELA - Error Level Analysis
 * Detecta manipulaciones y ediciones en imágenes JPEG
 * Áreas con diferente compresión indican edición/photoshop
 */

class AntiFraudELA {
    constructor() {
        this.thresholds = {
            low_risk: 15,       // < 15% áreas sospechosas = bajo riesgo
            medium_risk: 30,    // 15-30% = riesgo medio
            high_risk: 50       // > 50% = alto riesgo de edición
        };

        this.elaQuality = 95;  // Calidad de re-compresión JPEG
    }

    /**
     * Analiza imagen con Error Level Analysis
     * @param {HTMLCanvasElement|HTMLImageElement} imageSource
     * @returns {Promise<Object>} Análisis ELA
     */
    async analyzeELA(imageSource) {
        try {
            console.log('[AntiFraudELA] Starting Error Level Analysis...');

            const canvas = this.ensureCanvas(imageSource);

            // 1. Guardar imagen original
            const original = this.cloneCanvas(canvas);

            // 2. Re-comprimir como JPEG con calidad específica
            const recompressed = await this.recompressAsJPEG(canvas, this.elaQuality);

            // 3. Calcular diferencia pixel por pixel
            const errorMap = this.calculateErrorMap(original, recompressed);

            // 4. Analizar distribución de errores
            const analysis = this.analyzeErrorDistribution(errorMap);

            // 5. Detectar regiones sospechosas
            const suspiciousRegions = this.detectSuspiciousRegions(errorMap);

            // 6. Calcular score de manipulación (0-100)
            const manipulationScore = this.calculateManipulationScore(analysis, suspiciousRegions);

            // 7. Clasificar riesgo
            const riskLevel = this.classifyRisk(manipulationScore);

            console.log(`[AntiFraudELA] Manipulation score: ${manipulationScore}, Risk: ${riskLevel}`);

            return {
                is_manipulated: manipulationScore > this.thresholds.low_risk,
                manipulation_score: Math.round(manipulationScore * 10) / 10,
                risk_level: riskLevel,
                confidence: Math.min(100, Math.round(manipulationScore * 1.5)),
                analysis: {
                    avg_error: analysis.avgError,
                    max_error: analysis.maxError,
                    std_deviation: analysis.stdDev,
                    suspicious_regions: suspiciousRegions.length,
                    high_error_percentage: analysis.highErrorPercentage
                },
                error_map: errorMap  // Mapa de errores para visualización
            };

        } catch (error) {
            console.error('[AntiFraudELA] Analysis failed:', error);
            return {
                is_manipulated: false,
                manipulation_score: 0,
                risk_level: 'unknown',
                confidence: 0,
                error: error.message
            };
        }
    }

    /**
     * Re-comprime imagen como JPEG con calidad específica
     */
    async recompressAsJPEG(canvas, quality) {
        return new Promise((resolve, reject) => {
            // Convertir a JPEG data URL
            const jpegDataURL = canvas.toDataURL('image/jpeg', quality / 100);

            // Cargar de vuelta como imagen
            const img = new Image();
            img.onload = () => {
                // Dibujar en nuevo canvas
                const temp = document.createElement('canvas');
                temp.width = canvas.width;
                temp.height = canvas.height;
                const ctx = temp.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(temp);
            };
            img.onerror = () => reject(new Error('Failed to recompress image'));
            img.src = jpegDataURL;
        });
    }

    /**
     * Calcula mapa de errores (diferencia entre original y re-comprimido)
     */
    calculateErrorMap(originalCanvas, recompressedCanvas) {
        const width = originalCanvas.width;
        const height = originalCanvas.height;

        const ctx1 = originalCanvas.getContext('2d');
        const ctx2 = recompressedCanvas.getContext('2d');

        const data1 = ctx1.getImageData(0, 0, width, height).data;
        const data2 = ctx2.getImageData(0, 0, width, height).data;

        // Calcular diferencia absoluta
        const errorMap = new Uint8Array(width * height);

        for (let i = 0; i < width * height; i++) {
            const idx = i * 4;

            // Diferencia en cada canal
            const dr = Math.abs(data1[idx] - data2[idx]);
            const dg = Math.abs(data1[idx + 1] - data2[idx + 1]);
            const db = Math.abs(data1[idx + 2] - data2[idx + 2]);

            // Error promedio (0-255)
            errorMap[i] = Math.round((dr + dg + db) / 3);
        }

        return {
            width,
            height,
            data: errorMap
        };
    }

    /**
     * Analiza distribución de errores
     */
    analyzeErrorDistribution(errorMap) {
        const { width, height, data } = errorMap;
        const totalPixels = width * height;

        // Estadísticas básicas
        let sum = 0;
        let sumSquares = 0;
        let maxError = 0;
        let highErrorCount = 0;
        const highErrorThreshold = 50; // Errores > 50 son sospechosos

        // Histograma de errores
        const histogram = new Array(256).fill(0);

        for (let i = 0; i < totalPixels; i++) {
            const error = data[i];
            sum += error;
            sumSquares += error * error;
            maxError = Math.max(maxError, error);
            histogram[error]++;

            if (error > highErrorThreshold) {
                highErrorCount++;
            }
        }

        const avgError = sum / totalPixels;
        const variance = (sumSquares / totalPixels) - (avgError * avgError);
        const stdDev = Math.sqrt(variance);
        const highErrorPercentage = (highErrorCount / totalPixels) * 100;

        // Calcular percentiles
        const sorted = Array.from(data).sort((a, b) => a - b);
        const p50 = sorted[Math.floor(totalPixels * 0.50)];
        const p90 = sorted[Math.floor(totalPixels * 0.90)];
        const p95 = sorted[Math.floor(totalPixels * 0.95)];

        return {
            avgError: Math.round(avgError * 10) / 10,
            maxError: maxError,
            stdDev: Math.round(stdDev * 10) / 10,
            highErrorPercentage: Math.round(highErrorPercentage * 100) / 100,
            histogram: histogram,
            percentiles: { p50, p90, p95 }
        };
    }

    /**
     * Detecta regiones con errores anormalmente altos (posibles ediciones)
     */
    detectSuspiciousRegions(errorMap) {
        const { width, height, data } = errorMap;
        const regions = [];

        // Crear mapa binario de píxeles sospechosos
        const suspiciousThreshold = 40;
        const binary = new Uint8Array(width * height);

        for (let i = 0; i < data.length; i++) {
            binary[i] = data[i] > suspiciousThreshold ? 1 : 0;
        }

        // Aplicar erosión/dilatación para limpiar ruido
        const cleaned = this.morphologicalOpen(binary, width, height, 3);

        // Encontrar componentes conectados (regiones)
        const visited = new Uint8Array(width * height);
        const minRegionSize = 100; // Ignorar regiones muy pequeñas

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;

                if (cleaned[idx] === 1 && !visited[idx]) {
                    // Flood fill para encontrar región
                    const region = this.floodFill(cleaned, visited, x, y, width, height);

                    if (region.size >= minRegionSize) {
                        regions.push({
                            x: region.minX,
                            y: region.minY,
                            w: region.maxX - region.minX,
                            h: region.maxY - region.minY,
                            size: region.size,
                            avgError: region.sumError / region.size
                        });
                    }
                }
            }
        }

        return regions;
    }

    /**
     * Flood fill para detectar componentes conectados
     */
    floodFill(binary, visited, startX, startY, width, height) {
        const stack = [[startX, startY]];
        const region = {
            size: 0,
            minX: startX,
            maxX: startX,
            minY: startY,
            maxY: startY,
            sumError: 0
        };

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;

            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (visited[idx] || binary[idx] === 0) continue;

            visited[idx] = 1;
            region.size++;
            region.minX = Math.min(region.minX, x);
            region.maxX = Math.max(region.maxX, x);
            region.minY = Math.min(region.minY, y);
            region.maxY = Math.max(region.maxY, y);

            // Vecinos 4-conectados
            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        }

        return region;
    }

    /**
     * Operación morfológica: Opening (erosión + dilatación)
     * Elimina ruido pequeño
     */
    morphologicalOpen(binary, width, height, kernelSize) {
        const eroded = this.erode(binary, width, height, kernelSize);
        const opened = this.dilate(eroded, width, height, kernelSize);
        return opened;
    }

    /**
     * Erosión morfológica
     */
    erode(binary, width, height, kernelSize) {
        const result = new Uint8Array(width * height);
        const offset = Math.floor(kernelSize / 2);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let min = 1;

                for (let ky = -offset; ky <= offset; ky++) {
                    for (let kx = -offset; kx <= offset; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            min = Math.min(min, binary[ny * width + nx]);
                        }
                    }
                }

                result[y * width + x] = min;
            }
        }

        return result;
    }

    /**
     * Dilatación morfológica
     */
    dilate(binary, width, height, kernelSize) {
        const result = new Uint8Array(width * height);
        const offset = Math.floor(kernelSize / 2);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let max = 0;

                for (let ky = -offset; ky <= offset; ky++) {
                    for (let kx = -offset; kx <= offset; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            max = Math.max(max, binary[ny * width + nx]);
                        }
                    }
                }

                result[y * width + x] = max;
            }
        }

        return result;
    }

    /**
     * Calcula score de manipulación (0-100)
     */
    calculateManipulationScore(analysis, suspiciousRegions) {
        let score = 0;

        // Factor 1: Porcentaje de píxeles con error alto (0-40 pts)
        score += Math.min(40, analysis.highErrorPercentage * 0.8);

        // Factor 2: Error promedio (0-20 pts)
        score += Math.min(20, analysis.avgError * 0.5);

        // Factor 3: Desviación estándar alta (0-20 pts)
        // Alta variación = posibles ediciones localizadas
        score += Math.min(20, analysis.stdDev * 0.4);

        // Factor 4: Número de regiones sospechosas (0-20 pts)
        score += Math.min(20, suspiciousRegions.length * 2);

        return Math.min(100, score);
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

    cloneCanvas(canvas) {
        const clone = document.createElement('canvas');
        clone.width = canvas.width;
        clone.height = canvas.height;
        const ctx = clone.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        return clone;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AntiFraudELA;
}
