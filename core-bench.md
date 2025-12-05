Nice—good choice of paper. I read the CORE-Bench paper and its repo and pulled out the concrete details you asked for (schema of cases/solutions, scoring, and technical implementation). Below is a tight, reference-backed summary with the exact implementation pointers you’ll need to reproduce or extend the benchmark.

---

# Quick high-level summary

CORE-Bench is a reproducibility benchmark of **270 tasks** derived from **90 CodeOcean capsules (papers)** across computer science, social science, and medicine. Each paper yields three difficulty levels (Easy, Medium, Hard). The authors release a harness (manager/worker) that spins up isolated VMs (or Docker locally) to run agents in parallel and evaluate their answers. ([ar5iv][1])

---

# 1) Schema of evaluation *cases* (what a task contains)

Each task in CORE-Bench corresponds to a CodeOcean “capsule” and includes:

* **Metadata + task prompt(s)**: a short natural-language prompt and one or more *task questions* that ask for specific outputs produced by running the capsule (e.g., “report test accuracy at epoch 10”, or “from Figure 3 panel A report the label of the green line”). Tasks were manually constructed by inspecting a successful run’s results folder. The dataset JSON files contain these prompts/questions and other per-task metadata. ([ar5iv][1])
* **Modalities**: language-only questions and vision questions (figures/plots). Some tasks include both. ([ar5iv][1])
* **Per-paper: three difficulty variants (the “ladder”)**:

  * **CORE-Bench-Easy**: the agent is provided the full code *output* (i.e., results as if code already ran). Agent must extract answers from provided outputs.
  * **CORE-Bench-Medium**: the agent is provided the **Dockerfile** plus README (so it must run Docker and extract outputs).
  * **CORE-Bench-Hard**: the agent gets only the README (no Dockerfile or precomputed outputs); it must install dependencies, figure out and run the correct commands, produce outputs, then answer the questions.
    (All three levels use the same question set for a paper.) ([ar5iv][1])

---

# 2) Schema of *solutions* (what agents must return)

* Agents must produce a structured report file (the repo uses a `report.json` style submission) containing the answers for all task questions and the required keys. The harness enforces a programmatic check that the submission file has the correct keys/format before evaluating. CORE-Agent added this programmatic check as a key modification. ([ar5iv][1])
* The repository’s dataset JSON (encrypted for the test split) contains the canonical task prompts / question definitions and metadata; the harness downloads the actual capsule archive (capsule files) separately. The README documents how `benchmark/dataset/core_test.json` contains the prompt/question schema. ([GitHub][2])

---

# 3) Scoring / evaluation methods

* **Primary metric:** **task accuracy (pass@1)** — defined as the proportion of tasks for which **all** task questions are answered correctly. In other words a task is counted as solved only if the agent’s report answers every question for that task correctly. This prevents “guessing” by partial correctness. ([ar5iv][1])
* **Numerical/statistical tolerance for stochastic outputs:** for each task question the authors manually reproduced the capsule **three times** and derived a **95% prediction interval** for the value(s). An agent’s reported value is considered correct if it falls within the 95% prediction interval for that question. (They note only 17 / 181 questions were stochastic in practice.) ([ar5iv][1])
* **Other reported metrics:** average API cost per task (they tracked LLM API cost during runs) and confidence intervals over repeated runs. ([ar5iv][1])

---

# 4) Technical implementation (harness, isolation, execution)

* **Harness architecture (manager → worker VMs):** a *Manager* creates a VM per (agent, task) pair, copies the agent and capsule files, runs the agent on the VM, and after completion downloads the agent’s results and deletes the VM. This ensures isolation and allows parallelization at large scale. The Manager does the final evaluation locally. Figure 5 and Appendix B describe this flow. ([ar5iv][1])
* **VM / hardware details:** Azure VMs: non-GPU capsules run on `Standard_E2as_v5`, GPU capsules on `Standard_NC4as_T4_v3`. VMs run Ubuntu with an 80GB disk. The harness also supports local Docker runs (Docker-in-Docker is used for Medium tasks). ([ar5iv][1])
* **Time / cost limits & parallelization:** the paper runs each (agent, task) with a per-task wallclock limit (2 hours in their experiments). Running sequentially 270 tasks would take ~20+ days; their harness parallelized runs to finish in a few hours. They also imposed an API cost cap per task during baselines (noted as $4 per task in their experiments). ([ar5iv][1])
* **Local vs cloud:** repo supports local Docker (privileged mode) and Azure VM execution. README shows the commands, config template, and decryption instructions for the test JSON. The harness automatically downloads capsule tarballs from their capsule server. ([GitHub][2])

---

# 5) Agent design / submission checks (what they changed to improve evaluation)

* Two baseline agents: an unmodified generalist **AutoGPT** and a task-specific **CORE-Agent** (built on AutoGPT). CORE-Agent’s main modifications: task-specific prompting + programmatic checks enforcing the `report.json` keys and file format; plus a vision query tool for analyzing figures. These changes substantially improved performance. ([ar5iv][1])

---

# 6) Concrete repository files and practical pointers

* **Repo:** [https://github.com/siegelz/core-bench](https://github.com/siegelz/core-bench) — contains the harness, `main.py`, `benchmark` folder, `azure_utils`, agents, and docs (README explains running locally or on Azure). The test dataset JSON is distributed encrypted (`core_test.json.gpg`) and README shows the decryption password (`reproducibility`) and how to decrypt. The harness stores prompts/questions in the dataset JSON and downloads capsule archives by `capsule_id`. ([GitHub][2])
* **Evaluation automation:** harness expects agents to create a `task_completed.log` in the VM home directory and a `report.json` (or similarly named) for Manager to fetch and evaluate. Appendix B in the paper and the harness code give the exact conventions. ([ar5iv][1])

---

# 7) Key numbers & constraints (useful for experiments)

* 90 capsules → 270 tasks → **181 task questions** (some tasks share questions across difficulty levels). ([ar5iv][1])
* Per-task time limit used in evaluation: **2 hours**. ([ar5iv][1])
* VM types: `Standard_E2as_v5` (non-GPU), `Standard_NC4as_T4_v3` (GPU). ([GitHub][2])

---

# 8) Where the evaluation is strict / failure modes to watch for

* Strict correctness rule: **all questions per task must be correct** for the task to count as solved (so tasks with multiple questions are harder to “pass”). ([ar5iv][1])
* Stochastic outputs: they used 3 manual runs and the 95% prediction interval to allow a principled tolerance for stochastic outputs (instead of exact equality). ([ar5iv][1])
* Agents can make unsafe/web actions; the authors note they added domain restrictions (e.g., to block CodeOcean domain access) after seeing agents attempt unsafe behaviors. Guardrails matter if you re-run agents with web access. ([ar5iv][1])

---

# Suggested next steps (if you want to dig deeper)

1. Clone the repo and inspect `benchmark/dataset/*.json` (train is plaintext; test is encrypted) to see exact task schema and expected answer keys. The README explains how to decrypt the test split. ([GitHub][2])
2. Inspect `benchmark/` and `benchmark_utils` to see the evaluation script that compares agent `report.json` answers to the manual runs / prediction interval logic. (That’s where the programmatic check & numeric tolerance are implemented.) ([GitHub][2])
3. If you want, I can:

   * open and extract the dataset JSON schema (train split) and show an example task JSON (prompt + questions + expected keys), or
   * walk through the harness code to point out the exact function that implements the 95% prediction interval check and the `report.json` verification.

Say which of those you want and I’ll extract the example JSON + point to the exact file/lines where the evaluation and format checks are implemented. (I already have the repo and paper open, so I can pull the files for you.) ([GitHub][2])

---

If you want the example task JSON and the exact lines in the harness that validate `report.json` and compute the prediction interval, tell me “show me an example task JSON + eval code” and I’ll pull those files from the repo and paste the relevant snippets.

[1]: https://ar5iv.org/pdf/2409.11363 "[2409.11363] CORE-Bench: Fostering the Credibility of Published Research Through a Computational Reproducibility Agent Benchmark"
[2]: https://github.com/siegelz/core-bench "GitHub - siegelz/core-bench"

