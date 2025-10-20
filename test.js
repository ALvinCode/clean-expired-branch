#!/usr/bin/env node

// 快速测试脚本 - 验证 CEB 工具基本功能
const { execSync } = require('child_process');
const chalk = require('chalk');

console.log(chalk.blue.bold('🧪 CEB - Git 分支清理工具测试'));
console.log(chalk.gray('================================\n'));

// 检查是否在 Git 仓库中
try {
  execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  console.log(chalk.green('✅ Git 仓库检测通过'));
} catch (error) {
  console.log(chalk.red('❌ 当前目录不是 Git 仓库'));
  process.exit(1);
}

// 检查 Node.js 版本
const nodeVersion = process.version;
console.log(chalk.green(`✅ Node.js 版本: ${nodeVersion}`));

// 检查依赖是否安装
try {
  require('commander');
  require('chalk');
  require('inquirer');
  require('ora');
  console.log(chalk.green('✅ 所有依赖已安装'));
} catch (error) {
  console.log(chalk.red('❌ 依赖未安装，请运行: npm install'));
  process.exit(1);
}

// 检查全局命令是否可用
try {
  execSync('which ceb', { stdio: 'pipe' });
  console.log(chalk.green('✅ 全局命令 ceb 可用'));
} catch (error) {
  console.log(chalk.yellow('⚠️  全局命令 ceb 不可用，建议运行: npm install -g .'));
}

// 测试配置文件
const fs = require('fs');
if (fs.existsSync('./branch-clean.config.json')) {
  console.log(chalk.green('✅ 配置文件存在'));
} else {
  console.log(chalk.yellow('⚠️  配置文件不存在，将使用默认配置'));
}

// 测试模块加载
try {
  const ConfigManager = require('./lib/configManager');
  const BranchCleaner = require('./lib/branchCleaner');
  const TagCleaner = require('./lib/tagCleaner');
  const Previewer = require('./lib/previewer');
  console.log(chalk.green('✅ 所有模块加载成功'));
} catch (error) {
  console.log(chalk.red('❌ 模块加载失败:'), error.message);
  process.exit(1);
}

console.log(chalk.green('\n🎉 所有测试通过！工具可以正常使用'));
console.log(chalk.cyan('\n💡 使用建议:'));
console.log('   1. 全局安装: npm install -g .');
console.log('   2. 使用命令: ceb --preview-only');
console.log('   3. 确认无误后再执行实际删除');
console.log('   4. 建议在测试仓库中先试用');
