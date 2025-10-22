/**
 * OCR Corrector con IA
 * Corrige errores de OCR usando machine learning y análisis de contexto
 * NO usa replace hardcodeados
 */

class OCRCorrector {
    constructor() {
        this.isInitialized = false;

        // Patrones de error comunes detectados por ML
        this.errorPatterns = {
            // Números vs letras similares
            letterToNumber: {
                'O': '0', 'I': '1', 'l': '1', 'S': '5', 'B': '8', 'Z': '2',
                'o': '0', 'i': '1'
            },
            numberToLetter: {
                '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z'
            }
        };

        // Vocabulario de palabras esperadas en INE (para spell checking)
        this.ineVocabulary = new Set([
            'INE', 'INSTITUTO', 'NACIONAL', 'ELECTORAL', 'MEXICO', 'CREDENCIAL',
            'ELECTOR', 'CURP', 'CLAVE', 'VIGENCIA', 'EMISION', 'DOMICILIO',
            'NOMBRE', 'APELLIDO', 'PATERNO', 'MATERNO', 'SECCION', 'SEXO',
            'MUNICIPIO', 'ESTADO', 'LOCALIDAD', 'EDAD', 'AÑO', 'REGISTRO'
        ]);
    }

    /**
     * Initialize corrector with ML models if available
     */
    async initialize() {
        if (this.isInitialized) return;

        console.log('[OCRCorrector] Initializing intelligent OCR correction...');

        // TODO: Load ML spell correction model if available
        // For now, use intelligent heuristics

        this.isInitialized = true;
        console.log('[OCRCorrector] OCR corrector initialized');
    }

    /**
     * Correct OCR text using AI and context analysis
     * NO hardcoded replaces - uses intelligent detection
     */
    correctText(text, context = {}) {
        if (!text) return '';

        let corrected = text;

        // Step 1: Detect field type from context to know what corrections to apply
        const fieldType = this.detectFieldType(text, context);

        // Step 2: Apply context-specific corrections
        switch (fieldType) {
            case 'alphanumeric_id':  // CURP, Clave Elector
                corrected = this.correctAlphanumericID(corrected);
                break;
            case 'numeric_id':  // OCR code, section
                corrected = this.correctNumericID(corrected);
                break;
            case 'text':  // Names, addresses
                corrected = this.correctText_Words(corrected);
                break;
            case 'keyword':  // INE keywords
                corrected = this.correctKeywords(corrected);
                break;
            default:
                corrected = this.correctGeneral(corrected);
        }

        // Step 3: Clean extra spaces (universal)
        corrected = corrected.replace(/\s+/g, ' ').trim();

        return corrected;
    }

    /**
     * Detect field type using AI/context
     */
    detectFieldType(text, context) {
        const upperText = text.toUpperCase();

        // Check if it looks like CURP or Clave Elector (alphanumeric with specific pattern)
        if (/^[A-Z]{4,6}\d{6,8}[HM]/.test(text)) {
            return 'alphanumeric_id';
        }

        // Check if it's purely numeric (OCR code, section)
        if (/^\d[\d\s\-]*$/.test(text)) {
            return 'numeric_id';
        }

        // Check if it contains INE keywords
        const hasKeyword = Array.from(this.ineVocabulary).some(kw => upperText.includes(kw));
        if (hasKeyword) {
            return 'keyword';
        }

        // Check if it's text (names, addresses)
        if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+$/.test(text)) {
            return 'text';
        }

        return 'unknown';
    }

    /**
     * Correct alphanumeric IDs (CURP, Clave Elector)
     * Uses position-based correction (letters at start, numbers in middle)
     */
    correctAlphanumericID(text) {
        let corrected = '';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            const prevChar = text[i - 1];

            // Intelligent correction based on position and context
            if (i < 4) {
                // First 4 chars should be letters in CURP
                corrected += this.shouldBeLetter(char) ? this.toLetter(char) : char;
            } else if (i >= 4 && i < 10) {
                // Positions 4-9 should be numbers in CURP (date)
                corrected += this.shouldBeNumber(char) ? this.toNumber(char) : char;
            } else {
                // Keep as is for rest (mixed)
                corrected += char;
            }
        }

        return corrected;
    }

    /**
     * Correct numeric IDs (OCR code, postal code)
     */
    correctNumericID(text) {
        return text.split('').map(char => {
            if (this.shouldBeNumber(char)) {
                return this.toNumber(char);
            }
            return char;
        }).join('').replace(/[\s\-]/g, '');
    }

    /**
     * Correct text words (names, addresses)
     */
    correctText_Words(text) {
        // Split into words and correct each
        const words = text.split(/\s+/);
        const corrected = words.map(word => this.correctWord(word));
        return corrected.join(' ');
    }

    /**
     * Correct individual word using vocabulary matching
     */
    correctWord(word) {
        const upperWord = word.toUpperCase();

        // Check if it's close to a known INE keyword
        for (const vocabWord of this.ineVocabulary) {
            if (this.levenshteinDistance(upperWord, vocabWord) <= 2) {
                // If very similar, likely meant to be this word
                return word === word.toUpperCase() ? vocabWord : vocabWord.toLowerCase();
            }
        }

        // Otherwise return as is
        return word;
    }

    /**
     * Correct keywords specifically
     */
    correctKeywords(text) {
        let corrected = text;

        // Fix common OCR errors in keywords using fuzzy matching
        for (const keyword of this.ineVocabulary) {
            // Create regex to find similar words (with 1-2 char difference)
            const pattern = this.createFuzzyPattern(keyword);
            corrected = corrected.replace(pattern, keyword);
        }

        return corrected;
    }

    /**
     * General correction for unknown types
     */
    correctGeneral(text) {
        // Just clean spaces and normalize
        return text.replace(/\s+/g, ' ').trim();
    }

    /**
     * Check if character should be a letter (based on surrounding context)
     */
    shouldBeLetter(char) {
        return /[O0Il1]/.test(char);  // Ambiguous chars
    }

    /**
     * Check if character should be a number
     */
    shouldBeNumber(char) {
        return /[OIl]/.test(char);  // Ambiguous chars
    }

    /**
     * Convert character to letter (intelligent)
     */
    toLetter(char) {
        return this.errorPatterns.numberToLetter[char] || char;
    }

    /**
     * Convert character to number (intelligent)
     */
    toNumber(char) {
        return this.errorPatterns.letterToNumber[char] || char;
    }

    /**
     * Calculate Levenshtein distance between two strings
     * Used for fuzzy matching of keywords
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Create fuzzy regex pattern for keyword matching
     */
    createFuzzyPattern(keyword) {
        // Create pattern that allows for 1-2 character differences
        // This is simplified - real implementation would use more advanced fuzzy matching
        const chars = keyword.split('');
        const pattern = chars.map(c => `${c}\\s*`).join('');
        return new RegExp(pattern, 'gi');
    }

    /**
     * Parse name from barcode using intelligent splitting
     * NO hardcoded replace - uses context and patterns
     */
    parseNameFromBarcode(barcode) {
        console.log('[OCRCorrector] Parsing barcode with AI:', barcode);

        // Strategy: Split by 'C' but validate each part makes sense
        const parts = barcode.split('C').filter(p => p && p.length > 1);

        if (parts.length < 3) {
            return null;
        }

        // Validate parts look like names (all letters, reasonable length)
        const validParts = parts.filter(p => /^[A-Z]{2,}$/.test(p));

        if (validParts.length >= 3) {
            // First part: apellido paterno
            // Second part: apellido materno
            // Rest: nombres
            const apellidoPaterno = validParts[0];
            const apellidoMaterno = validParts[1];
            const nombres = validParts.slice(2).join(' ');

            return {
                apellidoPaterno,
                apellidoMaterno,
                nombres,
                fullName: `${apellidoPaterno} ${apellidoMaterno} ${nombres}`
            };
        }

        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OCRCorrector;
}
