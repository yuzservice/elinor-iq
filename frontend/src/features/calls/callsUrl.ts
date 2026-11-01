export const SECTIONS = ["report", "programs", "settings"] as const;
export type CallSection = (typeof SECTIONS)[number];
export const STEPS = ["list", "form", "agents", "activate"] as const;
export type ProgramStep = (typeof STEPS)[number];

/** Manager section, program and step all live in the URL, so refresh and direct links work. */
export function parseCallsUrl(params: URLSearchParams) {
  const rawSection = params.get("section") as CallSection;
  const section: CallSection = SECTIONS.includes(rawSection) ? rawSection : "report";
  const rawProgram = params.get("program") ?? "";
  const programId = section === "programs" && /^\d+$/.test(rawProgram) ? Number(rawProgram) : null;
  const rawTab = params.get("tab") as ProgramStep;
  const tab: ProgramStep = STEPS.includes(rawTab) ? rawTab : "list";
  return { section, programId, tab };
}

export function programUrl(programId: number, tab: ProgramStep): string {
  return `/calls?section=programs&program=${programId}&tab=${tab}`;
}

/** Which steps are finished, from existing data. */
export function stepsDone(program: { list: unknown; published_version: number | null; agents: unknown[]; status: string }): Record<ProgramStep, boolean> {
  return {
    list: Boolean(program.list),
    form: program.published_version != null,
    agents: program.agents.length > 0,
    activate: program.status === "active",
  };
}
