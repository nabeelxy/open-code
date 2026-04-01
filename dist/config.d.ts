import type { Config } from './types.js';
export declare function loadConfig(configPath?: string): Promise<Config>;
export declare function saveConfig(config: Partial<Config>): Promise<void>;
