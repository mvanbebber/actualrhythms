#!/usr/bin/env python3
"""Measure where each bass, guitar and drum sample's sound starts and how loud it is.

Writes audio/instruments/offsets.json and audio/drums/offsets.json:
{"acoustic_bass/C2.mp3": [onset_seconds, loudness, peak], ...}. The app starts every sample at its onset, so
attacks land on the beat, and divides by the loudness (RMS of the first 300 ms after the onset) so every
instrument plays at about the same level as the piano, without letting the peak clip. Needs ffmpeg and numpy.
"""
import json, os, subprocess, sys
import numpy as np

AUDIO = os.path.join(os.path.dirname(__file__), '..', 'audio')


def measure(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-f', 'f32le', '-ar', '44100', '-'],
                         capture_output=True, check=True).stdout
    x = np.abs(np.frombuffer(raw, dtype=np.float32))
    peak = float(x.max()) or 1e-6
    start = int(np.argmax(x > peak * 0.01))  # first sample within 40 dB of the peak
    body = x[start:start + int(0.3 * 44100)]
    rms = float(np.sqrt(np.mean(body ** 2))) or 1e-6
    return [round(max(0.0, start / 44100 - 0.002), 4), round(rms, 4), round(peak, 4)]  # keep 2 ms of lead-in


for name in ('instruments', 'drums'):
    root = os.path.join(AUDIO, name)
    out = {}
    for dirpath, _, files in sorted(os.walk(root)):
        for f in sorted(files):
            if f.endswith('.mp3'):
                p = os.path.join(dirpath, f)
                out[os.path.relpath(p, root)] = measure(p)
    with open(os.path.join(root, 'offsets.json'), 'w') as fh:
        json.dump(out, fh, separators=(',', ':'), sort_keys=True)
    print(f'{name}: {len(out)} samples measured', file=sys.stderr)
