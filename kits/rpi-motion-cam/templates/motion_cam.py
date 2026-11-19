#!/usr/bin/env python3
# Pi camera motion snapshotter. THRESHOLD filled per prompt. Saves to ~/jengakit-snaps.
import os
import time

THRESHOLD = 12  # mean-frame-diff sensitivity
OUT = os.path.expanduser('~/jengakit-snaps')

def main():
    os.makedirs(OUT, exist_ok=True)
    try:
        from picamera2 import Picamera2
        import numpy as np
    except Exception as e:
        print(f'[motion-cam] camera libs unavailable ({e}); install picamera2 + numpy. Running in sim.', flush=True)
        while True:
            print('[motion-cam] (sim) watching for motion...', flush=True); time.sleep(5)
    cam = Picamera2(); cam.configure(cam.create_still_configuration()); cam.start(); time.sleep(2)
    prev = None
    print('[motion-cam] armed', flush=True)
    while True:
        frame = cam.capture_array()
        small = frame[::8, ::8, 0].astype('int16')
        if prev is not None and abs(small - prev).mean() > THRESHOLD:
            fn = os.path.join(OUT, time.strftime('%Y%m%d-%H%M%S.jpg'))
            cam.capture_file(fn); print(f'[motion-cam] motion -> {fn}', flush=True); time.sleep(2)
        prev = small; time.sleep(0.3)

if __name__ == '__main__':
    main()
