/**
 * Main UI Script - Handles all user interactions
 */

// Global state
let currentResult = null;

// Wait for app to be initialized
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Main] DOM loaded, setting up UI...');

    setupImageUpload();
    setupProcessButton();
    setupTabs();
    setupExportButtons();
});

/**
 * Setup image upload handlers
 */
function setupImageUpload() {
    // Front image upload
    document.getElementById('uploadFront').addEventListener('click', () => {
        document.getElementById('fileFront').click();
    });

    document.getElementById('fileFront').addEventListener('change', async (e) => {
        await handleImageUpload(e, 'front');
    });

    // Back image upload
    document.getElementById('uploadBack').addEventListener('click', () => {
        document.getElementById('fileBack').click();
    });

    document.getElementById('fileBack').addEventListener('change', async (e) => {
        await handleImageUpload(e, 'back');
    });
}

/**
 * Handle image upload
 */
async function handleImageUpload(event, side) {
    const file = event.target.files[0];
    if (!file) return;

    console.log(`[Main] Loading ${side} image:`, file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
            // Store in app state
            if (side === 'front') {
                app.state.frontImage = img;
            } else {
                app.state.backImage = img;
            }

            // Show preview
            const previewId = side === 'front' ? 'previewFront' : 'previewBack';
            const uploadBoxId = side === 'front' ? 'uploadFront' : 'uploadBack';
            const detectionId = side === 'front' ? 'detectionFront' : 'detectionBack';

            document.getElementById(previewId).src = e.target.result;
            document.getElementById(previewId).classList.add('show');
            document.getElementById(uploadBoxId).classList.add('active');

            // Quick detection (visual only, no OCR yet)
            try {
                const detection = await app.detector.detect(img, null);

                const detectionBadge = document.getElementById(detectionId);
                if (detection.isINE) {
                    detectionBadge.textContent = `✓ INE detectada (${detection.confidence}%)`;
                    detectionBadge.style.background = 'rgba(40, 167, 69, 0.9)';
                } else {
                    detectionBadge.textContent = `⚠ No parece INE (${detection.confidence}%)`;
                    detectionBadge.style.background = 'rgba(220, 53, 69, 0.9)';
                }
                detectionBadge.classList.add('show');
            } catch (error) {
                console.error('[Main] Detection failed:', error);
            }

            // Enable process button if both images loaded
            if (app.state.frontImage && app.state.backImage) {
                document.getElementById('btnProcess').disabled = false;
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * Setup process button
 */
function setupProcessButton() {
    document.getElementById('btnProcess').addEventListener('click', async () => {
        if (!app.state.frontImage || !app.state.backImage) {
            alert('Por favor carga ambas imágenes (anverso y reverso)');
            return;
        }

        console.log('[Main] Starting processing...');

        // Hide previous results
        document.getElementById('resultsSection').classList.remove('show');

        try {
            const result = await app.processINE(
                app.state.frontImage,
                app.state.backImage,
                {
                    onProgress: (progress) => {
                        updateProcessingProgress(
                            progress.stage,
                            progress.progress,
                            progress.message
                        );
                    }
                }
            );

            console.log('[Main] Processing complete:', result);
            currentResult = result;

            // Display results
            displayResults(result);

        } catch (error) {
            console.error('[Main] Processing error:', error);
            alert('Error al procesar las imágenes:\n\n' + error.message);

            // Hide progress
            document.getElementById('progressSection').classList.remove('show');
        }
    });
}

/**
 * Display results in UI
 */
function displayResults(result) {
    console.log('[Main] Displaying results...');

    const data = result.data;

    // Personal Data
    displayDataFields(data.personal_data, 'datosPersonales');

    // Electoral Data
    displayDataFields(data.electoral_data, 'datosElectorales');

    // Address
    displayDataFields(data.address, 'datosDomicilio');

    // Validation
    displayValidation(data.validation);

    // Detection Info
    displayDetectionInfo(data.detection, data.ocr_stats);

    // JSON
    document.getElementById('jsonOutput').textContent = JSON.stringify(result, null, 2);

    // Show results section
    document.getElementById('resultsSection').classList.add('show');

    // Hide progress section
    setTimeout(() => {
        document.getElementById('progressSection').classList.remove('show');
    }, 1000);

    // Show success alert
    const alert = document.createElement('div');
    alert.className = 'alert alert-success';
    alert.innerHTML = `
        <strong>✅ ¡Procesamiento Exitoso!</strong><br>
        Tiempo total: ${result.processingTime.toFixed(2)}ms<br>
        Calidad de extracción: ${data.quality.level.toUpperCase()}<br>
        Confianza promedio: ${data.metadata.ocr_confidence_avg.toFixed(1)}%
    `;
    document.querySelector('.container').insertBefore(
        alert,
        document.getElementById('resultsSection')
    );

    // Remove alert after 5 seconds
    setTimeout(() => alert.remove(), 5000);
}

/**
 * Display data fields in grid
 */
function displayDataFields(dataObject, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    for (const [key, value] of Object.entries(dataObject)) {
        if (typeof value === 'object' && value.valor !== undefined) {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'data-field';

            const label = document.createElement('label');
            label.textContent = formatFieldName(key);

            const valueDiv = document.createElement('div');
            valueDiv.className = 'value';
            valueDiv.textContent = value.valor || 'No detectado';

            // Add validation badge if available
            if (value.valido !== undefined) {
                const badge = document.createElement('span');
                badge.className = `valid-badge ${value.valido ? 'valid' : 'invalid'}`;
                badge.textContent = value.valido ? '✓ Válido' : '✗ Inválido';
                valueDiv.appendChild(badge);
            }

            const confidenceDiv = document.createElement('div');
            const confidenceClass = value.confianza >= 90 ? 'high' :
                                   value.confianza >= 70 ? 'medium' : 'low';
            confidenceDiv.className = `confidence ${confidenceClass}`;
            confidenceDiv.textContent = `Confianza: ${value.confianza}% • Fuente: ${value.fuente || 'ocr'}`;

            fieldDiv.appendChild(label);
            fieldDiv.appendChild(valueDiv);
            fieldDiv.appendChild(confidenceDiv);

            container.appendChild(fieldDiv);
        } else if (typeof value !== 'object') {
            // Simple field
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'data-field';

            const label = document.createElement('label');
            label.textContent = formatFieldName(key);

            const valueDiv = document.createElement('div');
            valueDiv.className = 'value';
            valueDiv.textContent = value;

            fieldDiv.appendChild(label);
            fieldDiv.appendChild(valueDiv);

            container.appendChild(fieldDiv);
        }
    }
}

/**
 * Display validation results
 */
function displayValidation(validation) {
    const container = document.getElementById('validacionInfo');
    container.innerHTML = '';

    if (!validation) {
        container.innerHTML = '<p>No hay información de validación disponible.</p>';
        return;
    }

    // Overall status
    const statusAlert = document.createElement('div');
    statusAlert.className = `alert ${validation.valid ? 'alert-success' : 'alert-danger'}`;
    statusAlert.innerHTML = `
        <h3>${validation.valid ? '✅ Datos Válidos' : '❌ Datos Inválidos'}</h3>
        <p>${validation.valid ?
            'Todos los campos principales pasaron la validación.' :
            'Se encontraron errores en algunos campos.'
        }</p>
    `;
    container.appendChild(statusAlert);

    // Errors
    if (validation.errors && validation.errors.length > 0) {
        const errorsDiv = document.createElement('div');
        errorsDiv.className = 'alert alert-danger';
        errorsDiv.innerHTML = '<h4>Errores:</h4><ul>' +
            validation.errors.map(err => `<li>${err}</li>`).join('') +
            '</ul>';
        container.appendChild(errorsDiv);
    }

    // Warnings
    if (validation.warnings && validation.warnings.length > 0) {
        const warningsDiv = document.createElement('div');
        warningsDiv.className = 'alert alert-warning';
        warningsDiv.innerHTML = '<h4>Advertencias:</h4><ul>' +
            validation.warnings.map(warn => `<li>${warn}</li>`).join('') +
            '</ul>';
        container.appendChild(warningsDiv);
    }

    // Field validations
    if (validation.fieldValidations) {
        const fieldsDiv = document.createElement('div');
        fieldsDiv.innerHTML = '<h4 style="margin-top: 20px;">Validación de Campos:</h4>';

        const grid = document.createElement('div');
        grid.className = 'data-grid';

        for (const [field, result] of Object.entries(validation.fieldValidations)) {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'data-field';

            const label = document.createElement('label');
            label.textContent = formatFieldName(field);

            const statusBadge = document.createElement('span');
            statusBadge.className = `valid-badge ${result.valid ? 'valid' : 'invalid'}`;
            statusBadge.textContent = result.valid ? '✓ Válido' : '✗ Inválido';

            const message = document.createElement('div');
            message.className = 'value';
            message.textContent = result.error || 'Campo válido';

            fieldDiv.appendChild(label);
            fieldDiv.appendChild(statusBadge);
            fieldDiv.appendChild(message);

            grid.appendChild(fieldDiv);
        }

        fieldsDiv.appendChild(grid);
        container.appendChild(fieldsDiv);
    }
}

/**
 * Display detection info
 */
function displayDetectionInfo(detection, ocrStats) {
    const container = document.getElementById('deteccionInfo');
    container.innerHTML = '';

    // Front detection
    const frontDiv = document.createElement('div');
    frontDiv.className = 'data-field';
    frontDiv.innerHTML = `
        <label>📄 Detección Anverso</label>
        <div class="value">
            ${detection.front.isINE ? '✅' : '❌'} ${detection.front.isINE ? 'INE Válida' : 'No es INE'}<br>
            <strong>Confianza:</strong> ${detection.front.confidence}%<br>
            <strong>Lado:</strong> ${detection.front.side === 'front' ? 'Anverso' : detection.front.side === 'back' ? 'Reverso' : 'Desconocido'}<br>
            <strong>Modelo:</strong> ${detection.front.model}
        </div>
        <div style="margin-top: 10px;">
            <strong>Razones:</strong>
            <ul style="margin: 5px 0 0 20px;">
                ${detection.front.reasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
        </div>
    `;
    container.appendChild(frontDiv);

    // Back detection
    const backDiv = document.createElement('div');
    backDiv.className = 'data-field';
    backDiv.innerHTML = `
        <label>📄 Detección Reverso</label>
        <div class="value">
            ${detection.back.isINE ? '✅' : '❌'} ${detection.back.isINE ? 'INE Válida' : 'No es INE'}<br>
            <strong>Confianza:</strong> ${detection.back.confidence}%<br>
            <strong>Lado:</strong> ${detection.back.side === 'front' ? 'Anverso' : detection.back.side === 'back' ? 'Reverso' : 'Desconocido'}<br>
            <strong>Modelo:</strong> ${detection.back.model}
        </div>
        <div style="margin-top: 10px;">
            <strong>Razones:</strong>
            <ul style="margin: 5px 0 0 20px;">
                ${detection.back.reasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
        </div>
    `;
    container.appendChild(backDiv);

    // OCR Stats
    const ocrDiv = document.createElement('div');
    ocrDiv.className = 'alert alert-info';
    ocrDiv.innerHTML = `
        <h4>📊 Estadísticas OCR</h4>
        <div class="data-grid">
            <div>
                <strong>Anverso:</strong><br>
                Método: ${ocrStats.front.method}<br>
                Confianza: ${ocrStats.front.confidence.toFixed(1)}%<br>
                Tiempo: ${ocrStats.front.processingTime.toFixed(2)}ms
            </div>
            <div>
                <strong>Reverso:</strong><br>
                Método: ${ocrStats.back.method}<br>
                Confianza: ${ocrStats.back.confidence.toFixed(1)}%<br>
                Tiempo: ${ocrStats.back.processingTime.toFixed(2)}ms
            </div>
        </div>
    `;
    container.appendChild(ocrDiv);
}

/**
 * Setup tabs
 */
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');

            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById('tab-' + tabName).classList.add('active');
        });
    });
}

/**
 * Setup export buttons
 */
function setupExportButtons() {
    // Copy JSON
    document.getElementById('btnCopyJson').addEventListener('click', () => {
        if (!currentResult) {
            alert('No hay datos para copiar');
            return;
        }

        const json = JSON.stringify(currentResult, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            const btn = document.getElementById('btnCopyJson');
            const originalText = btn.textContent;
            btn.textContent = '✅ Copiado!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    });

    // Download JSON
    document.getElementById('btnDownloadJson').addEventListener('click', () => {
        if (!currentResult) {
            alert('No hay datos para descargar');
            return;
        }

        app.downloadJSON();
    });
}

/**
 * Format field name
 */
function formatFieldName(key) {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

console.log('[Main] UI script loaded');
