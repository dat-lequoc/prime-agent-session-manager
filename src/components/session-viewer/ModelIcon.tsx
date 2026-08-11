import React, { memo } from "react";
import Anthropic from "@lobehub/icons/es/Anthropic/components/Mono";
import Aws from "@lobehub/icons/es/Aws/components/Mono";
import Azure from "@lobehub/icons/es/Azure/components/Mono";
import Baidu from "@lobehub/icons/es/Baidu/components/Mono";
import ByteDance from "@lobehub/icons/es/ByteDance/components/Mono";
import Claude from "@lobehub/icons/es/Claude/components/Mono";
import Cohere from "@lobehub/icons/es/Cohere/components/Mono";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Mono";
import Fireworks from "@lobehub/icons/es/Fireworks/components/Mono";
import Gemini from "@lobehub/icons/es/Gemini/components/Mono";
import Google from "@lobehub/icons/es/Google/components/Mono";
import Grok from "@lobehub/icons/es/Grok/components/Mono";
import Groq from "@lobehub/icons/es/Groq/components/Mono";
import HuggingFace from "@lobehub/icons/es/HuggingFace/components/Mono";
import Meta from "@lobehub/icons/es/Meta/components/Mono";
import Minimax from "@lobehub/icons/es/Minimax/components/Mono";
import Mistral from "@lobehub/icons/es/Mistral/components/Mono";
import Moonshot from "@lobehub/icons/es/Moonshot/components/Mono";
import Nvidia from "@lobehub/icons/es/Nvidia/components/Mono";
import Ollama from "@lobehub/icons/es/Ollama/components/Mono";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenRouter from "@lobehub/icons/es/OpenRouter/components/Mono";
import Perplexity from "@lobehub/icons/es/Perplexity/components/Mono";
import Qwen from "@lobehub/icons/es/Qwen/components/Mono";
import Stepfun from "@lobehub/icons/es/Stepfun/components/Mono";
import Tencent from "@lobehub/icons/es/Tencent/components/Mono";
import Together from "@lobehub/icons/es/Together/components/Mono";
import XiaomiMiMo from "@lobehub/icons/es/XiaomiMiMo/components/Mono";
import Yi from "@lobehub/icons/es/Yi/components/Mono";
import Zhipu from "@lobehub/icons/es/Zhipu/components/Mono";

type IconComponentType = React.ComponentType<{
  size?: number | string;
  className?: string;
}>;

interface ModelIconProps {
  model: string;
  size?: number;
  className?: string;
}

function asIcon(component: unknown): IconComponentType {
  return component as IconComponentType;
}

function resolveModelIcon(model: string): IconComponentType | null {
  const lower = model.toLowerCase();

  if (
    lower.includes("claude") ||
    lower.includes("sonnet") ||
    lower.includes("haiku") ||
    lower.includes("opus")
  ) {
    return asIcon(Claude);
  }
  if (lower.includes("anthropic")) return asIcon(Anthropic);
  if (
    lower.includes("gpt") ||
    lower.includes("openai") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("o4") ||
    lower.includes("codex") ||
    lower.includes("chatgpt")
  ) {
    return asIcon(OpenAI);
  }
  if (lower.includes("deepseek")) return asIcon(DeepSeek);
  if (lower.includes("gemini")) return asIcon(Gemini);
  if (lower.includes("google") || lower.includes("gemma"))
    return asIcon(Google);
  if (lower.includes("grok") || lower.includes("xai")) return asIcon(Grok);
  if (
    lower.includes("qwen") ||
    lower.includes("qwq") ||
    lower.includes("alibaba") ||
    lower.includes("dashscope")
  ) {
    return asIcon(Qwen);
  }
  if (
    lower.includes("mistral") ||
    lower.includes("codestral") ||
    lower.includes("mixtral") ||
    lower.includes("pixtral")
  ) {
    return asIcon(Mistral);
  }
  if (lower.includes("llama") || lower.includes("meta")) return asIcon(Meta);
  if (lower.includes("kimi") || lower.includes("moonshot"))
    return asIcon(Moonshot);
  if (lower.includes("doubao") || lower.includes("bytedance")) {
    return asIcon(ByteDance);
  }
  if (
    lower.includes("glm") ||
    lower.includes("zhipu") ||
    lower.includes("chatglm")
  ) {
    return asIcon(Zhipu);
  }
  if (lower.includes("hunyuan") || lower.includes("tencent"))
    return asIcon(Tencent);
  if (
    lower.includes("baidu") ||
    lower.includes("wenxin") ||
    lower.includes("ernie")
  ) {
    return asIcon(Baidu);
  }
  if (lower.includes("cohere") || lower.includes("command"))
    return asIcon(Cohere);
  if (lower.includes("perplexity") || lower.includes("sonar")) {
    return asIcon(Perplexity);
  }
  if (lower.includes("hf") || lower.includes("huggingface")) {
    return asIcon(HuggingFace);
  }
  if (lower.includes("ollama")) return asIcon(Ollama);
  if (lower.includes("minimax")) return asIcon(Minimax);
  if (lower.includes("openrouter")) return asIcon(OpenRouter);
  if (lower.includes("nvidia") || lower.includes("nim-")) return asIcon(Nvidia);
  if (lower.includes("bedrock") || lower.includes("aws")) return asIcon(Aws);
  if (lower.includes("azure")) return asIcon(Azure);
  if (lower.includes("together")) return asIcon(Together);
  if (lower.includes("fireworks")) return asIcon(Fireworks);
  if (lower.includes("groq")) return asIcon(Groq);
  if (
    lower.includes("yi-") ||
    lower.includes("/yi") ||
    lower.includes("01-ai")
  ) {
    return asIcon(Yi);
  }
  if (lower.includes("stepfun") || lower.includes("step-"))
    return asIcon(Stepfun);
  if (lower.includes("mimo") || lower.includes("xiaomi"))
    return asIcon(XiaomiMiMo);

  return null;
}

export const ModelIcon = memo(function ModelIcon({
  model,
  size = 12,
  className,
}: ModelIconProps) {
  const IconComponent = resolveModelIcon(model);
  if (!IconComponent) return null;
  return <IconComponent size={size} className={className} />;
});
