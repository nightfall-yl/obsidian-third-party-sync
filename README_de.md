# Obsidian Third-party Sync

Ein Obsidian-Synchronisierungs-Plugin, geforkt von [Remotely Save](https://github.com/remotely-save/remotely-save) mit **sicherheitsorientierten Verbesserungen**. Neu aufgebauter Verschlüsselungs-Layer (AES-256-GCM) und vereinfachter Codebase. **NICHT rückwärtskompatibel mit Remotely Save** — bitte sichere dein Vault vor dem Wechsel.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | Deutsch | [Français](README_fr.md) | [Español](README_es.md) | [Italiano](README_it.md) | [Nederlands](README_nl.md) | [Dansk](README_da.md) | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## Haftungsausschluss

- **Dies ist NICHT der [offizielle Synchronisierungsdienst](https://obsidian.md/sync) von Obsidian.**
- **⚠️ Sichere dein Vault IMMER vor der Verwendung dieses Plugins.**

## Warum von Remotely Save geforkt?

### Sicherheitsverbesserungen (Hauptverbesserungen)

- **Verschlüsselungsalgorithmus**
  - Remotely Save: AES-CBC oder AES-CTR (RClone)
  - Dieses Plugin: **AES-256-GCM**
- **Integritätsprüfung**
  - Remotely Save: Keine (CBC-Modus ist anfällig für Padding-Oracle-Angriffe)
  - Dieses Plugin: **Eingebaute GCM-AuthTag-Verifikation**
- **Initialisierungsvektor (IV)**
  - Remotely Save: Aus Passwort abgeleitet (gleiches IV für alle Dateien unter gleichem Passwort)
  - Dieses Plugin: **Pro Datei zufällig erzeugt**
- **Salt-Länge**
  - Remotely Save: 8 Byte (2^64 Möglichkeiten)
  - Dieses Plugin: **16 Byte** (2^128 Möglichkeiten)
- **Verschlüsselungsabhängigkeiten**
  - Remotely Save: `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - Dieses Plugin: **Nur browser-native `window.crypto.subtle` API**

### Architekturvereinfachung

Gegenüber dem Original macht dieser Fork folgende Vereinfachungen:

- **Speicherdienste**: Von 13 auf 3 Mainstream-Dienste reduziert (S3 / WebDAV / OneDrive). Entfernt wurden Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis usw.
- **Verschlüsselungsschemata**: Von 2 (OpenSSL + RClone) zu 1 (**AES-256-GCM**) zusammengeführt.

## Funktionen

- **Unterstützte Speicherdienste**: Amazon S3 (und kompatibel: Tencent COS, Alibaba OSS, Backblaze B2, MinIO usw.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone usw.), OneDrive Privat. Siehe [Dienstkompatibilitätsdokument](./docs/services_connectable_or_not.md).
- **Ende-zu-Ende-Verschlüsselung** ([Details](./docs/encryption.md)): Dateien werden vor dem Upload lokal mit **AES-256-GCM über browser-native Web Crypto API** verschlüsselt. Ausgabeformat kompatibel mit RClone Crypts base64url-Dateinamenkodierung.
- **Automatische Synchronisierung**: Geplantes Intervall, Start, Bei-Speichern und Remote-Change-Erkennung.
- **Synchronisierungsrichtung**: Bidirektional / Inkrementelles Push (Backup-Modus) / Inkrementelles Pull / Mit-Löschung-Varianten.
- **Änderungsverhältnis-Schutz**: Bricht die Synchronisierung ab, wenn das Verhältnis geänderter/gelöschter Dateien den Schwellenwert überschreitet — verhindert versehentlichen Datenverlust.
- **Konfliktbehandlung**: Konfigurierbar, bei Konflikten die neuere oder größere Version zu behalten.
- **Große Dateien überspringen**: Dateien überspringen, die einen konfigurierten Größenschwellenwert überschreiten.
- **Lesezeichen und Konfigurationsordner synchronisieren** (optional).
- **Statusleiste**: Zeigt Synchronisierungsfortschritt und letzte Synchronisierungszeit.
- **Mobile Unterstützung**: Volle Funktionalität auf Obsidian Mobile (Android / iOS), inklusive Ende-zu-Ende-Verschlüsselung.
- **URI-Import/Export** für Einstellungen (OneDrive OAuth-Info ausgeschlossen).
- **Leere Ordner bereinigen**: Entfernt automatisch synchronisierte Ordner, die leer geworden sind.
- **[Minimal invasives Design](./docs/minimal_intrusive_design.md)**.
- **Vollständig Open Source** ([Apache-2.0](./LICENSE)).
- **[Synchronisierungsalgorithmus](./docs/sync_algorithm.md)**.
- **🌐 Mehrsprachig** — Die UI folgt automatisch deiner Obsidian-Anzeigesprache (14 Sprachen: English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский). Keine manuelle Einstellung erforderlich; fällt auf Englisch zurück, wenn eine Übersetzung fehlt.

## Einschränkungen & Hinweise

- **Keine Metadaten-Synchronisierung — Löschserkennung beruht auf Zeitstempelvergleich.** Empfohlen zur Verwendung mit Inkrementellem Push/Pull-Modus.
- **Einfache Konfliktlösung**: Dateien werden nach Änderungszeit verglichen; die neuere Version gewinnt.
- **Cloud-Dienste kosten Geld.** Alle Vorgänge (Upload, Download, Dateilisting, API-Aufrufe) können Kosten verursachen.
- **Einige Einschränkungen stammen aus der Browser-Umgebung**, siehe [technische Dokumentation](./docs/browser_env.md).
- **Schütze deine `data.json`-Datei** — sie enthält sensible Informationen (S3-Schlüssel, WebDAV-Passwörter usw.). Nicht mit anderen teilen; zur Hinzufügung zu `.gitignore` empfohlen.

## Installation

**Option 1**: Suche `Obsidian Third-party Sync` in Obsidians Community-Plugin-Marktplatz.

**Option 2**: Nutze [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), füge Repository `nightfall-yl/obsidian-third-party-sync` hinzu.

**Option 3**: Lade manuell `main.js`, `manifest.json`, `styles.css` aus dem neuesten Release herunter und platziere sie im `.obsidian/plugins/third-party-sync/`-Verzeichnis deines Vaults.

## Verwendung

### S3

- S3-Info vorbereiten: Endpoint, Region, Access Key ID, Secret Access Key, Bucket-Name.
- Einstellungen ausfüllen und Verschlüsselungspasswort setzen (falls nötig).
- Ribbon-Icon klicken, um manuell zu synchronisieren, oder Auto-Sync in Einstellungen aktivieren.

### WebDAV

- Funktioniert mit Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone usw.
- Einige Dienste erfordern Plugins wie `WebAppPassword`. Siehe [WebDAV-Konfigurationsdokument](./docs/apache_cors_configure.md).

### OneDrive (Privat)

- Nur persönliche Konten — OneDrive for Business nicht unterstützt.
- Plugin liest/schreibt nach der Autorisierung unter `/Apps/third-party-sync/`.
- E2E-Verschlüsselung unterstützt (Vault-Name selbst ist nicht verschlüsselt).

### Auto-Sync

- Fehler scheitern still im Auto-Sync-Modus.
- Kann nicht ausgeführt werden, während Obsidian geschlossen ist (technische Einschränkung des Browser-Plugins).

### Versteckte Dateien

- Dateien/Ordner, die mit `.` oder `_` beginnen, sind standardmäßig von der Synchronisierung ausgeschlossen.
- Synchronisierung für `_`-Ordner und `.obsidian`-Konfigurationsordner in Einstellungen aktivieren.

## Spendieren

Wenn dieses Plugin dir hilft, lade den Autor auf einen Kaffee ein ☕️

<img src="./docs/reward.jpg" width="360" alt="Spenden-QR" />

## Credits

- Danke an @fyears für das ursprüngliche [Remotely Save](https://github.com/remotely-save/remotely-save)-Projekt.

## Feedback

Erstelle ein Issue auf [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). Pull Requests sind willkommen!
