# Obsidian Third-party Sync

Un plugin de synchronisation Obsidian, fork de [Remotely Save](https://github.com/remotely-save/remotely-save) avec **des améliorations axées sur la sécurité**. Couche de chiffrement reconstruite (AES-256-GCM) et base de code simplifiée. **PAS rétrocompatible avec Remotely Save** — veuillez sauvegarder votre vault avant de basculer.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | Français | [Español](README_es.md) | [Italiano](README_it.md) | [Nederlands](README_nl.md) | [Dansk](README_da.md) | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## Avertissement

- **Ce n'est PAS le [service de synchronisation officiel](https://obsidian.md/sync) fourni par Obsidian.**
- **⚠️ Sauvegardez TOUJOURS votre vault avant d'utiliser ce plugin.**

## Pourquoi fork de Remotely Save ?

### Améliorations de sécurité (principaux apports)

- **Algorithme de chiffrement**
  - Remotely Save : AES-CBC ou AES-CTR (RClone)
  - Ce plugin : **AES-256-GCM**
- **Vérification d'intégrité**
  - Remotely Save : Aucune (mode CBC, vulnérable aux attaques padding oracle)
  - Ce plugin : **Vérification AuthTag GCM intégrée**
- **Vecteur d'initialisation (IV)**
  - Remotely Save : Dérivé du mot de passe (même IV pour tous les fichiers sous le même mot de passe)
  - Ce plugin : **Généré aléatoirement par fichier**
- **Longueur du salt**
  - Remotely Save : 8 octets (2^64 possibilités)
  - Ce plugin : **16 octets** (2^128 possibilités)
- **Dépendances de chiffrement**
  - Remotely Save : `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - Ce plugin : **API native du navigateur `window.crypto.subtle`**

### Simplification de l'architecture

Comparé à l'original, ce fork apporte les simplifications suivantes :

- **Services de stockage** : Réduits de 13 à 3 services grand public (S3 / WebDAV / OneDrive). Suppression de Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis, etc.
- **Schémas de chiffrement** : Fusionnés de 2 (OpenSSL + RClone) en 1 (**AES-256-GCM**).

## Fonctionnalités

- **Services pris en charge** : Amazon S3 (et compatibles : Tencent COS, Alibaba OSS, Backblaze B2, MinIO, etc.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, etc.), OneDrive personnel. Voir [doc de compatibilité des services](./docs/services_connectable_or_not.md).
- **Chiffrement de bout en bout** ([détails](./docs/encryption.md)) : Les fichiers sont chiffrés localement avant l'envoi via **AES-256-GCM avec Web Crypto API native du navigateur**. Format de sortie compatible avec l'encodage de nom de fichier base64url de RClone Crypt.
- **Sync automatique** : Intervalle planifié, au démarrage, à l'enregistrement, et détection de changement distant.
- **Direction de sync** : Bidirectionnelle / push incrémental (mode sauvegarde) / pull incrémental / variantes avec suppression.
- **Protection du ratio de modification** : Annule la sync si le ratio de fichiers modifiés/supprimés dépasse le seuil, pour éviter une perte de données accidentelle.
- **Gestion des conflits** : Configurable pour conserver la version la plus récente ou la plus grande en cas de conflit.
- **Saut de gros fichiers** : Ignore les fichiers dépassant un seuil de taille configurable.
- **Sync des signets et du dossier de config** (optionnel).
- **Barre d'état** : Affiche la progression de la sync et l'heure de la dernière sync.
- **Support mobile** : Fonctionnalités complètes sur Obsidian mobile (Android / iOS), y compris le chiffrement de bout en bout.
- **Import/Export URI** pour les paramètres (infos OAuth OneDrive exclues).
- **Nettoyage des dossiers vides** : Supprime automatiquement les dossiers synchronisés devenus vides.
- **[Design minimalement intrusif](./docs/minimal_intrusive_design.md)**.
- **Entièrement open source** ([Apache-2.0](./LICENSE)).
- **[Algorithme de sync](./docs/sync_algorithm.md)**.
- **🌐 Multilingue** — L'UI suit automatiquement la langue d'affichage Obsidian (14 langues : English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский). Aucun paramètre manuel ; retombe sur l'anglais si une traduction manque.

## Limitations & notes

- **Pas de sync des métadonnées — la détection des suppressions repose sur la comparaison d'horodatage.** Recommandé avec les modes Push/Pull incrémental.
- **Résolution de conflits simple** : Les fichiers sont comparés par heure de modification ; la version la plus récente gagne.
- **Les services cloud ont un coût.** Toutes les opérations (envoi, téléchargement, liste des fichiers, appels API) peuvent entraîner des frais.
- **Certaines limitations viennent de l'environnement navigateur**, voir [doc technique](./docs/browser_env.md).
- **Protégez votre fichier `data.json`** — il contient des informations sensibles (clés S3, mots de passe WebDAV, etc.). Ne partagez pas avec d'autres ; recommandé d'ajouter à `.gitignore`.

## Installation

**Option 1** : Recherchez `Obsidian Third-party Sync` dans le marketplace des plugins communautaires Obsidian.

**Option 2** : Utilisez [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), ajoutez le repo `nightfall-yl/obsidian-third-party-sync`.

**Option 3** : Téléchargez manuellement `main.js`, `manifest.json`, `styles.css` depuis la dernière release et placez-les dans le dossier `.obsidian/plugins/third-party-sync/` de votre vault.

## Utilisation

### S3

- Préparez les infos S3 : Endpoint, Region, Access Key ID, Secret Access Key, nom du Bucket.
- Renseignez les paramètres et définissez le mot de passe de chiffrement (si nécessaire).
- Cliquez sur l'icône du ruban pour synchroniser manuellement, ou activez la sync automatique dans les paramètres.

### WebDAV

- Fonctionne avec Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, etc.
- Certains services nécessitent des plugins comme `WebAppPassword`. Voir [doc de configuration WebDAV](./docs/apache_cors_configure.md).

### OneDrive (personnel)

- Comptes personnels uniquement — OneDrive for Business non pris en charge.
- Le plugin lit/écrit dans `/Apps/third-party-sync/` après autorisation.
- Chiffrement E2E pris en charge (le nom du vault lui-même n'est pas chiffré).

### Sync automatique

- Les erreurs échouent silencieusement en mode sync automatique.
- Ne peut pas fonctionner quand Obsidian est fermé (limitation technique des plugins navigateur).

### Fichiers cachés

- Les fichiers/dossiers commençant par `.` ou `_` sont exclus de la sync par défaut.
- Activez la sync des dossiers `_` et du dossier de config `.obsidian` dans les paramètres.

## Offrir un café

Si ce plugin vous est utile, pensez à offrir un café ☕️

<img src="./docs/reward.jpg" width="360" alt="Code QR don" />

## Crédits

- Merci à @fyears pour le projet original [Remotely Save](https://github.com/remotely-save/remotely-save).

## Retour d'expérience

Ouvrez une issue sur [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Les pull requests sont bienvenues !
