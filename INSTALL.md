# CEB 安装说明

## 全局安装（推荐）

### 从本地安装

```bash
# 克隆或下载项目到本地
cd branch-clean

# 全局安装
npm install -g .

# 验证安装
ceb --version
```

### 从 npm 安装（如果已发布）

```bash
npm install -g branch-clean
```

## 本地安装

```bash
# 克隆或下载项目到本地
cd branch-clean

# 安装依赖
npm install

# 使用本地版本
node index.js --preview-only
```

## 验证安装

安装完成后，可以在任何 Git 仓库中运行以下命令验证：

```bash
# 检查命令是否可用
ceb --version

# 预览模式测试
ceb --preview-only
```

## 卸载

```bash
npm uninstall -g branch-clean
```

## 故障排除

### 命令不可用

如果安装后 `ceb` 命令不可用，请检查：

1. npm 全局安装路径是否在 PATH 环境变量中
2. 运行 `npm config get prefix` 查看全局安装路径
3. 确保该路径的 `bin` 目录在 PATH 中

### 权限问题

如果遇到权限问题，可以：

1. 使用 `sudo` 安装（不推荐）
2. 配置 npm 使用不同的全局安装路径
3. 使用 nvm 管理 Node.js 版本

### 依赖问题

如果遇到依赖问题：

1. 确保 Node.js 版本 >= 14.0.0
2. 清除 npm 缓存：`npm cache clean --force`
3. 重新安装：`npm install -g .`
