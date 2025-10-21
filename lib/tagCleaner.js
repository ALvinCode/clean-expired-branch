const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const chalk = require('chalk');
const cliProgress = require('cli-progress');

class TagCleaner {
  constructor(config) {
    this.config = config;
    this.cutoffDate = this.calculateCutoffDate();
  }

  // 标准化错误信息，用于分类合并
  normalizeError(errorMessage) {
    // 提取关键错误信息，去除具体标签名等变量信息
    let normalized = errorMessage;
    
    // 处理 GitLab 保护标签错误
    if (normalized.includes('GitLab: You can only delete protected tags')) {
      return '受保护标签，需要通过 Web 界面删除';
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
    
    // 处理标签不存在错误
    if (normalized.includes('not found') || normalized.includes('does not exist')) {
      return '标签不存在';
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
    console.log(chalk.yellow(`\n🏷️  正在清理本地标签 (${tags.length} 个)...`));
    
    let successCount = 0;
    let failedCount = 0;
    const failedTags = [];
    const errorGroups = new Map(); // 用于错误分类合并
    
    // 创建进度条
    const progressBar = new cliProgress.SingleBar({
      format: '本地标签 |{bar}| {percentage}% | {value}/{total} | 成功: {success} | 失败: {failed}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    
    progressBar.start(tags.length, 0, { success: 0, failed: 0 });
    
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
        } else {
          failedCount++;
          failedTags.push({ name: result.name, error: result.error, type: 'local' });
          
          // 错误分类合并
          const errorKey = this.normalizeError(result.error);
          if (!errorGroups.has(errorKey)) {
            errorGroups.set(errorKey, []);
          }
          errorGroups.get(errorKey).push(result.name);
        }
        
        // 更新进度条
        progressBar.update(i + idx + 1, { success: successCount, failed: failedCount });
      });
      
      // 小延迟避免系统过载
      if (i + batchSize < tags.length) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    
    progressBar.stop();
    
    // 显示分类后的错误信息
    if (errorGroups.size > 0) {
      console.log(chalk.red(`\n❌ 本地标签删除失败 (${failedCount} 个):`));
      for (const [errorKey, tagNames] of errorGroups) {
        const namesStr = tagNames.length > 3 
          ? `${tagNames.slice(0, 3).join(', ')} 等 ${tagNames.length} 个标签`
          : tagNames.join(', ');
        console.log(chalk.red(`   ${namesStr}: ${errorKey}`));
      }
    }
    
    console.log(chalk.green(`✅ 本地标签清理完成: ${successCount} 成功, ${failedCount} 失败`));
    
    return { successCount, failedCount, failedTags };
  }

  async cleanRemoteTags(tags) {
    console.log(chalk.yellow(`\n🌐 正在清理远程标签 (${tags.length} 个)...`));
    
    let successCount = 0;
    let failedCount = 0;
    const failedTags = [];
    const errorGroups = new Map(); // 用于错误分类合并
    
    const namesAll = tags.map(t => t.name);
    
    // 创建进度条
    const progressBar = new cliProgress.SingleBar({
      format: '远程标签 |{bar}| {percentage}% | {value}/{total} | 成功: {success} | 失败: {failed}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    
    progressBar.start(tags.length, 0, { success: 0, failed: 0 });
    
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
        } else {
          failedCount++;
          failedTags.push({ name: result.name, error: result.error, type: 'remote' });
          
          // 错误分类合并
          const errorKey = this.normalizeError(result.error);
          if (!errorGroups.has(errorKey)) {
            errorGroups.set(errorKey, []);
          }
          errorGroups.get(errorKey).push(result.name);
        }
        
        // 更新进度条
        progressBar.update(i + idx + 1, { success: successCount, failed: failedCount });
      });
      
      // 添加延迟，避免服务器过载
      if (i + batchSize < namesAll.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    progressBar.stop();
    
    // 显示分类后的错误信息
    if (errorGroups.size > 0) {
      console.log(chalk.red(`\n❌ 远程标签删除失败 (${failedCount} 个):`));
      for (const [errorKey, tagNames] of errorGroups) {
        const namesStr = tagNames.length > 3 
          ? `${tagNames.slice(0, 3).join(', ')} 等 ${tagNames.length} 个标签`
          : tagNames.join(', ');
        console.log(chalk.red(`   ${namesStr}: ${errorKey}`));
      }
    }
    
    console.log(chalk.green(`✅ 远程标签清理完成: ${successCount} 成功, ${failedCount} 失败`));
    
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
