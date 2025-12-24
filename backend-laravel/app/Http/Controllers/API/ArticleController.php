<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Article;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ArticleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Article::query();

        $order = $request->query('order');
        if ($request->boolean('latest') || $order === 'latest' || $order === 'desc') {
            $query->orderByDesc('published_at')->orderByDesc('created_at');
        } elseif ($order === 'asc') {
            $query->orderBy('published_at')->orderBy('created_at');
        }

        $limit = (int) $request->query('limit');
        if ($limit > 0) {
            $query->limit($limit);
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'source_url' => 'required|url',
            'slug' => 'required|string|unique:articles,slug',
            'is_generated' => 'sometimes|boolean',
            'original_article_id' => 'nullable|exists:articles,id',
            'published_at' => 'nullable|date',
        ]);

        $article = Article::create($validated);
        return response()->json($article, 201);
    }

    public function show(Article $article): JsonResponse
    {
        return response()->json($article);
    }

    public function update(Request $request, Article $article): JsonResponse
    {
        $article->update($request->validate([
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'source_url' => 'required|url',
            'is_generated' => 'sometimes|boolean',
            'original_article_id' => 'nullable|exists:articles,id',
            'published_at' => 'nullable|date',
        ]));
        return response()->json($article);
    }

    public function destroy(Article $article): JsonResponse
    {
        $article->delete();
        return response()->json(null, 204);
    }
}
