/**
 * main.js - UI Logic for INE Scanner
 */

// State
let state = {
    frontFile: null,
    backFile: null,
    currentResults: null,
    isProcessing: false
};

// DOM Elements
const elements = {
    dropZoneFront: document.getElementById('dropZoneFront'),
    dropZoneBack: document.getElementById('dropZoneBack'),
    inputFront: document.getElementById('inputFront'),
    inputBack: document.getElementById('inputBack'),
    previewFront: document.getElementById('previewFront'),
    previewBack: document.getElementById('previewBack'),
    removeFront: document.getElementById('removeFront'),
    removeBack: document.getElementById('removeBack'),
    btnProcess: document.getElementById('btnProcess'),
    btnProcessFraud: document.getElementById('btnProcessFraud'),
    btnDemo: document.getElementById('btnDemo'),
    btnDownload: document.getElementById('btnDownload'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    statusMessage: document.getElementById('statusMessage'),
    results: document.getElementById('results'),
    resultSummary: document.getElementById('resultSummary'),
    fieldGrid: document.getElementById('fieldGrid'),
    antifraudContent: document.getElementById('antifraudContent'),
    jsonOutput: document.getElementById('jsonOutput')
};

// Initialize Application
// Note: app is declared in app.js as a global variable

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Main] Initializing UI...');

    // Setup event listeners
    setupDragAndDrop();
    setupFileInputs();
    setupButtons();
    setupTabs();

    // Initialize HernAI app
    try {
        console.log('[Main] Creating HernAI instance...');
        app = new HernAI();
        console.log('[Main] HernAI instance created successfully');

        updateStatus('Inicializando motores de IA...', 0);
        console.log('[Main] Starting app.initialize()...');

        await app.initialize((progress) => {
            const messages = {
                'image-processor': 'Cargando procesador de imágenes...',
                'card-detector': 'Cargando detector de tarjetas...',
                'ine-detector': 'Cargando detector de INE...',
                'ocr-engine': `Cargando OCR (${progress.stage || 'preparando'})...`,
                'ai-extractor': 'Cargando extractor de campos...',
                'complete': '✅ Sistema listo'
            };

            const message = messages[progress.component] || 'Inicializando...';
            updateStatus(message, progress.progress || 0);
        });

        updateStatus('✅ Sistema listo para escanear INE', 100);
        console.log('[Main] ✅ App initialized successfully. isInitialized:', app.isInitialized);

    } catch (error) {
        console.error('[Main] Initialization error:', error);
        updateStatus('❌ Error al inicializar: ' + error.message, 0);
        alert('Error al inicializar la aplicación. Por favor recarga la página.');
    }
});

// ============================================================================
// Drag & Drop
// ============================================================================

function setupDragAndDrop() {
    [elements.dropZoneFront, elements.dropZoneBack].forEach(dropZone => {
        dropZone.addEventListener('click', () => {
            const input = dropZone === elements.dropZoneFront ?
                elements.inputFront : elements.inputBack;
            input.click();
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleFileSelect(file, dropZone === elements.dropZoneFront ? 'front' : 'back');
            }
        });
    });

    // Remove image buttons
    elements.removeFront.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage('front');
    });

    elements.removeBack.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage('back');
    });
}

function setupFileInputs() {
    elements.inputFront.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileSelect(file, 'front');
        }
    });

    elements.inputBack.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileSelect(file, 'back');
        }
    });
}

function handleFileSelect(file, side) {
    console.log(`[Main] File selected for ${side}:`, file.name);

    if (side === 'front') {
        state.frontFile = file;
        previewImage(file, elements.previewFront, elements.dropZoneFront);
    } else {
        state.backFile = file;
        previewImage(file, elements.previewBack, elements.dropZoneBack);
    }

    updateButtonStates();
}

function previewImage(file, previewElement, dropZone) {
    const reader = new FileReader();
    reader.onload = (e) => {
        previewElement.src = e.target.result;
        dropZone.classList.add('has-image');
    };
    reader.readAsDataURL(file);
}

function removeImage(side) {
    if (side === 'front') {
        state.frontFile = null;
        elements.previewFront.src = '';
        elements.dropZoneFront.classList.remove('has-image');
        elements.inputFront.value = '';
    } else {
        state.backFile = null;
        elements.previewBack.src = '';
        elements.dropZoneBack.classList.remove('has-image');
        elements.inputBack.value = '';
    }

    updateButtonStates();
}

function updateButtonStates() {
    const hasBothImages = state.frontFile && state.backFile;
    elements.btnProcess.disabled = !hasBothImages || state.isProcessing;
    elements.btnProcessFraud.disabled = !hasBothImages || state.isProcessing;

    if (hasBothImages && !state.isProcessing) {
        updateStatus('✅ Listo para procesar', 100);
    } else if (!hasBothImages) {
        updateStatus('Sube las dos imágenes para comenzar', 0);
    }
}

// ============================================================================
// Processing
// ============================================================================

function setupButtons() {
    elements.btnProcess.addEventListener('click', () => processINE(false));
    elements.btnProcessFraud.addEventListener('click', () => processINE(true));
    elements.btnDemo.addEventListener('click', loadDemoImages);
    elements.btnDownload.addEventListener('click', downloadJSON);
}

async function processINE(withAntiFraud) {
    if (!state.frontFile || !state.backFile || !app) {
        return;
    }

    state.isProcessing = true;
    elements.btnProcess.disabled = true;
    elements.btnProcessFraud.disabled = true;
    elements.progressBar.classList.add('active');
    elements.results.classList.remove('active');

    try {
        console.log(`[Main] Starting processing (withAntiFraud=${withAntiFraud})...`);

        let result;

        if (withAntiFraud) {
            // Process with anti-fraud
            result = await app.runINEPipelineWithAntiFraud(
                state.frontFile,
                state.backFile,
                (progress) => {
                    updateProgress(progress);
                }
            );
        } else {
            // Process without anti-fraud (TODO: needs both sides support)
            // For now, process front only as demo
            result = await app.runINEPipeline(
                state.frontFile,
                (progress) => {
                    updateProgress(progress);
                }
            );
        }

        console.log('[Main] Processing complete:', result);

        state.currentResults = result;
        displayResults(result, withAntiFraud);

        updateStatus('✅ Procesamiento completado', 100);

    } catch (error) {
        console.error('[Main] Processing error:', error);
        updateStatus('❌ Error: ' + error.message, 0);
        alert('Error al procesar las imágenes: ' + error.message);

    } finally {
        state.isProcessing = false;
        elements.progressBar.classList.remove('active');
        updateButtonStates();
    }
}

function updateProgress(progress) {
    const percentage = progress.progress || 0;
    elements.progressFill.style.width = `${percentage}%`;

    const messages = {
        'preprocessing': '⚙️ Preprocesando imagen...',
        'classification': '🤖 Clasificando lado y modelo...',
        'ocr': '📝 Extrayendo texto con OCR...',
        'qr': '📱 Detectando códigos QR...',
        'postprocessing': '🔧 Procesando resultados...',
        'processing_front': '📄 Procesando anverso...',
        'processing_back': '📄 Procesando reverso...',
        'antifraud': '🛡️ Analizando anti-fraude...',
        'cross_validation': '✓ Validación cruzada...',
        'complete': '✅ Completado'
    };

    const message = messages[progress.stage] || 'Procesando...';
    updateStatus(message, percentage);
}

function updateStatus(message, percentage) {
    elements.statusMessage.textContent = message;

    if (percentage > 0) {
        elements.progressFill.style.width = `${percentage}%`;
    }
}

// ============================================================================
// Display Results
// ============================================================================

function displayResults(result, withAntiFraud) {
    console.log('[Main] Displaying results...');

    // Show results section
    elements.results.classList.add('active');

    // Display summary
    displaySummary(result, withAntiFraud);

    // Display fields
    displayFields(result, withAntiFraud);

    // Display anti-fraud (if applicable)
    if (withAntiFraud && result.antifraud) {
        displayAntiFraud(result.antifraud);
    }

    // Display JSON
    elements.jsonOutput.textContent = JSON.stringify(result, null, 2);

    // Scroll to results
    elements.results.scrollIntoView({ behavior: 'smooth' });
}

function displaySummary(result, withAntiFraud) {
    const summary = elements.resultSummary;
    summary.innerHTML = '';

    if (withAntiFraud) {
        // Anti-fraud mode: show combined results
        const confidence = result.confidence_overall || 0;
        const antiFraudScore = result.antifraud?.score || 0;
        const riskLevel = result.antifraud?.risk_level || 'unknown';
        const totalTime = result.timings_ms?.total || 0;

        summary.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Confianza General</div>
                <div class="stat-value ${getConfidenceClass(confidence)}">${confidence.toFixed(1)}%</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Score Anti-Fraude</div>
                <div class="stat-value ${getConfidenceClass(antiFraudScore)}">${antiFraudScore}/100</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Nivel de Riesgo</div>
                <div class="stat-value">
                    <span class="risk-badge risk-${riskLevel}">${riskLevel.toUpperCase()}</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Tiempo Total</div>
                <div class="stat-value">${(totalTime / 1000).toFixed(2)}s</div>
            </div>
        `;
    } else {
        // Normal mode: show single image results
        const confidence = result.confidence_overall || 0;
        const side = result.side || 'unknown';
        const model = result.model || 'unknown';

        summary.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Confianza</div>
                <div class="stat-value ${getConfidenceClass(confidence)}">${confidence.toFixed(1)}%</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Lado</div>
                <div class="stat-value">${side === 'front' ? 'Anverso' : 'Reverso'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Modelo</div>
                <div class="stat-value">${model}</div>
            </div>
        `;
    }
}

function displayFields(result, withAntiFraud) {
    const grid = elements.fieldGrid;
    grid.innerHTML = '';

    let fields = {};

    if (withAntiFraud && result.combined_fields) {
        fields = result.combined_fields;
    } else if (result.fields) {
        fields = result.fields;
    }

    const fieldNames = {
        'nombre': 'Nombre',
        'sexo': 'Sexo',
        'curp': 'CURP',
        'fecha_nacimiento': 'Fecha de Nacimiento',
        'domicilio': 'Domicilio',
        'clave_elector': 'Clave de Elector',
        'ocr_code': 'Código OCR',
        'seccion': 'Sección',
        'anio_registro': 'Año de Registro',
        'vigencia': 'Vigencia',
        'mrz': 'MRZ'
    };

    for (const [key, data] of Object.entries(fields)) {
        if (key === 'qr_payloads' || !data || typeof data !== 'object') continue;

        const fieldName = fieldNames[key] || key;
        const value = data.value || '-';
        const confidence = data.confidence || 0;
        const source = data.source || 'ocr';

        const fieldHTML = `
            <div class="field-item">
                <div class="field-label">${fieldName}</div>
                <div class="field-value">${value}</div>
                <div class="field-meta">
                    Confianza: ${confidence}% | Fuente: ${source}
                </div>
            </div>
        `;

        grid.innerHTML += fieldHTML;
    }
}

function displayAntiFraud(antifraud) {
    const container = elements.antifraudContent;

    const signals = antifraud.signals || {};
    const duplicate = signals.duplicate_detection || {};
    const moire = signals.moire_detection || {};
    const tampering = signals.tampering_detection || {};

    container.innerHTML = `
        <h3 style="margin-bottom: 15px;">Análisis de Fraude</h3>

        <div class="stat-card" style="margin-bottom: 20px;">
            <div class="stat-label">Score General Anti-Fraude</div>
            <div class="stat-value ${getConfidenceClass(antifraud.score)}">${antifraud.score}/100</div>
            <div style="margin-top: 10px;">
                <span class="risk-badge risk-${antifraud.risk_level}">${antifraud.risk_level.toUpperCase()}</span>
            </div>
        </div>

        <h4 style="margin: 20px 0 10px 0;">🔍 Detección de Duplicados</h4>
        <div class="field-item">
            <div class="field-label">¿Es duplicado?</div>
            <div class="field-value">${duplicate.is_duplicate ? '⚠️ SÍ' : '✅ NO'}</div>
            <div class="field-meta">Similitud: ${(duplicate.similarity || 0).toFixed(1)}% | Clasificación: ${duplicate.classification}</div>
        </div>

        <h4 style="margin: 20px 0 10px 0;">📱 Detección de Moiré (Recaptura)</h4>
        <div class="field-grid" style="margin-bottom: 20px;">
            <div class="field-item">
                <div class="field-label">Anverso</div>
                <div class="field-value">${moire.front?.has_moire ? '⚠️ Detectado' : '✅ OK'}</div>
                <div class="field-meta">Score: ${(moire.front?.score || 0).toFixed(3)} | Riesgo: ${moire.front?.risk || 'low'}</div>
            </div>
            <div class="field-item">
                <div class="field-label">Reverso</div>
                <div class="field-value">${moire.back?.has_moire ? '⚠️ Detectado' : '✅ OK'}</div>
                <div class="field-meta">Score: ${(moire.back?.score || 0).toFixed(3)} | Riesgo: ${moire.back?.risk || 'low'}</div>
            </div>
        </div>

        <h4 style="margin: 20px 0 10px 0;">✏️ Detección de Manipulación (ELA)</h4>
        <div class="field-grid">
            <div class="field-item">
                <div class="field-label">Anverso</div>
                <div class="field-value">${tampering.front?.is_manipulated ? '⚠️ Posible edición' : '✅ Sin ediciones'}</div>
                <div class="field-meta">Score: ${tampering.front?.score || 0} | Riesgo: ${tampering.front?.risk || 'low'}</div>
            </div>
            <div class="field-item">
                <div class="field-label">Reverso</div>
                <div class="field-value">${tampering.back?.is_manipulated ? '⚠️ Posible edición' : '✅ Sin ediciones'}</div>
                <div class="field-meta">Score: ${tampering.back?.score || 0} | Riesgo: ${tampering.back?.risk || 'low'}</div>
            </div>
        </div>
    `;
}

function getConfidenceClass(value) {
    if (value >= 80) return 'success';
    if (value >= 60) return 'warning';
    return 'danger';
}

// ============================================================================
// Tabs
// ============================================================================

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// ============================================================================
// Utilities
// ============================================================================

function downloadJSON() {
    if (!state.currentResults) {
        alert('No hay resultados para descargar');
        return;
    }

    const json = JSON.stringify(state.currentResults, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ine_scan_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[Main] JSON downloaded');
}

function loadDemoImages() {
    alert('Demo: Por favor sube tus propias imágenes de credencial INE.\n\nPara pruebas, puedes usar imágenes de ejemplo que encuentres en línea.');
}
