// Main exports for programmatic use
export { initCommand } from './cli/commands/init';
export { runCommand } from './cli/commands/run';
export { addCommand } from './cli/commands/add';
export { compareCommand } from './cli/commands/compare';
export { reportCommand } from './cli/commands/report';
export {
  casesListCommand,
  casesShowCommand,
  casesCategoriesCommand,
  casesLanguagesCommand,
} from './cli/commands/cases';
export { statusCommand } from './cli/commands/status';
export { doctorCommand } from './cli/commands/doctor';

// Sandbox module for programmatic use
export * from './sandbox';

// Cases module for programmatic use
export * from './cases';

// Evaluation module for programmatic use
export * from './evaluation';
