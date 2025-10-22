# Template Anchors para Template Matching

Esta carpeta debe contener imágenes de referencia (anchors) de cada modelo de INE para template matching.

## Archivos requeridos:

### INE_2019 (Modelo G)
- `ine_2019_anchors.png` - Conjunto de 2-4 anchors visuales:
  - Logo INE (águila + texto)
  - Sello oficial (águila nacional)
  - Mapa de México estilizado
  - Patrón de guilloche (fondo de seguridad)

### INE_2023 (Modelo H)
- `ine_2023_anchors.png` - Incluye:
  - Logo INE actualizado
  - Texto "DESDE EL EXTRANJERO" / "FROM ABROAD"
  - Nuevos elementos de seguridad
  - Código de barras 2D

### INE_v3_1 (Variante)
- `ine_v3_1_anchors.png` - Variantes de diseño:
  - Elementos distintivos del modelo v3.1
  - Cambios en disposición de elementos

## Formato:
- PNG con fondo transparente
- Tamaño: ~100-200px por anchor
- Alta resolución para matching robusto

## Uso:
OpenCV.js `matchTemplate()` compara estos anchors con la imagen de entrada:
- Umbral de confianza: ≥ 0.75 para considerar match válido
- Múltiples anchors por modelo mejoran precisión

## Creación:
1. Obtener imágenes reales de cada modelo de INE
2. Recortar elementos visuales únicos y distintivos
3. Guardar como PNG con transparencia
4. Probar con `cv.matchTemplate()` para validar

## Nota:
Si estos archivos no existen, el sistema intenta clasificar usando solo ONNX o retorna 'unknown'.
