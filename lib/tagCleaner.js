const { execSync } = require('child_process');
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
    
    const batchSize = 100;
    for (let i = 0; i < tags.length; i += batchSize) {
      const batch = tags.slice(i, i + batchSize);
      const names = batch.map(t => t.name);
      try {
        execSync(`git tag -d ${names.map(n => `"${n}"`).join(' ')}`, { stdio: 'pipe' });
        names.forEach((n, idx) => {
          successCount++;
          const processedSoFar = (i + idx + 1);
          const shouldSuffix = (processedSoFar % 10 === 0) || (idx === names.length - 1);
          const suffix = shouldSuffix ? `（剩余：${tags.length - processedSoFar}）` : '';
          console.log(chalk.green(`   ✅ ${n} 已删除${suffix}`));
        });
      } catch (_batchErr) {
        for (let idx = 0; idx < names.length; idx++) {
          const n = names[idx];
          try {
            execSync(`git tag -d "${n}"`, { stdio: 'pipe' });
            successCount++;
            const processedSoFar = (i + idx + 1);
            const shouldSuffix = (processedSoFar % 10 === 0) || (idx === names.length - 1);
            const suffix = shouldSuffix ? `（剩余：${tags.length - processedSoFar}）` : '';
            console.log(chalk.green(`   ✅ ${n} 已删除${suffix}`));
          } catch (error) {
            failedTags.push({ name: n, error: error.message, type: 'local' });
            failedCount++;
          }
        }
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
    const batchSize = 50;
    for (let i = 0; i < namesAll.length; i += batchSize) {
      const names = namesAll.slice(i, i + batchSize);
      try {
        execSync(`git push ${this.config.remoteName} --delete ${names.map(n => `"${n}"`).join(' ')}`, { stdio: 'pipe' });
        names.forEach((n, idx) => {
          successCount++;
          const processedSoFar = (i + idx + 1);
          const shouldSuffix = (processedSoFar % 10 === 0) || (idx === names.length - 1);
          const suffix = shouldSuffix ? `（剩余：${namesAll.length - processedSoFar}）` : '';
          console.log(chalk.green(`   ✅ ${n} 已删除${suffix}`));
        });
      } catch (_batchErr) {
        for (let idx = 0; idx < names.length; idx++) {
          const n = names[idx];
          try {
            execSync(`git push ${this.config.remoteName} --delete "${n}"`, { stdio: 'pipe' });
            successCount++;
            const processedSoFar = (i + idx + 1);
            const shouldSuffix = (processedSoFar % 10 === 0) || (idx === names.length - 1);
            const suffix = shouldSuffix ? `（剩余：${namesAll.length - processedSoFar}）` : '';
            console.log(chalk.green(`   ✅ ${n} 已删除${suffix}`));
          } catch (error) {
            failedTags.push({ name: n, error: error.message, type: 'remote' });
            failedCount++;
          }
        }
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
