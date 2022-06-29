const mongoose = require('mongoose');
const redis = require('redis');

const keys = require('../config/keys');
const client = redis.createClient(keys.redisUrl);
client.connect();
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = async function (options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');
  return this;
};

mongoose.Query.prototype.exec = async function () {
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }
  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name,
    })
  );
  // See if value of key is in Redis
  const cacheValue = await client.hGet(this.hashKey, key);
  //If yes, return it
  if (cacheValue) {
    const document = JSON.parse(cacheValue);
    return Array.isArray(document)
      ? document.map((doc) => new this.model(doc))
      : new this.model(document);
  }
  // Else uissue query and store result in Redis
  const result = await exec.apply(this, arguments);
  client.hSet(this.hashKey, key, JSON.stringify(result), 'EX', 10);
  return result;
};

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  },
};
