# ZXing WebAssembly Assets

Esta carpeta debe contener:

## Archivos requeridos:
- `zxing-wasm.min.js` - ZXing WASM wrapper
- `zxing.wasm` - WebAssembly binary

## Descarga:
```bash
cd assets/zxing

# Desde npm package (requiere build) o usar CDN
npm install @zxing/browser@latest

# Copiar archivos dist
cp node_modules/@zxing/browser/dist/* .

# O agregar script en HTML para CDN:
# <script src="https://cdn.jsdelivr.net/npm/@zxing/library@latest/umd/index.min.js"></script>
```

## Uso:
ZXing detecta códigos QR en el reverso de la credencial INE (típicamente 2-3 QR codes).

## Alternativa:
El proyecto puede usar `jsQR` o `qr-scanner` como fallback si ZXing no está disponible.
