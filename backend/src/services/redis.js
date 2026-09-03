const redis = require('redis');

let client = null;
let isConnected = false;

async function getRedisClient() {
  if (!client) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    client = redis.createClient({
      url,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => {
          if (retries > 1) return false;
          return 500;
        }
      }
    });
    
    client.on('error', (err) => {
      isConnected = false;
    });

    client.on('connect', () => {
      isConnected = true;
      console.log('[REDIS] Connected successfully');
    });

    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 1000))
      ]);
    } catch (e) {
      isConnected = false;
    }
  }
  return client;
}

async function checkRedisHealth() {
  try {
    const redisClient = await getRedisClient();
    if (isConnected && redisClient.isOpen) {
      const pong = await redisClient.ping();
      return { status: 'UP', response: pong };
    }
    return { status: 'DOWN', message: 'Redis not connected' };
  } catch (err) {
    return { status: 'DOWN', error: err.message };
  }
}

module.exports = {
  getRedisClient,
  checkRedisHealth
};
