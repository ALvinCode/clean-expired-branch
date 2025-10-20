const { execSync } = require('child_process');
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
    
    let successCount = 0;
    let failedCount = 0;
    const failedBranches = [];
    
    for (const branch of branches) {
      try {
        console.log(`   删除本地分支: ${branch.name}`);
        execSync(`git branch -D "${branch.name}"`, { stdio: 'pipe' });
        console.log(chalk.green(`   ✅ ${branch.name} 已删除`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`   ❌ 删除本地分支 ${branch.name} 失败: ${error.message}`));
        failedBranches.push({
          name: branch.name,
          error: error.message,
          type: 'local'
        });
        failedCount++;
      }
    }
    
    // 返回清理结果
    return {
      successCount,
      failedCount,
      failedBranches
    };
  }

  async cleanRemoteBranches(branches) {
    console.log(chalk.yellow(`\n🌐 清理远程分支 (${branches.length} 个)...`));
    
    let successCount = 0;
    let failedCount = 0;
    const failedBranches = [];
    
    for (const branch of branches) {
      try {
        console.log(`   删除远程分支: ${branch.name}`);
        execSync(`git push ${this.config.remoteName} --delete "${branch.name}"`, { stdio: 'pipe' });
        console.log(chalk.green(`   ✅ ${branch.name} 已删除`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`   ❌ 删除远程分支 ${branch.name} 失败: ${error.message}`));
        failedBranches.push({
          name: branch.name,
          error: error.message,
          type: 'remote'
        });
        failedCount++;
        
        // 检查是否是受保护分支错误
        if (error.message.includes('protected') || error.message.includes('pre-receive hook declined')) {
          console.log(chalk.yellow(`   💡 提示: ${branch.name} 可能是受保护分支，需要通过 GitLab/GitHub Web 界面删除`));
        }
      }
    }
    
    // 返回清理结果
    return {
      successCount,
      failedCount,
      failedBranches
    };
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
