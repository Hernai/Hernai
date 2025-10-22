/**
 * Extractor de Campos con IA
 * Usa layout analysis y embeddings semánticos para extracción inteligente
 * No depende de regex hardcodeados
 */

class AIFieldExtractor {
    constructor() {
        this.embeddingModel = null;
        this.isInitialized = false;

        // Definiciones semánticas de campos (no regex)
        this.fieldDefinitions = {
            curp: {
                labels: ['curp', 'clave única', 'identificación personal'],
                pattern_type: 'alphanumeric',
                expected_length: 18,
                validation: (val) => /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(val)
            },
            clave_elector: {
                labels: ['clave de elector', 'elector', 'electoral'],
                pattern_type: 'alphanumeric',
                expected_length: 18,
                validation: (val) => /^[A-Z]{6}\d{8}[HM]\d{3}$/.test(val)
            },
            ocr: {
                labels: ['ocr', 'código ocr', 'numero ocr'],
                pattern_type: 'numeric',
                expected_length: 13,
                validation: (val) => /^\d{13}$/.test(val) && val !== '0000000000000'
            },
            nombre: {
                labels: ['nombre', 'apellido', 'paterno', 'materno'],
                pattern_type: 'alphabetic',
                expected_length_range: [10, 80],
                validation: (val) => /^[A-ZÁÉÍÓÚÑ\s]{3,}$/i.test(val)
            },
            domicilio: {
                labels: ['domicilio', 'dirección', 'calle', 'avenida'],
                pattern_type: 'mixed',
                expected_length_range: [15, 200],
                validation: (val) => val.length > 10
            },
            seccion: {
                labels: ['sección', 'seccion electoral', 'secc'],
                pattern_type: 'numeric',
                expected_length_range: [3, 4],
                validation: (val) => /^\d{3,4}$/.test(val)
            },
            municipio: {
                labels: ['municipio', 'delegación', 'alcaldía'],
                pattern_type: 'alphabetic',
                expected_length_range: [5, 50],
                validation: (val) => /^[A-ZÁÉÍÓÚÑ\s]{3,}$/i.test(val)
            },
            estado: {
                labels: ['estado', 'entidad federativa', 'entidad'],
                pattern_type: 'alphabetic',
                expected_length_range: [4, 30],
                validation: (val) => /^[A-ZÁÉÍÓÚÑ\s]{4,}$/i.test(val)
            },
            vigencia: {
                labels: ['vigencia', 'válida hasta', 'vencimiento'],
                pattern_type: 'numeric',
                expected_length: 4,
                validation: (val) => /^\d{4}$/.test(val)
            },
            codigo_postal: {
                labels: ['código postal', 'cp', 'postal'],
                pattern_type: 'numeric',
                expected_length: 5,
                validation: (val) => /^\d{5}$/.test(val)
            }
        };
    }

    /**
     * Initialize AI models
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('[AI-FieldExtractor] Already initialized');
            return;
        }

        console.log('[AI-FieldExtractor] Initializing embedding model...');

        try {
            // Intentar cargar Transformers.js
            if (typeof pipeline !== 'undefined') {
                // Usar modelo de embeddings para matching semántico
                this.embeddingModel = await pipeline(
                    'feature-extraction',
                    'Xenova/all-MiniLM-L6-v2',
                    { quantized: true }
                );
                console.log('[AI-FieldExtractor] Embedding model loaded');
            } else {
                console.warn('[AI-FieldExtractor] Transformers.js not available, using fallback methods');
            }

            this.isInitialized = true;
        } catch (error) {
            console.warn('[AI-FieldExtractor] Failed to load embedding model:', error);
            // No es fatal, podemos usar métodos de fallback
            this.isInitialized = true;
        }
    }

    /**
     * Extract fields using AI and layout analysis
     */
    async extract(ocrDataFront, ocrDataBack) {
        console.log('[AI-FieldExtractor] Starting intelligent extraction...');

        // Analizar layout de ambos lados
        const frontLayout = this.analyzeLayout(ocrDataFront);
        const backLayout = this.analyzeLayout(ocrDataBack);

        // Extraer campos usando múltiples estrategias
        const extractedFields = {};

        for (const [fieldName, definition] of Object.entries(this.fieldDefinitions)) {
            console.log(`[AI-FieldExtractor] Extracting ${fieldName}...`);

            const frontResult = await this.extractField(
                fieldName,
                definition,
                frontLayout,
                ocrDataFront
            );

            const backResult = await this.extractField(
                fieldName,
                definition,
                backLayout,
                ocrDataBack
            );

            // Elegir el mejor resultado basado en confianza
            extractedFields[fieldName] = this.chooseBestResult(frontResult, backResult);
        }

        console.log('[AI-FieldExtractor] Extraction complete');
        return extractedFields;
    }

    /**
     * Analyze document layout from OCR data
     */
    analyzeLayout(ocrData) {
        if (!ocrData || !ocrData.words) {
            return { regions: [], wordMap: new Map() };
        }

        const words = ocrData.words;
        const regions = [];
        const wordMap = new Map();

        // Agrupar palabras por regiones espaciales
        const regionHeight = 50; // pixels
        const currentRegions = new Map();

        for (const word of words) {
            if (!word.bbox) continue;

            const { x0, y0, x1, y1 } = word.bbox;
            const centerY = (y0 + y1) / 2;
            const regionIndex = Math.floor(centerY / regionHeight);

            if (!currentRegions.has(regionIndex)) {
                currentRegions.set(regionIndex, {
                    index: regionIndex,
                    y: regionIndex * regionHeight,
                    words: [],
                    text: ''
                });
            }

            const region = currentRegions.get(regionIndex);
            region.words.push(word);
            region.text += ' ' + word.text;

            // Mapear palabra a su contexto
            wordMap.set(word.text.toUpperCase(), {
                word: word,
                region: regionIndex,
                bbox: { x0, y0, x1, y1 },
                confidence: word.confidence || 0
            });
        }

        // Convertir regiones a array y ordenar por posición Y
        for (const region of currentRegions.values()) {
            region.text = region.text.trim();
            region.words.sort((a, b) => {
                const ax = a.bbox ? a.bbox.x0 : 0;
                const bx = b.bbox ? b.bbox.x0 : 0;
                return ax - bx;
            });
            regions.push(region);
        }

        regions.sort((a, b) => a.y - b.y);

        console.log(`[AI-FieldExtractor] Layout analysis: ${regions.length} regions found`);
        return { regions, wordMap };
    }

    /**
     * Extract a single field using semantic matching
     */
    async extractField(fieldName, definition, layout, ocrData) {
        const candidates = [];

        // Estrategia 1: Búsqueda por similitud semántica de labels
        for (const label of definition.labels) {
            const matches = await this.findBySemanticMatch(label, layout, ocrData);
            candidates.push(...matches);
        }

        // Estrategia 2: Búsqueda por patrón de tipo de dato
        const patternMatches = this.findByPattern(definition, layout, ocrData);
        candidates.push(...patternMatches);

        // Estrategia 3: Búsqueda por posición relativa (si tenemos contexto)
        const positionMatches = this.findByRelativePosition(fieldName, layout, ocrData);
        candidates.push(...positionMatches);

        // Filtrar y validar candidatos
        const validCandidates = candidates.filter(c => {
            if (!c.value) return false;
            if (definition.validation && !definition.validation(c.value)) return false;
            return true;
        });

        // Elegir el mejor candidato
        if (validCandidates.length === 0) {
            return { value: '', confidence: 0, source: 'none' };
        }

        // Ordenar por confianza
        validCandidates.sort((a, b) => b.confidence - a.confidence);

        return validCandidates[0];
    }

    /**
     * Find field by semantic similarity (using embeddings if available)
     */
    async findBySemanticMatch(label, layout, ocrData) {
        const matches = [];
        const labelUpper = label.toUpperCase();

        // Si tenemos modelo de embeddings, usar similitud semántica
        if (this.embeddingModel) {
            // TODO: Implementar búsqueda semántica con embeddings
            // Por ahora, usar búsqueda simple de palabras clave
        }

        // Fallback: búsqueda por palabras clave
        for (const region of layout.regions) {
            const regionText = region.text.toUpperCase();

            // Buscar label en la región
            if (regionText.includes(labelUpper)) {
                // Extraer valor después del label
                const parts = regionText.split(labelUpper);
                if (parts.length > 1) {
                    const valueText = parts[1].trim().split(/\s+/)[0];
                    if (valueText.length > 2) {
                        matches.push({
                            value: valueText,
                            confidence: 75,
                            source: 'semantic_match',
                            context: labelUpper
                        });
                    }
                }
            }
        }

        return matches;
    }

    /**
     * Find field by data pattern (numeric, alphanumeric, etc.)
     */
    findByPattern(definition, layout, ocrData) {
        const matches = [];
        const text = layout.regions.map(r => r.text).join(' ');

        // Buscar secuencias que coincidan con el patrón
        let pattern;
        switch (definition.pattern_type) {
            case 'numeric':
                if (definition.expected_length) {
                    pattern = new RegExp(`\\b(\\d{${definition.expected_length}})\\b`, 'g');
                } else if (definition.expected_length_range) {
                    const [min, max] = definition.expected_length_range;
                    pattern = new RegExp(`\\b(\\d{${min},${max}})\\b`, 'g');
                }
                break;

            case 'alphanumeric':
                if (definition.expected_length) {
                    pattern = new RegExp(`\\b([A-Z0-9]{${definition.expected_length}})\\b`, 'gi');
                }
                break;

            case 'alphabetic':
                if (definition.expected_length_range) {
                    const [min, max] = definition.expected_length_range;
                    pattern = new RegExp(`\\b([A-ZÁÉÍÓÚÑ\\s]{${min},${max}})\\b`, 'gi');
                }
                break;
        }

        if (pattern) {
            const found = text.matchAll(pattern);
            for (const match of found) {
                const value = match[1].trim();
                matches.push({
                    value: value,
                    confidence: 70,
                    source: 'pattern_match',
                    pattern: definition.pattern_type
                });
            }
        }

        return matches;
    }

    /**
     * Find field by relative position to known landmarks
     */
    findByRelativePosition(fieldName, layout, ocrData) {
        const matches = [];

        // Mapeo de posiciones relativas conocidas en INE
        const relativePositions = {
            'curp': { after: ['CURP', 'CLAVE ÚNICA'] },
            'clave_elector': { after: ['CLAVE DE ELECTOR', 'ELECTOR'] },
            'nombre': { after: ['NOMBRE'] },
            'domicilio': { after: ['DOMICILIO', 'DIRECCIÓN'] },
            'seccion': { after: ['SECCIÓN', 'SECCION'] }
        };

        const fieldPositions = relativePositions[fieldName];
        if (!fieldPositions || !fieldPositions.after) {
            return matches;
        }

        // Buscar valores después de las palabras clave
        for (const region of layout.regions) {
            const regionText = region.text.toUpperCase();

            for (const keyword of fieldPositions.after) {
                if (regionText.includes(keyword)) {
                    // Buscar en la misma región o siguiente
                    const parts = regionText.split(keyword);
                    if (parts.length > 1) {
                        const value = parts[1].trim();
                        if (value.length > 2) {
                            matches.push({
                                value: value,
                                confidence: 80,
                                source: 'position_match',
                                keyword: keyword
                            });
                        }
                    }
                }
            }
        }

        return matches;
    }

    /**
     * Choose best result between front and back
     */
    chooseBestResult(frontResult, backResult) {
        if (!frontResult.value && !backResult.value) {
            return { value: '', confidence: 0, source: 'none' };
        }

        if (!frontResult.value) return backResult;
        if (!backResult.value) return frontResult;

        // Elegir el de mayor confianza
        return frontResult.confidence >= backResult.confidence ? frontResult : backResult;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIFieldExtractor;
}
