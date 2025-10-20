#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

// 导入模块
const BranchCleaner = require('./lib/branchCleaner');
const TagCleaner = require('./lib/tagCleaner');
const Previewer = require('./lib/previewer');
const ConfigManager = require('./lib/configManager');

const program = new Command();

program
  .name('branch-clean')
  .description('自动清理无用历史分支和标签的工具')
  .version('1.0.0');

program
  .option('-c, --config <path>', '配置文件路径')
  .option('-d, --days <number>', '清理多少天前的分支/标签', '365')
  .option('-p, --protected <branches>', '受保护的分支列表，用逗号分隔')
  .option('-f, --force-delete <branches>', '强制删除的分支列表，用逗号分隔', '')
  .option('--preview-only', '仅预览，不执行删除')
  .option('--yes', '跳过确认，直接执行删除')
  .action(async (options) => {
    try {
      // 自动查找配置文件
      const configPath = options.config || ConfigManager.findConfigFile();
      const configManager = new ConfigManager(configPath);
      const config = configManager.getConfig(options);
      
      console.log(chalk.blue.bold('🧹 Git 分支清理工具'));
      console.log(chalk.gray('================================\n'));
      
      // 显示配置信息
      console.log(chalk.yellow('📋 配置信息:'));
      console.log(`   清理时间范围: ${config.days} 天前`);
      console.log(`   受保护分支: ${config.protectedBranches.join(', ')}`);
      if (config.forceDeleteBranches.length > 0) {
        console.log(`   强制删除分支: ${config.forceDeleteBranches.join(', ')}`);
      }
      console.log('');
      
      const previewer = new Previewer(config);
      const branchCleaner = new BranchCleaner(config);
      const tagCleaner = new TagCleaner(config);
      
      // 获取当前仓库统计信息
      const spinner = ora('正在获取仓库统计信息...').start();
      const beforeStats = await previewer.getRepositoryStats();
      spinner.succeed('仓库统计信息获取完成');
      
      console.log(chalk.cyan('\n📊 清理前统计:'));
      console.log(`   提交数: ${beforeStats.commits}`);
      console.log(`   分支数: ${beforeStats.branches}`);
      console.log(`   标签数: ${beforeStats.tags}`);
      console.log(`   存储大小: ${beforeStats.size}`);
      
      // 预览要清理的内容
      console.log(chalk.yellow('\n🔍 预览要清理的内容:'));
      
      const localBranches = await previewer.getLocalBranchesToClean();
      const remoteBranches = await previewer.getRemoteBranchesToClean();
      const tags = await previewer.getTagsToClean();
      
      if (localBranches.length === 0 && remoteBranches.length === 0 && tags.length === 0) {
        console.log(chalk.green('✅ 没有需要清理的分支或标签'));
        return;
      }
      
      // 显示本地分支
      if (localBranches.length > 0) {
        console.log(chalk.red(`\n🗂️  本地分支 (${localBranches.length} 个):`));
        localBranches.forEach(branch => {
          console.log(`   ${chalk.red('✗')} ${branch.name} - ${branch.lastCommit} (${branch.author})`);
          console.log(`      ${chalk.gray('📝')} ${branch.subject}`);
        });
      }
      
      // 显示远程分支
      if (remoteBranches.length > 0) {
        console.log(chalk.red(`\n🌐 远程分支 (${remoteBranches.length} 个):`));
        remoteBranches.forEach(branch => {
          console.log(`   ${chalk.red('✗')} ${branch.name} - ${branch.lastCommit} (${branch.author})`);
          console.log(`      ${chalk.gray('📝')} ${branch.subject}`);
        });
      }
      
      // 显示标签
      if (tags.length > 0) {
        console.log(chalk.red(`\n🏷️  标签 (${tags.length} 个):`));
        tags.forEach(tag => {
          console.log(`   ${chalk.red('✗')} ${tag.name} - ${tag.createdDate} (${tag.author})`);
          console.log(`      ${chalk.gray('📝')} ${tag.subject}`);
        });
      }
      
      // 如果只是预览模式，直接退出
      if (options.previewOnly) {
        console.log(chalk.yellow('\n⚠️  预览模式，未执行删除操作'));
        return;
      }
      
      // 确认删除
      if (!options.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: '确认要执行删除操作吗？',
            default: false
          }
        ]);
        
        if (!confirm) {
          console.log(chalk.yellow('❌ 操作已取消'));
          return;
        }
      }
      
      // 执行清理
      console.log(chalk.red('\n🗑️  开始执行清理...'));
      
      const cleanSpinner = ora('正在清理分支和标签...').start();
      
      try {
        // 清理本地分支
        if (localBranches.length > 0) {
          await branchCleaner.cleanLocalBranches(localBranches);
        }
        
        // 清理远程分支
        if (remoteBranches.length > 0) {
          await branchCleaner.cleanRemoteBranches(remoteBranches);
        }
        
        // 清理标签
        if (tags.length > 0) {
          await tagCleaner.cleanTags(tags);
        }
        
        // 执行收尾操作
        await previewer.performCleanup();
        
        cleanSpinner.succeed('清理完成');
        
        // 获取清理后的统计信息
        const afterStats = await previewer.getRepositoryStats();
        
        console.log(chalk.green('\n✅ 清理完成！'));
        console.log(chalk.cyan('\n📊 清理后统计:'));
        console.log(`   提交数: ${afterStats.commits}`);
        console.log(`   分支数: ${afterStats.branches}`);
        console.log(`   标签数: ${afterStats.tags}`);
        console.log(`   存储大小: ${afterStats.size}`);
        
        console.log(chalk.cyan('\n📈 清理效果对比:'));
        console.log(`   分支减少: ${beforeStats.branches - afterStats.branches} 个`);
        console.log(`   标签减少: ${beforeStats.tags - afterStats.tags} 个`);
        
      } catch (error) {
        cleanSpinner.fail('清理过程中出现错误');
        console.error(chalk.red('❌ 错误:'), error.message);
        process.exit(1);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ 程序执行错误:'), error.message);
      process.exit(1);
    }
  });

// 如果直接运行此文件，则解析命令行参数
if (require.main === module) {
  program.parse();
}

// 导出程序以便其他模块调用
module.exports = program;
