# Bass and guitar samples

From the FluidR3 GM SoundFont by Frank Wen, licensed CC BY 3.0:
https://creativecommons.org/licenses/by/3.0/

MP3 renderings from midi-js-soundfonts by Benjamin Gleitzman
(https://github.com/gleitz/midi-js-soundfonts), FluidR3_GM set.

- acoustic_bass, electric_bass_finger, synth_bass_1: C1 to C5
- electric_guitar_clean, acoustic_guitar_steel: C2 to C7

One file per sampled note, every minor third (C, Eb, Gb, A). The app shifts each by at most one
semitone. `offsets.json` (tools/instrument_offsets.py) holds each sample's onset, loudness and peak.
