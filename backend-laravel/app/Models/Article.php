<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Article extends Model
{
    protected $fillable = [
        'title',
        'content',
        'source_url',
        'slug',
        'is_generated',
        'original_article_id',
        'published_at',
    ];

    protected $casts = [
        'is_generated' => 'boolean',
        'published_at' => 'datetime',
    ];
}
