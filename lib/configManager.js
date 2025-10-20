const fs = require('fs');
const path = require('path');

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
      cleanupAfterDelete: true
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
    if (options.days) {
      config.days = parseInt(options.days);
    }

    if (options.protected) {
      config.protectedBranches = options.protected.split(',').map(b => b.trim());
    }

    if (options.forceDelete) {
      config.forceDeleteBranches = options.forceDelete.split(',').map(b => b.trim());
    }

    if (options.previewOnly) {
      config.dryRun = true;
    }

    return config;
  }

  saveConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error(`保存配置文件失败: ${error.message}`);
      return false;
    }
  }

  createDefaultConfig() {
    return this.saveConfig(this.defaultConfig);
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
