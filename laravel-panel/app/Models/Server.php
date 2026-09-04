<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Server extends Model
{
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'node_id', 'name', 'identifier', 'container_id', 'image', 'version',
        'status', 'memory_limit', 'cpu_limit', 'disk_limit', 'startup_command',
        'environment_json', 'suspend',
    ];

    protected $casts = [
        'environment_json' => 'array',
        'suspend' => 'boolean',
    ];

    public function node(): BelongsTo
    {
        return $this->belongsTo(Node::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(Allocation::class, 'assigned_server_id', 'id');
    }

    public function backups(): HasMany
    {
        return $this->hasMany(Backup::class);
    }
}
