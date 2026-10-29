"""Reconocimiento propio en el servidor; nunca usa APIs de voz/OCR de pago."""
import base64
import gc
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import threading
import time

os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
MODEL_PATH = Path(__file__).resolve().parent / 'models' / 'whisper-tiny'
INFERENCE = threading.Lock()
MODEL = None
MODEL_KIND = None
RECENT = {}


class MediaBusy(Exception):
    pass


def capabilities():
    voice = bool(importlib.util.find_spec('faster_whisper') and (MODEL_PATH / 'model.bin').is_file())
    ocr = bool(importlib.util.find_spec('rapidocr_onnxruntime'))
    return dict(voice=voice, ocr=ocr, voice_error='' if voice else 'Falta preparar Whisper en el build de Render.', ocr_error='' if ocr else 'Falta instalar OCR en el build de Render.')


def model_for(kind):
    global MODEL, MODEL_KIND
    if MODEL_KIND != kind:
        # Un solo modelo residente: voz u OCR, para reducir consumo de RAM.
        MODEL = None
        MODEL_KIND = None
        gc.collect()
        if kind == 'voice':
            from faster_whisper import WhisperModel
            MODEL = WhisperModel(str(MODEL_PATH), device='cpu', compute_type='int8', local_files_only=True, cpu_threads=1, num_workers=1)
        else:
            from rapidocr_onnxruntime import RapidOCR
            MODEL = RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1)
        MODEL_KIND = kind
    return MODEL


def audio_samples(raw):
    import av
    import numpy as np
    chunks = []
    count = 0
    resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
    with av.open(io.BytesIO(raw)) as container:
        if not container.streams.audio:
            raise ValueError('Sin audio')
        for frame in container.decode(audio=0):
            frame.pts = None
            for converted in resampler.resample(frame):
                samples = converted.to_ndarray().flatten()
                count += len(samples)
                if count > 35 * 16000:
                    raise ValueError('Audio de más de 35 segundos')
                chunks.append(samples)
        for converted in resampler.resample(None):
            samples = converted.to_ndarray().flatten()
            count += len(samples)
            if count > 35 * 16000:
                raise ValueError('Audio demasiado largo')
            chunks.append(samples)
    if not chunks or count < 800:
        raise ValueError('Audio vacío')
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def candidates(result, side):
    found = []
    pattern = r'(?<!\d)\d{10}(?!\d)' if side == 'front' else r'[A-Z]\d{4}[A-Z]\d{4}'
    for _, text, confidence in result or []:
        if float(confidence) < .85:
            continue
        for value in re.findall(pattern, re.sub(r'\s+', '', str(text).upper())):
            value = value if side == 'front' else value[:6]
            if value not in found:
                found.append(value)
    return found


def run_media(path, raw, owner):
    if not INFERENCE.acquire(blocking=False):
        raise MediaBusy()
    try:
        now = time.monotonic()
        for key in list(RECENT):
            if now - RECENT[key] > 60:
                del RECENT[key]
        if now - RECENT.get(owner, -100) < 1:
            raise MediaBusy()
        RECENT[owner] = now
        if path == '/api/transcribe':
            audio = audio_samples(raw)
            segments, _ = model_for('voice').transcribe(audio, language='es', beam_size=1, vad_filter=False, condition_on_previous_text=False)
            text = ' '.join(segment.text.strip() for segment in segments)
            return {'text': text[:1200]}
        req = json.loads(raw)
        side = req.get('side')
        if side not in ('front', 'back_id'):
            raise ValueError('Lado no válido')
        data = base64.b64decode(req['image'], validate=True)
        from PIL import Image
        with Image.open(io.BytesIO(data)) as img:
            if img.format not in ('JPEG', 'PNG') or img.width * img.height > 4_000_000:
                raise ValueError('Imagen demasiado grande')
            img.verify()
        result, _ = model_for('ocr')(data)
        return {'candidates': candidates(result, side), 'note': 'Lectura candidata; confirme antes de avanzar. No valida identidad.'}
    finally:
        INFERENCE.release()
