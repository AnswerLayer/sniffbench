/**
 * Comparator Tests
 *
 * Tests for diff similarity algorithms and file overlap calculation.
 */

import { calculateDiffSimilarity, parseDiff } from '../comparator';

describe('calculateDiffSimilarity', () => {
  describe('identical diffs', () => {
    it('should return 1 for identical diffs', () => {
      const diff = `
diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,4 @@
+import { helper } from './helper';
 export function utils() {
   return true;
 }
`.trim();

      expect(calculateDiffSimilarity(diff, diff)).toBe(1);
    });

    it('should return 1 for empty diffs', () => {
      expect(calculateDiffSimilarity('', '')).toBe(1);
    });
  });

  describe('completely different diffs', () => {
    it('should return 0 when one diff is empty', () => {
      const diff = '+const x = 1;';
      expect(calculateDiffSimilarity(diff, '')).toBe(0);
      expect(calculateDiffSimilarity('', diff)).toBe(0);
    });

    it('should return low similarity for unrelated diffs', () => {
      const diff1 = '+const x = 1;\n+const y = 2;';
      const diff2 = '-function foo() {}\n-function bar() {}';

      const similarity = calculateDiffSimilarity(diff1, diff2);
      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe('similar diffs', () => {
    it('should return high similarity for diffs with minor differences', () => {
      const diff1 = `
+const x = 1;
+const y = 2;
+const z = 3;
`.trim();

      const diff2 = `
+const x = 1;
+const y = 2;
+const z = 4;
`.trim();

      const similarity = calculateDiffSimilarity(diff1, diff2);
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should handle whitespace normalization', () => {
      const diff1 = '+const x = 1;';
      const diff2 = '+const  x  =  1;';

      const similarity = calculateDiffSimilarity(diff1, diff2);
      expect(similarity).toBeGreaterThan(0.8);
    });
  });

  describe('partial overlap', () => {
    it('should calculate reasonable similarity for partial overlap', () => {
      const diff1 = `
+line 1
+line 2
+line 3
+line 4
+line 5
`.trim();

      const diff2 = `
+line 1
+line 2
+different line
+line 4
+line 5
`.trim();

      const similarity = calculateDiffSimilarity(diff1, diff2);
      expect(similarity).toBeGreaterThan(0.6);
      expect(similarity).toBeLessThan(1);
    });
  });
});

describe('parseDiff', () => {
  it('should extract additions from diff', () => {
    const diff = `
diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,5 @@
+import { helper } from './helper';
+
 export function utils() {
   return true;
 }
`.trim();

    const result = parseDiff(diff);
    expect(result.additions).toContain("import { helper } from './helper';");
    expect(result.additions).toContain('');
  });

  it('should extract deletions from diff', () => {
    const diff = `
diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,3 @@
-import { oldHelper } from './old';
-
 export function utils() {
   return true;
 }
`.trim();

    const result = parseDiff(diff);
    expect(result.deletions).toContain("import { oldHelper } from './old';");
  });

  it('should extract file paths', () => {
    const diff = `
diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,4 @@
+import { helper } from './helper';

diff --git a/src/helper.ts b/src/helper.ts
--- a/src/helper.ts
+++ b/src/helper.ts
@@ -1,1 +1,2 @@
+export const helper = () => {};
`.trim();

    const result = parseDiff(diff);
    expect(result.files).toContain('src/utils.ts');
    expect(result.files).toContain('src/helper.ts');
  });

  it('should handle empty diff', () => {
    const result = parseDiff('');
    expect(result.additions).toEqual([]);
    expect(result.deletions).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it('should not include diff headers as additions/deletions', () => {
    const diff = `
diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,2 @@
+new line
`.trim();

    const result = parseDiff(diff);
    expect(result.additions).not.toContain('++ b/file.ts');
    expect(result.deletions).not.toContain('-- a/file.ts');
  });

  it('should handle multiple hunks in same file', () => {
    const diff = `
diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
+first addition
 unchanged
 unchanged
@@ -10,3 +11,4 @@
+second addition
 more unchanged
`.trim();

    const result = parseDiff(diff);
    expect(result.additions).toContain('first addition');
    expect(result.additions).toContain('second addition');
    expect(result.files).toEqual(['file.ts']); // Only one file
  });
});
