// Morse beacon on the onboard LED (pin 13).
const int LED = 13;
const int UNIT = 200;  // ms per dot

void dot() { digitalWrite(LED, HIGH); delay(UNIT); digitalWrite(LED, LOW); delay(UNIT); }
void dash() { digitalWrite(LED, HIGH); delay(UNIT * 3); digitalWrite(LED, LOW); delay(UNIT); }

void setup() { pinMode(LED, OUTPUT); }

void loop() {  // SOS
  dot(); dot(); dot();
  delay(UNIT * 3);
  dash(); dash(); dash();
  delay(UNIT * 3);
  dot(); dot(); dot();
  delay(UNIT * 7);
}
