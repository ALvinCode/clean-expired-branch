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
          error: error.message
        });
        failedCount++;
      }
    }
    
    // 显示清理结果摘要
    console.log(chalk.cyan(`\n📊 本地分支清理结果:`));
    console.log(`   ✅ 成功: ${successCount} 个`);
    console.log(`   ❌ 失败: ${failedCount} 个`);
    
    if (failedBranches.length > 0) {
      console.log(chalk.red(`\n❌ 删除失败的分支:`));
      failedBranches.forEach(branch => {
        console.log(`   - ${branch.name}: ${branch.error}`);
      });
      
      // 如果有失败的分支，抛出错误
      if (failedCount > 0) {
        throw new Error(`${failedCount} 个本地分支删除失败`);
      }
    }
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
          error: error.message
        });
        failedCount++;
        
        // 检查是否是受保护分支错误
        if (error.message.includes('protected') || error.message.includes('pre-receive hook declined')) {
          console.log(chalk.yellow(`   💡 提示: ${branch.name} 可能是受保护分支，需要通过 GitLab/GitHub Web 界面删除`));
        }
      }
    }
    
    // 显示清理结果摘要
    console.log(chalk.cyan(`\n📊 远程分支清理结果:`));
    console.log(`   ✅ 成功: ${successCount} 个`);
    console.log(`   ❌ 失败: ${failedCount} 个`);
    
    if (failedBranches.length > 0) {
      console.log(chalk.red(`\n❌ 删除失败的分支:`));
      failedBranches.forEach(branch => {
        console.log(`   - ${branch.name}: ${branch.error}`);
      });
      
      console.log(chalk.yellow(`\n💡 解决建议:`));
      console.log(`   1. 检查分支是否在服务器端受保护`);
      console.log(`   2. 确认您有删除远程分支的权限`);
      console.log(`   3. 受保护分支需要通过 Web 界面删除`));
      
      // 如果有失败的分支，抛出错误
      if (failedCount > 0) {
        throw new Error(`${failedCount} 个远程分支删除失败`);
      }
    }
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
