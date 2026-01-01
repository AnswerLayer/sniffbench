#!/usr/bin/env node

/**
 * Tweet release announcements to @sniffbench
 *
 * This script is called by the release workflow after semantic-release
 * successfully publishes a new version. It reads commit messages since
 * the last release and posts a formatted tweet announcing the release.
 *
 * Required environment variables:
 * - X_API_KEY: Twitter API key
 * - X_API_SECRET: Twitter API secret
 * - X_ACCESS_TOKEN: Twitter access token
 * - X_ACCESS_SECRET: Twitter access token secret
 * - NEW_VERSION: Version being released (set by workflow)
 */

const { execSync } = require('child_process');

// Only import twitter-api-v2 if we have credentials
const hasCredentials =
  process.env.X_API_KEY &&
  process.env.X_API_SECRET &&
  process.env.X_ACCESS_TOKEN &&
  process.env.X_ACCESS_SECRET;

async function main() {
  const version = process.env.NEW_VERSION;

  if (!version) {
    console.log('No NEW_VERSION environment variable set, skipping tweet');
    process.exit(0);
  }

  if (!hasCredentials) {
    console.log('X API credentials not configured, skipping tweet');
    console.log('To enable: add X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET to GitHub secrets');
    process.exit(0);
  }

  // Extract release highlights from commit messages
  const highlights = extractHighlightsFromCommits();

  // Format the tweet
  const tweet = formatTweet(version, highlights);

  console.log('Posting tweet:');
  console.log('---');
  console.log(tweet);
  console.log('---');
  console.log(`Character count: ${tweet.length}/280`);

  if (tweet.length > 280) {
    console.error('Tweet exceeds 280 characters, truncating highlights');
    // Fallback to minimal tweet
    const minimalTweet = formatTweet(version, []);
    await postTweet(minimalTweet);
  } else {
    await postTweet(tweet);
  }
}

/**
 * Find the previous release tag
 */
function getPreviousTag() {
  try {
    // Get all version tags sorted by version number, take the second-to-last
    const tags = execSync('git tag -l "v*" --sort=-version:refname', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Return the previous tag (second in the list since current release tag is first)
    return tags.length > 1 ? tags[1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract highlights from commit messages since last release
 */
function extractHighlightsFromCommits() {
  const previousTag = getPreviousTag();

  let gitLogCmd;
  if (previousTag) {
    // Get commits since the previous tag
    gitLogCmd = `git log ${previousTag}..HEAD --oneline --no-merges`;
  } else {
    // No previous tag, get recent commits (limit to 20)
    gitLogCmd = 'git log -20 --oneline --no-merges';
  }

  let commits;
  try {
    commits = execSync(gitLogCmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
  } catch {
    console.log('Could not read git log, using generic message');
    return [];
  }

  const highlights = [];

  for (const commit of commits) {
    // Remove the commit hash prefix
    const message = commit.replace(/^[a-f0-9]+\s+/, '');

    // Extract feat: and fix: commits
    const featMatch = message.match(/^feat(?:\([^)]+\))?:\s*(.+)/i);
    const fixMatch = message.match(/^fix(?:\([^)]+\))?:\s*(.+)/i);

    if (featMatch && highlights.length < 3) {
      highlights.push(featMatch[1].trim());
    } else if (fixMatch && highlights.length < 3) {
      highlights.push(fixMatch[1].trim());
    }

    if (highlights.length >= 3) break;
  }

  return highlights;
}

/**
 * Format the tweet with version and highlights
 */
function formatTweet(version, highlights) {
  const lines = [`sniffbench v${version} released!`];

  if (highlights.length > 0) {
    lines.push('');
    highlights.forEach((h) => {
      // Truncate long highlights
      const truncated = h.length > 60 ? h.substring(0, 57) + '...' : h;
      lines.push(`- ${truncated}`);
    });
  }

  lines.push('');
  lines.push('npm i -g sniffbench');
  lines.push('');
  lines.push('#sniffbench #CodingAgents #DevTools');

  return lines.join('\n');
}

/**
 * Post tweet using Twitter API v2
 */
async function postTweet(text) {
  try {
    const { TwitterApi } = require('twitter-api-v2');

    const client = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_SECRET,
    });

    const response = await client.v2.tweet(text);
    console.log('Tweet posted successfully!');
    console.log(`Tweet ID: ${response.data.id}`);
  } catch (error) {
    console.error('Failed to post tweet:', error.message);
    // Don't fail the workflow if tweeting fails
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(0); // Don't fail workflow
});
