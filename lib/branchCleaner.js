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

  async cleanLocalBranches(branches) {
    console.log(chalk.yellow(`\n🗂️  清理本地分支 (${branches.length} 个)...`));
    
    let successCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failedItems = [];
    
    // 创建进度条
    const progressBar = new cliProgress.SingleBar({
      format: '本地分支 |{bar}| {percentage}% | {value}/{total} | 成功: {success} | 失败: {failed}',
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
    
    // 显示详细结果
    console.log(chalk.green(`\n✅ 本地分支清理完成: ${successCount} 成功, ${failedCount} 失败`));
    
    return { successCount, failedCount, failedItems };
  }

  async cleanRemoteBranches(branches) {
    console.log(chalk.yellow(`\n🌐 清理远程分支 (${branches.length} 个)...`));
    
    let successCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failedItems = [];

    const namesAll = branches.map(b => b.name);
    const batchSize = 10; // 进一步减少批量大小
    const maxConcurrency = 2; // 远程操作并发数更低
    
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
          const shouldSuffix = (processedCount % 10 === 0) || (idx === results.length - 1);
          const suffix = shouldSuffix ? `（剩余：${branches.length - processedCount}）` : '';
          console.log(chalk.green(`   ✅ ${result.name} 已删除${suffix}`));
        } else {
          failedCount++;
          failedItems.push({ name: result.name, error: result.error, type: 'remote' });
          console.log(chalk.red(`   ❌ ${result.name} 删除失败: ${result.error.split('\n')[0]}`));
        }
      });
      
      // 添加延迟，避免服务器过载
      if (i + batchSize < namesAll.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
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
