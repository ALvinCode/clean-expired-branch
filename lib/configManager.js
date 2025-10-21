const fs = require('fs');

class ConfigManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.defaultConfig = {
      days: 365,
      protectedBranches: ['production', 'staging', 'master', 'main', 'develop'],
      forceDeleteBranches: [],
      protectedTags: [],
      forceDeleteTags: [],
      remoteName: 'origin',
      dryRun: false,
      includeTags: true,
      cleanupAfterDelete: true,
      cleanTargets: ['all']
    };
  }

  getConfig(options) {
    let config = { ...this.defaultConfig };

    // 尝试从配置文件加载
    if (fs.existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        config = { ...config, ...fileConfig };
      } catch (error) {
        console.warn(`警告: 配置文件 ${this.configPath} 格式错误，使用默认配置`);
      }
    }

    // 命令行参数覆盖配置文件
    if (options.days !== undefined) {
      config.days = parseInt(options.days);
    }

    if (options.protected) {
      config.protectedBranches = options.protected.split(',').map(b => b.trim());
    }

    if (options.forceDelete) {
      config.forceDeleteBranches = options.forceDelete.split(',').map(b => b.trim());
    }

    if (options.cleanTargets) {
      config.cleanTargets = options.cleanTargets.split(',').map(t => t.trim());
    }

    if (options.previewOnly) {
      config.dryRun = true;
    }

    return config;
  }

  // 自动查找配置文件
  static findConfigFile() {
    const possiblePaths = [
      './branch-clean.config.json',
      './.branch-clean.config.json',
      './config/branch-clean.config.json'
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    return './branch-clean.config.json'; // 默认路径
  }
}

module.exports = ConfigManager;
