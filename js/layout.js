/**
 * layout.js - Mapas de regiones por modelo de INE
 *
 * Define coordenadas [x, y, w, h] como porcentajes (0.0-1.0) relativos
 * al canvas normalizado de 1012×638px (ratio ID-1).
 *
 * Modelos soportados:
 * - INE_2019: Modelo G (con OCR de 13 dígitos)
 * - INE_2023: Modelo H (con leyenda "DESDE EL EXTRANJERO")
 * - INE_v3_1: Variante con cambios de diseño
 * - unknown: Fallback con regiones genéricas
 */

class INELayout {
    constructor() {
        // Dimensiones base del canvas normalizado (ID-1 card)
        this.BASE_WIDTH = 1012;
        this.BASE_HEIGHT = 638;

        // Layouts por modelo y lado
        this.layouts = {
            // ============================================
            // MODELO INE_2019 (Modelo G)
            // ============================================
            INE_2019: {
                front: {
                    // Foto del ciudadano (izquierda)
                    foto: [0.05, 0.18, 0.24, 0.50],

                    // Campos de texto (derecha) - Coordenadas ajustadas precisamente
                    nombre: [0.31, 0.18, 0.64, 0.09],  // Ajustado: más abajo para evitar encabezado
                    domicilio: [0.31, 0.29, 0.64, 0.15],  // Ajustado: después del nombre

                    // Campos en bloque medio - Ajustados según layout real de INE 2019
                    clave_elector: [0.31, 0.47, 0.38, 0.07],
                    curp: [0.31, 0.56, 0.45, 0.07],
                    sexo: [0.78, 0.56, 0.15, 0.07],
                    fecha_nacimiento: [0.31, 0.65, 0.28, 0.07],
                    anio_registro: [0.62, 0.65, 0.18, 0.07],

                    // Campos administrativos inferiores
                    seccion: [0.31, 0.75, 0.18, 0.07],
                    localidad: [0.51, 0.75, 0.22, 0.07],
                    municipio: [0.75, 0.75, 0.20, 0.07],

                    // Elementos visuales
                    firma: [0.05, 0.72, 0.24, 0.18],
                    vigencia: [0.31, 0.86, 0.30, 0.07]
                },
                back: {
                    // Banda MRZ (OCR-B con <<)
                    mrz: [0.05, 0.50, 0.90, 0.15],

                    // Códigos QR (típicamente 3 en modelos recientes)
                    qr1: [0.10, 0.15, 0.25, 0.25],
                    qr2: [0.40, 0.15, 0.25, 0.25],
                    qr3: [0.70, 0.15, 0.25, 0.25],

                    // Información adicional
                    cic: [0.20, 0.70, 0.30, 0.08],
                    ocr: [0.55, 0.70, 0.40, 0.08],

                    // Texto legal/vigencia
                    vigencia_back: [0.05, 0.85, 0.50, 0.08],
                    emision: [0.60, 0.85, 0.35, 0.08]
                }
            },

            // ============================================
            // MODELO INE_2023 (Modelo H)
            // ============================================
            INE_2023: {
                front: {
                    foto: [0.05, 0.15, 0.25, 0.55],
                    nombre: [0.35, 0.18, 0.60, 0.08],
                    domicilio: [0.35, 0.28, 0.60, 0.15],

                    clave_elector: [0.35, 0.50, 0.35, 0.06],
                    curp: [0.35, 0.58, 0.40, 0.06],
                    sexo: [0.80, 0.58, 0.10, 0.06],
                    fecha_nacimiento: [0.35, 0.66, 0.25, 0.06],
                    anio_registro: [0.65, 0.66, 0.15, 0.06],

                    seccion: [0.35, 0.75, 0.15, 0.06],
                    localidad: [0.52, 0.75, 0.20, 0.06],
                    municipio: [0.74, 0.75, 0.20, 0.06],

                    firma: [0.05, 0.75, 0.25, 0.15],
                    vigencia: [0.35, 0.85, 0.25, 0.06]
                },
                back: {
                    mrz: [0.05, 0.50, 0.90, 0.15],
                    qr1: [0.10, 0.15, 0.25, 0.25],
                    qr2: [0.40, 0.15, 0.25, 0.25],
                    qr3: [0.70, 0.15, 0.25, 0.25],
                    ocr: [0.55, 0.70, 0.40, 0.08],
                    vigencia_back: [0.05, 0.85, 0.50, 0.08],
                    emision: [0.60, 0.85, 0.35, 0.08],

                    // Leyenda específica del modelo H
                    extranjero_text: [0.30, 0.45, 0.40, 0.05]
                }
            },

            // ============================================
            // MODELO INE_v3_1 (Variante experimental)
            // ============================================
            INE_v3_1: {
                front: {
                    foto: [0.05, 0.15, 0.25, 0.55],
                    nombre: [0.35, 0.18, 0.60, 0.08],
                    domicilio: [0.35, 0.28, 0.60, 0.15],

                    clave_elector: [0.35, 0.50, 0.35, 0.06],
                    curp: [0.35, 0.58, 0.40, 0.06],
                    sexo: [0.80, 0.58, 0.10, 0.06],
                    fecha_nacimiento: [0.35, 0.66, 0.25, 0.06],
                    anio_registro: [0.65, 0.66, 0.15, 0.06],

                    seccion: [0.35, 0.75, 0.15, 0.06],
                    localidad: [0.52, 0.75, 0.20, 0.06],
                    municipio: [0.74, 0.75, 0.20, 0.06],

                    firma: [0.05, 0.75, 0.25, 0.15],
                    vigencia: [0.35, 0.85, 0.25, 0.06]
                },
                back: {
                    mrz: [0.05, 0.50, 0.90, 0.15],
                    qr1: [0.10, 0.15, 0.25, 0.25],
                    qr2: [0.40, 0.15, 0.25, 0.25],
                    qr3: [0.70, 0.15, 0.25, 0.25],
                    ocr: [0.55, 0.70, 0.40, 0.08],
                    vigencia_back: [0.05, 0.85, 0.50, 0.08],
                    emision: [0.60, 0.85, 0.35, 0.08]
                }
            },

            // ============================================
            // MODELO UNKNOWN (Fallback genérico)
            // ============================================
            unknown: {
                front: {
                    // Regiones basadas en INE_2019 (el más común) con ligera expansión
                    foto: [0.05, 0.18, 0.24, 0.50],
                    nombre: [0.31, 0.13, 0.64, 0.10],
                    domicilio: [0.31, 0.25, 0.64, 0.18],

                    clave_elector: [0.31, 0.48, 0.38, 0.07],
                    curp: [0.31, 0.57, 0.45, 0.07],
                    sexo: [0.78, 0.57, 0.15, 0.07],
                    fecha_nacimiento: [0.31, 0.66, 0.28, 0.07],
                    anio_registro: [0.62, 0.66, 0.18, 0.07],

                    seccion: [0.31, 0.76, 0.18, 0.07],
                    localidad: [0.51, 0.76, 0.22, 0.07],
                    municipio: [0.75, 0.76, 0.20, 0.07],

                    firma: [0.05, 0.72, 0.24, 0.18],
                    vigencia: [0.31, 0.87, 0.30, 0.07]
                },
                back: {
                    // Búsqueda amplia en reverso
                    mrz: [0.05, 0.45, 0.90, 0.20],
                    qr1: [0.10, 0.10, 0.25, 0.30],
                    qr2: [0.38, 0.10, 0.25, 0.30],
                    qr3: [0.66, 0.10, 0.25, 0.30],
                    ocr: [0.40, 0.68, 0.50, 0.10],
                    vigencia_back: [0.05, 0.80, 0.55, 0.10],
                    emision: [0.60, 0.80, 0.35, 0.10]
                }
            }
        };
    }

    /**
     * Obtener región de un campo en pixeles absolutos
     * @param {string} model - Modelo de INE (INE_2019, INE_2023, INE_v3_1, unknown)
     * @param {string} side - Lado (front, back)
     * @param {string} fieldKey - Nombre del campo
     * @param {number} W - Ancho del canvas actual
     * @param {number} H - Alto del canvas actual
     * @returns {{x: number, y: number, w: number, h: number} | null}
     */
    getRegion(model, side, fieldKey, W, H) {
        // Validar modelo
        if (!this.layouts[model]) {
            console.warn(`[Layout] Modelo '${model}' no encontrado, usando 'unknown'`);
            model = 'unknown';
        }

        // Validar lado
        if (!this.layouts[model][side]) {
            console.error(`[Layout] Lado '${side}' no encontrado en modelo '${model}'`);
            return null;
        }

        // Obtener región normalizada
        const normalized = this.layouts[model][side][fieldKey];
        if (!normalized) {
            console.warn(`[Layout] Campo '${fieldKey}' no encontrado en ${model}/${side}`);
            return null;
        }

        // Convertir a pixeles absolutos
        const [xRel, yRel, wRel, hRel] = normalized;
        return {
            x: Math.round(xRel * W),
            y: Math.round(yRel * H),
            w: Math.round(wRel * W),
            h: Math.round(hRel * H)
        };
    }

    /**
     * Obtener todos los campos de un lado
     * @param {string} model - Modelo de INE
     * @param {string} side - Lado (front, back)
     * @returns {string[]} Array de nombres de campos
     */
    getFieldKeys(model, side) {
        if (!this.layouts[model]) model = 'unknown';
        if (!this.layouts[model][side]) return [];

        return Object.keys(this.layouts[model][side]);
    }

    /**
     * Verificar si un modelo es válido
     * @param {string} model - Modelo a verificar
     * @returns {boolean}
     */
    isValidModel(model) {
        return this.layouts.hasOwnProperty(model);
    }

    /**
     * Obtener lista de modelos soportados
     * @returns {string[]}
     */
    getSupportedModels() {
        return Object.keys(this.layouts);
    }

    /**
     * Expandir región con padding (útil para OCR)
     * @param {{x: number, y: number, w: number, h: number}} region
     * @param {number} paddingPercent - Padding como % del ancho/alto (ej. 0.1 = 10%)
     * @param {number} maxW - Ancho máximo del canvas
     * @param {number} maxH - Alto máximo del canvas
     * @returns {{x: number, y: number, w: number, h: number}}
     */
    expandRegion(region, paddingPercent = 0.05, maxW, maxH) {
        const padX = Math.round(region.w * paddingPercent);
        const padY = Math.round(region.h * paddingPercent);

        return {
            x: Math.max(0, region.x - padX),
            y: Math.max(0, region.y - padY),
            w: Math.min(maxW - region.x + padX, region.w + 2 * padX),
            h: Math.min(maxH - region.y + padY, region.h + 2 * padY)
        };
    }
}

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = INELayout;
}
