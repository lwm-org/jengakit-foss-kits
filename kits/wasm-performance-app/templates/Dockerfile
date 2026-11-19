FROM rust:1.75-slim-bookworm as builder
RUN apt-get update && apt-get install -y curl pkg-config libssl-dev
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
WORKDIR /app
COPY . .
RUN wasm-pack build --target web

FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /app/pkg ./pkg
COPY index.html main.js server.py ./
EXPOSE 8080
CMD ["python3", "server.py"]