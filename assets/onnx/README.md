# ONNX Models

Esta carpeta debe contener modelos ONNX para clasificación:

## Archivos requeridos:
- `side_cls.onnx` - Clasificador de lado (front/back)
  - Input: [1, 3, 224, 224] (RGB image)
  - Output: [1, 2] (probabilidades front/back)
  - Arquitectura sugerida: MobileNetV3-Small

- `ine_model_cls.onnx` - Clasificador de modelo de INE
  - Input: [1, 3, 224, 224] (RGB image)
  - Output: [1, 4] (probabilidades INE_2019, INE_2023, INE_v3_1, unknown)
  - Arquitectura sugerida: MobileNetV3-Small

## Entrenamiento:
Estos modelos deben ser entrenados con imágenes de credenciales INE:

```python
# Ejemplo con PyTorch
import torch
import torch.nn as nn
from torchvision import models

# Modelo ligero MobileNetV3
model = models.mobilenet_v3_small(pretrained=True)
model.classifier[3] = nn.Linear(1024, num_classes)  # 2 para side, 4 para model

# Entrenar con dataset de INEs etiquetadas
# ...

# Exportar a ONNX
torch.onnx.export(model, dummy_input, "side_cls.onnx",
                  input_names=['input'], output_names=['output'])
```

## Fallback:
Si estos archivos no existen, el sistema usa heurísticas:
- **Lado**: Detecta QR codes (≥2 QR = reverso)
- **Modelo**: Template matching con anchors visuales
