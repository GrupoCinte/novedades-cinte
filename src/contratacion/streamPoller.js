const {
    DynamoDBStreamsClient,
    DescribeStreamCommand,
    GetShardIteratorCommand,
    GetRecordsCommand
} = require('@aws-sdk/client-dynamodb-streams');
const { DynamoDBClient, DescribeTableCommand: DDBDescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { mapDynamoItemToExecution } = require('./utils/mappers');
const { buildDynamoLowLevelClientConfig } = require('./awsDynamoClientConfig');

class StreamPoller {
    constructor(tableName, region, credentials, callback) {
        this.tableName = tableName;
        this.region = region;
        this.callback = callback;
        this.streamArn = null;
        this._credentials = credentials || null;

        const clientConfig = buildDynamoLowLevelClientConfig({
            region,
            credentials: this._credentials != null ? this._credentials : undefined
        });

        this.streamsClient = new DynamoDBStreamsClient(clientConfig);
        this.dynamoClient = new DynamoDBClient(clientConfig);
        this.isPolling = false;
        this.shardIterators = new Map();
        this.processedShards = new Set();
        this.pollInterval = 2000;
        this.shardRefreshInterval = 60000;
        this.lastShardRefresh = 0;
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 5;
    }

    async start() {
        if (this.isPolling) return;
        this.isPolling = true;

        try {
            this.streamArn = await this.getLatestStreamArn();
            if (!this.streamArn) {
                return;
            }

            await this.refreshShards();
            this.poll();
        } catch (error) {
            console.error('[Contratación StreamPoller] Error al iniciar:', error.message);
            this.scheduleRestart(10000);
        }
    }

    async getLatestStreamArn() {
        const command = new DDBDescribeTableCommand({ TableName: this.tableName });
        const response = await this.dynamoClient.send(command);
        return response.Table.LatestStreamArn;
    }

    async refreshShards() {
        if (!this.streamArn) return;

        try {
            const command = new DescribeStreamCommand({ StreamArn: this.streamArn });
            const response = await this.streamsClient.send(command);

            const allShards = response.StreamDescription.Shards || [];
            const openShards = allShards.filter((s) => !s.SequenceNumberRange.EndingSequenceNumber);

            let newShardsAdded = 0;
            for (const shard of openShards) {
                if (!this.shardIterators.has(shard.ShardId) && !this.processedShards.has(shard.ShardId)) {
                    await this.initializeShard(shard);
                    newShardsAdded += 1;
                }
            }

            const closedShardIds = new Set(
                allShards.filter((s) => s.SequenceNumberRange.EndingSequenceNumber).map((s) => s.ShardId)
            );
            for (const shardId of this.shardIterators.keys()) {
                if (closedShardIds.has(shardId)) {
                    this.shardIterators.delete(shardId);
                    this.processedShards.add(shardId);
                }
            }

            this.lastShardRefresh = Date.now();

            if (newShardsAdded > 0) {
                // log mínimo
            }
        } catch (error) {
            console.error('[Contratación StreamPoller] Error al refrescar shards:', error.message);
        }
    }

    async initializeShard(shard) {
        try {
            const iteratorCmd = new GetShardIteratorCommand({
                StreamArn: this.streamArn,
                ShardId: shard.ShardId,
                ShardIteratorType: 'LATEST'
            });

            const iteratorResp = await this.streamsClient.send(iteratorCmd);
            if (iteratorResp.ShardIterator) {
                this.shardIterators.set(shard.ShardId, iteratorResp.ShardIterator);
            }
        } catch (err) {
            console.error(`[Contratación StreamPoller] Error iterator shard ${shard.ShardId}:`, err.message);
        }
    }

    async reInitializeShard(shardId) {
        try {
            const iteratorCmd = new GetShardIteratorCommand({
                StreamArn: this.streamArn,
                ShardId: shardId,
                ShardIteratorType: 'LATEST'
            });

            const iteratorResp = await this.streamsClient.send(iteratorCmd);
            if (iteratorResp.ShardIterator) {
                this.shardIterators.set(shardId, iteratorResp.ShardIterator);
                return true;
            }
        } catch (err) {
            console.error(`[Contratación StreamPoller] Re-init shard ${shardId}:`, err.message);
        }
        return false;
    }

    async poll() {
        if (!this.isPolling) return;

        if (Date.now() - this.lastShardRefresh > this.shardRefreshInterval) {
            await this.refreshShards();
        }

        const shardsToRemove = [];
        const shardsToReinit = [];

        for (const [shardId, iterator] of this.shardIterators.entries()) {
            try {
                const command = new GetRecordsCommand({ ShardIterator: iterator, Limit: 100 });
                const response = await this.streamsClient.send(command);

                if (response.NextShardIterator) {
                    this.shardIterators.set(shardId, response.NextShardIterator);
                } else {
                    shardsToRemove.push(shardId);
                }

                if (response.Records && response.Records.length > 0) {
                    for (const record of response.Records) {
                        this.processRecord(record);
                    }
                }

                this.consecutiveErrors = 0;
            } catch (error) {
                if (error.name === 'ExpiredIteratorException') {
                    shardsToReinit.push(shardId);
                } else if (error.name === 'TrimmedDataAccessException') {
                    shardsToRemove.push(shardId);
                } else if (error.name === 'InvalidSignatureException') {
                    await this.recreateClients();
                    shardsToReinit.push(shardId);
                } else {
                    this.consecutiveErrors += 1;
                    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                        await this.fullRestart();
                        return;
                    }
                }
            }
        }

        for (const shardId of shardsToRemove) {
            this.shardIterators.delete(shardId);
            this.processedShards.add(shardId);
        }

        for (const shardId of shardsToReinit) {
            this.shardIterators.delete(shardId);
            const success = await this.reInitializeShard(shardId);
            if (!success) {
                this.processedShards.add(shardId);
            }
        }

        if (this.shardIterators.size > 0 && this.isPolling) {
            setTimeout(() => this.poll(), this.pollInterval);
        } else if (this.isPolling) {
            setTimeout(async () => {
                try {
                    this.streamArn = await this.getLatestStreamArn();
                    if (this.streamArn) {
                        this.processedShards.clear();
                        await this.refreshShards();
                    }
                    if (this.shardIterators.size > 0) {
                        this.poll();
                    } else {
                        this.scheduleRestart(10000);
                    }
                } catch (e) {
                    console.error('[Contratación StreamPoller] Re-init:', e.message);
                    this.scheduleRestart(15000);
                }
            }, 5000);
        }
    }

    async recreateClients() {
        const clientConfig = buildDynamoLowLevelClientConfig({
            region: this.region,
            credentials: this._credentials != null ? this._credentials : undefined
        });
        this.streamsClient = new DynamoDBStreamsClient(clientConfig);
        this.dynamoClient = new DynamoDBClient(clientConfig);
    }

    async fullRestart() {
        this.shardIterators.clear();
        this.processedShards.clear();
        this.consecutiveErrors = 0;

        await this.recreateClients();

        setTimeout(async () => {
            try {
                this.streamArn = await this.getLatestStreamArn();
                if (this.streamArn) await this.refreshShards();
                if (this.shardIterators.size > 0) {
                    this.poll();
                } else {
                    this.scheduleRestart(15000);
                }
            } catch (e) {
                console.error('[Contratación StreamPoller] Reinicio:', e.message);
                this.scheduleRestart(30000);
            }
        }, 3000);
    }

    scheduleRestart(delayMs) {
        if (!this.isPolling) return;
        setTimeout(() => {
            if (this.isPolling) {
                this.shardIterators.clear();
                this.processedShards.clear();
                this.consecutiveErrors = 0;
                this.start().catch((e) => {
                    console.error('[Contratación StreamPoller] Reinicio programado:', e.message);
                    this.scheduleRestart(Math.min(delayMs * 2, 60000));
                });
            }
        }, delayMs);
    }

    processRecord(record) {
        if (!record.dynamodb) return;

        const newImage = record.dynamodb.NewImage ? unmarshall(record.dynamodb.NewImage) : null;
        const oldImage = record.dynamodb.OldImage ? unmarshall(record.dynamodb.OldImage) : null;

        const data = newImage || oldImage;

        if (data) {
            const formattedData = mapDynamoItemToExecution(data);

            const event = {
                type: record.eventName,
                data: formattedData
            };

            this.callback(event);
        }
    }

    stop() {
        this.isPolling = false;
        this.shardIterators.clear();
    }
}

module.exports = StreamPoller;
