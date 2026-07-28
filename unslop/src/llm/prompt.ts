import type { ChatMessage, PostData, Sensitivity } from '@/types';
import {
  buildUserPrompt,
  CLASSIFIER_SYSTEM_PROMPT,
  LIMITS,
  SENSITIVITY_PRESETS,
} from '@/constants';
import { normalizeText, truncate } from '@/utils/text';

/**
 * Builds the chat messages for classifying a single post. Only the (truncated,
 * normalised) post text and platform are included — no author, no URL, no
 * browsing context.
 */
export function buildMessages(post: PostData, sensitivity: Sensitivity): ChatMessage[] {
  const directive = SENSITIVITY_PRESETS[sensitivity].promptDirective;
  const text = truncate(normalizeText(post.text), LIMITS.maxPostChars);
  return [
    { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildUserPrompt({ platform: post.platform, text, directive }),
    },
  ];
}
