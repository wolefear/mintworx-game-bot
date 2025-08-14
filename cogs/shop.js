const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const leveling = require('./leveling');
const fs = require('fs').promises;

module.exports = {
  name: 'shop',
  commands: [
    new SlashCommandBuilder()
      .setName('shop')
      .setDescription('View and purchase roles with $MINT')
      .setDMPermission(false)
  ],
  async execute(interaction) {
    const shopData = JSON.parse(await fs.readFile('config/shop.json', 'utf8'));
    const embed = new EmbedBuilder()
      .setTitle('MintHQ Shop')
      .setDescription('Purchase roles with $MINT!')
      .setColor(0x0099ff)
      .setThumbnail('https://i.imgur.com/oqSl593.png')
      .addFields(shopData.map(item => ({
        name: item.name,
        value: leveling.formatTokens(item.price),
        inline: true
      })));
    const buttons = shopData.map(item => new ButtonBuilder()
      .setCustomId(`buy_role_${item.role_id}`)
      .setLabel(`Buy ${item.name}`)
      .setStyle(ButtonStyle.Primary));
    const row = new ActionRowBuilder().addComponents(buttons);
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
  async handleButton(interaction) {
    if (!interaction.customId.startsWith('buy_role_')) return;
    const roleId = interaction.customId.split('_')[2];
    const shopData = JSON.parse(await fs.readFile('config/shop.json', 'utf8'));
    const item = shopData.find(i => i.role_id === roleId);
    if (!item) return interaction.reply({ content: 'Role not found!', ephemeral: true });

    const userData = await leveling.openAccount(interaction.user);
    if (userData[interaction.user.id].shop_purchases?.some(p => p.role_id === roleId)) {
      return interaction.reply({ content: `You already purchased the ${item.name} role!`, ephemeral: true });
    }
    if (!(await leveling.removeTokens(interaction.user, item.price))) {
      return interaction.reply({ content: `You need ${leveling.formatTokens(item.price)} to buy ${item.name}!`, ephemeral: true });
    }

    await interaction.member.roles.add(roleId).catch(() => {
      interaction.reply({ content: 'Error assigning role. Check bot permissions.', ephemeral: true });
      return;
    });

    const data = await leveling.loadData();
    data[interaction.user.id].shop_purchases = data[interaction.user.id].shop_purchases || [];
    data[interaction.user.id].shop_purchases.push({ role_id: roleId, timestamp: new Date().toISOString() });
    data[interaction.user.id].logs = data[interaction.user.id].logs || { shop: [], gifts: [], xp: [] };
    data[interaction.user.id].logs.shop.push({
      user_id: interaction.user.id,
      role_id: roleId,
      tokens: item.price,
      timestamp: new Date().toISOString()
    });
    await leveling.saveData(data);

    const { logShopPurchase } = require('./logging');
    await logShopPurchase(interaction.client, interaction.user.id, roleId, leveling.formatTokens(item.price));

    await interaction.reply({
      content: `You purchased the ${item.name} role for ${leveling.formatTokens(item.price)}!`,
      ephemeral: true
    });

    setTimeout(async () => {
      try {
        await interaction.deleteReply();
      } catch (error) {
        console.log('Could not delete ephemeral reply (likely already expired)');
      }
    }, 20000);
  }
};