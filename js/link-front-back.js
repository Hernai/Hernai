/**
 * LinkFrontBack - Validación Cruzada entre Anverso y Reverso
 * Verifica consistencia de datos entre ambos lados de la credencial
 * Detecta inconsistencias que indican fraude o documentos diferentes
 */

class LinkFrontBack {
    constructor() {
        this.validators = new INEValidators();
    }

    /**
     * Valida consistencia entre anverso y reverso
     * @param {Object} frontData - Datos extraídos del anverso
     * @param {Object} backData - Datos extraídos del reverso
     * @returns {Object} Resultado de validación cruzada
     */
    validateCrossConsistency(frontData, backData) {
        console.log('[LinkFrontBack] Starting cross-validation...');

        const checks = {
            curp_consistency: this.checkCURPConsistency(frontData, backData),
            name_consistency: this.checkNameConsistency(frontData, backData),
            sex_consistency: this.checkSexConsistency(frontData, backData),
            birth_date_consistency: this.checkBirthDateConsistency(frontData, backData),
            elector_key_format: this.checkElectorKeyFormat(frontData, backData),
            ocr_presence: this.checkOCRPresence(backData),
            qr_presence: this.checkQRPresence(backData),
            side_detection: this.checkSideDetection(frontData, backData)
        };

        // Calcular score total (0-100)
        const totalScore = this.calculateConsistencyScore(checks);

        // Determinar si es válido
        const isValid = totalScore >= 70; // Umbral mínimo de consistencia

        // Generar warnings
        const warnings = this.generateWarnings(checks);

        // Generar errores críticos
        const errors = this.generateErrors(checks);

        console.log(`[LinkFrontBack] Consistency score: ${totalScore}/100`);

        return {
            is_consistent: isValid,
            consistency_score: totalScore,
            checks: checks,
            warnings: warnings,
            errors: errors,
            can_proceed: errors.length === 0
        };
    }

    /**
     * Verifica consistencia del CURP
     * CURP debe estar en anverso o reverso según el modelo
     */
    checkCURPConsistency(frontData, backData) {
        const curpFront = frontData.fields?.curp?.value || '';
        const curpBack = backData.fields?.curp?.value || '';

        // Al menos uno debe tener CURP
        if (!curpFront && !curpBack) {
            return {
                passed: false,
                score: 0,
                message: 'CURP not found in either side',
                severity: 'error'
            };
        }

        // Si ambos tienen CURP, deben coincidir
        if (curpFront && curpBack) {
            const match = curpFront === curpBack;
            return {
                passed: match,
                score: match ? 100 : 0,
                message: match ? 'CURP matches on both sides' : 'CURP mismatch between sides',
                severity: match ? 'ok' : 'error',
                front_curp: curpFront,
                back_curp: curpBack
            };
        }

        // Solo uno tiene CURP (válido dependiendo del modelo)
        const curp = curpFront || curpBack;
        const validation = this.validators.validateCURP(curp);

        return {
            passed: validation.valid,
            score: validation.valid ? 90 : 30,
            message: `CURP found on ${curpFront ? 'front' : 'back'} only`,
            severity: validation.valid ? 'ok' : 'warning',
            curp: curp,
            side: curpFront ? 'front' : 'back'
        };
    }

    /**
     * Verifica consistencia del nombre con CURP
     */
    checkNameConsistency(frontData, backData) {
        const nombre = frontData.fields?.nombre?.value || '';
        const curpFront = frontData.fields?.curp?.value || '';
        const curpBack = backData.fields?.curp?.value || '';
        const curp = curpFront || curpBack;

        if (!nombre || !curp) {
            return {
                passed: false,
                score: 0,
                message: 'Missing name or CURP for consistency check',
                severity: 'warning'
            };
        }

        // Extraer iniciales del CURP (primeros 4 caracteres)
        const curpInitials = curp.substring(0, 4).toUpperCase();

        // Extraer iniciales del nombre
        const nameParts = nombre.toUpperCase().split(/\s+/);
        if (nameParts.length < 2) {
            return {
                passed: false,
                score: 30,
                message: 'Name format incomplete',
                severity: 'warning'
            };
        }

        // CURP format: AAAA = Apellido Paterno (1 letra) + Apellido Materno (1 letra) + Nombre (1 letra) + Primera vocal apellido paterno
        const expectedFirstLetter = nameParts[0][0]; // Apellido Paterno
        const actualFirstLetter = curpInitials[0];

        const match = expectedFirstLetter === actualFirstLetter;

        return {
            passed: match,
            score: match ? 100 : 50,
            message: match ? 'Name consistent with CURP' : 'Name might not match CURP initials',
            severity: match ? 'ok' : 'warning',
            curp_initials: curpInitials,
            name_initials: nameParts.map(p => p[0]).join('')
        };
    }

    /**
     * Verifica consistencia del sexo
     */
    checkSexConsistency(frontData, backData) {
        const sexoFront = frontData.fields?.sexo?.value || '';
        const curpFront = frontData.fields?.curp?.value || '';
        const curpBack = backData.fields?.curp?.value || '';
        const curp = curpFront || curpBack;

        if (!sexoFront && !curp) {
            return {
                passed: false,
                score: 0,
                message: 'Sex information not available',
                severity: 'warning'
            };
        }

        // Extraer sexo del CURP (posición 10)
        if (curp && curp.length >= 11) {
            const sexoCURP = curp[10]; // 'H' o 'M'
            const sexoNormalized = sexoFront.toUpperCase()[0]; // Primera letra

            if (sexoFront) {
                const match = sexoCURP === sexoNormalized;
                return {
                    passed: match,
                    score: match ? 100 : 0,
                    message: match ? 'Sex consistent with CURP' : 'Sex mismatch with CURP',
                    severity: match ? 'ok' : 'error',
                    sexo_ocr: sexoFront,
                    sexo_curp: sexoCURP === 'H' ? 'Hombre' : 'Mujer'
                };
            }
        }

        return {
            passed: true,
            score: 50,
            message: 'Cannot verify sex consistency',
            severity: 'warning'
        };
    }

    /**
     * Verifica consistencia de fecha de nacimiento
     */
    checkBirthDateConsistency(frontData, backData) {
        const fechaFront = frontData.fields?.fecha_nacimiento?.value || '';
        const curpFront = frontData.fields?.curp?.value || '';
        const curpBack = backData.fields?.curp?.value || '';
        const curp = curpFront || curpBack;

        if (!fechaFront || !curp) {
            return {
                passed: false,
                score: 0,
                message: 'Birth date or CURP not available',
                severity: 'warning'
            };
        }

        // Extraer fecha del CURP (posiciones 4-9: YYMMDD)
        const curpDate = curp.substring(4, 10);
        const year = parseInt(curpDate.substring(0, 2));
        const month = curpDate.substring(2, 4);
        const day = curpDate.substring(4, 6);

        // Convertir año a formato completo (19XX o 20XX)
        const fullYear = year > 50 ? `19${year}` : `20${year}`;

        // Comparar con fecha OCR
        const fechaParsed = this.parseFecha(fechaFront);

        if (fechaParsed) {
            const match = fechaParsed.year === fullYear &&
                          fechaParsed.month === month &&
                          fechaParsed.day === day;

            return {
                passed: match,
                score: match ? 100 : 20,
                message: match ? 'Birth date consistent with CURP' : 'Birth date mismatch with CURP',
                severity: match ? 'ok' : 'error',
                fecha_ocr: fechaFront,
                fecha_curp: `${day}/${month}/${fullYear}`
            };
        }

        return {
            passed: false,
            score: 30,
            message: 'Cannot parse birth date',
            severity: 'warning'
        };
    }

    /**
     * Verifica formato de Clave de Elector
     */
    checkElectorKeyFormat(frontData, backData) {
        const claveBack = backData.fields?.clave_elector?.value || '';

        if (!claveBack) {
            return {
                passed: false,
                score: 0,
                message: 'Clave de Elector not found on back',
                severity: 'error'
            };
        }

        const validation = this.validators.validateClaveElector(claveBack);

        return {
            passed: validation.valid,
            score: validation.valid ? 100 : 0,
            message: validation.valid ? 'Valid Clave de Elector format' : 'Invalid Clave de Elector format',
            severity: validation.valid ? 'ok' : 'error',
            clave: claveBack
        };
    }

    /**
     * Verifica presencia de código OCR en reverso
     */
    checkOCRPresence(backData) {
        const ocrCode = backData.fields?.ocr_code?.value || '';

        if (!ocrCode) {
            return {
                passed: false,
                score: 0,
                message: 'OCR code not found on back',
                severity: 'warning'
            };
        }

        // Verificar que tenga 13 dígitos
        const cleaned = ocrCode.replace(/\D/g, '');
        const valid = cleaned.length === 13;

        return {
            passed: valid,
            score: valid ? 100 : 50,
            message: valid ? 'OCR code present (13 digits)' : `OCR code has ${cleaned.length} digits (expected 13)`,
            severity: valid ? 'ok' : 'warning',
            ocr_code: ocrCode
        };
    }

    /**
     * Verifica presencia de códigos QR en reverso
     */
    checkQRPresence(backData) {
        const qrPayloads = backData.fields?.qr_payloads || [];

        // Reverso generalmente tiene 2-3 QR codes
        const count = qrPayloads.filter(qr => qr.ok).length;

        return {
            passed: count >= 2,
            score: count >= 2 ? 100 : (count === 1 ? 50 : 0),
            message: `Found ${count} QR codes on back (expected 2-3)`,
            severity: count >= 2 ? 'ok' : 'warning',
            qr_count: count
        };
    }

    /**
     * Verifica que los lados fueron detectados correctamente
     */
    checkSideDetection(frontData, backData) {
        const sideFront = frontData.side || 'unknown';
        const sideBack = backData.side || 'unknown';

        const correctFront = sideFront === 'front';
        const correctBack = sideBack === 'back';
        const both Correct = correctFront && correctBack;

        return {
            passed: bothCorrect,
            score: bothCorrect ? 100 : (correctFront || correctBack ? 50 : 0),
            message: bothCorrect ? 'Sides correctly detected' : 'Side detection may be incorrect',
            severity: bothCorrect ? 'ok' : 'error',
            front_detected_as: sideFront,
            back_detected_as: sideBack
        };
    }

    /**
     * Calcula score total de consistencia
     */
    calculateConsistencyScore(checks) {
        const weights = {
            curp_consistency: 0.25,
            name_consistency: 0.15,
            sex_consistency: 0.10,
            birth_date_consistency: 0.15,
            elector_key_format: 0.15,
            ocr_presence: 0.10,
            qr_presence: 0.05,
            side_detection: 0.05
        };

        let totalScore = 0;
        let totalWeight = 0;

        for (const [checkName, result] of Object.entries(checks)) {
            const weight = weights[checkName] || 0;
            totalScore += result.score * weight;
            totalWeight += weight;
        }

        return Math.round(totalScore / totalWeight);
    }

    /**
     * Genera lista de warnings
     */
    generateWarnings(checks) {
        const warnings = [];

        for (const [checkName, result] of Object.entries(checks)) {
            if (result.severity === 'warning') {
                warnings.push({
                    check: checkName,
                    message: result.message,
                    score: result.score
                });
            }
        }

        return warnings;
    }

    /**
     * Genera lista de errores críticos
     */
    generateErrors(checks) {
        const errors = [];

        for (const [checkName, result] of Object.entries(checks)) {
            if (result.severity === 'error') {
                errors.push({
                    check: checkName,
                    message: result.message,
                    score: result.score
                });
            }
        }

        return errors;
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    /**
     * Parse fecha en formato DD/MM/YYYY o YYYY-MM-DD
     */
    parseFecha(fecha) {
        if (!fecha) return null;

        // Formato DD/MM/YYYY
        let match = fecha.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (match) {
            return {
                day: match[1],
                month: match[2],
                year: match[3]
            };
        }

        // Formato YYYY-MM-DD
        match = fecha.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return {
                year: match[1],
                month: match[2],
                day: match[3]
            };
        }

        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LinkFrontBack;
}
