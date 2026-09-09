#!/usr/bin/env bash
# Bootstrap idempotent de l'environnement de développement Cloud Agent.
# Rejouable à volonté : installe MongoDB si absent, les dépendances npm, crée un
# .env.dev local (aucun secret réel), pose les index et sème un jeu de recette.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MONGO_DATA="${MONGO_DATA:-$HOME/mongo-data}"
MONGO_LOG="$MONGO_DATA/mongod.log"

# ── MongoDB (dépendance système stable) ──────────────────────────────────────
if ! command -v mongod >/dev/null 2>&1; then
    echo "→ Installation de MongoDB 8.0…"
    curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
        | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
    . /etc/os-release
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${VERSION_CODENAME}/mongodb-org/8.0 multiverse" \
        | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
    sudo apt-get update -y
    sudo apt-get install -y mongodb-org
fi

# ── Dépendances Node ──────────────────────────────────────────────────────────
npm ci

# ── .env.dev local (jamais commité — que des valeurs de dev) ──────────────────
if [ ! -f .env.dev ]; then
    echo "→ Création de .env.dev"
    SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    cat > .env.dev <<EOF
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB=gestion_bar_dev
SESSION_SECRET=$SECRET
OUTBOUND_ENABLED=false
APP_URL=http://localhost:3000
PORT=3000
EOF
fi

# ── Démarrage temporaire de MongoDB pour poser index + seed ───────────────────
mkdir -p "$MONGO_DATA"
if ! mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    mongod --dbpath "$MONGO_DATA" --bind_ip 127.0.0.1 --port 27017 --fork --logpath "$MONGO_LOG"
fi
until mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; do sleep 1; done

ENV_FILE=.env.dev npm run init
npm run dev:seed

echo "✅ Environnement prêt — comptes de recette semés (mot de passe : Templyo2026!)"
