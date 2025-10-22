/**
 * Validadores para campos de INE
 * Valida formato y coherencia de datos
 */

class INEValidators {
    /**
     * Validate CURP (Clave Única de Registro de Población)
     * Format: 4 letters + 6 digits (YYMMDD) + H/M + 5 letters + 1 alphanumeric + 1 digit
     */
    static validateCURP(curp) {
        if (!curp || typeof curp !== 'string') {
            return { valid: false, error: 'CURP vacía o inválida' };
        }

        curp = curp.toUpperCase().trim();

        // Check length
        if (curp.length !== 18) {
            return { valid: false, error: 'CURP debe tener 18 caracteres' };
        }

        // Check format
        const pattern = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
        if (!pattern.test(curp)) {
            return { valid: false, error: 'Formato de CURP inválido' };
        }

        // Validate date
        const year = parseInt(curp.substring(4, 6));
        const month = parseInt(curp.substring(6, 8));
        const day = parseInt(curp.substring(8, 10));

        const yearFull = year > 50 ? 1900 + year : 2000 + year;
        const date = new Date(yearFull, month - 1, day);

        if (date.getMonth() + 1 !== month || date.getDate() !== day) {
            return { valid: false, error: 'Fecha en CURP es inválida' };
        }

        // Validate age (must be at least 18 for INE)
        const age = this.calculateAge(date);
        if (age < 18 || age > 120) {
            return { valid: false, error: `Edad calculada (${age}) es inválida para INE` };
        }

        // Validate sex
        const sex = curp.charAt(10);
        if (sex !== 'H' && sex !== 'M') {
            return { valid: false, error: 'Sexo en CURP debe ser H o M' };
        }

        // Validate state code
        const stateCode = curp.substring(11, 13);
        const validStateCodes = [
            'AS', 'BC', 'BS', 'CC', 'CS', 'CH', 'CL', 'CM', 'DF', 'DG', 'GT', 'GR',
            'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL', 'QT', 'QR', 'SP',
            'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS', 'NE'
        ];

        if (!validStateCodes.includes(stateCode)) {
            return { valid: false, error: 'Código de estado en CURP es inválido' };
        }

        return { valid: true, data: this.parseCURP(curp) };
    }

    /**
     * Parse CURP to extract information
     */
    static parseCURP(curp) {
        const year = parseInt(curp.substring(4, 6));
        const month = curp.substring(6, 8);
        const day = curp.substring(8, 10);
        const yearFull = year > 50 ? 1900 + year : 2000 + year;

        const stateCodes = {
            'AS': 'Aguascalientes', 'BC': 'Baja California', 'BS': 'Baja California Sur',
            'CC': 'Campeche', 'CS': 'Chiapas', 'CH': 'Chihuahua', 'CL': 'Coahuila',
            'CM': 'Colima', 'DF': 'Distrito Federal', 'DG': 'Durango', 'GT': 'Guanajuato',
            'GR': 'Guerrero', 'HG': 'Hidalgo', 'JC': 'Jalisco', 'MC': 'México',
            'MN': 'Michoacán', 'MS': 'Morelos', 'NT': 'Nayarit', 'NL': 'Nuevo León',
            'OC': 'Oaxaca', 'PL': 'Puebla', 'QT': 'Querétaro', 'QR': 'Quintana Roo',
            'SP': 'San Luis Potosí', 'SL': 'Sinaloa', 'SR': 'Sonora', 'TC': 'Tabasco',
            'TS': 'Tamaulipas', 'TL': 'Tlaxcala', 'VZ': 'Veracruz', 'YN': 'Yucatán',
            'ZS': 'Zacatecas', 'NE': 'Nacido en el Extranjero'
        };

        return {
            birthDate: `${yearFull}-${month}-${day}`,
            sex: curp.charAt(10) === 'H' ? 'Hombre' : 'Mujer',
            state: stateCodes[curp.substring(11, 13)] || 'Desconocido',
            age: this.calculateAge(new Date(yearFull, parseInt(month) - 1, parseInt(day)))
        };
    }

    /**
     * Validate Clave de Elector
     * Format: 6 letters + 8 digits + H/M + 3 digits
     */
    static validateClaveElector(clave) {
        if (!clave || typeof clave !== 'string') {
            return { valid: false, error: 'Clave de Elector vacía o inválida' };
        }

        clave = clave.toUpperCase().trim();

        // Check length
        if (clave.length !== 18) {
            return { valid: false, error: 'Clave de Elector debe tener 18 caracteres' };
        }

        // Check format
        const pattern = /^[A-Z]{6}\d{8}[HM]\d{3}$/;
        if (!pattern.test(clave)) {
            return { valid: false, error: 'Formato de Clave de Elector inválido' };
        }

        // Validate sex
        const sex = clave.charAt(14);
        if (sex !== 'H' && sex !== 'M') {
            return { valid: false, error: 'Sexo en Clave de Elector debe ser H o M' };
        }

        return {
            valid: true,
            data: {
                sex: sex === 'H' ? 'Hombre' : 'Mujer',
                section: clave.substring(15, 18)
            }
        };
    }

    /**
     * Validate OCR number (13 digits)
     */
    static validateOCR(ocr) {
        if (!ocr || typeof ocr !== 'string') {
            return { valid: false, error: 'OCR vacío o inválido' };
        }

        ocr = ocr.trim();

        // Check length
        if (ocr.length !== 13) {
            return { valid: false, error: 'OCR debe tener 13 dígitos' };
        }

        // Check if all digits
        if (!/^\d{13}$/.test(ocr)) {
            return { valid: false, error: 'OCR debe contener solo dígitos' };
        }

        // Check if not all zeros
        if (ocr === '0000000000000') {
            return { valid: false, error: 'OCR no puede ser todo ceros' };
        }

        return { valid: true };
    }

    /**
     * Validate CIC (9 digits)
     */
    static validateCIC(cic) {
        if (!cic || typeof cic !== 'string') {
            return { valid: false, error: 'CIC vacío o inválido' };
        }

        cic = cic.trim();

        // Check length
        if (cic.length !== 9) {
            return { valid: false, error: 'CIC debe tener 9 dígitos' };
        }

        // Check if all digits
        if (!/^\d{9}$/.test(cic)) {
            return { valid: false, error: 'CIC debe contener solo dígitos' };
        }

        // Check if not all zeros
        if (cic === '000000000') {
            return { valid: false, error: 'CIC no puede ser todo ceros' };
        }

        return { valid: true };
    }

    /**
     * Validate postal code (5 digits)
     */
    static validateCodigoPostal(cp) {
        if (!cp || typeof cp !== 'string') {
            return { valid: false, error: 'Código postal vacío o inválido' };
        }

        cp = cp.trim();

        // Check length
        if (cp.length !== 5) {
            return { valid: false, error: 'Código postal debe tener 5 dígitos' };
        }

        // Check if all digits
        if (!/^\d{5}$/.test(cp)) {
            return { valid: false, error: 'Código postal debe contener solo dígitos' };
        }

        // Check valid range (01000 to 99999)
        const cpNum = parseInt(cp);
        if (cpNum < 1000 || cpNum > 99999) {
            return { valid: false, error: 'Código postal fuera de rango válido' };
        }

        return { valid: true };
    }

    /**
     * Validate year (emission or vigencia)
     */
    static validateYear(year) {
        if (!year) {
            return { valid: false, error: 'Año vacío' };
        }

        const yearNum = parseInt(year);
        const currentYear = new Date().getFullYear();

        if (yearNum < 1990 || yearNum > currentYear + 10) {
            return { valid: false, error: 'Año fuera de rango válido' };
        }

        return { valid: true };
    }

    /**
     * Cross-validate CURP and Clave de Elector
     */
    static crossValidate(curp, claveElector) {
        const errors = [];

        if (!curp || !claveElector) {
            return { valid: true, errors }; // Skip if either is missing
        }

        // Validate sex matches
        const curpSex = curp.charAt(10);
        const claveSex = claveElector.charAt(14);

        if (curpSex !== claveSex) {
            errors.push('El sexo en CURP y Clave de Elector no coincide');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate complete INE data set
     */
    static validateINEData(data) {
        const results = {
            valid: true,
            errors: [],
            warnings: [],
            fieldValidations: {}
        };

        // Validate personal data
        if (data.personal_data) {
            // CURP
            if (data.personal_data.curp?.valor) {
                const curpResult = this.validateCURP(data.personal_data.curp.valor);
                results.fieldValidations.curp = curpResult;
                if (!curpResult.valid) {
                    results.valid = false;
                    results.errors.push(`CURP: ${curpResult.error}`);
                }
            } else {
                results.warnings.push('CURP no encontrada');
            }

            // Name
            if (!data.personal_data.nombre_completo?.valor) {
                results.warnings.push('Nombre completo no encontrado');
            }
        }

        // Validate electoral data
        if (data.electoral_data) {
            // Clave de Elector
            if (data.electoral_data.clave_elector?.valor) {
                const claveResult = this.validateClaveElector(data.electoral_data.clave_elector.valor);
                results.fieldValidations.clave_elector = claveResult;
                if (!claveResult.valid) {
                    results.valid = false;
                    results.errors.push(`Clave de Elector: ${claveResult.error}`);
                }
            } else {
                results.warnings.push('Clave de Elector no encontrada');
            }

            // OCR
            if (data.electoral_data.ocr?.valor) {
                const ocrResult = this.validateOCR(data.electoral_data.ocr.valor);
                results.fieldValidations.ocr = ocrResult;
                if (!ocrResult.valid) {
                    results.errors.push(`OCR: ${ocrResult.error}`);
                }
            } else {
                results.warnings.push('Código OCR no encontrado');
            }

            // Vigencia
            if (data.electoral_data.vigencia?.valor) {
                const vigenciaResult = this.validateYear(data.electoral_data.vigencia.valor);
                if (!vigenciaResult.valid) {
                    results.warnings.push(`Vigencia: ${vigenciaResult.error}`);
                }
            }
        }

        // Cross-validation
        if (data.personal_data?.curp?.valor && data.electoral_data?.clave_elector?.valor) {
            const crossResult = this.crossValidate(
                data.personal_data.curp.valor,
                data.electoral_data.clave_elector.valor
            );
            if (!crossResult.valid) {
                results.errors.push(...crossResult.errors);
                results.valid = false;
            }
        }

        return results;
    }

    /**
     * Calculate age from date
     */
    static calculateAge(birthDate) {
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }

        return age;
    }

    /**
     * Format CURP with dashes for readability
     */
    static formatCURP(curp) {
        if (!curp || curp.length !== 18) return curp;
        return `${curp.substring(0, 4)}-${curp.substring(4, 10)}-${curp.substring(10, 16)}-${curp.substring(16)}`;
    }

    /**
     * Format Clave de Elector with dashes
     */
    static formatClaveElector(clave) {
        if (!clave || clave.length !== 18) return clave;
        return `${clave.substring(0, 6)}-${clave.substring(6, 14)}-${clave.substring(14)}`;
    }

    /**
     * Validate MRZ (Machine Readable Zone) - OCR-B format
     * Format: A-Z, 0-9, < characters
     */
    static validateMRZ(mrz) {
        if (!mrz || typeof mrz !== 'string') {
            return { valid: false, error: 'MRZ vacío o inválido' };
        }

        mrz = mrz.toUpperCase().trim();

        // MRZ debe contener solo A-Z, 0-9 y <
        if (!/^[A-Z0-9<]+$/.test(mrz)) {
            return { valid: false, error: 'MRZ contiene caracteres inválidos' };
        }

        // MRZ típico de INE tiene longitud mínima
        if (mrz.length < 30) {
            return { valid: false, error: 'MRZ demasiado corto' };
        }

        return { valid: true };
    }

    /**
     * Validate Sección (electoral section)
     * Format: 4 digits
     */
    static validateSeccion(seccion) {
        if (!seccion || typeof seccion !== 'string') {
            return { valid: false, error: 'Sección vacía o inválida' };
        }

        seccion = seccion.trim();

        // Check format: 4 digits
        if (!/^\d{4}$/.test(seccion)) {
            return { valid: false, error: 'Sección debe tener 4 dígitos' };
        }

        // Check not all zeros
        if (seccion === '0000') {
            return { valid: false, error: 'Sección no puede ser 0000' };
        }

        return { valid: true };
    }

    /**
     * Validate Fecha (date in dd/mm/yyyy format)
     * Format: DD/MM/YYYY
     */
    static validateFecha(fecha) {
        if (!fecha || typeof fecha !== 'string') {
            return { valid: false, error: 'Fecha vacía o inválida' };
        }

        fecha = fecha.trim();

        // Check format: dd/mm/yyyy
        const pattern = /^([0-2]\d|3[01])\/(0\d|1[0-2])\/(\d{4})$/;
        const match = fecha.match(pattern);

        if (!match) {
            return { valid: false, error: 'Formato de fecha debe ser DD/MM/YYYY' };
        }

        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);

        // Validate date is real
        const date = new Date(year, month - 1, day);
        if (date.getMonth() + 1 !== month || date.getDate() !== day) {
            return { valid: false, error: 'Fecha inválida' };
        }

        // Check reasonable year range
        const currentYear = new Date().getFullYear();
        if (year < 1900 || year > currentYear) {
            return { valid: false, error: 'Año fuera de rango válido' };
        }

        return { valid: true, data: { day, month, year, date } };
    }

    /**
     * Validate Vigencia (validity period)
     * Format: YYYY-YYYY or "VIGENCIA HASTA YYYY"
     */
    static validateVigencia(vigencia) {
        if (!vigencia || typeof vigencia !== 'string') {
            return { valid: false, error: 'Vigencia vacía o inválida' };
        }

        vigencia = vigencia.toUpperCase().trim();

        // Pattern 1: YYYY-YYYY or YYYY/YYYY
        const pattern1 = /^(\d{4})\s*[-\/]\s*(\d{4})$/;
        const match1 = vigencia.match(pattern1);

        if (match1) {
            const startYear = parseInt(match1[1]);
            const endYear = parseInt(match1[2]);

            if (endYear <= startYear) {
                return { valid: false, error: 'Año final debe ser mayor que inicial' };
            }

            return { valid: true, data: { startYear, endYear, format: 'range' } };
        }

        // Pattern 2: VIGENCIA HASTA YYYY
        const pattern2 = /VIGENCIA\s+HASTA\s+(\d{4})/;
        const match2 = vigencia.match(pattern2);

        if (match2) {
            const endYear = parseInt(match2[1]);
            return { valid: true, data: { endYear, format: 'until' } };
        }

        return { valid: false, error: 'Formato de vigencia inválido (use YYYY-YYYY o VIGENCIA HASTA YYYY)' };
    }

    /**
     * Validate consistency between CURP and fecha_nacimiento
     * CURP positions 5-10 should match birth date YYMMDD
     */
    static validateCURPFechaConsistency(curp, fechaNacimiento) {
        if (!curp || !fechaNacimiento) {
            return { valid: true, warning: 'Campos faltantes para validación cruzada' };
        }

        // Extract date from CURP (positions 4-10: YYMMDD)
        const curpYear = parseInt(curp.substring(4, 6));
        const curpMonth = parseInt(curp.substring(6, 8));
        const curpDay = parseInt(curp.substring(8, 10));

        // Parse fecha_nacimiento
        let birthDay, birthMonth, birthYear;

        if (typeof fechaNacimiento === 'string') {
            // Try DD/MM/YYYY format
            const match = fechaNacimiento.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (match) {
                birthDay = parseInt(match[1]);
                birthMonth = parseInt(match[2]);
                birthYear = parseInt(match[3]);
            } else {
                return { valid: false, error: 'Formato de fecha de nacimiento no reconocido' };
            }
        } else if (fechaNacimiento instanceof Date) {
            birthDay = fechaNacimiento.getDate();
            birthMonth = fechaNacimiento.getMonth() + 1;
            birthYear = fechaNacimiento.getFullYear();
        } else {
            return { valid: false, error: 'Tipo de fecha de nacimiento no soportado' };
        }

        // Convert CURP year to full year
        const curpFullYear = curpYear > 50 ? 1900 + curpYear : 2000 + curpYear;

        // Compare
        if (curpFullYear !== birthYear || curpMonth !== birthMonth || curpDay !== birthDay) {
            return {
                valid: false,
                error: `Fecha en CURP (${curpDay}/${curpMonth}/${curpFullYear}) no coincide con fecha_nacimiento (${birthDay}/${birthMonth}/${birthYear})`
            };
        }

        return { valid: true };
    }

    /**
     * Normalize vigencia to YYYY-YYYY format
     */
    static normalizeVigencia(vigencia) {
        if (!vigencia) return null;

        vigencia = vigencia.toUpperCase().trim();

        // Already in YYYY-YYYY format
        const rangeMatch = vigencia.match(/^(\d{4})\s*[-\/]\s*(\d{4})$/);
        if (rangeMatch) {
            return `${rangeMatch[1]}-${rangeMatch[2]}`;
        }

        // VIGENCIA HASTA YYYY format - estimate start year
        const untilMatch = vigencia.match(/VIGENCIA\s+HASTA\s+(\d{4})/);
        if (untilMatch) {
            const endYear = parseInt(untilMatch[1]);
            const startYear = endYear - 10; // INE típicamente válida 10 años
            return `${startYear}-${endYear}`;
        }

        return vigencia; // Return as-is if can't normalize
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = INEValidators;
}
