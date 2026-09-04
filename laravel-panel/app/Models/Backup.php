<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Backup extends Model
{
    protected $fillable = [
        'server_id', 'filename', 'size_bytes', 'checksum', 'status', 'progress',
        'storage_path', 'node_backup_id', 'completed_at', 'failed_at',
    ];

    protected $casts = [
        'completed_at' => 'datetime',
        'failed_at' => 'datetime',
    ];

    protected $hidden = ['storage_path', 'node_backup_id'];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
