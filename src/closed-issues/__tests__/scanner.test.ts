/**
 * Scanner Tests
 *
 * Tests for issue link parsing and PR filtering heuristics.
 */

import { extractLinkedIssue, isTestFile } from '../scanner';

describe('extractLinkedIssue', () => {
  describe('PR body patterns', () => {
    it('should extract issue from "Closes #123"', () => {
      expect(extractLinkedIssue('Closes #123', '')).toBe(123);
    });

    it('should extract issue from "closes #456"', () => {
      expect(extractLinkedIssue('closes #456', '')).toBe(456);
    });

    it('should extract issue from "Fixes #789"', () => {
      expect(extractLinkedIssue('Fixes #789', '')).toBe(789);
    });

    it('should extract issue from "fixes #101"', () => {
      expect(extractLinkedIssue('fixes #101', '')).toBe(101);
    });

    it('should extract issue from "Fixed #202"', () => {
      expect(extractLinkedIssue('Fixed #202', '')).toBe(202);
    });

    it('should extract issue from "Resolves #303"', () => {
      expect(extractLinkedIssue('Resolves #303', '')).toBe(303);
    });

    it('should extract issue from "resolves #404"', () => {
      expect(extractLinkedIssue('resolves #404', '')).toBe(404);
    });

    it('should extract issue from "Close #505"', () => {
      expect(extractLinkedIssue('Close #505', '')).toBe(505);
    });

    it('should extract first issue when multiple exist', () => {
      expect(extractLinkedIssue('Fixes #1, Closes #2', '')).toBe(1);
    });

    it('should extract issue with "issue" keyword', () => {
      expect(extractLinkedIssue('Closes issue #999', '')).toBe(999);
    });
  });

  describe('branch name patterns', () => {
    it('should extract issue from "issue-123-description"', () => {
      expect(extractLinkedIssue('', 'issue-123-fix-bug')).toBe(123);
    });

    it('should extract issue from "issue_456_description"', () => {
      expect(extractLinkedIssue('', 'issue_456_add_feature')).toBe(456);
    });

    it('should extract issue from "fix/789-something"', () => {
      expect(extractLinkedIssue('', 'fix/789-login-error')).toBe(789);
    });

    it('should extract issue from "bug-101-fix"', () => {
      expect(extractLinkedIssue('', 'bug-101-fix')).toBe(101);
    });

    it('should extract issue from "feature/202-new-thing"', () => {
      expect(extractLinkedIssue('', 'feature/202-new-thing')).toBe(202);
    });

    it('should extract issue from "feat-303-update"', () => {
      expect(extractLinkedIssue('', 'feat-303-update')).toBe(303);
    });

    it('should extract issue from "GH-404"', () => {
      expect(extractLinkedIssue('', 'GH-404-hotfix')).toBe(404);
    });

    it('should extract issue from "gh_505"', () => {
      expect(extractLinkedIssue('', 'gh_505_refactor')).toBe(505);
    });
  });

  describe('no match cases', () => {
    it('should return null for empty strings', () => {
      expect(extractLinkedIssue('', '')).toBeNull();
    });

    it('should return null for unrelated PR body', () => {
      expect(extractLinkedIssue('This is a great feature', '')).toBeNull();
    });

    it('should return null for branch without issue reference', () => {
      expect(extractLinkedIssue('', 'main')).toBeNull();
      expect(extractLinkedIssue('', 'develop')).toBeNull();
      expect(extractLinkedIssue('', 'feature/new-component')).toBeNull();
    });

    it('should return null for hash without number', () => {
      expect(extractLinkedIssue('See # for details', '')).toBeNull();
    });
  });

  describe('PR body takes precedence', () => {
    it('should prefer PR body over branch name', () => {
      expect(extractLinkedIssue('Fixes #100', 'issue-200-something')).toBe(100);
    });
  });
});

describe('isTestFile', () => {
  describe('JavaScript/TypeScript test files', () => {
    it('should match .test.ts files', () => {
      expect(isTestFile('src/utils.test.ts')).toBe(true);
    });

    it('should match .test.js files', () => {
      expect(isTestFile('lib/helper.test.js')).toBe(true);
    });

    it('should match .spec.ts files', () => {
      expect(isTestFile('components/Button.spec.ts')).toBe(true);
    });

    it('should match .spec.tsx files', () => {
      expect(isTestFile('components/Button.spec.tsx')).toBe(true);
    });

    it('should match files in __tests__ directory', () => {
      expect(isTestFile('src/__tests__/utils.ts')).toBe(true);
    });

    it('should match files in tests directory', () => {
      expect(isTestFile('tests/integration/api.ts')).toBe(true);
    });

    it('should match files in test directory', () => {
      expect(isTestFile('test/unit/helper.js')).toBe(true);
    });
  });

  describe('Python test files', () => {
    it('should match test_*.py files', () => {
      expect(isTestFile('tests/test_utils.py')).toBe(true);
    });

    it('should match *_test.py files', () => {
      expect(isTestFile('src/utils_test.py')).toBe(true);
    });
  });

  describe('Go test files', () => {
    it('should match _test.go files', () => {
      expect(isTestFile('pkg/handler_test.go')).toBe(true);
    });
  });

  describe('spec directory', () => {
    it('should match files in spec directory', () => {
      expect(isTestFile('spec/models/user_spec.rb')).toBe(true);
    });

    it('should match files in specs directory', () => {
      expect(isTestFile('specs/integration/api_spec.rb')).toBe(true);
    });
  });

  describe('non-test files', () => {
    it('should not match regular source files', () => {
      expect(isTestFile('src/utils.ts')).toBe(false);
    });

    it('should not match config files', () => {
      expect(isTestFile('jest.config.js')).toBe(false);
    });

    it('should not match files with test in name but not pattern', () => {
      expect(isTestFile('src/testUtils.ts')).toBe(false);
    });

    it('should not match markdown files', () => {
      expect(isTestFile('docs/testing.md')).toBe(false);
    });
  });
});
