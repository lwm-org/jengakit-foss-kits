"""Universal CRUD API with FastAPI + jengakit_db (SQLite or Supabase)."""

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from lib.jengakit_db import execute, is_supabase, query

app = FastAPI()

# Serve static files and HTML template
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    return FileResponse("templates/index.html")


@app.get("/api/{table}")
async def list_items(table: str):
    table = "".join(c for c in table if c.isalnum() or c == "_")
    try:
        return query(f'SELECT * FROM "{table}" ORDER BY id DESC')
    except Exception:
        return []


@app.post("/api/{table}")
async def create_item(table: str, request: Request):
    table = "".join(c for c in table if c.isalnum() or c == "_")
    body = await request.json()
    columns = [k for k in body.keys() if k not in ("id", "created_at")]
    col_defs = ", ".join(f'"{c}" TEXT' for c in columns)

    if is_supabase:
        execute(
            f'CREATE TABLE IF NOT EXISTS "{table}" (id SERIAL PRIMARY KEY, {col_defs}, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
        )
    else:
        execute(
            f'CREATE TABLE IF NOT EXISTS "{table}" (id INTEGER PRIMARY KEY AUTOINCREMENT, {col_defs}, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
        )

    # Add missing columns
    try:
        for col in columns:
            execute(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{col}" TEXT')
    except Exception:
        pass

    placeholders = ", ".join(f"${i + 1}" for i in range(len(columns)))
    values = [str(body.get(c, "")) for c in columns]
    col_names = ", ".join(f'"{c}"' for c in columns)

    if is_supabase:
        new_id = execute(f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders}) RETURNING id', values)
    else:
        new_id = execute(f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders})', values)

    return JSONResponse({"id": new_id, **body}, status_code=201)


@app.put("/api/{table}/{item_id:int}")
async def update_item(table: str, item_id: int, request: Request):
    table = "".join(c for c in table if c.isalnum() or c == "_")
    body = await request.json()
    body.pop("id", None)
    columns = list(body.keys())
    sets = ", ".join(f'"{c}" = ${i + 1}' for i, c in enumerate(columns))
    values = [str(body[c]) for c in columns] + [item_id]
    execute(f'UPDATE "{table}" SET {sets} WHERE id = ${len(columns) + 1}', values)
    return {"id": item_id, **body}


@app.delete("/api/{table}/{item_id:int}")
async def delete_item(table: str, item_id: int):
    table = "".join(c for c in table if c.isalnum() or c == "_")
    execute(f'DELETE FROM "{table}" WHERE id = $1', [item_id])
    return {"deleted": item_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
