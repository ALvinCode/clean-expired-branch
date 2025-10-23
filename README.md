# CEB - Git 分支清理工具

[![npm version](https://badge.fury.io/js/branch-clean.svg)](https://badge.fury.io/js/branch-clean)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个自动清理无用历史分支和标签的 npm 工具包，支持全局安装，自动识别 Git 项目，帮助您保持 Git 仓库的整洁和高效。

## 功能特性

- 🗂️ **智能分支清理**: 自动识别并清理超过指定时间未更新的本地和远程分支
- 🏷️ **标签管理**: 支持清理过期的 Git 标签
- 🛡️ **保护机制**: 可配置受保护的分支和标签，防止误删重要分支
- 🔍 **预览模式**: 执行删除前可预览即将清理的内容
- 📊 **统计对比**: 显示清理前后的仓库统计信息对比
- ⚙️ **灵活配置**: 支持命令行参数和配置文件两种配置方式
- 🎯 **强制删除**: 支持强制删除特定分支，即使它们在保护列表中
- 🎯 **选择性清理**: 支持单独清理本地分支、远程分支、本地标签、远程标签
- 🧹 **收尾清理**: 支持单独执行收尾清理（清理远程引用和垃圾回收）
- 🌍 **全局安装**: 支持全局安装，在任何 Git 仓库中使用 `ceb` 命令
- 🔍 **自动识别**: 自动识别 Git 项目，非 Git 项目会提示错误

## 安装

### 全局安装（推荐）

```bash
# 全局安装
npm install -g branch-clean
```

安装完成后，您可以在任何 Git 仓库中使用 `ceb` 命令：

```bash
# 验证安装
ceb --version

# 预览模式
ceb --preview-only
```

## 使用方法

### 基本用法

```bash
# 使用默认配置（清理365天前的分支）
ceb

# 仅预览，不执行删除
ceb --preview-only

# 跳过确认，直接执行删除
ceb --yes
```

### 命令行参数

```bash
# 指定清理时间范围（天）
ceb --days 30

# 指定受保护的分支
ceb --protected "production,staging,master,main"

# 指定强制删除的分支（注意：无法绕过服务器端保护）
ceb --force-delete "temp-*,old-*"

# 指定清理目标（支持简写）
ceb --clean-targets local-branches,remote-tags
ceb -t lb,rt

# 仅执行收尾清理
ceb --cleanup-only

# 指定配置文件路径
ceb --config ./my-config.json

# 仅预览，不执行删除
ceb --preview-only

# 跳过确认，直接执行删除
ceb --yes

# 显示详细的预览信息（不折叠）
ceb --verbose

# 显示详细的错误信息
ceb --debug
```

### 配置文件

配置文件是可选的。如果不创建配置文件，工具会使用默认配置。

如果需要自定义配置，可以在Git仓库根目录创建 `branch-clean.config.json` 文件：

```json
{
  "days": 365,
  "protectedBranches": [
    "production",
    "staging", 
    "master",
    "main",
    "develop"
  ],
  "forceDeleteBranches": [],
  "protectedTags": [],
  "forceDeleteTags": [],
  "remoteName": "origin",
  "dryRun": false,
  "includeTags": true,
  "cleanupAfterDelete": true,
  "cleanTargets": ["all"]
}
```

**配置文件查找顺序**：

1. `./branch-clean.config.json` （项目根目录）
2. `./.branch-clean.config.json` （项目根目录，隐藏文件）
3. `./config/branch-clean.config.json` （config子目录）

如果找到配置文件就使用，否则使用默认配置。

## 配置说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `days` | number | 365 | 清理多少天前的分支/标签 |
| `protectedBranches` | array | ["production", "staging", "master", "main", "develop"] | 受保护的分支列表 |
| `forceDeleteBranches` | array | [] | 强制删除的分支列表（支持通配符） |
| `protectedTags` | array | [] | 受保护的标签列表 |
| `forceDeleteTags` | array | [] | 强制删除的标签列表（支持通配符） |
| `remoteName` | string | "origin" | 远程仓库名称 |
| `dryRun` | boolean | false | 仅预览模式 |
| `includeTags` | boolean | true | 是否包含标签清理 |
| `cleanupAfterDelete` | boolean | true | 删除后是否执行收尾清理 |
| `cleanTargets` | array | ["all"] | 指定清理目标 |

### 清理目标选项

`cleanTargets` 参数支持以下值（支持完整名称和简写）：

| 完整名称 | 简写 | 说明 |
|----------|------|------|
| `local-branches` | `lb` | 本地分支 |
| `remote-branches` | `rb` | 远程分支 |
| `local-tags` | `lt` | 本地标签 |
| `remote-tags` | `rt` | 远程标签 |
| `all` | - | 全部（默认） |

## 使用示例

### 示例1: 清理30天前的分支

```bash
ceb --days 30
```

### 示例2: 只清理本地分支

```bash
ceb --clean-targets local-branches
# 或使用简写
ceb -t lb
```

### 示例3: 只清理远程分支和标签

```bash
ceb --clean-targets remote-branches,remote-tags
# 或使用简写
ceb -t rb,rt
```

### 示例4: 混合使用完整名称和简写

```bash
ceb --clean-targets lb,remote-tags,lt
```

### 示例5: 保护特定分支，强制删除其他分支

```bash
ceb --protected "main,develop" --force-delete "feature-*,hotfix-*"
```

### 示例6: 仅预览，不执行删除

```bash
ceb --preview-only
```

### 示例7: 仅执行收尾清理

```bash
ceb --cleanup-only
```

### 示例8: 跳过确认直接执行

```bash
ceb --yes --days 90
```

### 示例9: 在非Git目录中运行

```bash
$ ceb
❌ 错误: 当前目录不是 Git 仓库
💡 请在一个 Git 仓库中运行此命令
   或者使用 cd 命令切换到 Git 仓库目录
```

## 输出示例

```text
🧹 CEB - Git 分支清理工具
================================
📁 仓库路径: /path/to/your/git/repo
🌿 当前分支: main
🌐 远程仓库: https://github.com/user/repo.git

📋 配置信息:
   清理时间范围: 365 天前
   受保护分支: production, staging, master, main, develop

📊 清理前统计:
   提交数: 6667
   分支数: 645
   标签数: 5692
   存储大小: 120.2 MiB

🔍 预览要清理的内容:

🗂️  本地分支 (5 个):
   ✗ feature/user-auth - 2023-10-15T10:30:00+08:00 (张三)
   ✗ feature/payment - 2023-11-20T14:45:00+08:00 (李四)

🌐 远程分支 (3 个):
   ✗ feature/old-feature - 2023-09-10T09:15:00+08:00 (王五)

🏷️  标签 (2 个):
   ✗ v1.0.0-beta - 2023-08-05T16:20:00+08:00 (赵六)

? 确认要执行删除操作吗? (y/N)
```

## 安全特性

- **预览模式**: 默认会显示所有即将删除的分支和标签
- **确认机制**: 需要用户手动确认才会执行删除操作
- **保护列表**: 重要分支默认受保护，不会被误删
- **选择性清理**: 支持精确控制要清理的目标类型，避免误删
- **错误处理**: 删除过程中出现错误会立即停止并提示
- **Git 检测**: 自动检测当前目录是否为 Git 仓库，非 Git 项目会提示错误
- **自动定位**: 自动切换到 Git 仓库根目录执行清理

## 注意事项

1. **备份重要数据**: 执行删除前请确保重要分支已合并或备份
2. **权限要求**: 删除远程分支需要相应的推送权限
3. **网络连接**: 删除远程分支和标签需要网络连接
4. **团队协作**: 在团队项目中使用前请与团队成员沟通
5. **选择性清理**: 使用 `--clean-targets` 参数可以精确控制要清理的目标类型
6. **全局安装**: 建议全局安装以便在任何 Git 仓库中使用
7. **配置文件**: 可以在项目根目录创建配置文件来自定义清理规则

## 故障排除

### 常见问题

**Q: 如何只清理特定类型的分支或标签？**
A: 使用 `--clean-targets` 参数，支持以下选项：

- `local-branches` 或 `lb` - 只清理本地分支
- `remote-branches` 或 `rb` - 只清理远程分支
- `local-tags` 或 `lt` - 只清理本地标签
- `remote-tags` 或 `rt` - 只清理远程标签
- `all` - 清理所有（默认）

示例：`ceb -t lb,rt` 只清理本地分支和远程标签

**Q: 如何单独执行收尾清理？**
A: 使用 `--cleanup-only` 参数可以单独执行收尾清理操作：

```bash
ceb --cleanup-only
```

这会执行以下操作：

- 清理远程引用（`git fetch origin --prune --prune-tags`）
- 执行垃圾回收（`git gc --prune=now --aggressive`）

**Q: 如何查看详细的错误信息？**
A: 使用 `--debug` 参数可以查看详细的错误信息：

```bash
ceb --debug
```

这会显示：
- 具体的错误原因
- 完整的错误消息
- 帮助诊断删除失败的问题

**Q: 为什么清理后存储大小反而增加了？**
A: 这是正常现象，原因如下：

1. **垃圾回收过程**：`git gc --aggressive` 会重新打包对象，优化存储结构
2. **临时增加**：在重新打包过程中，Git 可能暂时增加存储空间
3. **最终优化**：垃圾回收完成后，存储空间通常会减少

**解决方案**：
- 等待几分钟后再次运行 `git gc` 获得最终优化效果
- 或者使用 `ceb --cleanup-only` 再次执行收尾清理

**Q: 提示权限不足**
A: 确保您有删除远程分支的权限，或者联系仓库管理员

**Q: 网络连接失败**
A: 检查网络连接，确保可以访问远程仓库

**Q: 分支删除失败**
A: 检查分支是否正在被使用，或者有其他保护机制

**Q: 使用 --force-delete 仍然删除失败**
A: `--force-delete` 只能绕过工具内部的保护列表，无法绕过服务器端保护。受保护分支需要通过 GitLab/GitHub Web 界面删除

**Q: GitLab 提示 "You can only delete protected branches using the web interface"**
A: 这是 GitLab 的服务器端保护机制，需要通过 Web 界面删除：

1. 登录 GitLab
2. 进入项目 → Settings → Repository → Protected Branches
3. 取消分支保护或删除分支

**Q: 在非Git目录中运行**
A: 使用 `cd` 命令切换到 Git 仓库目录，或者确保当前目录是 Git 仓库

**Q: 全局安装后命令不可用**
A: 检查 npm 全局安装路径是否在 PATH 环境变量中

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个工具！
