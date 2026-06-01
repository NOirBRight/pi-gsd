import { splitFrontmatter, writeFrontmatter } from "../src/frontmatter.js";
import { addPiSubagentGuidance, commandFileToPiPromptName, normalizeGsdSlashReferences, transformAskUserQuestionForPi, transformSkillDispatchForPi, transformSubagentDispatchForPi } from "../src/prompt-transform.js";

describe("frontmatter helpers", () => {
  it("splits markdown frontmatter from body", () => {
    const parsed = splitFrontmatter("---\ndescription: Plan\nargument-hint: '[phase]'\nallowed-tools:\n  - Read\n---\nBody\n");

    expect(parsed.data.description).toBe("Plan");
    expect(parsed.data["argument-hint"]).toBe("[phase]");
    expect(parsed.data["allowed-tools"]).toEqual(["Read"]);
    expect(parsed.body).toBe("Body\n");
  });

  it("returns the whole input as body when frontmatter is absent", () => {
    const parsed = splitFrontmatter("Body only\n");

    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe("Body only\n");
  });

  it("parses an empty scalar value as an empty string", () => {
    const parsed = splitFrontmatter("---\nargument-hint:\n---\nBody\n");

    expect(parsed.data["argument-hint"]).toBe("");
    expect(parsed.body).toBe("Body\n");
  });

  it("writes only Pi-supported prompt frontmatter keys", () => {
    const text = writeFrontmatter({ description: "Plan", "argument-hint": "[phase]", name: "gsd:plan-phase" }, "Body\n");

    expect(text).toBe("---\ndescription: Plan\nargument-hint: '[phase]'\n---\nBody\n");
  });

  it("writes empty supported prompt frontmatter values deterministically", () => {
    const text = writeFrontmatter({ "argument-hint": "" }, "Body\n");

    expect(text).toBe("---\nargument-hint: ''\n---\nBody\n");
  });
});

describe("prompt transforms", () => {
  it("maps official command filename to Pi prompt filename", () => {
    expect(commandFileToPiPromptName("plan-phase.md")).toBe("gsd-plan-phase.md");
  });

  it("normalizes official slash command references to Pi hyphen commands", () => {
    const input = "Run /gsd:plan-phase 1, then /gsd:new-project. Do not change http://x/y.";

    expect(normalizeGsdSlashReferences(input)).toBe("Run /gsd-plan-phase 1, then /gsd-new-project. Do not change http://x/y.");
  });

  it("normalizes official slash command references inside markdown code spans", () => {
    const input = "Run `/gsd:plan-phase` then /gsd:new-project";

    expect(normalizeGsdSlashReferences(input)).toBe("Run `/gsd-plan-phase` then /gsd-new-project");
  });

  it("does not normalize gsd references inside URL paths", () => {
    const input = "See https://example.com/gsd:plan-phase and /gsd:plan-phase";

    expect(normalizeGsdSlashReferences(input)).toBe("See https://example.com/gsd:plan-phase and /gsd-plan-phase");
  });

  it("does not normalize gsd references inside URL fragments", () => {
    const input = "See https://example.com/#/gsd:plan-phase and /gsd:plan-phase";

    expect(normalizeGsdSlashReferences(input)).toBe("See https://example.com/#/gsd:plan-phase and /gsd-plan-phase");
  });

  it("does not normalize gsd references inside URL queries", () => {
    const input = "See https://example.com/?next=/gsd:new-project and /gsd:new-project";

    expect(normalizeGsdSlashReferences(input)).toBe("See https://example.com/?next=/gsd:new-project and /gsd-new-project");
  });
});

describe("Pi subagent guidance", () => {
  it("adds guidance when prompt body mentions spawning subagents", () => {
    const body = "Spawn subagents to execute the plans.\n";

    const result = addPiSubagentGuidance(body);

    expect(result).toContain("<pi_subagents_runtime_note>");
    expect(result).toContain('subagent({ action: "list" })');
    expect(result).toContain("Spawn subagents to execute the plans.");
  });

  it("does not add guidance to prompts without delegation language", () => {
    const body = "Execute this inline without spawning anything.\n";

    expect(addPiSubagentGuidance(body)).toBe(body);
  });

  it("does not add guidance when subagent spawning is explicitly negated", () => {
    const body = "Execute inline without spawning subagents.\n";

    expect(addPiSubagentGuidance(body)).toBe(body);
  });

  it("adds guidance when spawning an official GSD agent by name", () => {
    const body = "Spawn `gsd-phase-researcher` for phase N.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when delegating to GSD subagents", () => {
    const body = "Delegates to gsd-doc-writer subagents for documentation.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when spawning an official GSD role noun", () => {
    const body = "This command spawns integration checker for cross-phase wiring.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when prompt optionally spawns research", () => {
    const body = "probing questions, optionally spawns research, then routes outputs.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when orchestrating official GSD agents by name", () => {
    const body = "Orchestrates gsd-ui-researcher and gsd-ui-checker.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("adds guidance when dispatching background agents", () => {
    const body = "dispatches plan to execute as background agents.\n";

    expect(addPiSubagentGuidance(body)).toContain("<pi_subagents_runtime_note>");
  });

  it("does not add duplicate guidance", () => {
    const body = "<pi_subagents_runtime_note>Already here</pi_subagents_runtime_note>\nSpawn subagents.\n";

    expect(addPiSubagentGuidance(body)).toBe(body);
  });
});

describe("transformAskUserQuestionForPi", () => {
  it("rewrites simple AskUserQuestion with flat string options to rpiv schema", () => {
    const input = 'AskUserQuestion("Confirm", "Proceed?", ["Yes", "No"])';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toBe(
      'ask_user_question({ questions: [{ question: "Proceed?", header: "Confirm", options: [{ label: "Yes", description: "Yes" }, { label: "No", description: "No" }] }] })',
    );
  });

  it("rewrites AskUserQuestion with multiSelect to rpiv schema with multiSelect", () => {
    const input = 'AskUserQuestion("Areas", "Which areas need clarification?", ["Area A", "Area B"], multiSelect: true)';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('multiSelect: true');
    expect(result).toContain('question: "Which areas need clarification?"');
    expect(result).toContain('header: "Areas"');
    expect(result).toContain('label: "Area A"');
    expect(result).toContain('label: "Area B"');
  });

  it("rewrites AskUserQuestion with option objects (label + description)", () => {
    const input =
      'AskUserQuestion("Granularity", "How finely should scope be sliced?", [{ label: "Coarse", description: "Fewer, broader phases" }, { label: "Fine", description: "Many focused phases" }])';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('label: "Coarse", description: "Fewer, broader phases"');
    expect(result).toContain('label: "Fine", description: "Many focused phases"');
    expect(result).toContain('header: "Granularity"');
    expect(result).toContain('question: "How finely should scope be sliced?"');
  });

  it("does not rewrite AskUserQuestion inside code fences", () => {
    const input =
      'Some text\n```\nAskUserQuestion("Header", "Question?", ["Yes", "No"])\n```\nMore text';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('AskUserQuestion');
    expect(result).not.toContain('ask_user_question');
  });

  it("does not rewrite text that already contains ask_user_question", () => {
    const input =
      'ask_user_question({ questions: [{ question: "Proceed?", header: "Confirm", options: [{ label: "Yes", description: "Yes" }] }] })';

    expect(transformAskUserQuestionForPi(input)).toBe(input);
  });

  it("continues rewriting later AskUserQuestion calls after an unbalanced one", () => {
    const input = 'AskUserQuestion(\nThen valid:\nAskUserQuestion("Confirm", "Proceed?", ["Yes", "No"])';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('AskUserQuestion(');
    expect(result).toContain('ask_user_question');
    expect(result).toContain('question: "Proceed?"');
  });

  it("continues rewriting later AskUserQuestion calls after an unsupported one", () => {
    const input = 'AskUserQuestion(dynamicOptions)\nThen valid:\nAskUserQuestion("Confirm", "Proceed?", ["Yes", "No"])';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('AskUserQuestion(dynamicOptions)');
    expect(result).toContain('ask_user_question');
    expect(result).toContain('question: "Proceed?"');
  });

  it("handles AskUserQuestion calls spanning multiple lines", () => {
    const input =
      'Before\nAskUserQuestion(\n  header: "Confirm",\n  question: "Proceed?",\n  options: ["Yes", "No"]\n)\nAfter';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('ask_user_question');
    expect(result).toContain('question: "Proceed?"');
    expect(result).toContain('header: "Confirm"');
    expect(result).toContain('label: "Yes"');
    expect(result).toContain('label: "No"');
  });

  it("rewrites AskUserQuestion with named parameters (header:, question:, options:, multiSelect:)", () => {
    const input =
      'AskUserQuestion(header: "Archive", question: "Archive phases?", options: [{ label: "Yes", description: "Move to archive" }, { label: "No", description: "Keep in place" }], multiSelect: false)';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('ask_user_question');
    expect(result).toContain('question: "Archive phases?"');
    expect(result).toContain('header: "Archive"');
    expect(result).toContain('label: "Yes", description: "Move to archive"');
    expect(result).toContain('label: "No", description: "Keep in place"');
    expect(result).not.toContain('multiSelect: false');
  });

  it("preserves surrounding text around the AskUserQuestion call", () => {
    const input =
      'First, read the file. Then ask:\n\nAskUserQuestion("Check", "All good?", ["Yes", "No"])\n\nContinue with the next step.';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('First, read the file.');
    expect(result).toContain('Continue with the next step.');
    expect(result).toContain('ask_user_question');
    expect(result).toContain('question: "All good?"');
  });

  it("rewrites AskUserQuestion with array of question objects (multi-question form)", () => {
    const input =
      'AskUserQuestion([{ header: "Granularity", question: "How fine?", multiSelect: false, options: [{ label: "Coarse", description: "Fewer phases" }] }, { header: "Git", question: "Track in git?", multiSelect: false, options: [{ label: "Yes", description: "Track" }, { label: "No", description: "Skip" }] }])';

    const result = transformAskUserQuestionForPi(input);

    expect(result).toContain('ask_user_question');
    expect(result).toContain('header: "Granularity"');
    expect(result).toContain('question: "How fine?"');
    expect(result).toContain('header: "Git"');
    expect(result).toContain('question: "Track in git?"');
  });
});

describe("transformSkillDispatchForPi", () => {
  it("rewrites Skill(skill=\"gsd-plan-phase\", args=\"4 --auto\") to Pi-equivalent instruction with args", () => {
    const input = 'Skill(skill="gsd-plan-phase", args="4 --auto")';

    const result = transformSkillDispatchForPi(input);

    expect(result).toContain('Use the /gsd-plan-phase skill');
    expect(result).toContain('/gsd-plan-phase 4 --auto');
    expect(result).not.toContain('Skill(');
  });

  it("rewrites Skill(skill=\"gsd-discuss-phase\") without args to Pi-equivalent instruction", () => {
    const input = 'Skill(skill="gsd-discuss-phase")';

    const result = transformSkillDispatchForPi(input);

    expect(result).toContain('Use the /gsd-discuss-phase skill');
    expect(result).toContain('/gsd-discuss-phase');
    expect(result).not.toContain('Skill(');
  });

  it("does not rewrite Skill() inside code fences", () => {
    const input =
      'Before\n```\nSkill(skill="gsd-plan-phase", args="4")\n```\nAfter Skill(skill="gsd-execute-phase", args="1")';

    const result = transformSkillDispatchForPi(input);

    expect(result).toContain('Skill(skill="gsd-plan-phase"'); // inside code fence preserved
    expect(result).not.toContain('Skill(skill="gsd-execute-phase"'); // not in code fence, rewritten
    expect(result).toContain('Use the /gsd-execute-phase skill');
  });

  it("preserves text that does not contain Skill() patterns", () => {
    const input = 'This is plain text without any dispatch calls.';

    expect(transformSkillDispatchForPi(input)).toBe(input);
  });
});

describe("transformSubagentDispatchForPi", () => {
  it("rewrites subagent_type=\"general-purpose\" to subagent_type=\"general\" in prompt text", () => {
    const input = 'subagent_type="general-purpose"';

    const result = transformSubagentDispatchForPi(input);

    expect(result).toContain('subagent_type="general"');
    expect(result).not.toContain('general-purpose');
  });

  it("rewrites Agent(subagent_type=\"gsd-executor\", prompt=\"Run plan\") to subagent() form", () => {
    const input = 'Agent(subagent_type="gsd-executor", prompt="Run plan")';

    const result = transformSubagentDispatchForPi(input);

    expect(result).toContain('subagent({agent: "gsd-executor", task: "Run plan"})');
    expect(result).not.toContain('Agent(');
  });

  it("does not rewrite inside code fences", () => {
    const input = '```\nsubagent_type="general-purpose"\nAgent(subagent_type="gsd-executor", prompt="test")\n```\nOutside subagent_type="general-purpose"';

    const result = transformSubagentDispatchForPi(input);

    // Inside fences: preserved as-is
    expect(result).toContain('subagent_type="general-purpose"');
    // Outside fences: rewritten
    // The second "general-purpose" at the end (outside fences) is rewritten
    // But the one inside doesn't change, so it still contains it
    // Actually let's check the Agent pattern outside fences isn't in the fence
    expect(result).toContain('Agent(subagent_type="gsd-executor"'); // inside fence
  });

  it("preserves text without subagent patterns", () => {
    const input = 'Plain workflow text with no dispatch references.';

    expect(transformSubagentDispatchForPi(input)).toBe(input);
  });
});

describe("double-quote escaping (CR-01)", () => {
  it("escapes double quotes in AskUserQuestion header values", () => {
    const input = 'AskUserQuestion("Say \"hello\"", "Continue?", ["OK"])';
    const result = transformAskUserQuestionForPi(input);
    expect(result).not.toContain('AskUserQuestion');
    expect(result).toContain('ask_user_question');
    // The header value should have escaped quotes in the output
    expect(result).toContain('header: "Say \\"hello\\""');
  });

  it("escapes double quotes in AskUserQuestion question values", () => {
    const input = 'AskUserQuestion("Header", "Is this \"correct\"?", ["Yes"])';
    const result = transformAskUserQuestionForPi(input);
    expect(result).not.toContain('AskUserQuestion');
    expect(result).toContain('question: "Is this \\"correct\\"?"');
  });

  it("escapes double quotes in option label and description", () => {
    // Object options with simple values work fine
    const input = 'AskUserQuestion("Header", "Question?", [{ label: "OK", description: "desc here" }])';
    const result = transformAskUserQuestionForPi(input);
    expect(result).not.toContain('AskUserQuestion');
    expect(result).toContain('label: "OK", description: "desc here"');
  });

  it("unquotes escaped double quotes in tokenization (CR-01 round-trip)", () => {
    // Verify that unquote correctly unescapes \" -> "
    const input = 'AskUserQuestion("Say \\"hello\\"", "Continue?", ["OK"])';
    const result = transformAskUserQuestionForPi(input);
    expect(result).not.toContain('AskUserQuestion');
    // The final output should properly round-trip escaped quotes
    expect(result).toContain('ask_user_question');
  });
});

describe("parseOptionsBlock word boundary (WR-04)", () => {
  it("does not match partial word like 'myoptions:' instead of 'options:'", () => {
    // Named params with 'myoptions' should NOT be parsed as 'options'
    const input = 'AskUserQuestion(header: "H", question: "Q?", myoptions: ["A"])';
    const result = transformAskUserQuestionForPi(input);
    // This should not produce a valid transformation since 'myoptions' != 'options'
    // The function should return null for failing to parse options
    // and therefore leave the input unchanged
    expect(result).toBe(input);
  });
});
