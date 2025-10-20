#!/bin/bash

# CEB 工具使用示例脚本

echo "=== CEB - Git 分支清理工具使用示例 ==="
echo ""

# 检查是否在 Git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ 错误: 当前目录不是 Git 仓库"
    echo "请在一个 Git 仓库中运行此脚本"
    exit 1
fi

echo "✅ 检测到 Git 仓库"
echo ""

# 显示当前仓库状态
echo "📊 当前仓库状态:"
echo "   当前分支: $(git branch --show-current)"
echo "   远程仓库: $(git remote get-url origin 2>/dev/null || echo '未配置')"
echo ""

# 检查是否全局安装了 ceb
if command -v ceb >/dev/null 2>&1; then
    echo "✅ 检测到全局安装的 ceb 命令"
    CEB_CMD="ceb"
else
    echo "⚠️  未检测到全局安装的 ceb 命令，使用本地版本"
    CEB_CMD="node index.js"
fi
echo ""

# 示例1: 预览模式
echo "🔍 示例1: 预览模式（仅查看，不删除）"
echo "命令: $CEB_CMD --preview-only"
echo ""
read -p "按回车键执行预览..."
$CEB_CMD --preview-only
echo ""

# 示例2: 自定义时间范围
echo "⏰ 示例2: 清理30天前的分支"
echo "命令: $CEB_CMD --days 30 --preview-only"
echo ""
read -p "按回车键执行预览..."
$CEB_CMD --days 30 --preview-only
echo ""

# 示例3: 自定义保护分支
echo "🛡️  示例3: 自定义保护分支"
echo "命令: $CEB_CMD --protected 'main,develop,release' --preview-only"
echo ""
read -p "按回车键执行预览..."
$CEB_CMD --protected 'main,develop,release' --preview-only
echo ""

echo "🎉 示例演示完成！"
echo ""
echo "💡 提示:"
echo "   - 使用 --preview-only 参数可以安全地预览清理内容"
echo "   - 移除 --preview-only 参数并确认后才会真正执行删除"
echo "   - 建议先在测试仓库中试用"
echo "   - 全局安装后可以直接使用 'ceb' 命令"
echo ""
echo "📚 更多用法请查看 README.md 文件"
