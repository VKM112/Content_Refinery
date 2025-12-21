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
    protected $description = 'Scrape REAL BeyondChats blog articles';

    public function handle()
    {
        $count = (int) $this->option('count');
        $this->info("🕷️  Scraping {$count} REAL BeyondChats articles...");

        $client = new Client([
            'timeout' => 30,
            'verify' => false,
        ]);
        $scraped = 0;

        try {
            // Get blog page with oldest articles (page/8 shows older posts)
            $response = $client->get('https://beyondchats.com/blogs-2/page/8/');
            $html = (string) $response->getBody();
            
            // Extract article links & data using regex/simple DOM parsing
            preg_match_all('/<article[^>]*class="[^"]*post[^"]*"[^>]*>(.*?)<\/article>/s', $html, $matches);
            
            $articles = array_slice($matches[1], 0, $count);
            
            foreach ($articles as $articleHtml) {
                $title = $this->extractTitle($articleHtml);
                $link = $this->extractLink($articleHtml);
                
                if (!$title || !$link) continue;
                
                // Skip if already exists
                $slug = Str::slug($title);
                if (Article::where('slug', $slug)->exists()) {
                    $this->warn("⚠️  Skip: {$title}");
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
                
                $this->info("✅ Scraped: {$title}");
                $scraped++;
                
                if ($scraped >= $count) break;
            }
        } catch (RequestException $e) {
            $this->error("❌ Failed to scrape: " . $e->getMessage());
            return 1;
        }

        $this->info("🎉 Successfully scraped {$scraped} articles!");
        $this->info("📊 Total articles: " . Article::count());
    }

    private function extractTitle($html)
    {
        if (preg_match('/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*><a[^>]*>(.*?)<\/a>/s', $html, $matches)) {
            return strip_tags($matches[1]);
        }
        return null;
    }

    private function extractLink($html)
    {
        if (preg_match('/<a[^>]*href=["\']([^"\']+blogs[^"\']+)["\'][^>]*>/', $html, $matches)) {
            return $matches[1];
        }
        return null;
    }

    private function scrapeArticleContent($client, $url)
    {
        try {
            $response = $client->get($url);
            $html = (string) $response->getBody();
            
            // Extract article content (basic - targets main content)
            if (preg_match('/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>(.*?)<\/div>/s', $html, $matches)) {
                $content = strip_tags($matches[1]);
                return substr($content, 0, 5000) . '...'; // Truncate for DB
            }
        } catch (RequestException $e) {
            $this->warn("⚠️  Could not scrape full content: {$url}");
        }
        return 'Content scraped from BeyondChats blog article.';
    }
}
