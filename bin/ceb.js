#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const chalk = require('chalk');

// 检查是否在 Git 仓库中
function checkGitRepository() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// 获取当前工作目录的 Git 仓库根目录
function getGitRoot() {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { 
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
    return gitRoot;
  } catch (error) {
    return null;
  }
}

// 主函数
function main() {
  // 检查是否在 Git 仓库中
  if (!checkGitRepository()) {
    console.error(chalk.red('❌ 错误: 当前目录不是 Git 仓库'));
    console.log(chalk.yellow('💡 请在一个 Git 仓库中运行此命令'));
    console.log(chalk.gray('   或者使用 cd 命令切换到 Git 仓库目录'));
    process.exit(1);
  }

  // 获取 Git 仓库根目录
  const gitRoot = getGitRoot();
  if (!gitRoot) {
    console.error(chalk.red('❌ 错误: 无法获取 Git 仓库根目录'));
    process.exit(1);
  }

  // 切换到 Git 仓库根目录
  process.chdir(gitRoot);
  
  // 显示当前仓库信息
  try {
    const currentBranch = execSync('git branch --show-current', { 
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
    
    const remoteUrl = execSync('git remote get-url origin 2>/dev/null || echo "未配置"', { 
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    console.log(chalk.blue.bold('🧹 Git 仓库与分支信息\n'));
    console.log(chalk.cyan(`📁 仓库路径: ${gitRoot}`));
    console.log(chalk.cyan(`🌿 当前分支: ${currentBranch}`));
    console.log(chalk.cyan(`🌐 远程仓库: ${remoteUrl}`));
    console.log('');
  } catch (error) {
    console.log(chalk.yellow('⚠️  无法获取仓库信息，继续执行...'));
  }

  // 导入并执行主程序
  const program = require('../index.js');
  
  // 将命令行参数传递给主程序
  // process.argv[0] 是 node，process.argv[1] 是 ceb.js，process.argv[2] 开始是用户参数
  process.argv = ['node', 'ceb', ...process.argv.slice(2)];
  program.parse();
}

// 执行主函数
main();
