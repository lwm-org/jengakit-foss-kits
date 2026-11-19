// Weather mood lamp: DHT11 -> RGB color + serial.
#include "DHT.h"
DHT dht(2, DHT11);
const int R = 3, G = 5, B = 6;

void setup() { Serial.begin(9600); dht.begin(); pinMode(R, OUTPUT); pinMode(G, OUTPUT); pinMode(B, OUTPUT); }

void loop() {
  float t = dht.readTemperature();
  if (!isnan(t)) {
    Serial.println(t);
    int hot = constrain(map(t * 10, 180, 300, 0, 255), 0, 255);
    analogWrite(R, hot); analogWrite(B, 255 - hot); analogWrite(G, 40);
  }
  delay(2000);
}
