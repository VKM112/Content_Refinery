import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import axios from 'axios';
import OpenAI from 'openai';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { load as loadHtml } from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const apiBaseUrl = process.env.API_BASE_URL?.trim();
if (!apiBaseUrl) {
    throw new Error('API_BASE_URL is not set. Add it to llm-node/.env');
}

const api = axios.create({
    baseURL: new URL('/api', apiBaseUrl).toString(),
    timeout: 15000,
});

const searchApiKey = process.env.SERPER_API_KEY?.trim();
if (!searchApiKey) {
    throw new Error('SERPER_API_KEY is not set. Add it to llm-node/.env.');
}

const searchApiUrl =
    process.env.SERPER_API_URL?.trim() ?? 'https://google.serper.dev/search';
const referenceCount = Number.parseInt(process.env.REFERENCE_COUNT ?? '2', 10);
const scrapeMaxChars = Number.parseInt(process.env.SCRAPE_MAX_CHARS ?? '4000', 10);
const maxArticles = Number.parseInt(process.env.MAX_ARTICLES ?? '0', 10);
const requestDelayMs = Number.parseInt(process.env.REQUEST_DELAY_MS ?? '0', 10);
const enhanceMode = (process.env.ENHANCE_MODE ?? 'all').trim().toLowerCase();

const groqApiKey = process.env.GROQ_API_KEY?.trim();
const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
const llmProvider = groqApiKey ? 'groq' : openaiApiKey ? 'openai' : null;

if (!llmProvider) {
    throw new Error('GROQ_API_KEY or OPENAI_API_KEY is not set. Add one to llm-node/.env.');
}

const groqBaseUrl = process.env.GROQ_BASE_URL?.trim() ?? 'https://api.groq.com/openai/v1';
const llmClient =
    llmProvider === 'groq'
        ? new OpenAI({ apiKey: groqApiKey, baseURL: groqBaseUrl })
        : new OpenAI({ apiKey: openaiApiKey });
const openaiModel = process.env.OPENAI_MODEL?.trim() || 'gpt-3.5-turbo';
const defaultGroqModels = [
    'llama-3.3-70b-versatile',
    'llama-3.3-70b-specdec',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
];

function isQuotaError(error) {
    const status = error?.status;
    const code = error?.code ?? error?.error?.code;
    return status === 429 || code === 'insufficient_quota' || code === 'rate_limit_exceeded';
}

function isModelDecommissioned(error) {
    const code = error?.code ?? error?.error?.code;
    const message = String(error?.message ?? error?.error?.message ?? '');
    return code === 'model_decommissioned' || message.toLowerCase().includes('decommissioned');
}

function normalizeHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch (error) {
        return null;
    }
}

function toSlug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function cleanText(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function limitText(text, maxChars) {
    const trimmed = cleanText(text);
    if (trimmed.length <= maxChars) {
        return trimmed;
    }
    return trimmed.slice(0, maxChars).trim();
}

async function searchGoogle(query) {
    const response = await axios.post(
        searchApiUrl,
        { q: query, num: 10 },
        {
            headers: {
                'X-API-KEY': searchApiKey,
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        }
    );

    return response?.data?.organic ?? [];
}

function isArticleCandidate(result, sourceHost, seenHosts) {
    const link = result?.link ?? result?.url;
    if (!link || !link.startsWith('http')) {
        return false;
    }

    const host = normalizeHost(link);
    if (!host) {
        return false;
    }

    const blockedHosts = new Set([
        'youtube.com',
        'youtu.be',
        'twitter.com',
        'x.com',
        'facebook.com',
        'instagram.com',
        'linkedin.com',
        'tiktok.com',
        'pinterest.com',
        'reddit.com',
    ]);

    if (blockedHosts.has(host)) {
        return false;
    }

    if (sourceHost && host === sourceHost) {
        return false;
    }

    if (seenHosts.has(host)) {
        return false;
    }

    if (/\.(pdf|jpg|jpeg|png|gif)(\?.*)?$/i.test(link)) {
        return false;
    }

    return true;
}

function pickReferenceLinks(results, sourceUrl, limit) {
    const sourceHost = normalizeHost(sourceUrl);
    const picks = [];
    const seenHosts = new Set();

    for (const result of results) {
        const link = result?.link ?? result?.url;
        if (!isArticleCandidate(result, sourceHost, seenHosts)) {
            continue;
        }

        const host = normalizeHost(link);
        if (!host) {
            continue;
        }

        picks.push({
            title: cleanText(result?.title) || link,
            url: link,
        });
        seenHosts.add(host);

        if (picks.length >= limit) {
            break;
        }
    }

    return picks;
}

async function scrapeMainContent(url) {
    const response = await axios.get(url, {
        timeout: 20000,
        headers: {
            'User-Agent': 'ContentRefineryBot/1.0',
        },
    });

    const html = response?.data ?? '';
    if (!html) {
        return { title: null, content: '' };
    }

    try {
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const parsed = reader.parse();
        if (parsed?.textContent) {
            return {
                title: cleanText(parsed.title),
                content: limitText(parsed.textContent, scrapeMaxChars),
            };
        }
    } catch (error) {
        // Fallback to a lightweight extraction when Readability fails.
    }

    const $ = loadHtml(html);
    $('script,style,noscript,iframe').remove();

    const selectors = [
        'article',
        'main',
        'div[id*="content"]',
        'div[class*="content"]',
        'div[class*="article"]',
        'div[class*="post"]',
    ];

    let bestText = '';
    for (const selector of selectors) {
        const text = cleanText($(selector).text());
        if (text.length > bestText.length) {
            bestText = text;
        }
    }

    if (!bestText) {
        bestText = cleanText($('body').text());
    }

    return {
        title: cleanText($('title').first().text()),
        content: limitText(bestText, scrapeMaxChars),
    };
}

function ensureReferencesSection(content, references) {
    if (!references.length) {
        return content;
    }

    const hasReferences = /(^|\n)\s*##\s*References\s*/i.test(content);
    if (hasReferences) {
        return content;
    }

    const lines = references
        .map((ref) => `- [${ref.title || ref.url}](${ref.url})`)
        .join('\n');
    return `${content.trim()}\n\n## References\n${lines}\n`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveGroqModelList() {
    const envModel = process.env.GROQ_MODEL?.trim();
    if (envModel) {
        return [envModel];
    }

    try {
        const response = await llmClient.models.list();
        const ids = (response?.data ?? [])
            .map((model) => model?.id ?? model)
            .filter(Boolean);
        if (ids.length) {
            const ranked = [];
            for (const preferred of defaultGroqModels) {
                if (ids.includes(preferred)) {
                    ranked.push(preferred);
                }
            }
            for (const id of ids) {
                if (!ranked.includes(id)) {
                    ranked.push(id);
                }
            }
            return ranked;
        }
    } catch (error) {
        console.warn('Unable to list Groq models. Falling back to default list.');
    }

    return defaultGroqModels;
}

async function getEnhancedContent(article, references) {
    const content = article.content ?? '';
    const modelsToTry =
        llmProvider === 'groq' ? await resolveGroqModelList() : [openaiModel];
    let lastError;

    for (const model of modelsToTry) {
        try {
            console.log(`Calling ${llmProvider} model: ${model}`);
            const referencePayload = references
                .map((ref, index) => {
                    const label = `Reference ${index + 1}`;
                    const refContent = limitText(ref.content, 2000);
                    return `${label}\nTitle: ${ref.title}\nURL: ${ref.url}\nContent: ${refContent}`;
                })
                .join('\n\n');
            const completion = await llmClient.chat.completions.create({
                model,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are an expert content editor. Rewrite the original article so the structure, formatting, and tone resemble the reference articles while preserving the core topic. Provide Markdown output and end with a "## References" section that cites the two reference URLs.',
                    },
                    {
                        role: 'user',
                        content: `Original article\nTitle: ${article.title}\nContent: ${limitText(
                            content,
                            3500
                        )}\n\nReference articles\n${referencePayload}\n\nRequirements:\n- Keep it technical and accessible for developers.\n- Add actionable tips and structure similar to the references.\n- Cite only the reference URLs in the "## References" section.`,
                    },
                ],
                max_tokens: 1500,
                temperature: 0.7,
            });

            return completion.choices[0]?.message?.content ?? null;
        } catch (error) {
            if (isQuotaError(error)) {
                console.error(
                    `${llmProvider} quota exceeded. Check billing or use a key with available quota.`
                );
                return null;
            }

            if (llmProvider === 'groq' && isModelDecommissioned(error)) {
                console.warn(`Model ${model} is unavailable. Trying the next option.`);
                lastError = error;
                continue;
            }

            throw error;
        }
    }

    if (llmProvider === 'groq') {
        console.error('No available Groq model found. Set GROQ_MODEL in llm-node/.env.');
        if (lastError) {
            console.error(lastError.message);
        }
    }

    return null;
}

async function main() {
    const { data: articles } = await api.get('/articles', {
        params: { order: 'latest' },
    });
    if (!Array.isArray(articles)) {
        console.log('Unexpected API response.');
        return;
    }

    const generatedOriginalIds = new Set(
        articles
            .filter((article) => article?.is_generated && article?.original_article_id)
            .map((article) => article.original_article_id)
    );
    const originals = articles.filter((article) => !article.is_generated);
    let targets;
    if (enhanceMode === 'latest') {
        const latestOriginal = originals.find(
            (article) => !generatedOriginalIds.has(article.id)
        );
        targets = latestOriginal ? [latestOriginal] : [];
    } else {
        targets = maxArticles > 0 ? originals.slice(0, maxArticles) : originals;
    }

    if (!targets.length) {
        console.log('No original articles found to enhance.');
        return;
    }

    console.log(
        `Mode: ${enhanceMode}. Found ${targets.length} original articles to enhance.`
    );

    for (const article of targets) {
        if (generatedOriginalIds.has(article.id)) {
            console.log(`Skipping already enhanced article: ${article.title}`);
            continue;
        }

        try {
            console.log('Searching Google for:', article.title);
            const searchResults = await searchGoogle(article.title);
            const referenceLinks = pickReferenceLinks(
                searchResults,
                article.source_url,
                referenceCount
            );

            if (referenceLinks.length < referenceCount) {
                console.log(
                    `Only found ${referenceLinks.length} reference articles for "${article.title}". Skipping.`
                );
                continue;
            }

            const referenceArticles = await Promise.all(
                referenceLinks.map(async (reference) => {
                    try {
                        const scraped = await scrapeMainContent(reference.url);
                        return {
                            ...reference,
                            title: scraped.title || reference.title,
                            content: scraped.content,
                        };
                    } catch (error) {
                        console.warn(`Failed to scrape ${reference.url}`);
                        return { ...reference, content: '' };
                    }
                })
            );

            console.log('LLM processing:', article.title);

            const enhancedContent = await getEnhancedContent(article, referenceArticles);
            if (!enhancedContent) {
                console.log(`Enhancement failed for "${article.title}".`);
                continue;
            }

            const finalContent = ensureReferencesSection(enhancedContent, referenceArticles);
            const enhancedTitle = `AI Enhanced: ${article.title}`;
            const slug = `${toSlug(enhancedTitle)}-ai-${Date.now()}`;

            const { data: published } = await api.post('/articles', {
                title: enhancedTitle,
                content: finalContent,
                source_url: article.source_url,
                slug,
                is_generated: true,
                original_article_id: article.id,
                published_at: new Date().toISOString(),
            });

            console.log('AI-enhanced article published:', published?.id ?? '(unknown id)');
        } catch (error) {
            console.error(`Failed processing "${article.title}".`, error?.message ?? error);
        }

        if (requestDelayMs > 0) {
            await sleep(requestDelayMs);
        }
    }
}

main().catch(console.error);
