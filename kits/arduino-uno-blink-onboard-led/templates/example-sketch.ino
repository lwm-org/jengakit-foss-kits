// Reference sketch — DO NOT rely on this being byte-equal to what ships.
// The codegen pipeline generates a fresh sketch per prompt; this file
// exists as a worked example for human reviewers + as a fallback the
// pipeline can fall back to if LLM codegen is unavailable.

const int LED_PIN = 13;          // ATmega328P onboard LED
const unsigned long INTERVAL_MS = 500;   // half-second cadence by default

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(INTERVAL_MS);
  digitalWrite(LED_PIN, LOW);
  delay(INTERVAL_MS);
}
