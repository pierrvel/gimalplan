import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PRESET_SUBJECTS } from './data/presets';
import App from './App';

describe('App runtime render smoke check', () => {
  it('renders full 2-column layout with all 8 subjects and zero AI-slop tokens', () => {
    const html = renderToString(<App />);
    const textOnly = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');

    for (const subject of PRESET_SUBJECTS) {
      expect(textOnly).toContain(subject.name);
    }

    expect(textOnly).toContain('기말 플래너');
    expect(textOnly).toContain('0/38');
    expect(textOnly).toContain('(0%)');
    expect(textOnly).toContain('타임라인');
    expect(textOnly).toContain('체크리스트');
    expect(textOnly).toContain('잔여 38');

    // No exclamation marks or emojis anywhere in rendered markup
    expect(textOnly).not.toContain('!');
    expect(textOnly).not.toMatch(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u);
    expect(html).not.toContain('bg-gradient-');
    expect(html).not.toContain('shadow-lg');
  });
});
