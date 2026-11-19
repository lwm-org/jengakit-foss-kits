#!/usr/bin/env python3
# Blink the Pi's built-in ACT LED via /sys/class/leds. INTERVAL_S filled per prompt.
import glob
import time

INTERVAL_S = 0.3

def _led_paths():
    for name in ('led0', 'ACT'):
        p = f'/sys/class/leds/{name}'
        import os
        if os.path.isdir(p):
            return p
    hits = glob.glob('/sys/class/leds/*')
    return hits[0] if hits else None

def _write(base, attr, val):
    try:
        with open(f'{base}/{attr}', 'w') as f:
            f.write(str(val))
        return True
    except Exception:
        return False

def main():
    base = _led_paths()
    if base:
        _write(base, 'trigger', 'none')  # take manual control
    print(f'[act-led] base={base} interval={INTERVAL_S}s', flush=True)
    while True:
        if not (base and _write(base, 'brightness', 1)):
            print('LED ON (sim — needs write access to /sys/class/leds)', flush=True)
        time.sleep(INTERVAL_S)
        if base:
            _write(base, 'brightness', 0)
        else:
            print('LED OFF', flush=True)
        time.sleep(INTERVAL_S)

if __name__ == '__main__':
    main()
