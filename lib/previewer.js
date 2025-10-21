const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const chalk = require('chalk');
const BranchCleaner = require('./branchCleaner');
const TagCleaner = require('./tagCleaner');

class Previewer {
  constructor(config) {
    this.config = config;
    this.branchCleaner = new BranchCleaner(config);
    this.tagCleaner = new TagCleaner(config);
    this.cutoffDate = this.calculateCutoffDate();
  }

  calculateCutoffDate() {
    const cutoffTime = Date.now() - (this.config.days * 24 * 60 * 60 * 1000);
    return Math.floor(cutoffTime / 1000);
  }

  async getRepositoryStats() {
    try {
      // 使用异步并发获取统计信息
      const [commitsResult, localBranchesResult, remoteBranchesResult, tagsResult] = await Promise.all([
        execAsync('git rev-list --count HEAD', { timeout: 10000 }),
        execAsync('git branch -l | wc -l', { timeout: 5000 }),
        execAsync(`git branch -r | grep -v HEAD | wc -l`, { timeout: 5000 }),
        execAsync('git tag -l | wc -l', { timeout: 5000 })
      ]);
      
      const commits = commitsResult.stdout.trim();
      const localBranches = localBranchesResult.stdout.trim();
      const remoteBranches = remoteBranchesResult.stdout.trim();
      const tags = tagsResult.stdout.trim();
      
      const totalBranches = parseInt(localBranches) + parseInt(remoteBranches);
      
      // 获取存储大小（改进版本）
      const size = this.getRepositorySize();

      return {
        commits: parseInt(commits),
        branches: totalBranches,
        tags: parseInt(tags),
        size: size
      };
    } catch (error) {
      console.error(chalk.red('获取仓库统计信息失败:'), error.message);
      return {
        commits: 0,
        branches: 0,
        tags: 0,
        size: '0B'
      };
    }
  }

  getRepositorySize() {
    try {
      // 优先使用 git count-objects 获取更准确的大小
      try {
        const countOutput = execSync('git count-objects -vH', { encoding: 'utf8' }).trim();
        const lines = countOutput.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('size-pack:')) {
            const sizeStr = line.split(':')[1].trim();
            return this.normalizeSizeString(sizeStr);
          }
        }
      } catch (countError) {
        // 如果 git count-objects 失败，回退到 du 命令
      }
      
      // 回退方案：使用 du 命令
      const sizeOutput = execSync('du -sh .git', { encoding: 'utf8' }).trim();
      const size = sizeOutput.split('\t')[0];
      return this.normalizeSizeString(size);
    } catch (error) {
      // 如果都失败了，尝试其他方法
      try {
        // 在 Windows 上尝试 dir 命令
        if (process.platform === 'win32') {
          const dirOutput = execSync('dir .git /s /-c', { encoding: 'utf8' }).trim();
          const lines = dirOutput.split('\n');
          const lastLine = lines[lines.length - 1];
          if (lastLine.includes('bytes')) {
            const bytes = parseInt(lastLine.match(/(\d+)/)[1]);
            return this.formatBytes(bytes);
          }
        }
      } catch (dirError) {
        // 忽略错误
      }
      
      return '未知';
    }
  }

  normalizeSizeString(sizeStr) {
    // 如果已经是标准格式，直接返回
    if (sizeStr.match(/^\d+\.\d{2}\s+(KB|MB|GB)$/)) {
      return sizeStr;
    }
    
    // 解析各种格式的大小字符串
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMG]?B?)$/i);
    if (!match) {
      return sizeStr; // 无法解析，返回原字符串
    }
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    // 转换为字节数
    let bytes = value;
    switch (unit) {
      case 'KB':
        bytes = value * 1024;
        break;
      case 'MB':
        bytes = value * 1024 * 1024;
        break;
      case 'GB':
        bytes = value * 1024 * 1024 * 1024;
        break;
      case 'B':
      case '':
        // 已经是字节数
        break;
      default:
        return sizeStr; // 未知单位，返回原字符串
    }
    
    return this.formatBytes(bytes);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0.00 KB';
    
    const k = 1024;
    const sizes = ['KB', 'MB', 'GB', 'TB'];
    
    if (bytes >= k * k * k) {
      // >= 1GB
      const gb = bytes / (k * k * k);
      return gb.toFixed(2) + ' GB';
    } else if (bytes >= k * k) {
      // >= 1MB
      const mb = bytes / (k * k);
      return mb.toFixed(2) + ' MB';
    } else {
      // < 1MB
      const kb = bytes / k;
      return kb.toFixed(2) + ' KB';
    }
  }

  async getLocalBranchesToClean() {
    try {
      const format = '%(refname:short)|%(committerdate:unix)|%(committerdate:iso)|%(authorname)|%(subject)';
      const output = execSync(`git for-each-ref --format='${format}' refs/heads`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const branches = [];
      const lines = output.trim().split('\n').filter(line => line.trim());

      for (const line of lines) {
        const [name, unixTime, isoDate, author, subject] = line.split('|');
        const unix = parseInt(unixTime);

        if (unix < this.cutoffDate && !this.branchCleaner.isBranchProtected(name)) {
          branches.push({
            name: name,
            lastCommit: isoDate,
            unixTime: unix,
            author: author,
            subject: subject
          });
        }
      }

      return branches.sort((a, b) => a.unixTime - b.unixTime);
    } catch (error) {
      console.error(chalk.red('获取本地分支信息失败:'), error.message);
      return [];
    }
  }

  async getRemoteBranchesToClean() {
    try {
      const format = '%(refname:short)|%(committerdate:unix)|%(committerdate:iso)|%(authorname)|%(subject)';
      const output = execSync(`git for-each-ref --format='${format}' refs/remotes/${this.config.remoteName}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const branches = [];
      const lines = output.trim().split('\n').filter(line => line.trim());

      for (const line of lines) {
        const [fullName, unixTime, isoDate, author, subject] = line.split('|');
        const unix = parseInt(unixTime);

        // 仅处理真正的远端分支：必须以 `${remoteName}/` 开头
        const prefix = `${this.config.remoteName}/`;
        if (!fullName.startsWith(prefix)) {
          continue;
        }

        // 去掉前缀后得到分支名，并排除 HEAD 指针
        const name = fullName.slice(prefix.length);
        if (!name || name === 'HEAD') {
          continue;
        }

        if (unix < this.cutoffDate && !this.branchCleaner.isBranchProtected(name)) {
          branches.push({
            name: name,
            lastCommit: isoDate,
            unixTime: unix,
            author: author,
            subject: subject
          });
        }
      }

      return branches.sort((a, b) => a.unixTime - b.unixTime);
    } catch (error) {
      console.error(chalk.red('获取远程分支信息失败:'), error.message);
      return [];
    }
  }

  async getTagsToClean() {
    if (!this.config.includeTags) {
      return [];
    }

    try {
      const format = '%(refname:short)|%(creatordate:unix)|%(creatordate:iso)|%(authorname)|%(subject)';
      const output = execSync(`git for-each-ref --format='${format}' refs/tags`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const tags = [];
      const lines = output.trim().split('\n').filter(line => line.trim());

      for (const line of lines) {
        const [name, unixTime, isoDate, author, subject] = line.split('|');
        const unix = parseInt(unixTime);

        if (unix < this.cutoffDate && !this.tagCleaner.isTagProtected(name)) {
          tags.push({
            name: name,
            createdDate: isoDate,
            unixTime: unix,
            author: author,
            subject: subject
          });
        }
      }

      return tags.sort((a, b) => a.unixTime - b.unixTime);
    } catch (error) {
      console.error(chalk.red('获取标签信息失败:'), error.message);
      return [];
    }
  }

  async performCleanup() {
    if (!this.config.cleanupAfterDelete) {
      return;
    }

    console.log(chalk.yellow('\n🧹 执行收尾清理...'));
    
    try {
      // 清理远程引用（允许标签冲突，因为这不影响清理效果）
      console.log('   清理远程引用...');
      try {
        execSync(`git fetch ${this.config.remoteName} --prune --prune-tags`, { 
          stdio: 'pipe',
          timeout: 60000 // 60秒超时
        });
      } catch (fetchError) {
        // 检查是否是标签冲突导致的错误
        if (fetchError.message.includes('会破坏现有的标签') || 
            fetchError.message.includes('would clobber existing tag')) {
          console.log(chalk.yellow('   ⚠️  部分标签存在冲突，但清理已完成'));
        } else {
          throw fetchError; // 重新抛出其他类型的错误
        }
      }
      
      // 执行垃圾回收
      console.log('   执行垃圾回收...');
      execSync('git gc --prune=now --aggressive', { 
        stdio: 'pipe',
        timeout: 120000 // 2分钟超时
      });
      
      console.log(chalk.green('   ✅ 收尾清理完成'));
    } catch (error) {
      console.log(chalk.red(`   ❌ 收尾清理失败: ${error.message}`));
      throw new Error('收尾清理失败');
    }
  }
}

module.exports = Previewer;
