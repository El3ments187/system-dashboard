function ansiToHtml(text: string): string {
  return text.replace(/\x1b\[([0-9;]*)m/g, (_, codes) => {
    if (!codes || codes === '0') return '</span>';
    const parts = codes.split(';');
    let style = '';
    for (const code of parts) {
      switch (code) {
        case '1': style += 'font-weight:bold;'; break;
        case '2': style += 'opacity:0.6;'; break;
        case '31': style += 'color:#ff5555;'; break;
        case '32': style += 'color:#50fa7b;'; break;
        case '33': style += 'color:#f1fa8c;'; break;
        case '34': style += 'color:#627ffd;'; break;
        case '35': style += 'color:#bd93f9;'; break;
        case '36': style += 'color:#4ecfcf;'; break;
        case '37': style += 'color:#f8f8f2;'; break;
        case '90': style += 'color:#626262;'; break;
        case '91': style += 'color:#ff5555;'; break;
        case '92': style += 'color:#50fa7b;'; break;
        case '93': style += 'color:#f1fa8c;'; break;
        case '94': style += 'color:#627ffd;'; break;
        case '95': style += 'color:#bd93f9;'; break;
        case '96': style += 'color:#4ecfcf;'; break;
        case '97': style += 'color:#f8f8f2;'; break;
        default: break;
      }
    }
    return `<span style="${style}">`;
  });
}

export function formatTerminalOutput(raw: string): string {
  const lines = raw.split('\n');
  let html = '';
  for (const line of lines) {
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html += ansiToHtml(escaped).replace(/\n/g, '<br>') + '<br>';
  }
  return html;
}

/** Extracts the most recent `[ NN%]` style progress marker (cmake/make build output) from raw terminal text. */
export function extractLatestPercent(raw: string): number | null {
  const matches = raw.match(/\[\s*(\d{1,3})%\]/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const n = parseInt(last.replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : Math.min(100, Math.max(0, n));
}
