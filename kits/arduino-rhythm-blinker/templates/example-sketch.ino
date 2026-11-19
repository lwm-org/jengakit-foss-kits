// Heartbeat rhythm on the onboard LED (pin 13).
const int LED = 13;

void beat() {
  digitalWrite(LED, HIGH); delay(80); digitalWrite(LED, LOW); delay(120);
  digitalWrite(LED, HIGH); delay(80); digitalWrite(LED, LOW);
}

void setup() { pinMode(LED, OUTPUT); }

void loop() { beat(); delay(700); }
