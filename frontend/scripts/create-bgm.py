"""Original 64-second seamless ambient score; deterministic synthesis, no samples."""
from pathlib import Path
import numpy as np
import wave
sr=24000
length=64
n=sr*length
t=np.arange(n)/sr
out=np.zeros((n,2),dtype=np.float64)
def hz(m): return 440*2**((m-69)/12)
def place(start,duration,signal,pan=0):
    ids=(np.arange(len(signal))+int(start*sr))%n
    out[ids,0]+=signal*np.sqrt((1-pan)/2)
    out[ids,1]+=signal*np.sqrt((1+pan)/2)
# D minor, open/add9 voicings; long releases overlap across the loop boundary.
chords=[[38,57,62,64,65],[34,57,60,62,65],[41,57,60,64,67],[36,55,60,62,64],
        [43,58,62,65,69],[34,53,57,60,62],[33,55,57,62,64],[38,53,57,62,64]]
for bar,chord in enumerate(chords):
    u=np.arange(12*sr)/sr
    env=np.minimum(u/2.8,1)*np.minimum((12-u)/4,1)
    env=np.clip(env,0,1)**1.5
    for j,m in enumerate(chord):
        f=hz(m)
        body=np.sin(2*np.pi*f*u+.012*np.sin(2*np.pi*.13*u))
        body+=.21*np.sin(2*np.pi*f*2*u+.6)+.055*np.sin(2*np.pi*f*3*u)
        body*=env*(.019 if j else .028)*(1+.06*np.sin(2*np.pi*.19*u+j))
        place(bar*8,12,body,(j-2)*.26)
# Sparse bell / felt-key melody with soft onset; no drums or vocals.
melody=[[74,77,81,76],[74,72,69,77],[76,79,81,72],[74,76,79,67],
        [74,77,81,70],[72,74,77,69],[76,74,73,69],[74,69,77,76]]
for bar,notes in enumerate(melody):
    for beat,m in enumerate(notes):
        u=np.arange(7*sr)/sr; f=hz(m)
        env=(1-np.exp(-u*24))*np.exp(-u/1.6)
        bell=np.sin(2*np.pi*f*u)*env
        bell+=.16*np.sin(2*np.pi*f*2*u)*np.exp(-u/.7)*(1-np.exp(-u*32))
        place(bar*8+beat*2+.3,7,bell*.045,(-1 if beat%2 else 1)*.38)
# Circular delay/reverb preserves the tail at the end/start splice.
dry=out.copy()
for delay,gain in [(0.31,.14),(.53,.12),(.87,.1),(1.31,.08),(1.97,.06),(2.71,.04),(3.41,.03)]:
    out+=np.roll(dry[:,::-1],int(sr*delay),axis=0)*gain
out-=out.mean(axis=0)
out=np.tanh(out*2.1)
peak=float(np.max(np.abs(out)));out*=.56/max(peak,1e-6)
path=Path(__file__).resolve().parents[1]/'public/audio/moonlit-study.wav'
with wave.open(str(path),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((out*32767).astype('<i2').tobytes())
print(f'Generated {length}s stereo score; peak={np.max(np.abs(out)):.3f}, RMS={np.sqrt(np.mean(out*out)):.3f}, boundary jump={np.max(np.abs(out[0]-out[-1])):.5f}')
