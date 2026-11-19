package main

import (
	"encoding/json"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Hello from jengakit",
			"status":  "ok",
		})
	})
	log.Println("Server running on :5000")
	log.Fatal(http.ListenAndServe(":5000", nil))
}
