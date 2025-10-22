/**
 * DedupeHash - Detección de Imágenes Duplicadas
 * Usa pHash (Perceptual Hash) y aHash (Average Hash) con Hamming distance
 * Para detectar recapturas, duplicados y imágenes muy similares
 */

class DedupeHash {
    constructor() {
        this.hashCache = new Map();  // Cache de hashes calculados

        // Thresholds para clasificación
        this.thresholds = {
            identical: 0,      // 0 bits diferentes = idéntico
            duplicate: 5,      // ≤5 bits diferentes = duplicado muy probable
            similar: 15,       // ≤15 bits diferentes = similar
            different: 16      // >15 bits = diferente
        };
    }

    /**
     * Calcula pHash (Perceptual Hash) usando DCT
     * @param {HTMLCanvasElement|HTMLImageElement} imageSource
     * @returns {Promise<string>} Hash de 64 bits (hex string)
     */
    async calculatePHash(imageSource) {
        try {
            const canvas = this.ensureCanvas(imageSource);

            // 1. Convertir a escala de grises
            const grayscale = this.toGrayscale(canvas);

            // 2. Redimensionar a 32×32
            const small = this.resize(grayscale, 32, 32);

            // 3. Aplicar DCT (Discrete Cosine Transform)
            const dct = this.computeDCT(small, 32, 32);

            // 4. Calcular mediana de valores DCT (ignorar primera fila/columna)
            const dctValues = [];
            for (let y = 1; y < 9; y++) {
                for (let x = 1; x < 9; x++) {
                    dctValues.push(dct[y * 32 + x]);
                }
            }

            const median = this.median(dctValues);

            // 5. Generar hash binario (1 si > mediana, 0 si no)
            let hash = '';
            for (let i = 0; i < 64; i++) {
                const y = 1 + Math.floor(i / 8);
                const x = 1 + (i % 8);
                hash += dct[y * 32 + x] > median ? '1' : '0';
            }

            // 6. Convertir a hex para almacenamiento compacto
            const hexHash = this.binaryToHex(hash);

            console.log('[DedupeHash] pHash calculated:', hexHash);
            return hexHash;

        } catch (error) {
            console.error('[DedupeHash] pHash calculation failed:', error);
            return null;
        }
    }

    /**
     * Calcula aHash (Average Hash) - más simple que pHash
     * @param {HTMLCanvasElement|HTMLImageElement} imageSource
     * @returns {Promise<string>} Hash de 64 bits (hex string)
     */
    async calculateAHash(imageSource) {
        try {
            const canvas = this.ensureCanvas(imageSource);

            // 1. Convertir a escala de grises
            const grayscale = this.toGrayscale(canvas);

            // 2. Redimensionar a 8×8
            const small = this.resize(grayscale, 8, 8);

            // 3. Obtener píxeles
            const ctx = small.getContext('2d');
            const imageData = ctx.getImageData(0, 0, 8, 8);
            const pixels = imageData.data;

            // 4. Calcular promedio
            let sum = 0;
            for (let i = 0; i < 64; i++) {
                sum += pixels[i * 4]; // Canal R (en grayscale todos son iguales)
            }
            const average = sum / 64;

            // 5. Generar hash binario (1 si > promedio, 0 si no)
            let hash = '';
            for (let i = 0; i < 64; i++) {
                hash += pixels[i * 4] >= average ? '1' : '0';
            }

            // 6. Convertir a hex
            const hexHash = this.binaryToHex(hash);

            console.log('[DedupeHash] aHash calculated:', hexHash);
            return hexHash;

        } catch (error) {
            console.error('[DedupeHash] aHash calculation failed:', error);
            return null;
        }
    }

    /**
     * Calcula ambos hashes (pHash y aHash)
     * @param {HTMLCanvasElement|HTMLImageElement} imageSource
     * @returns {Promise<Object>} {pHash, aHash}
     */
    async calculateHashes(imageSource) {
        const pHash = await this.calculatePHash(imageSource);
        const aHash = await this.calculateAHash(imageSource);

        return { pHash, aHash };
    }

    /**
     * Calcula Hamming distance entre dos hashes
     * @param {string} hash1 - Hash en hex
     * @param {string} hash2 - Hash en hex
     * @returns {number} Número de bits diferentes (0-64)
     */
    hammingDistance(hash1, hash2) {
        if (!hash1 || !hash2 || hash1.length !== hash2.length) {
            return 64; // Máxima diferencia si inválidos
        }

        // Convertir hex a binario
        const bin1 = this.hexToBinary(hash1);
        const bin2 = this.hexToBinary(hash2);

        // Contar bits diferentes
        let distance = 0;
        for (let i = 0; i < bin1.length; i++) {
            if (bin1[i] !== bin2[i]) {
                distance++;
            }
        }

        return distance;
    }

    /**
     * Compara dos imágenes y retorna análisis de similitud
     * @param {HTMLCanvasElement|HTMLImageElement} image1
     * @param {HTMLCanvasElement|HTMLImageElement} image2
     * @returns {Promise<Object>} Análisis de similitud
     */
    async compareImages(image1, image2) {
        const hashes1 = await this.calculateHashes(image1);
        const hashes2 = await this.calculateHashes(image2);

        const pHashDistance = this.hammingDistance(hashes1.pHash, hashes2.pHash);
        const aHashDistance = this.hammingDistance(hashes1.aHash, hashes2.aHash);

        // Clasificar basado en distancia
        const classification = this.classifySimilarity(pHashDistance);

        // Calcular score (0-100, donde 100 = idéntico)
        const pHashScore = Math.max(0, 100 - (pHashDistance * 1.5625)); // 100/64
        const aHashScore = Math.max(0, 100 - (aHashDistance * 1.5625));
        const avgScore = (pHashScore + aHashScore) / 2;

        return {
            is_duplicate: pHashDistance <= this.thresholds.duplicate,
            is_similar: pHashDistance <= this.thresholds.similar,
            similarity_score: Math.round(avgScore * 10) / 10,
            classification: classification,
            distances: {
                pHash: pHashDistance,
                aHash: aHashDistance
            },
            hashes: {
                image1: hashes1,
                image2: hashes2
            }
        };
    }

    /**
     * Detecta duplicados en un conjunto de imágenes
     * @param {Array} images - Array de imágenes
     * @returns {Promise<Object>} Reporte de duplicados
     */
    async detectDuplicates(images) {
        console.log(`[DedupeHash] Analyzing ${images.length} images for duplicates...`);

        // Calcular hashes de todas las imágenes
        const hashes = [];
        for (let i = 0; i < images.length; i++) {
            const hash = await this.calculateHashes(images[i]);
            hashes.push({ index: i, ...hash });
        }

        // Comparar todas las parejas
        const duplicates = [];
        const similar = [];

        for (let i = 0; i < hashes.length; i++) {
            for (let j = i + 1; j < hashes.length; j++) {
                const distance = this.hammingDistance(hashes[i].pHash, hashes[j].pHash);

                if (distance <= this.thresholds.duplicate) {
                    duplicates.push({
                        image1: i,
                        image2: j,
                        distance: distance,
                        type: 'duplicate'
                    });
                } else if (distance <= this.thresholds.similar) {
                    similar.push({
                        image1: i,
                        image2: j,
                        distance: distance,
                        type: 'similar'
                    });
                }
            }
        }

        console.log(`[DedupeHash] Found ${duplicates.length} duplicates, ${similar.length} similar`);

        return {
            total_images: images.length,
            duplicates: duplicates,
            similar: similar,
            has_duplicates: duplicates.length > 0,
            has_similar: similar.length > 0
        };
    }

    /**
     * Clasificar similitud basada en Hamming distance
     */
    classifySimilarity(distance) {
        if (distance === this.thresholds.identical) {
            return 'identical';
        } else if (distance <= this.thresholds.duplicate) {
            return 'duplicate';
        } else if (distance <= this.thresholds.similar) {
            return 'similar';
        } else {
            return 'different';
        }
    }

    // ========================================================================
    // HELPERS: Image Processing
    // ========================================================================

    /**
     * Asegurar que tenemos un canvas
     */
    ensureCanvas(imageSource) {
        if (imageSource instanceof HTMLCanvasElement) {
            return imageSource;
        }

        // Convertir HTMLImageElement a canvas
        const canvas = document.createElement('canvas');
        canvas.width = imageSource.width || imageSource.naturalWidth;
        canvas.height = imageSource.height || imageSource.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageSource, 0, 0);
        return canvas;
    }

    /**
     * Convertir imagen a escala de grises
     */
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

    /**
     * Redimensionar canvas
     */
    resize(canvas, width, height) {
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const ctx = temp.getContext('2d');
        ctx.drawImage(canvas, 0, 0, width, height);
        return temp;
    }

    /**
     * Calcular DCT (Discrete Cosine Transform)
     * Implementación simplificada para pHash
     */
    computeDCT(canvas, width, height) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        // Obtener valores de luminancia
        const values = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            values[i] = pixels[i * 4]; // Canal R (grayscale)
        }

        // Aplicar DCT 2D
        const dct = new Float32Array(width * height);

        for (let v = 0; v < height; v++) {
            for (let u = 0; u < width; u++) {
                let sum = 0;

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const pixel = values[y * width + x];
                        const cos1 = Math.cos((Math.PI / width) * (x + 0.5) * u);
                        const cos2 = Math.cos((Math.PI / height) * (y + 0.5) * v);
                        sum += pixel * cos1 * cos2;
                    }
                }

                // Coeficientes de normalización
                const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
                const cv = v === 0 ? 1 / Math.sqrt(2) : 1;

                dct[v * width + u] = 0.25 * cu * cv * sum;
            }
        }

        return dct;
    }

    /**
     * Calcular mediana
     */
    median(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        } else {
            return sorted[mid];
        }
    }

    // ========================================================================
    // HELPERS: Hash Conversion
    // ========================================================================

    /**
     * Convertir binario a hex
     */
    binaryToHex(binary) {
        let hex = '';
        for (let i = 0; i < binary.length; i += 4) {
            const chunk = binary.substr(i, 4);
            const value = parseInt(chunk, 2);
            hex += value.toString(16);
        }
        return hex;
    }

    /**
     * Convertir hex a binario
     */
    hexToBinary(hex) {
        let binary = '';
        for (let i = 0; i < hex.length; i++) {
            const value = parseInt(hex[i], 16);
            binary += value.toString(2).padStart(4, '0');
        }
        return binary;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DedupeHash;
}
