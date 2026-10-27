import { describe, expect, it } from "vitest";
import { groupTierOptions, tierBadgeText, tierOptions } from "./tierDisplay";

describe("tier display with channels", () => {
  it("adds the channel to badge text", () => {
    expect(tierBadgeText("طلایی سطح ۱", "GOLD_1", "حضوری")).toBe("طلایی سطح ۱ · حضوری");
    expect(tierBadgeText("طلایی سطح ۱", "GOLD_1", null)).toBe("طلایی سطح ۱");
  });

  it("groups filter options by channel and keeps the base icon for online twins", () => {
    const options = tierOptions([
      { code: "ONLINE_VIP", title: "VIP", priority: 1, summary: "", customers: 0, channel: "online", channel_label: "اینترنتی" },
      { code: "VIP", title: "VIP", priority: 1, summary: "", customers: 0, channel: "pos", channel_label: "حضوری" },
    ]);
    expect(options[0].icon).toBe(options[1].icon);
    expect(groupTierOptions(options).map((group) => group.channelLabel)).toEqual(["اینترنتی", "حضوری"]);
  });
});
