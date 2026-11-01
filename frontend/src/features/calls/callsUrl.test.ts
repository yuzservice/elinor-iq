import { describe, expect, it } from "vitest";
import { parseCallsUrl, programUrl, stepsDone } from "./callsUrl";

const parse = (query: string) => parseCallsUrl(new URLSearchParams(query));

describe("calls url", () => {
  it("defaults to the report section", () => {
    expect(parse("")).toEqual({ section: "report", programId: null, tab: "list" });
    expect(parse("section=nope").section).toBe("report");
  });

  it("reads section, program and tab", () => {
    expect(parse("section=programs&program=12&tab=form")).toEqual({ section: "programs", programId: 12, tab: "form" });
    expect(parse("section=settings").section).toBe("settings");
  });

  it("ignores a bad tab, a bad program, and a program outside its section", () => {
    expect(parse("section=programs&program=12&tab=x").tab).toBe("list");
    expect(parse("section=programs&program=abc").programId).toBeNull();
    expect(parse("section=report&program=12").programId).toBeNull();
  });

  it("round-trips a program link", () => {
    expect(parse(programUrl(7, "agents").split("?")[1])).toEqual({ section: "programs", programId: 7, tab: "agents" });
  });

  it("marks steps done from existing data", () => {
    expect(stepsDone({ list: null, published_version: null, agents: [], status: "draft" })).toEqual({ list: false, form: false, agents: false, activate: false });
    expect(stepsDone({ list: {}, published_version: 1, agents: [{}], status: "active" })).toEqual({ list: true, form: true, agents: true, activate: true });
  });
});
