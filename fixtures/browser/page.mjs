export const fixtureOrigin = 'https://maintenance-fixture.example.com';

// Owned, immutable test input. No requests leave the intercepted fixture origin.
export function fixturePage(agent, phase) {
  const before = phase === 'before';
  const incomplete = phase === 'incomplete';
  const seo = agent === 'seo-ai-search';
  const performance = agent === 'performance';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Controlled ${agent} fixture</title>
    ${seo && before ? '<meta name="robots" content="noindex, follow">' : ''}
    ${seo && !before ? '<script type="application/ld+json">{invalid-json}</script>' : ''}
    <link rel="canonical" href="${fixtureOrigin}/${agent}">
    <style>body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:32px}button{padding:16px;margin:12px}img{width:32px;height:32px}h1{font-size:38px}</style>
    </head><body><main><h1>Controlled maintenance fixture</h1>
    <p>Each phase is a test document, never a public page report.</p>
    <button id="repair" type="button">${before ? '' : 'Named repair control'}</button>
    <button id="persistent" type="button"></button>
    ${incomplete ? '' : '<button id="keyboard-target" type="button">Keyboard target</button>'}
    ${!before && !performance ? '<img id="new-image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">' : ''}
    <script>
      window.fixtureEvidence = { agent: ${JSON.stringify(agent)}, phase: ${JSON.stringify(phase)}, requestedBusyMs: ${performance && before ? 2200 : 0}, longTasks: [] };
      try { new PerformanceObserver(list => window.fixtureEvidence.longTasks.push(...list.getEntries().map(entry => ({startTime:entry.startTime,duration:entry.duration})))).observe({type:'longtask',buffered:true}); } catch {}
      ${performance && before ? "setTimeout(() => { const start=performance.now(); while(performance.now()-start < 2200) {} window.fixtureEvidence.observedBusyMs=performance.now()-start; }, 150);" : ''}
    </script></main></body></html>`;
}

export function fixtureResponse(url, agent, phase) {
  const parsed = new URL(url);
  if (parsed.origin !== fixtureOrigin) return null;
  if (parsed.pathname === `/${agent}`) return { status: 200, contentType: 'text/html', body: fixturePage(agent, phase) };
  if (parsed.pathname === '/robots.txt') return { status: 200, contentType: 'text/plain', body: `User-agent: *\nDisallow:\nSitemap: ${fixtureOrigin}/sitemap.xml\n` };
  if (parsed.pathname === '/sitemap.xml') return { status: 200, contentType: 'application/xml', body: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${fixtureOrigin}/${agent}</loc></url></urlset>` };
  return { status: 404, contentType: 'text/plain', body: 'Fixture path not found' };
}
