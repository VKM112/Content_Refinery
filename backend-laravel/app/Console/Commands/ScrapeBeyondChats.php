<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Article;
use Illuminate\Support\Str;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;

class ScrapeBeyondChats extends Command
{
    protected $signature = 'scrape:beyondchats {--count=5}';
    protected $description = 'Scrape BeyondChats blog articles';

    public function handle()
    {
        $count = (int) $this->option('count');
        $this->info("Scraping {$count} BeyondChats articles...");

        $client = new Client([
            'timeout' => 30,
            'verify' => false,
        ]);
        $scraped = 0;

        try {
            $blogIndexUrl = 'https://beyondchats.com/blogs/';
            $indexResponse = $client->get($blogIndexUrl);
            $indexHtml = (string) $indexResponse->getBody();
            $lastPage = $this->resolveLastPageNumber($blogIndexUrl, $indexHtml);
            $seenLinks = [];

            for ($page = $lastPage; $page >= 1 && $scraped < $count; $page--) {
                $pageUrl = $this->buildPageUrl($blogIndexUrl, $page);
                $response = $client->get($pageUrl);
                $html = (string) $response->getBody();

                $articles = $this->parseArticleCards($html);
                if (!$articles) {
                    continue;
                }

                foreach (array_reverse($articles) as $article) {
                    if ($scraped >= $count) {
                        break;
                    }

                    $title = $article['title'] ?? null;
                    $link = $article['link'] ?? null;

                    if (!$title || !$link) {
                        continue;
                    }

                    if (isset($seenLinks[$link])) {
                        continue;
                    }
                    $seenLinks[$link] = true;

                    // Skip if already exists
                    $slug = Str::slug($title);
                    if (Article::where('slug', $slug)->exists()) {
                        $this->warn("Skip: {$title}");
                        continue;
                    }

                    // Scrape full article content
                    $content = $this->scrapeArticleContent($client, $link);

                    Article::create([
                        'title' => $title,
                        'slug' => $slug,
                        'content' => $content,
                        'source_url' => $link,
                        'is_generated' => false,
                    ]);

                    $this->info("Scraped: {$title}");
                    $scraped++;
                }
            }
        } catch (RequestException $e) {
            $this->error("Failed to scrape: " . $e->getMessage());
            return 1;
        }

        $this->info("Successfully scraped {$scraped} articles!");
        $this->info("Total articles: " . Article::count());
    }

    private function resolveLastPageNumber(string $baseUrl, string $html): int
    {
        preg_match_all('/href=["\']([^"\']*page\/(\d+)\/)["\']/i', $html, $matches, PREG_SET_ORDER);

        $maxPage = 1;

        foreach ($matches as $match) {
            $url = $this->normalizeUrl($baseUrl, $match[1]);
            if (!str_contains($url, '/blogs')) {
                continue;
            }

            $pageNumber = (int) $match[2];
            if ($pageNumber > $maxPage) {
                $maxPage = $pageNumber;
            }
        }

        return $maxPage;
    }

    private function buildPageUrl(string $baseUrl, int $page): string
    {
        if ($page <= 1) {
            return $baseUrl;
        }

        return rtrim($baseUrl, '/') . '/page/' . $page . '/';
    }

    private function normalizeUrl(string $baseUrl, string $url): string
    {
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }

        $baseParts = parse_url($baseUrl);
        if (!$baseParts || empty($baseParts['scheme']) || empty($baseParts['host'])) {
            return $url;
        }

        $prefix = $baseParts['scheme'] . '://' . $baseParts['host'];
        if (!empty($baseParts['port'])) {
            $prefix .= ':' . $baseParts['port'];
        }

        if (str_starts_with($url, '/')) {
            return $prefix . $url;
        }

        $basePath = $baseParts['path'] ?? '/';
        $baseDir = rtrim(dirname($basePath), '/');
        return $prefix . ($baseDir ? $baseDir : '') . '/' . $url;
    }

    private function parseArticleCards(string $html): array
    {
        preg_match_all('/<article[^>]*>(.*?)<\/article>/s', $html, $blocks);
        $articles = [];

        foreach ($blocks[1] as $block) {
            if (preg_match('/<h\\d[^>]*class="[^"]*(entry-title|elementor-post__title)[^"]*"[^>]*>\\s*<a[^>]*href=["\\\']([^"\\\']+)["\\\'][^>]*>(.*?)<\\/a>/s', $block, $matches)) {
                $title = html_entity_decode(strip_tags($matches[3]), ENT_QUOTES | ENT_HTML5);
                $link = $matches[2];
                $articles[] = [
                    'title' => $title,
                    'link' => $link,
                ];
                continue;
            }

            if (preg_match('/<a[^>]*href=["\\\']([^"\\\']+\\/blogs\\/[^"\\\']+)["\\\'][^>]*>(.*?)<\\/a>/s', $block, $matches)) {
                $title = html_entity_decode(strip_tags($matches[2]), ENT_QUOTES | ENT_HTML5);
                $link = $matches[1];
                $articles[] = [
                    'title' => $title,
                    'link' => $link,
                ];
            }
        }

        return $articles;
    }

    private function scrapeArticleContent($client, $url)
    {
        try {
            $response = $client->get($url);
            $html = (string) $response->getBody();

            $content = $this->extractMainContent($html);
            if ($content) {
                return substr($content, 0, 5000) . '...';
            }
        } catch (RequestException $e) {
            $this->warn("Could not scrape full content: {$url}");
        }
        return 'Content scraped from BeyondChats blog article.';
    }

    private function extractMainContent(string $html): ?string
    {
        libxml_use_internal_errors(true);
        $dom = new \DOMDocument();
        $dom->loadHTML('<?xml encoding="utf-8"?>' . $html);
        $xpath = new \DOMXPath($dom);

        $queries = [
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' theme-post-content ')]",
            "//*[@id='content']//*[contains(concat(' ', normalize-space(@class), ' '), ' elementor-widget-theme-post-content ')]",
            "//*[@id='content']",
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' entry-content ')]",
            "//article",
            "//main",
        ];

        $bestText = '';
        foreach ($queries as $query) {
            $nodes = $xpath->query($query);
            if (!$nodes) {
                continue;
            }

            foreach ($nodes as $node) {
                $text = $this->normalizeText($node->textContent);
                if (strlen($text) > strlen($bestText)) {
                    $bestText = $text;
                }
            }

            if (strlen($bestText) > 400) {
                break;
            }
        }

        return $bestText ?: null;
    }

    private function normalizeText(string $text): string
    {
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5);
        $text = preg_replace('/\s+/', ' ', $text ?? '');
        return trim($text);
    }
}
