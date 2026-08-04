import 'dotenv/config';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const { text } = await generateText({
  model: anthropic('claude-haiku-4-5'),
  system: 'Please answer to every my question in 3 words.',
  messages: [
    {
      role: 'user',
      content: 'Explain the concept of quantum entanglement.'
    },
    {
      role: 'assistant',
      content: 'Quantum entanglement is a phenomenon where the state of two or more particles is correlated in such a way that the state of one particle is dependent on the state of the other, even if they are separated by a large distance.'
    },
    {
      role: 'user',
      content: 'What is the capital of France?'
    }
  ]
});

console.log(text);
