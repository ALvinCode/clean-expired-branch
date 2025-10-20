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
    let processedCount = 0;
    const failedItems = [];

    // 本地删除可批量执行：git branch -D a b c
    const batchSize = 50;
    for (let i = 0; i < branches.length; i += batchSize) {
      const batch = branches.slice(i, i + batchSize);
      const names = batch.map(b => b.name);
      try {
        execSync(`git branch -D ${names.map(n => `"${n}"`).join(' ')}`, { stdio: 'pipe' });
        names.forEach((n, idx) => {
          successCount++;
          processedCount++;
          const shouldSuffix = (processedCount % 10 === 0) || (idx === names.length - 1);
          const suffix = shouldSuffix ? `（剩余：${branches.length - processedCount}）` : '';
          console.log(chalk.green(`   ✅ ${n} 已删除${suffix}`));
        });
      } catch (_batchErr) {
        // 回退到单个尝试，逐个记录失败但不打断
        for (let idx = 0; idx < names.length; idx++) {
          const n = names[idx];
          try {
            execSync(`git branch -D "${n}"`, { stdio: 'pipe' });
            successCount++;
            processedCount++;
            const shouldSuffix = (processedCount % 10 === 0) || (idx === names.length - 1);
            const suffix = shouldSuffix ? `（剩余：${branches.length - processedCount}）` : '';
            console.log(chalk.green(`   ✅ ${n} 已删除${suffix}`));
          } catch (error) {
            failedItems.push({ name: n, error: error.message, type: 'local' });
            failedCount++;
            processedCount++;
          }
        }
      }
    }
    
    // 返回清理结果
    return { successCount, failedCount, failedItems };
  }

  async cleanRemoteBranches(branches) {
    console.log(chalk.yellow(`\n🌐 清理远程分支 (${branches.length} 个)...`));
    
    let successCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failedItems = [];

    const namesAll = branches.map(b => b.name);
    const batchSize = 20; // 避免命令过长
    for (let i = 0; i < namesAll.length; i += batchSize) {
      const names = namesAll.slice(i, i + batchSize);
      try {
        execSync(`git push ${this.config.remoteName} --delete ${names.map(n => `"${n}"`).join(' ')}`, { stdio: 'pipe' });
        names.forEach((n, idx) => {
          successCount++;
          processedCount++;
          const shouldSuffix = (processedCount % 10 === 0) || (idx === names.length - 1);
          const suffix = shouldSuffix ? `（剩余：${branches.length - processedCount}）` : '';
          console.log(chalk.green(`   ✅ ${n} 已删除${suffix}`));
        });
      } catch (_batchErr) {
        // 批量失败则逐个尝试，记录失败
        for (let idx = 0; idx < names.length; idx++) {
          const n = names[idx];
          try {
            execSync(`git push ${this.config.remoteName} --delete "${n}"`, { stdio: 'pipe' });
            successCount++;
            processedCount++;
            const shouldSuffix = (processedCount % 10 === 0) || (idx === names.length - 1);
            const suffix = shouldSuffix ? `（剩余：${branches.length - processedCount}）` : '';
            console.log(chalk.green(`   ✅ ${n} 已删除${suffix}`));
          } catch (error) {
            failedItems.push({ name: n, error: error.message, type: 'remote' });
            failedCount++;
            processedCount++;
          }
        }
      }
    }
    
    // 返回清理结果
    return { successCount, failedCount, failedItems };
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
