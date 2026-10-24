export interface AppConfig {
  pageTitle: string;
  pageDescription: string;
  companyName: string;

  supportsChatInput: boolean;
  supportsVideoInput: boolean;
  supportsScreenShare: boolean;
  isPreConnectBufferEnabled: boolean;

  logo: string;
  startButtonText: string;
  accent?: string;
  logoDark?: string;
  accentDark?: string;

  audioVisualizerType?: "bar" | "wave" | "grid" | "radial" | "aura";
  audioVisualizerColor?: `#${string}`;
  audioVisualizerColorDark?: `#${string}`;
  audioVisualizerColorShift?: number;
  audioVisualizerBarCount?: number;
  audioVisualizerGridRowCount?: number;
  audioVisualizerGridColumnCount?: number;
  audioVisualizerRadialBarCount?: number;
  audioVisualizerRadialRadius?: number;
  audioVisualizerWaveLineWidth?: number;

  // agent dispatch configuration
  agentName?: string;

  // LiveKit Cloud Sandbox configuration
  sandboxId?: string;
}

export const APP_CONFIG_DEFAULTS: AppConfig = {
  companyName: "Cedarhaven",
  pageTitle: "Cedarhaven Assistant — Voice",
  pageDescription:
    "Cedarhaven municipal voice assistant: answers only from the town guides and shows its sources.",

  supportsChatInput: true,
  supportsVideoInput: false,
  supportsScreenShare: false,
  isPreConnectBufferEnabled: true,

  logo: "/lk-logo.svg",
  accent: "#00f0ff",
  logoDark: "/lk-logo-dark.svg",
  accentDark: "#00f0ff",
  startButtonText: "START TALKING",

  // Aura visualizer with neon cyan
  audioVisualizerType: "aura",
  audioVisualizerColor: "#00f0ff",
  audioVisualizerColorDark: "#00f0ff",
  audioVisualizerColorShift: 0.08,

  // agent dispatch configuration
  agentName: "assistant-b92",

  // LiveKit Cloud Sandbox configuration
  sandboxId: undefined,
};
