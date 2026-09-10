#!/usr/bin/env bash
# Lancé à CHAQUE démarrage de l'environnement : (re)démarre MongoDB à partir des
# données durables produites par install.sh. Idempotent — ne relance pas un mongod
# déjà vivant et attend qu'il réponde avant de rendre la main.
set -euo pipefail

MONGO_DATA="${MONGO_DATA:-$HOME/mongo-data}"
MONGO_LOG="$MONGO_DATA/mongod.log"

mkdir -p "$MONGO_DATA"
if ! mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    mongod --dbpath "$MONGO_DATA" --bind_ip 127.0.0.1 --port 27017 --fork --logpath "$MONGO_LOG"
fi
until mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; do sleep 1; done

echo "✅ MongoDB prêt sur 127.0.0.1:27017"
