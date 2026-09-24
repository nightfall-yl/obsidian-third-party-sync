# Obsidian Third-party Sync

Een Obsidian-synchronisatieplugin, geforkt van [Remotely Save](https://github.com/remotely-save/remotely-save) met **beveiligingsgerichte verbeteringen**. De versleutelingslaag is opnieuw opgebouwd (AES-256-GCM) en de codebase is vereenvoudigd. **NIET achterwaarts compatibel met Remotely Save** — maak eerst een back-up van je vault voordat je overstapt.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | [Español](README_es.md) | [Italiano](README_it.md) | Nederlands | [Dansk](README_da.md) | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## Vrijwaring

- **Dit is NIET de [officiële synchronisatiedienst](https://obsidian.md/sync) van Obsidian.**
- **⚠️ Maak ALTIJD een back-up van je vault voordat je deze plugin gebruikt.**

## Waarom een fork van Remotely Save?

### Beveiligingsverbeteringen (belangrijkste verbeteringen)

- **Versleutelingsalgoritme**
  - Remotely Save: AES-CBC of AES-CTR (RClone)
  - Deze plugin: **AES-256-GCM**
- **Integriteitscontrole**
  - Remotely Save: Geen (CBC-modus is kwetsbaar voor padding-oracle-aanvallen)
  - Deze plugin: **Ingebouwde GCM-AuthTag-verificatie**
- **Initialisatievector (IV)**
  - Remotely Save: Afgeleid van wachtwoord (zelfde IV voor alle bestanden onder hetzelfde wachtwoord)
  - Deze plugin: **Per bestand willekeurig gegenereerd**
- **Salt-lengte**
  - Remotely Save: 8 bytes (2^64 mogelijkheden)
  - Deze plugin: **16 bytes** (2^128 mogelijkheden)
- **Versleutelingsafhankelijkheden**
  - Remotely Save: `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - Deze plugin: **Alleen browser-native `window.crypto.subtle` API**

### Architectuurvereenvoudiging

Vergeleken met het origineel maakt deze fork de volgende vereenvoudigingen:

- **Opslagdiensten**: Van 13 naar 3 mainstreamdiensten teruggebracht (S3 / WebDAV / OneDrive). Verwijderd: Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis, enz.
- **Versleutelingsschema's**: Van 2 (OpenSSL + RClone) samengevoegd naar 1 (**AES-256-GCM**).

## Functies

- **Ondersteunde diensten**: Amazon S3 (en compatibel: Tencent COS, Alibaba OSS, Backblaze B2, MinIO, enz.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, enz.), OneDrive persoonlijk. Zie [document over dienstencompatibiliteit](./docs/services_connectable_or_not.md).
- **End-to-end versleuteling** ([details](./docs/encryption.md)): bestanden worden lokaal versleuteld vóór upload via **AES-256-GCM met browser-native Web Crypto API**, uitvoerformaat compatibel met de base64url-bestandsnaamcodering van RClone Crypt.
- **Automatische sync**: Gepland interval, bij opstarten, bij opslaan en detectie van externe wijzigingen.
- **Sync-richting**: Bidirectioneel / incrementele push (back-upmodus) / incrementele pull / varianten met verwijdering.
- **Wijzigingsratio-bescherming**: Breek de sync af als de ratio van gewijzigde/verwijderde bestanden de drempel overschrijdt — voorkomt onbedoeld gegevensverlies.
- **Conflictafhandeling**: Configureerbaar om bij conflicten de nieuwere of grotere versie te behouden.
- **Grote bestanden overslaan**: Sla bestanden over die een configureerbare groottedrempel overschrijden.
- **Bladwijzers en configmap synchroniseren** (optioneel).
- **Statusbalk**: Toont sync-voortgang en laatste sync-tijd.
- **Mobiele ondersteuning**: Volledige functionaliteit op Obsidian Mobile (Android / iOS), inclusief end-to-end versleuteling.
- **URI import/export** voor instellingen (OneDrive OAuth-info uitgesloten).
- **Lege mappen opschonen**: Verwijdert automatisch gesynchroniseerde mappen die leeg zijn geworden.
- **[Minimaal invasief ontwerp](./docs/minimal_intrusive_design.md)**.
- **Volledig open source** ([Apache-2.0](./LICENSE)).
- **[Sync-algoritme](./docs/sync_algorithm.md)**.
- **🌐 Meertalig** — De UI volgt automatisch de weergavetaal van Obsidian (14 talen: English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский). Geen handmatige instelling nodig; valt terug op Engels wanneer een vertaling ontbreekt.

## Beperkingen & opmerkingen

- **Geen metadatasync — verwijderingsdetectie berust op tijdstempelvergelijking.** Aanbevolen te gebruiken met incrementele Push/Pull-modus.
- **Eenvoudige conflictoplossing**: Bestanden worden vergeleken op wijzigingstijd; de nieuwere versie wint.
- **Cloud-diensten kosten geld.** Alle bewerkingen (upload, download, bestandslijst, API-aanroepen) kunnen kosten met zich meebrengen.
- **Sommige beperkingen komen voort uit de browseromgeving**, zie [technische documentatie](./docs/browser_env.md).
- **Bescherm je `data.json`-bestand** — het bevat gevoelige informatie (S3-sleutels, WebDAV-wachtwoorden, enz.). Deel niet met anderen; aanbevolen toe te voegen aan `.gitignore`.

## Installatie

**Optie 1**: Zoek `Obsidian Third-party Sync` in Obsidian's community plugin marketplace.

**Optie 2**: Gebruik [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), voeg repo `nightfall-yl/obsidian-third-party-sync` toe.

**Optie 3**: Download handmatig `main.js`, `manifest.json`, `styles.css` uit de nieuwste release en plaats ze in de `.obsidian/plugins/third-party-sync/` directory van je vault.

## Gebruik

### S3

- Bereid S3-info voor: Endpoint, Region, Access Key ID, Secret Access Key, Bucket-naam.
- Vul instellingen in en stel versleutelingswachtwoord in (indien nodig).
- Klik op het ribbon-pictogram om handmatig te syncen, of schakel automatische sync in instellingen in.

### WebDAV

- Werkt met Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, enz.
- Sommige diensten vereisen plugins zoals `WebAppPassword`. Zie [WebDAV-configuratiedocument](./docs/apache_cors_configure.md).

### OneDrive (persoonlijk)

- Alleen persoonlijke accounts — OneDrive for Business niet ondersteund.
- Plugin leest/schrijft onder `/Apps/third-party-sync/` na autorisatie.
- E2E-versleuteling ondersteund (vault-naam zelf wordt niet versleuteld).

### Automatische sync

- Fouten falen stil in automatische sync-modus.
- Kan niet worden uitgevoerd terwijl Obsidian gesloten is (technische beperking van browser-plugins).

### Verborgen bestanden

- Bestanden/mappen die met `.` of `_` beginnen zijn standaard uitgesloten van sync.
- Schakel sync in voor `_`-mappen en `.obsidian`-configmap in instellingen.

## Trakteer mij op een koffie

Als deze plugin nuttig is, overweeg dan om mij een koffie te trakteren ☕️

<img src="./docs/reward.jpg" width="360" alt="QR-code donatie" />

## Danks

- Bedankt @fyears voor het originele [Remotely Save](https://github.com/remotely-save/remotely-save)-project.

## Feedback

Open een issue op [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Pull requests zijn welkom!
