// Ultrasonic theremin: HC-SR04 -> piezo pitch.
const int TRIG = 9, ECHO = 10, BUZZ = 8;

long readCm() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000); return us / 58;
}

void setup() { pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT); }

void loop() {
  long cm = readCm();
  if (cm > 2 && cm < 40) tone(BUZZ, map(cm, 2, 40, 1200, 200));
  else noTone(BUZZ);
  delay(30);
}
