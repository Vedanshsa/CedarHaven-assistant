# 🤖 Vimora - AI Assistant

> A modern, feature-rich AI voice assistant interface built with cutting-edge web technologies. Experience seamless real-time conversations with intelligent audio visualization.

**🌐 Live Project:** [vimora.varshit.dev](https://vimora.varshit.dev)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-96.8%25-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-000000?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react)](https://react.dev/)
[![LiveKit](https://img.shields.io/badge/LiveKit-Agents-FF6B6B?logo=livekit)](https://livekit.io/)

## ✨ Features

- **🎙️ Real-time Voice Interaction** - Engage in natural conversations with advanced AI agents
- **📹 Video & Screen Sharing** - Stream camera feed or share your screen seamlessly
- **🎨 Multi-Style Audio Visualizers** - 5 stunning visualization modes:
  - Bar graphs with smooth animations
  - Dot grid patterns
  - Circular radial bars
  - Oscilloscope wave visualization
  - Shader-based aura effects
- **🎭 Virtual Avatar Support** - Integrate custom avatars powered by Rive
- **🌓 Dark/Light Theme** - Automatic theme detection with manual switching
- **⚙️ Highly Customizable** - Configure branding, colors, UI text, and features
- **🔒 Secure & Modern** - Built with industry-standard security practices
- **📱 Responsive Design** - Works flawlessly across all devices
- **⚡ High Performance** - Optimized with Next.js Turbopack and modern React

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm/yarn
- LiveKit credentials (API Key, Secret, URL)

### Installation

Clone and setup the project:

```bash
lk app create --template agent-starter-react
```

Or manually:

```bash
git clone https://github.com/vishaltyagi807/Vimora---AI-Assistant.git
cd Vimora---AI-Assistant
pnpm install
```

### Configuration

1. **Set up environment variables** (copy `.env.example` to `.env.local`):

```env
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=https://your-livekit-server-url
AGENT_NAME=                    # Leave blank for automatic dispatch
```

2. **Customize app settings** in `app-config.ts`:

```typescript
export const APP_CONFIG_DEFAULTS: AppConfig = {
  companyName: 'Vimora',
  pageTitle: 'Vimora - AI Voice Assistant',
  pageDescription: 'Meet your intelligent AI assistant',
  
  supportsChatInput: true,
  supportsVideoInput: true,
  supportsScreenShare: true,
  isPreConnectBufferEnabled: true,
  
  logo: '/vimora-logo.svg',
  accent: '#002cf2',
  logoDark: '/vimora-logo-dark.svg',
  accentDark: '#1fd5f9',
  startButtonText: 'Start Conversation',
  
  // Optional: Audio visualizer customization
  audioVisualizerType: 'bar',  // 'bar' | 'grid' | 'radial' | 'wave' | 'aura'
  audioVisualizerColor: '#002cf2',
  
  agentName: undefined,
  sandboxId: undefined,
};
```

### Development

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For production build:

```bash
pnpm build
pnpm start
```

## 📁 Project Structure

```
Vimora---AI-Assistant/
├── app/
│   ├── api/                    # Backend API routes
│   └── layout.tsx              # Root layout
├── components/
│   ├── agents-ui/              # LiveKit Agents UI components
│   ├── ai-elements/            # Custom AI components
│   ├── app/                    # Core application components
│   │   ├── session-view.tsx    # Main session interface
│   │   ├── view-controller.tsx # View state management
│   │   ├── welcome-view.tsx    # Onboarding screen
│   │   ├── chat-transcript.tsx # Message history
│   │   └── tile-layout.tsx     # Media tiles layout
│   └── ui/                     # Shadcn/ui primitive components
├── hooks/                      # Custom React hooks
├── lib/                        # Utility functions & helpers
├── fonts/                      # Custom font files
├── public/                     # Static assets
├── app-config.ts               # Main configuration file
├── package.json                # Dependencies
└── tsconfig.json               # TypeScript configuration
```

## 🎨 Audio Visualizer Presets

Configure the audio visualizer in `app-config.ts`:

| Type | Description | Config Options |
|------|-------------|-----------------|
| **bar** | Vertical animated bars | `audioVisualizerBarCount` (default: 5) |
| **grid** | Dot matrix pattern | `audioVisualizerGridRowCount`, `audioVisualizerGridColumnCount` |
| **radial** | Circular bar pattern | `audioVisualizerRadialBarCount`, `audioVisualizerRadialRadius` |
| **wave** | Oscilloscope style | `audioVisualizerWaveLineWidth` |
| **aura** | Shader-based effect | `audioVisualizerAuraColorShift` |

Use `audioVisualizerColor` to set accent color across all modes.

## 🔧 Available Scripts

```bash
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm format           # Format code with Prettier
pnpm format:check     # Check formatting
pnpm shadcn:install   # Update Agents UI components
```

## 📚 Key Components

### SessionView (`components/app/session-view.tsx`)
- Initializes LiveKit session
- Manages chat transcripts and media tiles
- Handles media controls

### ViewController (`components/app/view-controller.tsx`)
- Controls view transitions (welcome ↔ session)
- Manages connection state
- Handles disconnections

### ChatTranscript (`components/app/chat-transcript.tsx`)
- Displays conversation history
- Real-time message updates
- Smooth scroll synchronization

### TileLayout (`components/app/tile-layout.tsx`)
- Responsive media tile management
- Automatic layout adaptation
- Multi-participant support

## 🌐 Integrate Custom Agents

Choose your preferred backend language:

- **[Python](https://github.com/livekit-examples/agent-starter-python)** - FastAPI-based agents
- **[Node.js](https://github.com/livekit-examples/agent-starter-node)** - Express-based agents
- **[Go](https://github.com/livekit-examples/agent-starter-go)** - High-performance agents

Configure the agent connection in `.env.local`:
```env
AGENT_NAME=my-custom-agent
```

## 💻 Technology Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 15.5 |
| **Runtime** | React 19 |
| **Language** | TypeScript 5 |
| **Real-time Communication** | LiveKit Client 2.17 |
| **UI Components** | Shadcn/ui + Radix UI |
| **Styling** | Tailwind CSS 4 |
| **Animation** | Motion 12 |
| **Icons** | Lucide React + Phosphor |
| **Chat AI** | Vercel AI SDK |
| **Code Highlighting** | Shiki |
| **Package Manager** | pnpm 9.15 |

## 🎯 Use Cases

- **Customer Support** - Intelligent 24/7 support agent
- **Virtual Assistant** - Personal productivity helper
- **Accessibility Tool** - Voice-first interface for users with disabilities
- **Educational Platform** - Interactive learning companion
- **Content Creation** - AI co-writer and brainstorming partner
- **Internal Tools** - Enterprise automation and workflows

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow the existing code style
- Use TypeScript for type safety
- Add tests for new features
- Update documentation as needed
- Join the [LiveKit Community Slack](https://livekit.io/join-slack) for discussions

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [LiveKit Agents](https://docs.livekit.io/agents)
- UI powered by [Shadcn/ui](https://ui.shadcn.com/)
- Animations with [Motion](https://motion.dev/)
- Icons from [Lucide React](https://lucide.dev/) and [Phosphor Icons](https://phosphoricons.com/)
- Avatar support via [Rive](https://rive.app/)

## 📞 Support

- 📖 [LiveKit Documentation](https://docs.livekit.io/)
- 💬 [LiveKit Community Slack](https://livekit.io/join-slack)
- 🐛 [Report Issues](https://github.com/vishaltyagi807/Vimora---AI-Assistant/issues)
- 💡 [Discussions](https://github.com/vishaltyagi807/Vimora---AI-Assistant/discussions)

## 🚀 What's Next?

- [ ] Add multiple language support
- [ ] Custom model integration
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Voice tone customization
- [ ] Conversation history export
- [ ] Advanced prompt engineering UI

---

<div align="center">

**Made with ❤️ by [Vishal Tyagi](https://github.com/vishaltyagi807)**

[![LinkedIn](https://img.shields.io/badge/Twitter-@vishaltyagi807-1DA1F2?logo=twitter&style=flat)](https://www.linkedin.com/in/varshityagi/)

</div>
