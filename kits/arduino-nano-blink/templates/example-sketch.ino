// Generated blink sketch for Arduino Nano.
// Blinks the onboard LED (pin 13) at the interval the prompt asks for.

const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
