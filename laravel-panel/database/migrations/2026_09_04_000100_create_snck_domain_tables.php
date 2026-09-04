<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nodes', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('name');
            $table->string('host')->nullable();
            $table->string('fqdn')->nullable()->index();
            $table->unsignedSmallInteger('public_port')->default(443);
            $table->unsignedSmallInteger('daemon_port')->default(8080);
            $table->unsignedSmallInteger('sftp_port')->default(2022);
            $table->string('protocol', 16)->default('https');
            $table->boolean('behind_proxy')->default(false);
            $table->boolean('tls_verify')->default(true);
            $table->text('access_client_id')->nullable();
            $table->text('access_client_secret_encrypted')->nullable();
            $table->text('credential_encrypted')->nullable();
            $table->string('status', 32)->default('offline')->index();
            $table->timestamp('last_heartbeat_at')->nullable()->index();
            $table->boolean('docker_available')->default(false);
            $table->boolean('maintenance')->default(false);
            $table->string('server_directory')->default('/var/lib/snck/servers');
            $table->timestamps();
        });

        Schema::create('servers', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('node_id', 64);
            $table->string('name');
            $table->string('identifier', 64)->unique();
            $table->string('container_id')->nullable()->index();
            $table->string('image')->default('itzg/minecraft-server:latest');
            $table->string('version')->nullable();
            $table->string('status', 32)->default('offline')->index();
            $table->unsignedBigInteger('memory_limit')->default(1024);
            $table->unsignedInteger('cpu_limit')->default(100);
            $table->unsignedBigInteger('disk_limit')->default(10240);
            $table->text('startup_command')->nullable();
            $table->json('environment_json')->nullable();
            $table->boolean('suspend')->default(false);
            $table->timestamps();
            $table->foreign('node_id')->references('id')->on('nodes')->cascadeOnUpdate()->restrictOnDelete();
        });

        Schema::create('allocations', function (Blueprint $table) {
            $table->id();
            $table->string('node_id', 64);
            $table->string('ip', 64);
            $table->unsignedSmallInteger('port');
            $table->string('alias')->nullable();
            $table->string('assigned_server_id', 64)->nullable()->index();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['node_id', 'ip', 'port']);
            $table->foreign('node_id')->references('id')->on('nodes')->cascadeOnUpdate()->cascadeOnDelete();
            $table->foreign('assigned_server_id')->references('id')->on('servers')->nullOnDelete();
        });

        Schema::create('backups', function (Blueprint $table) {
            $table->id();
            $table->string('server_id', 64);
            $table->string('filename');
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->string('checksum', 128)->nullable();
            $table->string('status', 32)->default('pending')->index();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->text('storage_path')->nullable();
            $table->string('node_backup_id')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnUpdate()->cascadeOnDelete();
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->boolean('is_encrypted')->default(false);
            $table->timestamps();
        });

        Schema::create('audit_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->nullOnDelete();
            $table->string('action');
            $table->string('resource_type')->nullable();
            $table->string('resource_id')->nullable();
            $table->json('metadata')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->timestamps();
            $table->index(['resource_type', 'resource_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_events');
        Schema::dropIfExists('settings');
        Schema::dropIfExists('backups');
        Schema::dropIfExists('allocations');
        Schema::dropIfExists('servers');
        Schema::dropIfExists('nodes');
    }
};
