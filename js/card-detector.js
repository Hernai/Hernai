/**
 * Card Detector con OpenCV
 * Detecta automáticamente los bordes de la credencial INE
 * Extrae y rectifica la región para mejorar OCR
 */

class CardDetector {
    constructor() {
        this.isOpenCVReady = false;

        // Dimensiones estándar de credencial INE (mm)
        // ID-1 format: 85.6mm x 53.98mm ≈ 1.586 ratio
        this.standardRatio = 1.585;

        // Dimensiones de salida EXACTAS (pixels) según especificación
        // IMPORTANTE: SIEMPRE 1012×638px para normalización
        this.outputWidth = 1012;
        this.outputHeight = 638;
    }

    /**
     * Initialize OpenCV
     */
    async initialize() {
        if (this.isOpenCVReady) return;

        console.log('[CardDetector] Waiting for OpenCV...');

        return new Promise((resolve, reject) => {
            if (typeof cv === 'undefined') {
                console.warn('[CardDetector] OpenCV not loaded, card detection disabled');
                resolve(false);
                return;
            }

            if (cv.Mat) {
                this.isOpenCVReady = true;
                console.log('[CardDetector] OpenCV ready for card detection');
                resolve(true);
                return;
            }

            const checkInterval = setInterval(() => {
                if (cv.Mat) {
                    clearInterval(checkInterval);
                    this.isOpenCVReady = true;
                    console.log('[CardDetector] OpenCV initialized');
                    resolve(true);
                }
            }, 100);

            setTimeout(() => {
                clearInterval(checkInterval);
                if (!this.isOpenCVReady) {
                    console.warn('[CardDetector] OpenCV timeout');
                    resolve(false);
                }
            }, 10000);
        });
    }

    /**
     * Detect and extract card from image
     */
    async detectCard(imageSource) {
        if (!this.isOpenCVReady) {
            console.warn('[CardDetector] OpenCV not ready, using fallback normalization');
            return this.normalizeImageFallback(imageSource);
        }

        console.log('[CardDetector] Detecting card boundaries...');

        try {
            // Load image
            const canvas = this.imageToCanvas(imageSource);
            const src = cv.imread(canvas);

            // Detect card corners
            const corners = this.detectCardCorners(src);

            if (!corners) {
                console.warn('[CardDetector] Could not detect card corners, using fallback normalization');
                src.delete();
                return this.normalizeImageFallback(imageSource);
            }

            // Apply perspective transform to extract and rectify card
            const extracted = this.extractAndRectify(src, corners);

            // Convert to canvas
            const outputCanvas = document.createElement('canvas');
            cv.imshow(outputCanvas, extracted);

            src.delete();
            extracted.delete();

            console.log(`[CardDetector] ✅ Card detected and extracted (${this.outputWidth}×${this.outputHeight}px)`);

            return {
                success: true,
                image: outputCanvas,
                dataURL: outputCanvas.toDataURL('image/png'),
                width: this.outputWidth,
                height: this.outputHeight,
                corners: corners,
                method: 'opencv_card_detection'
            };

        } catch (error) {
            console.error('[CardDetector] Card detection failed:', error);
            return this.normalizeImageFallback(imageSource);
        }
    }

    /**
     * Fallback: normalize image to standard size without detection
     * Used when card boundaries cannot be detected
     */
    normalizeImageFallback(imageSource) {
        console.log('[CardDetector] Using fallback: normalizing to standard size');

        const canvas = this.imageToCanvas(imageSource);

        // Resize to standard dimensions maintaining aspect ratio
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = this.outputWidth;
        outputCanvas.height = this.outputHeight;

        const ctx = outputCanvas.getContext('2d');

        // Calculate scaling to fit image into output dimensions
        const scale = Math.min(
            this.outputWidth / canvas.width,
            this.outputHeight / canvas.height
        );

        const scaledWidth = canvas.width * scale;
        const scaledHeight = canvas.height * scale;

        // Center the image
        const x = (this.outputWidth - scaledWidth) / 2;
        const y = (this.outputHeight - scaledHeight) / 2;

        // Fill with white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, this.outputWidth, this.outputHeight);

        // Draw scaled image
        ctx.drawImage(canvas, x, y, scaledWidth, scaledHeight);

        console.log(`[CardDetector] ✅ Image normalized to ${this.outputWidth}×${this.outputHeight}px (fallback)`);

        return {
            success: true,
            image: outputCanvas,
            dataURL: outputCanvas.toDataURL('image/png'),
            width: this.outputWidth,
            height: this.outputHeight,
            corners: null,
            method: 'fallback_normalization'
        };
    }

    /**
     * Detect the 4 corners of the card
     */
    detectCardCorners(src) {
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const edges = new cv.Mat();
        const hierarchy = new cv.Mat();
        const contours = new cv.MatVector();

        try {
            // Convert to grayscale
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Blur to reduce noise
            cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

            // Detect edges
            cv.Canny(blurred, edges, 50, 150);

            // Dilate edges to connect broken lines
            const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
            cv.dilate(edges, edges, kernel);
            kernel.delete();

            // Find contours
            cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            console.log(`[CardDetector] Found ${contours.size()} contours`);

            // Find the largest rectangular contour
            let maxArea = 0;
            let bestCorners = null;

            for (let i = 0; i < contours.size(); i++) {
                const contour = contours.get(i);
                const area = cv.contourArea(contour);

                // Filter by minimum area (card should be significant portion of image)
                if (area < src.rows * src.cols * 0.1) {
                    contour.delete();
                    continue;
                }

                // Approximate contour to polygon
                const epsilon = 0.02 * cv.arcLength(contour, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(contour, approx, epsilon, true);

                // Check if it's a quadrilateral (4 corners)
                if (approx.rows === 4 && area > maxArea) {
                    // Verify aspect ratio is close to INE card ratio
                    const rect = cv.minAreaRect(contour);
                    const aspectRatio = Math.max(rect.size.width, rect.size.height) /
                                       Math.min(rect.size.width, rect.size.height);

                    // INE aspect ratio ~1.585 ± 0.3 tolerance
                    if (Math.abs(aspectRatio - this.standardRatio) < 0.5) {
                        maxArea = area;
                        if (bestCorners) bestCorners.delete();
                        bestCorners = approx.clone();
                    }
                }

                approx.delete();
                contour.delete();
            }

            // Clean up
            gray.delete();
            blurred.delete();
            edges.delete();
            hierarchy.delete();
            contours.delete();

            if (!bestCorners) {
                console.warn('[CardDetector] No valid card contour found');
                return null;
            }

            // Extract corner points
            const corners = this.orderCorners(bestCorners);
            bestCorners.delete();

            console.log('[CardDetector] Card corners detected:', corners);
            return corners;

        } catch (error) {
            console.error('[CardDetector] Corner detection failed:', error);
            // Clean up any remaining mats
            try {
                gray.delete();
                blurred.delete();
                edges.delete();
                hierarchy.delete();
                contours.delete();
            } catch (e) {}
            return null;
        }
    }

    /**
     * Order corners: top-left, top-right, bottom-right, bottom-left
     */
    orderCorners(cornersMat) {
        const points = [];
        for (let i = 0; i < cornersMat.rows; i++) {
            points.push({
                x: cornersMat.data32S[i * 2],
                y: cornersMat.data32S[i * 2 + 1]
            });
        }

        // Sort by y coordinate
        points.sort((a, b) => a.y - b.y);

        // Top two points
        const topPoints = points.slice(0, 2);
        const bottomPoints = points.slice(2, 4);

        // Sort top points by x (left, right)
        topPoints.sort((a, b) => a.x - b.x);
        const topLeft = topPoints[0];
        const topRight = topPoints[1];

        // Sort bottom points by x (left, right)
        bottomPoints.sort((a, b) => a.x - b.x);
        const bottomLeft = bottomPoints[0];
        const bottomRight = bottomPoints[1];

        return [topLeft, topRight, bottomRight, bottomLeft];
    }

    /**
     * Extract and rectify card using perspective transform
     */
    extractAndRectify(src, corners) {
        const [topLeft, topRight, bottomRight, bottomLeft] = corners;

        // Source points (detected corners)
        const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            topLeft.x, topLeft.y,
            topRight.x, topRight.y,
            bottomRight.x, bottomRight.y,
            bottomLeft.x, bottomLeft.y
        ]);

        // Destination points (rectangular output)
        const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            this.outputWidth, 0,
            this.outputWidth, this.outputHeight,
            0, this.outputHeight
        ]);

        // Get perspective transform matrix
        const M = cv.getPerspectiveTransform(srcPoints, dstPoints);

        // Apply transform
        const dsize = new cv.Size(this.outputWidth, this.outputHeight);
        const extracted = new cv.Mat();
        cv.warpPerspective(src, extracted, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        srcPoints.delete();
        dstPoints.delete();
        M.delete();

        return extracted;
    }

    /**
     * Detect orientation by reading header text "CREDENCIAL PARA VOTAR"
     * Rotates image automatically if needed (180°, ±90°)
     * @param {cv.Mat} cardMat - Card image after perspective correction
     * @param {Object} ocrEngine - OCR engine instance for quick text detection
     * @returns {cv.Mat} Correctly oriented card
     */
    async detectAndCorrectOrientation(cardMat, ocrEngine) {
        if (!this.isOpenCVReady || !ocrEngine) {
            console.warn('[CardDetector] Skipping orientation detection (OpenCV or OCR not available)');
            return cardMat;
        }

        console.log('[CardDetector] Detecting card orientation...');

        try {
            // Extract header region (top 20% of card where "CREDENCIAL PARA VOTAR" should be)
            const headerHeight = Math.floor(cardMat.rows * 0.20);
            const headerRegion = cardMat.roi(new cv.Rect(0, 0, cardMat.cols, headerHeight));

            // Convert to canvas for OCR
            const headerCanvas = document.createElement('canvas');
            cv.imshow(headerCanvas, headerRegion);
            headerRegion.delete();

            // Quick OCR with PSM 3 (auto page segmentation)
            const ocrResult = await ocrEngine.recognizeWithWhitelist(headerCanvas, {
                psm: 3,
                whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑ '
            });

            const text = (ocrResult.text || '').toUpperCase().replace(/\s+/g, ' ');
            console.log('[CardDetector] Header text detected:', text.substring(0, 50));

            // Check if header contains expected keywords
            const hasCredencial = text.includes('CREDENCIAL');
            const hasVotar = text.includes('VOTAR');
            const hasINE = text.includes('INE') || text.includes('INSTITUTO');

            // Orientation is correct if we find the expected text
            if (hasCredencial || hasVotar || hasINE) {
                console.log('[CardDetector] ✅ Card orientation is correct');
                return cardMat;
            }

            // Try 180° rotation
            console.log('[CardDetector] Trying 180° rotation...');
            const rotated180 = new cv.Mat();
            cv.rotate(cardMat, rotated180, cv.ROTATE_180);

            const headerRegion180 = rotated180.roi(new cv.Rect(0, 0, rotated180.cols, headerHeight));
            const headerCanvas180 = document.createElement('canvas');
            cv.imshow(headerCanvas180, headerRegion180);
            headerRegion180.delete();

            const ocrResult180 = await ocrEngine.recognizeWithWhitelist(headerCanvas180, {
                psm: 3,
                whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑ '
            });

            const text180 = (ocrResult180.text || '').toUpperCase().replace(/\s+/g, ' ');
            console.log('[CardDetector] Header text at 180°:', text180.substring(0, 50));

            if (text180.includes('CREDENCIAL') || text180.includes('VOTAR') || text180.includes('INE')) {
                console.log('[CardDetector] ✅ Card was upside down, rotated 180°');
                cardMat.delete();
                return rotated180;
            }

            // If neither 0° nor 180° works, try 90° clockwise
            console.log('[CardDetector] Trying 90° rotation...');
            rotated180.delete();
            const rotated90 = new cv.Mat();
            cv.rotate(cardMat, rotated90, cv.ROTATE_90_CLOCKWISE);

            // For 90° rotation, check left edge (now top)
            const leftEdge = rotated90.roi(new cv.Rect(0, 0, rotated90.cols, Math.floor(rotated90.rows * 0.20)));
            const leftCanvas = document.createElement('canvas');
            cv.imshow(leftCanvas, leftEdge);
            leftEdge.delete();

            const ocrResult90 = await ocrEngine.recognizeWithWhitelist(leftCanvas, {
                psm: 3,
                whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑ '
            });

            const text90 = (ocrResult90.text || '').toUpperCase().replace(/\s+/g, ' ');

            if (text90.includes('CREDENCIAL') || text90.includes('VOTAR')) {
                console.log('[CardDetector] ✅ Card was rotated 90° CW');
                cardMat.delete();
                return rotated90;
            }

            // Try 270° (90° CCW)
            rotated90.delete();
            const rotated270 = new cv.Mat();
            cv.rotate(cardMat, rotated270, cv.ROTATE_90_COUNTERCLOCKWISE);

            console.log('[CardDetector] ⚠️ Could not detect orientation reliably, using original');
            rotated270.delete();
            return cardMat;

        } catch (error) {
            console.error('[CardDetector] Orientation detection failed:', error);
            return cardMat;
        }
    }

    /**
     * Crop white margins left by perspective transform
     * @param {cv.Mat} cardMat - Card image with potential white margins
     * @returns {cv.Mat} Cropped card without margins
     */
    cropWhiteMargins(cardMat) {
        if (!this.isOpenCVReady) {
            return cardMat;
        }

        console.log('[CardDetector] Cropping white margins...');

        try {
            // Convert to grayscale
            const gray = new cv.Mat();
            cv.cvtColor(cardMat, gray, cv.COLOR_RGBA2GRAY);

            // Threshold to find non-white regions (card content)
            const binary = new cv.Mat();
            cv.threshold(gray, binary, 245, 255, cv.THRESH_BINARY_INV);

            // Find bounding box of non-white content
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let minX = cardMat.cols, minY = cardMat.rows;
            let maxX = 0, maxY = 0;

            for (let i = 0; i < contours.size(); i++) {
                const contour = contours.get(i);
                const rect = cv.boundingRect(contour);

                minX = Math.min(minX, rect.x);
                minY = Math.min(minY, rect.y);
                maxX = Math.max(maxX, rect.x + rect.width);
                maxY = Math.max(maxY, rect.y + rect.height);

                contour.delete();
            }

            gray.delete();
            binary.delete();
            contours.delete();
            hierarchy.delete();

            // Add small margin (2% of dimensions)
            const marginX = Math.floor(cardMat.cols * 0.02);
            const marginY = Math.floor(cardMat.rows * 0.02);

            minX = Math.max(0, minX - marginX);
            minY = Math.max(0, minY - marginY);
            maxX = Math.min(cardMat.cols, maxX + marginX);
            maxY = Math.min(cardMat.rows, maxY + marginY);

            const width = maxX - minX;
            const height = maxY - minY;

            // Only crop if margins are significant (> 5% on any side)
            const topMargin = minY / cardMat.rows;
            const bottomMargin = (cardMat.rows - maxY) / cardMat.rows;
            const leftMargin = minX / cardMat.cols;
            const rightMargin = (cardMat.cols - maxX) / cardMat.cols;

            if (topMargin > 0.05 || bottomMargin > 0.05 || leftMargin > 0.05 || rightMargin > 0.05) {
                console.log(`[CardDetector] Cropping margins: top=${(topMargin*100).toFixed(1)}%, bottom=${(bottomMargin*100).toFixed(1)}%, left=${(leftMargin*100).toFixed(1)}%, right=${(rightMargin*100).toFixed(1)}%`);

                const cropped = cardMat.roi(new cv.Rect(minX, minY, width, height));
                const croppedClone = cropped.clone();
                cropped.delete();
                cardMat.delete();

                return croppedClone;
            } else {
                console.log('[CardDetector] No significant margins to crop');
                return cardMat;
            }

        } catch (error) {
            console.error('[CardDetector] Margin cropping failed:', error);
            return cardMat;
        }
    }

    /**
     * Segment regions of interest (text areas vs photo)
     * Returns mask for text-only regions
     */
    segmentTextRegions(cardImage) {
        if (!this.isOpenCVReady) {
            return null;
        }

        console.log('[CardDetector] Segmenting text regions (excluding photo)...');

        try {
            const src = typeof cardImage === 'string' ? cv.imread(this.imageToCanvas(cardImage)) : cardImage.clone();
            const mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

            // INE frontal layout (approximate):
            // - Foto: ~25% izquierda, vertical
            // - Texto: ~75% derecha

            const photoWidth = Math.floor(src.cols * 0.30);  // 30% para foto + margen
            const textStartX = photoWidth;

            // Create mask: everything EXCEPT photo area
            const textRect = new cv.Rect(textStartX, 0, src.cols - textStartX, src.rows);
            const white = new cv.Scalar(255, 255, 255, 255);
            cv.rectangle(mask,
                new cv.Point(textRect.x, textRect.y),
                new cv.Point(textRect.x + textRect.width, textRect.y + textRect.height),
                white, -1);

            console.log('[CardDetector] Text region mask created (excluding photo)');

            src.delete();
            return mask;

        } catch (error) {
            console.error('[CardDetector] Region segmentation failed:', error);
            return null;
        }
    }

    /**
     * Apply mask to image to keep only text regions
     */
    applyTextMask(cardImage, mask) {
        if (!mask || !this.isOpenCVReady) {
            return cardImage;
        }

        try {
            const src = cv.imread(this.imageToCanvas(cardImage));
            const masked = new cv.Mat();

            // Apply mask: keep only text regions, zero out photo
            cv.bitwise_and(src, src, masked, mask);

            const outputCanvas = document.createElement('canvas');
            cv.imshow(outputCanvas, masked);

            src.delete();
            masked.delete();

            return outputCanvas;

        } catch (error) {
            console.error('[CardDetector] Mask application failed:', error);
            return cardImage;
        }
    }

    /**
     * Convert image source to canvas
     */
    imageToCanvas(imageSource) {
        if (imageSource instanceof HTMLCanvasElement) {
            return imageSource;
        }

        if (imageSource instanceof HTMLImageElement) {
            const canvas = document.createElement('canvas');
            canvas.width = imageSource.width;
            canvas.height = imageSource.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageSource, 0, 0);
            return canvas;
        }

        if (typeof imageSource === 'string') {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.src = imageSource;
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            return canvas;
        }

        throw new Error('Invalid image source type');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CardDetector;
}
