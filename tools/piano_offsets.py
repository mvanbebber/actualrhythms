#!/usr/bin/env python3
"""Measure where each piano sample's sound starts and how loud it peaks.

Writes audio/piano/offsets.json: {"v10/C4.mp3": [onset_seconds, peak], ...}. The app starts
every sample at its onset (so attacks land exactly on the beat) and uses the peak to set the
key-noise level relative to the note. Needs ffmpeg and numpy.
"""
import json, os, subprocess, sys
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', 'audio', 'piano')
out = {}
for sub in sorted(os.listdir(ROOT)):
    d = os.path.join(ROOT, sub)
    if not os.path.isdir(d):
        continue
    for f in sorted(os.listdir(d)):
        if not f.endswith('.mp3'):
            continue
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(d, f), '-ac', '1', '-f', 'f32le', '-ar', '44100', '-'],
                             capture_output=True, check=True).stdout
        x = np.abs(np.frombuffer(raw, dtype=np.float32))
        peak = float(x.max()) or 1e-6
        onset = int(np.argmax(x > peak * 0.01)) / 44100  # first sample within 40 dB of the peak
        out[f'{sub}/{f}'] = [round(max(0.0, onset - 0.002), 4), round(peak, 4)]  # keep 2 ms of lead-in
with open(os.path.join(ROOT, 'offsets.json'), 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
print(f'{len(out)} samples measured', file=sys.stderr)
