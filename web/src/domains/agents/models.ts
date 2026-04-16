import type { AgentModelOption, AgentTemplateId } from './types'

const HERMES_CREATE_MODEL_OPTIONS: AgentModelOption[] = [
  { value: 'gpt-5.4', label: 'GPT-5.4', helper: 'OpenAI' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', helper: 'OpenAI' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini', helper: 'OpenAI' },
  { value: 'gpt-4.1', label: 'GPT-4.1', helper: 'OpenAI' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', helper: 'OpenAI' },
  { value: 'gpt-4o', label: 'GPT-4o', helper: 'OpenAI' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', helper: 'OpenAI' },
  { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', helper: 'Anthropic' },
  { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', helper: 'Anthropic' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', helper: 'Google' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', helper: 'Google' },
  { value: 'deepseek-v3.2', label: 'DeepSeek V3.2', helper: 'DeepSeek' },
  { value: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus', helper: 'Qwen' },
]

const CREATE_MODEL_OPTIONS_BY_TEMPLATE: Record<AgentTemplateId, AgentModelOption[]> = {
  'hermes-agent': HERMES_CREATE_MODEL_OPTIONS,
  openclaw: [],
}

export const resolveCreateModelOptions = (templateId: AgentTemplateId) =>
  CREATE_MODEL_OPTIONS_BY_TEMPLATE[templateId] || []
