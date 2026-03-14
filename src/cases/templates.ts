/**
 * Case Generation Templates
 *
 * Templates that an LLM uses to generate repo-specific evaluation cases.
 * The LLM analyzes the codebase and creates targeted challenges based on what it discovers.
 */

// =============================================================================
// Template Types
// =============================================================================

/**
 * Available case generation template types
 */
export type TemplateType =
  | 'style-conformance'   // Find code that doesn't match project style
  | 'missing-coverage'    // Find public functions/methods without tests
  | 'duplication'         // Find duplicated code patterns
  | 'type-safety'         // Find weak/missing types in typed languages
  | 'dependency-updates'  // Find deprecated or outdated API usage;

/**
 * Template metadata
 */
export interface TemplateMetadata {
  /** Unique identifier */
  id: TemplateType;

  /** Human-readable name */
  name: string;

  /** Description of what this template finds and generates */
  description: string;

  /** Primary programming language this template targets */
  language?: string;

  /** Whether this template requires a codebase to analyze */
  requiresCodebase: boolean;

  /** Expected output format */
  outputFormat: 'yaml' | 'json';

  /** Example use case */
  example: string;
}

/**
 * Template configuration
 */
export interface TemplateConfig {
  /** Template type */
  type: TemplateType;

  /** Prompt to send to the LLM */
  prompt: string;

  /** Instructions for the LLM on how to structure output */
  outputInstructions: string;

  /** Validation rules for generated cases */
  validationRules: TemplateValidationRule[];

  /** Example of valid output (for few-shot prompting) */
  exampleOutput?: string;
}

/**
 * Validation rule for generated cases
 */
export interface TemplateValidationRule {
  /** Type of validation */
  type: 'required_field' | 'pattern' | 'range' | 'enum' | 'custom';

  /** Field to validate */
  field: string;

  /** Validation criteria */
  criteria: ValidationCriteria;

  /** Error message if validation fails */
  errorMessage: string;
}

/**
 * Validation criteria
 */
export interface ValidationCriteria {
  /** Required if true */
  required?: boolean;

  /** Pattern to match (regex) */
  pattern?: string;

  /** Minimum value (for numbers) */
  min?: number;

  /** Maximum value (for numbers) */
  max?: number;

  /** Allowed values (for enums) */
  enum?: string[];

  /** Custom validation function */
  custom?: (value: unknown) => boolean;
}

// =============================================================================
// Template Definitions
// =============================================================================

/**
 * All available case generation templates
 */
export const TEMPLATES: Record<TemplateType, TemplateMetadata> = {
  'style-conformance': {
    id: 'style-conformance',
    name: 'Style Conformance Detection',
    description: 'Analyzes codebase for style violations and generates cases asking agents to fix them. Detects naming convention mismatches, formatting inconsistencies, and pattern violations.',
    language: 'any',
    requiresCodebase: true,
    outputFormat: 'yaml',
    example: 'sniff generate --template style-conformance',
  },
  'missing-coverage': {
    id: 'missing-coverage',
    name: 'Missing Coverage Detection',
    description: 'Finds public functions and methods that lack test coverage. Generates cases asking agents to write tests for uncovered code paths.',
    language: 'any',
    requiresCodebase: true,
    outputFormat: 'yaml',
    example: 'sniff generate --template missing-coverage',
  },
  'duplication': {
    id: 'duplication',
    name: 'Duplication Detection',
    description: 'Identifies duplicated code patterns in the codebase. Generates cases asking agents to refactor duplicated code into reusable functions or classes.',
    language: 'any',
    requiresCodebase: true,
    outputFormat: 'yaml',
    example: 'sniff generate --template duplication',
  },
  'type-safety': {
    id: 'type-safety',
    name: 'Type Safety Gaps',
    description: 'For typed languages, finds code with weak or missing type annotations. Generates cases asking agents to add proper types and improve type safety.',
    language: 'typescript|javascript|python|java|go',
    requiresCodebase: true,
    outputFormat: 'yaml',
    example: 'sniff generate --template type-safety',
  },
  'dependency-updates': {
    id: 'dependency-updates',
    name: 'Dependency Updates',
    description: 'Finds deprecated or outdated API usage. Generates cases asking agents to update dependencies to their latest stable versions.',
    language: 'any',
    requiresCodebase: true,
    outputFormat: 'yaml',
    example: 'sniff generate --template dependency-updates',
  },
};

/**
 * Template prompts and configurations
 */
export const TEMPLATE_CONFIGS: Record<TemplateType, TemplateConfig> = {
  'style-conformance': {
    type: 'style-conformance',
    prompt: `Analyze this codebase and find code that doesn't match the project's style:

- Naming conventions that differ from the norm
- Formatting inconsistencies
- Pattern violations

For each finding, generate a case asking the agent to fix it.

The case should:
1. Clearly describe the style violation
2. Provide the problematic code snippet
3. Specify the expected style/convention
4. Include tests that validate the fix

Return the cases in YAML format, one per file.`,
    outputInstructions: `Output Format:
- Return a YAML array of case definitions
- Each case must have: id, title, prompt, files, source, language, difficulty, category, tags
- Use "codefix" as the category
- Set difficulty based on complexity (easy/medium/hard)
- Include the problematic code in the files section
- Include tests that verify the style fix

Example case structure:
\`\`\`yaml
id: style-conformance-001
title: "Fix camelCase variable naming"
prompt: |
  The following code uses snake_case for a variable that should be camelCase
  according to the project's naming conventions. Fix the variable name and
  update all references.

  Current code:
  \`\`\`python
  user_name = "John"
  \`\`\`

  Expected: user_name should be camelCase
files:
  - path: example.py
    content: |
      # TODO: Fix variable naming to use camelCase
      user_name = "John"
      print(f"Hello, {user_name}")
source: generated
language: python
difficulty: easy
category: codefix
tags:
  - style
  - naming
\`\`\``,
    validationRules: [
      {
        type: 'required_field',
        field: 'id',
        criteria: { required: true, pattern: '^[a-z0-9-]+$' },
        errorMessage: 'Case ID must contain only lowercase letters, numbers, and hyphens',
      },
      {
        type: 'required_field',
        field: 'title',
        criteria: { required: true },
        errorMessage: 'Case title is required',
      },
      {
        type: 'required_field',
        field: 'prompt',
        criteria: { required: true },
        errorMessage: 'Case prompt is required',
      },
      {
        type: 'required_field',
        field: 'files',
        criteria: { required: true },
        errorMessage: 'Case files are required',
      },
      {
        type: 'required_field',
        field: 'source',
        criteria: { required: true, enum: ['generated'] },
        errorMessage: 'Case source must be "generated"',
      },
      {
        type: 'required_field',
        field: 'language',
        criteria: { required: true },
        errorMessage: 'Case language is required',
      },
      {
        type: 'required_field',
        field: 'difficulty',
        criteria: { required: true, enum: ['easy', 'medium', 'hard'] },
        errorMessage: 'Case difficulty must be easy, medium, or hard',
      },
      {
        type: 'required_field',
        field: 'category',
        criteria: { required: true },
        errorMessage: 'Case category is required',
      },
      {
        type: 'pattern',
        field: 'prompt',
        criteria: { pattern: 'style|convention|naming|formatting' },
        errorMessage: 'Prompt should mention style or conventions',
      },
    ],
  },
  'missing-coverage': {
    type: 'missing-coverage',
    prompt: `Find public functions and methods in this codebase that lack test coverage.

For each uncovered function, generate a case asking the agent to write tests.

The case should:
1. Identify the function/method to test
2. Describe what the function does
3. Provide the function code
4. Include a test file with tests for that function
5. Ensure tests cover edge cases and error conditions

Return the cases in YAML format, one per file.`,
    outputInstructions: `Output Format:
- Return a YAML array of case definitions
- Each case must have: id, title, prompt, files, source, language, difficulty, category, tags
- Use "testing" as the category
- Set difficulty based on complexity (easy/medium/hard)
- Include the function to test in the files section
- Include a test file with comprehensive tests

Example case structure:
\`\`\`yaml
id: missing-coverage-001
title: "Write tests for calculate_discount"
prompt: |
  The calculate_discount function has no tests. Write comprehensive tests
  that cover:
  - Normal case with valid input
  - Edge case with zero discount
  - Edge case with maximum discount
  - Error case with negative input

  Function to test:
  \`\`\`python
  def calculate_discount(price, discount_percent):
      if discount_percent < 0 or discount_percent > 100:
          raise ValueError("Discount must be between 0 and 100")
      return price * (1 - discount_percent / 100)
  \`\`\`

  Create a test file that imports and tests this function.
source: generated
language: python
difficulty: medium
category: testing
tags:
  - testing
  - coverage
files:
  - path: discount.py
    content: |
      def calculate_discount(price, discount_percent):
          if discount_percent < 0 or discount_percent > 100:
              raise ValueError("Discount must be between 0 and 100")
          return price * (1 - discount_percent / 100)
  - path: test_discount.py
    content: |
      import unittest
      from discount import calculate_discount

      class TestCalculateDiscount(unittest.TestCase):
          def test_normal_case(self):
              self.assertEqual(calculate_discount(100, 10), 90)

          def test_zero_discount(self):
              self.assertEqual(calculate_discount(100, 0), 100)

          def test_max_discount(self):
              self.assertEqual(calculate_discount(100, 100), 0)

          def test_negative_discount(self):
              with self.assertRaises(ValueError):
                  calculate_discount(100, -10)

          def test_over_100_discount(self):
              with self.assertRaises(ValueError):
                  calculate_discount(100, 110)
\`\`\``,
    validationRules: [
      {
        type: 'required_field',
        field: 'id',
        criteria: { required: true, pattern: '^[a-z0-9-]+$' },
        errorMessage: 'Case ID must contain only lowercase letters, numbers, and hyphens',
      },
      {
        type: 'required_field',
        field: 'title',
        criteria: { required: true },
        errorMessage: 'Case title is required',
      },
      {
        type: 'required_field',
        field: 'prompt',
        criteria: { required: true },
        errorMessage: 'Case prompt is required',
      },
      {
        type: 'required_field',
        field: 'files',
        criteria: { required: true },
        errorMessage: 'Case files are required',
      },
      {
        type: 'required_field',
        field: 'source',
        criteria: { required: true, enum: ['generated'] },
        errorMessage: 'Case source must be "generated"',
      },
      {
        type: 'required_field',
        field: 'language',
        criteria: { required: true },
        errorMessage: 'Case language is required',
      },
      {
        type: 'required_field',
        field: 'difficulty',
        criteria: { required: true, enum: ['easy', 'medium', 'hard'] },
        errorMessage: 'Case difficulty must be easy, medium, or hard',
      },
      {
        type: 'required_field',
        field: 'category',
        criteria: { required: true },
        errorMessage: 'Case category is required',
      },
      {
        type: 'pattern',
        field: 'prompt',
        criteria: { pattern: 'test|coverage|function' },
        errorMessage: 'Prompt should mention testing or coverage',
      },
    ],
  },
  'duplication': {
    type: 'duplication',
    prompt: `Find duplicated code patterns in this codebase.

For each duplicated code block, generate a case asking the agent to refactor it
into a reusable function or class.

The case should:
1. Identify the duplicated code
2. Show both occurrences
3. Describe the common functionality
4. Provide a refactored version that extracts the common logic
5. Include tests to verify the refactored version works correctly

Return the cases in YAML format, one per file.`,
    outputInstructions: `Output Format:
- Return a YAML array of case definitions
- Each case must have: id, title, prompt, files, source, language, difficulty, category, tags
- Use "refactor" as the category
- Set difficulty based on complexity (easy/medium/hard)
- Include both original files and refactored version
- Include tests for the refactored code

Example case structure:
\`\`\`yaml
id: duplication-001
title: "Extract common validation logic"
prompt: |
  The following two functions contain duplicated validation logic.
  Extract the common validation into a separate function.

  Function 1:
  \`\`\`python
  def validate_email(email):
      if not email or '@' not in email:
          return False
      if len(email) > 254:
          return False
      return True
  \`\`\`

  Function 2:
  \`\`\`python
  def validate_username(username):
      if not username or len(username) < 3:
          return False
      if len(username) > 20:
          return False
      return True
  \`\`\`

  Create a validate function that can be used by both.
source: generated
language: python
difficulty: medium
category: refactor
tags:
  - duplication
  - refactoring
files:
  - path: user_validation.py
    content: |
      # TODO: Extract common validation logic
      def validate_email(email):
          if not email or '@' not in email:
              return False
          if len(email) > 254:
              return False
          return True

      def validate_username(username):
          if not username or len(username) < 3:
              return False
          if len(username) > 20:
              return False
          return True
  - path: test_validation.py
    content: |
      import unittest
      from user_validation import validate_email, validate_username

      class TestValidation(unittest.TestCase):
          def test_valid_email(self):
              self.assertTrue(validate_email("test@example.com"))

          def test_invalid_email_no_at(self):
              self.assertFalse(validate_email("testexample.com"))

          def test_valid_username(self):
              self.assertTrue(validate_username("john_doe"))

          def test_invalid_username_too_short(self):
              self.assertFalse(validate_username("ab"))
\`\`\``,
    validationRules: [
      {
        type: 'required_field',
        field: 'id',
        criteria: { required: true, pattern: '^[a-z0-9-]+$' },
        errorMessage: 'Case ID must contain only lowercase letters, numbers, and hyphens',
      },
      {
        type: 'required_field',
        field: 'title',
        criteria: { required: true },
        errorMessage: 'Case title is required',
      },
      {
        type: 'required_field',
        field: 'prompt',
        criteria: { required: true },
        errorMessage: 'Case prompt is required',
      },
      {
        type: 'required_field',
        field: 'files',
        criteria: { required: true },
        errorMessage: 'Case files are required',
      },
      {
        type: 'required_field',
        field: 'source',
        criteria: { required: true, enum: ['generated'] },
        errorMessage: 'Case source must be "generated"',
      },
      {
        type: 'required_field',
        field: 'language',
        criteria: { required: true },
        errorMessage: 'Case language is required',
      },
      {
        type: 'required_field',
        field: 'difficulty',
        criteria: { required: true, enum: ['easy', 'medium', 'hard'] },
        errorMessage: 'Case difficulty must be easy, medium, or hard',
      },
      {
        type: 'required_field',
        field: 'category',
        criteria: { required: true },
        errorMessage: 'Case category is required',
      },
      {
        type: 'pattern',
        field: 'prompt',
        criteria: { pattern: 'duplicate|refactor|extract' },
        errorMessage: 'Prompt should mention duplication or refactoring',
      },
    ],
  },
  'type-safety': {
    type: 'type-safety',
    prompt: `Find code with weak or missing type annotations in this codebase.

For each type safety issue, generate a case asking the agent to add proper types.

The case should:
1. Identify the function/method with missing/weak types
2. Show the current code
3. Specify the expected types for parameters and return values
4. Add proper type annotations
5. Ensure the code still works correctly after adding types

Return the cases in YAML format, one per file.`,
    outputInstructions: `Output Format:
- Return a YAML array of case definitions
- Each case must have: id, title, prompt, files, source, language, difficulty, category, tags
- Use "type-safety" as the category
- Set difficulty based on complexity (easy/medium/hard)
- Include the function with type annotations
- Ensure the code compiles and runs correctly

Example case structure:
\`\`\`yaml
id: type-safety-001
title: "Add type annotations to calculate_sum"
prompt: |
  The calculate_sum function is missing type annotations. Add proper
  type hints for the parameters and return value.

  Current code:
  \`\`\`python
  def calculate_sum(numbers):
      return sum(numbers)
  \`\`\`

  Add type hints: numbers should be List[int] and return type should be int.
source: generated
language: python
difficulty: easy
category: type-safety
tags:
  - types
  - type-hints
files:
  - path: math_utils.py
    content: |
      # TODO: Add type annotations
      def calculate_sum(numbers):
          return sum(numbers)
  - path: test_math.py
    content: |
      import unittest
      from math_utils import calculate_sum

      class TestCalculateSum(unittest.TestCase):
          def test_sum_of_numbers(self):
              self.assertEqual(calculate_sum([1, 2, 3, 4, 5]), 15)

          def test_empty_list(self):
              self.assertEqual(calculate_sum([]), 0)

          def test_single_number(self):
              self.assertEqual(calculate_sum([42]), 42)
\`\`\``,
    validationRules: [
      {
        type: 'required_field',
        field: 'id',
        criteria: { required: true, pattern: '^[a-z0-9-]+$' },
        errorMessage: 'Case ID must contain only lowercase letters, numbers, and hyphens',
      },
      {
        type: 'required_field',
        field: 'title',
        criteria: { required: true },
        errorMessage: 'Case title is required',
      },
      {
        type: 'required_field',
        field: 'prompt',
        criteria: { required: true },
        errorMessage: 'Case prompt is required',
      },
      {
        type: 'required_field',
        field: 'files',
        criteria: { required: true },
        errorMessage: 'Case files are required',
      },
      {
        type: 'required_field',
        field: 'source',
        criteria: { required: true, enum: ['generated'] },
        errorMessage: 'Case source must be "generated"',
      },
      {
        type: 'required_field',
        field: 'language',
        criteria: { required: true },
        errorMessage: 'Case language is required',
      },
      {
        type: 'required_field',
        field: 'difficulty',
        criteria: { required: true, enum: ['easy', 'medium', 'hard'] },
        errorMessage: 'Case difficulty must be easy, medium, or hard',
      },
      {
        type: 'required_field',
        field: 'category',
        criteria: { required: true },
        errorMessage: 'Case category is required',
      },
      {
        type: 'pattern',
        field: 'prompt',
        criteria: { pattern: 'type|annotation|type-hint' },
        errorMessage: 'Prompt should mention types or type annotations',
      },
    ],
  },
  'dependency-updates': {
    type: 'dependency-updates',
    prompt: `Find deprecated or outdated API usage in this codebase.

For each deprecated API, generate a case asking the agent to update to the
latest stable version.

The case should:
1. Identify the deprecated API usage
2. Show the current code
3. Specify the new API to use
4. Update the code to use the new API
5. Ensure the code still works correctly after the update

Return the cases in YAML format, one per file.`,
    outputInstructions: `Output Format:
- Return a YAML array of case definitions
- Each case must have: id, title, prompt, files, source, language, difficulty, category, tags
- Use "dependency" as the category
- Set difficulty based on complexity (easy/medium/hard)
- Include the updated code
- Ensure the code compiles and runs correctly

Example case structure:
\`\`\`yaml
id: dependency-updates-001
title: "Update deprecated os.path.join usage"
prompt: |
  The code uses os.path.join which is deprecated. Update to use the
  pathlib.Path.joinpath method instead.

  Current code:
  \`\`\`python
  import os
  def get_file_path(filename):
      return os.path.join("data", "files", filename)
  \`\`\`

  Update to use pathlib.Path.joinpath.
source: generated
language: python
difficulty: easy
category: dependency
tags:
  - dependency
  - deprecation
files:
  - path: file_utils.py
    content: |
      # TODO: Update deprecated os.path.join
      import os
      def get_file_path(filename):
          return os.path.join("data", "files", filename)
  - path: test_file_utils.py
    content: |
      import unittest
      from file_utils import get_file_path

      class TestGetFilePath(unittest.TestCase):
          def test_file_path(self):
              self.assertEqual(get_file_path("test.txt"), "data/files/test.txt")
\`\`\``,
    validationRules: [
      {
        type: 'required_field',
        field: 'id',
        criteria: { required: true, pattern: '^[a-z0-9-]+$' },
        errorMessage: 'Case ID must contain only lowercase letters, numbers, and hyphens',
      },
      {
        type: 'required_field',
        field: 'title',
        criteria: { required: true },
        errorMessage: 'Case title is required',
      },
      {
        type: 'required_field',
        field: 'prompt',
        criteria: { required: true },
        errorMessage: 'Case prompt is required',
      },
      {
        type: 'required_field',
        field: 'files',
        criteria: { required: true },
        errorMessage: 'Case files are required',
      },
      {
        type: 'required_field',
        field: 'source',
        criteria: { required: true, enum: ['generated'] },
        errorMessage: 'Case source must be "generated"',
      },
      {
        type: 'required_field',
        field: 'language',
        criteria: { required: true },
        errorMessage: 'Case language is required',
      },
      {
        type: 'required_field',
        field: 'difficulty',
        criteria: { required: true, enum: ['easy', 'medium', 'hard'] },
        errorMessage: 'Case difficulty must be easy, medium, or hard',
      },
      {
        type: 'required_field',
        field: 'category',
        criteria: { required: true },
        errorMessage: 'Case category is required',
      },
      {
        type: 'pattern',
        field: 'prompt',
        criteria: { pattern: 'deprecated|update|api' },
        errorMessage: 'Prompt should mention deprecation or updates',
      },
    ],
  },
};

// =============================================================================
// Template Validation
// =============================================================================

/**
 * Validation result for generated cases
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate generated case against template rules
 */
export function validateGeneratedCase(
  caseData: unknown,
  templateType: TemplateType
): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = TEMPLATE_CONFIGS[templateType];

  if (!config) {
    return { valid: false, errors: ['Template not found'], warnings: [] };
  }

  if (!caseData || typeof caseData !== 'object') {
    errors.push('Generated case must be an object');
    return { valid: false, errors, warnings };
  }

  const obj = caseData as Record<string, unknown>;

  // Validate against all rules
  for (const rule of config.validationRules) {
    const result = validateRule(obj, rule);
    if (result.error) {
      errors.push(result.error);
    }
    if (result.warning) {
      warnings.push(result.warning);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a single rule
 */
function validateRule(
  obj: Record<string, unknown>,
  rule: TemplateValidationRule
): { error?: string; warning?: string } {
  const value = obj[rule.field];

  // Check required (reject undefined, null, and empty string)
  if (rule.criteria.required && (value === undefined || value === null || value === '')) {
    return { error: `${rule.field} is required` };
  }

  // Skip validation if value is not present and not required
  if (value === undefined || value === null) {
    return {};
  }

  // Check pattern
  if (rule.criteria.pattern && typeof value === 'string') {
    const regex = new RegExp(rule.criteria.pattern);
    if (!regex.test(value)) {
      return { error: `${rule.field} does not match required pattern` };
    }
  }

  // Check enum
  if (rule.criteria.enum) {
    if (typeof value !== 'string') {
      return { error: `${rule.field} must be a string` };
    }
    if (!rule.criteria.enum.includes(value)) {
      return { error: `${rule.field} must be one of: ${rule.criteria.enum.join(', ')}` };
    }
  }

  // Check range (for numbers)
  if (rule.criteria.min !== undefined && typeof value === 'number' && value < rule.criteria.min) {
    return { error: `${rule.field} must be at least ${rule.criteria.min}` };
  }

  if (rule.criteria.max !== undefined && typeof value === 'number' && value > rule.criteria.max) {
    return { error: `${rule.field} must be at most ${rule.criteria.max}` };
  }

  // Check custom validation
  if (rule.criteria.custom && !rule.criteria.custom(value)) {
    return { error: `${rule.field} failed custom validation` };
  }

  return {};
}

// =============================================================================
// Template Utilities
// =============================================================================

/**
 * Get template by type
 */
export function getTemplate(type: TemplateType): TemplateMetadata | undefined {
  return TEMPLATES[type];
}

/**
 * Get all template types
 */
export function getAllTemplateTypes(): TemplateType[] {
  return Object.keys(TEMPLATES) as TemplateType[];
}

/**
 * Get template config
 */
export function getTemplateConfig(type: TemplateType): TemplateConfig | undefined {
  return TEMPLATE_CONFIGS[type];
}

/**
 * Check if a template is available
 */
export function isTemplateAvailable(type: string): type is TemplateType {
  return type in TEMPLATES;
}
