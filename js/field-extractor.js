/**
 * Extractor de Campos de INE
 * Extrae campos específicos del texto OCR
 */

class FieldExtractor {
    constructor() {
        // Patrones regex para cada campo (más tolerantes)
        this.patterns = {
            CURP: {
                // Permite espacios opcionales: AAAA 123456 H XXXXX X 1
                regex: /[A-Z]{4}\s?\d{6}\s?[HM]\s?[A-Z]{5}\s?[A-Z0-9]\s?\d/g,
                cleanRegex: /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/g,
                validator: this.validateCURP,
                priority: 10
            },
            CLAVE_ELECTOR: {
                // Permite espacios opcionales: AAAAAA 12345678 H 123
                regex: /[A-Z]{6}\s?\d{8}\s?[HM]\s?\d{3}/g,
                cleanRegex: /[A-Z]{6}\d{8}[HM]\d{3}/g,
                validator: this.validateClaveElector,
                priority: 10
            },
            OCR: {
                // Permite espacios/guiones entre números
                regex: /\d[\d\s\-]{11,15}\d/g,
                cleanRegex: /\d{13}/g,
                validator: this.validateOCR,
                priority: 9
            },
            CIC: {
                regex: /\b\d{9}\b/g,
                validator: this.validateCIC,
                priority: 7
            },
            REGISTRO_FEDERAL: {
                regex: /\b\d{10}\b/g,
                validator: null,
                priority: 5
            },
            CODIGO_POSTAL: {
                regex: /\b\d{5}\b/g,
                validator: this.validateCodigoPostal,
                priority: 6
            },
            ANIO: {
                regex: /\b(19|20)\d{2}\b/g,
                validator: null,
                priority: 3
            },
            VIGENCIA: {
                regex: /(?:VIGENCIA|VIG\.?)\s*:?\s*(20\d{2})/gi,
                validator: null,
                priority: 8
            },
            EMISION: {
                regex: /(?:EMISION|EMIS\.?)\s*:?\s*(20\d{2})/gi,
                validator: null,
                priority: 7
            }
        };

        // Estados de México
        this.estados = [
            'AGUASCALIENTES', 'BAJA CALIFORNIA', 'BAJA CALIFORNIA SUR', 'CAMPECHE',
            'CHIAPAS', 'CHIHUAHUA', 'CIUDAD DE MEXICO', 'COAHUILA', 'COLIMA',
            'DISTRITO FEDERAL', 'DURANGO', 'ESTADO DE MEXICO', 'GUANAJUATO',
            'GUERRERO', 'HIDALGO', 'JALISCO', 'MEXICO', 'MICHOACAN', 'MORELOS',
            'NAYARIT', 'NUEVO LEON', 'OAXACA', 'PUEBLA', 'QUERETARO',
            'QUINTANA ROO', 'SAN LUIS POTOSI', 'SINALOA', 'SONORA', 'TABASCO',
            'TAMAULIPAS', 'TLAXCALA', 'VERACRUZ', 'YUCATAN', 'ZACATECAS'
        ];

        // Palabras clave para identificar secciones
        this.keywords = {
            nombre: ['NOMBRE', 'APELLIDO', 'PATERNO', 'MATERNO'],
            domicilio: ['DOMICILIO', 'CALLE', 'COLONIA', 'MUNICIPIO', 'LOCALIDAD'],
            seccion: ['SECCION', 'SECC'],
            municipio: ['MUNICIPIO', 'MPIO', 'MUN'],
            localidad: ['LOCALIDAD', 'LOC']
        };
    }

    /**
     * Normalize OCR text - fix common OCR errors
     */
    normalizeOCRText(text) {
        if (!text) return '';

        let normalized = text;

        // Fix common OCR mistakes
        const corrections = {
            // Numbers that look like letters
            'O': '0',  // O → 0 in numeric contexts
            'I': '1',  // I → 1 in numeric contexts
            'l': '1',  // lowercase L → 1
            'S': '5',  // S → 5 in some fonts
            'B': '8',  // B → 8 in some cases
            // Special characters
            '|': 'I',  // pipe → I
            '¡': 'I',
            '°': '0',
            'º': '0'
        };

        // Apply corrections in numeric-heavy regions (CURP, Clave Elector, etc.)
        normalized = normalized.replace(/[A-Z]{4}[O|Il]{6}[HM][A-Z]{5}[A-Z0-9][O|Il]/g, (match) => {
            return match.replace(/O/g, '0').replace(/I/g, '1').replace(/l/g, '1');
        });

        // Fix common mistakes in Clave de Elector
        normalized = normalized.replace(/[A-Z]{6}[O|Il]{8}[HM][O|Il]{3}/g, (match) => {
            return match.replace(/O/g, '0').replace(/I/g, '1').replace(/l/g, '1');
        });

        // Remove extra spaces
        normalized = normalized.replace(/\s+/g, ' ');

        // Fix common word breaks
        normalized = normalized.replace(/C\s*L\s*A\s*V\s*E/gi, 'CLAVE');
        normalized = normalized.replace(/C\s*U\s*R\s*P/gi, 'CURP');
        normalized = normalized.replace(/E\s*L\s*E\s*C\s*T\s*O\s*R/gi, 'ELECTOR');
        normalized = normalized.replace(/V\s*I\s*G\s*E\s*N\s*C\s*I\s*A/gi, 'VIGENCIA');
        normalized = normalized.replace(/E\s*M\s*I\s*S\s*I\s*O\s*N/gi, 'EMISION');
        normalized = normalized.replace(/S\s*E\s*C\s*C\s*I\s*O\s*N/gi, 'SECCION');

        // Normalize whitespace
        normalized = normalized.trim();

        console.log('[FieldExtractor] Text normalized');
        return normalized;
    }

    /**
     * Extract all fields from OCR text
     */
    extract(ocrDataFront, ocrDataBack) {
        console.log('[FieldExtractor] Extracting fields from INE...');

        // Normalize and clean OCR text
        const textFront = this.normalizeOCRText(ocrDataFront.text);
        const textBack = this.normalizeOCRText(ocrDataBack.text);
        const combinedText = textFront + '\n' + textBack;

        // Detect model first
        const model = this.detectModel(combinedText);
        const fieldLocations = this.getModelFieldLocations(model);

        const extractedData = {
            metadata: {
                extraction_date: new Date().toISOString(),
                ocr_confidence_front: ocrDataFront.confidence || 0,
                ocr_confidence_back: ocrDataBack.confidence || 0,
                ocr_confidence_avg: ((ocrDataFront.confidence || 0) + (ocrDataBack.confidence || 0)) / 2,
                model: model,
                model_details: fieldLocations,
                version: '1.0.1'
            },
            personal_data: this.extractPersonalData(textFront, textBack, ocrDataFront, fieldLocations),
            electoral_data: this.extractElectoralData(textFront, textBack, ocrDataFront, ocrDataBack, fieldLocations),
            address: this.extractAddress(textFront, ocrDataFront),
            raw_text: {
                front: textFront,
                back: textBack
            }
        };

        // Validate extraction quality
        extractedData.quality = this.assessQuality(extractedData);

        console.log('[FieldExtractor] Extraction complete');
        return extractedData;
    }

    /**
     * Extract personal data
     */
    extractPersonalData(textFront, textBack, ocrData, fieldLocations) {
        // Search for CURP in correct side based on model
        const curpText = fieldLocations.curp_side === 'front' ? textFront : textBack;
        const curpMatch = this.extractField('CURP', curpText);
        const curp = curpMatch ? curpMatch.value : '';

        // Extract name (usually on front)
        const nombreText = fieldLocations.nombre_side === 'front' ? textFront : textBack;
        const lines = nombreText.split('\n').map(l => l.trim()).filter(l => l);
        let nombre = this.extractName(lines);

        // Extract birth date and sex from CURP
        let fechaNacimiento = '';
        let sexo = '';
        let entidadNacimiento = '';

        if (curp) {
            const birthInfo = this.extractFromCURP(curp);
            fechaNacimiento = birthInfo.fecha_nacimiento;
            sexo = birthInfo.sexo;
            entidadNacimiento = birthInfo.entidad_nacimiento;
        }

        return {
            nombre_completo: {
                valor: nombre,
                confianza: this.calculateNameConfidence(nombre, ocrData),
                fuente: 'ocr',
                obligatorio: true
            },
            curp: {
                valor: curp,
                confianza: curpMatch ? curpMatch.confidence : 0,
                valido: curp ? this.validateCURP(curp) : false,
                fuente: 'ocr',
                obligatorio: true
            },
            fecha_nacimiento: {
                valor: fechaNacimiento,
                confianza: curp ? 95 : 0,
                fuente: 'curp',
                obligatorio: true
            },
            sexo: {
                valor: sexo,
                confianza: curp ? 98 : 0,
                fuente: 'curp',
                obligatorio: true
            },
            entidad_nacimiento: {
                valor: entidadNacimiento,
                confianza: curp ? 90 : 0,
                fuente: 'curp',
                obligatorio: false
            }
        };
    }

    /**
     * Extract electoral data
     */
    extractElectoralData(textFront, textBack, ocrDataFront, ocrDataBack, fieldLocations) {
        // Search in correct side based on model
        const combinedText = textFront + '\n' + textBack;
        const claveText = fieldLocations.clave_elector_side === 'back' ? textBack : combinedText;
        const ocrText = fieldLocations.ocr_side === 'back' ? textBack : combinedText;

        const claveElectorMatch = this.extractField('CLAVE_ELECTOR', claveText);
        const ocrMatch = this.extractField('OCR', ocrText);
        const cicMatch = this.extractField('CIC', combinedText);

        // Extract years (emission and vigencia) - usually on back
        const vigenciaText = fieldLocations.vigencia_side === 'back' ? textBack : combinedText;
        const years = vigenciaText.match(/20\d{2}/g) || [];
        const vigenciaMatch = vigenciaText.match(this.patterns.VIGENCIA.regex);
        const emisionMatch = vigenciaText.match(this.patterns.EMISION.regex);

        let anoEmision = '';
        let vigencia = '';

        if (emisionMatch) {
            anoEmision = emisionMatch[1] || emisionMatch[0].match(/20\d{2}/)[0];
        } else if (years.length > 0) {
            anoEmision = years[0];
        }

        if (vigenciaMatch) {
            vigencia = vigenciaMatch[1] || vigenciaMatch[0].match(/20\d{2}/)[0];
        } else if (years.length > 1) {
            vigencia = years[1];
        }

        // Extract seccion (usually on back)
        const seccion = this.extractSeccion(combinedText);

        return {
            clave_elector: {
                valor: claveElectorMatch ? claveElectorMatch.value : '',
                confianza: claveElectorMatch ? claveElectorMatch.confidence : 0,
                valido: claveElectorMatch ? this.validateClaveElector(claveElectorMatch.value) : false,
                fuente: 'ocr',
                obligatorio: true
            },
            ocr: {
                valor: ocrMatch ? ocrMatch.value : '',
                confianza: ocrMatch ? ocrMatch.confidence : 0,
                valido: ocrMatch ? this.validateOCR(ocrMatch.value) : false,
                fuente: 'ocr',
                obligatorio: true
            },
            cic: {
                valor: cicMatch ? cicMatch.value : '',
                confianza: cicMatch ? cicMatch.confidence : 0,
                valido: cicMatch ? this.validateCIC(cicMatch.value) : false,
                fuente: 'ocr',
                obligatorio: false
            },
            ano_emision: {
                valor: anoEmision,
                confianza: emisionMatch ? 90 : (anoEmision ? 70 : 0),
                fuente: 'ocr',
                obligatorio: true
            },
            vigencia: {
                valor: vigencia,
                confianza: vigenciaMatch ? 90 : (vigencia ? 70 : 0),
                fuente: 'ocr',
                obligatorio: true
            },
            seccion: {
                valor: seccion,
                confianza: seccion ? 85 : 0,
                fuente: 'ocr',
                obligatorio: true
            }
        };
    }

    /**
     * Extract address data
     */
    extractAddress(text, ocrData) {
        const cpMatch = this.extractField('CODIGO_POSTAL', text);
        const estado = this.extractEstado(text);
        const municipio = this.extractMunicipio(text);
        const localidad = this.extractLocalidad(text);
        const domicilioCompleto = this.extractDomicilioCompleto(text);

        return {
            visible: true,
            domicilio_completo: {
                valor: domicilioCompleto,
                confianza: domicilioCompleto ? 70 : 0,
                fuente: 'ocr',
                obligatorio: false
            },
            codigo_postal: {
                valor: cpMatch ? cpMatch.value : '',
                confianza: cpMatch ? cpMatch.confidence : 0,
                valido: cpMatch ? this.validateCodigoPostal(cpMatch.value) : false,
                fuente: 'ocr',
                obligatorio: false
            },
            estado: {
                valor: estado,
                confianza: estado ? 90 : 0,
                fuente: 'ocr',
                obligatorio: true
            },
            municipio: {
                valor: municipio,
                confianza: municipio ? 80 : 0,
                fuente: 'ocr',
                obligatorio: true
            },
            localidad: {
                valor: localidad,
                confianza: localidad ? 75 : 0,
                fuente: 'ocr',
                obligatorio: false
            }
        };
    }

    /**
     * Extract full address text
     */
    extractDomicilioCompleto(text) {
        const lines = text.split('\n').map(l => l.trim());
        const addressLines = [];

        // Look for lines after DOMICILIO keyword
        let foundDomicilio = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const upperLine = line.toUpperCase();

            if (upperLine.includes('DOMICILIO') || upperLine.includes('DIRECCION')) {
                foundDomicilio = true;
                // Take current line if it has address data
                const cleaned = line.replace(/DOMICILIO|DIRECCION/gi, '').trim();
                if (cleaned && cleaned.length > 5) {
                    addressLines.push(cleaned);
                }
                continue;
            }

            // If we found DOMICILIO, take next 2-3 lines that look like address
            if (foundDomicilio && addressLines.length < 3) {
                // Skip lines with common non-address keywords
                if (/CURP|CLAVE|ELECTOR|VIGENCIA|EMISION|REGISTRO|INE|FEDERAL/i.test(line)) {
                    break;
                }

                // Take lines that look like address (letters, numbers, basic punctuation)
                if (/[A-Z0-9]/i.test(line) && line.length > 3) {
                    addressLines.push(line);
                }
            }

            // Stop after collecting enough or hitting next section
            if (addressLines.length >= 3 || (foundDomicilio && /CURP|CLAVE|SECCION/.test(upperLine))) {
                break;
            }
        }

        return addressLines.join(', ').trim();
    }

    /**
     * Extract a specific field using pattern
     */
    extractField(fieldName, text) {
        const pattern = this.patterns[fieldName];
        if (!pattern) return null;

        const matches = text.match(pattern.regex);
        if (!matches || matches.length === 0) return null;

        // Clean matches (remove spaces, hyphens)
        const cleanedMatches = matches.map(m => m.replace(/[\s\-]/g, ''));

        // Take the first match (or best match if validator exists)
        let bestMatch = cleanedMatches[0];
        let bestConfidence = 85;

        if (pattern.validator) {
            for (const match of cleanedMatches) {
                if (pattern.validator.call(this, match)) {
                    bestMatch = match;
                    bestConfidence = 95;
                    break;
                }
            }
        }

        return {
            value: bestMatch,
            confidence: bestConfidence,
            matches: cleanedMatches
        };
    }

    /**
     * Extract name from lines
     */
    extractName(lines) {
        const fullText = lines.join('\n');

        // Strategy 1: Look for keywords + name pattern
        const namePatterns = [
            /(?:NOMBRE|NAME)\s*[:.]?\s*([A-ZÁÉÍÓÚÑ\s]+)/i,
            /(?:APELLIDO\s*PATERNO|PATERNAL)\s*[:.]?\s*([A-ZÁÉÍÓÚÑ]+)/i,
            /(?:APELLIDO\s*MATERNO|MATERNAL)\s*[:.]?\s*([A-ZÁÉÍÓÚÑ]+)/i
        ];

        const nameParts = [];
        for (const pattern of namePatterns) {
            const match = fullText.match(pattern);
            if (match && match[1]) {
                nameParts.push(match[1].trim());
            }
        }

        if (nameParts.length > 0) {
            return nameParts.join(' ').trim();
        }

        // Strategy 2: Look for lines with 3+ uppercase words (likely full name)
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const line = lines[i].trim();
            const words = line.split(/\s+/).filter(w => /^[A-ZÁÉÍÓÚÑ]{2,}$/.test(w));
            if (words.length >= 2 && words.length <= 4) {
                // Likely apellido paterno, materno, nombre(s)
                return words.join(' ');
            }
        }

        // Strategy 3: First lines that are mostly letters
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i].trim();
            // Remove common labels
            const cleaned = line
                .replace(/NOMBRE|APELLIDO|PATERNO|MATERNO/gi, '')
                .replace(/[:\.,]/g, '')
                .trim();

            if (/^[A-ZÁÉÍÓÚÑ\s]{5,}$/i.test(cleaned)) {
                return cleaned;
            }
        }

        // Strategy 4: Fallback - join first few name-like lines
        const nameLines = [];
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            const cleaned = lines[i]
                .replace(/NOMBRE|APELLIDO|PATERNO|MATERNO|CURP|CLAVE/gi, '')
                .replace(/[^A-ZÁÉÍÓÚÑ\s]/gi, '')
                .trim();

            if (cleaned && /[A-ZÁÉÍÓÚÑ]{3,}/i.test(cleaned)) {
                nameLines.push(cleaned);
            }
        }

        return nameLines.join(' ').trim();
    }

    /**
     * Extract information from CURP
     */
    extractFromCURP(curp) {
        if (!curp || curp.length !== 18) {
            return { fecha_nacimiento: '', sexo: '', entidad_nacimiento: '' };
        }

        // CURP format: AAAA######HSSXXX##
        // Positions: 4-9 = YYMMDD, 10 = H/M, 11-12 = Estado
        const year = curp.substring(4, 6);
        const month = curp.substring(6, 8);
        const day = curp.substring(8, 10);
        const yearFull = parseInt(year) > 50 ? '19' + year : '20' + year;
        const fecha_nacimiento = `${yearFull}-${month}-${day}`;

        const sexo = curp.charAt(10) === 'H' ? 'Hombre' : 'Mujer';

        // Estado codes (simplified)
        const estadoCodes = {
            'AS': 'AGUASCALIENTES', 'BC': 'BAJA CALIFORNIA', 'BS': 'BAJA CALIFORNIA SUR',
            'CC': 'CAMPECHE', 'CS': 'CHIAPAS', 'CH': 'CHIHUAHUA', 'CL': 'COAHUILA',
            'CM': 'COLIMA', 'DF': 'DISTRITO FEDERAL', 'DG': 'DURANGO', 'GT': 'GUANAJUATO',
            'GR': 'GUERRERO', 'HG': 'HIDALGO', 'JC': 'JALISCO', 'MC': 'MEXICO',
            'MN': 'MICHOACAN', 'MS': 'MORELOS', 'NT': 'NAYARIT', 'NL': 'NUEVO LEON',
            'OC': 'OAXACA', 'PL': 'PUEBLA', 'QT': 'QUERETARO', 'QR': 'QUINTANA ROO',
            'SP': 'SAN LUIS POTOSI', 'SL': 'SINALOA', 'SR': 'SONORA', 'TC': 'TABASCO',
            'TS': 'TAMAULIPAS', 'TL': 'TLAXCALA', 'VZ': 'VERACRUZ', 'YN': 'YUCATAN',
            'ZS': 'ZACATECAS', 'NE': 'EXTRANJERO'
        };

        const estadoCode = curp.substring(11, 13);
        const entidad_nacimiento = estadoCodes[estadoCode] || '';

        return { fecha_nacimiento, sexo, entidad_nacimiento };
    }

    /**
     * Extract estado
     */
    extractEstado(text) {
        const upperText = text.toUpperCase();
        for (const estado of this.estados) {
            if (upperText.includes(estado)) {
                return estado;
            }
        }
        return '';
    }

    /**
     * Extract municipio
     */
    extractMunicipio(text) {
        const lines = text.split('\n');
        for (const line of lines) {
            const upperLine = line.toUpperCase();
            if (this.keywords.municipio.some(kw => upperLine.includes(kw))) {
                // Extract the line after keyword
                const parts = line.split(/MUNICIPIO|MPIO|MUN/i);
                if (parts.length > 1) {
                    return parts[1].trim().replace(/[^A-ZÁÉÍÓÚÑ\s]/gi, '');
                }
            }
        }
        return '';
    }

    /**
     * Extract localidad
     */
    extractLocalidad(text) {
        const lines = text.split('\n');
        for (const line of lines) {
            const upperLine = line.toUpperCase();
            if (this.keywords.localidad.some(kw => upperLine.includes(kw))) {
                const parts = line.split(/LOCALIDAD|LOC/i);
                if (parts.length > 1) {
                    return parts[1].trim().replace(/[^A-ZÁÉÍÓÚÑ\s]/gi, '');
                }
            }
        }
        return '';
    }

    /**
     * Extract seccion
     */
    extractSeccion(text) {
        const match = text.match(/(?:SECCION|SECC|SEC)\s*:?\s*(\d{3,4})/i);
        return match ? match[1] : '';
    }

    /**
     * Detect INE model with detailed analysis
     */
    detectModel(text) {
        const upperText = text.toUpperCase();
        const hasCURP = /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/.test(text);
        const hasClaveElector = /[A-Z]{6}\d{8}[HM]\d{3}/.test(text);
        const hasOCR13 = /\d{13}/.test(text);
        const hasCIC9 = /\d{9}/.test(text);

        // Model H (2019-present): Latest model
        if (upperText.includes('DESDE EL EXTRANJERO') || upperText.includes('FROM ABROAD')) {
            return 'H';
        }

        // Model G/H (2013-present): OCR code 13 digits
        if (hasOCR13 && hasCURP && hasClaveElector) {
            // Check for security features that differentiate G vs H
            if (upperText.includes('IDMEX') || upperText.match(/20(19|2[0-9])/)) {
                return 'H';
            }
            return 'G';
        }

        // Model F (2008-2013): CIC code 9 digits, CURP on back
        if (hasCIC9 && hasClaveElector) {
            return 'F';
        }

        // Model E (1999-2008): Similar to D, no CIC
        if (hasClaveElector && !hasCIC9 && !hasOCR13) {
            return 'E';
        }

        // Older models or unknown
        if (hasClaveElector) {
            return 'C/D/E (antiguo)';
        }

        return 'Desconocido';
    }

    /**
     * Get field locations based on INE model
     */
    getModelFieldLocations(model) {
        const locations = {
            'H': {
                curp_side: 'front',
                nombre_side: 'front',
                domicilio_side: 'front',
                clave_elector_side: 'back',
                ocr_side: 'back',
                vigencia_side: 'back'
            },
            'G': {
                curp_side: 'front',
                nombre_side: 'front',
                domicilio_side: 'front',
                clave_elector_side: 'back',
                ocr_side: 'back',
                vigencia_side: 'back'
            },
            'F': {
                curp_side: 'back',
                nombre_side: 'front',
                domicilio_side: 'front',
                clave_elector_side: 'back',
                cic_side: 'back',
                vigencia_side: 'back'
            }
        };

        return locations[model] || locations['G']; // Default to G layout
    }

    /**
     * Calculate name confidence
     */
    calculateNameConfidence(name, ocrData) {
        if (!name || !ocrData.words) return 0;

        const nameWords = name.split(/\s+/);
        let totalConfidence = 0;
        let matchedWords = 0;

        for (const word of nameWords) {
            const ocrWord = ocrData.words.find(w =>
                w.text.toUpperCase().includes(word.toUpperCase())
            );
            if (ocrWord) {
                totalConfidence += ocrWord.confidence;
                matchedWords++;
            }
        }

        return matchedWords > 0 ? Math.round(totalConfidence / matchedWords) : 0;
    }

    /**
     * Assess overall extraction quality
     */
    assessQuality(extractedData) {
        const scores = [];

        // Check personal data
        const personal = extractedData.personal_data;
        if (personal.curp.valido) scores.push(95);
        if (personal.nombre_completo.confianza > 80) scores.push(personal.nombre_completo.confianza);

        // Check electoral data
        const electoral = extractedData.electoral_data;
        if (electoral.clave_elector.valido) scores.push(95);
        if (electoral.ocr.valido) scores.push(95);

        // Calculate average
        const avgScore = scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;

        return {
            score: Math.round(avgScore),
            level: avgScore >= 90 ? 'excelente' : avgScore >= 75 ? 'bueno' : avgScore >= 60 ? 'aceptable' : 'bajo',
            required_fields_present: this.checkRequiredFields(extractedData),
            recommendations: this.generateRecommendations(extractedData)
        };
    }

    /**
     * Check if required fields are present
     */
    checkRequiredFields(data) {
        const required = [
            data.personal_data.curp.valor,
            data.personal_data.nombre_completo.valor,
            data.electoral_data.clave_elector.valor,
            data.electoral_data.ocr.valor
        ];

        return required.filter(f => f).length === required.length;
    }

    /**
     * Generate recommendations for improving extraction
     */
    generateRecommendations(data) {
        const recommendations = [];

        if (!data.personal_data.curp.valor) {
            recommendations.push('CURP no detectada - verificar calidad de imagen');
        }

        if (!data.electoral_data.clave_elector.valor) {
            recommendations.push('Clave de Elector no detectada - revisar reverso de credencial');
        }

        if (data.metadata.ocr_confidence_avg < 70) {
            recommendations.push('Baja confianza OCR - mejorar iluminación y nitidez de imagen');
        }

        return recommendations;
    }

    /**
     * Validators
     */

    validateCURP(curp) {
        return /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp);
    }

    validateClaveElector(clave) {
        return /^[A-Z]{6}\d{8}[HM]\d{3}$/.test(clave);
    }

    validateOCR(ocr) {
        return /^\d{13}$/.test(ocr) && ocr !== '0000000000000';
    }

    validateCIC(cic) {
        return /^\d{9}$/.test(cic) && cic !== '000000000';
    }

    validateCodigoPostal(cp) {
        return /^\d{5}$/.test(cp) && parseInt(cp) >= 1000 && parseInt(cp) <= 99999;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldExtractor;
}
