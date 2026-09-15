# 月下书房 / Moonlit Study

Original synthesized ambient score created for Starveil. No sampled recordings, external tracks, or vocals.

- 64 seconds; D-minor/open voicings, soft pads and sparse bell melody.
- Stereo, 24 kHz; runtime MP3 128 kbit/s; lossless WAV master preserved.
- Deterministic source: `frontend/scripts/create-bgm.py`.
- Circular note tails and reverb provide continuous loop ambience.
- Background music defaults on; browser interaction unlocks playback. Volume default 35%, reduced to 60% of chosen volume during reading, paused when document is hidden. Music and short action sounds have independent settings.
- Settings persist in the current browser. No external audio requests.

## Action SFX / 动作音效

All action sounds are synthesized in real time with the Web Audio API (`frontend/src/sfx.js`) — no sampled recordings or external files, same principle as the BGM.

- door（推开星幕）：low wooden friction sweep + deep tail.
- shuffle（洗牌）：seven quick card riffle swishes.
- draw（抽牌/发牌）：one crisp card slide + settling pluck.
- reveal（翻牌）：starlight bell shimmer (G5 + D6 + high partial).
- complete（选齐牌）：soft three-note rising arpeggio.
- send（发送问题）：gentle bubble pop.
- thinking（解读开始）：soft breathing swell.
- save（保存档案）：book-close thud + page flutter.
- tick（打开面板）：very light touch.

All effects respect the "动作音效" setting toggle (`sound`) and stay quiet enough to sit under the BGM.
