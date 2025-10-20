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
    
    for (const tag of tags) {
      try {
        console.log(`   删除本地标签: ${tag.name}`);
        execSync(`git tag -d "${tag.name}"`, { stdio: 'pipe' });
        console.log(chalk.green(`   ✅ ${tag.name} 已删除`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`   ❌ 删除本地标签 ${tag.name} 失败: ${error.message}`));
        failedTags.push({
          name: tag.name,
          error: error.message,
          type: 'local'
        });
        failedCount++;
      }
    }
    
    return {
      successCount,
      failedCount,
      failedTags
    };
  }

  async cleanRemoteTags(tags) {
    console.log(chalk.yellow(`\n   删除远程标签...`));
    
    let successCount = 0;
    let failedCount = 0;
    const failedTags = [];
    
    for (const tag of tags) {
      try {
        console.log(`   删除远程标签: ${tag.name}`);
        execSync(`git push ${this.config.remoteName} --delete "${tag.name}"`, { stdio: 'pipe' });
        console.log(chalk.green(`   ✅ ${tag.name} 已删除`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`   ❌ 删除远程标签 ${tag.name} 失败: ${error.message}`));
        failedTags.push({
          name: tag.name,
          error: error.message,
          type: 'remote'
        });
        failedCount++;
      }
    }
    
    return {
      successCount,
      failedCount,
      failedTags
    };
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
