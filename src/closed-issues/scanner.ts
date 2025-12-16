/**
 * GitHub Issue Scanner
 *
 * Scans a repository for closed issues with merged PRs that make
 * good candidates for agent evaluation cases.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import {
  ScanOptions,
  ScanResult,
  ClosedIssueSummary,
  CaseQuality,
  GitHubPR,
} from './types';
import { CaseDifficulty } from '../cases/types';

// =============================================================================
// Constants
// =============================================================================

/** Default maximum PR size (lines changed) */
const DEFAULT_MAX_PR_SIZE = 500;

/** Default maximum files changed */
const DEFAULT_MAX_FILES = 10;

/** Default minimum issue description length */
const MIN_DESCRIPTION_LENGTH = 50;

/** Default maximum issues to return */
const DEFAULT_MAX_ISSUES = 50;

/** Patterns that indicate test files */
const TEST_FILE_PATTERNS = [
  /test[s]?\//i,
  /spec[s]?\//i,
  /__tests__\//i,
  /\.test\.[jt]sx?$/i,
  /\.spec\.[jt]sx?$/i,
  /_test\.go$/i,
  /_test\.py$/i,
  /test_.*\.py$/i,
];

/** Keywords that link PRs to issues */
const ISSUE_LINK_PATTERNS = [
  /(?:closes?|closed|fix|fixes|fixed|resolves?|resolved)\s*#(\d+)/gi,
  /(?:closes?|closed|fix|fixes|fixed|resolves?|resolved)\s+(?:issue\s+)?#(\d+)/gi,
];

// =============================================================================
// Public API
// =============================================================================

/**
 * Scan a repository for closed issues suitable for agent evaluation
 *
 * @param options - Scan configuration options
 * @returns Array of scan results with quality metrics
 */
export async function scanForClosedIssues(options: ScanOptions): Promise<ScanResult[]> {
  const {
    repoPath,
    maxIssues = DEFAULT_MAX_ISSUES,
    maxPrSize = DEFAULT_MAX_PR_SIZE,
    maxFilesChanged = DEFAULT_MAX_FILES,
    since,
    requireTests = false,
    includeAll = false,
  } = options;

  // Get repository info
  const repoInfo = getRepoInfo(repoPath);
  if (!repoInfo) {
    throw new Error(`Could not determine repository info from ${repoPath}`);
  }

  // Fetch merged PRs with linked issues
  const prs = await fetchMergedPRsWithIssues(repoInfo, maxIssues * 2, since);

  const results: ScanResult[] = [];

  for (const pr of prs) {
    // Skip PRs without linked issues
    if (!pr.closingIssuesReferences?.nodes?.length) {
      continue;
    }

    // Get the first linked issue
    const issue = pr.closingIssuesReferences.nodes[0];

    // Check quality and filtering criteria
    const quality = calculateQuality(pr, issue.body);
    const excluded = getExclusionReason(pr, issue, options, quality);

    if (excluded && !includeAll) {
      continue;
    }

    // Detect language from PR files
    const language = await detectLanguage(repoInfo, pr.number);

    // Estimate difficulty from PR size
    const difficulty = estimateDifficulty(pr.additions + pr.deletions, pr.changedFiles);

    const summary: ClosedIssueSummary = {
      issueNumber: issue.number,
      issueTitle: issue.title,
      prNumber: pr.number,
      prTitle: pr.title,
      repo: `${repoInfo.owner}/${repoInfo.name}`,
      issueUrl: issue.url,
      prUrl: pr.url,
      mergedAt: new Date(pr.mergedAt!),
      language,
      difficulty,
    };

    results.push({
      issue: summary,
      quality,
      excluded,
    });

    if (results.length >= maxIssues) {
      break;
    }
  }

  // Sort by quality score descending
  results.sort((a, b) => b.quality.score - a.quality.score);

  return results;
}

/**
 * Extract linked issue number from PR body or branch name
 *
 * @param prBody - PR body/description text
 * @param branchName - PR branch name
 * @returns Issue number or null if not found
 */
export function extractLinkedIssue(prBody: string, branchName: string): number | null {
  // Try PR body first
  for (const pattern of ISSUE_LINK_PATTERNS) {
    // Reset regex lastIndex before use (global regex remembers position)
    pattern.lastIndex = 0;
    const match = pattern.exec(prBody);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  // Try branch name patterns
  // e.g., "issue-123-description", "fix/123-bug", "feature/GH-123"
  const branchPatterns = [
    /issue[_-]?(\d+)/i,
    /(?:fix|bug|feature|feat)[/_-](\d+)/i,
    /gh[_-]?(\d+)/i,
    /#(\d+)/,
  ];

  for (const pattern of branchPatterns) {
    const match = pattern.exec(branchName);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

// =============================================================================
// Internal Functions
// =============================================================================

interface RepoInfo {
  owner: string;
  name: string;
}

/**
 * Get repository owner and name from local git config
 */
function getRepoInfo(repoPath: string): RepoInfo | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();

    // Parse GitHub URL
    // Formats: https://github.com/owner/repo.git, git@github.com:owner/repo.git
    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)/);

    const match = httpsMatch || sshMatch;
    if (match) {
      return {
        owner: match[1],
        name: match[2].replace(/\.git$/, ''),
      };
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Fetch merged PRs with their linked issues using gh CLI
 */
async function fetchMergedPRsWithIssues(
  repo: RepoInfo,
  limit: number,
  since?: Date
): Promise<GitHubPR[]> {
  const query = `
    query($owner: String!, $name: String!, $first: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequests(
          states: MERGED
          first: $first
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          nodes {
            number
            title
            body
            state
            mergedAt
            mergeCommit { oid }
            baseRefName
            headRefName
            additions
            deletions
            changedFiles
            url
            author { login }
            closingIssuesReferences(first: 5) {
              nodes {
                number
                title
                body
                url
              }
            }
          }
        }
      }
    }
  `;

  try {
    const result = execSync(
      `gh api graphql -f query='${query.replace(/'/g, "\\'")}' ` +
        `-f owner='${repo.owner}' -f name='${repo.name}' -F first=${limit}`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    const data = JSON.parse(result);
    let prs: GitHubPR[] = data.data.repository.pullRequests.nodes;

    // Filter by date if specified
    if (since) {
      prs = prs.filter((pr) => pr.mergedAt && new Date(pr.mergedAt) >= since);
    }

    return prs;
  } catch (error) {
    throw new Error(`Failed to fetch PRs: ${(error as Error).message}`);
  }
}

/**
 * Calculate quality metrics for a PR/issue pair
 */
function calculateQuality(pr: GitHubPR, issueBody: string): CaseQuality {
  const prSize = pr.additions + pr.deletions;
  const filesChanged = pr.changedFiles;
  const descriptionLength = issueBody?.length || 0;

  // Check if PR has test files (we'll do a more thorough check later)
  const hasTests = pr.title.toLowerCase().includes('test') || pr.body?.toLowerCase().includes('test');

  // Calculate quality score (0-100)
  let score = 50; // Base score

  // Description quality (up to 20 points)
  if (descriptionLength >= 200) score += 20;
  else if (descriptionLength >= 100) score += 15;
  else if (descriptionLength >= MIN_DESCRIPTION_LENGTH) score += 10;

  // PR size penalty (ideal: 50-200 lines)
  if (prSize >= 50 && prSize <= 200) score += 20;
  else if (prSize >= 20 && prSize <= 300) score += 10;
  else if (prSize > 500) score -= 10;

  // Files changed penalty (ideal: 1-5 files)
  if (filesChanged >= 1 && filesChanged <= 5) score += 10;
  else if (filesChanged > 10) score -= 10;

  // Bonus for tests
  if (hasTests) score += 10;

  return {
    hasTests,
    descriptionLength,
    prSize,
    filesChanged,
    score: Math.max(0, Math.min(100, score)),
  };
}

/**
 * Determine if a PR/issue should be excluded and why
 */
function getExclusionReason(
  pr: GitHubPR,
  issue: { body: string },
  options: ScanOptions,
  quality: CaseQuality
): string | undefined {
  const { maxPrSize = DEFAULT_MAX_PR_SIZE, maxFilesChanged = DEFAULT_MAX_FILES, requireTests = false } = options;

  if (quality.prSize > maxPrSize) {
    return `PR too large: ${quality.prSize} lines (max: ${maxPrSize})`;
  }

  if (quality.filesChanged > maxFilesChanged) {
    return `Too many files: ${quality.filesChanged} (max: ${maxFilesChanged})`;
  }

  if (quality.descriptionLength < MIN_DESCRIPTION_LENGTH) {
    return `Issue description too short: ${quality.descriptionLength} chars (min: ${MIN_DESCRIPTION_LENGTH})`;
  }

  if (requireTests && !quality.hasTests) {
    return 'No tests detected in PR';
  }

  // Check for merge/revert commits
  if (pr.title.toLowerCase().startsWith('merge ')) {
    return 'Merge commit';
  }

  if (pr.title.toLowerCase().startsWith('revert ')) {
    return 'Revert commit';
  }

  return undefined;
}

/**
 * Detect primary language from PR files
 */
async function detectLanguage(repo: RepoInfo, prNumber: number): Promise<string> {
  try {
    const result = execSync(
      `gh pr view ${prNumber} --repo ${repo.owner}/${repo.name} --json files --jq '.files[].path'`,
      { encoding: 'utf-8' }
    );

    const files = result.trim().split('\n').filter(Boolean);
    const extensions = files.map((f) => path.extname(f).toLowerCase());

    // Count extensions
    const counts = new Map<string, number>();
    for (const ext of extensions) {
      counts.set(ext, (counts.get(ext) || 0) + 1);
    }

    // Map extensions to languages
    const extToLang: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
    };

    // Find most common extension that maps to a language
    let maxCount = 0;
    let language = 'unknown';

    for (const [ext, count] of counts) {
      if (extToLang[ext] && count > maxCount) {
        maxCount = count;
        language = extToLang[ext];
      }
    }

    return language;
  } catch {
    return 'unknown';
  }
}

/**
 * Estimate difficulty based on PR size and complexity
 */
function estimateDifficulty(linesChanged: number, filesChanged: number): CaseDifficulty {
  const complexity = linesChanged + filesChanged * 50;

  if (complexity < 100) return 'easy';
  if (complexity < 300) return 'medium';
  return 'hard';
}

/**
 * Check if a file path matches test file patterns
 */
export function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}
