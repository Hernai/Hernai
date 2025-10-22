/**
 * Card Detector con OpenCV
 * Detecta automáticamente los bordes de la credencial INE
 * Extrae y rectifica la región para mejorar OCR
 */

class CardDetector {
    constructor() {
        this.isOpenCVReady = false;

        // Dimensiones estándar de credencial INE (mm)
        // Ratio: 85.6mm x 54mm = 1.585 aprox
        this.standardRatio = 1.585;

        // Dimensiones de salida (pixels)
        this.outputWidth = 1200;
        this.outputHeight = Math.round(this.outputWidth / this.standardRatio); // ~757px
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
            console.warn('[CardDetector] OpenCV not ready, returning original image');
            return { success: false, image: imageSource };
        }

        console.log('[CardDetector] Detecting card boundaries...');

        try {
            // Load image
            const canvas = this.imageToCanvas(imageSource);
            const src = cv.imread(canvas);

            // Detect card corners
            const corners = this.detectCardCorners(src);

            if (!corners) {
                console.warn('[CardDetector] Could not detect card corners, using original image');
                src.delete();
                return { success: false, image: imageSource, reason: 'no_corners' };
            }

            // Apply perspective transform to extract and rectify card
            const extracted = this.extractAndRectify(src, corners);

            // Convert to canvas
            const outputCanvas = document.createElement('canvas');
            cv.imshow(outputCanvas, extracted);

            src.delete();
            extracted.delete();

            console.log('[CardDetector] ✅ Card detected and extracted successfully');

            return {
                success: true,
                image: outputCanvas,
                dataURL: outputCanvas.toDataURL('image/png'),
                corners: corners,
                method: 'opencv_card_detection'
            };

        } catch (error) {
            console.error('[CardDetector] Card detection failed:', error);
            return { success: false, image: imageSource, error: error.message };
        }
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
