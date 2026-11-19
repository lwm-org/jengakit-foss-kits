"""Services-demo app — reports live connectivity to the platform-provisioned
backing services (declared via the kit's v5 `services:` block).

The platform injects DATABASE_URL + REDIS_URL; this app connects to each on
every request and serves the status at `/`. It always returns 200 (so the deploy
health gate passes as soon as the app is up) — the JSON body shows whether each
service is reachable yet (postgres may still be initializing on the first calls).
"""

import json
import os

from flask import Flask, Response

app = Flask(__name__)


@app.get("/")
def index():
    status = {
        "database_url_set": bool(os.environ.get("DATABASE_URL")),
        "redis_url_set": bool(os.environ.get("REDIS_URL")),
        "db": "unset",
        "redis": "unset",
    }
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        try:
            import psycopg2

            conn = psycopg2.connect(db_url, connect_timeout=3)
            conn.close()
            status["db"] = "ok"
        except Exception as e:  # still booting / unreachable
            status["db"] = f"error: {type(e).__name__}"
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        try:
            import redis

            redis.from_url(redis_url, socket_connect_timeout=3).ping()
            status["redis"] = "ok"
        except Exception as e:
            status["redis"] = f"error: {type(e).__name__}"
    return Response(json.dumps(status), status=200, mimetype="application/json")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
