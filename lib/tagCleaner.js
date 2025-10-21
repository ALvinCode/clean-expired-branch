const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const chalk = require('chalk');

class TagCleaner {
  constructor(config) {
    this.config = config;
    this.cutoffDate = this.calculateCutoffDate();
  }

  calculateCutoffDate() {
    const cutoffTime = Date.now() - (this.config.days * 24 * 60 * 60 * 1000);
    return Math.floor(cutoffTime / 1000); // 转换为Unix时间戳
  }

  async cleanTags(tags) {
    if (!this.config.includeTags) {
      console.log(chalk.yellow('⚠️  标签清理已禁用'));
      return {
        successCount: 0,
        failedCount: 0,
        failedTags: []
      };
    }

    console.log(chalk.yellow(`\n🏷️  清理标签 (${tags.length} 个)...`));
    
    // 先删除本地标签
    const localResult = await this.cleanLocalTags(tags);
    
    // 再删除远程标签
    const remoteResult = await this.cleanRemoteTags(tags);
    
    // 合并结果
    return {
      successCount: localResult.successCount + remoteResult.successCount,
      failedCount: localResult.failedCount + remoteResult.failedCount,
      failedTags: [...localResult.failedTags, ...remoteResult.failedTags]
    };
  }

  async cleanLocalTags(tags) {
    console.log(chalk.yellow(`\n   删除本地标签...`));
    
    let successCount = 0;
    let failedCount = 0;
    const failedTags = [];
    
    // 使用异步并发处理
    const batchSize = 30; // 减少批量大小，提高并发度
    const maxConcurrency = 5; // 本地标签删除并发数更高
    
    for (let i = 0; i < tags.length; i += batchSize) {
      const batch = tags.slice(i, i + batchSize);
      const names = batch.map(t => t.name);
      
      // 创建并发任务
      const tasks = names.map(async (name) => {
        try {
          await execAsync(`git tag -d "${name}"`, { 
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
        if (result.success) {
          successCount++;
          const processedSoFar = (i + idx + 1);
          const shouldSuffix = (processedSoFar % 10 === 0) || (idx === results.length - 1);
          const suffix = shouldSuffix ? `（剩余：${tags.length - processedSoFar}）` : '';
          console.log(chalk.green(`   ✅ ${result.name} 已删除${suffix}`));
        } else {
          failedCount++;
          failedTags.push({ name: result.name, error: result.error, type: 'local' });
        }
      });
      
      // 小延迟避免系统过载
      if (i + batchSize < tags.length) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    
    return { successCount, failedCount, failedTags };
  }

  async cleanRemoteTags(tags) {
    console.log(chalk.yellow(`\n   删除远程标签...`));
    
    let successCount = 0;
    let failedCount = 0;
    const failedTags = [];
    
    const namesAll = tags.map(t => t.name);
    
    // 使用异步并发处理
    const batchSize = 8; // 进一步减少批量大小
    const maxConcurrency = 2; // 远程标签删除并发数更低
    
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
        if (result.success) {
          successCount++;
          const processedSoFar = (i + idx + 1);
          const shouldSuffix = (processedSoFar % 10 === 0) || (idx === results.length - 1);
          const suffix = shouldSuffix ? `（剩余：${namesAll.length - processedSoFar}）` : '';
          console.log(chalk.green(`   ✅ ${result.name} 已删除${suffix}`));
        } else {
          failedCount++;
          failedTags.push({ name: result.name, error: result.error, type: 'remote' });
          console.log(chalk.red(`   ❌ ${result.name} 删除失败: ${result.error.split('\n')[0]}`));
        }
      });
      
      // 添加延迟，避免服务器过载
      if (i + batchSize < namesAll.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return { successCount, failedCount, failedTags };
  }

  isTagProtected(tagName) {
    // 检查是否在受保护列表中
    const isProtected = this.config.protectedTags && this.config.protectedTags.some(protectedTag => {
      if (protectedTag.includes('*')) {
        const regex = new RegExp(protectedTag.replace(/\*/g, '.*'));
        return regex.test(tagName);
      }
      return tagName === protectedTag;
    });

    // 检查是否在强制删除列表中
    const isForceDelete = this.config.forceDeleteTags && this.config.forceDeleteTags.some(forceDelete => {
      if (forceDelete.includes('*')) {
        const regex = new RegExp(forceDelete.replace(/\*/g, '.*'));
        return regex.test(tagName);
      }
      return tagName === forceDelete;
    });

    return isProtected && !isForceDelete;
  }
}

module.exports = TagCleaner;
