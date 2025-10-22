/**
 * Procesador de Imágenes con OpenCV.js
 * Mejora la calidad de imágenes antes del OCR
 */

class ImageProcessor {
    constructor() {
        this.isOpenCVReady = false;
        this.cardDetector = new CardDetector();  // Card detection and extraction
        this.config = {
            autoRotate: true,
            autoContrast: true,
            autoDenoising: true,
            autoPerspective: true,
            autoCardDetection: true,  // Enable automatic card detection
            targetSize: { width: 1600, height: 1000 }, // Optimal for OCR
        };
    }

    /**
     * Initialize OpenCV.js
     */
    async initialize() {
        if (this.isOpenCVReady) {
            console.log('[ImageProcessor] OpenCV already initialized');
            return;
        }

        return new Promise((resolve, reject) => {
            if (typeof cv === 'undefined') {
                console.warn('[ImageProcessor] OpenCV.js not loaded, using fallback methods');
                resolve(false);
                return;
            }

            if (cv.Mat) {
                this.isOpenCVReady = true;
                // Initialize card detector
                this.cardDetector.initialize();
                console.log('[ImageProcessor] OpenCV.js ready');
                resolve(true);
                return;
            }

            // Wait for OpenCV to be ready
            const checkInterval = setInterval(() => {
                if (cv.Mat) {
                    clearInterval(checkInterval);
                    this.isOpenCVReady = true;
                    // Initialize card detector
                    this.cardDetector.initialize();
                    console.log('[ImageProcessor] OpenCV.js initialized');
                    resolve(true);
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!this.isOpenCVReady) {
                    console.warn('[ImageProcessor] OpenCV initialization timeout, using fallback');
                    resolve(false);
                }
            }, 10000);
        });
    }

    /**
     * Process image with all enhancements
     */
    async process(imageSource, options = {}) {
        console.log('[ImageProcessor] Starting image processing...');
        const startTime = performance.now();

        const config = { ...this.config, ...options };

        try {
            // Load image
            const image = await this.loadImage(imageSource);
            let processedCanvas = this.imageToCanvas(image);

            // Step 1: Resize if too large
            if (config.autoResize !== false) {
                processedCanvas = await this.resize(processedCanvas, config.targetSize);
            }

            // Step 2: Detect and correct rotation
            if (config.autoRotate) {
                const rotation = await this.detectRotation(processedCanvas);
                if (rotation.angle !== 0) {
                    console.log(`[ImageProcessor] Rotating image by ${rotation.angle}°`);
                    processedCanvas = await this.rotate(processedCanvas, rotation.angle);
                }
            }

            // Step 3: Perspective correction (if OpenCV available)
            if (config.autoPerspective && this.isOpenCVReady) {
                processedCanvas = await this.correctPerspective(processedCanvas);
            }

            // Step 4: Enhance contrast and brightness
            if (config.autoContrast) {
                processedCanvas = await this.enhanceContrast(processedCanvas);
            }

            // Step 5: Denoise
            if (config.autoDenoising && this.isOpenCVReady) {
                processedCanvas = await this.denoise(processedCanvas);
            }

            // Step 6: Sharpen
            if (config.sharpen !== false) {
                processedCanvas = await this.sharpen(processedCanvas);
            }

            // Step 7: Binarization (convert to black & white for OCR)
            if (config.binarize !== false) {
                processedCanvas = await this.binarize(processedCanvas);
            }

            const processingTime = performance.now() - startTime;
            console.log(`[ImageProcessor] Processing complete in ${processingTime.toFixed(2)}ms`);

            return {
                canvas: processedCanvas,
                dataURL: processedCanvas.toDataURL('image/png'),
                processingTime
            };

        } catch (error) {
            console.error('[ImageProcessor] Processing failed:', error);
            throw new Error('Error en procesamiento de imagen: ' + error.message);
        }
    }

    /**
     * Detect image rotation angle
     */
    async detectRotation(canvas) {
        console.log('[ImageProcessor] Detecting rotation...');

        if (!this.isOpenCVReady) {
            return { angle: 0, method: 'opencv_unavailable' };
        }

        try {
            const src = cv.imread(canvas);
            const gray = new cv.Mat();
            const edges = new cv.Mat();

            // Convert to grayscale
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Detect edges
            cv.Canny(gray, edges, 50, 150, 3, false);

            // Detect lines using Hough Transform
            const lines = new cv.Mat();
            cv.HoughLines(edges, lines, 1, Math.PI / 180, 100, 0, 0, 0, Math.PI);

            // Calculate dominant angle
            const angles = [];
            for (let i = 0; i < Math.min(lines.rows, 50); i++) {
                const theta = lines.data32F[i * 2 + 1];
                let angle = (theta * 180 / Math.PI) - 90;

                // Normalize to [-45, 45]
                while (angle < -45) angle += 90;
                while (angle > 45) angle -= 90;

                angles.push(angle);
            }

            // Clean up
            src.delete();
            gray.delete();
            edges.delete();
            lines.delete();

            if (angles.length === 0) {
                return { angle: 0, method: 'no_lines_detected' };
            }

            // Get median angle
            angles.sort((a, b) => a - b);
            const medianAngle = angles[Math.floor(angles.length / 2)];

            // Round to nearest 90 degrees if close enough
            let finalAngle = medianAngle;
            if (Math.abs(medianAngle) < 5) finalAngle = 0;
            else if (Math.abs(medianAngle - 90) < 5) finalAngle = 90;
            else if (Math.abs(medianAngle + 90) < 5) finalAngle = -90;
            else if (Math.abs(Math.abs(medianAngle) - 180) < 5) finalAngle = 180;

            return {
                angle: finalAngle,
                method: 'hough_transform',
                confidence: Math.min(95, angles.length * 2)
            };

        } catch (error) {
            console.error('[ImageProcessor] Rotation detection failed:', error);
            return { angle: 0, method: 'error' };
        }
    }

    /**
     * Rotate image by angle
     */
    async rotate(canvas, angle) {
        if (angle === 0) return canvas;

        console.log(`[ImageProcessor] Rotating by ${angle}°...`);

        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');

        // Adjust canvas size for rotation
        if (Math.abs(angle) === 90 || Math.abs(angle) === 270) {
            tempCanvas.width = canvas.height;
            tempCanvas.height = canvas.width;
        } else {
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
        }

        // Rotate
        ctx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
        ctx.rotate(angle * Math.PI / 180);
        ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

        return tempCanvas;
    }

    /**
     * Correct perspective distortion
     */
    async correctPerspective(canvas) {
        if (!this.isOpenCVReady) {
            return canvas;
        }

        console.log('[ImageProcessor] Correcting perspective...');

        try {
            const src = cv.imread(canvas);
            const gray = new cv.Mat();
            const blurred = new cv.Mat();
            const edges = new cv.Mat();
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();

            // Convert to grayscale and blur
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

            // Detect edges
            cv.Canny(blurred, edges, 75, 200);

            // Find contours
            cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            // Find largest rectangular contour
            let maxArea = 0;
            let bestContour = null;

            for (let i = 0; i < contours.size(); i++) {
                const contour = contours.get(i);
                const area = cv.contourArea(contour);
                const perimeter = cv.arcLength(contour, true);
                const approx = new cv.Mat();

                cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

                if (approx.rows === 4 && area > maxArea) {
                    maxArea = area;
                    bestContour = approx;
                }
            }

            // If we found a good rectangular contour, apply perspective transform
            if (bestContour && maxArea > (src.cols * src.rows * 0.5)) {
                console.log('[ImageProcessor] Applying perspective correction...');

                // Extract corner points
                const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
                    bestContour.data32F[0], bestContour.data32F[1],
                    bestContour.data32F[2], bestContour.data32F[3],
                    bestContour.data32F[4], bestContour.data32F[5],
                    bestContour.data32F[6], bestContour.data32F[7]
                ]);

                // Define destination points
                const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
                    0, 0,
                    src.cols, 0,
                    src.cols, src.rows,
                    0, src.rows
                ]);

                // Get perspective transform matrix
                const M = cv.getPerspectiveTransform(srcPoints, dstPoints);
                const dst = new cv.Mat();

                // Apply transform
                cv.warpPerspective(src, dst, M, new cv.Size(src.cols, src.rows));

                // Convert back to canvas
                const outputCanvas = document.createElement('canvas');
                cv.imshow(outputCanvas, dst);

                // Clean up
                M.delete();
                dst.delete();
                srcPoints.delete();
                dstPoints.delete();

                src.delete();
                gray.delete();
                blurred.delete();
                edges.delete();
                contours.delete();
                hierarchy.delete();

                return outputCanvas;
            }

            // No perspective correction needed or failed
            src.delete();
            gray.delete();
            blurred.delete();
            edges.delete();
            contours.delete();
            hierarchy.delete();

            return canvas;

        } catch (error) {
            console.error('[ImageProcessor] Perspective correction failed:', error);
            return canvas;
        }
    }

    /**
     * Enhance contrast and brightness
     */
    async enhanceContrast(canvas) {
        console.log('[ImageProcessor] Enhancing contrast with aggressive CLAHE...');

        if (this.isOpenCVReady) {
            try {
                const src = cv.imread(canvas);
                const gray = new cv.Mat();
                const clahed = new cv.Mat();
                const enhanced = new cv.Mat();

                // Convert to grayscale
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

                // Apply CLAHE with AGGRESSIVE parameters for better character separation
                // clipLimit 4.0 = más contraste, tileGridSize 4x4 = más local/preciso
                const clahe = new cv.CLAHE(4.0, new cv.Size(4, 4));
                clahe.apply(gray, clahed);

                // Additional contrast stretching to maximize black/white separation
                cv.normalize(clahed, enhanced, 0, 255, cv.NORM_MINMAX);

                const outputCanvas = document.createElement('canvas');
                cv.imshow(outputCanvas, enhanced);

                src.delete();
                gray.delete();
                clahed.delete();
                enhanced.delete();

                return outputCanvas;
            } catch (error) {
                console.error('[ImageProcessor] CLAHE failed, using fallback:', error);
            }
        }

        // Fallback: Canvas-based contrast enhancement with stronger parameters
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Aggressive contrast enhancement
        const factor = 1.5; // Increased contrast factor
        const intercept = 128 * (1 - factor);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, factor * data[i] + intercept)); // R
            data[i + 1] = Math.min(255, Math.max(0, factor * data[i + 1] + intercept)); // G
            data[i + 2] = Math.min(255, Math.max(0, factor * data[i + 2] + intercept)); // B
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /**
     * Denoise image
     */
    async denoise(canvas) {
        if (!this.isOpenCVReady) {
            return canvas;
        }

        console.log('[ImageProcessor] Denoising...');

        try {
            const src = cv.imread(canvas);
            const dst = new cv.Mat();

            // Apply Non-Local Means Denoising
            cv.fastNlMeansDenoising(src, dst, 10, 7, 21);

            const outputCanvas = document.createElement('canvas');
            cv.imshow(outputCanvas, dst);

            src.delete();
            dst.delete();

            return outputCanvas;
        } catch (error) {
            console.error('[ImageProcessor] Denoising failed:', error);
            return canvas;
        }
    }

    /**
     * Sharpen image
     */
    async sharpen(canvas) {
        console.log('[ImageProcessor] Sharpening...');

        if (this.isOpenCVReady) {
            try {
                const src = cv.imread(canvas);
                const dst = new cv.Mat();

                // Sharpening kernel
                const kernel = cv.matFromArray(3, 3, cv.CV_32F, [
                    0, -1, 0,
                    -1, 5, -1,
                    0, -1, 0
                ]);

                cv.filter2D(src, dst, cv.CV_8U, kernel);

                const outputCanvas = document.createElement('canvas');
                cv.imshow(outputCanvas, dst);

                src.delete();
                dst.delete();
                kernel.delete();

                return outputCanvas;
            } catch (error) {
                console.error('[ImageProcessor] Sharpening failed:', error);
            }
        }

        return canvas;
    }

    /**
     * Advanced binarization optimized to prevent character merging
     */
    async binarize(canvas) {
        console.log('[ImageProcessor] Binarizing with OCR-optimized parameters...');

        if (this.isOpenCVReady) {
            try {
                const src = cv.imread(canvas);
                const gray = new cv.Mat();
                const binary = new cv.Mat();
                const morphed = new cv.Mat();

                // Convert to grayscale
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

                // Apply adaptive thresholding with AGGRESSIVE parameters to SEPARATE words
                // Even larger block size and higher C value to maximize separation
                cv.adaptiveThreshold(
                    gray, binary, 255,
                    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv.THRESH_BINARY, 25, 10  // Máximo separación: block=25, C=10
                );

                // Use STRONGER EROSION to separate touching characters/words (2 iterations)
                const erodeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 1));
                cv.erode(binary, morphed, erodeKernel, new cv.Point(-1, -1), 2);

                // Remove tiny noise with small opening
                const noiseKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
                cv.morphologyEx(morphed, morphed, cv.MORPH_OPEN, noiseKernel);

                const outputCanvas = document.createElement('canvas');
                cv.imshow(outputCanvas, morphed);

                src.delete();
                gray.delete();
                binary.delete();
                morphed.delete();
                erodeKernel.delete();
                noiseKernel.delete();

                return outputCanvas;
            } catch (error) {
                console.error('[ImageProcessor] Advanced binarization failed:', error);
            }
        }

        return canvas;
    }

    /**
     * Deskew image (correct text skew/slant)
     */
    async deskew(canvas) {
        if (!this.isOpenCVReady) {
            return canvas;
        }

        console.log('[ImageProcessor] Deskewing image...');

        try {
            const src = cv.imread(canvas);
            const gray = new cv.Mat();
            const binary = new cv.Mat();
            const coords = new cv.Mat();

            // Convert to grayscale
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Binarize
            cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

            // Find all non-zero coordinates
            cv.findNonZero(binary, coords);

            if (coords.rows > 100) {  // Need enough points
                // Get rotated bounding box
                const rect = cv.minAreaRect(coords);
                let angle = rect.angle;

                // Adjust angle based on size
                if (rect.size.width < rect.size.height) {
                    angle = angle + 90;
                }

                // Only correct small angles (< 45 degrees)
                if (Math.abs(angle) < 45 && Math.abs(angle) > 0.5) {
                    console.log(`[ImageProcessor] Correcting skew angle: ${angle.toFixed(2)}°`);

                    // Rotate to deskew
                    const center = new cv.Point(src.cols / 2, src.rows / 2);
                    const rotMat = cv.getRotationMatrix2D(center, angle, 1.0);
                    const deskewed = new cv.Mat();

                    cv.warpAffine(src, deskewed, rotMat, src.size(), cv.INTER_CUBIC, cv.BORDER_REPLICATE);

                    const outputCanvas = document.createElement('canvas');
                    cv.imshow(outputCanvas, deskewed);

                    src.delete();
                    gray.delete();
                    binary.delete();
                    coords.delete();
                    rotMat.delete();
                    deskewed.delete();

                    return outputCanvas;
                }
            }

            src.delete();
            gray.delete();
            binary.delete();
            coords.delete();

        } catch (error) {
            console.error('[ImageProcessor] Deskewing failed:', error);
        }

        return canvas;
    }

    /**
     * Process specifically for INE credentials with all advanced techniques
     */
    async processForINE(imageSource) {
        console.log('[ImageProcessor] Processing with INE-optimized pipeline + card detection...');
        const startTime = performance.now();

        try {
            // Load image
            const image = await this.loadImage(imageSource);
            let processedCanvas = this.imageToCanvas(image);

            // STEP 0: CARD DETECTION - Extract card region FIRST (excluding background, hands, etc.)
            if (this.config.autoCardDetection && this.isOpenCVReady) {
                console.log('[ImageProcessor] 🎯 Detecting and extracting card boundaries...');
                const cardResult = await this.cardDetector.detectCard(processedCanvas);

                if (cardResult.success) {
                    processedCanvas = cardResult.image;
                    console.log('[ImageProcessor] ✅ Card extracted successfully - now processing only card region');
                } else {
                    console.warn('[ImageProcessor] ⚠️ Card detection failed, using full image:', cardResult.reason);
                }
            }

            // STEP 0b: SEGMENT TEXT REGIONS - Exclude photo area
            let textMask = null;
            if (this.isOpenCVReady) {
                console.log('[ImageProcessor] 📐 Segmenting text regions (excluding photo)...');
                textMask = this.cardDetector.segmentTextRegions(processedCanvas);
                if (textMask) {
                    console.log('[ImageProcessor] ✅ Text region mask created');
                }
            }

            // Step 1: Resize to optimal dimensions
            processedCanvas = await this.resize(processedCanvas, { width: 1800, height: 1200 });

            // Step 2: Detect and correct rotation (90/180/270)
            const rotation = await this.detectRotation(processedCanvas);
            if (rotation.angle !== 0) {
                processedCanvas = await this.rotate(processedCanvas, rotation.angle);
            }

            // Step 3: Deskew (correct small angle skew)
            if (this.isOpenCVReady) {
                processedCanvas = await this.deskew(processedCanvas);
            }

            // Step 4: Skip perspective correction (already done by card detection)
            // The card detection already applies perspective transform

            // Step 5: Enhanced contrast with CLAHE - ONLY on text regions
            processedCanvas = await this.enhanceContrast(processedCanvas);

            // Step 6: Denoise - ONLY on text regions
            if (this.isOpenCVReady) {
                processedCanvas = await this.denoise(processedCanvas);
            }

            // Step 7: Sharpen text - ONLY on text regions
            processedCanvas = await this.sharpen(processedCanvas);

            // Step 8: Advanced binarization with morphology - ONLY on text regions
            processedCanvas = await this.binarize(processedCanvas);

            // Step 9: Apply text mask to zero out photo area
            if (textMask && this.isOpenCVReady) {
                console.log('[ImageProcessor] 🎭 Applying text mask (zeroing photo area)...');
                processedCanvas = this.cardDetector.applyTextMask(processedCanvas, textMask);
                textMask.delete();
            }

            const processingTime = performance.now() - startTime;
            console.log(`[ImageProcessor] ✅ INE processing complete in ${processingTime.toFixed(2)}ms`);

            return {
                canvas: processedCanvas,
                dataURL: processedCanvas.toDataURL('image/png'),
                processingTime,
                pipeline: 'ine_optimized_with_card_detection'
            };

        } catch (error) {
            console.error('[ImageProcessor] INE processing failed:', error);
            throw new Error('Error en procesamiento optimizado de INE: ' + error.message);
        }
    }

    /**
     * Resize image
     */
    async resize(canvas, targetSize) {
        const { width, height } = targetSize;

        // Calculate aspect-preserving dimensions
        const aspectRatio = canvas.width / canvas.height;
        let newWidth, newHeight;

        if (canvas.width > width || canvas.height > height) {
            if (aspectRatio > 1) {
                newWidth = Math.min(width, canvas.width);
                newHeight = newWidth / aspectRatio;
            } else {
                newHeight = Math.min(height, canvas.height);
                newWidth = newHeight * aspectRatio;
            }

            console.log(`[ImageProcessor] Resizing from ${canvas.width}x${canvas.height} to ${Math.round(newWidth)}x${Math.round(newHeight)}`);

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = newWidth;
            tempCanvas.height = newHeight;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0, newWidth, newHeight);

            return tempCanvas;
        }

        return canvas;
    }

    /**
     * Helper: Load image from source
     */
    async loadImage(source) {
        return new Promise((resolve, reject) => {
            if (source instanceof HTMLImageElement) {
                resolve(source);
                return;
            }

            if (source instanceof HTMLCanvasElement) {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = source.toDataURL();
                return;
            }

            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;

            if (typeof source === 'string') {
                img.src = source;
            } else if (source instanceof Blob) {
                img.src = URL.createObjectURL(source);
            } else {
                reject(new Error('Unsupported image source'));
            }
        });
    }

    /**
     * Helper: Convert image to canvas
     */
    imageToCanvas(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return canvas;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageProcessor;
}
