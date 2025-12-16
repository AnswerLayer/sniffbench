/**
 * Extractor Tests
 *
 * Tests for case ID generation and prompt extraction.
 */

import { generateCaseId } from '../extractor';

describe('generateCaseId', () => {
  it('should generate lowercase ID', () => {
    const id = generateCaseId('AnswerLayer', 'SniffBench', 123);
    expect(id).toBe('closed-issue-answerlayer-sniffbench-123');
  });

  it('should include owner, repo, and issue number', () => {
    const id = generateCaseId('owner', 'repo', 456);
    expect(id).toContain('owner');
    expect(id).toContain('repo');
    expect(id).toContain('456');
  });

  it('should use consistent prefix', () => {
    const id = generateCaseId('test', 'test', 1);
    expect(id.startsWith('closed-issue-')).toBe(true);
  });

  it('should handle special characters in owner/repo', () => {
    const id = generateCaseId('my-org', 'my-repo', 789);
    expect(id).toBe('closed-issue-my-org-my-repo-789');
  });

  it('should generate unique IDs for different issues', () => {
    const id1 = generateCaseId('owner', 'repo', 1);
    const id2 = generateCaseId('owner', 'repo', 2);
    expect(id1).not.toBe(id2);
  });

  it('should generate unique IDs for different repos', () => {
    const id1 = generateCaseId('owner', 'repo1', 1);
    const id2 = generateCaseId('owner', 'repo2', 1);
    expect(id1).not.toBe(id2);
  });

  it('should generate unique IDs for different owners', () => {
    const id1 = generateCaseId('owner1', 'repo', 1);
    const id2 = generateCaseId('owner2', 'repo', 1);
    expect(id1).not.toBe(id2);
  });
});
