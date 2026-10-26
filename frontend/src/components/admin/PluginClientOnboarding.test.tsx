import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PluginClientOnboarding } from "./PluginClientOnboarding";

const plugins = vi.hoisted(() => ({ active: [] as { name: string }[] }));

vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: plugins.active }),
}));
vi.mock("@/plugins", () => ({
  getPluginComponent: (plugin: string, component: string) =>
    plugin === "onboarding" && component === "ClientOnboardingLifecycle"
      ? ({ client }: { client: { code: string } }) => <div>onboarding for {client.code}</div>
      : null,
}));

const client = { id: 1, name: "Old", code: "OLD", description: "", is_active: false, created_at: "" };

describe("PluginClientOnboarding", () => {
  beforeEach(() => {
    plugins.active = [];
  });

  it("renders nothing when the onboarding plugin is not active", () => {
    const { container } = render(<PluginClientOnboarding client={client} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the plugin's component, with the client, when it is active", async () => {
    plugins.active = [{ name: "onboarding" }];
    render(<PluginClientOnboarding client={client} />);
    expect(await screen.findByText("onboarding for OLD")).toBeInTheDocument();
  });
});
