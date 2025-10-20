const { execSync, exec } = require('child_process');
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
      return;
    }

    console.log(chalk.yellow(`\n🏷️  清理标签 (${tags.length} 个)...`));
    
    // 先删除本地标签
    await this.cleanLocalTags(tags);
    
    // 再删除远程标签
    await this.cleanRemoteTags(tags);
  }

  async cleanLocalTags(tags) {
    console.log(chalk.yellow(`\n   删除本地标签...`));
    
    for (const tag of tags) {
      try {
        console.log(`   删除本地标签: ${tag.name}`);
        execSync(`git tag -d "${tag.name}"`, { stdio: 'pipe' });
        console.log(chalk.green(`   ✅ ${tag.name} 已删除`));
      } catch (error) {
        console.log(chalk.red(`   ❌ 删除本地标签 ${tag.name} 失败: ${error.message}`));
        throw new Error(`删除本地标签 ${tag.name} 失败`);
      }
    }
  }

  async cleanRemoteTags(tags) {
    console.log(chalk.yellow(`\n   删除远程标签...`));
    
    for (const tag of tags) {
      try {
        console.log(`   删除远程标签: ${tag.name}`);
        execSync(`git push ${this.config.remoteName} --delete "${tag.name}"`, { stdio: 'pipe' });
        console.log(chalk.green(`   ✅ ${tag.name} 已删除`));
      } catch (error) {
        console.log(chalk.red(`   ❌ 删除远程标签 ${tag.name} 失败: ${error.message}`));
        throw new Error(`删除远程标签 ${tag.name} 失败`);
      }
    }
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

  async getTagInfo(tagName) {
    try {
      const format = '%(refname:short)|%(creatordate:unix)|%(creatordate:iso)|%(authorname)|%(subject)';
      
      const output = execSync(`git for-each-ref --format='${format}' refs/tags/${tagName}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (!output) return null;

      const [name, unixTime, isoDate, author, subject] = output.split('|');
      
      return {
        name: name,
        createdDate: isoDate,
        unixTime: parseInt(unixTime),
        author: author,
        subject: subject
      };
    } catch (error) {
      return null;
    }
  }
}

module.exports = TagCleaner;
