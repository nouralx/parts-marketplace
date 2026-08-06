#!/bin/bash
set -e

echo "Downloading Tailscale..."
curl -fsSL https://pkgs.tailscale.com/stable/tailscale_1.72.0_amd64.tgz | tar xz
export PATH=$PATH:$(pwd)/tailscale_1.72.0_amd64

mkdir -p /tmp/tailscale
TS_SOCKET=/tmp/tailscale/tailscaled.sock
TS_STATE=/tmp/tailscale/tailscaled.state

echo "Starting tailscaled..."
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 --socket=$TS_SOCKET --state=$TS_STATE &
sleep 5

echo "Connecting to Tailscale network..."
tailscale --socket=$TS_SOCKET up --authkey=${TAILSCALE_AUTHKEY} --hostname=render-backend

echo "Starting Node app..."
node index.js
