# Obsidian Third-party Sync

Un plugin de sincronización para Obsidian, derivado de [Remotely Save](https://github.com/remotely-save/remotely-save) con **mejoras centradas en la seguridad**. Reconstruida la capa de cifrado (AES-256-GCM) y simplificada la base de código. **NO es compatible con versiones anteriores de Remotely Save** — haz una copia de seguridad de tu vault antes de cambiarte.

[![Version](https://img.shields.io/badge/version-26.1.5-blue)](https://github.com/nightfall-yl/obsidian-third-party-sync) | [![Obsidian](https://img.shields.io/badge/Obsidian-1.11.0%2B-purple)](https://obsidian.md) | [![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[English](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Français](README_fr.md) | Español | [Italiano](README_it.md) | [Nederlands](README_nl.md) | [Dansk](README_da.md) | [Svenska](README_sv.md) | [Norsk](README_no.md) | [Русский](README_ru.md)

## Aviso legal

- **Esto NO es el [servicio de sincronización oficial](https://obsidian.md/sync) ofrecido por Obsidian.**
- **⚠️ SIEMPRE haz una copia de seguridad de tu vault antes de usar este plugin.**

## ¿Por qué derivar de Remotely Save?

### Mejoras de seguridad (principales mejoras)

- **Algoritmo de cifrado**
  - Remotely Save: AES-CBC o AES-CTR (RClone)
  - Este plugin: **AES-256-GCM**
- **Verificación de integridad**
  - Remotely Save: Ninguna (modo CBC, vulnerable a ataques padding oracle)
  - Este plugin: **Verificación AuthTag GCM integrada**
- **Vector de inicialización (IV)**
  - Remotely Save: Derivado de la contraseña (mismo IV para todos los archivos con la misma contraseña)
  - Este plugin: **Generado aleatoriamente por archivo**
- **Longitud de la sal**
  - Remotely Save: 8 bytes (2^64 posibilidades)
  - Este plugin: **16 bytes** (2^128 posibilidades)
- **Dependencias de cifrado**
  - Remotely Save: `crypto-browserify` + `@fyears/rclone-crypt` + Web Worker
  - Este plugin: **API nativa del navegador `window.crypto.subtle`**

### Simplificación de arquitectura

En comparación con el original, esta bifurcación hace las siguientes simplificaciones:

- **Servicios de almacenamiento**: Reducidos de 13 a 3 servicios principales (S3 / WebDAV / OneDrive). Eliminados Dropbox, Google Drive, Box, Azure Blob, pCloud, Yandex Disk, Koofr, Webdis, etc.
- **Esquemas de cifrado**: Fusionados de 2 (OpenSSL + RClone) en 1 (**AES-256-GCM**).

## Características

- **Servicios admitidos**: Amazon S3 (y compatibles: Tencent COS, Alibaba OSS, Backblaze B2, MinIO, etc.), WebDAV (Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, etc.), OneDrive personal. Consulta [documento de compatibilidad de servicios](./docs/services_connectable_or_not.md).
- **Cifrado de extremo a extremo** ([detalles](./docs/encryption.md)): los archivos se cifran localmente antes de la subida usando **AES-256-GCM mediante Web Crypto API nativa del navegador**, formato de salida compatible con la codificación de nombre de archivo base64url de RClone Crypt.
- **Sincronización automática**: intervalo programado, al iniciar, al guardar y detección de cambios remotos.
- **Dirección de sincronización**: bidireccional / push incremental (modo copia de seguridad) / pull incremental / variantes con eliminación.
- **Protección de ratio de modificación**: aborta la sincronización si el ratio de archivos modificados/eliminados supera el umbral, evitando pérdida de datos accidental.
- **Manejo de conflictos**: configurable para conservar la versión más nueva o la más grande en caso de conflictos.
- **Omitir archivos grandes**: omite archivos que superan un umbral de tamaño configurable.
- **Sincronizar marcadores y directorio de configuración** (opcional).
- **Barra de estado**: muestra progreso de sincronización y última hora de sincronización.
- **Soporte móvil**: funcionalidad completa en Obsidian móvil (Android / iOS), incluido el cifrado de extremo a extremo.
- **Importación/exportación URI** para ajustes (excluyendo información OAuth de OneDrive).
- **Limpieza de carpetas vacías**: elimina automáticamente carpetas sincronizadas que se han quedado vacías.
- **[Diseño mínimamente intrusivo](./docs/minimal_intrusive_design.md)**.
- **Totalmente open source** ([Apache-2.0](./LICENSE)).
- **[Algoritmo de sincronización](./docs/sync_algorithm.md)**.
- **🌐 Multilingüe** — La UI sigue automáticamente el idioma de visualización de Obsidian (14 idiomas: English、简体中文、繁體中文、日本語、한국어、Deutsch、Français、Español、Italiano、Nederlands、Dansk、Svenska、Norsk、Русский). No se requiere configuración manual; vuelve al inglés cuando falta una traducción.

## Limitaciones & notas

- **Sin sincronización de metadatos — la detección de eliminación depende de la comparación de marcas de tiempo.** Recomendado usar con modos Push/Pull incremental.
- **Resolución de conflictos simple**: los archivos se comparan por tiempo de modificación; gana la versión más nueva.
- **Los servicios en la nube cuestan dinero.** Todas las operaciones (subida, descarga, listado de archivos, llamadas a la API) pueden generar cargos.
- **Algunas limitaciones provienen del entorno del navegador**, consulta [documentación técnica](./docs/browser_env.md).
- **Protege tu archivo `data.json`** — contiene información sensible (claves S3, contraseñas WebDAV, etc.). No compartas con otros; recomendado añadir a `.gitignore`.

## Instalación

**Opción 1**: Busca `Obsidian Third-party Sync` en el marketplace de plugins comunitarios de Obsidian.

**Opción 2**: Usa [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat), añade el repositorio `nightfall-yl/obsidian-third-party-sync`.

**Opción 3**: Descarga manualmente `main.js`, `manifest.json`, `styles.css` desde la última release y colócalos en el directorio `.obsidian/plugins/third-party-sync/` de tu vault.

## Uso

### S3

- Prepara la info S3: Endpoint, Region, Access Key ID, Secret Access Key, nombre del Bucket.
- Completa los ajustes y establece la contraseña de cifrado (si es necesario).
- Haz clic en el icono de cinta para sincronizar manualmente, o activa la sincronización automática en ajustes.

### WebDAV

- Funciona con Jianguoyun/Nutstore, Nextcloud, OwnCloud, Seafile, rclone, etc.
- Algunos servicios requieren plugins como `WebAppPassword`. Consulta [documento de configuración WebDAV](./docs/apache_cors_configure.md).

### OneDrive (personal)

- Solo cuentas personales — OneDrive for Business no compatible.
- El plugin lee/escribe bajo `/Apps/third-party-sync/` tras la autorización.
- Cifrado E2E compatible (el nombre del vault en sí no se cifra).

### Sincronización automática

- Los errores fallan silenciosamente en modo de sincronización automática.
- No puede ejecutarse mientras Obsidian está cerrado (limitación técnica de los plugins de navegador).

### Archivos ocultos

- Los archivos/carpetas que comienzan con `.` o `_` están excluidos de la sincronización por defecto.
- Activa la sincronización para carpetas `_` y directorio de configuración `.obsidian` en ajustes.

## Invítame a un café

Si este plugin te resulta útil, considera invitarme a un café ☕️

<img src="./docs/reward.jpg" width="360" alt="Código QR de donación" />

## Créditos

- Gracias a @fyears por el proyecto original [Remotely Save](https://github.com/remotely-save/remotely-save).

## Comentarios

Abre un issue en [GitHub Issues](https://github.com/nightfall-yl/obsidian-third-party-sync/issues). ¡Los pull requests son bienvenidos!
