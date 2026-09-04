<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Allocation extends Model
{
    protected $fillable = ['node_id', 'ip', 'port', 'alias', 'assigned_server_id', 'notes'];

    public function node(): BelongsTo
    {
        return $this->belongsTo(Node::class);
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'assigned_server_id', 'id');
    }
}
