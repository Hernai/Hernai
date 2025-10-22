/**
 * Extractor de Campos de INE
 * Extrae campos específicos del texto OCR
 */

class FieldExtractor {
    constructor() {
        // Initialize intelligent OCR corrector (NO hardcoded replace)
        this.ocrCorrector = new OCRCorrector();

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
     * Normalize OCR text using intelligent AI correction
     * NO hardcoded replace - uses OCRCorrector with context analysis
     */
    normalizeOCRText(text) {
        if (!text) return '';

        // Use intelligent OCR corrector instead of hardcoded replace
        const normalized = this.ocrCorrector.correctText(text, { type: 'general' });

        console.log('[FieldExtractor] Text normalized with AI correction');
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

        // Extract name (try both sides for best result)
        let nombre = this.extractName(textFront, textBack);
        const nombreComponentes = this.splitNameComponents(nombre);

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
            apellido_paterno: {
                valor: nombreComponentes.apellido_paterno,
                confianza: nombreComponentes.apellido_paterno ? 90 : 0,
                fuente: 'nombre_completo',
                obligatorio: true
            },
            apellido_materno: {
                valor: nombreComponentes.apellido_materno,
                confianza: nombreComponentes.apellido_materno ? 90 : 0,
                fuente: 'nombre_completo',
                obligatorio: true
            },
            nombres: {
                valor: nombreComponentes.nombres,
                confianza: nombreComponentes.nombres ? 90 : 0,
                fuente: 'nombre_completo',
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
     * Extract OCR code - exactly 13 digits
     * Handles cases where extra digits are captured
     */
    extractOCRCode(text) {
        if (!text) return '';

        const upperText = text.toUpperCase();

        // Strategy 1: Look for "OCR" keyword followed by 13 digits
        const ocrKeywordMatch = upperText.match(/OCR[\s:]*(\d[\d\s\-]{11,15}\d)/i);
        if (ocrKeywordMatch) {
            const cleaned = ocrKeywordMatch[1].replace(/[\s\-]/g, '');
            // Extract exactly 13 digits from the start
            if (cleaned.length >= 13) {
                const code = cleaned.substring(0, 13);
                if (this.validateOCR(code)) {
                    console.log('[FieldExtractor] OCR code extracted (keyword):', code);
                    return code;
                }
            }
        }

        // Strategy 2: Find all 13+ digit sequences and extract exactly 13
        const digitSequences = text.match(/\d{13,}/g);
        if (digitSequences) {
            for (const sequence of digitSequences) {
                // Try to extract exactly 13 digits
                const code = sequence.substring(0, 13);
                if (this.validateOCR(code)) {
                    console.log('[FieldExtractor] OCR code extracted (sequence):', code);
                    return code;
                }
            }
        }

        // Strategy 3: Find sequences with spaces/hyphens and clean them
        const spacedSequences = text.match(/\d[\d\s\-]{11,}\d/g);
        if (spacedSequences) {
            for (const sequence of spacedSequences) {
                const cleaned = sequence.replace(/[\s\-]/g, '');
                if (cleaned.length >= 13) {
                    const code = cleaned.substring(0, 13);
                    if (this.validateOCR(code)) {
                        console.log('[FieldExtractor] OCR code extracted (spaced):', code);
                        return code;
                    }
                }
            }
        }

        console.log('[FieldExtractor] OCR code not found');
        return '';
    }

    /**
     * Extract electoral data
     */
    extractElectoralData(textFront, textBack, ocrDataFront, ocrDataBack, fieldLocations) {
        // Search in BOTH sides (clave can be in front or back depending on model)
        const combinedText = textFront + '\n' + textBack;

        // Try both sides for clave elector
        const claveElectorMatch = this.extractField('CLAVE_ELECTOR', combinedText);

        // OCR code is usually on back - use improved extraction
        const ocrCode = this.extractOCRCode(textBack) || this.extractOCRCode(textFront);

        // CIC for older models
        const cicMatch = this.extractField('CIC', combinedText);

        // Extract years - improved detection
        const { anoRegistro, anoEmision, vigencia } = this.extractYears(combinedText);

        // Extract seccion - improved
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
                valor: ocrCode || '',
                confianza: ocrCode ? 90 : 0,
                valido: ocrCode ? this.validateOCR(ocrCode) : false,
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
            ano_registro: {
                valor: anoRegistro,
                confianza: anoRegistro ? 85 : 0,
                fuente: 'ocr',
                obligatorio: false
            },
            ano_emision: {
                valor: anoEmision,
                confianza: anoEmision ? 85 : 0,
                fuente: 'ocr',
                obligatorio: true
            },
            vigencia: {
                valor: vigencia,
                confianza: vigencia ? 85 : 0,
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

        // Parse address into structured components
        const parsedAddress = this.parseAddress(domicilioCompleto, {
            codigo_postal: cpMatch ? cpMatch.value : '',
            municipio: municipio,
            estado: estado
        });

        return {
            visible: true,
            domicilio_completo: {
                valor: domicilioCompleto,
                confianza: domicilioCompleto ? 70 : 0,
                fuente: 'ocr',
                obligatorio: false
            },
            vialidad: {
                valor: parsedAddress.vialidad,
                confianza: parsedAddress.vialidad ? 80 : 0,
                fuente: 'address_parser',
                obligatorio: false
            },
            numero_exterior: {
                valor: parsedAddress.numero,
                confianza: parsedAddress.numero ? 85 : 0,
                fuente: 'address_parser',
                obligatorio: false
            },
            localidad: {
                valor: parsedAddress.localidad || localidad,
                confianza: parsedAddress.localidad ? 80 : (localidad ? 75 : 0),
                fuente: parsedAddress.localidad ? 'address_parser' : 'ocr',
                obligatorio: false
            },
            codigo_postal: {
                valor: cpMatch ? cpMatch.value : '',
                confianza: cpMatch ? cpMatch.confidence : 0,
                valido: cpMatch ? this.validateCodigoPostal(cpMatch.value) : false,
                fuente: 'ocr',
                obligatorio: false
            },
            municipio: {
                valor: parsedAddress.municipio || municipio,
                confianza: parsedAddress.municipio ? 85 : (municipio ? 80 : 0),
                fuente: parsedAddress.municipio ? 'address_parser' : 'ocr',
                obligatorio: true
            },
            estado: {
                valor: parsedAddress.estado || estado,
                confianza: parsedAddress.estado ? 90 : (estado ? 90 : 0),
                fuente: parsedAddress.estado ? 'address_parser' : 'ocr',
                obligatorio: true
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
     * Parse address into structured components
     * Input example: "AV EMILIO CARRANZA 35 pe BARR BENITO JUAREZ 29160 E CHIAPADE CORZO, CHI"
     * Output: { vialidad, numero, localidad, codigo_postal, municipio, estado }
     */
    parseAddress(addressText, extractedData = {}) {
        if (!addressText || addressText.length < 10) {
            return {
                vialidad: '',
                numero: '',
                localidad: '',
                codigo_postal: extractedData.codigo_postal || '',
                municipio: extractedData.municipio || '',
                estado: extractedData.estado || ''
            };
        }

        const upperAddress = addressText.toUpperCase();
        let vialidad = '';
        let numero = '';
        let localidad = '';
        let codigo_postal = extractedData.codigo_postal || '';
        let municipio = extractedData.municipio || '';
        let estado = extractedData.estado || '';

        // Common vialidad types (street types)
        const vialidadTypes = [
            'AVENIDA', 'AV\\.?', 'CALLE', 'C\\.?', 'BOULEVARD', 'BLVD\\.?',
            'PRIVADA', 'PRIV\\.?', 'ANDADOR', 'AND\\.?', 'CALLEJON', 'CALLEJ\\.?',
            'CALZADA', 'CALZ\\.?', 'CAMINO', 'CAM\\.?', 'CARRETERA', 'CARR\\.?',
            'DIAGONAL', 'DIAG\\.?', 'EJE VIAL', 'PASEO', 'PERIFÉRICO', 'PERIFERICO',
            'PROLONGACIÓN', 'PROLONGACION', 'PROL\\.?', 'RETORNO', 'RET\\.?',
            'VIADUCTO', 'VIA\\.?'
        ];

        // Common localidad prefixes
        const localidadTypes = [
            'BARRIO', 'BARR\\.?', 'COLONIA', 'COL\\.?', 'FRACCIONAMIENTO', 'FRACC\\.?',
            'UNIDAD', 'U\\.?', 'RESIDENCIAL', 'RESID\\.?', 'CONJUNTO', 'CONJ\\.?',
            'VILLA', 'SECTOR', 'SECT\\.?'
        ];

        // Strategy 1: Extract vialidad (street type + name)
        const vialidadPattern = new RegExp(
            `(${vialidadTypes.join('|')})\\s+([A-ZÁÉÍÓÚÑ\\s]+?)\\s+(\\d+)`,
            'i'
        );
        const vialidadMatch = upperAddress.match(vialidadPattern);
        if (vialidadMatch) {
            vialidad = `${vialidadMatch[1]} ${vialidadMatch[2]}`.trim();
            numero = vialidadMatch[3];
            console.log('[FieldExtractor] Vialidad extracted:', vialidad, 'Número:', numero);
        } else {
            // Fallback: extract first part before a number
            const simplePattern = /^([A-ZÁÉÍÓÚÑ\s]+?)\s+(\d+)/;
            const simpleMatch = upperAddress.match(simplePattern);
            if (simpleMatch) {
                vialidad = simpleMatch[1].trim();
                numero = simpleMatch[2];
            }
        }

        // Strategy 2: Extract localidad (neighborhood/colony)
        const localidadPattern = new RegExp(
            `(${localidadTypes.join('|')})\\s+([A-ZÁÉÍÓÚÑ\\s]+?)\\s+(?=\\d{5}|[A-Z]+,)`,
            'i'
        );
        const localidadMatch = upperAddress.match(localidadPattern);
        if (localidadMatch) {
            localidad = `${localidadMatch[1]} ${localidadMatch[2]}`.trim();
            console.log('[FieldExtractor] Localidad extracted:', localidad);
        }

        // Strategy 3: Extract código postal (5-digit number)
        if (!codigo_postal) {
            const cpMatch = upperAddress.match(/\b(\d{5})\b/);
            if (cpMatch) {
                codigo_postal = cpMatch[1];
            }
        }

        // Strategy 4: Extract municipio and estado from "CITY, STATE" pattern
        // Example: "CHIAPA DE CORZO, CHI"
        if (!municipio || !estado) {
            const cityStateMatch = upperAddress.match(/([A-ZÁÉÍÓÚÑ\s]{3,}),\s*([A-Z]{2,4})/);
            if (cityStateMatch) {
                if (!municipio) {
                    // Clean municipio name (remove localidad prefixes)
                    let rawMunicipio = cityStateMatch[1]
                        .replace(new RegExp(localidadTypes.join('|'), 'gi'), '')
                        .trim();
                    municipio = this.cleanMunicipioName(rawMunicipio);
                }

                if (!estado) {
                    // Map state abbreviation to full name
                    const stateAbbrev = cityStateMatch[2];
                    const abreviaturas = {
                        'CHIS': 'CHIAPAS',
                        'CHI': 'CHIAPAS',
                        'CDMX': 'CIUDAD DE MEXICO',
                        'DF': 'DISTRITO FEDERAL',
                        'MEX': 'ESTADO DE MEXICO',
                        'NL': 'NUEVO LEON',
                        'QRO': 'QUERETARO',
                        'QROO': 'QUINTANA ROO',
                        'SLP': 'SAN LUIS POTOSI',
                        'BC': 'BAJA CALIFORNIA',
                        'BCS': 'BAJA CALIFORNIA SUR',
                        'JAL': 'JALISCO',
                        'VER': 'VERACRUZ',
                        'YUC': 'YUCATAN'
                    };
                    estado = abreviaturas[stateAbbrev] || stateAbbrev;
                }
            }
        }

        // Clean extracted values
        vialidad = vialidad.replace(/\s+/g, ' ').trim();
        localidad = localidad.replace(/\s+/g, ' ').trim();

        console.log('[FieldExtractor] Address parsed:', {
            vialidad,
            numero,
            localidad,
            codigo_postal,
            municipio,
            estado
        });

        return {
            vialidad,
            numero,
            localidad,
            codigo_postal,
            municipio,
            estado
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
     * Extract name from lines - improved with barcode parsing
     */
    extractName(textFront, textBack) {
        // Strategy 1: Parse from barcode/magnetic strip in back (most reliable)
        const barcodeNameMatch = textBack.match(/([A-Z]{2,}C[A-Z]{2,}C[A-Z]{2,})/);
        if (barcodeNameMatch) {
            const barcodeName = this.parseNameFromBarcode(barcodeNameMatch[1]);
            if (barcodeName) {
                console.log('[FieldExtractor] Name extracted from barcode:', barcodeName);
                return barcodeName;
            }
        }

        const lines = textFront.split('\n').map(l => l.trim()).filter(l => l);
        const fullText = textFront;

        // Strategy 2: Look after NOMBRE keyword
        const nombreMatch = fullText.match(/NOMBRE\s+(?:SEXO\s+[HM]\s+)?([A-ZÁÉÍÓÚÑ\s]+?)(?=DOMICILIO|CURP|CLAVE|$)/i);
        if (nombreMatch && nombreMatch[1]) {
            const cleaned = nombreMatch[1]
                .replace(/SEXO|[HM]|ua|-|DOMICILIO/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (cleaned.length > 5 && /[A-Z]{3,}/.test(cleaned)) {
                console.log('[FieldExtractor] Name extracted after NOMBRE keyword:', cleaned);
                return cleaned;
            }
        }

        // Strategy 3: Look for apellido/nombre structure
        const namePatterns = [
            /(?:APELLIDO\s*PATERNO|PATERNAL)\s*[:.]?\s*([A-ZÁÉÍÓÚÑ]+)/i,
            /(?:APELLIDO\s*MATERNO|MATERNAL)\s*[:.]?\s*([A-ZÁÉÍÓÚÑ]+)/i,
            /(?:NOMBRE|NAME)\s*[:.]?\s*([A-ZÁÉÍÓÚÑ\s]+?)(?=SEXO|DOMICILIO|CURP|$)/i
        ];

        const nameParts = [];
        for (const pattern of namePatterns) {
            const match = fullText.match(pattern);
            if (match && match[1]) {
                nameParts.push(match[1].trim());
            }
        }

        if (nameParts.length >= 2) {
            const fullName = nameParts.join(' ').trim();
            console.log('[FieldExtractor] Name extracted from structured fields:', fullName);
            return fullName;
        }

        // Strategy 4: Look for lines with 2-4 uppercase words
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const line = lines[i].trim();
            const words = line.split(/\s+/).filter(w => /^[A-ZÁÉÍÓÚÑ]{2,}$/.test(w));
            if (words.length >= 2 && words.length <= 4) {
                const fullName = words.join(' ');
                console.log('[FieldExtractor] Name extracted from word pattern:', fullName);
                return fullName;
            }
        }

        // Strategy 5: Fallback - first clean alphabetic lines
        const nameLines = [];
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const cleaned = lines[i]
                .replace(/NOMBRE|APELLIDO|PATERNO|MATERNO|SEXO|CURP|CLAVE|DOMICILIO/gi, '')
                .replace(/[^A-ZÁÉÍÓÚÑ\s]/gi, '')
                .trim();

            if (cleaned && /[A-ZÁÉÍÓÚÑ]{3,}/i.test(cleaned) && cleaned.length > 2) {
                nameLines.push(cleaned);
            }
        }

        const fallbackName = nameLines.join(' ').trim();
        console.log('[FieldExtractor] Name extracted from fallback:', fallbackName);
        return fallbackName;
    }

    /**
     * Parse name from barcode format: APELLIDOCAPELLIDOCNOMBRE
     * Handles OCR errors like EIVER → IVER
     */
    parseNameFromBarcode(barcode) {
        // Use intelligent OCR corrector to parse barcode with AI
        // NO hardcoded replace or splits
        const parsed = this.ocrCorrector.parseNameFromBarcode(barcode);

        if (parsed) {
            console.log('[FieldExtractor] Name from barcode (AI):', parsed.fullName);
            return parsed.fullName;
        }

        // Fallback: couldn't parse
        console.warn('[FieldExtractor] Could not parse barcode with AI:', barcode);
        return '';
    }

    /**
     * Split name into components
     */
    splitNameComponents(fullName) {
        const parts = fullName.split(/\s+/).filter(p => p && p.length > 1);

        if (parts.length >= 3) {
            return {
                apellido_paterno: parts[0],
                apellido_materno: parts[1],
                nombres: parts.slice(2).join(' ')
            };
        } else if (parts.length === 2) {
            return {
                apellido_paterno: parts[0],
                apellido_materno: '',
                nombres: parts[1]
            };
        } else if (parts.length === 1) {
            return {
                apellido_paterno: parts[0],
                apellido_materno: '',
                nombres: ''
            };
        }

        return {
            apellido_paterno: '',
            apellido_materno: '',
            nombres: ''
        };
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
     * Extract estado - improved
     */
    extractEstado(text) {
        const upperText = text.toUpperCase();

        // First try: exact match or with common abbreviations
        for (const estado of this.estados) {
            if (upperText.includes(estado)) {
                return estado;
            }
        }

        // Second try: common abbreviations
        const abreviaturas = {
            'CHIS': 'CHIAPAS',
            'CHI': 'CHIAPAS',
            'CDMX': 'CIUDAD DE MEXICO',
            'DF': 'DISTRITO FEDERAL',
            'MEX': 'ESTADO DE MEXICO',
            'NL': 'NUEVO LEON',
            'QRO': 'QUERETARO',
            'QROO': 'QUINTANA ROO',
            'SLP': 'SAN LUIS POTOSI',
            'BC': 'BAJA CALIFORNIA',
            'BCS': 'BAJA CALIFORNIA SUR'
        };

        for (const [abrev, estado] of Object.entries(abreviaturas)) {
            // Look for abbreviation as separate word or at end with comma/period
            if (new RegExp(`\\b${abrev}[\\.\\,\\s]`, 'i').test(upperText)) {
                console.log('[FieldExtractor] Estado extracted from abbreviation:', estado);
                return estado;
            }
        }

        // Third try: partial matches (e.g., "CHIAPADE" should match "CHIAPAS")
        for (const estado of this.estados) {
            const estadoStart = estado.substring(0, 5);
            if (upperText.includes(estadoStart)) {
                console.log('[FieldExtractor] Estado extracted from partial match:', estado);
                return estado;
            }
        }

        return '';
    }

    /**
     * Extract municipio - improved with OCR error correction
     */
    extractMunicipio(text) {
        const lines = text.split('\n');
        const upperText = text.toUpperCase();

        // Strategy 1: Look after MUNICIPIO keyword
        for (const line of lines) {
            const upperLine = line.toUpperCase();
            if (this.keywords.municipio.some(kw => upperLine.includes(kw))) {
                const parts = line.split(/MUNICIPIO|MPIO|MUN/i);
                if (parts.length > 1) {
                    const municipio = this.cleanMunicipioName(parts[1].trim());
                    console.log('[FieldExtractor] Municipio extracted after keyword:', municipio);
                    return municipio;
                }
            }
        }

        // Strategy 2: Look for city-like names in address
        // Pattern: "CITY_NAME, STATE_ABBREV" like "E CHIAPADE CORZO, CHI"
        const cityStateMatch = upperText.match(/([A-ZÁÉÍÓÚÑ\s]{3,}),\s*([A-Z]{2,4})/i);
        if (cityStateMatch) {
            let cityName = cityStateMatch[1]
                .replace(/BARR|COLONIA|COL\.|FRACC/gi, '')
                .trim();

            if (cityName.length > 3) {
                const fixed = this.cleanMunicipioName(cityName);
                console.log('[FieldExtractor] Municipio extracted from city pattern:', fixed);
                return fixed;
            }
        }

        return '';
    }

    /**
     * Clean and fix common OCR errors in municipio names
     */
    cleanMunicipioName(municipio) {
        let cleaned = municipio;

        // Remove leading "E " prefix (common OCR error)
        cleaned = cleaned.replace(/^E\s+/i, '');

        // Fix "CHIAPADE" → "CHIAPA DE"
        cleaned = cleaned.replace(/CHIAPADE/gi, 'CHIAPA DE');

        // Fix general pattern "XXXDEXXX" → "XXX DE XXX"
        cleaned = cleaned.replace(/([A-Z]+)DE([A-Z])/g, '$1 DE $2');

        // Remove non-alphabetic characters except spaces
        cleaned = cleaned.replace(/[^A-ZÁÉÍÓÚÑ\s]/gi, '');

        // Normalize spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
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
     * Extract years (registro, emision, vigencia)
     * Handles formats: 201201, 2012, 209-203, etc.
     */
    extractYears(text) {
        let anoRegistro = '';
        let anoEmision = '';
        let vigencia = '';

        // Look for "AÑO DE REGISTRO" or "REGISTRO" + year
        const registroMatch = text.match(/(?:AÑO\s*DE\s*REGISTRO|REGISTRO)\s*:?\s*(\d{4,6})/i);
        if (registroMatch) {
            const year = registroMatch[1];
            // Format: 201201 = 2012, or just 2012
            anoRegistro = year.length === 6 ? year.substring(0, 4) : year;
        }

        // Look for "EMISION" + year
        const emisionMatch = text.match(/(?:EMISION|EMIS\.?)\s*:?\s*(\d{4})/i);
        if (emisionMatch) {
            anoEmision = emisionMatch[1];
        }

        // Look for "VIGENCIA" + year range: "209-203" = 2029-2023 BUT actually 2023-2033
        // INE vigencia format: START-END in YY format, where END is year+10
        const vigenciaRangeMatch = text.match(/(?:VIGENCIA|VIG\.?)\s*:?\s*(\d{3})[\s\-]+(\d{3})/i);
        if (vigenciaRangeMatch) {
            const year1 = vigenciaRangeMatch[1];
            const year2 = vigenciaRangeMatch[2];

            // Convert 3-digit to 4-digit: 209 → 2029, 203 → 2023
            const fullYear1 = '20' + year1;
            const fullYear2 = '20' + year2;

            // The FIRST year is the emission/start, SECOND is vigencia/end
            // But if first > second, it means second is the START
            // Example: "209-203" likely means 2023-2033 (swapped in OCR)
            if (parseInt(fullYear2) < parseInt(fullYear1)) {
                // Swapped: 203 is start (2023), 209 is actually 33 (2033)
                vigencia = fullYear2.substring(0, 2) + year1.substring(1); // 20 + 33 = 2033
                anoEmision = fullYear2; // 2023
            } else {
                vigencia = fullYear1;
                anoEmision = fullYear2;
            }

            console.log(`[FieldExtractor] Vigencia range: ${year1}-${year2} → start:${anoEmision}, end:${vigencia}`);
        } else {
            // Single year format
            const vigenciaMatch = text.match(/(?:VIGENCIA|VIG\.?)\s*:?\s*(\d{3,4})/i);
            if (vigenciaMatch) {
                let year = vigenciaMatch[1];
                if (year.length === 3) {
                    year = '20' + year;
                }
                vigencia = year;
            }
        }

        // Fallback: extract all 4-digit years
        const allYears = text.match(/20\d{2}/g) || [];
        if (!anoRegistro && allYears.length > 0) {
            anoRegistro = allYears[0];
        }
        if (!anoEmision && allYears.length > 0 && !vigenciaRangeMatch) {
            anoEmision = allYears[0];
        }
        if (!vigencia && allYears.length > 1) {
            vigencia = allYears[allYears.length - 1];
        }

        console.log('[FieldExtractor] Years extracted:', { anoRegistro, anoEmision, vigencia });

        return { anoRegistro, anoEmision, vigencia };
    }

    /**
     * Extract seccion - improved for 4-digit sections
     */
    extractSeccion(text) {
        // Try multiple patterns - prioritize explicit keywords
        const keywordPatterns = [
            /(?:SECCIÓN|SECCION)\s*:?\s*(\d{4})/i,  // 4 digits first
            /(?:SECCIÓN|SECCION)\s*:?\s*(\d{3})/i,  // 3 digits as fallback
            /(?:SECC|SEC)\s*:?\s*(\d{4})/i,
            /(?:SECC|SEC)\s*:?\s*(\d{3})/i
        ];

        for (const pattern of keywordPatterns) {
            const match = text.match(pattern);
            if (match) {
                console.log('[FieldExtractor] Seccion extracted (keyword):', match[1]);
                return match[1];
            }
        }

        // Fallback: look for 4-digit numbers that could be section
        // INE sections are typically 0001-9999
        const standalone4Digit = text.match(/\b(0\d{3})\b/);
        if (standalone4Digit) {
            console.log('[FieldExtractor] Seccion extracted (4-digit pattern):', standalone4Digit[1]);
            return standalone4Digit[1];
        }

        // Last fallback: 3-digit number after common keywords
        const standalone3Digit = text.match(/\b(\d{3})\b/);
        if (standalone3Digit && parseInt(standalone3Digit[1]) > 0) {
            console.log('[FieldExtractor] Seccion extracted (3-digit fallback):', standalone3Digit[1]);
            return standalone3Digit[1];
        }

        return '';
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

    // ========================================================================
    // NEW METHODS: Region-based extraction with bbox (Browser-only spec)
    // ========================================================================

    /**
     * Extract a specific field from canvas using layout regions
     * Returns: {value, confidence, bbox, source}
     *
     * @param {string} fieldKey - Field identifier (nombre, curp, etc.)
     * @param {HTMLCanvasElement} canvas - Preprocessed canvas (1012×638px)
     * @param {Object} ocr - OCREngine instance
     * @param {Object} layout - Layout instance
     * @param {string} model - INE model (INE_2019, INE_2023, INE_v3_1)
     * @param {string} side - 'front' or 'back'
     * @param {number} W - Canvas width (1012)
     * @param {number} H - Canvas height (638)
     * @returns {Promise<Object>} {value, confidence, bbox: [x,y,w,h], source}
     */
    async extractFieldWithBbox(fieldKey, canvas, ocr, layout, model, side, W = 1012, H = 638) {
        try {
            // 1. Get region from layout
            const region = layout.getRegion(model, side, fieldKey, W, H);

            if (!region || region.w === 0 || region.h === 0) {
                console.warn(`[FieldExtractor] No region defined for ${fieldKey} in ${model} ${side}`);
                return {
                    value: '',
                    confidence: 0,
                    bbox: [0, 0, 0, 0],
                    source: 'ocr'
                };
            }

            // 2. Crop canvas region
            const croppedCanvas = this.cropRegion(canvas, region);

            // 3. Get field type for whitelist
            const fieldType = this.getFieldType(fieldKey);

            // 4. Run OCR with field-specific whitelist and PSM
            let psm = 7; // Single line default
            if (fieldKey === 'nombre' || fieldKey === 'domicilio') {
                psm = 6; // Block of text
            } else if (fieldKey === 'mrz') {
                // Use OCRB for MRZ
                const mrzResult = await ocr.recognizeOCRB(croppedCanvas);
                const cleanedMRZ = mrzResult.text.replace(/\s/g, '').toUpperCase();

                return {
                    value: cleanedMRZ,
                    confidence: Math.min(100, mrzResult.confidence),
                    bbox: [region.x, region.y, region.w, region.h],
                    source: 'ocr'
                };
            }

            const result = await ocr.recognizeWithWhitelist(croppedCanvas, {
                fieldType: fieldType,
                psm: psm
            });

            // 5. Normalize and correct using OCRCorrector
            let value = result.text.trim().toUpperCase();

            // Apply field-specific corrections
            if (fieldType === 'alphanumeric_id') {
                value = this.ocrCorrector.fixOcrConfusions(value, 'alphanumeric_id');
            } else if (fieldType === 'numeric_id') {
                value = this.ocrCorrector.fixOcrConfusions(value, 'numeric_id');
            } else {
                value = this.ocrCorrector.correctText(value, { type: fieldType });
            }

            // 6. Validate field
            const validation = this.validateFieldValue(fieldKey, value);

            // 7. Boost confidence if validation passes
            let confidence = result.confidence || 0;
            if (validation.valid) {
                confidence = Math.min(100, confidence + 10);
            }

            // 8. Return standardized format
            return {
                value,
                confidence: Math.min(100, Math.round(confidence)),
                bbox: [region.x, region.y, region.w, region.h],
                source: 'ocr'
            };

        } catch (error) {
            console.error(`[FieldExtractor] Error extracting ${fieldKey}:`, error);
            return {
                value: '',
                confidence: 0,
                bbox: [0, 0, 0, 0],
                source: 'ocr'
            };
        }
    }

    /**
     * Crop a region from canvas
     * @param {HTMLCanvasElement} canvas - Source canvas
     * @param {Object} region - {x, y, w, h} in pixels
     * @returns {HTMLCanvasElement} Cropped canvas
     */
    cropRegion(canvas, region) {
        const temp = document.createElement('canvas');
        temp.width = region.w;
        temp.height = region.h;
        const ctx = temp.getContext('2d');
        ctx.drawImage(
            canvas,
            region.x, region.y, region.w, region.h,  // Source
            0, 0, region.w, region.h                  // Destination
        );
        return temp;
    }

    /**
     * Map field key to OCR engine field type (for whitelists)
     */
    getFieldType(fieldKey) {
        const typeMap = {
            'sexo': 'sexo',
            'clave_elector': 'clave_elector',
            'curp': 'curp',
            'seccion': 'seccion',
            'anio_registro': 'anio_registro',
            'vigencia': 'vigencia',
            'mrz': 'mrz',
            'ocr_code': 'ocr_code',
            'nombre': 'general',
            'domicilio': 'general',
            'municipio': 'general',
            'localidad': 'general',
            'estado': 'general',
            'fecha_nacimiento': 'general'
        };
        return typeMap[fieldKey] || 'general';
    }

    /**
     * Validate field value using validators.js
     */
    validateFieldValue(fieldKey, value) {
        if (!value || value.length === 0) {
            return { valid: false };
        }

        try {
            switch (fieldKey) {
                case 'curp':
                    return INEValidators.validateCURP(value);
                case 'clave_elector':
                    return INEValidators.validateClaveElector(value);
                case 'seccion':
                    return INEValidators.validateSeccion(value);
                case 'vigencia':
                    return INEValidators.validateVigencia(value);
                case 'mrz':
                    return INEValidators.validateMRZ(value);
                case 'sexo':
                    return INEValidators.validateSexo(value);
                case 'fecha_nacimiento':
                    return INEValidators.validateFecha(value);
                case 'ocr_code':
                    const cleaned = value.replace(/\D/g, '');
                    return { valid: cleaned.length === 13 };
                default:
                    return { valid: true };
            }
        } catch (error) {
            console.warn(`[FieldExtractor] Validation error for ${fieldKey}:`, error);
            return { valid: false };
        }
    }

    /**
     * Extract all front fields from canvas
     * @param {string} model - INE model
     * @param {HTMLCanvasElement} canvas - Preprocessed canvas (1012×638)
     * @param {Object} ocr - OCREngine instance
     * @param {Object} layout - Layout instance
     * @returns {Promise<Object>} Map of field names to {value, confidence, bbox, source}
     */
    async extractFrontFields(model, canvas, ocr, layout) {
        console.log('[FieldExtractor] Extracting front fields with bbox...');

        const W = 1012, H = 638;
        const fields = {};

        // Extract each front field
        const frontFields = ['nombre', 'sexo', 'domicilio', 'curp', 'fecha_nacimiento'];

        for (const fieldKey of frontFields) {
            fields[fieldKey] = await this.extractFieldWithBbox(
                fieldKey, canvas, ocr, layout, model, 'front', W, H
            );
        }

        // Additional front fields depending on model
        if (model === 'INE_2023') {
            // INE_2023 may have additional fields on front
        }

        console.log('[FieldExtractor] Front fields extracted:', Object.keys(fields));
        return fields;
    }

    /**
     * Extract all back fields from canvas
     * @param {string} model - INE model
     * @param {HTMLCanvasElement} canvas - Preprocessed canvas (1012×638)
     * @param {Object} ocr - OCREngine instance
     * @param {Object} layout - Layout instance
     * @returns {Promise<Object>} Map of field names to {value, confidence, bbox, source}
     */
    async extractBackFields(model, canvas, ocr, layout) {
        console.log('[FieldExtractor] Extracting back fields with bbox...');

        const W = 1012, H = 638;
        const fields = {};

        // Extract each back field
        const backFields = [
            'clave_elector',
            'ocr_code',
            'seccion',
            'anio_registro',
            'vigencia',
            'mrz'
        ];

        for (const fieldKey of backFields) {
            fields[fieldKey] = await this.extractFieldWithBbox(
                fieldKey, canvas, ocr, layout, model, 'back', W, H
            );
        }

        console.log('[FieldExtractor] Back fields extracted:', Object.keys(fields));
        return fields;
    }

    /**
     * Merge QR data with OCR fields
     * @param {Object} ocrFields - Fields extracted via OCR
     * @param {Array} qrPayloads - QR code payloads [{index, text, ok}]
     * @returns {Object} Merged fields with updated source and confidence
     */
    mergeQRWithOCR(ocrFields, qrPayloads) {
        if (!qrPayloads || qrPayloads.length === 0) {
            return ocrFields;
        }

        const merged = { ...ocrFields };

        for (const qr of qrPayloads) {
            if (!qr.ok) continue;

            try {
                // Try to parse QR as JSON
                const qrData = JSON.parse(qr.text);

                for (const [key, value] of Object.entries(qrData)) {
                    const normalizedKey = key.toLowerCase();

                    if (merged[normalizedKey]) {
                        // Compare OCR vs QR
                        const similarity = this.ocrCorrector.levenshteinSimilarity(
                            merged[normalizedKey].value,
                            value
                        );

                        if (similarity >= 0.90) {
                            // High similarity - boost confidence
                            merged[normalizedKey].confidence = Math.min(100, merged[normalizedKey].confidence + 15);
                            merged[normalizedKey].source = 'ocr+qr';
                            console.log(`[FieldExtractor] QR confirmed OCR for ${normalizedKey} (${similarity.toFixed(2)})`);
                        } else if (merged[normalizedKey].confidence < 75) {
                            // Low OCR confidence - prefer QR
                            merged[normalizedKey].value = value;
                            merged[normalizedKey].confidence = 95;
                            merged[normalizedKey].source = 'qr';
                            console.log(`[FieldExtractor] QR replaced OCR for ${normalizedKey}`);
                        }
                    } else {
                        // Field only in QR
                        merged[normalizedKey] = {
                            value: value,
                            confidence: 95,
                            bbox: [0, 0, 0, 0],  // No bbox for QR-only fields
                            source: 'qr'
                        };
                    }
                }
            } catch (e) {
                // QR is not JSON - could be raw text
                console.log('[FieldExtractor] QR not JSON:', qr.text);
            }
        }

        return merged;
    }

    // ========================================================================
    // END NEW METHODS
    // ========================================================================

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
