const { execSync } = require('child_process');
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
      // 获取提交数
      const commits = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
      
      // 获取分支数
      const localBranches = execSync('git branch -l | wc -l', { encoding: 'utf8' }).trim();
      const remoteBranches = execSync(`git branch -r | grep -v HEAD | wc -l`, { encoding: 'utf8' }).trim();
      const totalBranches = parseInt(localBranches) + parseInt(remoteBranches);
      
      // 获取标签数
      const tags = execSync('git tag -l | wc -l', { encoding: 'utf8' }).trim();
      
      // 获取存储大小
      const sizeOutput = execSync('du -sh .git', { encoding: 'utf8' }).trim();
      const size = sizeOutput.split('\t')[0];

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
      // 清理远程引用
      console.log('   清理远程引用...');
      execSync(`git fetch ${this.config.remoteName} --prune --prune-tags`, { stdio: 'pipe' });
      
      // 执行垃圾回收
      console.log('   执行垃圾回收...');
      execSync('git gc --prune=now --aggressive', { stdio: 'pipe' });
      
      console.log(chalk.green('   ✅ 收尾清理完成'));
    } catch (error) {
      console.log(chalk.red(`   ❌ 收尾清理失败: ${error.message}`));
      throw new Error('收尾清理失败');
    }
  }
}

module.exports = Previewer;
