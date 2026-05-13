# 发布审核合规清单

## 发布前检查清单

### manifest.json 必填字段

```json
{
  "id": "your-plugin-id",          // 唯一标识，仅 a-z 0-9 和连字符
  "name": "Your Plugin Name",      // 人类可读名称
  "version": "1.0.0",              // 语义化版本 (SemVer)
  "minAppVersion": "0.15.0",       // 最低 Obsidian 版本
  "description": "Brief description of your plugin.",
  "author": "Your Name",
  "authorUrl": "https://github.com/your-name",
  "isDesktopOnly": false           // 是否仅桌面端
}
```

### versions.json

记录每个插件版本对应的最低 Obsidian 版本：

```json
{
  "1.0.0": "0.15.0",
  "1.1.0": "0.15.0",
  "2.0.0": "1.0.0"
}
```

## 代码审核常见拒绝原因

### 1. 路径未规范化

```typescript
// ❌ 错误：直接拼接路径
const path = app.vault.configDir + "/plugins/" + pluginId;

// ✅ 正确：使用 normalizePath
import { normalizePath } from 'obsidian';
const path = normalizePath(app.vault.configDir + "/plugins/" + pluginId);
// 结果: ".obsidian/plugins/my-plugin"（统一斜杠、移除多余斜杠）
```

### 2. 资源未清理

```typescript
// ❌ 错误：直接 addEventListener，卸载后残留
document.addEventListener('click', this.handleClick);

// ✅ 正确：使用 registerDomEvent 自动清理
this.registerDomEvent(document, 'click', this.handleClick);

// ❌ 错误：直接 setInterval，卸载后仍在运行
setInterval(() => this.sync(), 60000);

// ✅ 正确：使用 registerInterval 自动清理
this.registerInterval(window.setInterval(() => this.sync(), 60000));
```

### 3. 视图未在 onunload 中清理

```typescript
// ❌ 错误：注册了视图但不清理
onload() {
  this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf));
}

// ✅ 正确：onunload 中 detach
onload() {
  this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf));
}
onunload() {
  this.app.workspace.detachLeavesOfType(VIEW_TYPE);
}
```

### 4. XSS 风险

```typescript
// ❌ 错误：使用 innerHTML
el.innerHTML = userInput;

// ✅ 正确：使用 createEl / textContent
el.createEl('p', { text: userInput });
// 或
el.textContent = userInput;
```

### 5. 不安全的代码执行

```typescript
// ❌ 禁止
eval(code);
new Function(code)();

// ✅ 使用安全的解析方法
JSON.parse(jsonString);
parseYaml(yamlString);
```

### 6. 平台检测错误

```typescript
// ❌ 错误：使用 User-Agent
if (navigator.userAgent.includes('Mobile')) { }

// ✅ 正确：使用 Platform API
import { Platform } from 'obsidian';
if (Platform.isMobile) { }
if (Platform.isDesktop) { }
if (Platform.isDesktopApp) { }
```

## 发布流程

### 第一步：创建 GitHub Release

1. 确保 `manifest.json` 版本号已更新
2. 更新 `versions.json`
3. 构建项目：`npm run build`
4. 创建 Git 标签（不带 `v` 前缀）：

```bash
git tag -a 1.0.0 -m "Release 1.0.0"
git push origin 1.0.0
```

5. 在 GitHub 上创建 Release，上传以下文件：
   - `main.js`（必须）
   - `manifest.json`（必须）
   - `styles.css`（如果有样式）

### 第二步：提交到社区插件列表

1. Fork `obsidianmd/obsidian-releases` 仓库
2. 在 `community-plugins.json` 中添加条目：

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin Name",
  "author": "Your Name",
  "description": "Brief description.",
  "repo": "your-github-username/your-repo-name",
  "branch": "main"
}
```

3. 创建 Pull Request
4. 等待 Obsidian 团队审核（根据反馈修改后重新提交）

### 第三步：更新已发布的插件

只需创建新的 Release（新标签 + 更新后的文件），Obsidian 会自动检测更新。

## GitHub Actions 自动发布

在 `.github/workflows/release.yml` 中配置自动构建和发布：

```yaml
name: Release Obsidian plugin

on:
  push:
    tags:
      - "*"

env:
  PLUGIN_NAME: your-plugin-id

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18.x"

      - name: Build
        run: |
          npm install
          npm run build

      - name: Create Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          tag="${GITHUB_REF#refs/tags/}"
          gh release create "$tag" \
            --title="$tag" \
            --draft \
            main.js manifest.json styles.css
```

## 版本管理最佳实践

### 语义化版本 (SemVer)

- **MAJOR** (1.x.x)：不兼容的 API 变更
- **MINOR** (x.1.x)：向后兼容的功能新增
- **PATCH** (x.x.1)：向后兼容的问题修复

### 使用 standard-version 自动化

```bash
npm install --save-dev standard-version
```

在 `package.json` 中添加：

```json
{
  "scripts": {
    "release": "standard-version"
  },
  "standard-version": {
    "t": ""
  }
}
```

工作流：
1. 使用规范提交：`git commit -m "feat: Add new command"`
2. 运行 `npm run release`（自动更新版本号、生成 CHANGELOG）
3. 推送标签：`git push --follow-tags origin main`
4. GitHub Actions 自动创建 Release

### 常用 commit 前缀

| 前缀 | 说明 | 版本影响 |
|------|------|----------|
| `feat:` | 新功能 | MINOR |
| `fix:` | 修复 bug | PATCH |
| `docs:` | 文档更新 | 无 |
| `refactor:` | 重构 | 无 |
| `BREAKING CHANGE:` | 破坏性变更 | MAJOR |
