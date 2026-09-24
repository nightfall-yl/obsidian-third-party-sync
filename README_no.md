# Obsidian Third-party Sync

Et Obsidian-synkroniseringsplugin, fork fra [Remotely Save](https://github.com/remotely-save/remotely-save) med **sikkerhetsfokuserte forbedringer**. Ombygd krypteringslag (AES-256-GCM) og forenklet kodebase. **IKKE bakoverkompatibel med Remotely Save** — vennligst ta sikkerhetskopi av valvet ditt før du bytter.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | [Español](README_es.md) | [Italiano](README_it.md) | [Nederlands](README_nl.md) | [Dansk](README_da.md) | [Svenska](README_sv.md) | Norsk | [Русский](README_ru.md)

## Ansvarsfraskrivelse

- **Dette er IKKE den [offisielle synkroniseringstjenesten](https://obsidian.md/sync) levert av Obsidian.**
- **⚠️ TA ALLTID sikkerhetskopi av valvet ditt før du bruker denne plugin-en.**

## Hvorfor fork fra Remotely Save?

### Sikkerhetsforbedringer (hovedforbedringer)

- **Krypteringsalgoritme**
  - Remotely Save: AES-CBC eller AES-CTR (RClone)
  - Denne plugin-en: **AES-256-GCM**
- **Integritetskontroll**
  - Remotely Save: Ingen (CBC-modus, sårbar for padding-oracle-angrep)
  - Denne plugin-en: **Innebygd GCM-AuthTag-verifisering**
- **Initialiseringsvektor (IV)**
  - Remotely Save: Utledet fra passord (samme IV for alle filer under samme passord)
  - Denne plugin-en: **Tilfeldig generert per fil**
- **Salt-lengde**
  - Remotely Save: 8 byte (2^64 muligheter)
  - Denne plugin-en: **16 byte** (2^128 muligheter)
- **Krypteringsavhengigheter**
  - Remotely Save: `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - Denne plugin-en: **Ren nettleser-nativ `window.crypto.subtle` API**

### Arkitekturforenkling

Sammenlignet med originalen gjør denne fork-en følgende forenklinger:

- **Lagringstjenester**: Redusert fra 13 til 3 mainstream-tjenester (S3 / WebDAV / OneDrive). Fjernet Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis osv.
- **Krypteringsordninger**: Fusjonert fra 2 (OpenSSL + RClone) til 1 (**AES-256-GCM**).

## Funksjoner

- **Støttede tjenester**: Amazon S3 (og kompatible: Tencent COS, Alibaba OSS, Backblaze B2, MinIO osv.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone osv.), OneDrive personlig. Se [tjenestekompatibilitetsdokument](./docs/services_connectable_or_not.md).
- **End-to-end kryptering** ([detaljer](./docs/encryption.md)): filer krypteres lokalt før opplasting ved hjelp av **AES-256-GCM via nettleser-nativ Web Crypto API**, utdataformat kompatibelt med RClone Crypts base64url-filnavnkoding.
- **Automatisk synkronisering**: Planlagt intervall, ved oppstart, ved lagring og fjerndringsdeteksjon.
- **Synkroniseringsretning**: Todirektet / inkrementell push (sikkerhetskopieringsmodus) / inkrementell pull / varianter med sletting.
- **Endringsforhold-beskyttelse**: Avbryter synkronisering hvis forholdet mellom endrede/slettede filer overskrider terskelen — forhindrer utilsiktet datatap.
- **Konflikthåndtering**: Konfigurerbar for å beholde nyere eller større versjon ved konflikter.
- **Hopp over store filer**: Hopper over filer som overskrider en konfigurerbar størrelsesterskel.
- **Synkroniser bokmerker og konfigurasjonsmappe** (valgfritt).
- **Statuslinje**: Viser synkroniseringsfremgang og siste synkroniseringstid.
- **Mobilstøtte**: Full funksjonalitet på Obsidian Mobil (Android / iOS), inkludert end-to-end kryptering.
- **URI import/eksport** for innstillinger (OneDrive OAuth-informasjon unntatt).
- **Tømme mapper renses**: Fjerner automatisk synkroniserte mapper som er blitt tomme.
- **[Minimalt invasiv design](./docs/minimal_intrusive_design.md)**.
- **Helt åpen kildekode** ([Apache-2.0](./LICENSE)).
- **[Synkroniseringsalgoritme](./docs/sync_algorithm.md)**.
- **🌐 Flerspråklig** — UI følger automatisk Obsidian-visningsspråket ditt (14 språk: English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский). Ingen manuell innstilling kreves; faller tilbake til engelsk når en oversettelse mangler.

## Begrensninger & merknader

- **Ingen metadata-synkronisering — slettedeteksjon avhenger av tidsstempel-sammenligning.** Anbefalt bruk med inkrementell Push/Pull-modus.
- **Enkel konflikthelning**: Filer sammenlignes etter endringstid; den nyeste versjonen vinner.
- **Skytjenester koster penger.** Alle operasjoner (opplasting, nedlasting, filliste, API-kall) kan medføre kostnader.
- **Noen begrensninger kommer fra nettlesermiljøet**, se [teknisk dokumentasjon](./docs/browser_env.md).
- **Beskytt `data.json`-filen din** — den inneholder sensitiv informasjon (S3-nøkler, WebDAV-passord osv.). Ikke del med andre; anbefalt å legge til i `.gitignore`.

## Installasjon

**Alternativ 1**: Søk etter `Obsidian Third-party Sync` i Obsidians community-plugin-markedsplass.

**Alternativ 2**: Bruk [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), legg til repo `nightfall-yl/obsidian-third-party-sync`.

**Alternativ 3**: Last ned manuelt `main.js`, `manifest.json`, `styles.css` fra nyeste release og plasser dem i valvets `.obsidian/plugins/third-party-sync/`-katalog.

## Bruk

### S3

- Forbered S3-informasjon: Endpoint, Region, Access Key ID, Secret Access Key, Bucket-navn.
- Fyll inn innstillinger og sett krypteringspassord (hvis nødvendig).
- Klikk på ribbonikonet for å synkronisere manuelt, eller aktiver automatisk synkronisering i innstillinger.

### WebDAV

- Fungerer med Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone osv.
- Noen tjenester krever plugins som `WebAppPassword`. Se [WebDAV-konfigurasjonsdokument](./docs/apache_cors_configure.md).

### OneDrive (Personlig)

- Bare personlige kontoer — OneDrive for Business ikke støttet.
- Plugin leser/skriver under `/Apps/third-party-sync/` etter autorisasjon.
- E2E-kryptering støttet (valvnavnet i seg krypteres ikke).

### Automatisk synkronisering

- Feil mislykkes stille i automatisk synkroniseringsmodus.
- Kan ikke kjøres mens Obsidian er lukket (nettleser-plugin teknisk begrensning).

### Skjulte filer

- Filer/mapper som begynner med `.` eller `_` er utelukket fra synkronisering som standard.
- Aktiver synkronisering for `_`-mapper og `.obsidian` konfigurasjonsmappe i innstillinger.

### Spander en kaffe på meg

Hvis denne plugin-en hjelper deg, vurder gjerne å spandere en kaffe ☕️

<img src="./docs/reward.jpg" width="360" alt="Donasjonskode" />

## Bidragsytere

- Takk til @fyears for det originale [Remotely Save](https://github.com/remotely-save/remotely-save)-prosjektet.

## Tilbakemelding

Åpne et issue på [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Pull requests er velkomne!
