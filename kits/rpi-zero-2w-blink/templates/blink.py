#!/usr/bin/env python3
# Blink a Raspberry Pi GPIO LED. PIN + INTERVAL_S are filled per prompt.
import time

PIN = 17
INTERVAL_S = 0.2


def _led(pin):
    try:
        from gpiozero import LED

        return "gpiozero", LED(pin)
    except Exception:
        pass
    try:
        import RPi.GPIO as GPIO

        GPIO.setmode(GPIO.BCM)
        GPIO.setup(pin, GPIO.OUT)
        return "RPi.GPIO", GPIO
    except Exception:
        return "sim", None


def main():
    backend, led = _led(PIN)
    print(f"[blink] backend={backend} pin={PIN} interval={INTERVAL_S}s", flush=True)
    while True:
        if backend == "gpiozero":
            led.on()
        elif backend == "RPi.GPIO":
            led.output(PIN, True)
        else:
            print("LED ON", flush=True)
        time.sleep(INTERVAL_S)
        if backend == "gpiozero":
            led.off()
        elif backend == "RPi.GPIO":
            led.output(PIN, False)
        else:
            print("LED OFF", flush=True)
        time.sleep(INTERVAL_S)


if __name__ == "__main__":
    main()
