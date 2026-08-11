import type { ComponentType, CSSProperties, SVGProps } from 'react'
import Amp from '@lobehub/icons/es/Amp/components/Mono'
import Antigravity from '@lobehub/icons/es/Antigravity/components/Mono'
import ClaudeCode from '@lobehub/icons/es/ClaudeCode/components/Mono'
import Codex from '@lobehub/icons/es/Codex/components/Mono'
import Copilot from '@lobehub/icons/es/Copilot/components/Mono'
import Cursor from '@lobehub/icons/es/Cursor/components/Mono'
import Devin from '@lobehub/icons/es/Devin/components/Mono'
import Grok from '@lobehub/icons/es/Grok/components/Mono'
import Kimi from '@lobehub/icons/es/Kimi/components/Mono'
import Minimax from '@lobehub/icons/es/Minimax/components/Mono'
import OpenCode from '@lobehub/icons/es/OpenCode/components/Mono'
import OpenRouter from '@lobehub/icons/es/OpenRouter/components/Mono'
import Zhipu from '@lobehub/icons/es/Zhipu/components/Mono'
import { Bot } from 'lucide-react'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & {
  size?: number | string
  className?: string
  style?: CSSProperties
}>

const PROVIDER_ICONS: Record<string, IconComponent> = {
  antigravity: Antigravity as IconComponent,
  amp: Amp as IconComponent,
  claude: ClaudeCode as IconComponent,
  codex: Codex as IconComponent,
  copilot: Copilot as IconComponent,
  cursor: Cursor as IconComponent,
  devin: Devin as IconComponent,
  factory: Bot as IconComponent,
  grok: Grok as IconComponent,
  openrouter: OpenRouter as IconComponent,
  'opencode-go': OpenCode as IconComponent,
  kimi: Kimi as IconComponent,
  minimax: Minimax as IconComponent,
  zai: Zhipu as IconComponent,
}

export function ProviderIcon({
  id,
  className = 'h-4 w-4',
  size = 16,
}: {
  id: string
  className?: string
  size?: number
}) {
  const Icon = PROVIDER_ICONS[id] ?? Bot
  return <Icon className={className} size={size} aria-hidden="true" />
}
