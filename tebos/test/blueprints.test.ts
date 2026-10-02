import { describe, expect, it } from "vitest";
import { BLUEPRINTS, blueprintByKey, blueprintCoverage, blueprintPayload, checkBlueprint, type Blueprint } from "../src";

describe("operating-system blueprints", () => {
  it("covers eleven different kinds of business, each with a unique key", () => {
    expect(BLUEPRINTS).toHaveLength(11);
    expect(new Set(BLUEPRINTS.map((b) => b.key)).size).toBe(11);
    expect(new Set(BLUEPRINTS.map((b) => b.industry)).size).toBe(11);
  });

  it.each(BLUEPRINTS.map((b) => [b.key, b] as const))("%s fits the board's rules", (_, b) => {
    expect(checkBlueprint(b)).toEqual([]);
    expect(b.flows.length).toBeGreaterThanOrEqual(2);
    expect(b.objectives.length).toBeGreaterThanOrEqual(1);
  });

  it("each blueprint takes most of the work off the founder: few founder steps, most steps with a written rule", () => {
    for (const b of BLUEPRINTS) {
      const c = blueprintCoverage(b);
      expect(c.founderSteps).toBeLessThanOrEqual(2);
      expect(c.stepsWithRules / c.steps).toBeGreaterThan(0.5);
    }
  });

  it("catches what the database would refuse", () => {
    const bad: Blueprint = {
      ...BLUEPRINTS[0]!, key: "Bad Key",
      pieces: [{ name: "CRM", kind: "software", description: "x" }, { name: "crm", kind: "software", description: "y" }],
      flows: [{ name: "F", startsWhen: "s", doneWhen: "d", ownerRole: "o", steps: [
        { name: "Auto with nothing", performer: "automation" },
        { name: "Runs on a ghost", performer: "staff", piece: "Ghost" },
      ] }],
    };
    const errors = checkBlueprint(bad);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/key/), expect.stringMatching(/appears twice/), expect.stringMatching(/must name the piece/),
      expect.stringMatching(/written rule/), expect.stringMatching(/doesn't have: "Ghost"/),
    ]));
  });

  it("turns a blueprint into the payload apply_blueprint takes, with steps numbered from 1", () => {
    const p = blueprintPayload(blueprintByKey("sports-agency")!);
    expect(p).toMatchObject({ key: "sports-agency", version: 1 });
    expect(p.flows[0]!.steps.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.flows[0]!.steps[0]).toMatchObject({ performer: "staff", piece: "Opportunity pipeline" });
    expect(blueprintByKey("nope")).toBeUndefined();
  });
});
