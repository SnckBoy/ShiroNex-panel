<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Node extends Model
{
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'name', 'host', 'fqdn', 'public_port', 'daemon_port', 'sftp_port',
        'protocol', 'behind_proxy', 'tls_verify', 'access_client_id',
        'access_client_secret_encrypted', 'credential_encrypted', 'status',
        'last_heartbeat_at', 'docker_available', 'maintenance', 'server_directory',
    ];

    protected $casts = [
        'behind_proxy' => 'boolean',
        'tls_verify' => 'boolean',
        'docker_available' => 'boolean',
        'maintenance' => 'boolean',
        'last_heartbeat_at' => 'datetime',
    ];

    protected $hidden = ['access_client_secret_encrypted', 'credential_encrypted'];

    public function servers(): HasMany
    {
        return $this->hasMany(Server::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(Allocation::class);
    }
}
