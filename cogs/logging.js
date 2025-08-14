const { EmbedBuilder } = require('discord.js');

module.exports = {
  async logShopPurchase(client, userId, roleId, tokens) {
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (!logChannel) return;
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setTitle('Shop Purchase')
        .setDescription(`User <@${userId}> bought role <@&${roleId}> for ${tokens} at ${new Date().toISOString()}`)
        .setColor(0x0099ff)
        .setThumbnail('https://i.imgur.com/oqSl593.png')]
    });
  },
  async logGift(client, modId, userId, amount) {
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (!logChannel) return;
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setTitle('Token Gift')
        .setDescription(`Mod <@${modId}> gifted ${amount} to <@${userId}> at ${new Date().toISOString()}`)
        .setColor(0x0099ff)
        .setThumbnail('https://i.imgur.com/oqSl593.png')]
    });
  },
  async logXPGain(client, userId, xp, action, totalXp, level) {
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (!logChannel) return;
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setTitle('XP Gain')
        .setDescription(`<@${userId}> gained ${xp} XP for ${action} (total: ${totalXp}, level: ${level}) at ${new Date().toISOString()}`)
        .setColor(0x0099ff)
        .setThumbnail('https://i.imgur.com/oqSl593.png')]
    });
  },
  async logLevelUp(client, userId, level, tokens) {
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (!logChannel) return;
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setTitle('Level Up')
        .setDescription(`<@${userId}> leveled up to ${level} and gained ${tokens} at ${new Date().toISOString()}`)
        .setColor(0x0099ff)
        .setThumbnail('https://i.imgur.com/oqSl593.png')]
    });
  }
};