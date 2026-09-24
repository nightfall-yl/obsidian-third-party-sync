# Obsidian Third-party Sync

En Obsidian-synkroniseringsplugin, fork fra [Remotely Save](https://github.com/remotely-save/remotely-save) med **sikkerhedsfokuserede forbedringer**. Genopbygget krypteringslag (AES-256-GCM) og forenklet kodebase. **IKKE bagudkompatibel med Remotely Save** — tag venligst backup af dit vault før du skifter.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | [Español](README_es.md) | [Italiano](README_it.md) | [Nederlands](README_nl.md) | Dansk | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## Ansvarsfraskrivelse

- **Dette er IKKE den [officielle synkroniseringstjeneste](https://obsidian.md/sync), som Obsidian leverer.**
- **⚠️ Tag ALTID backup af dit vault før du bruger denne plugin.**

## Hvorfor fork fra Remotely Save?

### Sikkerhedsforbedringer (væsentlige forbedringer)

- **Krypteringsalgoritme**
  - Remotely Save: AES-CBC eller AES-CTR (RClone)
  - Denne plugin: **AES-256-GCM**
- **Integritetskontrol**
  - Remotely Save: Ingen (CBC-tilstand, sårbar over for padding-oracle-angreb)
  - Denne plugin: **Indbygget GCM-AuthTag-verifikation**
- **Initialiseringsvektor (IV)**
  - Remotely Save: Udledet fra adgangskode (samme IV for alle filer under samme adgangskode)
  - Denne plugin: **Tilfældigt genereret pr. fil**
- **Salt-længde**
  - Remotely Save: 8 bytes (2^64 muligheder)
  - Denne plugin: **16 bytes** (2^128 muligheder)
- **Krypteringsafhængigheder**
  - Remotely Save: `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - Denne plugin: **Kun browser-nativ `window.crypto.subtle` API**

### Arkitekturforenkling

Sammenlignet med originalen foretager denne fork følgende forenklinger:

- **Lagringstjenester**: Reduceret fra 13 til 3 mainstream-tjenester (S3 / WebDAV / OneDrive). Fjernet Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis osv.
- **Krypteringsordninger**: Samlet fra 2 (OpenSSL + RClone) til 1 (**AES-256-GCM**).

## Funktioner

- **Understøttede tjenester**: Amazon S3 (og kompatible: Tencent COS, Alibaba OSS, Backblaze B2, MinIO osv.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone osv.), OneDrive personlig. Se [tjenestekompatibilitetsdokument](./docs/services_connectable_or_not.md).
- **End-to-end kryptering** ([detaljer](./docs/encryption.md)): filer krypteres lokalt før upload ved hjælp af **AES-256-GCM via browser-nativ Web Crypto API**, outputformat kompatibelt med RClone Crypts base64url-filnavnkodning.
- **Automatisk synkronisering**: Planlagt interval, ved opstart, ved lagring og fjernændringsdetektion.
- **Synkroniseringsretning**: Todirektet / inkrementel push (sikkerhedskopieringstilstand) / inkrementel pull / varianter med sletning.
- **Ændringsratio-beskyttelse**: Afbryder synkronisering, hvis ratioen af ændrede/slettede filer overskrider tærsklen — forhindrer utilsigtet datatab.
- **Konflikthåndtering**: Konfigurerbar til at bevare den nyeste eller største version ved konflikter.
- **Store filer springes over**: Springer filer over, der overskrider en konfigurerbar størrelsestærskel.
- **Bogmærker og config-mappe synkroniseres** (valgfrit).
- **Statuslinje**: Viser synkroniseringsfremskridt og seneste synkroniseringstid.
- **Mobilunderstøttelse**: Fuld funktionalitet på Obsidian Mobil (Android / iOS), inklusiv end-to-end kryptering.
- **URI import/eksport** for indstillinger (OneDrive OAuth-oplysninger undtaget).
- **Tomme mapper rengøres**: Fjerner automatisk synkroniserede mapper, der er blevet tomme.
- **[Minimalt invasivt design](./docs/minimal_intrusive_design.md)**.
- **Helt open source** ([Apache-2.0](./LICENSE)).
- **[Synkroniseringsalgoritme](./docs/sync_algorithm.md)**.
- **🌐 Flersproget** — UI'en følger automatisk din Obsidian-visningssprog (14 sprog: English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский). Ingen manuel indstilling nødvendig; falder tilbage til engelsk, hvis en oversættelse mangler.

## Begrænsninger & bemærkninger

- **Ingen metadatasynkronisering — slettedetektion afhænger af tidsstempel-sammenligning.** Anbefalet brug med inkrementel Push/Pull-tilstand.
- **Enkel konfliktløsning**: Filer sammenlignes efter ændringstid; den nyeste version vinder.
- **Cloud-tjenester koster penge.** Alle operationer (upload, download, filliste, API-opkald) kan medføre udgifter.
- **Nogle begrænsninger stammer fra browsermiljøet**, se [teknisk dokumentation](./docs/browser_env.md).
- **Beskyt din `data.json`-fil** — den indeholder følsomme oplysninger (S3-nøgler, WebDAV-adgangskoder osv.). Del ikke med andre; anbefales at tilføje til `.gitignore`.

## Installation

**Mulighed 1**: Søg efter `Obsidian Third-party Sync` i Obsidians community plugin-markedsplads.

**Mulighed 2**: Brug [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), tilføj repo `nightfall-yl/obsidian-third-party-sync`.

**Mulighed 3**: Download manuelt `main.js`, `manifest.json`, `styles.css` fra den nyeste release og placer dem i din vaults `.obsidian/plugins/third-party-sync/`-mappe.

## Brug

### S3

- Forbered S3-oplysninger: Endpoint, Region, Access Key ID, Secret Access Key, Bucket-navn.
- Udfyld indstillinger og indstil krypteringsadgangskode (hvis nødvendigt).
- Klik på ribbon-ikonet for at synkronisere manuelt, eller aktiver automatisk synkronisering i indstillinger.

### WebDAV

- Virker med Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone osv.
- Nogle tjenester kræver plugins som `WebAppPassword`. Se [WebDAV-konfigurationsdokument](./docs/apache_cors_configure.md).

### OneDrive (Personlig)

- Kun personlige konti — OneDrive for Business ikke understøttet.
- Plugin læser/skriver under `/Apps/third-party-sync/` efter autorisation.
- E2E-kryptering understøttet (vault-navnet selv krypteres ikke).

### Automatisk synkronisering

- Fejl mislykkes lydløst i automatisk synkroniseringstilstand.
- Kan ikke køre, mens Obsidian er lukket (browser-plugins tekniske begrænsning).

### Skjulte filer

- Filer/mapper, der begynder med `.` eller `_`, er som standard udelukket fra synkronisering.
- Aktiver synkronisering for `_`-mapper og `.obsidian` config-mappe i indstillinger.

## Spis en kaffe på mig

Hvis denne plugin er nyttig for dig, overvej venligst at invitere mig på en kaffe ☕️

<img src="./docs/reward.jpg" width="360" alt="Donationskode" />

## Kreditter

- Tak til @fyears for det originale [Remotely Save](https://github.com/remotely-save/remotely-save)-projekt.

## Feedback

Åbn et issue på [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Pull requests er velkomne!
