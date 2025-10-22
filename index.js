#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

// 导入模块
const BranchCleaner = require('./lib/branchCleaner');
const TagCleaner = require('./lib/tagCleaner');
const Previewer = require('./lib/previewer');
const ConfigManager = require('./lib/configManager');
const Table = require('cli-table3');

// 清理目标映射和验证
const CLEAN_TARGETS = {
  'local-branches': 'local-branches',
  'lb': 'local-branches',
  'remote-branches': 'remote-branches', 
  'rb': 'remote-branches',
  'local-tags': 'local-tags',
  'lt': 'local-tags',
  'remote-tags': 'remote-tags',
  'rt': 'remote-tags',
  'all': 'all'
};

function validateCleanTargets(targets) {
  const invalidTargets = [];
  const validTargets = [];
  
  for (const target of targets) {
    if (CLEAN_TARGETS[target]) {
      validTargets.push(CLEAN_TARGETS[target]);
    } else {
      invalidTargets.push(target);
    }
  }
  
  if (invalidTargets.length > 0) {
    const validOptions = Object.keys(CLEAN_TARGETS).map(key => 
      key === CLEAN_TARGETS[key] ? key : `${key}(${CLEAN_TARGETS[key]})`
    ).join(', ');
    
    throw new Error(`❌ 无效的清理目标: "${invalidTargets.join(', ')}"\n有效选项: ${validOptions}`);
  }
  
  // 如果包含 'all'，则返回所有目标
  if (validTargets.includes('all')) {
    return ['local-branches', 'remote-branches', 'local-tags', 'remote-tags'];
  }
  
  return [...new Set(validTargets)]; // 去重
}

// 从 package.json 读取版本号
const packageJson = require('./package.json');

const program = new Command();

program
  .name('branch-clean')
  .description('自动清理无用历史分支和标签的工具')
  .version(packageJson.version);

program
  .option('-c, --config <path>', '配置文件路径')
  .option('-d, --days <number>', '清理多少天前的分支/标签', '365')
  .option('-p, --protected <branches>', '受保护的分支列表，用逗号分隔')
  .option('-f, --force-delete <branches>', '强制删除的分支列表，用逗号分隔', '')
  .option('-t, --clean-targets <targets>', '指定清理目标，用逗号分隔。支持: local-branches(lb), remote-branches(rb), local-tags(lt), remote-tags(rt), all', 'all')
  .option('--preview-only', '仅预览，不执行删除')
  .option('--cleanup-only', '仅执行收尾清理（清理远程引用和垃圾回收）')
  .option('--yes', '跳过确认，直接执行删除')
  .option('--verbose', '显示详细的预览信息（不折叠）')
  .action(async (options) => {
    try {
      // 如果只是收尾清理模式，直接执行
      if (options.cleanupOnly) {
        console.log(chalk.blue.bold("🧹 Git 收尾清理工具\n"));

        // 自动查找配置文件
        const configPath = options.config || ConfigManager.findConfigFile();
        const configManager = new ConfigManager(configPath);
        const config = configManager.getConfig(options);

        const previewer = new Previewer(config);

        console.log(chalk.yellow("🧹 开始执行收尾清理..."));
        await previewer.performCleanup();
        console.log(chalk.green("✅ 收尾清理完成"));
        return;
      }

      // 验证清理目标
      const cleanTargets = validateCleanTargets(
        options.cleanTargets.split(",").map((t) => t.trim())
      );

      // 自动查找配置文件
      const configPath = options.config || ConfigManager.findConfigFile();
      const configManager = new ConfigManager(configPath);
      const config = configManager.getConfig(options);

      // 更新配置中的清理目标
      config.cleanTargets = cleanTargets;

      // 显示配置信息
      console.log(chalk.blue.bold("🧹 Git 分支清理配置信息"));
      console.log(chalk.yellow("📋 配置信息:"));
      console.log(`   清理时间范围: ${config.days} 天前`);
      console.log(`   受保护分支: ${config.protectedBranches.join(", ")}`);
      if (config.forceDeleteBranches.length > 0) {
        console.log(
          `   强制删除分支: ${config.forceDeleteBranches.join(", ")}`
        );
      }
      console.log("");

      const previewer = new Previewer(config);
      const branchCleaner = new BranchCleaner(config);
      const tagCleaner = new TagCleaner(config);

      // 获取当前仓库统计信息
      const beforeStats = await previewer.getRepositoryStats();
      
      console.log(chalk.blue.bold("📊 仓库统计信息"));
      console.log(`提交数: ${beforeStats.commits} | 分支数: ${beforeStats.branches} | 标签数: ${beforeStats.tags} | 存储大小: ${beforeStats.size}`);

      // 并行获取要清理的内容
      
      const [localBranches, remoteBranches, tags] = await Promise.all([
        previewer.getLocalBranchesToClean(),
        previewer.getRemoteBranchesToClean(),
        previewer.getTagsToClean()
      ]);

      // 根据清理目标过滤预览内容
      const filteredLocalBranches = config.cleanTargets.includes(
        "local-branches"
      )
        ? localBranches
        : [];
      const filteredRemoteBranches = config.cleanTargets.includes(
        "remote-branches"
      )
        ? remoteBranches
        : [];
      const filteredTags =
        config.cleanTargets.includes("local-tags") ||
        config.cleanTargets.includes("remote-tags")
          ? tags
          : [];

      const totalItems = filteredLocalBranches.length + filteredRemoteBranches.length + filteredTags.length;

      // 检查是否有需要清理的内容（基于过滤后的结果）
      if (totalItems === 0) {
        console.log(chalk.green("✅ 没有需要清理的分支或标签"));
        return;
      }

      console.log(chalk.blue.bold(`\n🔍 清理预览 (共 ${totalItems} 项):`));
      // 显示预览内容（带折叠功能）
      displayPreviewContent(
        filteredLocalBranches,
        filteredRemoteBranches,
        filteredTags,
        options.verbose
      );

      // 如果只是预览模式，直接退出
      if (options.previewOnly) {
        console.log(chalk.yellow("\n⚠️  预览模式，未执行删除操作"));
        return;
      }

      // 确认删除
      if (!options.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "确认要执行删除操作吗？",
            default: false,
          },
        ]);

        if (!confirm) {
          console.log(chalk.yellow("❌ 操作已取消"));
          return;
        }
      }

      // 执行清理
        console.log(chalk.red("\n🗑️  开始执行清理..."));

        try {
          const allResults = {
            localBranches: { successCount: 0, failedCount: 0, failedItems: [] },
            remoteBranches: { successCount: 0, failedCount: 0, failedItems: [] },
            tags: { successCount: 0, failedCount: 0, failedItems: [] },
          };

        // 根据清理目标执行清理
        if (
          config.cleanTargets.includes("local-branches") &&
          filteredLocalBranches.length > 0
        ) {
          const result = await branchCleaner.cleanLocalBranches(
            filteredLocalBranches
          );
          allResults.localBranches = result;
        }

        if (
          config.cleanTargets.includes("remote-branches") &&
          filteredRemoteBranches.length > 0
        ) {
          const result = await branchCleaner.cleanRemoteBranches(
            filteredRemoteBranches
          );
          allResults.remoteBranches = result;
        }

        if (
          (config.cleanTargets.includes("local-tags") ||
            config.cleanTargets.includes("remote-tags")) &&
          filteredTags.length > 0
        ) {
          const result = await tagCleaner.cleanTags(filteredTags);
          if (result && !result.failedItems && result.failedTags) {
            result.failedItems = result.failedTags;
          }
          allResults.tags = result;
        }

        // 执行收尾操作
          await previewer.performCleanup();

        // 显示清理结果摘要（兼容 tags 结果字段名）
        const normalized = {
          localBranches: allResults.localBranches || {
            successCount: 0,
            failedCount: 0,
            failedItems: [],
          },
          remoteBranches: allResults.remoteBranches || {
            successCount: 0,
            failedCount: 0,
            failedItems: [],
          },
          tags: allResults.tags || {
            successCount: 0,
            failedCount: 0,
            failedItems: [],
          },
        };
        if (
          normalized.tags &&
          !normalized.tags.failedItems &&
          normalized.tags.failedTags
        ) {
          normalized.tags.failedItems = normalized.tags.failedTags;
        }
        displayCleanupResults(normalized);

        // 获取清理后的统计信息
        const afterStats = await previewer.getRepositoryStats();

        // 使用表格显示清理前后对比
        console.log(chalk.cyan("\n📊 清理效果对比:"));
        const comparisonTable = new Table({
          head: ['项目', '清理前', '清理后', '变化'],
          colWidths: [12, 15, 15, 15],
          style: {
            head: ['cyan'],
            border: ['gray']
          }
        });
        
        // 计算变化
        const branchChange = afterStats.branches - beforeStats.branches;
        const tagChange = afterStats.tags - beforeStats.tags;
        const sizeIncreased = parseSizeToBytes(afterStats.size) > parseSizeToBytes(beforeStats.size);
        
        comparisonTable.push(
          ['提交数', beforeStats.commits.toString(), afterStats.commits.toString(), 
           afterStats.commits - beforeStats.commits],
          ['分支数', beforeStats.branches.toString(), afterStats.branches.toString(), 
           branchChange > 0 ? `+${branchChange}` : branchChange.toString()],
          ['标签数', beforeStats.tags.toString(), afterStats.tags.toString(), 
           tagChange > 0 ? `+${tagChange}` : tagChange.toString()],
          ['存储大小', beforeStats.size, afterStats.size, 
           sizeIncreased ? chalk.yellow('临时增加') : chalk.green('已优化')]
        );
        
        console.log(comparisonTable.toString());
        
        // 如果存储大小增加，显示说明
        if (sizeIncreased) {
          console.log(chalk.yellow('\n💡 存储大小说明:'));
          console.log('   - 垃圾回收过程中可能暂时增加存储空间');
          console.log('   - Git 会重新打包对象，优化存储结构');
          console.log('   - 建议稍后再次运行 `git gc` 以获得最终优化效果');
        }
        } catch (error) {
          console.error(chalk.red("❌ 清理过程中出现错误:"), error.message);
          process.exit(1);
        }
    } catch (error) {
      console.error(chalk.red('❌ 程序执行错误:'), error.message);
      process.exit(1);
    }
  });

// 显示预览内容的函数（带折叠功能）
function displayPreviewContent(localBranches, remoteBranches, tags, verbose = false) {
  const totalItems = localBranches.length + remoteBranches.length + tags.length;
  
  if (verbose || totalItems <= 10) {
    displayItemsDirectly(localBranches, remoteBranches, tags);
    return;
  }
  
  if (localBranches.length > 0) {
    console.log(chalk.red(`   本地分支: ${localBranches.length} 个`));
  }
  if (remoteBranches.length > 0) {
    console.log(chalk.red(`   远程分支: ${remoteBranches.length} 个`));
  }
  if (tags.length > 0) {
    console.log(chalk.red(`   标签: ${tags.length} 个`));
  }
  
  console.log(chalk.gray('\n💡 使用 --verbose 查看详细信息\n'));
}

// 直接显示所有项目（无折叠）
function displayItemsDirectly(localBranches, remoteBranches, tags) {
  // 显示本地分支
  if (localBranches.length > 0) {
    console.log(chalk.red(`\n🗂️  本地分支 (${localBranches.length} 个):`));
    displayBranchesWithGrouping(localBranches, 'local');
  }
  
  // 显示远程分支
  if (remoteBranches.length > 0) {
    console.log(chalk.red(`\n🌐 远程分支 (${remoteBranches.length} 个):`));
    displayBranchesWithGrouping(remoteBranches, 'remote');
  }
  
  // 显示标签
  if (tags.length > 0) {
    console.log(chalk.red(`\n🏷️  标签 (${tags.length} 个):`));
    displayBranchesWithGrouping(tags, 'tag');
  }
}

// 显示分支/标签（支持按日期分组）
function displayBranchesWithGrouping(items, type) {
  if (items.length <= 50) {
    // 数量较少，直接显示
    items.forEach(item => {
      const date = type === 'tag' ? item.createdDate : item.lastCommit;
      const commitInfo = item.subject ? `📝 ${item.subject} | ` : '';
      console.log(`   ${chalk.red('✗')} ${item.name} - ${date} | ${commitInfo}(${item.author})`);
    });
  } else {
    // 数量较多，按日期分组
    const groupedItems = groupItemsByDate(items, type);
    
    Object.keys(groupedItems).sort().forEach(dateGroup => {
      const itemsInGroup = groupedItems[dateGroup];
      console.log(chalk.gray(`   📅 ${dateGroup} (${itemsInGroup.length} 个):`));
      
      itemsInGroup.forEach(item => {
        const date = type === 'tag' ? item.createdDate : item.lastCommit;
        const commitInfo = item.subject ? `📝 ${item.subject} | ` : '';
        console.log(`      ${chalk.red('✗')} ${item.name} - ${date} | ${commitInfo}(${item.author})`);
      });
    });
  }
}

// 按日期分组项目
function groupItemsByDate(items, type) {
  const groups = {};
  
  items.forEach(item => {
    const date = type === 'tag' ? item.createdDate : item.lastCommit;
    const dateStr = new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(item);
  });
  
  return groups;
}

// 显示清理结果摘要
function displayCleanupResults(allResults) {
  const totalSuccess = allResults.localBranches.successCount +
                      allResults.remoteBranches.successCount +
                      allResults.tags.successCount;
  const totalFailed = allResults.localBranches.failedCount +
                     allResults.remoteBranches.failedCount +
                     allResults.tags.failedCount;

  console.log(chalk.cyan('\n📊 清理结果:'));
  console.log(`   ✅ 成功: ${totalSuccess} 个 | ❌ 失败: ${totalFailed} 个`);

  if (totalFailed > 0) {
    console.log(chalk.red('\n❌ 删除失败的项目:'));

    if (allResults.localBranches.failedItems.length > 0) {
      console.log(chalk.red('\n   🗂️  本地分支失败:'));
      displayGroupedErrors(allResults.localBranches.failedItems, '本地分支');
    }

    if (allResults.remoteBranches.failedItems.length > 0) {
      console.log(chalk.red('\n   🌐 远程分支失败:'));
      displayGroupedErrors(allResults.remoteBranches.failedItems, '远程分支');
    }

    if (allResults.tags.failedItems.length > 0) {
      console.log(chalk.red('\n   🏷️  标签失败:'));
      displayGroupedErrors(allResults.tags.failedItems, '标签');
    }

    console.log(chalk.yellow('\n💡 解决建议:'));
    console.log(`   1. 检查失败项目是否正在被使用`);
    console.log(`   2. 确认您有删除权限`);
    console.log(`   3. 受保护分支/标签需要通过 Web 界面删除`);
  }
}

// 显示分组后的错误信息
function displayGroupedErrors(failedItems, type) {
  const errorGroups = new Map();
  
  // 按错误类型分组
  failedItems.forEach(item => {
    const errorKey = normalizeErrorForDisplay(item.error);
    if (!errorGroups.has(errorKey)) {
      errorGroups.set(errorKey, []);
    }
    errorGroups.get(errorKey).push(item.name);
  });
  
  // 显示分组后的错误
  for (const [errorKey, itemNames] of errorGroups) {
    const namesStr = itemNames.length > 3 
      ? `${itemNames.slice(0, 3).join(', ')} 等 ${itemNames.length} 个${type}`
      : `${itemNames.join(', ')}`;
    console.log(chalk.red(`      ${namesStr}: ${errorKey}`));
  }
}

// 标准化错误信息用于显示
function normalizeErrorForDisplay(errorMessage) {
  let normalized = errorMessage;
  
  // 处理 GitLab 保护分支/标签错误
  if (normalized.includes('GitLab: You can only delete protected')) {
    return '受保护项目，需要通过 Web 界面删除';
  }
  
  // 处理 pre-receive hook 错误
  if (normalized.includes('pre-receive hook declined')) {
    return 'pre-receive hook 拒绝删除';
  }
  
  // 处理网络连接错误
  if (normalized.includes('Connection refused') || normalized.includes('timeout')) {
    return '网络连接失败';
  }
  
  // 处理权限错误
  if (normalized.includes('Permission denied') || normalized.includes('not permitted')) {
    return '权限不足';
  }
  
  // 处理不存在错误
  if (normalized.includes('not found') || normalized.includes('does not exist')) {
    return '项目不存在';
  }
  
  // 处理其他常见错误
  if (normalized.includes('Command failed')) {
    // 提取第一行作为主要错误信息
    const firstLine = normalized.split('\n')[0];
    return firstLine.replace(/Command failed: git.*?--delete\s+"[^"]*"/, 'Command failed: git push --delete');
  }
  
  // 默认返回前100个字符
  return normalized.length > 100 ? normalized.substring(0, 100) + '...' : normalized;
}

function parseSizeToBytes(sizeStr) {
  if (!sizeStr || sizeStr === '未知') return 0;
  
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|MiB|GiB)$/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  switch (unit) {
    case 'KB':
      return value * 1024;
    case 'MB':
    case 'MIB':
      return value * 1024 * 1024;
    case 'GB':
    case 'GIB':
      return value * 1024 * 1024 * 1024;
    default:
      return 0;
  }
}

// 如果直接运行此文件，则解析命令行参数
if (require.main === module) {
  program.parse();
}

// 导出程序以便其他模块调用
module.exports = program;
