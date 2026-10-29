"""Build de Render: instalar OCR sin OpenCV de escritorio y descargar Whisper tiny."""
from pathlib import Path
import subprocess
import sys

subprocess.run([sys.executable, '-m', 'pip', 'install', '--no-deps', 'rapidocr-onnxruntime==1.4.4'], check=True)
from rapidocr_onnxruntime import RapidOCR
ocr_check = RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1)
del ocr_check
from faster_whisper.utils import download_model

path = Path(__file__).resolve().parent / 'models' / 'whisper-tiny'
download_model('tiny', output_dir=str(path))
if not (path / 'model.bin').is_file():
    raise SystemExit('No se descargó el modelo de voz; se cancela el build.')
print('OCR y Whisper tiny preparados para la demo web.', flush=True)
