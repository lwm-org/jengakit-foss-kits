FROM rust:1.100-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /usr/src/app
COPY . .
RUN cargo build --release

FROM alpine:latest
WORKDIR /app
COPY --from=builder /usr/src/app/target/release/server /app/server
EXPOSE 8080
CMD ["/app/server"]
