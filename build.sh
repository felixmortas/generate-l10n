#!/bin/bash

# Arrêter le script en cas d'erreur
set -e

echo "🚀 Démarrage du processus de build..."

# 1. Nettoyage (optionnel mais recommandé)
if [ -d "out" ]; then
    echo "🧹 Nettoyage du dossier out..."
    rm -rf out
fi

# 2. Installation des dépendances si nécessaire
echo "📦 Vérification des dépendances..."
npm install

# 3. Compilation (Utilise vos scripts package.json)
echo "⚙️ Compilation du TypeScript..."
npm run compile

# 4. Création du package .vsix
echo "📦 Création du package VSIX..."
# Cette étape vérifie aussi que votre package.json est complet
vsce package

echo "✅ Build terminé avec succès !"
echo "-------------------------------------------"

# 5. Demande de publication
read -p "❓ Voulez-vous publier l'extension sur la Marketplace maintenant ? (y/N) " confirm

if [[ "$confirm" == [yY] || "$confirm" == [yY][eE][sS] ]]; then
    echo "🌐 Publication en cours..."
    # 'vsce publish' utilisera le token si vous êtes déjà connecté
    # sinon il vous le demandera.
    vsce publish
    echo "🎉 Extension publiée !"
else
    echo "💾 Publication annulée. Le fichier .vsix est disponible pour une installation manuelle."
fi