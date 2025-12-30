#!/usr/bin/env node

/**
 * Tweet release announcements to @sniffbench
 *
 * This script is called by the release workflow after semantic-release
 * successfully publishes a new version. It reads the changelog and posts
 * a formatted tweet announcing the release.
 *
 * Required environment variables:
 * - X_API_KEY: Twitter API key
 * - X_API_SECRET: Twitter API secret
 * - X_ACCESS_TOKEN: Twitter access token
 * - X_ACCESS_SECRET: Twitter access token secret
 * - NEW_VERSION: Version being released (set by workflow)
 */

const fs = require('fs');
const path = require('path');

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

  // Extract release highlights from CHANGELOG.md
  const highlights = extractHighlights();

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
 * Extract bullet points from the latest release in CHANGELOG.md
 */
function extractHighlights() {
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

  if (!fs.existsSync(changelogPath)) {
    console.log('CHANGELOG.md not found, using generic message');
    return [];
  }

  const content = fs.readFileSync(changelogPath, 'utf-8');

  // Find the first release section (## [version])
  const releaseMatch = content.match(/## \[\d+\.\d+\.\d+\][^\n]*\n([\s\S]*?)(?=## \[|$)/);

  if (!releaseMatch) {
    return [];
  }

  const releaseContent = releaseMatch[1];

  // Extract bullet points (### Features, ### Bug Fixes sections)
  const bullets = [];

  // Match feature items
  const featuresMatch = releaseContent.match(/### Features\n([\s\S]*?)(?=###|$)/);
  if (featuresMatch) {
    const featureItems = featuresMatch[1].match(/\* ([^\n]+)/g);
    if (featureItems) {
      bullets.push(...featureItems.slice(0, 2).map((item) => item.replace(/^\* /, '')));
    }
  }

  // Match bug fix items
  const fixesMatch = releaseContent.match(/### Bug Fixes\n([\s\S]*?)(?=###|$)/);
  if (fixesMatch) {
    const fixItems = fixesMatch[1].match(/\* ([^\n]+)/g);
    if (fixItems && bullets.length < 3) {
      bullets.push(...fixItems.slice(0, 3 - bullets.length).map((item) => item.replace(/^\* /, '')));
    }
  }

  // Clean up bullet text (remove commit refs, simplify)
  return bullets.map((b) => {
    // Remove commit hash references like ([abc1234](url))
    return b.replace(/\s*\(\[[a-f0-9]+\]\([^)]+\)\)/g, '').trim();
  });
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
