# SEO coverage: protected rendering and sitemap membership

Research date: 2026-11-05. Scope: the stored Solvd run, renderer coverage, and sampled sitemap membership. No production changes or live rerun were performed for this note.

## Follow-up verification and classification

The coordinating agent subsequently ran the protected collector at commit `ccb5f4ca` in [Actions 42104490674](https://github.com/jackiehimel/ai-garage-maintenance-agents/actions/runs/42104490674). Positive sampled sitemap membership was complete, with incomplete traversal separately retained. Accessibility reproduced the same ten automatic instances and sixty-two inconclusive instances described below.

Retained browser identities identified blocked POST reporting traffic to `analytics.google.com/g/collect`, `stats.g.doubleclick.net/g/collect`, `www.google.com/g/collect`, `www.google.com/ccm/collect`, `ad.doubleclick.net/ccm/s/collect`, and `www.google.com/rmkt/collect/646651083/`. An image request to the DoubleClick endpoint was blocked by Chromium ORB, and an MP4 request was aborted. These observations come from that trace, not from the AI assessment.

[Google's Analytics troubleshooting guide](https://developers.google.com/analytics/devguides/collection/ga4/troubleshoot) explicitly identifies `analytics.google.com/g/collect` as event reporting. [Google's CSP guide](https://developers.google.com/tag-platform/security/guides/csp) identifies the observed Google/DoubleClick hosts as Analytics, Ads, and Floodlight destinations. The other exact path classifications are a narrow inference from the observed trace and vendor destinations, not a documented stable API contract. Exact host/path/method/resource-type matching is therefore required; unknown destinations and content requests must remain limiting. Reporting POSTs remain blocked. This affects only the interpretation of SEO metadata coverage, not network permission or a claim that tracking succeeded.

Media/image playback is outside the renderer's original HTML canonical/indexing/JSON-LD diagnostic scope. Instrumentation should retain these events without silently broadening that scope. A failed document, script, stylesheet, unknown API, unaccounted guard error, or truncated diagnostic record remains a coverage limitation. These are implementation scope decisions, not proof that arbitrary applications are fully hydrated.

## Verified local evidence

The original evidence is `.runs/run_4442d7a6ec2ac6fd5e061b8f/report.json` and its sole raw artifact, `art_bc9f174cba3dcd3e64958a93` (167-byte robots.txt). That artifact allows all user agents and declares `https://solvd.com/sitemap_index.xml`; it contains no browser request log or HTML snapshot.

| Observation | What the stored run establishes |
| --- | --- |
| HTTP source | 200 HTML; complete canonical, indexing directives, and JSON-LD observations |
| Chromium navigation | 200 HTML, final URL `https://solvd.com/`, `finalConfirmed: true` |
| Rendered observations | Same title, description, canonical, meta directives, and one parsed JSON-LD block/types as source |
| Rendered coverage | Metadata and JSON-LD marked incomplete solely with `Render had limited coverage: fetch failed: net::ERR_BLOCKED_BY_CLIENT.Inspector; Browser method blocked` |
| Sitemap | Homepage positively listed in fully parsed `page-sitemap.xml` (31 locations, no parse reason) |
| Traversal | Index has seven children; four-request budget fetches index and three children; four children remain unfetched |

The blocked request's URL and method were not retained. Calling it analytics, tracking, a site defect, or an essential API failure would be an inference unsupported by this run. Agreement between source and rendered observations does not prove that an unidentified failed fetch could not have changed later metadata.

## Rendering diagnosis and smallest safe change

`src/agents/seo.ts` successfully waits for `load`, verifies main-response/final-URL agreement, and snapshots the DOM. Its `layer()` then promotes **every** diagnostic into a metadata/JSON-LD coverage limitation. The request-failure listener keeps resource type and error text but discards request identity. `src/core/browser.ts` separately records a generic method-block message in both interception paths. Therefore this case is a failure-classification/evidence problem, not demonstrated navigation readiness failure.

Playwright distinguishes main-resource navigation failure from an individual request failure; `requestfailed` alone does not describe the success of the document or its dependency graph. CDP interception deliberately fails requests with a supplied error reason, and `requestPaused` supplies request details, frame identity, and resource type (Microsoft, n.d.-a, n.d.-b; ChromeDevTools, n.d.). Google documents that its renderer may omit reporting/error requests that do not contribute essential content (Google, n.d.-a). This supports differentiating demonstrated nonessential telemetry from unknown content dependencies; it does not support ignoring every POST, third-party request, fetch, or `ERR_BLOCKED_BY_CLIENT`.

Recommended narrow implementation:

1. Retain bounded request diagnostics with method, URL identity (omit query values/fragments), resource type, main-document flag, policy reason, and coverage impact. Preserve the string diagnostic interface where other collectors need it. Record an explicit truncation/overflow limitation if retained diagnostics cannot cover all failures.
2. Keep existing GET/HEAD restriction, public-address pinning, origin/redirect checks, TLS verification, sandbox, service-worker/WebSocket policy, and all budgets. Classifying a blocked request never authorizes sending it.
3. Separate informational diagnostics from render limitations. Only a narrowly verified reporting/telemetry destination or equivalent explicit evidence may be informational; unknown API/fetch, script, stylesheet, navigation, page exceptions, and security/budget failures remain limitations. Avoid hostname substring matches or blanket treatment of third-party POSTs.
4. Preserve informational events in report evidence/diagnostics, but exclude them from `layer()`'s metadata/JSON-LD quality reason. Require a confirmed final response and valid snapshot before complete rendered coverage is possible.
5. Rerun Solvd in the permitted collection environment, inspect the newly retained identity, and classify only what that evidence supports. Until then, its existing unknown failure remains incomplete. Changing readiness waits or enabling POST is not justified by the stored run.

`load` is not a promise that arbitrary asynchronous applications have reached their final state. A general application-readiness redesign is separate work; Playwright explicitly discourages treating `networkidle` as a readiness assertion (Microsoft, n.d.-a).

## Sitemap diagnosis and smallest safe change

`src/agents/seo.ts` currently assigns membership coverage from all traversal reasons before checking the page's positive membership. A complete accepted URLset can establish that a particular page is listed without fetching unrelated child sitemaps: this is an inference from the protocol's separate `urlset/url/loc` and `sitemapindex/sitemap/loc` semantics (Sitemaps.org, n.d.).

Compute scoped membership before coverage: a matching normalized page URL from a successfully fetched, fully parsed `root === 'urlset'` with no parse/fetch reason may establish complete **positive sampled membership**. Retain `sampled: true`, traversal limitations, document evidence, and ideally separate `traversalCoverage`/`coverageBasis`. Do not derive this override from the aggregate `locations` set: it also receives locations from partially parsed documents. Absence with truncated traversal remains incomplete; malformed/truncated URLsets cannot establish complete positive membership. Keep request/depth limits unchanged. Listing is not a crawling, indexing, ranking, or AI-visibility guarantee (Google, n.d.-b).

## Verification plan

- Add classifier/collector tests: identified telemetry stays visible without degrading otherwise confirmed observations; unknown same-origin POST/API, failed script/CSS, main-document denial, page exception, and budget failure remain incomplete. Ambiguous or truncated diagnostics remain incomplete. Provisional responses and absent/oversized snapshots cannot become complete.
- Exercise both CDP and Playwright guard paths and confirm all existing network/security tests still pass. Verify request details survive into retained evidence and do not leak query values.
- Add sitemap fixtures with an index exceeding four requests: valid positive page membership is complete while traversal remains incomplete; absent page and partial/malformed positive URLsets stay incomplete; index-document URLs cannot count as page entries.
- Run `npm run typecheck`, focused compiled browser/SEO tests, then the existing required suite/build. A permitted end-to-end Solvd rerun is required to confirm the actual blocked destination and resulting collection status; unit fixtures cannot verify that live fact.

## References

ChromeDevTools. (n.d.). *Fetch domain protocol definition*. GitHub. https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Fetch.pdl

Google. (n.d.-a). *Fix Search-related JavaScript problems*. Google Search Central. https://developers.google.com/search/docs/crawling-indexing/javascript/fix-search-javascript

Google. (n.d.-b). *Build and submit a sitemap*. Google Search Central. https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap

Microsoft. (n.d.-a). *Page*. Playwright. https://playwright.dev/docs/api/class-page#page-goto

Microsoft. (n.d.-b). *Request*. Playwright. https://playwright.dev/docs/api/class-request#request-failure

Sitemaps.org. (n.d.). *Sitemaps XML format*. https://www.sitemaps.org/protocol.html

## Accessibility follow-up: counts, confidence, and report readability

Scope: independently inspected `.runs/run_6a0481b0d95c87a4aca76467/report.json`, its complete 130,035-byte raw axe artifact `art_db1810293e87e7648ed080e5`, `src/agents/accessibility.ts`, `src/report.ts`, and the installed axe-core 4.14.0 source. The coordinating agent additionally performed the independent live browser spot checks described below; this research agent did not repeat that browser session. The retained scan tested one initial desktop state at 1365 × 768, not all pages or interaction states.

### Exact counts

| Outcome | Rule | Rule groups | Primary node instances | Interpretation |
| --- | --- | ---: | ---: | --- |
| Automatic violation | `button-name` | 1 | 1 | WCAG 4.1.2; axe critical |
| Automatic violation | `color-contrast` | 1 | 6 | WCAG 1.4.3; axe serious, mapped to UI high |
| Automatic violation | `landmark-unique` | 1 | 1 | Deque best practice; moderate; one group references four additional navigation landmarks |
| Automatic violation | `region` | 1 | 2 | Deque best practice; moderate; skip link and notification content |
| Manual review | `color-contrast` | 1 | 55 | 54 backgrounds unresolved because of pseudo elements; one unresolved because of overlapping content |
| Manual review | `video-caption` | 1 | 7 | Captions require human determination |
| **Total** | | **4 violation + 2 review groups** | **10 automatic + 62 manual = 72 rows** | **Seven WCAG-tagged automatic instances; three best-practice instances** |

There are ten distinct primary violation targets and 62 distinct primary review targets. These are rule/node observations, not 72 independently confirmed defects or necessarily 72 separate fixes. The six footer contrast instances share one measured color pair. Axe's `incomplete` results explicitly mean it could not determine pass/fail, and impact describes severity rather than probability or certainty (Deque Systems, n.d.-a). The raw scan also records 44 passing rule groups and 45 inapplicable groups; those are not element counts or a conformance percentage.

### Two challenged findings checked against raw evidence

**Close button:** raw HTML is `<button class="notification-bar__close-btn js-notification-bar__close-btn"><i class="icon-close"></i></button>`. All seven name alternatives fail in the retained checks: accessible inner text, `aria-label`, `aria-labelledby`, title, implicit/explicit label, and overridden presentation semantics. This provides strong evidence of an unnamed button in the scanned DOM. Deque classifies this rule critical and associates it with WCAG 4.1.2; the standard requires a programmatically determinable name/role (Deque Systems, n.d.-b; W3C, n.d.-b). It does not independently establish that every screen reader user is unable to dismiss the notice; actual accessibility-tree and interaction testing is still needed. Adding a meaningful accessible name is an appropriate candidate correction if reproduced.

**Services contrast:** the target is `a[href$="services/"]`, with HTML `<a href="https://solvd.com/services/">Services</a>`. Its raw check explicitly associates the background with `<footer class="site-footer">`; this is a footer link, not demonstrated main navigation. Foreground `#665e5c`, background `#000000`, 16px normal text, measured ratio 3.32:1, required ratio 4.5:1. An independent calculation from those recorded colors yields **3.3205789117:1**, confirming the arithmetic. The other five failures are footer Insights, About Us, copyright, Privacy Policy, and Cookie Policy text, all with the same color pair at 16px or 14px normal weight. These sizes do not qualify for the large-text exception (Deque Systems, n.d.-c; W3C, n.d.-a). The retained measurement is persuasive for that captured state, but does not verify today's computed styles, overlays, or every responsive/interaction state.

### What resource restrictions do and do not establish

The report records complete navigation (HTTP 200), complete readiness, **32 monitored critical requests, and `failedResources: []`**. The collector monitors all HTTP(S) documents, scripts, stylesheets and fonts, plus same-origin GET XHR/fetch, until after axe completes. It waits for `load`; no resource-readiness timeout was recorded. Therefore there is no retained evidence that blocked CSS/JS caused these findings. The diagnostic `Browser method blocked` has no URL, method, or resource identity and cannot establish that claim.

Readiness is bounded: non-GET data requests and cross-origin XHR/fetch are excluded, and a successful load does not guarantee all delayed state changes are finished. A blocked application request could affect the state; a reporting request might not. Missing CSS/fonts can change measured contrast, visibility, and layout; missing JavaScript can change names or DOM state. Those are possibilities to investigate, not demonstrated explanations or grounds to discard the scan. Keep security policies intact and capture request-specific diagnostics during reproduction.

### Manual checks and a specific best-practice uncertainty

The 55 uncertain contrast entries are **not measured contrast failures**. Seven caption entries also do not establish seven missing-caption violations. All seven retained videos are muted; one hero animation occurs in two elements and five are background videos. Muted markup alone does not prove no meaningful audio exists. WCAG 1.2.2 applies to prerecorded audio in synchronized media, so inspect the actual media/audio and purpose before concluding that captions are required (W3C, n.d.-c).

The `region` finding includes `.skip-to-content-link` pointing to `#site-content`. Deque's rule guidance exempts skip links (Deque Systems, n.d.-d). Installed axe 4.14.0 exempts them only when its skip-link heuristic recognizes their ordering and the fragment target resolves (`node_modules/axe-core/axe.js`, `_isSkipLink` and `findRegionlessElms`). The retained snippet cannot establish document order or target existence. Verify resolution and keyboard focus before deciding this is a barrier or suggesting a structural change. The two landmark rules are best-practice results, not by themselves proof of WCAG 2.4.1 failure.

### Presentation and AI assessment corrections

`src/report.ts` correctly shows ten automated findings and 62 manual items in separate header cards, but then expands all 72 finding articles at the same level and later expands 74 evidence articles with raw JSON. That volume and repeated generic rule titles obscure the few shared causes. A readable report should group rule families, show outcome and instance counts separately, place the seven WCAG-tagged automatic instances ahead of best practices, collapse manual-review instances, and provide direct retained evidence for each example.

The stored AI assessment is capped (`truncated: true`, 17 evidence IDs sent) and contains material inaccuracies: it says seven contrast failures instead of six; calls the footer links main navigation; describes six manual elements rather than the full 62; and overstates a WCAG 2.4.1 conclusion from best-practice findings. Deterministic counts and scope should override these claims. Disclose the assessment's evidence cap prominently and avoid presenting its prose as validation.

A minimal assessment correction is to supply deterministic full-report counts by rule/outcome and explicit scope/criteria tags alongside the sampled instance evidence. Require the narrative to use those totals, distinguish best practices from WCAG-tagged results, retain `review-needed` uncertainty, identify evidence sampling, and avoid claiming an interaction barrier or browser reproduction unless such evidence is present. A prompt cannot guarantee arithmetic or factual consistency: generate count/scope summaries deterministically in the report, and check generated assertions before displaying them as totals.

### Independent live spot checks reported by the coordinating agent

On 2026-11-05 the coordinating agent used an independent ordinary in-app browser and reported the following direct observations: the notification close button has the same icon-only HTML and null `aria-label`, `aria-labelledby`, and title; its accessibility-tree representation contains only the glyph. The Services link remains footer text with computed `rgb(102, 94, 92)`, 16px normal/400 weight, and transparent ancestor backgrounds until the black footer. These observations corroborate the two retained findings without relying on the restricted collector's resource state. They do not reproduce the entire 72-instance scan.

The coordinating agent also observed labeled main/secondary navigation, four unlabeled footer menus plus an unlabeled policy nav, and a valid `main#site-content` skip target. The skip link is index 16 in `a[href]` order. Target absence is therefore not supported by that live spot check; axe's ordering heuristic remains a plausible explanation for its best-practice region result. These facts further contradict the assessment's description of the footer contrast links as main navigation and do not establish a broken skip action.

### Required live verification

For full validation, rerun in the same viewport/browser profile with bounded request identity logs and retain a screenshot plus computed colors, font size/weight, opacity/background ancestry and bounding boxes for all six footer targets. Test actual close-button dismissal and skip-link focus behavior by keyboard/screen reader. Review uncertain pseudo-element/overlap contrast and the videos' meaningful audio. The ordinary-browser spot checks above corroborate two findings; a complete protected-versus-ordinary comparison has not been performed and is required before attributing any other discrepancy to resource restrictions.

### Accessibility references

Deque Systems. (n.d.-a). *axe-core API documentation*. GitHub. https://github.com/dequelabs/axe-core/blob/develop/doc/API.md

Deque Systems. (n.d.-b). *Buttons must have discernible text*. Deque University. https://dequeuniversity.com/rules/axe/4.14/button-name

Deque Systems. (n.d.-c). *Elements must meet minimum color contrast ratio thresholds*. Deque University. https://dequeuniversity.com/rules/axe/4.14/color-contrast

Deque Systems. (n.d.-d). *All page content should be contained by landmarks*. Deque University. https://dequeuniversity.com/rules/axe/4.14/region

W3C. (n.d.-a). *Understanding Success Criterion 1.4.3: Contrast (Minimum).* https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

W3C. (n.d.-b). *Understanding Success Criterion 4.1.2: Name, Role, Value.* https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html

W3C. (n.d.-c). *Understanding Success Criterion 1.2.2: Captions (Prerecorded).* https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html
