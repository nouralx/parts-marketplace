#!/bin/bash
set -e

echo "Downloading Tailscale..."
curl -fsSL https://pkgs.tailscale.com/stable/tailscale_1.72.0_amd64.tgz | tar xz
export PATH=$PATH:$(pwd)/tailscale_1.72.0_amd64

echo "Starting tailscaled..."
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
sleep 3

echo "Connecting to Tailscale network..."
tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=render-backend

echo "Starting Node app..."
node index.js
