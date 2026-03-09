#!/usr/bin/env node
import * as p from "@clack/prompts";
import fs from "fs";
import { cpSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Types ────────────────────────────────────────────────────────────────────

type Agent = "claude" | "opencode" | "antigravity" | "copilot" | "codex";

interface AgentConfig {
  label: string;
  hint: string;
  skillDir: (skill: string) => string;
  filename: (skill: string) => string;
}

// ── Agent config ─────────────────────────────────────────────────────────────

const AGENTS: Record<Agent, AgentConfig> = {
  claude: {
    label: "Claude Code",
    hint: ".claude/skills/",
    skillDir: (skill) => `.claude/skills/${skill}`,
    filename: () => "SKILL.md",
  },
  opencode: {
    label: "OpenCode",
    hint: ".agents/skills/",
    skillDir: (skill) => `.agents/skills/${skill}`,
    filename: () => "SKILL.md",
  },
  codex: {
    label: "Codex",
    hint: ".agents/skills/",
    skillDir: (skill) => `.agents/skills/${skill}`,
    filename: () => "SKILL.md",
  },
  antigravity: {
    label: "Antigravity",
    hint: ".agent/skills/",
    skillDir: (skill) => `.agent/skills/${skill}`,
    filename: () => "SKILL.md",
  },
  copilot: {
    label: "Copilot",
    hint: ".github/skills/",
    skillDir: (skill) => `.github/skills/${skill}`,
    filename: () => "SKILL.md",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSkillsDir(): string {
  // Works both for local dev (tsx) and installed package (dist/)
  const base = fileURLToPath(new URL(".", import.meta.url));
  // In dist/, skills/ is one level up from dist/
  const candidates = [
    path.resolve(base, "../skills"),
    path.resolve(base, "../../skills"),
    path.resolve(base, "skills"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Could not locate the bundled skills/ directory.");
}

function listAvailableSkills(skillsDir: string): string[] {
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function installSkill(
  skillsDir: string,
  skill: string,
  agent: Agent,
  cwd: string
): { dest: string; existed: boolean } {
  const config = AGENTS[agent];
  const srcDir = path.join(skillsDir, skill);
  const destDir = path.join(cwd, config.skillDir(skill));
  const destFile = path.join(destDir, config.filename(skill));

  const existed = fs.existsSync(destFile);
  if (existed) return { dest: destFile, existed }; // skip silently

  fs.mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true, force: false, errorOnExist: true });

  return { dest: destFile, existed };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  p.intro("⚡ jutsu — AI agent skill installer");

  const skillsDir = getSkillsDir();
  const availableSkills = listAvailableSkills(skillsDir);

  if (availableSkills.length === 0) {
    p.cancel("No skills found in the skills/ directory.");
    process.exit(1);
  }

  // 1. Pick agent
  const agent = await p.select<Agent>({
    message: "Which agent are you using?",
    options: (Object.entries(AGENTS) as [Agent, AgentConfig][]).map(
      ([value, cfg]) => ({
        value,
        label: cfg.label,
        hint: cfg.hint,
      }),
    ),
  });

  if (p.isCancel(agent)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // 2. Pick skills
  const cwd = process.cwd();

  const availableOptions = availableSkills.map((skill) => {
    const config = AGENTS[agent as Agent];
    const destFile = path.join(cwd, config.skillDir(skill), config.filename(skill));
    const installed = fs.existsSync(destFile);
    return {
      value: skill,
      label: skill,
      hint: installed ? "already installed" : undefined,
      disabled: installed,  // greys it out and makes it unselectable
    };
  });

  const selected = await p.multiselect<string>({
    message: "Select skills to install (space to toggle, enter to confirm)",
    options: availableOptions,
    required: true,
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // 3. Install
  const s = p.spinner();
  s.start("Installing skills…");

  const results: Array<{ skill: string; dest: string; existed: boolean }> = [];

  for (const skill of selected as string[]) {
    try {
      const { dest, existed } = installSkill(
        skillsDir,
        skill,
        agent as Agent,
        cwd,
      );
      results.push({ skill, dest, existed });
    } catch (err) {
      s.stop("Installation failed.");
      p.cancel(`Error installing "${skill}": ${(err as Error).message}`);
      process.exit(1);
    }
  }

  s.stop("Done!");

  // 4. Summary
  for (const { skill, dest, existed } of results) {
    const rel = path.relative(cwd, dest);
    p.note(`${existed ? "↻ updated" : "✓ created"}  ${rel}`, skill);
  }

  p.outro(`${results.length} skill(s) installed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
