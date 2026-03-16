## [1.0.4](https://github.com/answerlayer/sniffbench/compare/v1.0.3...v1.0.4) (2026-03-16)


### Bug Fixes

* add registry-url and remove auth token for OIDC ([9ca40b3](https://github.com/answerlayer/sniffbench/commit/9ca40b316cdcdba508b03af30b6d299cc0aceabd))

## [1.0.3](https://github.com/answerlayer/sniffbench/compare/v1.0.2...v1.0.3) (2026-03-16)


### Bug Fixes

* move npm publish to dedicated workflow step for OIDC ([7cd37e6](https://github.com/answerlayer/sniffbench/commit/7cd37e6be7c30941a6700cef485bf4a7a1feab75))

## [1.0.2](https://github.com/answerlayer/sniffbench/compare/v1.0.1...v1.0.2) (2026-03-16)


### Bug Fixes

* clear npm auth config to enable pure OIDC authentication ([94f3cbe](https://github.com/answerlayer/sniffbench/commit/94f3cbe4bbc23cb98ed0ec5c3b65779b932b3cba))

## [1.0.1](https://github.com/answerlayer/sniffbench/compare/v1.0.0...v1.0.1) (2026-03-14)


### Bug Fixes

* remove registry-url to allow pure OIDC auth ([ecdb4dc](https://github.com/answerlayer/sniffbench/commit/ecdb4dc4b02692aea573d076693e20cbd6afa348))

# 1.0.0 (2026-03-14)


### Bug Fixes

* add defensive check for modelUsage in result builder ([f8469e7](https://github.com/answerlayer/sniffbench/commit/f8469e701a3d1b3523a2258e330f05434094dc89))
* add defensive parsing with defaults in loadRuns ([aa60c80](https://github.com/answerlayer/sniffbench/commit/aa60c80dfff194b4e735dc6cc6869b021534f160))
* add node *.test.js to rubric test chain, update HANDOFF.md ([441ef67](https://github.com/answerlayer/sniffbench/commit/441ef67138dcc95cb83ac0308630cbd4799751da))
* add opencode config inline, fix score display, add agent invocation ([03df9a8](https://github.com/answerlayer/sniffbench/commit/03df9a8c7731d8e3cc142dd0a61034563083627e))
* address PR review feedback ([8d46f59](https://github.com/answerlayer/sniffbench/commit/8d46f59a7d97a0d895b3ae7bd8574ac2155b1519))
* address PR review feedback from CodeRabbit and human review ([f18fe3f](https://github.com/answerlayer/sniffbench/commit/f18fe3f705189b6de9f4e9eadc5e142cf3367155))
* avoid mutating input arrays in hashAgentConfig ([c4a8b96](https://github.com/answerlayer/sniffbench/commit/c4a8b965b3ee365172878b810e6e730ef6d137a9))
* **cli:** remove unused --variants flag from interview command ([5ebe05d](https://github.com/answerlayer/sniffbench/commit/5ebe05dffe96a3a8050a466fa386d23b8b175a1b))
* **cli:** use consistent parameter name for variant delete command ([85ce610](https://github.com/answerlayer/sniffbench/commit/85ce61044f7eb8b8c5e06cbc15182ba9b077d939))
* **cli:** use consistent parameter name for variant show command ([9ef8ee5](https://github.com/answerlayer/sniffbench/commit/9ef8ee5c5d8c0f3ef8f4ade34205551ea7989b79))
* **closed-issues:** add type guard for ClosedIssueCase validation ([d8c69dc](https://github.com/answerlayer/sniffbench/commit/d8c69dc2aa4a96e14bafc7cc32636455bac77989))
* **closed-issues:** log errors during bulk add instead of swallowing ([b88a72a](https://github.com/answerlayer/sniffbench/commit/b88a72a843583a2a16e5a0152cf2c3c54175025a))
* **comparator:** don't inflate scores when no tests available ([2b0fc24](https://github.com/answerlayer/sniffbench/commit/2b0fc2433aadf0c022d1250c37e9eb6193c5ff2c))
* **comparator:** use workdir in sandbox exec and remove unused agentFiles param ([b710f21](https://github.com/answerlayer/sniffbench/commit/b710f2134d0131e2e9a636d52f73bbaa22711ee0))
* **compare:** show pass rate delta in percentage points ([10489e4](https://github.com/answerlayer/sniffbench/commit/10489e4325102a9c1c9c987fa6ae1e6468da41dc))
* **compare:** use padVisible for ANSI-colored table alignment ([2eedb36](https://github.com/answerlayer/sniffbench/commit/2eedb36a5656a83057920c3361e9e34e9921a163))
* correct score normalization when optional-only criteria are excluded ([581a80c](https://github.com/answerlayer/sniffbench/commit/581a80ce127ef1f8a48e761a5b0da912a3be280c))
* default to failure for unverified evaluators, add HANDOFF.md ([1f555b2](https://github.com/answerlayer/sniffbench/commit/1f555b27ee77bd612ad8420970cad1198fa3d20e))
* detect AbortError without instanceof Error check ([2d5adfe](https://github.com/answerlayer/sniffbench/commit/2d5adfedfdabd99e374879a799c21ce090cc05b8))
* **extractor:** use hasTestFiles to infer fallback test command ([e5855ce](https://github.com/answerlayer/sniffbench/commit/e5855cebb074de13e3f6d0386d57d9d9d1c6973b))
* handle migration errors gracefully with user-friendly message ([dcb5d20](https://github.com/answerlayer/sniffbench/commit/dcb5d20bbe1ca897a78cf36d5bce1f7597161900))
* **interview:** remove duplicate '%' in cache hits metric display ([9dcd0e2](https://github.com/answerlayer/sniffbench/commit/9dcd0e222ee5d2a1a93fff74e6ec9255eacf79e1))
* **interview:** show unevaluated baselines as neutral state ([63f444d](https://github.com/answerlayer/sniffbench/commit/63f444d720ac6a2810851472d744fbb27dc6bf79))
* merge built-in and project-specific case directories ([a358598](https://github.com/answerlayer/sniffbench/commit/a35859862ebd176a6494e1054c8fbc376d8a039f))
* **metrics:** add missing outputTokens to BehaviorMetrics ([8fc1255](https://github.com/answerlayer/sniffbench/commit/8fc125592e337987ea84207f98c3e60d96adcedc))
* **metrics:** add outputTokens to all BehaviorMetrics interfaces ([4602298](https://github.com/answerlayer/sniffbench/commit/4602298a6c6104af78a8620b45b8cf10865049ae))
* prevent duplicate text output and show verbose tool calls ([ee05978](https://github.com/answerlayer/sniffbench/commit/ee0597845212043494a6d9570dc916f6704cc234))
* regenerate lockfile after removing randombytes ([a6943c2](https://github.com/answerlayer/sniffbench/commit/a6943c236eea65dfd0d892eee7afe0b38d3d4565))
* remove unused runAgentLocally function (lint error) ([ccfce82](https://github.com/answerlayer/sniffbench/commit/ccfce82462c785a38e0eddbb581beff90d8aa7ce))
* resolve SSE stream from correct property on subscribe result ([54a4b5c](https://github.com/answerlayer/sniffbench/commit/54a4b5c8ef23bbe6a45885589986d76935a1e04c))
* **runner:** fallback to unshallow when commit not reachable ([6fcf642](https://github.com/answerlayer/sniffbench/commit/6fcf64258841a1028ce2f1a66960178abd7aa384))
* **runner:** remove misleading functionalMatch heuristic ([72ea34c](https://github.com/answerlayer/sniffbench/commit/72ea34ce18ad3ce6135284d8e553baa934e5c843))
* **sandbox:** add systemPrompt preset to enable CLAUDE.md reading ([c74edca](https://github.com/answerlayer/sniffbench/commit/c74edcaa723ca2f886790a02b5502dcc67cee2d9))
* **sandbox:** don't write allowedTools to container settings.json ([8fc755f](https://github.com/answerlayer/sniffbench/commit/8fc755f97e15fcf39cb839491594c366ce32f06e))
* **sandbox:** isolate variant CLAUDE.md from host mount ([5a68fcb](https://github.com/answerlayer/sniffbench/commit/5a68fcb21639d13bc6b75b68042ca1a4bcd15c56))
* **sandbox:** mount workspace read-write so agent can make changes ([ff4a4e3](https://github.com/answerlayer/sniffbench/commit/ff4a4e323ca03c57d95a5d519caacd552c350709))
* **scanner:** query issues by ClosedEvent to find PRs without keywords ([c91e682](https://github.com/answerlayer/sniffbench/commit/c91e682fa5bae558efe3cff928897b424d531e62))
* **scoring:** use sensible defaults for unverified metrics ([df81009](https://github.com/answerlayer/sniffbench/commit/df8100945eb15e4f9ba033f675a35a279d8dc22f))
* **security:** prevent command injection in Docker image operations ([b401212](https://github.com/answerlayer/sniffbench/commit/b401212dc6aa61396604c84f2bae54f08dce6a3b))
* separate type-only imports and remove require() in tests ([21fe890](https://github.com/answerlayer/sniffbench/commit/21fe890c59bef5936eabdcee93d0a9997f71638d))
* spawn opencode server with correct cwd to fix empty responses ([2e481c4](https://github.com/answerlayer/sniffbench/commit/2e481c434db5d7dae6756fa6345e42aa661a12fd))
* support dynamic agent types in variant registration ([2c785b8](https://github.com/answerlayer/sniffbench/commit/2c785b848af7c883a4228bc6a5aabc14f3e0f9b6))
* switch to npm Trusted Publishing (OIDC) ([70e7e4b](https://github.com/answerlayer/sniffbench/commit/70e7e4b81f63493d9881807f6c6769a58b98d92b))
* table alignment with ANSI-colored strings ([5c75c9e](https://github.com/answerlayer/sniffbench/commit/5c75c9efc93b37b748bb3fdf91c3a92d814fa51c))
* update pnpm lockfile and fix test runner discovery ([16d48e2](https://github.com/answerlayer/sniffbench/commit/16d48e2add6b2a1d3c95b65f4c3e08c65d392af5))
* use Trusted Publishing with semantic-release ([5e23613](https://github.com/answerlayer/sniffbench/commit/5e23613044bdcec65e47f488a355ae6a07944214))
* use type-only import for AgentConfig in variants/types.ts ([0dd608a](https://github.com/answerlayer/sniffbench/commit/0dd608aee5bc935bafa32b7d2d14c935eb615ef9))
* use type-only import for Run and RunStore in store.ts ([cead0fe](https://github.com/answerlayer/sniffbench/commit/cead0fe7eef7ba1102609a1e6df5a05694ed1258))
* **variant-runner:** add --dangerously-skip-permissions for container execution ([c0355eb](https://github.com/answerlayer/sniffbench/commit/c0355eb617f86980451d01150a85510c1adefa67))
* **variant-runner:** fix container execution issues ([f880c6d](https://github.com/answerlayer/sniffbench/commit/f880c6dc94b917d387f7fcf1b3cd3d914cf177e7))
* **variants:** read version from registered config, fix version parsing ([d235377](https://github.com/answerlayer/sniffbench/commit/d2353773693aafa978d8f2c6a0763ca32b6d53a1))


### Features

* add --agent and --model flags to closed-issues run ([89f5f15](https://github.com/answerlayer/sniffbench/commit/89f5f151005b38137ef4487347217d6b594f3ed7))
* add --model CLI flag and save agent response in results ([57749cd](https://github.com/answerlayer/sniffbench/commit/57749cd15c95efb80c1fc89eb4d748aa46451250))
* add 15 bootstrap test cases for universal coding tasks ([#5](https://github.com/answerlayer/sniffbench/issues/5)) ([f58aecf](https://github.com/answerlayer/sniffbench/commit/f58aecfb8e81725e69ff3de9ded41b28d30f5bda))
* add agent behavior metrics ([#8](https://github.com/answerlayer/sniffbench/issues/8)) ([e157041](https://github.com/answerlayer/sniffbench/commit/e15704143f4321a4f60572bd0275b56ea1c01965))
* Add agent wrapper infrastructure and Claude Code integration ([3756650](https://github.com/answerlayer/sniffbench/commit/375665052545d4106132914e4cb780f09e502e00))
* Add colorful animated exploration spinner ([0feea21](https://github.com/answerlayer/sniffbench/commit/0feea213452fb2ebdda0a0f0f996dde867a05e57))
* add event streaming and sandbox file snapshots ([0a736ef](https://github.com/answerlayer/sniffbench/commit/0a736ef0b6ed78ce308af493f6ffe9e84347bb43))
* Add real-time streaming output for Claude Code agent ([83c5fe4](https://github.com/answerlayer/sniffbench/commit/83c5fe498ceb0a13f57a1d3c28c16435e38c9306))
* add release automation with npm publish and X changelog ([#47](https://github.com/answerlayer/sniffbench/issues/47)) ([e68caeb](https://github.com/answerlayer/sniffbench/commit/e68caeb76c132f7d2bb98f05d9d28db1eb4703b0))
* **cases:** add 12 comprehension cases and VALUES.md ([f79a937](https://github.com/answerlayer/sniffbench/commit/f79a937dc75ace1a40fc9059c22ca27751f8fae4))
* **cases:** implement case management system with rubrics ([8411cef](https://github.com/answerlayer/sniffbench/commit/8411cefb7e9d56096d5bfe9359ed581589e21db1))
* **cli:** add sniff interview command for comprehension evaluation ([ffe40d7](https://github.com/answerlayer/sniffbench/commit/ffe40d7f3f78ac617d5be82f51a54e042ee8622c))
* **closed-issues:** add --add flag for bulk case extraction ([c44aa90](https://github.com/answerlayer/sniffbench/commit/c44aa908dd0f7eae04295996ef4d6f39043db90a))
* **closed-issues:** add run storage, compare command, and env var handling ([4a4fffa](https://github.com/answerlayer/sniffbench/commit/4a4fffae0d3729ccc0922f96ca3317cbb7199476))
* **closed-issues:** capture PR review comments as evaluation checks ([43881ec](https://github.com/answerlayer/sniffbench/commit/43881ecd071d801b65d4263cb64e7f7095ae7186))
* **closed-issues:** implement closed issues case type for agent evaluation ([dcb2d1d](https://github.com/answerlayer/sniffbench/commit/dcb2d1d0bb963ac397b80e3349f830e02b1b8964)), closes [#123](https://github.com/answerlayer/sniffbench/issues/123) [#456](https://github.com/answerlayer/sniffbench/issues/456) [#24](https://github.com/answerlayer/sniffbench/issues/24) [#27](https://github.com/answerlayer/sniffbench/issues/27)
* **compare:** add cost, token, and time efficiency metrics ([89e1e4d](https://github.com/answerlayer/sniffbench/commit/89e1e4d8d74f544c6547f71ae24326baa6ef5a2e))
* **env:** add .sniffbench/.env file support for API keys ([175f8e3](https://github.com/answerlayer/sniffbench/commit/175f8e3c1cb6fecba93f96c3abc92d11e11d3e81))
* improve interview UX with live streaming and input timeout ([e1370a7](https://github.com/answerlayer/sniffbench/commit/e1370a7955e623841ffeaf64d40aa731b5da42d3))
* integrate Claude Agent SDK for objective metrics ([4ba906f](https://github.com/answerlayer/sniffbench/commit/4ba906f1e183c79d0b4e4f99bb144b123f016a35)), closes [#15](https://github.com/answerlayer/sniffbench/issues/15)
* **interview:** add --compare flag for baseline comparison ([f698256](https://github.com/answerlayer/sniffbench/commit/f698256cebd3037f4cc67ef8e9a116b20390b2ea)), closes [#12](https://github.com/answerlayer/sniffbench/issues/12)
* **interview:** always create runs, make --run label optional ([7c59051](https://github.com/answerlayer/sniffbench/commit/7c59051698256e32797409e86991438b4fd8b0a4))
* **interview:** replace 1-10 grading scale with binary pass/fail ([20406ee](https://github.com/answerlayer/sniffbench/commit/20406eeaaec7d48e24f3f5d136c1e02bb39b4a7a))
* **interview:** wire up sandboxed variant container execution ([3b848e4](https://github.com/answerlayer/sniffbench/commit/3b848e400228f71d8b912817b2bbf783d97d7399))
* **runs:** implement run tracking and variant registration (ANS-455) ([8e0bbbb](https://github.com/answerlayer/sniffbench/commit/8e0bbbb9b663182ec07dd424e3d6c29650f60b87))
* **sandbox:** add Docker sandboxing infrastructure for evaluations ([9f22e01](https://github.com/answerlayer/sniffbench/commit/9f22e01d243637f7081f28c9b72020300bae6a13))
* **sandbox:** use SDK-based execution in variant containers ([d441c86](https://github.com/answerlayer/sniffbench/commit/d441c863ab38038dc3d35129b1e502f346f1a313))
* **scanner:** support GitHub URLs and owner/repo format as input ([58787e6](https://github.com/answerlayer/sniffbench/commit/58787e6278cba40682a6e4bd52dc464e08471949))
* show Task tool details and improve thinking display ([afca5e3](https://github.com/answerlayer/sniffbench/commit/afca5e3a306b507cf6c586f5f46db97b30d3a5ea))
* **variant-runner:** add stream-json parsing for real-time output ([b6851a3](https://github.com/answerlayer/sniffbench/commit/b6851a369794ffd209699d39c9403bb50828263d))
* **variant:** add active command and fix interview display ([4ca16d4](https://github.com/answerlayer/sniffbench/commit/4ca16d422f444058009ae4c1022a92480cd55c13))
* **variants:** add container-based sandboxing for parallel A/B testing ([3ce2fa1](https://github.com/answerlayer/sniffbench/commit/3ce2fa1508b19a4f6e3eb1d05f05274dfcbbcbc6)), closes [#37](https://github.com/answerlayer/sniffbench/issues/37)
* **variants:** add variant column to runs list and CLI tool capture ([5615f16](https://github.com/answerlayer/sniffbench/commit/5615f1640860ed0b1c63266866bfe560b81fc20e))


### BREAKING CHANGES

* **interview:** Existing baselines with numeric grades are not
migrated. Users must delete .sniffbench/baselines.json and re-run
interviews.

Closes ANS-481
