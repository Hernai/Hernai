/**
 * Extractor de Campos de INE
 * Extrae campos específicos del texto OCR
 */

class FieldExtractor {
    constructor() {
        // Patrones regex para cada campo
        this.patterns = {
            CURP: {
                regex: /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/g,
                validator: this.validateCURP,
                priority: 10
            },
            CLAVE_ELECTOR: {
                regex: /[A-Z]{6}\d{8}[HM]\d{3}/g,
                validator: this.validateClaveElector,
                priority: 10
            },
            OCR: {
                regex: /\b\d{13}\b/g,
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
     * Extract all fields from OCR text
     */
    extract(ocrDataFront, ocrDataBack) {
        console.log('[FieldExtractor] Extracting fields from INE...');

        const textFront = ocrDataFront.text;
        const textBack = ocrDataBack.text;
        const combinedText = textFront + '\n' + textBack;

        const extractedData = {
            metadata: {
                extraction_date: new Date().toISOString(),
                ocr_confidence_front: ocrDataFront.confidence || 0,
                ocr_confidence_back: ocrDataBack.confidence || 0,
                ocr_confidence_avg: ((ocrDataFront.confidence || 0) + (ocrDataBack.confidence || 0)) / 2,
                model: this.detectModel(combinedText),
                version: '1.0.0'
            },
            personal_data: this.extractPersonalData(textFront, ocrDataFront),
            electoral_data: this.extractElectoralData(combinedText, ocrDataFront, ocrDataBack),
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
    extractPersonalData(text, ocrData) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);

        // Extract CURP
        const curpMatch = this.extractField('CURP', text);
        const curp = curpMatch ? curpMatch.value : '';

        // Extract name (usually first lines)
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
    extractElectoralData(text, ocrDataFront, ocrDataBack) {
        const claveElectorMatch = this.extractField('CLAVE_ELECTOR', text);
        const ocrMatch = this.extractField('OCR', text);
        const cicMatch = this.extractField('CIC', text);

        // Extract years (emission and vigencia)
        const years = text.match(/20\d{2}/g) || [];
        const vigenciaMatch = text.match(this.patterns.VIGENCIA.regex);
        const emisionMatch = text.match(this.patterns.EMISION.regex);

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

        // Extract seccion
        const seccion = this.extractSeccion(text);

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

        return {
            visible: true,
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
     * Extract a specific field using pattern
     */
    extractField(fieldName, text) {
        const pattern = this.patterns[fieldName];
        if (!pattern) return null;

        const matches = text.match(pattern.regex);
        if (!matches || matches.length === 0) return null;

        // Take the first match (or best match if validator exists)
        let bestMatch = matches[0];
        let bestConfidence = 85;

        if (pattern.validator) {
            for (const match of matches) {
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
            matches: matches
        };
    }

    /**
     * Extract name from lines
     */
    extractName(lines) {
        // Name is usually in the first few lines, contains only letters and spaces
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i];
            // Check if line contains mostly letters (nombre)
            if (/^[A-ZÁÉÍÓÚÑ\s]{5,}$/i.test(line)) {
                return line.trim();
            }
        }

        // Fallback: join first 2-3 lines that look like names
        const nameLines = [];
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            if (/[A-ZÁÉÍÓÚÑ]{3,}/i.test(lines[i])) {
                nameLines.push(lines[i]);
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
     * Detect INE model
     */
    detectModel(text) {
        const upperText = text.toUpperCase();

        if (upperText.includes('DESDE EL EXTRANJERO') || upperText.includes('FROM ABROAD')) {
            return 'H (con foto desde extranjero)';
        }

        if (/\d{13}/.test(text)) {
            return 'G o H (con código OCR)';
        }

        if (/\d{9}/.test(text)) {
            return 'F (con CIC)';
        }

        return 'Desconocido';
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
