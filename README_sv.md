# Obsidian Third-party Sync

En Obsidian-synkroniseringsplugin, forkad från [Remotely Save](https://github.com/remotely-save/remotely-save) med **säkerhetsfokuserade förbättringar**. Ombyggd krypteringslager (AES-256-GCM) och förenklad kodbas. **INTE bakåtkompatibel med Remotely Save** — vänligen säkerhetskopiera ditt valv innan du byter.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | [Español](README_es.md) | [Italiano](README_it.md) | [Nederlands](README_nl.md) | [Dansk](README_da.md) | Svenska | [Norsk](README_no.md) | [Русский](README_ru.md)

## Ansvarsfriskrivning

- **Detta är INTE den [officiella synkroniseringstjänsten](https://obsidian.md/sync) som tillhandahålls av Obsidian.**
- **⚠️ SÄKERHETSKOPIERA ALLTID ditt valv innan du använder denna plugin.**

## Varför fork från Remotely Save?

### Säkerhetsförbättringar (huvudförbättringar)

- **Krypteringsalgoritm**
  - Remotely Save: AES-CBC eller AES-CTR (RClone)
  - Denna plugin: **AES-256-GCM**
- **Integritetskontroll**
  - Remotely Save: Ingen (CBC-läge, sårbar för padding-oracle-angrepp)
  - Denna plugin: **Inbyggd GCM-AuthTag-verifiering**
- **Initialiseringsvektor (IV)**
  - Remotely Save: Härledd från lösenord (samma IV för alla filer under samma lösenord)
  - Denna plugin: **Slumpmässigt genererad per fil**
- **Saltlängd**
  - Remotely Save: 8 byte (2^64 möjligheter)
  - Denna plugin: **16 byte** (2^128 möjligheter)
- **Krypteringsberoenden**
  - Remotely Save: `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - Denna plugin: **Ren webbläsarnativ `window.crypto.subtle` API**

### Arkitekturförenkling

Jämfört med originalet gör denna fork följande förenklingar:

- **Lagringstjänster**: Reducerad från 13 till 3 mainstream-tjänster (S3 / WebDAV / OneDrive). Tog bort Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis m.m.
- **Krypteringsscheman**: Sammanslår från 2 (OpenSSL + RClone) till 1 (**AES-256-GCM**).

## Funktioner

- **Stödda tjänster**: Amazon S3 (och kompatibla: Tencent COS, Alibaba OSS, Backblaze B2, MinIO m.m.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone m.m.), OneDrive personlig. Se [tjänstkompatibilitetsdokument](./docs/services_connectable_or_not.md).
- **End-to-end-kryptering** ([detaljer](./docs/encryption.md)): filer krypteras lokalt före uppladdning med **AES-256-GCM via webbläsarnativ Web Crypto API**, utdataformat kompatibel med RClone Crypts base64url-filnamnskodning.
- **Automatisk synkronisering**: Schemalagt intervall, vid uppstart, vid sparning och fjärrändringsdetektion.
- **Synkroniseringsriktning**: Tvåriktad / inkrementell push (säkerhetskopieringsläge) / inkrementell pull / varianter med borttagning.
- **Ändringsförhållande-skydd**: Avbryter synkronisering om förhållandet mellan ändrade/borttagna filer överskrider tröskelvärdet — förhindrar oavsiktlig dataförlust.
- **Konflikthantering**: Konfigurerbar att behålla nyare eller större version vid konflikter.
- **Skjuta stora filer**: Hoppar över filer som överskrider en konfigurerbar storlekströskel.
- **Synkronisera bokmärken och konfigurationsmapp** (valfritt).
- **Statusfält**: Visar synkroniseringsframsteg och senaste synkroniseringstid.
- **Mobilstöd**: Full funktionalitet på Obsidian Mobil (Android / iOS), inklusive end-to-end-kryptering.
- **URI import/export** för inställningar (OneDrive OAuth-information undantagen).
- **Rensa tomma mappar**: Tar automatiskt bort synkroniserade mappar som blivit tomma.
- **[Minimal invasiv design](./docs/minimal_intrusive_design.md)**.
- **Helt öppen källkod** ([Apache-2.0](./LICENSE)).
- **[Synkroniseringsalgoritm](./docs/sync_algorithm.md)**.
- **🌐 Flerspråkig** — UI följer automatiskt ditt Obsidian-visningsspråk (14 språk: English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский). Ingen manuell inställning krävs; faller tillbaka till engelska när en översättning saknas.

## Begränsningar & anmärkningar

- **Ingen metadatasynkronisering — borttagningsdetektion förlitar sig på tidstämpsjämförelse.** Rekommenderad användning med inkrementellt Push/Pull-läge.
- **Enkel konfliktlösning**: Filer jämförs efter ändringstid; den nyare versionen vinner.
- **Molntjänster kostar pengar.** Alla operationer (uppladdning, nedladdning, fillista, API-anrop) kan medföra avgifter.
- **Vissa begränsningar härrör från webbläsarmiljön**, se [teknisk dokumentation](./docs/browser_env.md).
- **Skydda din `data.json`-fil** — den innehåller känslig information (S3-nycklar, WebDAV-lösenord m.m.). Dela inte med andra; rekommenderad att lägga till i `.gitignore`.

## Installation

**Alternativ 1**: Sök efter `Obsidian Third-party Sync` i Obsidians community-pluginsmarknad.

**Alternativ 2**: Använd [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), lägg till repo `nightfall-yl/obsidian-third-party-sync`.

**Alternativ 3**: Ladda ner manuellt `main.js`, `manifest.json`, `styles.css` från senaste release och placera dem i ditt valvs `.obsidian/plugins/third-party-sync/`-katalog.

## Användning

### S3

- Förbered S3-information: Endpoint, Region, Access Key ID, Secret Access Key, Bucket-namn.
- Fyll i inställningar och sätt krypteringslösenord (om nödvändigt).
- Klicka på ribbonikonen för att synkronisera manuellt, eller aktivera automatisk synkronisering i inställningar.

### WebDAV

- Fungerar med Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone m.m.
- Vissa tjänster kräver plugins som `WebAppPassword`. Se [WebDAV-konfigurationsdokument](./docs/apache_cors_configure.md).

### OneDrive (Personlig)

- Endast personliga konton — OneDrive for Business stöds inte.
- Plugin läser/skriver under `/Apps/third-party-sync/` efter auktorisering.
- E2E-kryptering stöds (valvnamnet i sig krypteras inte).

### Automatisk synkronisering

- Fel misslyckas tyst i automatiskt synkroniseringsläge.
- Kan inte köras medan Obsidian är stängt (webbläsarplugin teknisk begränsning).

### Dolda filer

- Filer/mappar som börjar med `.` eller `_` är uteslutna från synkronisering som standard.
- Aktivera synkronisering för `_`-mappar och `.obsidian` konfigurationsmapp i inställningar.

### Bjud på kaffe

Om denna plugin hjälper dig, överväg gärna att bjuda mig på en kaffe ☕️

<img src="./docs/reward.jpg" width="360" alt="Donationskod" />

## Krediter

- Tack till @fyears för det ursprungliga [Remotely Save](https://github.com/remotely-save/remotely-save)-projektet.

## Feedback

Öppna ett ärende på [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Pull requests välkomna!
