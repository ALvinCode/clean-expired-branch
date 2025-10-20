const { execSync, exec } = require('child_process');
const chalk = require('chalk');

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
    
    for (const branch of branches) {
      try {
        console.log(`   删除本地分支: ${branch.name}`);
        execSync(`git branch -D "${branch.name}"`, { stdio: 'pipe' });
        console.log(chalk.green(`   ✅ ${branch.name} 已删除`));
      } catch (error) {
        console.log(chalk.red(`   ❌ 删除 ${branch.name} 失败: ${error.message}`));
        throw new Error(`删除本地分支 ${branch.name} 失败`);
      }
    }
  }

  async cleanRemoteBranches(branches) {
    console.log(chalk.yellow(`\n🌐 清理远程分支 (${branches.length} 个)...`));
    
    for (const branch of branches) {
      try {
        console.log(`   删除远程分支: ${branch.name}`);
        execSync(`git push ${this.config.remoteName} --delete "${branch.name}"`, { stdio: 'pipe' });
        console.log(chalk.green(`   ✅ ${branch.name} 已删除`));
      } catch (error) {
        console.log(chalk.red(`   ❌ 删除远程分支 ${branch.name} 失败: ${error.message}`));
        throw new Error(`删除远程分支 ${branch.name} 失败`);
      }
    }
  }

  isBranchProtected(branchName) {
    // 检查是否在受保护列表中
    const isProtected = this.config.protectedBranches.some(protected => {
      if (protected.includes('*')) {
        // 支持通配符匹配
        const regex = new RegExp(protected.replace(/\*/g, '.*'));
        return regex.test(branchName);
      }
      return branchName === protected;
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

  async getBranchInfo(branchName, isRemote = false) {
    try {
      const ref = isRemote ? `refs/remotes/${this.config.remoteName}/${branchName}` : `refs/heads/${branchName}`;
      const format = '%(refname:short)|%(committerdate:unix)|%(committerdate:iso)|%(authorname)|%(subject)';
      
      const output = execSync(`git for-each-ref --format='${format}' ${ref}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (!output) return null;

      const [name, unixTime, isoDate, author, subject] = output.split('|');
      
      return {
        name: isRemote ? name.replace(`${this.config.remoteName}/`, '') : name,
        lastCommit: isoDate,
        unixTime: parseInt(unixTime),
        author: author,
        subject: subject
      };
    } catch (error) {
      return null;
    }
  }
}

module.exports = BranchCleaner;
