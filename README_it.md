# Obsidian Third-party Sync

Un plugin di sincronizzazione per Obsidian, derivato da [Remotely Save](https://github.com/remotely-save/remotely-save) con **migliorie incentrate sulla sicurezza**. Ricostruita la crittografia (AES-256-GCM) e semplificata la codebase. **NON è compatibile con le versioni precedenti di Remotely Save** — fai un backup del tuo vault prima di passare.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | [Español](README_es.md) | Italiano | [Nederlands](README_nl.md) | [Dansk](README_da.md) | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## Disclamer

- **Questo NON è il [servizio di sincronizzazione ufficiale](https://obsidian.md/sync) fornito da Obsidian.**
- **⚠️ Fai SEMPRE un backup del tuo vault prima di usare questo plugin.**

## Perché derivare da Remotely Save?

### Migliorie sulla sicurezza (migliorie principali)

- **Algoritmo di cifratura**
  - Remotely Save: AES-CBC o AES-CTR (RClone)
  - Questo plugin: **AES-256-GCM**
- **Controllo di integrità**
  - Remotely Save: Nessuno (modalità CBC, vulnerabile ad attacchi padding oracle)
  - Questo plugin: **Verifica AuthTag GCM integrata**
- **Vettore di inizializzazione (IV)**
  - Remotely Save: Derivato dalla password (stesso IV per tutti i file con la stessa password)
  - Questo plugin: **Generato casualmente per ogni file**
- **Lunghezza del salt**
  - Remotely Save: 8 byte (2^64 possibilità)
  - Questo plugin: **16 byte** (2^128 possibilità)
- **Dipendenze di cifratura**
  - Remotely Save: `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - Questo plugin: **API nativa del browser `window.crypto.subtle`**

### Semplificazione architetturale

Rispetto all'originale, questa fork apporta le seguenti semplificazioni:

- **Servizi di storage**: Ridotti da 13 a 3 servizi principali (S3 / WebDAV / OneDrive). Rimossi Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis, ecc.
- **Schemi di cifratura**: Fusione da 2 (OpenSSL + RClone) a 1 (**AES-256-GCM**).

## Funzionalità

- **Servizi supportati**: Amazon S3 (e compatibili: Tencent COS, Alibaba OSS, Backblaze B2, MinIO, ecc.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, ecc.), OneDrive personale. Vedi [documento di compatibilità dei servizi](./docs/services_connectable_or_not.md).
- **Crittografia end-to-end** ([dettagli](./docs/encryption.md)): i file vengono cifrati localmente prima del caricamento usando **AES-256-GCM tramite Web Crypto API nativa del browser**, formato di output compatibile con la codifica dei nomi file base64url di RClone Crypt.
- **Sincronizzazione automatica**: intervallo programmato, all'avvio, al salvataggio e rilevamento di modifiche remote.
- **Direzione di sincronizzazione**: bidirezionale / push incrementale (modalità backup) / pull incrementale / varianti con eliminazione.
- **Protezione ratio modifica**: interrompe la sincronizzazione se il ratio di file modificati/eliminati supera la soglia, prevenendo perdita di dati accidentale.
- **Gestione conflitti**: configurabile per mantenere la versione più recente o la più grande in caso di conflitti.
- **Salta file grandi**: salta file che superano una soglia di dimensione configurabile.
- **Sincronizza segnalibri e cartella di config** (opzionale).
- **Barra di stato**: mostra progresso sincronizzazione e ora dell'ultima sincronizzazione.
- **Supporto mobile**: funzionalità completa su Obsidian mobile (Android / iOS), inclusa la crittografia end-to-end.
- **Importazione/esportazione URI** per impostazioni (escluse informazioni OAuth OneDrive).
- **Pulizia cartelle vuote**: rimuove automaticamente cartelle sincronizzate che sono diventate vuote.
- **[Design minimamente invasivo](./docs/minimal_intrusive_design.md)**.
- **Completamente open source** ([Apache-2.0](./LICENSE)).
- **[Algoritmo di sincronizzazione](./docs/sync_algorithm.md)**.
- **🌐 Multilingue** — L'UI segue automaticamente la lingua di visualizzazione di Obsidian (14 lingue: English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский). Nessuna impostazione manuale richiesta; torna all'inglese quando manca una traduzione.

## Limitazioni & note

- **Nessuna sincronizzazione metadati — il rilevamento delle eliminazioni dipende dal confronto timestamp.** Consigliato uso con modalità Push/Pull incrementale.
- **Risoluzione conflitti semplice**: i file vengono confrontati per ora di modifica; vince la versione più recente.
- **I servizi cloud hanno un costo.** Tutte le operazioni (caricamento, download, elenco file, chiamate API) possono generare addebiti.
- **Alcune limitazioni derivano dall'ambiente browser**, vedi [documentazione tecnica](./docs/browser_env.md).
- **Proteggi il tuo file `data.json`** — contiene informazioni sensibili (chiavi S3, password WebDAV, ecc.). Non condividere con altri; consigliato aggiungere a `.gitignore`.

## Installazione

**Opzione 1**: Cerca `Obsidian Third-party Sync` nel marketplace plugin comunitario di Obsidian.

**Opzione 2**: Usa [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), aggiungi repo `nightfall-yl/obsidian-third-party-sync`.

**Opzione 3**: Scarica manualmente `main.js`, `manifest.json`, `styles.css` dall'ultima release e posizionali nella directory `.obsidian/plugins/third-party-sync/` del tuo vault.

## Utilizzo

### S3

- Prepara le info S3: Endpoint, Region, Access Key ID, Secret Access Key, nome Bucket.
- Compila le impostazioni e imposta la password di cifratura (se necessaria).
- Clicca l'icona ribbon per sincronizzare manualmente, o attiva la sincronizzazione automatica nelle impostazioni.

### WebDAV

- Funziona con Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, ecc.
- Alcuni servizi richiedono plugin come `WebAppPassword`. Vedi [documento di configurazione WebDAV](./docs/apache_cors_configure.md).

### OneDrive (personale)

- Solo account personali — OneDrive for Business non supportato.
- Il plugin legge/scrive sotto `/Apps/third-party-sync/` dopo autorizzazione.
- Crittografia E2E supportata (il nome vault stesso non viene cifrato).

### Sync automatica

- Gli errori falliscono silenziosamente in modalità sync automatica.
- Non può essere eseguito mentre Obsidian è chiuso (limitazione tecnica dei plugin browser).

### File nascosti

- File/cartelle che iniziano con `.` o `_` sono esclusi dalla sync di default.
- Attiva la sync per cartelle `_` e cartella di config `.obsidian` nelle impostazioni.

## Offrimi un caffè

Se questo plugin ti è utile, considera di offrirmi un caffè ☕️

<img src="./docs/reward.jpg" width="360" alt="QR code donazione" />

## Crediti

- Grazie a @fyears per il progetto originale [Remotely Save](https://github.com/remotely-save/remotely-save).

## Feedback

Apri un issue su [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Le pull request sono benvenute!
