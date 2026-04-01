import { exec } from 'node:child_process';
import { platform, release } from 'node:os';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
async function tryExec(cmd, cwd) {
    try {
        const { stdout } = await execAsync(cmd, { cwd });
        return stdout.trim();
    }
    catch {
        return '';
    }
}
export async function getSystemContext(cwd = process.cwd()) {
    const os = `${platform()} ${release()}`;
    const nodeVersion = process.version;
    const gitBranch = await tryExec('git rev-parse --abbrev-ref HEAD', cwd);
    const gitStatus = gitBranch ? await tryExec('git status --short', cwd) : '';
    const lines = [
        `Environment:`,
        `- Working directory: ${cwd}`,
        `- OS: ${os}`,
        `- Node.js: ${nodeVersion}`,
    ];
    if (gitBranch) {
        lines.push(`- Git branch: ${gitBranch}`);
        if (gitStatus) {
            lines.push(`- Git status:`);
            for (const line of gitStatus.split('\n')) {
                lines.push(`  ${line}`);
            }
        }
        else {
            lines.push(`- Git status: clean`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=context.js.map