"""Diagnóstico de recursos sin claves, nombre de equipo ni identificadores."""
import ctypes
import os
import platform
import shutil
import subprocess
from pathlib import Path

print('Sistema:',platform.system(),platform.release())
print('Arquitectura:',platform.machine())
print('Python:',platform.python_version())
print('CPU:',platform.processor() or 'No informada')
print('Procesadores lógicos:',os.cpu_count())
try:
    if os.name=='nt':
        class Memory(ctypes.Structure):
            _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong)]+[(n,ctypes.c_ulonglong) for n in ['total','available','page_total','page_available','virtual_total','virtual_available','extended']]
        m=Memory();m.length=ctypes.sizeof(m);ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m));ram=m.total
    else:ram=os.sysconf('SC_PAGE_SIZE')*os.sysconf('SC_PHYS_PAGES')
    print('RAM total GiB:',round(ram/1024**3,1))
except Exception:print('RAM: revisar manualmente')
print('Disco libre GiB:',round(shutil.disk_usage(Path.cwd()).free/1024**3,1))
try:
    r=subprocess.run(['nvidia-smi','--query-gpu=name,memory.total','--format=csv,noheader'],capture_output=True,text=True,timeout=8)
    print('GPU NVIDIA:',r.stdout.strip() if r.returncode==0 else 'No detectada por nvidia-smi')
except Exception:print('GPU NVIDIA: no detectada; revisar Administrador de tareas si corresponde')
