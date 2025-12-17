/**
 * Case Extractor
 *
 * Extracts full case data from a closed issue and its associated PR,
 * including the reference solution (PR diff) and metadata.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import {
  ClosedIssueCase,
  ClosedIssueSource,
  ReferenceSolution,
  ClosedIssueSummary,
  GitHubPR,
  GitHubIssue,
  PRReviewComment,
} from './types';
import { CaseDifficulty } from '../cases/types';
import { isTestFile } from './scanner';

// =============================================================================
// Public API
// =============================================================================

/**
 * Extract a full case from a closed issue and PR
 *
 * @param issueRef - Issue reference (e.g., "owner/repo#123" or just "#123")
 * @param repoPath - Path to local repository clone
 * @returns The extracted closed issue case
 */
export async function extractCase(
  issueRef: string,
  repoPath: string
): Promise<ClosedIssueCase> {
  // Parse issue reference
  const parsed = parseIssueRef(issueRef, repoPath);

  // Fetch issue details
  const issue = await fetchIssue(parsed.owner, parsed.repo, parsed.issueNumber);

  // Find the PR that closed this issue
  const pr = await findClosingPR(parsed.owner, parsed.repo, parsed.issueNumber);
  if (!pr) {
    throw new Error(`No merged PR found that closes issue #${parsed.issueNumber}`);
  }

  // Get commit before PR merge
  const commitBefore = await getCommitBeforePR(parsed.owner, parsed.repo, pr, repoPath);

  // Get PR diff
  const diff = await getPRDiff(parsed.owner, parsed.repo, pr.number);

  // Get files changed
  const filesChanged = await getPRFiles(parsed.owner, parsed.repo, pr.number);

  // Detect test and lint commands
  const testCommand = detectTestCommand(repoPath, filesChanged);
  const lintCommand = detectLintCommand(repoPath);

  // Fetch PR review comments for use as evaluation checks
  const reviewComments = await fetchPRReviewComments(parsed.owner, parsed.repo, pr.number);

  // Detect language
  const language = detectLanguageFromFiles(filesChanged);

  // Estimate difficulty
  const difficulty = estimateDifficulty(pr.additions + pr.deletions, pr.changedFiles);

  // Build the case
  const closedIssue: ClosedIssueSource = {
    type: 'github',
    repoOwner: parsed.owner,
    repoName: parsed.repo,
    issueNumber: issue.number,
    prNumber: pr.number,
    commitBefore,
    commitAfter: pr.mergeCommit?.oid || '',
    issueUrl: issue.url,
    prUrl: pr.url,
    prBranch: pr.headRefName,
  };

  const referenceSolution: ReferenceSolution = {
    diff,
    filesChanged,
    additions: pr.additions,
    deletions: pr.deletions,
    testCommand,
    lintCommand,
    reviewComments: reviewComments.length > 0 ? reviewComments : undefined,
  };

  const caseData: ClosedIssueCase = {
    id: generateCaseId(parsed.owner, parsed.repo, issue.number),
    title: issue.title,
    prompt: buildPrompt(issue),
    source: 'closed_issue',
    language,
    difficulty,
    category: 'closed-issue',
    tags: extractTags(issue, pr),
    closedIssue,
    referenceSolution,
  };

  return caseData;
}

/**
 * Generate a unique case ID for a closed issue
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param issueNumber - Issue number
 * @returns Unique case ID
 */
export function generateCaseId(owner: string, repo: string, issueNumber: number): string {
  return `closed-issue-${owner}-${repo}-${issueNumber}`.toLowerCase();
}

/**
 * Save a case to a YAML file
 *
 * @param caseData - The case to save
 * @param outputDir - Directory to save to
 * @returns Path to the saved file
 */
export function saveCaseToYaml(caseData: ClosedIssueCase, outputDir: string): string {
  // Ensure directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const filePath = path.join(outputDir, `${caseData.id}.yaml`);

  // Convert to YAML-friendly format
  const yamlData = {
    id: caseData.id,
    title: caseData.title,
    prompt: caseData.prompt,
    source: caseData.source,
    language: caseData.language,
    difficulty: caseData.difficulty,
    category: caseData.category,
    tags: caseData.tags,
    closedIssue: caseData.closedIssue,
    referenceSolution: {
      ...caseData.referenceSolution,
      // Store diff separately to avoid YAML formatting issues
      diff: caseData.referenceSolution.diff,
    },
  };

  const yamlContent = YAML.stringify(yamlData, {
    lineWidth: 0, // Disable line wrapping
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });

  fs.writeFileSync(filePath, yamlContent);

  return filePath;
}

// =============================================================================
// Internal Functions
// =============================================================================

interface ParsedIssueRef {
  owner: string;
  repo: string;
  issueNumber: number;
}

/**
 * Parse an issue reference string
 */
function parseIssueRef(issueRef: string, repoPath: string): ParsedIssueRef {
  // Format: owner/repo#123 or #123 (uses current repo)
  const fullMatch = issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (fullMatch) {
    return {
      owner: fullMatch[1],
      repo: fullMatch[2],
      issueNumber: parseInt(fullMatch[3], 10),
    };
  }

  const shortMatch = issueRef.match(/^#?(\d+)$/);
  if (shortMatch) {
    // Get repo info from local git
    const repoInfo = getRepoInfo(repoPath);
    if (!repoInfo) {
      throw new Error(`Could not determine repository from ${repoPath}. Use full format: owner/repo#123`);
    }
    return {
      owner: repoInfo.owner,
      repo: repoInfo.name,
      issueNumber: parseInt(shortMatch[1], 10),
    };
  }

  throw new Error(`Invalid issue reference: ${issueRef}. Use format: owner/repo#123 or #123`);
}

/**
 * Get repository info from git remote
 */
function getRepoInfo(repoPath: string): { owner: string; name: string } | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();

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
    // Ignore
  }
  return null;
}

/**
 * Fetch issue details from GitHub
 */
async function fetchIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
  const result = execSync(
    `gh issue view ${issueNumber} --repo ${owner}/${repo} --json number,title,body,state,url,author,labels,createdAt,closedAt`,
    { encoding: 'utf-8' }
  );

  return JSON.parse(result);
}

/**
 * Find the PR that closed an issue
 */
async function findClosingPR(owner: string, repo: string, issueNumber: number): Promise<GitHubPR | null> {
  // Use GraphQL to find PRs that reference this issue
  const query = `
    query($owner: String!, $name: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $issueNumber) {
          timelineItems(itemTypes: [CLOSED_EVENT], first: 10) {
            nodes {
              ... on ClosedEvent {
                closer {
                  ... on PullRequest {
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
                  }
                }
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
        `-f owner='${owner}' -f name='${repo}' -F issueNumber=${issueNumber}`,
      { encoding: 'utf-8' }
    );

    const data = JSON.parse(result);
    const events = data.data.repository.issue?.timelineItems?.nodes || [];

    // Find the first merged PR that closed this issue
    for (const event of events) {
      const pr = event.closer;
      if (pr && pr.mergedAt) {
        return pr as GitHubPR;
      }
    }
  } catch {
    // Ignore and return null
  }

  return null;
}

/**
 * Get the commit SHA before the PR was merged
 */
async function getCommitBeforePR(
  owner: string,
  repo: string,
  pr: GitHubPR,
  repoPath?: string
): Promise<string> {
  if (!pr.mergeCommit?.oid) {
    throw new Error('PR has no merge commit');
  }

  // Try local git first if we have a repo path
  if (repoPath) {
    try {
      // Get the parent of the merge commit (the state before the PR)
      const result = execSync(`git rev-parse ${pr.mergeCommit.oid}^1`, {
        cwd: repoPath,
        encoding: 'utf-8',
      });
      return result.trim();
    } catch {
      // Fallback: try to find the base branch commit locally
      try {
        const result = execSync(`git merge-base ${pr.baseRefName} ${pr.mergeCommit.oid}`, {
          cwd: repoPath,
          encoding: 'utf-8',
        });
        return result.trim();
      } catch {
        // Continue to GitHub API fallback
      }
    }
  }

  // Fallback: use GitHub API to get the commit's parent
  try {
    const result = execSync(
      `gh api repos/${owner}/${repo}/commits/${pr.mergeCommit.oid} --jq '.parents[0].sha'`,
      { encoding: 'utf-8' }
    );
    const parentSha = result.trim();
    if (parentSha) {
      return parentSha;
    }
  } catch {
    // Continue to error
  }

  throw new Error(`Could not determine commit before PR #${pr.number}`);
}

/**
 * Get the diff for a PR
 */
async function getPRDiff(owner: string, repo: string, prNumber: number): Promise<string> {
  const result = execSync(`gh pr diff ${prNumber} --repo ${owner}/${repo}`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });

  return result;
}

/**
 * Get list of files changed in a PR
 */
async function getPRFiles(owner: string, repo: string, prNumber: number): Promise<string[]> {
  const result = execSync(
    `gh pr view ${prNumber} --repo ${owner}/${repo} --json files --jq '.files[].path'`,
    { encoding: 'utf-8' }
  );

  return result.trim().split('\n').filter(Boolean);
}

/**
 * Fetch PR review comments
 *
 * Gets both review comments (on specific lines) and general PR comments.
 * These can be used as evaluation checks to verify the agent addresses
 * the same concerns that reviewers raised.
 */
async function fetchPRReviewComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRReviewComment[]> {
  const comments: PRReviewComment[] = [];

  try {
    // Fetch review comments (comments on specific lines of code)
    const reviewResult = execSync(
      `gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --jq '.[] | {body, path, line, author: .user.login}'`,
      { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
    );

    for (const line of reviewResult.trim().split('\n').filter(Boolean)) {
      try {
        const comment = JSON.parse(line);
        if (comment.body && comment.path) {
          comments.push({
            body: comment.body,
            path: comment.path,
            line: comment.line || undefined,
            author: comment.author || 'unknown',
            isReview: true,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Ignore errors fetching review comments
  }

  try {
    // Fetch general PR comments (issue-style comments, not on specific lines)
    const issueResult = execSync(
      `gh api repos/${owner}/${repo}/issues/${prNumber}/comments --jq '.[] | {body, author: .user.login}'`,
      { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
    );

    for (const line of issueResult.trim().split('\n').filter(Boolean)) {
      try {
        const comment = JSON.parse(line);
        if (comment.body) {
          comments.push({
            body: comment.body,
            path: '', // General comments don't have a path
            author: comment.author || 'unknown',
            isReview: false,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Ignore errors fetching issue comments
  }

  return comments;
}

/**
 * Detect the test command for a repository
 */
function detectTestCommand(repoPath: string, filesChanged: string[]): string | undefined {
  // Check if any test files were changed
  const hasTestFiles = filesChanged.some(isTestFile);

  // Check for package.json
  const packageJsonPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.scripts?.test) {
        return 'npm test';
      }
    } catch {
      // Ignore
    }
  }

  // Check for pytest
  if (fs.existsSync(path.join(repoPath, 'pytest.ini')) || fs.existsSync(path.join(repoPath, 'pyproject.toml'))) {
    return 'pytest';
  }

  // Check for Go tests
  if (filesChanged.some((f) => f.endsWith('_test.go'))) {
    return 'go test ./...';
  }

  // Check for Makefile with test target
  const makefilePath = path.join(repoPath, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    const makefile = fs.readFileSync(makefilePath, 'utf-8');
    if (makefile.includes('test:')) {
      return 'make test';
    }
  }

  // Fallback: if test files exist, try to infer command from file types
  if (hasTestFiles) {
    const hasPythonTests = filesChanged.some((f) => f.includes('test') && f.endsWith('.py'));
    const hasJsTests = filesChanged.some((f) => f.includes('test') && (f.endsWith('.js') || f.endsWith('.ts')));

    if (hasPythonTests) return 'pytest';
    if (hasJsTests) return 'npm test';
  }

  return undefined;
}

/**
 * Detect the lint command for a repository
 */
function detectLintCommand(repoPath: string): string | undefined {
  // Check for package.json lint script
  const packageJsonPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.scripts?.lint) {
        return 'npm run lint';
      }
    } catch {
      // Ignore
    }
  }

  // Check for common linters
  if (fs.existsSync(path.join(repoPath, '.eslintrc.js')) || fs.existsSync(path.join(repoPath, '.eslintrc.json'))) {
    return 'npx eslint .';
  }

  if (fs.existsSync(path.join(repoPath, 'ruff.toml')) || fs.existsSync(path.join(repoPath, '.ruff.toml'))) {
    return 'ruff check .';
  }

  if (fs.existsSync(path.join(repoPath, '.flake8'))) {
    return 'flake8';
  }

  return undefined;
}

/**
 * Detect primary language from files changed
 */
function detectLanguageFromFiles(files: string[]): string {
  const extCounts = new Map<string, number>();

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
  }

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

  let maxCount = 0;
  let language = 'unknown';

  for (const [ext, count] of extCounts) {
    if (extToLang[ext] && count > maxCount) {
      maxCount = count;
      language = extToLang[ext];
    }
  }

  return language;
}

/**
 * Estimate difficulty based on changes
 */
function estimateDifficulty(linesChanged: number, filesChanged: number): CaseDifficulty {
  const complexity = linesChanged + filesChanged * 50;

  if (complexity < 100) return 'easy';
  if (complexity < 300) return 'medium';
  return 'hard';
}

/**
 * Build prompt from issue
 */
function buildPrompt(issue: GitHubIssue): string {
  let prompt = issue.body || issue.title;

  // Add title if body doesn't include it
  if (issue.body && !issue.body.includes(issue.title)) {
    prompt = `# ${issue.title}\n\n${issue.body}`;
  }

  return prompt;
}

/**
 * Extract tags from issue and PR
 */
function extractTags(issue: GitHubIssue, pr: GitHubPR): string[] {
  const tags: string[] = [];

  // Add issue labels as tags
  if (issue.labels?.nodes) {
    for (const label of issue.labels.nodes) {
      tags.push(label.name.toLowerCase().replace(/\s+/g, '-'));
    }
  }

  // Add some metadata tags
  if (pr.additions + pr.deletions < 50) {
    tags.push('small-pr');
  } else if (pr.additions + pr.deletions > 200) {
    tags.push('large-pr');
  }

  return tags;
}
