/**
 * Variant subcommands - register, list, show, diff, delete, build, prune variants
 */

import chalk from 'chalk';
import { box, padVisible } from '../../utils/ui';
import { checkMissingEnvVars, getEnvFilePath } from '../../utils/env';
import { captureSandboxableSnapshot, diffAgentConfig, formatAgentConfig } from '../../runs';
import {
  loadVariants,
  saveVariants,
  listVariants,
  getVariant,
  findVariantByName,
  registerVariant,
  deleteVariant,
  resolveVariantId,
  hashAgentConfig,
  Variant,
} from '../../variants';
import { getAgent } from '../../agents';
import {
  buildVariantImage,
  variantImageExists,
  pruneVariantImage,
  collectRequiredEnvVars,
  getHostClaudeVersion,
  checkDockerAvailable,
} from '../../sandbox';

/**
 * Format a date string for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a variant for list display
 */
function formatVariantRow(variant: Variant): string {
  const date = chalk.dim(formatDate(variant.createdAt));
  const name = chalk.cyan(variant.name);
  const desc = variant.description
    ? chalk.dim(variant.description.substring(0, 30) + (variant.description.length > 30 ? '...' : ''))
    : chalk.dim('-');
  const model = chalk.yellow(variant.snapshot.model.substring(0, 15));

  // Container status
  let containerStatus: string;
  if (variant.container) {
    const exists = variantImageExists(variant);
    containerStatus = exists ? chalk.green('✓ Built') : chalk.yellow('⚠ Missing');
  } else {
    containerStatus = chalk.dim('Not built');
  }

  return `  ${padVisible(variant.id.substring(0, 16), 16)}  ${padVisible(name, 15)}  ${padVisible(containerStatus, 12)}  ${padVisible(model, 15)}  ${desc}`;
}

/**
 * Register a new variant
 */
export async function variantRegisterCommand(
  name: string,
  options: { description?: string; changes?: string[]; agent?: string; build?: boolean; force?: boolean }
): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Check for duplicate name
  const existing = findVariantByName(store, name);
  if (existing && !options.force) {
    console.log(chalk.red(`\n  A variant with name "${name}" already exists.`));
    console.log(chalk.dim(`  ID: ${existing.id}`));
    console.log(chalk.dim('  Use --force to overwrite or use a different name.\n'));
    return;
  }

  // If force and existing, delete old variant
  if (existing && options.force) {
    deleteVariant(store, existing.id);
    console.log(chalk.dim(`  Replacing existing variant "${name}"...`));
  }

  // Get the agent (defaults to claude-code)
  const agentName = options.agent || 'claude-code';
  const agent = getAgent(agentName);

  // Capture current ambient config with full MCP details
  console.log(chalk.dim(`  Capturing configuration for ${agentName}...`));
  const snapshot = await captureSandboxableSnapshot(agent, projectRoot);

  // Register the variant
  const variant = registerVariant(store, snapshot, {
    name,
    description: options.description,
    changes: options.changes,
  });

  // Save
  saveVariants(projectRoot, store);

  // Build container if requested
  if (options.build) {
    const dockerAvailable = await checkDockerAvailable();
    if (!dockerAvailable) {
      console.log(chalk.yellow('\n  Docker not available. Skipping container build.'));
      console.log(chalk.dim('  Run `sniff variant build ' + name + '` later to build the container.\n'));
    } else {
      try {
        console.log(chalk.dim('\n  Building container image...'));
        const result = await buildVariantImage({
          variant,
          projectRoot,
          verbose: false,
        });

        // Update variant with container info
        variant.container = result.containerInfo;
        saveVariants(projectRoot, store);

        console.log(chalk.green(`  ✓ Container built: ${result.imageName}:${result.imageTag}`));
        console.log(chalk.dim(`    Build time: ${(result.durationMs / 1000).toFixed(1)}s`));
      } catch (err) {
        console.log(chalk.red(`\n  Failed to build container: ${err}`));
        console.log(chalk.dim('  Variant registered without container. Use `sniff variant build` to retry.\n'));
      }
    }
  }

  // Show required env vars
  const requiredEnvVars = collectRequiredEnvVars(snapshot);

  console.log(box(
    chalk.bold('Variant Registered\n\n') +
    `ID: ${variant.id}\n` +
    `Name: ${chalk.cyan(variant.name)}\n` +
    (variant.description ? `Description: ${variant.description}\n` : '') +
    (variant.container ? `Container: ${variant.container.imageName}:${variant.container.imageTag}\n` : '') +
    '\n' +
    chalk.bold('Captured Configuration:\n') +
    formatAgentConfig(variant.snapshot) +
    (requiredEnvVars.length > 0 ? '\n\n' + chalk.bold('Required Environment Variables:\n') +
      requiredEnvVars.map(v => `  ${v}: ${process.env[v] ? chalk.green('✓ set') : chalk.red('✗ missing')}`).join('\n') : ''),
    'sniff variant register'
  ));
}

/**
 * List all variants
 */
export async function variantListCommand(options: { json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);
  const variants = listVariants(store);

  if (options.json) {
    console.log(JSON.stringify(variants, null, 2));
    return;
  }

  if (variants.length === 0) {
    console.log(box(
      chalk.dim('No variants registered.\n\n') +
      chalk.dim('Use `sniff variant register <name>` to register the current configuration as a variant.'),
      'Variants'
    ));
    return;
  }

  console.log(box(
    chalk.bold(`${variants.length} variant${variants.length === 1 ? '' : 's'}\n\n`) +
    chalk.dim('ID                Name             Container     Model            Description\n') +
    chalk.dim('─'.repeat(90)) + '\n' +
    variants.map(formatVariantRow).join('\n'),
    'Variants'
  ));
}

/**
 * Show details of a specific variant
 */
export async function variantShowCommand(options: { id: string; json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve ID (could be name or partial ID)
  const variantId = resolveVariantId(store, options.id);
  if (!variantId) {
    console.log(chalk.red(`\n  Variant not found: ${options.id}`));
    console.log(chalk.dim('  Use `sniff variants list` to see available variants.\n'));
    return;
  }

  const variant = getVariant(store, variantId);
  if (!variant) {
    console.log(chalk.red(`\n  Variant not found: ${variantId}\n`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(variant, null, 2));
    return;
  }

  // Display variant details
  const configHash = hashAgentConfig(variant.snapshot);
  const requiredEnvVars = collectRequiredEnvVars(variant.snapshot);

  const contentParts = [
    chalk.bold('Variant Details\n'),
    `ID: ${variant.id}`,
    `Name: ${chalk.cyan(variant.name)}`,
    variant.description ? `Description: ${variant.description}` : '',
    `Created: ${formatDate(variant.createdAt)}`,
    `Config Hash: ${configHash}`,
    '',
  ];

  // Container info
  if (variant.container) {
    const exists = variantImageExists(variant);
    contentParts.push(chalk.bold('Container:'));
    contentParts.push(`  Image: ${variant.container.imageName}:${variant.container.imageTag}`);
    contentParts.push(`  Claude Code: ${variant.container.claudeVersion}`);
    contentParts.push(`  Built: ${formatDate(variant.container.builtAt)}`);
    contentParts.push(`  Status: ${exists ? chalk.green('✓ Available') : chalk.yellow('⚠ Missing (rebuild required)')}`);
    contentParts.push('');
  } else {
    contentParts.push(chalk.dim('Container: Not built'));
    contentParts.push(chalk.dim('  Run `sniff variant build ' + variant.name + '` to create container'));
    contentParts.push('');
  }

  // Required env vars
  if (requiredEnvVars.length > 0) {
    contentParts.push(chalk.bold('Required Environment Variables:'));
    for (const envVar of requiredEnvVars) {
      const isSet = !!process.env[envVar];
      contentParts.push(`  ${envVar}: ${isSet ? chalk.green('✓ set') : chalk.red('✗ missing')}`);
    }
    contentParts.push('');
  }

  // Declared changes
  if (variant.changes && variant.changes.length > 0) {
    contentParts.push(chalk.bold('Declared Changes:'));
    for (const change of variant.changes) {
      contentParts.push(`  - ${change}`);
    }
    contentParts.push('');
  }

  contentParts.push(chalk.bold('Configuration Snapshot:'));
  contentParts.push(formatAgentConfig(variant.snapshot));

  console.log(box(contentParts.filter(Boolean).join('\n'), `Variant: ${variant.name}`));
}

/**
 * Compare two variants (config diff only, no run data)
 */
export async function variantDiffCommand(id1: string, id2: string, options: { json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve both IDs
  const variantId1 = resolveVariantId(store, id1);
  const variantId2 = resolveVariantId(store, id2);

  if (!variantId1) {
    console.log(chalk.red(`\n  Variant not found: ${id1}`));
    console.log(chalk.dim('  Use `sniff variants list` to see available variants.\n'));
    return;
  }

  if (!variantId2) {
    console.log(chalk.red(`\n  Variant not found: ${id2}`));
    console.log(chalk.dim('  Use `sniff variants list` to see available variants.\n'));
    return;
  }

  const variant1 = getVariant(store, variantId1)!;
  const variant2 = getVariant(store, variantId2)!;

  // Compute diff
  const diffs = diffAgentConfig(variant1.snapshot, variant2.snapshot);

  if (options.json) {
    console.log(JSON.stringify({
      variant1: { id: variant1.id, name: variant1.name },
      variant2: { id: variant2.id, name: variant2.name },
      differences: diffs,
    }, null, 2));
    return;
  }

  // Display comparison
  console.log(box(
    chalk.bold('Variant Comparison\n\n') +
    chalk.dim('Comparing configuration differences between two variants.'),
    'sniff variant diff'
  ));

  console.log(chalk.bold('\n  Variants:\n'));
  console.log(chalk.dim('  ─'.repeat(40)));
  console.log(`  ${chalk.bold('Variant 1:')} ${variant1.name} (${variant1.id.substring(0, 16)})`);
  console.log(`             ${chalk.dim(formatDate(variant1.createdAt))}`);
  console.log('');
  console.log(`  ${chalk.bold('Variant 2:')} ${variant2.name} (${variant2.id.substring(0, 16)})`);
  console.log(`             ${chalk.dim(formatDate(variant2.createdAt))}`);

  // Show declared changes if any
  if (variant1.changes && variant1.changes.length > 0) {
    console.log(chalk.bold('\n  Variant 1 Declared Changes:'));
    for (const change of variant1.changes) {
      console.log(chalk.dim(`    - ${change}`));
    }
  }

  if (variant2.changes && variant2.changes.length > 0) {
    console.log(chalk.bold('\n  Variant 2 Declared Changes:'));
    for (const change of variant2.changes) {
      console.log(chalk.dim(`    - ${change}`));
    }
  }

  // Show config diff
  if (diffs.length > 0) {
    console.log(chalk.bold('\n  Configuration Differences:\n'));
    console.log(chalk.dim('  ─'.repeat(40)));
    for (const diff of diffs) {
      console.log(`  ${diff.field}: ${chalk.red(diff.old)} → ${chalk.green(diff.new)}`);
    }
  } else {
    console.log(chalk.dim('\n  No configuration differences detected.\n'));
  }

  console.log('');
}

/**
 * Delete a variant
 */
export async function variantDeleteCommand(options: { id: string; force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve ID
  const variantId = resolveVariantId(store, options.id);
  if (!variantId) {
    console.log(chalk.red(`\n  Variant not found: ${options.id}`));
    console.log(chalk.dim('  Use `sniff variants list` to see available variants.\n'));
    return;
  }

  const variant = getVariant(store, variantId);
  if (!variant) {
    console.log(chalk.red(`\n  Variant not found: ${variantId}\n`));
    return;
  }

  // Confirm deletion unless --force
  if (!options.force) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        chalk.yellow(`\n  Delete variant "${variant.name}" (${variantId})? (y/N): `),
        resolve
      );
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log(chalk.dim('\n  Cancelled.\n'));
      return;
    }
  }

  // Also prune container image if it exists
  if (variant.container) {
    try {
      pruneVariantImage(variant);
      console.log(chalk.dim(`  Also removed container image: ${variant.container.imageName}:${variant.container.imageTag}`));
    } catch {
      // Ignore errors pruning image
    }
  }

  // Delete the variant
  const deleted = deleteVariant(store, variantId);
  if (deleted) {
    saveVariants(projectRoot, store);
    console.log(chalk.green(`\n  ✓ Deleted variant: ${variant.name} (${variantId})\n`));
  } else {
    console.log(chalk.red(`\n  Failed to delete variant: ${variantId}\n`));
  }
}

/**
 * Build container image for a variant
 */
export async function variantBuildCommand(
  idOrName: string,
  options: { verbose?: boolean; claudeVersion?: string }
): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve ID
  const variantId = resolveVariantId(store, idOrName);
  if (!variantId) {
    console.log(chalk.red(`\n  Variant not found: ${idOrName}`));
    console.log(chalk.dim('  Use `sniff variants list` to see available variants.\n'));
    return;
  }

  const variant = getVariant(store, variantId);
  if (!variant) {
    console.log(chalk.red(`\n  Variant not found: ${variantId}\n`));
    return;
  }

  // Check Docker availability
  const dockerAvailable = await checkDockerAvailable();
  if (!dockerAvailable) {
    console.log(chalk.red('\n  Docker is not available.'));
    console.log(chalk.dim('  Please install Docker and ensure it is running.\n'));
    return;
  }

  // Get Claude Code version: option > registered snapshot > auto-detect
  // Clean version string (remove " (Claude Code)" suffix if present)
  const rawVersion = options.claudeVersion
    || variant.snapshot.version
    || getHostClaudeVersion();
  const claudeVersion = rawVersion?.match(/(\d+\.\d+\.\d+)/)?.[1];
  if (!claudeVersion) {
    console.log(chalk.red('\n  Could not determine Claude Code version.'));
    console.log(chalk.dim('  Specify manually: sniff variant build <name> --claude-version 2.0.55\n'));
    return;
  }

  console.log(chalk.dim(`\n  Building container for variant "${variant.name}"...`));
  console.log(chalk.dim(`  Claude Code version: ${claudeVersion}`));

  try {
    const result = await buildVariantImage({
      variant,
      projectRoot,
      claudeVersion,
      verbose: options.verbose,
    });

    // Update variant with container info
    variant.container = result.containerInfo;
    saveVariants(projectRoot, store);

    console.log(box(
      chalk.bold('Container Built\n\n') +
      `Variant: ${chalk.cyan(variant.name)}\n` +
      `Image: ${result.imageName}:${result.imageTag}\n` +
      `Claude Code: ${claudeVersion}\n` +
      `Build time: ${(result.durationMs / 1000).toFixed(1)}s\n\n` +
      chalk.dim('Run with: sniff interview --use-variant ' + variant.name),
      'sniff variant build'
    ));
  } catch (err) {
    console.log(chalk.red(`\n  Build failed: ${err}\n`));
    if (options.verbose) {
      console.log(chalk.dim('  Run with --verbose for detailed build output.\n'));
    }
  }
}

/**
 * Remove container image for a variant (keep variant config)
 */
export async function variantPruneCommand(
  idOrName: string,
  options: { force?: boolean }
): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve ID
  const variantId = resolveVariantId(store, idOrName);
  if (!variantId) {
    console.log(chalk.red(`\n  Variant not found: ${idOrName}`));
    console.log(chalk.dim('  Use `sniff variants list` to see available variants.\n'));
    return;
  }

  const variant = getVariant(store, variantId);
  if (!variant) {
    console.log(chalk.red(`\n  Variant not found: ${variantId}\n`));
    return;
  }

  if (!variant.container) {
    console.log(chalk.yellow(`\n  Variant "${variant.name}" has no container image.\n`));
    return;
  }

  const imageName = `${variant.container.imageName}:${variant.container.imageTag}`;

  // Confirm unless --force
  if (!options.force) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        chalk.yellow(`\n  Remove container image "${imageName}"? (y/N): `),
        resolve
      );
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log(chalk.dim('\n  Cancelled.\n'));
      return;
    }
  }

  // Remove the image
  const removed = pruneVariantImage(variant);
  if (removed) {
    // Clear container info but keep variant
    variant.container = undefined;
    saveVariants(projectRoot, store);
    console.log(chalk.green(`\n  ✓ Removed container image: ${imageName}`));
    console.log(chalk.dim(`  Variant "${variant.name}" still registered. Use \`sniff variant build\` to rebuild.\n`));
  } else {
    console.log(chalk.yellow(`\n  Could not remove image (may already be deleted).`));
    // Still clear container info
    variant.container = undefined;
    saveVariants(projectRoot, store);
    console.log(chalk.dim(`  Cleared container reference from variant.\n`));
  }
}

/**
 * Use a variant (activate for subsequent commands)
 */
export async function variantUseCommand(idOrName: string): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);

  // Resolve ID
  const variantId = resolveVariantId(store, idOrName);
  if (!variantId) {
    console.log(chalk.red(`\n  Variant not found: ${idOrName}`));
    console.log(chalk.dim('  Use `sniff variants list` to see available variants.\n'));
    return;
  }

  const variant = getVariant(store, variantId);
  if (!variant) {
    console.log(chalk.red(`\n  Variant not found: ${variantId}\n`));
    return;
  }

  // Check if variant has container
  if (!variant.container) {
    console.log(chalk.yellow(`\n  Warning: Variant "${variant.name}" has no container.`));
    console.log(chalk.dim('  Run `sniff variant build ' + variant.name + '` to build it first.\n'));
  }

  // Validate env vars (check both process.env and .sniffbench/.env)
  const requiredEnvVars = collectRequiredEnvVars(variant.snapshot);
  const envCheck = checkMissingEnvVars(requiredEnvVars, projectRoot);
  if (envCheck.missing.length > 0) {
    const envFilePath = getEnvFilePath(projectRoot);
    console.log(chalk.yellow(`\n  Missing environment variables:`));
    for (const v of envCheck.missing) {
      console.log(chalk.red(`    ${v}`));
    }
    console.log(chalk.dim(`\n  Add them to ${envFilePath} or export in your shell.\n`));
  }

  // Store active variant in project settings
  const settingsPath = `${projectRoot}/.sniffbench/active-variant`;
  const fs = await import('fs');
  const path = await import('path');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, variant.name);

  console.log(chalk.green(`\n  ✓ Now using variant: ${variant.name}`));
  console.log(chalk.dim(`  Subsequent interviews will use this variant.\n`));
}

/**
 * Stop using active variant
 */
export async function variantUnuseCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const settingsPath = `${projectRoot}/.sniffbench/active-variant`;
  const fs = await import('fs');

  if (!fs.existsSync(settingsPath)) {
    console.log(chalk.dim('\n  No variant is currently active.\n'));
    return;
  }

  const currentVariant = fs.readFileSync(settingsPath, 'utf-8').trim();
  fs.unlinkSync(settingsPath);

  console.log(chalk.green(`\n  ✓ Stopped using variant: ${currentVariant}`));
  console.log(chalk.dim(`  Subsequent interviews will use the current ambient configuration.\n`));
}

/**
 * Show the currently active variant
 */
export async function variantActiveCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);
  const activeVariantName = getActiveVariant(projectRoot);

  if (!activeVariantName) {
    console.log(chalk.dim('\n  No variant is currently active.'));
    console.log(chalk.dim('  Interviews will use the current ambient configuration [local].\n'));
    return;
  }

  const variant = findVariantByName(store, activeVariantName);
  if (!variant) {
    console.log(chalk.yellow(`\n  Active variant "${activeVariantName}" not found in registry.`));
    console.log(chalk.dim('  It may have been deleted. Run `sniff variant unuse` to clear.\n'));
    return;
  }

  // Check container status
  let containerStatus: string;
  if (variant.container) {
    const exists = variantImageExists(variant);
    containerStatus = exists
      ? chalk.green('✓ Built')
      : chalk.yellow('⚠ Image missing (run `sniff variant build`)');
  } else {
    containerStatus = chalk.yellow('Not built (run `sniff variant build`)');
  }

  console.log(box(
    [
      `${chalk.bold('Name:')} ${chalk.cyan(variant.name)}`,
      `${chalk.bold('ID:')} ${chalk.dim(variant.id)}`,
      `${chalk.bold('Model:')} ${variant.snapshot.model}`,
      `${chalk.bold('Container:')} ${containerStatus}`,
      variant.description ? `${chalk.bold('Description:')} ${variant.description}` : '',
    ].filter(Boolean).join('\n'),
    'Active Variant'
  ));
}

/**
 * Get the currently active variant name, if any
 */
export function getActiveVariant(projectRoot: string): string | null {
  const fs = require('fs');
  const settingsPath = `${projectRoot}/.sniffbench/active-variant`;

  if (fs.existsSync(settingsPath)) {
    return fs.readFileSync(settingsPath, 'utf-8').trim();
  }

  return null;
}

// ============================================================================
// Plural commands (operate on MANY variants)
// ============================================================================

/**
 * Build all variants (or filtered subset)
 */
export async function variantsBuildCommand(options: {
  filter?: string;
  verbose?: boolean;
  claudeVersion?: string;
}): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);
  const allVariants = listVariants(store);

  if (allVariants.length === 0) {
    console.log(chalk.dim('\n  No variants registered.\n'));
    return;
  }

  // Filter variants if specified
  let variants = allVariants;
  if (options.filter) {
    const filterLower = options.filter.toLowerCase();
    variants = allVariants.filter(v =>
      v.name.toLowerCase().includes(filterLower) ||
      (v.description?.toLowerCase().includes(filterLower))
    );
  }

  if (variants.length === 0) {
    console.log(chalk.yellow(`\n  No variants match filter: ${options.filter}\n`));
    return;
  }

  // Check Docker availability
  const dockerAvailable = await checkDockerAvailable();
  if (!dockerAvailable) {
    console.log(chalk.red('\n  Docker is not available.'));
    console.log(chalk.dim('  Please install Docker and ensure it is running.\n'));
    return;
  }

  console.log(chalk.bold(`\n  Building ${variants.length} variant(s)...\n`));

  let built = 0;
  let failed = 0;

  for (const variant of variants) {
    process.stdout.write(`  ${variant.name}: `);

    try {
      // Get Claude version (same logic as singular variantBuildCommand)
      const rawVersion = options.claudeVersion
        || variant.snapshot.version
        || getHostClaudeVersion();
      const claudeVersion = rawVersion?.match(/(\d+\.\d+\.\d+)/)?.[1];

      if (!claudeVersion) {
        console.log(chalk.red(`✗ Could not determine Claude Code version`));
        console.log(chalk.dim(`    Use --claude-version to specify manually`));
        failed++;
        continue;
      }

      const result = await buildVariantImage({
        variant,
        projectRoot,
        claudeVersion,
        verbose: options.verbose,
      });

      // Update variant with container info and persist
      variant.container = result.containerInfo;
      saveVariants(projectRoot, store);

      console.log(chalk.green(`✓ Built (${result.imageName}:${result.imageTag})`));
      built++;
    } catch (err) {
      console.log(chalk.red(`✗ Failed: ${(err as Error).message}`));
      failed++;
    }
  }

  console.log(chalk.bold(`\n  Summary: ${built} built, ${failed} failed\n`));
}

/**
 * Prune all variant container images
 */
export async function variantsPruneCommand(options: { force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);
  const allVariants = listVariants(store);

  // Filter to only variants with containers
  const variantsWithContainers = allVariants.filter(v => v.container);

  if (variantsWithContainers.length === 0) {
    console.log(chalk.dim('\n  No variant containers to prune.\n'));
    return;
  }

  // Confirm unless --force
  if (!options.force) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.yellow(`\n  This will remove ${variantsWithContainers.length} container image(s):`));
    for (const v of variantsWithContainers) {
      console.log(chalk.dim(`    - ${v.name}: ${v.container!.imageName}:${v.container!.imageTag}`));
    }

    const answer = await new Promise<string>((resolve) => {
      rl.question(chalk.yellow(`\n  Continue? (y/N): `), resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log(chalk.dim('\n  Cancelled.\n'));
      return;
    }
  }

  console.log(chalk.bold(`\n  Pruning ${variantsWithContainers.length} container(s)...\n`));

  let pruned = 0;
  let failed = 0;

  for (const variant of variantsWithContainers) {
    process.stdout.write(`  ${variant.name}: `);

    try {
      const removed = pruneVariantImage(variant);
      if (removed) {
        // Clear container info
        variant.container = undefined;
        console.log(chalk.green('✓ Pruned'));
        pruned++;
      } else {
        variant.container = undefined;
        console.log(chalk.yellow('⚠ Already removed'));
        pruned++;
      }
    } catch (err) {
      console.log(chalk.red(`✗ Failed: ${(err as Error).message}`));
      failed++;
    }
  }

  // Save updated store
  saveVariants(projectRoot, store);

  console.log(chalk.bold(`\n  Summary: ${pruned} pruned, ${failed} failed\n`));
}

/**
 * Clean up stale variants (no container, or orphaned)
 */
export async function variantsCleanCommand(options: { force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const store = loadVariants(projectRoot);
  const allVariants = listVariants(store);

  // Find variants without containers (never built or pruned)
  const unbuiltVariants = allVariants.filter(v => !v.container);

  // Find variants with missing container images
  const missingImageVariants = allVariants.filter(v =>
    v.container && !variantImageExists(v)
  );

  const staleVariants = [...new Set([...unbuiltVariants, ...missingImageVariants])];

  if (staleVariants.length === 0) {
    console.log(chalk.green('\n  ✓ No stale variants found.\n'));
    return;
  }

  console.log(chalk.yellow(`\n  Found ${staleVariants.length} stale variant(s):\n`));
  for (const v of staleVariants) {
    const reason = !v.container ? 'never built' : 'image missing';
    console.log(chalk.dim(`    - ${v.name} (${reason})`));
  }

  // Confirm unless --force
  if (!options.force) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(chalk.yellow(`\n  Delete these variants? (y/N): `), resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log(chalk.dim('\n  Cancelled.\n'));
      return;
    }
  }

  let deleted = 0;
  for (const variant of staleVariants) {
    deleteVariant(store, variant.id);
    deleted++;
  }

  saveVariants(projectRoot, store);
  console.log(chalk.green(`\n  ✓ Deleted ${deleted} stale variant(s).\n`));
}
