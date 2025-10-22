const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const chalk = require('chalk');
const cliProgress = require('cli-progress');

class BranchCleaner {
  constructor(config) {
    this.config = config;
    this.cutoffDate = this.calculateCutoffDate();
  }

  calculateCutoffDate() {
    const cutoffTime = Date.now() - (this.config.days * 24 * 60 * 60 * 1000);
    return Math.floor(cutoffTime / 1000); // 转换为Unix时间戳
  }

  // 标准化错误信息，用于分类合并
  normalizeError(errorMessage) {
    // 提取关键错误信息，去除具体分支名等变量信息
    let normalized = errorMessage;
    
    // 处理 GitLab 保护分支错误
    if (normalized.includes('GitLab: You can only delete protected branches')) {
      return '受保护分支，需要通过 Web 界面删除';
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
    
    // 处理分支不存在错误
    if (normalized.includes('not found') || normalized.includes('does not exist')) {
      return '分支不存在';
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

  async cleanLocalBranches(branches) {
    let successCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failedItems = [];
    const errorGroups = new Map();
    
    const progressBar = new cliProgress.SingleBar({
      format: '🗂️  本地分支 |{bar}| {percentage}% | {value}/{total} | 成功: {success} | 失败: {failed}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    
    progressBar.start(branches.length, 0, { success: 0, failed: 0 });
    
    // 使用异步并发处理，提高性能
    const batchSize = 20; // 减少批量大小，提高并发度
    const maxConcurrency = 3; // 最大并发数
    
    for (let i = 0; i < branches.length; i += batchSize) {
      const batch = branches.slice(i, i + batchSize);
      const names = batch.map(b => b.name);
      
      // 创建并发任务
      const tasks = names.map(async (name) => {
        try {
          await execAsync(`git branch -D "${name}"`, { 
            timeout: 5000,
            maxBuffer: 1024 * 1024 // 1MB buffer
          });
          return { success: true, name };
        } catch (error) {
          return { success: false, name, error: error.message };
        }
      });
      
      // 控制并发数量
      const results = [];
      for (let j = 0; j < tasks.length; j += maxConcurrency) {
        const concurrentTasks = tasks.slice(j, j + maxConcurrency);
        const concurrentResults = await Promise.all(concurrentTasks);
        results.push(...concurrentResults);
      }
      
      // 处理结果
      results.forEach((result, idx) => {
        processedCount++;
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          failedItems.push({ name: result.name, error: result.error, type: 'local' });
          
          // 错误分类合并
          const errorKey = this.normalizeError(result.error);
          if (!errorGroups.has(errorKey)) {
            errorGroups.set(errorKey, []);
          }
          errorGroups.get(errorKey).push(result.name);
        }
        
        // 更新进度条
        progressBar.update(processedCount, { success: successCount, failed: failedCount });
      });
      
      // 小延迟避免系统过载
      if (i + batchSize < branches.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    progressBar.stop();
    
    // 显示分类后的错误信息
    if (errorGroups.size > 0) {
      console.log(chalk.red(`\n❌ 本地分支删除失败 (${failedCount} 个):`));
      for (const [errorKey, branchNames] of errorGroups) {
        const namesStr = branchNames.length > 3 
          ? `${branchNames.slice(0, 3).join(', ')} 等 ${branchNames.length} 个分支`
          : branchNames.join(', ');
        console.log(chalk.red(`   ${namesStr}: ${errorKey}`));
      }
    }
    
    console.log(chalk.green(`✅ 本地分支清理完成: ${successCount} 成功, ${failedCount} 失败`));
    
    return { successCount, failedCount, failedItems };
  }

  async cleanRemoteBranches(branches) {
    let successCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failedItems = [];
    const errorGroups = new Map();

    const namesAll = branches.map(b => b.name);
    const batchSize = 10;
    const maxConcurrency = 2;
    
    const progressBar = new cliProgress.SingleBar({
      format: '🌐 远程分支 |{bar}| {percentage}% | {value}/{total} | 成功: {success} | 失败: {failed}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    
    progressBar.start(branches.length, 0, { success: 0, failed: 0 });
    
    for (let i = 0; i < namesAll.length; i += batchSize) {
      const names = namesAll.slice(i, i + batchSize);
      
      // 创建并发任务
      const tasks = names.map(async (name) => {
        try {
          await execAsync(`git push ${this.config.remoteName} --delete "${name}"`, { 
            timeout: 15000,
            maxBuffer: 1024 * 1024 // 1MB buffer
          });
          return { success: true, name };
        } catch (error) {
          return { success: false, name, error: error.message };
        }
      });
      
      // 控制并发数量
      const results = [];
      for (let j = 0; j < tasks.length; j += maxConcurrency) {
        const concurrentTasks = tasks.slice(j, j + maxConcurrency);
        const concurrentResults = await Promise.all(concurrentTasks);
        results.push(...concurrentResults);
      }
      
      // 处理结果
      results.forEach((result, idx) => {
        processedCount++;
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          failedItems.push({ name: result.name, error: result.error, type: 'remote' });
          
          // 错误分类合并
          const errorKey = this.normalizeError(result.error);
          if (!errorGroups.has(errorKey)) {
            errorGroups.set(errorKey, []);
          }
          errorGroups.get(errorKey).push(result.name);
        }
        
        // 更新进度条
        progressBar.update(processedCount, { success: successCount, failed: failedCount });
      });
      
      // 添加延迟，避免服务器过载
      if (i + batchSize < namesAll.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    progressBar.stop();
    
    // 显示分类后的错误信息
    if (errorGroups.size > 0) {
      console.log(chalk.red(`\n❌ 远程分支删除失败 (${failedCount} 个):`));
      for (const [errorKey, branchNames] of errorGroups) {
        const namesStr = branchNames.length > 3 
          ? `${branchNames.slice(0, 3).join(', ')} 等 ${branchNames.length} 个分支`
          : branchNames.join(', ');
        console.log(chalk.red(`   ${namesStr}: ${errorKey}`));
      }
    }
    
    console.log(chalk.green(`✅ 远程分支清理完成: ${successCount} 成功, ${failedCount} 失败`));
    
    return { successCount, failedCount, failedItems };
  }

  isBranchProtected(branchName) {
    // 检查是否在受保护列表中
    const isProtected = this.config.protectedBranches.some(protectedBranch => {
      if (protectedBranch.includes('*')) {
        // 支持通配符匹配
        const regex = new RegExp(protectedBranch.replace(/\*/g, '.*'));
        return regex.test(branchName);
      }
      return branchName === protectedBranch;
    });

    // 检查是否在强制删除列表中
    const isForceDelete = this.config.forceDeleteBranches.some(forceDelete => {
      if (forceDelete.includes('*')) {
        const regex = new RegExp(forceDelete.replace(/\*/g, '.*'));
        return regex.test(branchName);
      }
      return branchName === forceDelete;
    });

    return isProtected && !isForceDelete;
  }
}

module.exports = BranchCleaner;
