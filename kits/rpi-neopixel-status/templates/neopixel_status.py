#!/usr/bin/env python3
# WS2812/NeoPixel ambient status wash on GPIO18. COUNT filled per prompt.
import time

COUNT = 30
PIN_BCM = 18

def _wheel(pos):
    pos &= 255
    if pos < 85: return (pos * 3, 255 - pos * 3, 0)
    if pos < 170: pos -= 85; return (255 - pos * 3, 0, pos * 3)
    pos -= 170; return (0, pos * 3, 255 - pos * 3)

def main():
    try:
        from rpi_ws281x import PixelStrip, Color
    except Exception as e:
        print(f'[neopixel] rpi_ws281x unavailable ({e}); pip install rpi_ws281x. Running in sim.', flush=True)
        j = 0
        while True:
            print(f'[neopixel] (sim) wash frame {j}', flush=True); j += 1; time.sleep(1)
    strip = PixelStrip(COUNT, PIN_BCM); strip.begin()
    print('[neopixel] rainbow wash', flush=True)
    j = 0
    while True:
        for i in range(COUNT):
            r, g, b = _wheel((i * 256 // COUNT + j) & 255)
            strip.setPixelColor(i, Color(r, g, b))
        strip.show(); j = (j + 2) & 255; time.sleep(0.05)

if __name__ == '__main__':
    main()
