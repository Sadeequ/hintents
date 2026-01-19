# Build Stage
FROM golang:1.24-bookworm AS builder-go

WORKDIR /app

# Install Rust
RUN apt-get update && apt-get install -y curl build-essential
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy dependency files first
COPY go.mod go.sum ./
COPY simulator/Cargo.toml simulator/Cargo.lock ./simulator/
COPY simulator/src ./simulator/src

# Build Rust simulator
WORKDIR /app/simulator
RUN cargo build --release

# Build Go CLI
WORKDIR /app
COPY . .
RUN go build -o erst cmd/erst/main.go

# Final Stage
FROM debian:bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy binaries
COPY --from=builder-go /app/erst .
COPY --from=builder-go /app/simulator/target/release/erst-sim ./simulator/target/release/erst-sim

# Expose if needed (not for CLI)
ENTRYPOINT ["./erst"]
