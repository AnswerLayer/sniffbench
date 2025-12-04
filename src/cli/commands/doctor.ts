import chalk from 'chalk';
import ora from 'ora';
import { box } from '../../utils/ui';
import { checkDocker, RECOMMENDED_IMAGES } from '../../sandbox';

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  suggestion?: string;
}

export async function doctorCommand() {
  console.log(box(chalk.bold('Running diagnostics...'), 'sniff doctor'));

  const checks: Check[] = [];

  // Check 1: Docker availability
  const dockerSpinner = ora('Checking Docker...').start();
  const dockerStatus = await checkDocker();

  if (dockerStatus.available) {
    dockerSpinner.succeed(`Docker ${dockerStatus.version} is available`);
    checks.push({
      name: 'Docker',
      status: 'pass',
      message: `Docker ${dockerStatus.version} is running`,
    });
  } else {
    dockerSpinner.fail(`Docker: ${dockerStatus.error}`);
    checks.push({
      name: 'Docker',
      status: 'fail',
      message: dockerStatus.error!,
      suggestion: dockerStatus.suggestion,
    });
  }

  // Check 2: Pull recommended images (only if Docker is available)
  if (dockerStatus.available) {
    const imageSpinner = ora('Checking recommended images...').start();
    const missingImages: string[] = [];

    // Check for common images
    const imagesToCheck = [
      RECOMMENDED_IMAGES.node.latest,
      RECOMMENDED_IMAGES.python.latest,
    ];

    try {
      const Docker = (await import('dockerode')).default;
      const docker = new Docker();

      for (const image of imagesToCheck) {
        try {
          await docker.getImage(image).inspect();
        } catch {
          missingImages.push(image);
        }
      }

      if (missingImages.length === 0) {
        imageSpinner.succeed('Common images are available locally');
        checks.push({
          name: 'Docker Images',
          status: 'pass',
          message: 'Node.js and Python images are cached locally',
        });
      } else {
        imageSpinner.warn(`${missingImages.length} image(s) will be downloaded on first use`);
        checks.push({
          name: 'Docker Images',
          status: 'warn',
          message: `Images not cached: ${missingImages.join(', ')}`,
          suggestion:
            'These will be downloaded automatically when needed.\n' +
            'To pre-download, run:\n' +
            missingImages.map((img) => `  docker pull ${img}`).join('\n'),
        });
      }
    } catch (err) {
      imageSpinner.fail('Could not check images');
      checks.push({
        name: 'Docker Images',
        status: 'warn',
        message: 'Could not verify image availability',
      });
    }
  }

  // Check 3: Disk space (basic check)
  const diskSpinner = ora('Checking disk space...').start();
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync("df -h . | tail -1 | awk '{print $4}'");
    const available = stdout.trim();

    diskSpinner.succeed(`${available} disk space available`);
    checks.push({
      name: 'Disk Space',
      status: 'pass',
      message: `${available} available in current directory`,
    });
  } catch {
    diskSpinner.warn('Could not check disk space');
    checks.push({
      name: 'Disk Space',
      status: 'warn',
      message: 'Could not determine available disk space',
    });
  }

  // Check 4: Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

  if (majorVersion >= 18) {
    checks.push({
      name: 'Node.js',
      status: 'pass',
      message: `Node.js ${nodeVersion} meets requirements (>=18)`,
    });
  } else {
    checks.push({
      name: 'Node.js',
      status: 'fail',
      message: `Node.js ${nodeVersion} is below minimum (>=18)`,
      suggestion: 'Please upgrade to Node.js 18 or later',
    });
  }

  // Summary
  console.log('');
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;

  let summaryLines: string[] = [];
  summaryLines.push(chalk.bold('Diagnostic Summary\n'));

  for (const check of checks) {
    const icon =
      check.status === 'pass'
        ? chalk.green('✓')
        : check.status === 'fail'
          ? chalk.red('✗')
          : chalk.yellow('⚠');

    summaryLines.push(`${icon} ${chalk.bold(check.name)}: ${check.message}`);

    if (check.suggestion) {
      const suggestionLines = check.suggestion.split('\n');
      for (const line of suggestionLines) {
        summaryLines.push(chalk.dim('    ' + line));
      }
    }
  }

  summaryLines.push('');

  if (failCount === 0) {
    summaryLines.push(
      chalk.green('✓') +
        chalk.bold(' All critical checks passed!') +
        (warnCount > 0 ? chalk.yellow(` (${warnCount} warning${warnCount > 1 ? 's' : ''})`) : '')
    );
    summaryLines.push(chalk.dim('  Sniffbench is ready to use.'));
  } else {
    summaryLines.push(
      chalk.red('✗') +
        chalk.bold(` ${failCount} critical issue${failCount > 1 ? 's' : ''} found`)
    );
    summaryLines.push(chalk.dim('  Please fix the issues above before running evaluations.'));
  }

  console.log(box(summaryLines.join('\n'), 'Results'));
}
