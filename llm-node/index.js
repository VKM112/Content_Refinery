import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import axios from 'axios';
import OpenAI from 'openai';

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

async function getEnhancedContent(article) {
    const content = article.content ?? '';
    const modelsToTry =
        llmProvider === 'groq' ? await resolveGroqModelList() : [openaiModel];
    let lastError;

    for (const model of modelsToTry) {
        try {
            console.log(`Calling ${llmProvider} model: ${model}`);
            const completion = await llmClient.chat.completions.create({
                model,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are an expert content enhancer. Improve this chatbot article with 2025 insights, statistics, and actionable tips. Keep technical but accessible for developers.',
                    },
                    {
                        role: 'user',
                        content: `Title: ${article.title}\nContent: ${content.substring(0, 3000)}`,
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
    const { data: articles } = await api.get('/articles?limit=1');
    console.log('Fetched articles:', articles.length);

    const article = articles[0];
    if (!article) {
        console.log('No articles found');
        return;
    }

    console.log('LLM processing:', article.title);

    const enhancedContent = await getEnhancedContent(article);
    if (!enhancedContent) {
        console.log('Enhancement failed');
        return;
    }

    await api.put(`/articles/${article.id}`, {
        title: `AI Enhanced: ${article.title}`,
        content: enhancedContent,
        source_url: article.source_url,
        is_generated: true,
    });

    console.log('AI-enhanced article updated:', article.id);
}

main().catch(console.error);
