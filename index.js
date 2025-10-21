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
      const spinner = ora("正在获取仓库统计信息...").start();
      const beforeStats = await previewer.getRepositoryStats();
      console.log(chalk.blue.bold("💻 Git 仓库清理信息统计"));
      console.log(chalk.cyan("📊 清理前统计:"));
      console.log(`   提交数: ${beforeStats.commits}`);
      console.log(`   分支数: ${beforeStats.branches}`);
      console.log(`   标签数: ${beforeStats.tags}`);
      console.log(`   存储大小: ${beforeStats.size}`);

      // 预览要清理的内容
      console.log(chalk.blue.bold("\n🔍 预览要清理的内容:"));
      const localBranches = await previewer.getLocalBranchesToClean();
      const remoteBranches = await previewer.getRemoteBranchesToClean();
      const tags = await previewer.getTagsToClean();

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

      // 检查是否有需要清理的内容（基于过滤后的结果）
      if (
        filteredLocalBranches.length === 0 &&
        filteredRemoteBranches.length === 0 &&
        filteredTags.length === 0
      ) {
        console.log(chalk.green("✅ 没有需要清理的分支或标签"));
        return;
      }

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

      const cleanSpinner = ora("正在清理分支和标签...").start();

      try {
        // 收集所有清理结果
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

        cleanSpinner.succeed("清理完成");

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

        console.log(chalk.green("\n✅ 清理完成！"));
        console.log(chalk.cyan("\n📊 清理后统计:"));
        console.log(`   提交数: ${afterStats.commits}`);
        console.log(`   分支数: ${afterStats.branches}`);
        console.log(`   标签数: ${afterStats.tags}`);
        console.log(`   存储大小: ${afterStats.size}`);

        console.log(chalk.cyan("\n📈 清理效果对比:"));
        console.log(
          `   分支减少: ${beforeStats.branches - afterStats.branches} 个`
        );
        console.log(`   标签减少: ${beforeStats.tags - afterStats.tags} 个`);
      } catch (error) {
        cleanSpinner.fail("清理过程中出现错误");
        console.error(chalk.red("❌ 错误:"), error.message);
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
  
  // 如果使用 --verbose 参数或总数量较少，直接显示
  if (verbose || totalItems <= 10) {
    displayItemsDirectly(localBranches, remoteBranches, tags);
    return;
  }
  
  // 显示折叠的摘要信息
  console.log(chalk.yellow(`\n📋 预览摘要 (共 ${totalItems} 项):`));
  
  if (localBranches.length > 0) {
    console.log(chalk.red(`   🗂️  本地分支: ${localBranches.length} 个`));
  }
  if (remoteBranches.length > 0) {
    console.log(chalk.red(`   🌐 远程分支: ${remoteBranches.length} 个`));
  }
  if (tags.length > 0) {
    console.log(chalk.red(`   🏷️  标签: ${tags.length} 个`));
  }
  
  console.log(chalk.gray('\n💡 提示: 使用 --verbose 参数查看详细信息'));
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
  
  console.log(chalk.cyan('\n📊 清理结果摘要:'));
  console.log(`   ✅ 成功: ${totalSuccess} 个`);
  console.log(`   ❌ 失败: ${totalFailed} 个`);
  
  // 显示各类别的详细结果
  if (allResults.localBranches.successCount > 0 || allResults.localBranches.failedCount > 0) {
    console.log(chalk.green(`   🗂️  本地分支: ${allResults.localBranches.successCount} 成功, ${allResults.localBranches.failedCount} 失败`));
  }
  if (allResults.remoteBranches.successCount > 0 || allResults.remoteBranches.failedCount > 0) {
    console.log(chalk.green(`   🌐 远程分支: ${allResults.remoteBranches.successCount} 成功, ${allResults.remoteBranches.failedCount} 失败`));
  }
  if (allResults.tags.successCount > 0 || allResults.tags.failedCount > 0) {
    console.log(chalk.green(`   🏷️  标签: ${allResults.tags.successCount} 成功, ${allResults.tags.failedCount} 失败`));
  }
  
  // 显示失败详情
  if (totalFailed > 0) {
    console.log(chalk.red('\n❌ 删除失败的项目:'));
    
    // 本地分支失败
    if (allResults.localBranches.failedItems.length > 0) {
      console.log(chalk.red('\n   🗂️  本地分支:'));
      allResults.localBranches.failedItems.forEach(item => {
        console.log(`      - ${item.name}: ${item.error}`);
      });
    }
    
    // 远程分支失败
    if (allResults.remoteBranches.failedItems.length > 0) {
      console.log(chalk.red('\n   🌐 远程分支:'));
      allResults.remoteBranches.failedItems.forEach(item => {
        console.log(`      - ${item.name}: ${item.error}`);
        if (item.error.includes('protected') || item.error.includes('pre-receive hook declined')) {
          console.log(chalk.yellow(`        💡 提示: 可能是受保护分支，需要通过 Web 界面删除`));
        }
      });
    }
    
    // 标签失败
    if (allResults.tags.failedItems.length > 0) {
      console.log(chalk.red('\n   🏷️  标签:'));
      allResults.tags.failedItems.forEach(item => {
        console.log(`      - ${item.name}: ${item.error}`);
      });
    }
    
    console.log(chalk.yellow('\n💡 解决建议:'));
    console.log(`   1. 检查失败项目是否正在被使用`);
    console.log(`   2. 确认您有删除权限`);
    console.log(`   3. 受保护分支/标签需要通过 Web 界面删除`);
  }
}

// 如果直接运行此文件，则解析命令行参数
if (require.main === module) {
  program.parse();
}

// 导出程序以便其他模块调用
module.exports = program;
